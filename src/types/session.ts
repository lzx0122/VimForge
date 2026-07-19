import type {
  LearningMode,
  QuestionCount,
} from "./learning";

export type PracticeSelectionType =
  | "course"
  | "daily_review"
  | "topic_practice"
  | "weakness_practice";

export type PracticeSessionStatus = "active" | "completed" | "abandoned";

export interface PracticeSession {
  id: string;
  learningMode: LearningMode;
  selectionType: PracticeSelectionType;
  requestedCount: QuestionCount | null;
  actualCount: number;
  status: PracticeSessionStatus;
  currentIndex: number;
  exerciseIds: string[];
  selectedSkillIds: string[];
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}
