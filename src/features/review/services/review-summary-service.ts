import {
  buildExerciseLearningSnapshots,
  type ExerciseLearningSnapshot,
} from "../../../domain/review/exercise-learning-snapshot";
import { TOPIC_DEFINITIONS } from "../../practice/data/topic-definitions";
import type { AttemptSyncInput } from "../../practice/repositories/attempt-sync-repository";
import type {
  PracticeCandidateRecord,
  PracticeCandidateRepository,
} from "../../practice/repositories/practice-candidate-repository";
import { buildPracticeCandidatePools } from "../../practice/services/practice-pool-builder";

export interface ReviewWeakSkillSummary {
  skillId: string;
  skillSlug: string;
  name: string;
  priority: number;
  relatedExerciseCount: number;
}

export interface ReviewSummary {
  hasLearningHistory: boolean;
  dueCount: number;
  weakSkills: ReviewWeakSkillSummary[];
}

export interface ReviewSummaryAttemptRepositoryPort {
  listAll(): Promise<readonly AttemptSyncInput[]>;
}

/** How many weak skills the summary surfaces, most-weak first. */
const MAX_WEAK_SKILLS = 5;

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

function buildSkillSlugById(
  candidates: readonly PracticeCandidateRecord[],
): Map<string, string> {
  const skillSlugById = new Map<string, string>();
  for (const candidate of candidates) {
    candidate.skillIds.forEach((skillId, index) => {
      const skillSlug = candidate.skillSlugs[index];
      if (skillSlug !== undefined) {
        skillSlugById.set(skillId, skillSlug);
      }
    });
  }
  return skillSlugById;
}

/** The topic label reads more clearly than a raw skill slug; fall back to the slug itself for a skill with no topic definition. */
function skillNameForSlug(skillSlug: string): string {
  const topic = TOPIC_DEFINITIONS.find((definition) =>
    definition.skillSlugs.includes(skillSlug),
  );
  return topic?.label ?? skillSlug;
}

/**
 * Composes the same P0.2 snapshot/pool pipeline the practice selection flow
 * uses (Tasks 8-11) into a read-only summary for the review page: how many
 * exercises are due or stale, and which touched skills the learner is
 * currently weakest at.
 */
export class ReviewSummaryService {
  public constructor(
    private readonly candidateRepository: PracticeCandidateRepository,
    private readonly attemptRepository: ReviewSummaryAttemptRepositoryPort,
  ) {}

  public async getSummary(now: Date = new Date()): Promise<ReviewSummary> {
    const [candidates, attempts] = await Promise.all([
      this.candidateRepository.listPublishedCandidates({
        learningMode: "memory_review",
      }),
      this.attemptRepository.listAll(),
    ]);

    if (attempts.length === 0) {
      return { hasLearningHistory: false, dueCount: 0, weakSkills: [] };
    }

    const snapshots = buildExerciseLearningSnapshots(attempts, now);
    const touchedSkillIds = deriveTouchedSkillIds(candidates, snapshots);
    const pools = buildPracticeCandidatePools({
      candidates,
      snapshots,
      touchedSkillIds: [...touchedSkillIds],
      now,
    });

    const dueCount = pools.dueOrIncorrect.length + pools.stale.length;

    const skillSlugById = buildSkillSlugById(candidates);
    const weakSkillAggregates = new Map<
      string,
      { priority: number; relatedExerciseCount: number }
    >();
    for (const weakCandidate of pools.weak) {
      for (const skillId of weakCandidate.skillIds) {
        const existing = weakSkillAggregates.get(skillId);
        if (existing === undefined) {
          weakSkillAggregates.set(skillId, {
            priority: weakCandidate.priority,
            relatedExerciseCount: 1,
          });
        } else {
          existing.priority = Math.max(existing.priority, weakCandidate.priority);
          existing.relatedExerciseCount += 1;
        }
      }
    }

    const weakSkills = [...weakSkillAggregates.entries()]
      .map(([skillId, aggregate]) => {
        const skillSlug = skillSlugById.get(skillId) ?? skillId;
        return {
          skillId,
          skillSlug,
          name: skillNameForSlug(skillSlug),
          priority: aggregate.priority,
          relatedExerciseCount: aggregate.relatedExerciseCount,
        };
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, MAX_WEAK_SKILLS);

    return {
      hasLearningHistory: true,
      dueCount,
      weakSkills,
    };
  }
}
