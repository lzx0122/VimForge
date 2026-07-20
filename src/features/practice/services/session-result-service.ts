import type { MasteryLevel } from "../../../domain/mastery/mastery-config";
import { AttemptRepository } from "../../../infrastructure/indexed-db/attempt-repository";
import { LearningOutcomeRepository } from "../../../infrastructure/indexed-db/learning-outcome-repository";
import { SessionRepository } from "../../../infrastructure/indexed-db/session-repository";
import type { StoredLearningOutcome } from "../../../types/learning-projection";
import type { LearningMode } from "../../../types/learning";
import type { PracticeSession } from "../../../types/session";
import type { AttemptSyncInput } from "../repositories/attempt-sync-repository";
import { createPracticeSession } from "./practice-session-service";

export interface SessionSkillChange {
  skillId: string;
  previousScore: number;
  nextScore: number;
  previousLevel: MasteryLevel;
  nextLevel: MasteryLevel;
}

export interface SessionExerciseResult {
  exerciseId: string;
  completed: boolean;
  accuracyScore: number;
  speedScore: number;
  durationMs: number;
}

export interface PracticeSessionResult {
  sessionId: string;
  learningMode: LearningMode;
  totalExercises: number;
  completedExercises: number;
  skippedExercises: number;
  averageAccuracy: number | null;
  averageSpeed: number | null;
  totalDurationMs: number;
  skillChanges: SessionSkillChange[];
  exerciseResults: SessionExerciseResult[];
}

function effectiveAttemptTimestamp(attempt: AttemptSyncInput): string {
  return attempt.completedAt ?? attempt.startedAt;
}

/** The most recent attempt per exercise: a retried exercise's earlier, superseded attempts don't contribute to the result. */
function latestAttemptByExerciseId(
  attempts: readonly AttemptSyncInput[],
): Map<string, AttemptSyncInput> {
  const latest = new Map<string, AttemptSyncInput>();

  for (const attempt of attempts) {
    const current = latest.get(attempt.exerciseId);
    if (
      current === undefined ||
      effectiveAttemptTimestamp(attempt) >
        effectiveAttemptTimestamp(current)
    ) {
      latest.set(attempt.exerciseId, attempt);
    }
  }

  return latest;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Each skill's net change across the session: the first previous* seen through the last next* seen, in chronological order. */
function aggregateSkillChanges(
  outcomes: readonly StoredLearningOutcome[],
): SessionSkillChange[] {
  const chronological = [...outcomes].sort((a, b) =>
    a.completedAt.localeCompare(b.completedAt),
  );
  const bySkillId = new Map<string, SessionSkillChange>();

  for (const outcome of chronological) {
    for (const change of outcome.skillChanges) {
      const existing = bySkillId.get(change.skillId);
      if (existing === undefined) {
        bySkillId.set(change.skillId, {
          skillId: change.skillId,
          previousScore: change.previousScore,
          previousLevel: change.previousLevel,
          nextScore: change.nextScore,
          nextLevel: change.nextLevel,
        });
      } else {
        existing.nextScore = change.nextScore;
        existing.nextLevel = change.nextLevel;
      }
    }
  }

  return [...bySkillId.values()];
}

/**
 * Summarizes a practice session from local attempt/outcome history: a
 * retried exercise only contributes its latest attempt, and averages are
 * computed from completed exercises only (a skipped exercise still counts
 * toward totals, just not toward the average).
 */
export class SessionResultService {
  public constructor(
    private readonly database: IDBDatabase,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  public async getResult(
    sessionId: string,
  ): Promise<PracticeSessionResult | null> {
    const sessionRepository = new SessionRepository(this.database);
    const session = await sessionRepository.get(sessionId);
    if (session === null) {
      return null;
    }

    const attemptRepository = new AttemptRepository(this.database);
    const outcomeRepository = new LearningOutcomeRepository(this.database);
    const [allAttempts, outcomes] = await Promise.all([
      attemptRepository.listAll(),
      outcomeRepository.listBySessionId(sessionId),
    ]);
    const sessionAttempts = allAttempts.filter(
      (attempt) => attempt.sessionId === sessionId,
    );
    const latestByExerciseId = latestAttemptByExerciseId(sessionAttempts);
    const outcomeByClientAttemptId = new Map(
      outcomes.map((outcome) => [outcome.clientAttemptId, outcome]),
    );

    const exerciseResults: SessionExerciseResult[] = [];
    const contributingOutcomes: StoredLearningOutcome[] = [];
    let completedExercises = 0;
    let skippedExercises = 0;
    let totalDurationMs = 0;

    for (const exerciseId of session.exerciseIds) {
      const latestAttempt = latestByExerciseId.get(exerciseId);
      if (latestAttempt === undefined) {
        continue;
      }

      const durationMs = latestAttempt.durationMs ?? 0;
      exerciseResults.push({
        exerciseId,
        completed: latestAttempt.completed,
        accuracyScore: latestAttempt.accuracyScore,
        speedScore: latestAttempt.speedScore,
        durationMs,
      });
      totalDurationMs += durationMs;
      if (latestAttempt.completed) {
        completedExercises += 1;
      } else {
        skippedExercises += 1;
      }

      const outcome = outcomeByClientAttemptId.get(
        latestAttempt.clientAttemptId,
      );
      if (outcome !== undefined) {
        contributingOutcomes.push(outcome);
      }
    }

    const completedResults = exerciseResults.filter(
      (result) => result.completed,
    );

    return {
      sessionId,
      learningMode: session.learningMode,
      totalExercises: session.exerciseIds.length,
      completedExercises,
      skippedExercises,
      averageAccuracy: average(
        completedResults.map((result) => result.accuracyScore),
      ),
      averageSpeed: average(
        completedResults.map((result) => result.speedScore),
      ),
      totalDurationMs,
      skillChanges: aggregateSkillChanges(contributingOutcomes),
      exerciseResults,
    };
  }

  public async restart(sessionId: string): Promise<PracticeSession> {
    const sessionRepository = new SessionRepository(this.database);
    const previousSession = await sessionRepository.get(sessionId);
    if (previousSession === null) {
      throw new Error(`No session found for ${sessionId}.`);
    }

    const restarted = createPracticeSession({
      id: this.createId(),
      learningMode: previousSession.learningMode,
      selectionType: previousSession.selectionType,
      requestedCount: previousSession.requestedCount,
      exerciseIds: previousSession.exerciseIds,
      selectedSkillIds: previousSession.selectedSkillIds,
      startedAt: this.now().toISOString(),
    });

    await sessionRepository.save(restarted, null);

    return restarted;
  }
}
