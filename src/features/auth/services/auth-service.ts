import type {
  AuthChangeEvent,
  Session,
} from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../../../infrastructure/supabase/client";

interface AuthOperationResult {
  error: Error | null;
}

interface SessionResult extends AuthOperationResult {
  data: {
    session: Session | null;
  };
}

interface AuthSubscription {
  unsubscribe(): void;
}

export interface SupabaseAuthClient {
  signInWithOAuth(credentials: {
    provider: "google";
    options: {
      redirectTo: string;
    };
  }): Promise<AuthOperationResult>;
  getSession(): Promise<SessionResult>;
  onAuthStateChange(
    listener: (event: AuthChangeEvent, session: Session | null) => void,
  ): {
    data: {
      subscription: AuthSubscription;
    };
  };
  signOut(): Promise<AuthOperationResult>;
}

export interface AuthenticationService {
  signInWithGoogle(currentLocation: string): Promise<void>;
  getSession(): Promise<Session | null>;
  onSessionChange(listener: (session: Session | null) => void): () => void;
  signOut(): Promise<void>;
}

function createCallbackUrl(currentLocation: string): string {
  const currentOrigin = new URL(currentLocation).origin;

  return new URL("/auth/callback", currentOrigin).toString();
}

export class AuthService implements AuthenticationService {
  constructor(
    private readonly client: SupabaseAuthClient =
      getSupabaseBrowserClient().auth,
  ) {}

  async signInWithGoogle(currentLocation: string): Promise<void> {
    const { error } = await this.client.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: createCallbackUrl(currentLocation),
      },
    });

    if (error !== null) {
      throw error;
    }
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.client.getSession();

    if (error !== null) {
      throw error;
    }

    return data.session;
  }

  onSessionChange(
    listener: (session: Session | null) => void,
  ): () => void {
    const { data } = this.client.onAuthStateChange((_event, session) => {
      listener(session);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.signOut();

    if (error !== null) {
      throw error;
    }
  }
}
