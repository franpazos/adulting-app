/**
 * Thin wrapper around the Upstash Redis client.
 *
 * Why: keeps env-var reading + client construction in one place so the
 * three /api/auth/* handlers can `import { getKv } from "../_lib/kv"`
 * without each repeating the boilerplate, and so tests can swap the
 * implementation by mocking this module.
 *
 * Vercel KV (Upstash marketplace integration) provisions these env vars
 * automatically when you connect a KV store to the project:
 *   KV_REST_API_URL       — Upstash REST endpoint
 *   KV_REST_API_TOKEN     — Upstash REST auth token
 *
 * If a future migration moves to native Upstash, the same handlers keep
 * working by switching to `UPSTASH_REDIS_REST_URL` / `_TOKEN` — that's
 * why we read both and prefer whichever exists.
 */

import { Redis } from "@upstash/redis";

let cached: Redis | null = null;

export function getKv(): Redis {
  if (cached) return cached;
  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "KV credentials missing. Expected KV_REST_API_URL + KV_REST_API_TOKEN " +
        "(or the equivalent UPSTASH_* vars) in the environment.",
    );
  }
  cached = new Redis({ url, token });
  return cached;
}

/** Key shape for the refresh-token store. Centralised so we don't typo. */
export function refreshTokenKey(sub: string): string {
  return `auth:refresh:${sub}`;
}

// Exposed for tests.
export const _internal = {
  resetCache: () => {
    cached = null;
  },
};
