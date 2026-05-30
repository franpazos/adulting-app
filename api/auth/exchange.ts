/**
 * POST /api/auth/exchange
 *
 * First leg of the new OAuth flow. Called once per user (and again only
 * when their refresh_token gets revoked). The client supplies an auth
 * code obtained from `google.accounts.oauth2.initCodeClient` plus the
 * PKCE verifier; this handler trades that for {access_token,
 * refresh_token, id_token} at Google, persists the refresh_token in KV
 * keyed by Google's stable `sub`, and returns to the client:
 *
 *   { access_token, expires_in, sessionToken, email }
 *
 * The sessionToken is the long-lived opaque credential the client uses
 * for /api/auth/refresh. The refresh_token never leaves the server.
 *
 * Request body (JSON): { code: string; code_verifier: string; redirect_uri: string }
 * Success: 200 { access_token, expires_in, sessionToken, email }
 * Errors: 400 bad shape, 401 google rejected, 500 misconfig / verify failure
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
  exchangeCode,
  GoogleTokenError,
} from "../_lib/google-oauth.js";
import { verifyGoogleIdToken } from "../_lib/google-id-token.js";
import { getKv, refreshTokenKey } from "../_lib/kv.js";
import { issueSession } from "../_lib/session.js";

interface ExchangeBody {
  code: unknown;
  redirect_uri: unknown;
  /** Optional — only set if the client did manual PKCE. */
  code_verifier?: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
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

  const body = req.body as ExchangeBody;
  if (
    !body ||
    !isString(body.code) ||
    !isString(body.redirect_uri)
  ) {
    res.status(400).json({
      error: "bad_request",
      detail: "Required fields: code, redirect_uri (strings). code_verifier optional.",
    });
    return;
  }

  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "server_misconfigured", detail: "client id missing" });
    return;
  }

  try {
    const { accessToken, refreshToken, idToken, expiresIn } = await exchangeCode({
      code: body.code,
      redirectUri: body.redirect_uri,
      codeVerifier: isString(body.code_verifier) ? body.code_verifier : undefined,
    });

    // Confirm the user identity Google claims via the id_token signature.
    const verified = await verifyGoogleIdToken(idToken, {
      expectedAudience: clientId,
    });

    // Persist refresh_token under the verified sub. SET overwrites — the
    // user re-consenting is a legitimate way to rotate their refresh_token.
    await getKv().set(refreshTokenKey(verified.sub), refreshToken);

    const sessionToken = issueSession(verified.sub);

    res.status(200).json({
      access_token: accessToken,
      expires_in: expiresIn,
      sessionToken,
      email: verified.email,
    });
  } catch (err) {
    if (err instanceof GoogleTokenError) {
      // 4xx from Google = the client sent us a bad/expired code. Bubble that.
      const status = err.status >= 400 && err.status < 500 ? 401 : 502;
      res.status(status).json({
        error: "google_rejected",
        detail: err.message,
        upstream: err.body,
      });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[exchange] failed:", err);
    res.status(500).json({ error: "exchange_failed", detail: msg });
  }
}
