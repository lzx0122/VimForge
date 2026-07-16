import type {
  LearningMode,
  QuestionCount,
} from "../../../types/learning";
import type {
  PracticeSelectionType,
  PracticeSession,
} from "../../../types/session";

export interface CreatePracticeSessionInput {
  id: string;
  learningMode: LearningMode;
  selectionType: PracticeSelectionType;
  requestedCount: QuestionCount | null;
  exerciseIds: readonly string[];
  selectedSkillIds?: readonly string[];
  startedAt: string;
}

export function createPracticeSession(
  input: CreatePracticeSessionInput,
): PracticeSession {
  if (input.exerciseIds.length === 0) {
    throw new Error("A practice session requires at least one exercise.");
  }

  return {
    id: input.id,
    learningMode: input.learningMode,
    selectionType: input.selectionType,
    requestedCount: input.requestedCount,
    status: "active",
    currentIndex: 0,
    exerciseIds: [...input.exerciseIds],
    selectedSkillIds: [...(input.selectedSkillIds ?? [])],
    startedAt: input.startedAt,
    completedAt: null,
    updatedAt: input.startedAt,
  };
}

export function advancePracticeSession(
  session: PracticeSession,
  updatedAt: string,
): PracticeSession {
  if (session.status !== "active") {
    throw new Error("Only an active practice session can advance.");
  }

  const currentIndex = Math.min(
    session.currentIndex + 1,
    session.exerciseIds.length,
  );
  const isComplete = currentIndex === session.exerciseIds.length;

  return {
    ...session,
    currentIndex,
    status: isComplete ? "completed" : "active",
    completedAt: isComplete ? updatedAt : null,
    updatedAt,
  };
}
