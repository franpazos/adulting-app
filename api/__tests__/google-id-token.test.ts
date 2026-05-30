/**
 * verifyGoogleIdToken: RS256 signature + claims verification.
 *
 * Generates an in-memory RSA keypair, hand-rolls a JWT signed with the
 * private key, and supplies the public key as a JWK via the
 * `fetchJwks` test override. No network is touched.
 */

import { describe, expect, it } from "vitest";
import { generateKeyPairSync, createSign, type KeyObject } from "node:crypto";

import { verifyGoogleIdToken } from "../_lib/google-id-token.js";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const KID = "test-key-1";

interface KeyPair {
  publicJwk: { kid: string; kty: string; n: string; e: string };
  privateKey: KeyObject;
}

function makeKeypair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: "jwk" }) as {
    kty: string;
    n: string;
    e: string;
  };
  return {
    publicJwk: { kid: KID, kty: jwk.kty, n: jwk.n, e: jwk.e },
    privateKey,
  };
}

function b64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

interface JwtClaims {
  sub: string;
  iss: string;
  aud: string;
  exp: number;
  email?: string;
}

function signJwt(claims: JwtClaims, privateKey: KeyObject, kid = KID): string {
  const header = { alg: "RS256", typ: "JWT", kid };
  const encHeader = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(claims));
  const signingInput = `${encHeader}.${encPayload}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKey);
  return `${signingInput}.${b64url(signature)}`;
}

describe("verifyGoogleIdToken", () => {
  it("accepts a well-signed token with valid claims", async () => {
    const kp = makeKeypair();
    const token = signJwt(
      {
        sub: "111222333",
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
        email: "fran@example.com",
      },
      kp.privateKey,
    );
    const verified = await verifyGoogleIdToken(token, {
      expectedAudience: CLIENT_ID,
      fetchJwks: async () => [kp.publicJwk],
    });
    expect(verified.sub).toBe("111222333");
    expect(verified.email).toBe("fran@example.com");
    expect(verified.aud).toBe(CLIENT_ID);
  });

  it("accepts the non-https issuer variant", async () => {
    const kp = makeKeypair();
    const token = signJwt(
      {
        sub: "x",
        iss: "accounts.google.com",
        aud: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      kp.privateKey,
    );
    const verified = await verifyGoogleIdToken(token, {
      expectedAudience: CLIENT_ID,
      fetchJwks: async () => [kp.publicJwk],
    });
    expect(verified.iss).toBe("accounts.google.com");
  });

  it("rejects bad audience", async () => {
    const kp = makeKeypair();
    const token = signJwt(
      {
        sub: "x",
        iss: "https://accounts.google.com",
        aud: "someone-else",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      kp.privateKey,
    );
    await expect(
      verifyGoogleIdToken(token, {
        expectedAudience: CLIENT_ID,
        fetchJwks: async () => [kp.publicJwk],
      }),
    ).rejects.toThrow(/aud mismatch/);
  });

  it("rejects bad issuer", async () => {
    const kp = makeKeypair();
    const token = signJwt(
      {
        sub: "x",
        iss: "https://evil.example.com",
        aud: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      kp.privateKey,
    );
    await expect(
      verifyGoogleIdToken(token, {
        expectedAudience: CLIENT_ID,
        fetchJwks: async () => [kp.publicJwk],
      }),
    ).rejects.toThrow(/issuer/);
  });

  it("rejects expired tokens", async () => {
    const kp = makeKeypair();
    const token = signJwt(
      {
        sub: "x",
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      kp.privateKey,
    );
    await expect(
      verifyGoogleIdToken(token, {
        expectedAudience: CLIENT_ID,
        fetchJwks: async () => [kp.publicJwk],
      }),
    ).rejects.toThrow(/expired/);
  });

  it("rejects signatures from a different key (signature verification fails)", async () => {
    const goodKp = makeKeypair();
    const evilKp = makeKeypair();
    // Token signed with EVIL key, but the published JWKS only has GOOD's public key.
    const token = signJwt(
      {
        sub: "x",
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      evilKp.privateKey,
      goodKp.publicJwk.kid, // claim it's signed with good kid
    );
    await expect(
      verifyGoogleIdToken(token, {
        expectedAudience: CLIENT_ID,
        fetchJwks: async () => [goodKp.publicJwk],
      }),
    ).rejects.toThrow(/signature/);
  });

  it("rejects tokens whose kid doesn't match any JWK", async () => {
    const kp = makeKeypair();
    const token = signJwt(
      {
        sub: "x",
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      kp.privateKey,
      "unknown-kid",
    );
    await expect(
      verifyGoogleIdToken(token, {
        expectedAudience: CLIENT_ID,
        fetchJwks: async () => [kp.publicJwk],
      }),
    ).rejects.toThrow(/no matching JWK/);
  });

  it("rejects non-RS256 algorithms", async () => {
    // Construct a fake HS256 JWT — we don't need a valid signature, the
    // alg check happens before verification.
    const header = b64url(JSON.stringify({ alg: "HS256", kid: "x" }));
    const payload = b64url(JSON.stringify({ sub: "x" }));
    const token = `${header}.${payload}.sig`;
    await expect(
      verifyGoogleIdToken(token, {
        expectedAudience: CLIENT_ID,
        fetchJwks: async () => [],
      }),
    ).rejects.toThrow(/unsupported alg/);
  });

  it("rejects malformed JWT shape", async () => {
    await expect(
      verifyGoogleIdToken("not.even.a.jwt", {
        expectedAudience: CLIENT_ID,
        fetchJwks: async () => [],
      }),
    ).rejects.toThrow(/bad JWT shape/);
  });
});
