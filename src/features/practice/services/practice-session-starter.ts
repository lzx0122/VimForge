import type { PracticeSession } from "../../../types/session";
import {
  createPracticeSession,
  type CreatePracticeSessionInput,
} from "./practice-session-service";

export interface PracticeSessionStorePort {
  restoreSession(session: PracticeSession, attemptDraft: null): void;
}

export interface PracticeSessionRepositoryPort {
  save(session: PracticeSession, attemptDraft?: null): Promise<void>;
}

export type StartPracticeSessionInput = Omit<
  CreatePracticeSessionInput,
  "id" | "startedAt"
>;

export class PracticeSessionStarter {
  public constructor(
    private readonly repository: PracticeSessionRepositoryPort,
    private readonly store: PracticeSessionStorePort,
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async start(
    input: StartPracticeSessionInput,
  ): Promise<PracticeSession> {
    const session = createPracticeSession({
      ...input,
      id: this.createId(),
      startedAt: this.now().toISOString(),
    });

    await this.repository.save(session, null);
    this.store.restoreSession(session, null);

    return session;
  }
}
