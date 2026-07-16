import { describe, expect, it } from "vitest";

import { readSupabaseBrowserEnv } from "./env";

const validEnvironment = {
  VITE_SUPABASE_URL: "https://project-ref.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test_key",
};

describe("readSupabaseBrowserEnv", () => {
  it("returns a trimmed URL and browser publishable key", () => {
    expect(
      readSupabaseBrowserEnv({
        VITE_SUPABASE_URL: ` ${validEnvironment.VITE_SUPABASE_URL} `,
        VITE_SUPABASE_PUBLISHABLE_KEY:
          ` ${validEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY} `,
      }),
    ).toEqual({
      url: validEnvironment.VITE_SUPABASE_URL,
      publishableKey: validEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it("reports a clear error when the URL is missing", () => {
    expect(() =>
      readSupabaseBrowserEnv({
        VITE_SUPABASE_PUBLISHABLE_KEY:
          validEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY,
      }),
    ).toThrow("Missing VITE_SUPABASE_URL.");
  });

  it("rejects a malformed or non-HTTP Supabase URL", () => {
    expect(() =>
      readSupabaseBrowserEnv({
        ...validEnvironment,
        VITE_SUPABASE_URL: "not-a-url",
      }),
    ).toThrow("VITE_SUPABASE_URL must be a valid HTTP or HTTPS URL.");
    expect(() =>
      readSupabaseBrowserEnv({
        ...validEnvironment,
        VITE_SUPABASE_URL: "file:///tmp/supabase",
      }),
    ).toThrow("VITE_SUPABASE_URL must be a valid HTTP or HTTPS URL.");
  });

  it("rejects credentials embedded in the Supabase URL", () => {
    expect(() =>
      readSupabaseBrowserEnv({
        ...validEnvironment,
        VITE_SUPABASE_URL:
          "https://username:password@project-ref.supabase.co",
      }),
    ).toThrow("VITE_SUPABASE_URL must be a valid HTTP or HTTPS URL.");
  });

  it("reports a clear error when the publishable key is missing", () => {
    expect(() =>
      readSupabaseBrowserEnv({
        VITE_SUPABASE_URL: validEnvironment.VITE_SUPABASE_URL,
      }),
    ).toThrow("Missing VITE_SUPABASE_PUBLISHABLE_KEY.");
  });

  it.each([
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "GOOGLE_CLIENT_SECRET",
    "VITE_SUPABASE_SERVICE_ROLE_KEY",
    "VITE_SUPABASE_SECRET_KEY",
  ])("rejects browser configuration containing %s", (secretName) => {
    expect(() =>
      readSupabaseBrowserEnv({
        ...validEnvironment,
        [secretName]: "must-not-enter-browser-code",
      }),
    ).toThrow(`${secretName} must not be exposed to browser code.`);
  });

  it("rejects a secret key passed through the publishable key variable", () => {
    expect(() =>
      readSupabaseBrowserEnv({
        ...validEnvironment,
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_server_only_test_key",
      }),
    ).toThrow("VITE_SUPABASE_PUBLISHABLE_KEY must be browser-safe.");
  });

  it("rejects a legacy service-role JWT passed as a publishable key", () => {
    const payload = btoa(JSON.stringify({ role: "service_role" }))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");

    expect(() =>
      readSupabaseBrowserEnv({
        ...validEnvironment,
        VITE_SUPABASE_PUBLISHABLE_KEY: `header.${payload}.signature`,
      }),
    ).toThrow("VITE_SUPABASE_PUBLISHABLE_KEY must be browser-safe.");
  });
});
