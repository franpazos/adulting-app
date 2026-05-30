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
  /**
   * Opaque HMAC-signed credential issued by `/api/auth/exchange`. The
   * client holds this across reloads and presents it to
   * `/api/auth/refresh` to get a new access_token without involving
   * Google's popup. Persistence of this is the whole point of the
   * backend.
   */
  sessionToken: string | null;
  error: string | null;
  setConnecting: () => void;
  setConnected: (token: StoredToken, email?: string | null) => void;
  setSessionToken: (sessionToken: string | null) => void;
  setError: (msg: string) => void;
  setExpired: () => void;
  reset: () => void;
}

const SCOPES = [
  // openid + email are required for the authorization-code flow to issue
  // an id_token in the exchange response — without them, Google returns
  // only an access_token and our backend can't verify the user identity.
  // The id_token's `sub` claim is what we key refresh_tokens by in KV.
  "openid",
  "email",
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
      sessionToken: null,
      error: null,
      setConnecting: () => set({ status: "connecting", error: null }),
      setConnected: (token, email = null) =>
        set({ status: "connected", token, email, error: null }),
      setSessionToken: (sessionToken) => set({ sessionToken }),
      setError: (msg) => set({ status: "error", error: msg }),
      setExpired: () => set({ status: "expired" }),
      reset: () =>
        set({
          status: "idle",
          token: null,
          email: null,
          sessionToken: null,
          error: null,
        }),
    }),
    {
      name: "adulting.auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        status: s.status,
        token: s.token,
        email: s.email,
        sessionToken: s.sessionToken,
      }),
    },
  ),
);

/** True when the persisted token is still valid (60s buffer). */
export function hasValidToken(token: StoredToken | null): boolean {
  if (!token) return false;
  return token.expiresAt > Date.now() + 60_000;
}
