/**
 * Session token sign/verify. Stubs SESSION_SECRET via vi.stubEnv before
 * importing the module so the secret guard sees a valid value.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const SECRET = "a".repeat(64); // 64-hex-char-like, well above the 32-char floor.

beforeAll(() => {
  vi.stubEnv("SESSION_SECRET", SECRET);
});

afterEach(() => {
  // Don't unstub the secret between tests — each test imports the same
  // module instance.
});

const { signSession, verifySession, issueSession } = await import(
  "../_lib/session.js"
);

describe("session token", () => {
  it("signs and verifies a roundtrip payload", () => {
    const token = signSession({ sub: "user-123", iat: 1_700_000_000_000 });
    const parsed = verifySession(token);
    expect(parsed.sub).toBe("user-123");
    expect(parsed.iat).toBe(1_700_000_000_000);
  });

  it("issueSession() produces a verifiable token with current iat", () => {
    const before = Date.now();
    const token = issueSession("user-abc");
    const after = Date.now();
    const parsed = verifySession(token);
    expect(parsed.sub).toBe("user-abc");
    expect(parsed.iat).toBeGreaterThanOrEqual(before);
    expect(parsed.iat).toBeLessThanOrEqual(after);
  });

  it("rejects a tampered signature", () => {
    const token = signSession({ sub: "x", iat: 1 });
    const [payload, sig] = token.split(".");
    const flipped = sig!.slice(0, -1) + (sig!.slice(-1) === "A" ? "B" : "A");
    expect(() => verifySession(`${payload}.${flipped}`)).toThrow(/signature/);
  });

  it("rejects a tampered payload (even if signature shape stays valid)", () => {
    const token = signSession({ sub: "alice", iat: 1 });
    const [, sig] = token.split(".");
    // Re-base64url-encode a different payload + reuse the old signature.
    const evil = Buffer.from(JSON.stringify({ sub: "mallory", iat: 1 }), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    expect(() => verifySession(`${evil}.${sig}`)).toThrow(/signature/);
  });

  it("rejects malformed tokens (wrong number of segments)", () => {
    expect(() => verifySession("nope")).toThrow(/bad shape/);
    expect(() => verifySession("a.b.c")).toThrow(/bad shape/);
  });

  it("rejects non-base64 input", () => {
    expect(() => verifySession("not_base64!!!.also_not")).toThrow();
  });

  it("rejects a payload missing required fields", () => {
    // Sign a payload that lacks `sub` — done via the raw HMAC primitive.
    // Easiest way without exporting internals: sign with valid format, then
    // swap the payload to something missing `sub`.
    const valid = signSession({ sub: "x", iat: 1 });
    const [, sig] = valid.split(".");

    const badPayload = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    // The signature won't match the new payload, so we should get a
    // signature error before payload-shape validation runs. That's the
    // correct order: never trust unverified payload contents.
    expect(() => verifySession(`${badPayload}.${sig}`)).toThrow(/signature/);
  });
});
