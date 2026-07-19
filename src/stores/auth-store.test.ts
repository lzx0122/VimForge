import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticationService } from "../features/auth/services/auth-service";
import { useAuthStore } from "./auth-store";

function createFailingAuthService(): AuthenticationService {
  return {
    getSession: vi.fn(async () => {
      throw new Error("access_token=must-not-reach-the-user-or-console");
    }),
    onSessionChange: vi.fn(() => () => undefined),
    signInWithGoogle: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  };
}

describe("auth store error handling", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("keeps provider details out of both the UI and console", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // The assertions below inspect the sanitized payload.
    });
    const store = useAuthStore();

    await store.initialize(createFailingAuthService());

    expect(store.initialized).toBe(true);
    expect(store.errorMessage).toBe("無法完成驗證，請稍後再試。");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "must-not-reach-the-user-or-console",
    );
  });
});
