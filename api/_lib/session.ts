/**
 * Opaque session tokens — HMAC-signed identifiers used by the client to
 * authenticate against `/api/auth/refresh` and `/api/auth/revoke`.
 *
 * Token format: `<base64url(payloadJson)>.<base64url(hmacSha256(payloadJson))>`
 *
 *   payloadJson = JSON.stringify({ sub, iat })
 *
 *     - `sub`: Google's stable user id (from a verified id_token at exchange).
 *     - `iat`: issued-at, milliseconds since epoch. Used to detect tokens
 *       issued before a SESSION_SECRET rotation (any pre-rotation token
 *       fails HMAC verification anyway, so `iat` is informational today;
 *       reserved for future absolute expiry if we ever want one).
 *
 * Why opaque + HMAC, not JWT:
 *   - Zero dependencies. Node's built-in `crypto` covers HMAC-SHA256
 *     and `timingSafeEqual` for constant-time comparison.
 *   - We don't need third-party verification — only our own server reads
 *     these. Standard JWT semantics (exp, nbf, alg negotiation) buy us
 *     nothing here and add surface area for downgrade-style mistakes.
 *
 * Rotating `SESSION_SECRET` invalidates every issued token, forcing the
 * affected users to re-auth interactively once. That's intentional —
 * secret rotation should be a "log everyone out" event.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  sub: string;
  iat: number;
}

/**
 * Read SESSION_SECRET lazily on every call, NOT at module load. This
 * lets tests (and any future config-reload flow) set the env after the
 * module is imported.
 */
function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET env var is missing or too short (>=32 chars required). " +
        "Add it to Vercel env vars and to .env.local for dev.",
    );
  }
  return secret;
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

function hmac(payloadJson: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payloadJson).digest();
}

/** Sign a payload into a session token string. */
export function signSession(payload: SessionPayload): string {
  const secret = requireSecret();
  const json = JSON.stringify(payload);
  const sig = hmac(json, secret);
  return `${b64urlEncode(json)}.${b64urlEncode(sig)}`;
}

/**
 * Verify a session token. Returns the payload on success, throws on any
 * tampering / malformed input. Constant-time HMAC comparison.
 */
export function verifySession(token: string): SessionPayload {
  const secret = requireSecret();
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("session token: bad shape");
  }
  const [encodedPayload, encodedSig] = parts as [string, string];

  let payloadJson: string;
  let providedSig: Buffer;
  try {
    payloadJson = b64urlDecode(encodedPayload).toString("utf8");
    providedSig = b64urlDecode(encodedSig);
  } catch {
    throw new Error("session token: base64 decode failed");
  }

  const expectedSig = hmac(payloadJson, secret);
  if (
    providedSig.length !== expectedSig.length ||
    !timingSafeEqual(providedSig, expectedSig)
  ) {
    throw new Error("session token: invalid signature");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    throw new Error("session token: payload not JSON");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { sub?: unknown }).sub !== "string" ||
    typeof (parsed as { iat?: unknown }).iat !== "number"
  ) {
    throw new Error("session token: payload shape invalid");
  }
  return parsed as SessionPayload;
}

/** Convenience: create a fresh session token for `sub` with current iat. */
export function issueSession(sub: string): string {
  return signSession({ sub, iat: Date.now() });
}
