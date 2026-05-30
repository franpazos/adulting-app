/**
 * End-to-end tests of the three auth handlers using:
 *   - Mocked Google API (via global fetch spy).
 *   - Mocked KV (an in-memory Map injected via vi.mock).
 *   - Mocked Google ID token verifier (so we don't need a real RS256 keypair).
 *   - Mocked Vercel request/response shape.
 *
 * Each handler is treated as a black box: feed input, assert output.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Env setup must happen before module imports.
beforeAll(() => {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("SESSION_SECRET", "s".repeat(64));
  vi.stubEnv("KV_REST_API_URL", "https://kv.example.com");
  vi.stubEnv("KV_REST_API_TOKEN", "test-kv-token");
});

// Module-level KV store: a real Map standing in for Upstash Redis.
const kvStore = new Map<string, string>();
vi.mock("../_lib/kv.js", () => {
  return {
    refreshTokenKey: (sub: string) => `auth:refresh:${sub}`,
    getKv: () => ({
      get: async <T>(key: string): Promise<T | null> =>
        (kvStore.get(key) as T | undefined) ?? null,
      set: async (key: string, value: string) => {
        kvStore.set(key, value);
      },
      del: async (key: string) => {
        kvStore.delete(key);
      },
    }),
    _internal: { resetCache: () => {} },
  };
});

// Stub the ID token verifier so we don't need real keypairs in handler tests.
vi.mock("../_lib/google-id-token.js", () => {
  return {
    verifyGoogleIdToken: vi.fn(async (token: string) => {
      if (token === "BAD") throw new Error("id_token: signature verification failed");
      return {
        sub: "google-sub-123",
        email: "fran@example.com",
        aud: "test-client.apps.googleusercontent.com",
        iss: "https://accounts.google.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
    }),
    _internal: { resetJwksCache: () => {} },
  };
});

// Now safe to import the handlers + helpers.
const { default: exchangeHandler } = await import("../auth/exchange.js");
const { default: refreshHandler } = await import("../auth/refresh.js");
const { default: revokeHandler } = await import("../auth/revoke.js");
const { issueSession } = await import("../_lib/session.js");

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  status: (n: number) => FakeRes;
  json: (b: unknown) => FakeRes;
  setHeader: (k: string, v: string) => FakeRes;
}

function makeReq(method: string, body: unknown): {
  method: string;
  body: unknown;
} {
  return { method, body };
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    headers: {},
    body: null,
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
  };
  return res;
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonErr(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: "Error",
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  kvStore.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── /api/auth/exchange ────────────────────────────────────────────────

describe("POST /api/auth/exchange", () => {
  it("happy path: exchanges code, stores refresh_token, returns access + session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonOk({
        access_token: "AT",
        refresh_token: "RT",
        id_token: "ID",
        expires_in: 3599,
        scope: "x",
        token_type: "Bearer",
      }),
    );

    const req = makeReq("POST", {
      code: "code-x",
      code_verifier: "verifier-x",
      redirect_uri: "postmessage",
    });
    const res = makeRes();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await exchangeHandler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      access_token: string;
      expires_in: number;
      sessionToken: string;
      email: string | null;
    };
    expect(body.access_token).toBe("AT");
    expect(body.expires_in).toBe(3599);
    expect(body.email).toBe("fran@example.com");
    expect(body.sessionToken).toMatch(/.+\..+/);

    expect(kvStore.get("auth:refresh:google-sub-123")).toBe("RT");
  });

  it("rejects non-POST methods with 405", async () => {
    const req = makeReq("GET", null);
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await exchangeHandler(req as any, res as any);
    expect(res.statusCode).toBe(405);
    expect(res.headers["Allow"]).toBe("POST");
  });

  it("400s on missing fields", async () => {
    const req = makeReq("POST", { code: "x" });
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await exchangeHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it("401s when Google rejects the code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonErr(400, { error: "invalid_grant" }),
    );

    const req = makeReq("POST", {
      code: "bad",
      code_verifier: "v",
      redirect_uri: "postmessage",
    });
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await exchangeHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("google_rejected");
  });
});

// ─── /api/auth/refresh ─────────────────────────────────────────────────

describe("POST /api/auth/refresh", () => {
  it("happy path: returns new access_token from stored refresh_token", async () => {
    kvStore.set("auth:refresh:google-sub-123", "RT");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonOk({
        access_token: "AT2",
        expires_in: 3599,
        scope: "x",
        token_type: "Bearer",
      }),
    );

    const sessionToken = issueSession("google-sub-123");
    const req = makeReq("POST", { sessionToken });
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await refreshHandler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ access_token: "AT2", expires_in: 3599 });
  });

  it("401 on tampered sessionToken", async () => {
    const req = makeReq("POST", { sessionToken: "not.real" });
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await refreshHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("invalid_session");
  });

  it("404 when no refresh_token is stored for this user", async () => {
    const sessionToken = issueSession("unknown-sub");
    const req = makeReq("POST", { sessionToken });
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await refreshHandler(req as any, res as any);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toBe("no_refresh_token");
  });

  it("401 + drops the stored token when Google says the refresh_token is revoked", async () => {
    kvStore.set("auth:refresh:google-sub-123", "RT");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonErr(400, { error: "invalid_grant" }),
    );

    const sessionToken = issueSession("google-sub-123");
    const req = makeReq("POST", { sessionToken });
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await refreshHandler(req as any, res as any);

    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("refresh_revoked");
    expect(kvStore.has("auth:refresh:google-sub-123")).toBe(false);
  });
});

// ─── /api/auth/revoke ──────────────────────────────────────────────────

describe("POST /api/auth/revoke", () => {
  it("revokes at Google and deletes from KV", async () => {
    kvStore.set("auth:refresh:google-sub-123", "RT");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const sessionToken = issueSession("google-sub-123");
    const req = makeReq("POST", { sessionToken });
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await revokeHandler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(kvStore.has("auth:refresh:google-sub-123")).toBe(false);
    // Verify revoke was POSTed with the right token.
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    const params = new URLSearchParams(init!.body as string);
    expect(params.get("token")).toBe("RT");
  });

  it("still deletes KV even if Google revoke fails", async () => {
    kvStore.set("auth:refresh:google-sub-123", "RT");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network down"));

    const sessionToken = issueSession("google-sub-123");
    const req = makeReq("POST", { sessionToken });
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await revokeHandler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(kvStore.has("auth:refresh:google-sub-123")).toBe(false);
  });

  it("401 on invalid session", async () => {
    const req = makeReq("POST", { sessionToken: "nope" });
    const res = makeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await revokeHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });
});
