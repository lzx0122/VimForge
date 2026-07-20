import {
  buildExerciseLearningSnapshots,
  type ExerciseLearningSnapshot,
} from "../../../domain/review/exercise-learning-snapshot";
import {
  selectPracticeExercises,
  type PracticeCandidate,
  type PracticeCandidatePools,
} from "../../../domain/review/practice-selector";
import { stableSeededOrder } from "../../../domain/review/seeded-order";
import type {
  StoredExerciseReview,
  StoredSkillMastery,
} from "../../../types/learning-projection";
import { TOPIC_DEFINITIONS } from "../data/topic-definitions";
import { topicSkillSlugs } from "../data/topic-definitions";
import type { AttemptSyncInput } from "../repositories/attempt-sync-repository";
import type {
  PracticeCandidateRecord,
  PracticeCandidateRepository,
} from "../repositories/practice-candidate-repository";
import { buildPracticeCandidatePools } from "./practice-pool-builder";
import {
  createTopicPracticePlan,
  type TopicPracticeCandidate,
} from "../../review/services/topic-practice-service";
import type { LearningMode, QuestionCount } from "../../../types/learning";

export interface PracticeSelectionRequest {
  learningMode: LearningMode;
  selectionType: "daily_review" | "topic_practice" | "weakness_practice";
  questionCount: QuestionCount;
  selectedTopicSlugs: readonly string[];
  localDate: string;
}

export interface PracticeSelectionResult {
  exerciseIds: string[];
  selectedSkillIds: string[];
  requestedCount: QuestionCount;
  actualCount: number;
  personalized: boolean;
}

export interface PracticeSelectionAttemptRepositoryPort {
  listAll(): Promise<readonly AttemptSyncInput[]>;
}

export interface PracticeSelectionSkillMasteryRepositoryPort {
  listAll(): Promise<readonly StoredSkillMastery[]>;
}

export interface PracticeSelectionExerciseReviewRepositoryPort {
  listDue(nowIso: string): Promise<readonly StoredExerciseReview[]>;
}

/** The order weakness_practice drains pools in - struggling exercises first. */
const WEAKNESS_POOL_ORDER: readonly (keyof PracticeCandidatePools)[] = [
  "weak",
  "dueOrIncorrect",
  "stale",
  "familiar",
  "sameDifficulty",
];

function parseLocalDate(localDate: string): Date {
  return new Date(`${localDate}T12:00:00`);
}

function candidateTopicSlugs(candidate: PracticeCandidateRecord): string[] {
  return TOPIC_DEFINITIONS.filter((topic) =>
    topic.skillSlugs.some((skillSlug) =>
      candidate.skillSlugs.includes(skillSlug),
    ),
  ).map((topic) => topic.slug);
}

function deriveTouchedSkillIds(
  candidates: readonly PracticeCandidateRecord[],
  snapshots: ReadonlyMap<string, ExerciseLearningSnapshot>,
): Set<string> {
  const touched = new Set<string>();
  for (const candidate of candidates) {
    if (snapshots.has(candidate.exerciseId)) {
      for (const skillId of candidate.skillIds) {
        touched.add(skillId);
      }
    }
  }
  return touched;
}

function deriveMasteryLevel(
  snapshot: ExerciseLearningSnapshot | undefined,
): TopicPracticeCandidate["masteryLevel"] {
  if (snapshot === undefined || snapshot.lastCompleted === false) {
    return 0;
  }
  return Math.min(5, snapshot.successfulAttemptCount) as TopicPracticeCandidate["masteryLevel"];
}

function byDescendingPriority(
  candidates: readonly PracticeCandidate[],
): PracticeCandidate[] {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (left, right) =>
        right.candidate.priority - left.candidate.priority ||
        left.index - right.index,
    )
    .map(({ candidate }) => candidate);
}

function selectWeaknessFirst(
  pools: PracticeCandidatePools,
  questionCount: number,
): string[] {
  const selectedIds = new Set<string>();
  const selected: string[] = [];

  for (const poolName of WEAKNESS_POOL_ORDER) {
    for (const candidate of byDescendingPriority(pools[poolName])) {
      if (selected.length >= questionCount) {
        return selected;
      }
      if (selectedIds.has(candidate.exerciseId)) {
        continue;
      }
      selectedIds.add(candidate.exerciseId);
      selected.push(candidate.exerciseId);
    }
  }

  return selected;
}

function buildResult(
  request: PracticeSelectionRequest,
  exerciseIds: readonly string[],
  candidates: readonly PracticeCandidateRecord[],
  personalized: boolean,
): PracticeSelectionResult {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.exerciseId, candidate]),
  );
  const selectedSkillIds = new Set<string>();
  for (const exerciseId of exerciseIds) {
    const candidate = candidateById.get(exerciseId);
    if (candidate === undefined) {
      continue;
    }
    for (const skillId of candidate.skillIds) {
      selectedSkillIds.add(skillId);
    }
  }

  return {
    exerciseIds: [...exerciseIds],
    selectedSkillIds: [...selectedSkillIds],
    requestedCount: request.questionCount,
    actualCount: exerciseIds.length,
    personalized,
  };
}

/** Maximum weakness rank (100 - masteryScore, since masteryScore is 0-100) - always outranks a dynamic priority. */
const MAX_PRIORITY = 100;

/**
 * Corrects the P0.2 attempt-snapshot pools with the authoritative P0.3
 * persisted projections, once a persisted skill mastery record exists for
 * this learner: a candidate the spaced-repetition scheduler has actually
 * marked due always counts as due (moving it into dueOrIncorrect, deduped,
 * ranked highest so it drains first) - including a candidate the P0.2
 * classifier excluded from every pool entirely (e.g. one successful,
 * unhinted, non-stale attempt: neither failed, stale, weak, nor yet
 * "familiar", since familiar requires a second success). A still-weak
 * candidate's priority is re-ranked by its skill's real mastery score -
 * the lower the score, the higher the priority - instead of the raw
 * accuracy/speed/hint heuristic. A due review for an exercise no longer in
 * the published candidate catalog is ignored rather than injected.
 */
function applyPersistedProjectionOverrides(
  pools: PracticeCandidatePools,
  candidates: readonly PracticeCandidateRecord[],
  dueExerciseIds: ReadonlySet<string>,
  skillMasteryScoreById: ReadonlyMap<string, number>,
): PracticeCandidatePools {
  const adjusted: Record<keyof PracticeCandidatePools, PracticeCandidate[]> = {
    dueOrIncorrect: [],
    weak: [],
    familiar: [],
    stale: [],
    sameDifficulty: [],
  };
  const movedToDue = new Set<string>();

  for (const poolName of Object.keys(pools) as (keyof PracticeCandidatePools)[]) {
    for (const candidate of pools[poolName]) {
      if (dueExerciseIds.has(candidate.exerciseId)) {
        if (!movedToDue.has(candidate.exerciseId)) {
          movedToDue.add(candidate.exerciseId);
          adjusted.dueOrIncorrect.push({ ...candidate, priority: MAX_PRIORITY });
        }
        continue;
      }

      if (poolName === "weak") {
        const weaknessScores = candidate.skillIds
          .map((skillId) => skillMasteryScoreById.get(skillId))
          .filter((score): score is number => score !== undefined);
        const priority =
          weaknessScores.length > 0
            ? MAX_PRIORITY - Math.min(...weaknessScores)
            : candidate.priority;
        adjusted.weak.push({ ...candidate, priority });
        continue;
      }

      adjusted[poolName].push(candidate);
    }
  }

  const candidateByExerciseId = new Map(
    candidates.map((candidate) => [candidate.exerciseId, candidate]),
  );
  for (const exerciseId of dueExerciseIds) {
    if (movedToDue.has(exerciseId)) {
      continue;
    }
    const candidate = candidateByExerciseId.get(exerciseId);
    if (candidate === undefined) {
      continue;
    }
    movedToDue.add(exerciseId);
    adjusted.dueOrIncorrect.push({
      exerciseId: candidate.exerciseId,
      skillIds: candidate.skillIds,
      priority: MAX_PRIORITY,
    });
  }

  return adjusted;
}

function emptyResult(request: PracticeSelectionRequest): PracticeSelectionResult {
  return {
    exerciseIds: [],
    selectedSkillIds: [],
    requestedCount: request.questionCount,
    actualCount: 0,
    personalized: false,
  };
}

/**
 * Composes the P0.2 candidate/history pipeline into one selection entry
 * point: real published candidates (Task 9), local attempt-history
 * snapshots (Task 8), pool classification and date-seeded diversity
 * (Task 10), and topic-scoped ranking (existing createTopicPracticePlan).
 */
export class PracticeSelectionService {
  public constructor(
    private readonly candidateRepository: PracticeCandidateRepository,
    private readonly attemptRepository: PracticeSelectionAttemptRepositoryPort,
    private readonly skillMasteryRepository: PracticeSelectionSkillMasteryRepositoryPort = {
      listAll: async () => [],
    },
    private readonly exerciseReviewRepository: PracticeSelectionExerciseReviewRepositoryPort = {
      listDue: async () => [],
    },
  ) {}

  public async select(
    request: PracticeSelectionRequest,
  ): Promise<PracticeSelectionResult> {
    const candidateOptions =
      request.selectionType === "topic_practice" &&
      request.selectedTopicSlugs.length > 0
        ? {
            learningMode: request.learningMode,
            skillSlugs: topicSkillSlugs(request.selectedTopicSlugs),
          }
        : {
            learningMode: request.learningMode,
          };

    const now = parseLocalDate(request.localDate);
    const [rawCandidates, attempts, masteryRecords, dueReviews] =
      await Promise.all([
        this.candidateRepository.listPublishedCandidates(candidateOptions),
        this.attemptRepository.listAll(),
        this.skillMasteryRepository.listAll(),
        this.exerciseReviewRepository.listDue(now.toISOString()),
      ]);

    const candidates = stableSeededOrder(
      rawCandidates,
      request.localDate,
      (candidate) => candidate.exerciseId,
    );
    const snapshots = buildExerciseLearningSnapshots(attempts, now);
    const hasPersistedProjections = masteryRecords.length > 0;
    // A skill the persisted projections have already touched establishes
    // personalized scope even when local attempts are empty (e.g. a synced
    // account with no local attempt history yet) - the persisted path
    // below must still get a chance to run before the !personalized early
    // return short-circuits daily_review to an empty result.
    const touchedSkillIds = deriveTouchedSkillIds(candidates, snapshots);
    if (hasPersistedProjections) {
      for (const mastery of masteryRecords) {
        touchedSkillIds.add(mastery.skillId);
      }
    }
    const personalized = touchedSkillIds.size > 0;

    if (request.selectionType === "topic_practice") {
      return this.selectTopicPractice(request, candidates, snapshots, personalized);
    }

    if (!personalized) {
      if (request.selectionType === "daily_review") {
        return emptyResult(request);
      }
      const chosen = candidates.slice(0, request.questionCount);
      return buildResult(
        request,
        chosen.map((candidate) => candidate.exerciseId),
        candidates,
        false,
      );
    }

    const pools = buildPracticeCandidatePools({
      candidates,
      snapshots,
      touchedSkillIds: [...touchedSkillIds],
      now,
    });

    const adjustedPools = hasPersistedProjections
      ? applyPersistedProjectionOverrides(
          pools,
          candidates,
          new Set(dueReviews.map((review) => review.exerciseId)),
          new Map(
            masteryRecords.map((mastery) => [mastery.skillId, mastery.masteryScore]),
          ),
        )
      : pools;

    const exerciseIds =
      request.selectionType === "daily_review"
        ? selectPracticeExercises({
            questionCount: request.questionCount,
            touchedSkillIds: [...touchedSkillIds],
            pools: adjustedPools,
          })
        : selectWeaknessFirst(adjustedPools, request.questionCount);

    return buildResult(request, exerciseIds, candidates, true);
  }

  private selectTopicPractice(
    request: PracticeSelectionRequest,
    candidates: readonly PracticeCandidateRecord[],
    snapshots: ReadonlyMap<string, ExerciseLearningSnapshot>,
    personalized: boolean,
  ): PracticeSelectionResult {
    const topicCandidates: TopicPracticeCandidate[] = candidates.map(
      (candidate) => {
        const snapshot = snapshots.get(candidate.exerciseId);
        return {
          exerciseId: candidate.exerciseId,
          topicSlugs: candidateTopicSlugs(candidate),
          masteryLevel: deriveMasteryLevel(snapshot),
          sameDayAttemptCount: snapshot?.sameDayAttemptCount ?? 0,
          lastPracticedAt: snapshot?.lastAttemptAt ?? null,
        };
      },
    );

    const plan = createTopicPracticePlan({
      selectedTopics: request.selectedTopicSlugs,
      questionCount: request.questionCount,
      candidates: topicCandidates,
      dueExerciseIds: [],
    });

    const exerciseIds = plan.exercises.map((exercise) => exercise.exerciseId);
    return buildResult(request, exerciseIds, candidates, personalized);
  }
}
