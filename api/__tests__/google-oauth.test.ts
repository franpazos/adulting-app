/**
 * Tests for the Google OAuth helpers. Mocks `global.fetch` per test.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const {
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  GoogleTokenError,
} = await import("../_lib/google-oauth.js");

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

describe("exchangeCode", () => {
  it("posts the expected form body and returns the parsed token bundle", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonOk({
        access_token: "AT",
        refresh_token: "RT",
        id_token: "ID",
        expires_in: 3599,
        scope: "x",
        token_type: "Bearer",
      }),
    );

    const result = await exchangeCode({
      code: "code-x",
      codeVerifier: "verifier-x",
      redirectUri: "postmessage",
    });
    expect(result).toEqual({
      accessToken: "AT",
      refreshToken: "RT",
      idToken: "ID",
      expiresIn: 3599,
    });

    const [, init] = fetchSpy.mock.calls[0]!;
    const params = new URLSearchParams(init!.body as string);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("code-x");
    expect(params.get("code_verifier")).toBe("verifier-x");
    expect(params.get("redirect_uri")).toBe("postmessage");
    expect(params.get("client_id")).toBe(
      "test-client.apps.googleusercontent.com",
    );
    expect(params.get("client_secret")).toBe("test-client-secret");
  });

  it("throws GoogleTokenError on 400 from Google", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonErr(400, { error: "invalid_grant" }),
    );
    await expect(
      exchangeCode({ code: "c", codeVerifier: "v", redirectUri: "r" }),
    ).rejects.toBeInstanceOf(GoogleTokenError);
  });

  it("throws if Google omits the refresh_token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonOk({
        access_token: "AT",
        id_token: "ID",
        expires_in: 3599,
        scope: "x",
        token_type: "Bearer",
      }),
    );
    await expect(
      exchangeCode({ code: "c", codeVerifier: "v", redirectUri: "r" }),
    ).rejects.toThrow(/refresh_token/);
  });

  it("throws if Google omits the id_token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonOk({
        access_token: "AT",
        refresh_token: "RT",
        expires_in: 3599,
        scope: "x",
        token_type: "Bearer",
      }),
    );
    await expect(
      exchangeCode({ code: "c", codeVerifier: "v", redirectUri: "r" }),
    ).rejects.toThrow(/id_token/);
  });
});

describe("refreshAccessToken", () => {
  it("posts the expected body and returns access_token + expires_in", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonOk({
        access_token: "NEW_AT",
        expires_in: 3599,
        scope: "x",
        token_type: "Bearer",
      }),
    );

    const result = await refreshAccessToken({ refreshToken: "RT" });
    expect(result).toEqual({ accessToken: "NEW_AT", expiresIn: 3599 });

    const [, init] = fetchSpy.mock.calls[0]!;
    const params = new URLSearchParams(init!.body as string);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("RT");
    expect(params.get("client_id")).toBe(
      "test-client.apps.googleusercontent.com",
    );
    expect(params.get("client_secret")).toBe("test-client-secret");
  });

  it("throws GoogleTokenError when the token is revoked (400)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonErr(400, { error: "invalid_grant" }),
    );
    await expect(
      refreshAccessToken({ refreshToken: "RT" }),
    ).rejects.toBeInstanceOf(GoogleTokenError);
  });
});

describe("revokeToken", () => {
  it("posts to the revoke endpoint with the token body", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await revokeToken("RT");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    expect(init?.method).toBe("POST");
    const params = new URLSearchParams(init!.body as string);
    expect(params.get("token")).toBe("RT");
  });

  it("does not throw if Google returns an error (best-effort)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("oops", { status: 400 }),
    );
    // No await rejects — function should resolve.
    await expect(revokeToken("RT")).resolves.toBeUndefined();
  });
});
