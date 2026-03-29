/**
 * Auth Store v12 — SECURITY REWRITE
 *
 * What changed from v11:
 * - Removed ALL localStorage.setItem/getItem for tokens
 * - Removed persist middleware (tokens are in HttpOnly cookies now)
 * - login/register call BFF routes that SET cookies — no tokens in JS at all
 * - logout calls BFF route that CLEARS cookies server-side
 * - initialize checks session by calling /api/auth/me (validates cookie)
 *
 * The user object itself IS safe to store in memory/localStorage — it contains
 * no secrets, just email/id/role. Only tokens were the security concern.
 */
import { create } from "zustand";
import type { UserOut } from "@/lib/generated/api-types";
import { authApi } from "@/lib/api/client";

interface AuthState {
  user: UserOut | null;
  isLoading: boolean;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    try {
      // Validates the HttpOnly access_token cookie via /api/auth/me
      const user = await authApi.me();
      set({ user, isInitialized: true });
    } catch {
      // No valid session cookie — user needs to log in
      set({ user: null, isInitialized: true });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      // BFF route sets HttpOnly cookies — no tokens reach JS
      await authApi.login(email, password);
      const user = await authApi.me();
      set({ user, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  register: async (email, password) => {
    set({ isLoading: true });
    try {
      await authApi.register(email, password);
      const user = await authApi.me();
      set({ user, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  logout: async () => {
    try {
      // BFF route clears HttpOnly cookies server-side
      await authApi.logout();
    } finally {
      set({ user: null });
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  },
}));
