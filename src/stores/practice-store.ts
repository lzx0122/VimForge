import { defineStore } from "pinia";

import {
  advancePracticeSession,
  createPracticeSession,
  type CreatePracticeSessionInput,
} from "../features/practice/services/practice-session-service";
import type { AttemptDraft } from "../types/attempt";
import type { PracticeSession } from "../types/session";

interface PracticeStoreState {
  session: PracticeSession | null;
  attemptDraft: AttemptDraft | null;
}

function copyAttemptDraft(draft: AttemptDraft): AttemptDraft {
  return {
    ...draft,
    initialCursor: { ...draft.initialCursor },
    currentCursor: { ...draft.currentCursor },
    actions: draft.actions.map((action) => ({ ...action })),
  };
}

function finalizeAttemptDraft(
  draft: AttemptDraft | null,
  completed: boolean,
  completedAt: string,
): AttemptDraft | null {
  if (draft === null) {
    return null;
  }

  return {
    ...copyAttemptDraft(draft),
    completed,
    completedAt,
  };
}

function finishCurrentExercise(
  session: PracticeSession,
  draft: AttemptDraft | null,
  completed: boolean,
  completedAt: string,
): PracticeStoreState {
  const nextSession = advancePracticeSession(session, completedAt);
  const nextDraft = finalizeAttemptDraft(draft, completed, completedAt);

  return {
    session: nextSession,
    attemptDraft: nextDraft,
  };
}

export const usePracticeStore = defineStore("practice", {
  state: (): PracticeStoreState => ({
    session: null,
    attemptDraft: null,
  }),

  getters: {
    currentExerciseId: (state): string | null => {
      if (state.session === null || state.session.status !== "active") {
        return null;
      }

      return state.session.exerciseIds[state.session.currentIndex] ?? null;
    },
  },

  actions: {
    createSession(input: CreatePracticeSessionInput): PracticeSession {
      const session = createPracticeSession(input);

      this.session = session;
      this.attemptDraft = null;

      return session;
    },

    saveAttemptDraft(draft: AttemptDraft): void {
      this.attemptDraft = copyAttemptDraft(draft);
    },

    completeCurrentExercise(completedAt: string): void {
      if (this.session === null) {
        throw new Error("Cannot complete an exercise without a practice session.");
      }

      const nextState = finishCurrentExercise(
        this.session,
        this.attemptDraft,
        true,
        completedAt,
      );
      this.session = nextState.session;
      this.attemptDraft = nextState.attemptDraft;
    },

    skipCurrentExercise(completedAt: string): void {
      if (this.session === null) {
        throw new Error("Cannot skip an exercise without a practice session.");
      }

      const nextState = finishCurrentExercise(
        this.session,
        this.attemptDraft,
        false,
        completedAt,
      );
      this.session = nextState.session;
      this.attemptDraft = nextState.attemptDraft;
    },

    resetSession(): void {
      this.session = null;
      this.attemptDraft = null;
    },
  },
});
