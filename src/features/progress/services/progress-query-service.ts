import type { MasteryLevel } from "../../../domain/mastery/mastery-config";
import { AttemptRepository } from "../../../infrastructure/indexed-db/attempt-repository";
import { ExerciseReviewRepository } from "../../../infrastructure/indexed-db/exercise-review-repository";
import { SkillMasteryRepository } from "../../../infrastructure/indexed-db/skill-mastery-repository";
import type {
  CourseRepository,
  CourseUnitDetail,
} from "../../course/repositories/course-repository";
import type { AttemptSyncInput } from "../../practice/repositories/attempt-sync-repository";

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

const RECENT_ATTEMPT_LIMIT = 10;

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
}

function indexCatalog(
  unitDetails: readonly CourseUnitDetail[],
): CourseCatalogIndex {
  const skillNameById = new Map<string, string>();
  const exerciseTitleById = new Map<string, string>();
  const unitExerciseIds = new Map<string, string[]>();

  for (const detail of unitDetails) {
    for (const skill of detail.skills) {
      skillNameById.set(skill.id, skill.name);
    }

    const exerciseIds: string[] = [];
    for (const exercise of detail.exercises) {
      exerciseTitleById.set(exercise.id, exercise.title);
      exerciseIds.push(exercise.id);
    }
    unitExerciseIds.set(detail.id, exerciseIds);
  }

  return { skillNameById, exerciseTitleById, unitExerciseIds };
}

/**
 * Composes local learning-projection repositories with the published
 * catalog into a single read model for the progress dashboard. A skill or
 * exercise no longer present in the catalog is dropped rather than shown
 * with a fabricated name.
 */
export class ProgressQueryService {
  public constructor(
    private readonly database: IDBDatabase,
    private readonly courseRepository: CourseRepository,
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

    const [masteryRecords, dueReviews, attempts] = await Promise.all([
      new SkillMasteryRepository(this.database).listAll(),
      new ExerciseReviewRepository(this.database).listDue(now.toISOString()),
      new AttemptRepository(this.database).listAll(),
    ]);

    const successfulExerciseIds = new Set(
      attempts
        .filter((attempt) => attempt.completed)
        .map((attempt) => attempt.exerciseId),
    );

    const skills: SkillProgressSummary[] = masteryRecords
      .filter((mastery) => catalog.skillNameById.has(mastery.skillId))
      .map((mastery) => ({
        id: mastery.skillId,
        name: catalog.skillNameById.get(mastery.skillId) as string,
        masteryLevel: mastery.masteryLevel,
        masteryScore: mastery.masteryScore,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const units: UnitProgressSummary[] = [...unitDetails]
      .sort(
        (a, b) =>
          a.displayOrder - b.displayOrder || a.slug.localeCompare(b.slug),
      )
      .map((detail) => {
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
      });

    const recentAttempts: RecentAttemptSummary[] = [...attempts]
      .filter((attempt) => catalog.exerciseTitleById.has(attempt.exerciseId))
      .sort(compareAttemptsByRecencyDescending)
      .slice(0, RECENT_ATTEMPT_LIMIT)
      .map((attempt) => ({
        id: attempt.clientAttemptId,
        exerciseTitle: catalog.exerciseTitleById.get(
          attempt.exerciseId,
        ) as string,
        completed: attempt.completed,
        accuracyScore: attempt.accuracyScore,
        occurredAt: effectiveAttemptTimestamp(attempt),
        errorSummary: null,
      }));

    return {
      hasLearningHistory: attempts.length > 0,
      dueReviewCount: dueReviews.length,
      skills,
      units,
      recentAttempts,
    };
  }
}
