import type { MasteryLevel } from "../../../domain/mastery/mastery-config";
import type {
  StoredExerciseReview,
  StoredSkillMastery,
} from "../../../types/learning-projection";
import type { PracticeSession } from "../../../types/session";
import type {
  CourseRepository,
  CourseUnitDetail,
} from "../../course/repositories/course-repository";

export interface HomeLearningSummary {
  activeSessionId: string | null;
  dueReviewCount: number;
  weakestSkill: {
    skillId: string;
    name: string;
    masteryLevel: MasteryLevel;
  } | null;
}

export interface HomeSessionRepositoryPort {
  getActive(): Promise<PracticeSession | null>;
}

export interface HomeExerciseReviewRepositoryPort {
  listDue(nowIso: string): Promise<readonly StoredExerciseReview[]>;
}

export interface HomeSkillMasteryRepositoryPort {
  listAll(): Promise<readonly StoredSkillMastery[]>;
}

function buildSkillNameById(
  unitDetails: readonly CourseUnitDetail[],
): Map<string, string> {
  const skillNameById = new Map<string, string>();
  for (const detail of unitDetails) {
    for (const skill of detail.skills) {
      skillNameById.set(skill.id, skill.name);
    }
  }
  return skillNameById;
}

/**
 * Composes an active session, the persisted due-review count, and the
 * learner's single weakest touched skill into one minimal home-page
 * summary. A mastery record whose skill is no longer in the published
 * catalog is skipped rather than surfaced with a fabricated name.
 */
export class HomeLearningSummaryService {
  public constructor(
    private readonly sessionRepository: HomeSessionRepositoryPort,
    private readonly exerciseReviewRepository: HomeExerciseReviewRepositoryPort,
    private readonly skillMasteryRepository: HomeSkillMasteryRepositoryPort,
    private readonly courseRepository: CourseRepository,
  ) {}

  public async getSummary(
    now: Date = new Date(),
  ): Promise<HomeLearningSummary> {
    const [activeSession, dueReviews, masteryRecords, unitSummaries] =
      await Promise.all([
        this.sessionRepository.getActive(),
        this.exerciseReviewRepository.listDue(now.toISOString()),
        this.skillMasteryRepository.listAll(),
        this.courseRepository.listPublishedUnits(),
      ]);

    const unitDetails = (
      await Promise.all(
        unitSummaries.map((summary) =>
          this.courseRepository.getPublishedUnitBySlug(summary.slug),
        ),
      )
    ).filter((detail): detail is CourseUnitDetail => detail !== null);
    const skillNameById = buildSkillNameById(unitDetails);

    const weakestMastery = [...masteryRecords]
      .filter((mastery) => skillNameById.has(mastery.skillId))
      .sort((a, b) => a.masteryScore - b.masteryScore)[0];

    return {
      activeSessionId: activeSession === null ? null : activeSession.id,
      dueReviewCount: dueReviews.length,
      weakestSkill:
        weakestMastery === undefined
          ? null
          : {
              skillId: weakestMastery.skillId,
              name: skillNameById.get(weakestMastery.skillId) as string,
              masteryLevel: weakestMastery.masteryLevel,
            },
    };
  }
}
