/**
 * Google OAuth via Google Identity Services — authorization-code flow
 * with a server-side exchange (the "confidential client" pattern).
 *
 * The flow:
 *
 *   login()  →  GIS popup  →  auth code  →  POST /api/auth/exchange
 *               (Google)                    (our server holds client_secret,
 *                                            trades code for access+refresh,
 *                                            stores refresh keyed by `sub`,
 *                                            returns access + sessionToken)
 *
 *   silentLogin()  →  POST /api/auth/refresh
 *                     { sessionToken }                  →  { access_token }
 *
 *   logout()  →  POST /api/auth/revoke
 *                { sessionToken }                       →  Google revoke + KV del
 *
 * The `sessionToken` is the durable credential the client holds across
 * page reloads. It replaces the implicit-flow access token as the
 * primary "am I connected?" signal. Access tokens still live ~1h in
 * authStore for direct Sheets-API calls; they're refreshed silently via
 * /api/auth/refresh once expired.
 *
 * The popup requires `Cross-Origin-Opener-Policy: same-origin-allow-popups`
 * so window.opener stays accessible — see `vite.config.ts` and `vercel.json`.
 */

import {
  GOOGLE_SCOPES,
  hasValidToken,
  useAuthStore,
} from "@/store/authStore";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/**
 * Popup mode in GIS uses the literal string "postmessage" as the
 * redirect_uri the server must echo back when exchanging the code. This
 * value MUST be added to the OAuth client's Authorized redirect URIs in
 * Google Cloud Console.
 */
const REDIRECT_URI = "postmessage";

function gis(): NonNullable<Window["google"]>["accounts"] {
  if (!window.google?.accounts) {
    throw new Error(
      "Google Identity Services not loaded yet. Wait for the GIS script in index.html before calling auth.",
    );
  }
  return window.google.accounts;
}

/** Wait until window.google.accounts is available (script is async). */
export async function waitForGis(timeoutMs = 8000): Promise<void> {
  if (window.google?.accounts) return;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (window.google?.accounts) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("Timed out waiting for Google Identity Services"));
      }
      setTimeout(tick, 80);
    };
    tick();
  });
}

export function isGoogleClientConfigured(): boolean {
  return typeof CLIENT_ID === "string" && CLIENT_ID.length > 0;
}

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

interface ExchangeResponse {
  access_token: string;
  expires_in: number;
  sessionToken: string;
  email: string | null;
}

interface RefreshResponse {
  access_token: string;
  expires_in: number;
}

/**
 * Open the consent popup and resolve with the access token. On success,
 * also stores a `sessionToken` so future boots can refresh silently via
 * /api/auth/refresh.
 */
export async function login(): Promise<string> {
  if (!isGoogleClientConfigured()) {
    throw new GoogleAuthError(
      "VITE_GOOGLE_CLIENT_ID is not set. Add it to .env.local for dev or to Vercel env vars for production.",
    );
  }

  await waitForGis();
  const auth = useAuthStore.getState();
  auth.setConnecting();

  // Request an auth code (not an access token). The callback receives
  // { code, ... } which we ship to our backend for exchange.
  const code = await new Promise<string>((resolve, reject) => {
    const codeClient = gis().oauth2.initCodeClient({
      client_id: CLIENT_ID!,
      scope: GOOGLE_SCOPES,
      ux_mode: "popup",
      // Force the consent screen so Google issues a refresh_token. Without
      // this Google may return only an access_token on subsequent grants
      // and our exchange endpoint will fail with "no refresh_token".
      prompt: "consent",
      callback: (resp: { code?: string; error?: string; error_description?: string }) => {
        if (resp.error) {
          const msg = resp.error_description ?? `Google auth error: ${resp.error}`;
          reject(new GoogleAuthError(msg));
          return;
        }
        if (!resp.code) {
          reject(new GoogleAuthError("Google callback missing code"));
          return;
        }
        resolve(resp.code);
      },
      error_callback: (err: { message?: string; type?: string }) => {
        const msg = err.message ?? `Google auth error: ${err.type ?? "unknown"}`;
        reject(new GoogleAuthError(msg));
      },
    });
    codeClient.requestCode();
  }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    auth.setError(msg);
    throw err;
  });

  // Send the code to our backend to exchange for tokens. The backend
  // stores the refresh_token in KV and hands us back an access_token +
  // sessionToken.
  const r = await fetch("/api/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
  });
  if (!r.ok) {
    const detail = await safeReadError(r);
    const msg = `Auth exchange failed (${r.status}): ${detail}`;
    auth.setError(msg);
    throw new GoogleAuthError(msg);
  }
  const data = (await r.json()) as ExchangeResponse;

  const expiresAt = Date.now() + data.expires_in * 1000;
  const s = useAuthStore.getState();
  s.setConnected({ accessToken: data.access_token, expiresAt }, data.email);
  s.setSessionToken(data.sessionToken);
  return data.access_token;
}

/**
 * Refresh the access token silently via our backend. Succeeds when the
 * user has a stored sessionToken whose underlying refresh_token is still
 * valid at Google. Never opens a popup.
 *
 * Returns `{ ok: false }` on any silent failure so the caller can decide
 * whether to fall back to interactive `login()`.
 */
export async function silentLogin(): Promise<
  { ok: true; token: string } | { ok: false; reason: string }
> {
  const { sessionToken } = useAuthStore.getState();
  if (!sessionToken) {
    return { ok: false, reason: "no-session-token" };
  }

  let r: Response;
  try {
    r = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken }),
    });
  } catch (e) {
    // Network failure — keep the existing connected state; sync will retry.
    return { ok: false, reason: e instanceof Error ? e.message : "fetch-failed" };
  }

  if (r.status === 401 || r.status === 404) {
    // Session or refresh_token is invalid → drop client state so the UI
    // surfaces "needs reconnect".
    const s = useAuthStore.getState();
    s.setExpired();
    s.setSessionToken(null);
    return { ok: false, reason: `status-${r.status}` };
  }
  if (!r.ok) {
    return { ok: false, reason: `status-${r.status}` };
  }

  const data = (await r.json()) as RefreshResponse;
  const expiresAt = Date.now() + data.expires_in * 1000;
  const s = useAuthStore.getState();
  s.setConnected({ accessToken: data.access_token, expiresAt }, s.email);
  return { ok: true, token: data.access_token };
}

/**
 * Returns a valid access token, preferring silent refresh when the cached
 * token has expired. Only falls back to the interactive popup if silent
 * fails — that path is reserved for revoked grants / cleared cookies.
 */
export async function getValidToken(): Promise<string> {
  const { token } = useAuthStore.getState();
  if (hasValidToken(token)) return token!.accessToken;
  const silent = await silentLogin();
  if (silent.ok) return silent.token;
  return login();
}

/**
 * Disconnect: revoke at Google + KV deletion via backend, then clear
 * local auth state. Best-effort on the network call — local state is
 * always wiped.
 */
export async function logout(): Promise<void> {
  const { sessionToken, reset } = useAuthStore.getState();
  if (sessionToken) {
    try {
      await fetch("/api/auth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken }),
      });
    } catch {
      // Best-effort — proceed to clear locally either way.
    }
  }
  reset();
}

async function safeReadError(r: Response): Promise<string> {
  try {
    const body = await r.json();
    if (body && typeof body === "object") {
      const b = body as { error?: string; detail?: string };
      return `${b.error ?? "error"}${b.detail ? `: ${b.detail}` : ""}`;
    }
    return JSON.stringify(body);
  } catch {
    try {
      return await r.text();
    } catch {
      return "<no body>";
    }
  }
}
