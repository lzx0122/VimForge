import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function readRequiredDocument(path: string): string {
  const absolutePath = resolve(process.cwd(), path);
  expect(existsSync(absolutePath), `${path} must exist`).toBe(true);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

describe("production deployment contract", () => {
  it("builds the Vite SPA and preserves deep links on Vercel", () => {
    const config: unknown = JSON.parse(readProjectFile("vercel.json"));

    expect(config).toMatchObject({
      framework: "vite",
      buildCommand: "npm run build",
      outputDirectory: "dist",
      rewrites: [{ source: "/(.*)", destination: "/index.html" }],
    });
    expect(config).toMatchObject({
      headers: [
        {
          source: "/(.*)",
          headers: expect.arrayContaining([
            { key: "X-Content-Type-Options", value: "nosniff" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
          ]),
        },
      ],
    });
  });

  it("documents environment, OAuth, database, and deep-link deployment", () => {
    const deployment = readRequiredDocument("docs/deployment.md");

    expect(deployment).toContain("VITE_SUPABASE_URL");
    expect(deployment).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(deployment).toContain("/auth/callback");
    expect(deployment).toContain("/auth/v1/callback");
    expect(deployment).toContain("Authorized JavaScript origins");
    expect(deployment).toContain("Redirect URLs");
    expect(deployment).toContain("vercel env");
    expect(deployment).toContain("/courses/text-objects");
    expect(deployment).toContain("supabase db push");
  });

  it("documents release validation, RLS checks, monitoring, and rollback", () => {
    const operations = readRequiredDocument("docs/operations.md");

    expect(operations).toContain("npm run build");
    expect(operations).toContain("scripts/validate-seed.ts");
    expect(operations).toContain("rls_user_learning.sql");
    expect(operations).toContain("[VimForge]");
    expect(operations).toContain("Rollback");
    expect(operations).toContain("不得記錄");
  });

  it("links the production runbooks and acceptance record from the README", () => {
    const readme = readProjectFile("README.md");
    const acceptance = readRequiredDocument("docs/acceptance-verification.md");

    expect(readme).toContain("docs/deployment.md");
    expect(readme).toContain("docs/operations.md");
    expect(readme).toContain("docs/acceptance-verification.md");
    expect(readme).toContain("npm ci");
    expect(acceptance).toContain("AC-001");
    expect(acceptance).toContain("AC-030");
    expect(acceptance).toContain("外部環境");
  });
});
