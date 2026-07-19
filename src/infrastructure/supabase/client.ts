import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import type { Database } from "./database.types";
import {
  readSupabaseBrowserEnv,
  type SupabaseEnvironment,
} from "./env";

let browserClient: SupabaseClient<Database> | null = null;

export function createSupabaseBrowserClient(
  environment: SupabaseEnvironment,
): SupabaseClient<Database> {
  const { url, publishableKey } = readSupabaseBrowserEnv(environment);

  return createClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
}

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  browserClient ??= createSupabaseBrowserClient(import.meta.env);
  return browserClient;
}
