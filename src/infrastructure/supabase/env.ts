export type SupabaseEnvironment = Readonly<Record<string, unknown>>;

export interface SupabaseBrowserEnv {
  url: string;
  publishableKey: string;
}

const FORBIDDEN_BROWSER_VARIABLES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "GOOGLE_CLIENT_SECRET",
  "VITE_SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_SECRET_KEY",
] as const;

function readString(
  environment: SupabaseEnvironment,
  name: string,
): string | null {
  const value = environment[name];

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname.length > 0 &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function containsServiceRoleJwt(value: string): boolean {
  const encodedPayload = value.split(".")[1];

  if (encodedPayload === undefined) {
    return false;
  }

  try {
    const normalizedPayload = encodedPayload
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=");
    const payload: unknown = JSON.parse(atob(normalizedPayload));

    return (
      typeof payload === "object" &&
      payload !== null &&
      "role" in payload &&
      payload.role === "service_role"
    );
  } catch {
    return false;
  }
}

function isBrowserSafePublishableKey(value: string): boolean {
  return !value.startsWith("sb_secret_") && !containsServiceRoleJwt(value);
}

export function readSupabaseBrowserEnv(
  environment: SupabaseEnvironment,
): SupabaseBrowserEnv {
  for (const name of FORBIDDEN_BROWSER_VARIABLES) {
    if (readString(environment, name) !== null) {
      throw new Error(`${name} must not be exposed to browser code.`);
    }
  }

  const url = readString(environment, "VITE_SUPABASE_URL");
  if (url === null) {
    throw new Error("Missing VITE_SUPABASE_URL.");
  }
  if (!isHttpUrl(url)) {
    throw new Error(
      "VITE_SUPABASE_URL must be a valid HTTP or HTTPS URL.",
    );
  }

  const publishableKey = readString(
    environment,
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
  if (publishableKey === null) {
    throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
  if (!isBrowserSafePublishableKey(publishableKey)) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY must be browser-safe.",
    );
  }

  return { url, publishableKey };
}
