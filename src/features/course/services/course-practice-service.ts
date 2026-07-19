import type { ExerciseRepository } from "../../practice/repositories/exercise-repository";
import type { PracticeSessionStarter } from "../../practice/services/practice-session-starter";
import type { PracticeSession } from "../../../types/session";
import type {
  CourseRepository,
  CourseUnitDetail,
} from "../repositories/course-repository";

export class CoursePracticeService {
  public constructor(
    private readonly courseRepository: CourseRepository,
    private readonly exerciseRepository: ExerciseRepository,
    private readonly sessionStarter: PracticeSessionStarter,
  ) {}

  public async loadUnit(slug: string): Promise<CourseUnitDetail | null> {
    return this.courseRepository.getPublishedUnitBySlug(slug);
  }

  public async startUnit(slug: string): Promise<PracticeSession> {
    const unit = await this.courseRepository.getPublishedUnitBySlug(slug);
    if (unit === null) {
      throw new Error(`Unknown or unpublished course unit: ${slug}.`);
    }

    const exercises = await this.exerciseRepository.listPublishedExercises({
      unitId: unit.id,
      learningMode: "beginner",
      orderByDisplayOrder: true,
    });
    if (exercises.length === 0) {
      throw new Error(
        `Course unit ${slug} has no beginner exercises available.`,
      );
    }

    return this.sessionStarter.start({
      learningMode: "beginner",
      selectionType: "course",
      requestedCount: null,
      exerciseIds: exercises.map((exercise) => exercise.id),
      selectedSkillIds: [],
    });
  }
}
