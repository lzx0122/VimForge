import type { Session } from "@supabase/supabase-js";
import { defineStore } from "pinia";

import {
  AuthService,
  type AuthenticationService,
} from "../features/auth/services/auth-service";
import { reportError } from "../infrastructure/monitoring/error-reporter";

interface AuthStoreState {
  session: Session | null;
  initialized: boolean;
  pending: boolean;
  errorMessage: string | null;
}

let defaultAuthService: AuthenticationService | null = null;
let stopSessionChanges: (() => void) | null = null;

function getDefaultAuthService(): AuthenticationService {
  defaultAuthService ??= new AuthService();

  return defaultAuthService;
}

function getErrorMessage(): string {
  return "無法完成驗證，請稍後再試。";
}

export const useAuthStore = defineStore("auth", {
  state: (): AuthStoreState => ({
    session: null,
    initialized: false,
    pending: false,
    errorMessage: null,
  }),

  getters: {
    isAuthenticated: (state): boolean => state.session !== null,
    currentUser: (state) => state.session?.user ?? null,
  },

  actions: {
    async initialize(
      service: AuthenticationService = getDefaultAuthService(),
    ): Promise<void> {
      this.errorMessage = null;

      try {
        this.session = await service.getSession();
        stopSessionChanges?.();
        stopSessionChanges = service.onSessionChange((session) => {
          this.session = session;
        });
      } catch (error: unknown) {
        reportError("auth.initialize", error);
        this.errorMessage = getErrorMessage();
      } finally {
        this.initialized = true;
      }
    },

    async signInWithGoogle(
      currentLocation: string = window.location.origin,
      service: AuthenticationService = getDefaultAuthService(),
    ): Promise<void> {
      this.pending = true;
      this.errorMessage = null;

      try {
        await service.signInWithGoogle(currentLocation);
      } catch (error: unknown) {
        reportError("auth.sign-in", error);
        this.errorMessage = getErrorMessage();
      } finally {
        this.pending = false;
      }
    },

    async signOut(
      service: AuthenticationService = getDefaultAuthService(),
    ): Promise<void> {
      this.pending = true;
      this.errorMessage = null;

      try {
        await service.signOut();
        this.session = null;
      } catch (error: unknown) {
        reportError("auth.sign-out", error);
        this.errorMessage = getErrorMessage();
      } finally {
        this.pending = false;
      }
    },

    stopListening(): void {
      stopSessionChanges?.();
      stopSessionChanges = null;
    },
  },
});
