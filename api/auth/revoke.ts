/**
 * POST /api/auth/revoke
 *
 * Called on explicit logout (Settings → "Disconnect Google"). Reads the
 * sessionToken, looks up the stored refresh_token, tells Google to
 * revoke it, then deletes the KV entry. All steps are best-effort: even
 * if Google's revoke call fails, we still drop the local record so the
 * user doesn't end up "stuck" connected on our side.
 *
 * Request body (JSON): { sessionToken: string }
 * Success: 200 { ok: true }
 * Errors: 400 bad shape, 401 invalid session
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

import { revokeToken } from "../_lib/google-oauth.js";
import { getKv, refreshTokenKey } from "../_lib/kv.js";
import { verifySession } from "../_lib/session.js";

interface RevokeBody {
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

  const body = req.body as RevokeBody;
  if (!body || typeof body.sessionToken !== "string" || !body.sessionToken) {
    res.status(400).json({ error: "bad_request", detail: "sessionToken required" });
    return;
  }

  let sub: string;
  try {
    sub = verifySession(body.sessionToken).sub;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(401).json({ error: "invalid_session", detail: msg });
    return;
  }

  const kv = getKv();
  const key = refreshTokenKey(sub);

  // Best-effort revoke at Google. Don't bail on failure — proceed to
  // wipe local record regardless.
  try {
    const refreshToken = await kv.get<string>(key);
    if (refreshToken) {
      await revokeToken(refreshToken);
    }
  } catch (err) {
    console.warn("[revoke] Google revoke step failed, proceeding to drop KV:", err);
  }

  try {
    await kv.del(key);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[revoke] KV del failed:", err);
    res.status(500).json({ error: "kv_del_failed", detail: msg });
    return;
  }

  res.status(200).json({ ok: true });
}
