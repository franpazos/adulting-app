import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type AuthStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "expired"
  | "error";

interface StoredToken {
  accessToken: string;
  /** Unix milliseconds at which this token expires. */
  expiresAt: number;
}

interface AuthState {
  status: AuthStatus;
  token: StoredToken | null;
  /** Optional — populated after first profile fetch. */
  email: string | null;
  error: string | null;
  setConnecting: () => void;
  setConnected: (token: StoredToken, email?: string | null) => void;
  setError: (msg: string) => void;
  setExpired: () => void;
  reset: () => void;
}

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
];

export const GOOGLE_SCOPES = SCOPES.join(" ");

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: "idle",
      token: null,
      email: null,
      error: null,
      setConnecting: () => set({ status: "connecting", error: null }),
      setConnected: (token, email = null) =>
        set({ status: "connected", token, email, error: null }),
      setError: (msg) => set({ status: "error", error: msg }),
      setExpired: () => set({ status: "expired" }),
      reset: () =>
        set({ status: "idle", token: null, email: null, error: null }),
    }),
    {
      name: "adulting.auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        status: s.status,
        token: s.token,
        email: s.email,
      }),
    },
  ),
);

/** True when the persisted token is still valid (60s buffer). */
export function hasValidToken(token: StoredToken | null): boolean {
  if (!token) return false;
  return token.expiresAt > Date.now() + 60_000;
}
