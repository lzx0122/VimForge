import type { Session } from "@supabase/supabase-js";
import { defineStore } from "pinia";

import {
  AuthService,
  type AuthenticationService,
} from "../features/auth/services/auth-service";

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

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "無法完成驗證，請稍後再試。";
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
        this.errorMessage = getErrorMessage(error);
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
        this.errorMessage = getErrorMessage(error);
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
        this.errorMessage = getErrorMessage(error);
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
