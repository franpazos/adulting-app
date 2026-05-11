/**
 * Google OAuth via Google Identity Services token client (implicit flow).
 *
 * GIS exposes `window.google.accounts.oauth2.initTokenClient(...)` which
 * pops up the consent screen and returns an access token. The token is
 * short-lived (~1h); for phase 9a we re-prompt silently when needed and
 * fall back to a visible prompt if Google rejects the silent request.
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

/**
 * Open the consent popup and resolve with the access token. Updates
 * `authStore` with status transitions (`connecting` → `connected` | `error`).
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

  return new Promise((resolve, reject) => {
    const tokenClient = gis().oauth2.initTokenClient({
      client_id: CLIENT_ID!,
      scope: GOOGLE_SCOPES,
      callback: (resp) => {
        if (resp.error) {
          const msg =
            resp.error_description ?? `Google auth error: ${resp.error}`;
          auth.setError(msg);
          reject(new GoogleAuthError(msg));
          return;
        }
        const expiresAt = Date.now() + resp.expires_in * 1000;
        useAuthStore
          .getState()
          .setConnected({ accessToken: resp.access_token, expiresAt });
        // Fetch user email opportunistically — non-blocking.
        void fetchEmail(resp.access_token).then((email) => {
          if (email) {
            const s = useAuthStore.getState();
            if (s.token) s.setConnected(s.token, email);
          }
        });
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        const msg = err.message ?? `Google auth error: ${err.type}`;
        auth.setError(msg);
        reject(new GoogleAuthError(msg));
      },
    });
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

/**
 * Try to refresh the access token without showing UI. Succeeds when the user
 * is still signed into Google in this browser and previously granted the
 * scopes — the common case. Never opens a popup; resolves `{ ok: false }` on
 * any silent failure (interaction required, popup blocked by ITP, GIS not
 * loaded, etc.) so the caller can decide whether to fall back to `login()`.
 *
 * Calls `setExpired()` on the auth store when silent renewal fails, so the
 * UI banner ("Reconnect to Google") is correct without further plumbing.
 */
export async function silentLogin(): Promise<
  { ok: true; token: string } | { ok: false; reason: string }
> {
  if (!isGoogleClientConfigured()) {
    return { ok: false, reason: "not-configured" };
  }
  try {
    await waitForGis();
  } catch {
    return { ok: false, reason: "gis-load-failed" };
  }

  return new Promise((resolve) => {
    try {
      const client = gis().oauth2.initTokenClient({
        client_id: CLIENT_ID!,
        scope: GOOGLE_SCOPES,
        callback: (resp) => {
          if (resp.error) {
            useAuthStore.getState().setExpired();
            resolve({ ok: false, reason: resp.error });
            return;
          }
          const expiresAt = Date.now() + resp.expires_in * 1000;
          const s = useAuthStore.getState();
          s.setConnected(
            { accessToken: resp.access_token, expiresAt },
            s.email,
          );
          resolve({ ok: true, token: resp.access_token });
        },
        error_callback: (err) => {
          useAuthStore.getState().setExpired();
          resolve({ ok: false, reason: err?.type ?? "unknown" });
        },
      });
      // prompt: "" = silent token request. Google returns interaction_required
      // (or similar) if the user needs to re-consent.
      client.requestAccessToken({ prompt: "" });
    } catch (e) {
      useAuthStore.getState().setExpired();
      resolve({
        ok: false,
        reason: e instanceof Error ? e.message : "exception",
      });
    }
  });
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

/** Revoke the current token and clear local auth state. */
export async function logout(): Promise<void> {
  const { token, reset } = useAuthStore.getState();
  if (!token) {
    reset();
    return;
  }
  try {
    await waitForGis();
    await new Promise<void>((resolve) => {
      gis().oauth2.revoke(token.accessToken, () => resolve());
    });
  } catch {
    // Best-effort revoke — proceed to clear locally either way.
  }
  reset();
}

async function fetchEmail(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!r.ok) return null;
    const json = (await r.json()) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}
