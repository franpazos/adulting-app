/**
 * Verify a Google id_token (JWT) signed by accounts.google.com.
 *
 * Used by /api/auth/exchange to authenticate the user identity claimed by
 * the access-token grant: we trust Google's signature, not the client.
 *
 * Steps:
 *   1. Split the JWT into header.payload.signature.
 *   2. Read `kid` from the header.
 *   3. Fetch Google's JWKS, find the matching key by `kid`.
 *   4. Verify RS256 signature against `header.payload`.
 *   5. Verify claims: `iss` is accounts.google.com, `aud` matches our
 *      client_id, `exp` is in the future.
 *
 * JWKS is cached in module scope with a short TTL — Google rotates keys
 * but slowly, and serverless cold starts will re-fetch as needed.
 *
 * We use Node's `crypto.verify` for RS256 to avoid pulling in jose / jsonwebtoken.
 */

import { createPublicKey, verify as cryptoVerify } from "node:crypto";

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

interface JwksCache {
  fetchedAt: number;
  keys: Jwk[];
}

let jwksCache: JwksCache | null = null;

async function getJwks(force = false): Promise<Jwk[]> {
  if (
    !force &&
    jwksCache &&
    Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS
  ) {
    return jwksCache.keys;
  }
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: Jwk[] };
  jwksCache = { fetchedAt: Date.now(), keys: data.keys };
  return data.keys;
}

function b64urlDecode(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function jwkToPem(jwk: Jwk): ReturnType<typeof createPublicKey> {
  // Node's createPublicKey accepts JWK format directly since v15.
  return createPublicKey({ key: jwk as object, format: "jwk" });
}

export interface VerifiedIdToken {
  sub: string;
  email: string | null;
  aud: string;
  iss: string;
  exp: number;
}

export interface VerifyOptions {
  /** Expected `aud` claim (our OAuth client_id). */
  expectedAudience: string;
  /** Override for tests so we don't hit the network. */
  fetchJwks?: () => Promise<Jwk[]>;
  /** Override for tests so we can freeze clock-based `exp` checks. */
  now?: () => number;
}

const ALLOWED_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

export async function verifyGoogleIdToken(
  token: string,
  options: VerifyOptions,
): Promise<VerifiedIdToken> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("id_token: bad JWT shape");
  const [encHeader, encPayload, encSig] = parts as [string, string, string];

  // Parse header to find the key id.
  const header = JSON.parse(b64urlDecode(encHeader).toString("utf8")) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== "RS256") {
    throw new Error(`id_token: unsupported alg ${header.alg}`);
  }
  if (!header.kid) throw new Error("id_token: missing kid");

  const fetchJwks = options.fetchJwks ?? (() => getJwks(false));
  let keys = await fetchJwks();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk && !options.fetchJwks) {
    // Force a refresh in case Google rotated. (Skipped when test supplies a
    // custom fetchJwks since it's already deterministic.)
    keys = await getJwks(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error(`id_token: no matching JWK for kid ${header.kid}`);

  const signingInput = Buffer.from(`${encHeader}.${encPayload}`, "utf8");
  const signature = b64urlDecode(encSig);
  const pubKey = jwkToPem(jwk);
  const sigValid = cryptoVerify("RSA-SHA256", signingInput, pubKey, signature);
  if (!sigValid) throw new Error("id_token: signature verification failed");

  const payload = JSON.parse(b64urlDecode(encPayload).toString("utf8")) as {
    sub?: unknown;
    email?: unknown;
    aud?: unknown;
    iss?: unknown;
    exp?: unknown;
  };

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("id_token: missing sub");
  }
  if (typeof payload.aud !== "string" || payload.aud !== options.expectedAudience) {
    throw new Error("id_token: aud mismatch");
  }
  if (typeof payload.iss !== "string" || !ALLOWED_ISSUERS.has(payload.iss)) {
    throw new Error(`id_token: bad issuer ${String(payload.iss)}`);
  }
  if (typeof payload.exp !== "number") {
    throw new Error("id_token: missing exp");
  }
  const now = (options.now ?? Date.now)();
  if (payload.exp * 1000 < now) {
    throw new Error("id_token: expired");
  }

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    aud: payload.aud,
    iss: payload.iss,
    exp: payload.exp,
  };
}

// Exposed for tests so they can clear the cache between runs.
export const _internal = {
  resetJwksCache: () => {
    jwksCache = null;
  },
};
