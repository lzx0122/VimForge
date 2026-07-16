import type { Session } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  AuthService,
  type SupabaseAuthClient,
} from "./auth-service";

const existingSession: Session = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_in: 3_600,
  token_type: "bearer",
  user: {
    id: "user-1",
    app_metadata: { provider: "google" },
    user_metadata: { name: "Vim Learner" },
    aud: "authenticated",
    created_at: "2026-07-16T00:00:00.000Z",
    email: "learner@example.com",
  },
};

function createAuthClient(
  overrides: Partial<SupabaseAuthClient> = {},
): SupabaseAuthClient {
  return {
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    getSession: vi.fn(async () => ({
      data: { session: null },
      error: null,
    })),
    onAuthStateChange: vi.fn(() => ({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    })),
    signOut: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
}

describe("AuthService", () => {
  it("starts Google OAuth with the current origin callback URL", async () => {
    const client = createAuthClient();
    const service = new AuthService(client);

    await service.signInWithGoogle("https://vimforge.example");

    expect(client.signInWithOAuth).toHaveBeenCalledOnce();
    expect(client.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://vimforge.example/auth/callback",
      },
    });
  });

  it("normalizes the supplied location to its origin", async () => {
    const client = createAuthClient();
    const service = new AuthService(client);

    await service.signInWithGoogle(
      "https://vimforge.example/practice/session-1?from=guest",
    );

    expect(client.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          redirectTo: "https://vimforge.example/auth/callback",
        },
      }),
    );
  });

  it("propagates an OAuth start error", async () => {
    const oauthError = new Error("OAuth unavailable");
    const client = createAuthClient({
      signInWithOAuth: vi.fn(async () => ({ error: oauthError })),
    });
    const service = new AuthService(client);

    await expect(
      service.signInWithGoogle("https://vimforge.example"),
    ).rejects.toBe(oauthError);
  });

  it("restores the persisted Supabase session", async () => {
    const client = createAuthClient({
      getSession: vi.fn(async () => ({
        data: { session: existingSession },
        error: null,
      })),
    });
    const service = new AuthService(client);

    await expect(service.getSession()).resolves.toBe(existingSession);
  });

  it("propagates an error while restoring the session", async () => {
    const sessionError = new Error("Session unavailable");
    const client = createAuthClient({
      getSession: vi.fn(async () => ({
        data: { session: null },
        error: sessionError,
      })),
    });
    const service = new AuthService(client);

    await expect(service.getSession()).rejects.toBe(sessionError);
  });

  it("forwards auth state changes and releases the subscription", () => {
    let authStateListener:
      | Parameters<SupabaseAuthClient["onAuthStateChange"]>[0]
      | undefined;
    const unsubscribe = vi.fn();
    const client = createAuthClient({
      onAuthStateChange: vi.fn((listener) => {
        authStateListener = listener;
        return { data: { subscription: { unsubscribe } } };
      }),
    });
    const service = new AuthService(client);
    const sessionListener = vi.fn();

    const stopListening = service.onSessionChange(sessionListener);
    authStateListener?.("SIGNED_IN", existingSession);
    authStateListener?.("SIGNED_OUT", null);
    stopListening();

    expect(sessionListener).toHaveBeenNthCalledWith(1, existingSession);
    expect(sessionListener).toHaveBeenNthCalledWith(2, null);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("signs out only through Supabase auth", async () => {
    const client = createAuthClient();
    const service = new AuthService(client);

    await service.signOut();

    expect(client.signOut).toHaveBeenCalledOnce();
    expect(client.getSession).not.toHaveBeenCalled();
    expect(client.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("propagates a sign-out error", async () => {
    const signOutError = new Error("Sign out unavailable");
    const client = createAuthClient({
      signOut: vi.fn(async () => ({ error: signOutError })),
    });
    const service = new AuthService(client);

    await expect(service.signOut()).rejects.toBe(signOutError);
  });
});
