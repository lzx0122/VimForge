import { createMemoryHistory } from "vue-router";
import { describe, expect, it } from "vitest";

import { createAppRouter, routes } from "./index";

const expectedRoutes = [
  { name: "home", path: "/" },
  { name: "courses", path: "/courses" },
  { name: "course-unit", path: "/courses/:unitSlug" },
  { name: "practice-setup", path: "/practice/setup" },
  { name: "practice", path: "/practice/:sessionId" },
  { name: "practice-result", path: "/practice/:sessionId/result" },
  { name: "review", path: "/review" },
  { name: "progress", path: "/progress" },
  { name: "settings", path: "/settings" },
  { name: "auth-callback", path: "/auth/callback" },
  { name: "not-found", path: "/:pathMatch(.*)*" },
] as const;

describe("application router", () => {
  it("declares every specified route", () => {
    expect(
      routes.map(({ name, path }) => ({ name, path })),
    ).toEqual(expectedRoutes);
  });

  it("keeps the catch-all route last", () => {
    expect(routes.at(-1)?.name).toBe("not-found");
  });

  it("resolves course and practice dynamic parameters", () => {
    const router = createAppRouter(createMemoryHistory());

    expect(
      router.resolve({
        name: "course-unit",
        params: { unitSlug: "text-objects" },
      }).path,
    ).toBe("/courses/text-objects");
    expect(
      router.resolve({
        name: "practice-result",
        params: { sessionId: "session-1" },
      }).path,
    ).toBe("/practice/session-1/result");
  });

  it("resolves unknown locations to the not-found page", () => {
    const router = createAppRouter(createMemoryHistory());

    expect(router.resolve("/missing/page").name).toBe("not-found");
  });
});
