/**
 * POST /api/auth/refresh
 *
 * The hot path of the auth flow. Called on app boot when the cached
 * access_token has expired (or to proactively renew when close to
 * expiry). The client sends only its opaque sessionToken; the server
 * resolves that to a `sub`, looks up the refresh_token in KV, asks
 * Google for a fresh access_token, and returns:
 *
 *   { access_token, expires_in }
 *
 * No popup, no GIS, no user interaction. This is the entire reason the
 * backend exists.
 *
 * Request body (JSON): { sessionToken: string }
 * Success: 200 { access_token, expires_in }
 * Errors:
 *   400 bad shape
 *   401 sessionToken invalid (signature mismatch or malformed)
 *   404 no refresh_token stored for this user (forces interactive re-auth)
 *   502 Google upstream rejected the refresh_token (revoked or expired)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
  GoogleTokenError,
  refreshAccessToken,
} from "../_lib/google-oauth.js";
import { getKv, refreshTokenKey } from "../_lib/kv.js";
import { verifySession } from "../_lib/session.js";

interface RefreshBody {
  sessionToken: unknown;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const body = req.body as RefreshBody;
  if (!body || typeof body.sessionToken !== "string" || !body.sessionToken) {
    res.status(400).json({ error: "bad_request", detail: "sessionToken required" });
    return;
  }

  // Verify the session token. Any error → 401, force re-auth.
  let sub: string;
  try {
    const payload = verifySession(body.sessionToken);
    sub = payload.sub;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(401).json({ error: "invalid_session", detail: msg });
    return;
  }

  // Fetch the stored refresh_token for this user.
  let refreshToken: string | null;
  try {
    refreshToken = await getKv().get<string>(refreshTokenKey(sub));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[refresh] KV read failed:", err);
    res.status(500).json({ error: "kv_read_failed", detail: msg });
    return;
  }
  if (!refreshToken) {
    // No record for this sub → user must re-auth interactively. This
    // happens after a revoke, after a manual KV clear, or if Google ever
    // invalidates the grant.
    res.status(404).json({ error: "no_refresh_token" });
    return;
  }

  // Trade the refresh_token for a fresh access_token at Google.
  try {
    const { accessToken, expiresIn } = await refreshAccessToken({
      refreshToken,
    });
    res.status(200).json({ access_token: accessToken, expires_in: expiresIn });
  } catch (err) {
    if (err instanceof GoogleTokenError) {
      // 4xx from Google here means the refresh_token has been revoked /
      // expired / consent withdrawn. Best move: delete the stored token
      // so the next refresh attempt fails fast with 404, and surface a
      // distinct error so the client can route to interactive re-auth.
      if (err.status >= 400 && err.status < 500) {
        try {
          await getKv().del(refreshTokenKey(sub));
        } catch {
          /* swallow — primary error is what matters */
        }
        res.status(401).json({
          error: "refresh_revoked",
          detail: err.message,
          upstream: err.body,
        });
        return;
      }
      res.status(502).json({
        error: "google_upstream",
        detail: err.message,
        upstream: err.body,
      });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[refresh] failed:", err);
    res.status(500).json({ error: "refresh_failed", detail: msg });
  }
}
