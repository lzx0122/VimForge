import type { MasteryLevel } from "../../../domain/mastery/mastery-config";
import type { StoredAttempt } from "../../../infrastructure/indexed-db/attempt-repository";
import type {
  StoredExerciseReview,
  StoredSkillMastery,
} from "../../../types/learning-projection";
import type {
  CourseRepository,
  CourseUnitDetail,
} from "../../course/repositories/course-repository";
import type { AttemptSyncInput } from "../../practice/repositories/attempt-sync-repository";

export interface SkillMasteryQueryPort {
  listAll(): Promise<StoredSkillMastery[]>;
}

export interface ExerciseReviewQueryPort {
  listDue(nowIso: string): Promise<StoredExerciseReview[]>;
  listAll(): Promise<StoredExerciseReview[]>;
}

export interface AttemptQueryPort {
  listAll(): Promise<StoredAttempt[]>;
}

export interface SkillProgressSummary {
  id: string;
  name: string;
  masteryLevel: MasteryLevel;
  masteryScore: number;
}

export interface UnitProgressSummary {
  id: string;
  slug: string;
  title: string;
  completedExercises: number;
  totalExercises: number;
}

export interface RecentAttemptSummary {
  id: string;
  exerciseTitle: string;
  completed: boolean;
  accuracyScore: number;
  occurredAt: string;
  errorSummary: string | null;
}

export interface ProgressDashboard {
  hasLearningHistory: boolean;
  dueReviewCount: number;
  skills: SkillProgressSummary[];
  units: UnitProgressSummary[];
  recentAttempts: RecentAttemptSummary[];
}

function effectiveAttemptTimestamp(attempt: AttemptSyncInput): string {
  return attempt.completedAt ?? attempt.startedAt;
}

/**
 * Newest first. Ties are broken deterministically (effective timestamp,
 * then startedAt, then clientAttemptId) instead of depending on incidental
 * repository iteration order.
 */
function compareAttemptsByRecencyDescending(
  a: AttemptSyncInput,
  b: AttemptSyncInput,
): number {
  const effectiveA = effectiveAttemptTimestamp(a);
  const effectiveB = effectiveAttemptTimestamp(b);
  if (effectiveA !== effectiveB) {
    return effectiveA < effectiveB ? 1 : -1;
  }
  if (a.startedAt !== b.startedAt) {
    return a.startedAt < b.startedAt ? 1 : -1;
  }
  if (a.clientAttemptId !== b.clientAttemptId) {
    return a.clientAttemptId < b.clientAttemptId ? 1 : -1;
  }
  return 0;
}

interface CourseCatalogIndex {
  skillNameById: Map<string, string>;
  exerciseTitleById: Map<string, string>;
  unitExerciseIds: Map<string, string[]>;
  /** Every catalog skill id, in unit displayOrder -> skill displayOrder -> slug -> id order, deduped at first occurrence. */
  orderedSkillIds: string[];
  /** Unit details sorted by displayOrder, then slug. */
  orderedUnitDetails: CourseUnitDetail[];
}

function indexCatalog(
  unitDetails: readonly CourseUnitDetail[],
): CourseCatalogIndex {
  const orderedUnitDetails = [...unitDetails].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.slug.localeCompare(b.slug),
  );

  const skillNameById = new Map<string, string>();
  const exerciseTitleById = new Map<string, string>();
  const unitExerciseIds = new Map<string, string[]>();
  const orderedSkillIds: string[] = [];
  const seenSkillIds = new Set<string>();

  for (const detail of orderedUnitDetails) {
    const orderedSkills = [...detail.skills].sort(
      (a, b) =>
        a.displayOrder - b.displayOrder ||
        a.slug.localeCompare(b.slug) ||
        a.id.localeCompare(b.id),
    );
    for (const skill of orderedSkills) {
      skillNameById.set(skill.id, skill.name);
      if (!seenSkillIds.has(skill.id)) {
        seenSkillIds.add(skill.id);
        orderedSkillIds.push(skill.id);
      }
    }

    const exerciseIds: string[] = [];
    for (const exercise of detail.exercises) {
      exerciseTitleById.set(exercise.id, exercise.title);
      exerciseIds.push(exercise.id);
    }
    unitExerciseIds.set(detail.id, exerciseIds);
  }

  return {
    skillNameById,
    exerciseTitleById,
    unitExerciseIds,
    orderedSkillIds,
    orderedUnitDetails,
  };
}

function removedExerciseTitle(exerciseId: string): string {
  return `已移除的題目（${exerciseId}）`;
}

/**
 * Composes local learning-projection repositories with the published
 * catalog into a single read model for the progress dashboard. A skill or
 * exercise no longer present in the catalog is dropped rather than shown
 * with a fabricated name.
 */
export class ProgressQueryService {
  public constructor(
    private readonly courseRepository: CourseRepository,
    private readonly skillMasteryRepository: SkillMasteryQueryPort,
    private readonly exerciseReviewRepository: ExerciseReviewQueryPort,
    private readonly attemptRepository: AttemptQueryPort,
  ) {}

  public async getDashboard(
    now: Date = new Date(),
  ): Promise<ProgressDashboard> {
    const unitSummaries = await this.courseRepository.listPublishedUnits();
    const unitDetails = (
      await Promise.all(
        unitSummaries.map((summary) =>
          this.courseRepository.getPublishedUnitBySlug(summary.slug),
        ),
      )
    ).filter((detail): detail is CourseUnitDetail => detail !== null);
    const catalog = indexCatalog(unitDetails);

    const [masteryRecords, dueReviews, allReviews, attempts] = await Promise.all([
      this.skillMasteryRepository.listAll(),
      this.exerciseReviewRepository.listDue(now.toISOString()),
      this.exerciseReviewRepository.listAll(),
      this.attemptRepository.listAll(),
    ]);

    const successfulExerciseIds = new Set(
      attempts
        .filter((attempt) => attempt.completed)
        .map((attempt) => attempt.exerciseId),
    );

    const masteryBySkillId = new Map(
      masteryRecords.map((mastery) => [mastery.skillId, mastery]),
    );
    const skills: SkillProgressSummary[] = catalog.orderedSkillIds.flatMap(
      (skillId) => {
        const mastery = masteryBySkillId.get(skillId);
        if (mastery === undefined) {
          return [];
        }
        return [
          {
            id: skillId,
            name: catalog.skillNameById.get(skillId) as string,
            masteryLevel: mastery.masteryLevel,
            masteryScore: mastery.masteryScore,
          },
        ];
      },
    );

    const units: UnitProgressSummary[] = catalog.orderedUnitDetails.map(
      (detail) => {
        const exerciseIds = catalog.unitExerciseIds.get(detail.id) ?? [];
        return {
          id: detail.id,
          slug: detail.slug,
          title: detail.title,
          completedExercises: exerciseIds.filter((id) =>
            successfulExerciseIds.has(id),
          ).length,
          totalExercises: exerciseIds.length,
        };
      },
    );

    const recentAttempts: RecentAttemptSummary[] = [...attempts]
      .sort(compareAttemptsByRecencyDescending)
      .map((attempt) => ({
        id: attempt.clientAttemptId,
        exerciseTitle:
          catalog.exerciseTitleById.get(attempt.exerciseId) ??
          removedExerciseTitle(attempt.exerciseId),
        completed: attempt.completed,
        accuracyScore: attempt.accuracyScore,
        occurredAt: effectiveAttemptTimestamp(attempt),
        errorSummary: null,
      }));

    return {
      hasLearningHistory:
        attempts.length > 0 ||
        masteryRecords.length > 0 ||
        allReviews.length > 0,
      dueReviewCount: dueReviews.length,
      skills,
      units,
      recentAttempts,
    };
  }
}
