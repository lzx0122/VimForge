import { afterEach, describe, expect, it, vi } from "vitest";

import { reportError } from "./error-reporter";

describe("error reporter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs only a stable context and sanitized Error fields", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // The assertion below inspects the safe console payload.
    });
    const error = new Error("Unable to load the practice session.");

    reportError("practice.load", error);

    expect(consoleError).toHaveBeenCalledWith("[VimForge] practice.load", {
      name: "Error",
      message: "Operation failed.",
    });
    expect(consoleError.mock.calls[0]).not.toContain(error);
  });

  it("drops arbitrary properties that could contain credentials", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // The assertion below inspects the safe console payload.
    });

    reportError("auth.initialize", {
      message: "Authentication initialization failed.",
      token: "must-not-be-logged",
    });

    expect(consoleError).toHaveBeenCalledWith("[VimForge] auth.initialize", {
      name: "UnknownError",
      message: "Operation failed.",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "must-not-be-logged",
    );
  });

  it("uses a user-safe fallback for unknown thrown values", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // The assertion below inspects the safe console payload.
    });

    reportError("sync.pending-attempts", Symbol("private-value"));

    expect(consoleError).toHaveBeenCalledWith(
      "[VimForge] sync.pending-attempts",
      {
        name: "UnknownError",
        message: "Operation failed.",
      },
    );
  });
});
