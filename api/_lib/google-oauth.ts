/**
 * Server-side helpers for the Google OAuth 2.0 authorization-code flow.
 *
 * Two operations are needed by /api/auth/{exchange,refresh}:
 *   - `exchangeCode`: trade an auth code + PKCE verifier for the first
 *     set of tokens. Returns { access_token, refresh_token, id_token,
 *     expires_in }.
 *   - `refreshAccessToken`: trade a refresh_token for a new access_token.
 *     Returns { access_token, expires_in }. (Google does NOT return a new
 *     refresh_token on refresh.)
 *
 * Both endpoints live at https://oauth2.googleapis.com/token and accept
 * application/x-www-form-urlencoded bodies.
 *
 * Centralised here so the handlers stay small and so tests can mock one
 * fetch boundary instead of two HTTP shapes per handler.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export interface OauthEnv {
  clientId: string;
  clientSecret: string;
}

function readEnv(): OauthEnv {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is missing from the server env");
  }
  if (!clientSecret) {
    throw new Error("GOOGLE_CLIENT_SECRET is missing from the server env");
  }
  return { clientId, clientSecret };
}

export class GoogleTokenError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "GoogleTokenError";
    this.status = status;
    this.body = body;
  }
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
  token_type: string;
}

async function postToken(
  body: Record<string, string>,
): Promise<TokenResponse> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  let parsed: unknown = null;
  try {
    parsed = await r.json();
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    throw new GoogleTokenError(
      `Google token endpoint returned ${r.status}`,
      r.status,
      parsed,
    );
  }
  return parsed as TokenResponse;
}

export interface ExchangeCodeArgs {
  code: string;
  redirectUri: string;
  /**
   * Optional PKCE verifier. Required by spec for public clients, but our
   * server holds the client_secret (confidential-client pattern) so we
   * can omit it. Left in the type so a future flow with manual PKCE can
   * pass it through.
   */
  codeVerifier?: string;
  env?: OauthEnv;
}

export async function exchangeCode(args: ExchangeCodeArgs): Promise<{
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}> {
  const env = args.env ?? readEnv();
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: env.clientId,
    client_secret: env.clientSecret,
  };
  if (args.codeVerifier) body.code_verifier = args.codeVerifier;
  const res = await postToken(body);
  if (!res.refresh_token) {
    throw new GoogleTokenError(
      "Google did not return a refresh_token. The OAuth client must use " +
        "an authorization-code grant with offline access. Verify the " +
        "consent prompt was shown (prompt=consent + access_type=offline).",
      500,
      res,
    );
  }
  if (!res.id_token) {
    throw new GoogleTokenError("Google did not return an id_token.", 500, res);
  }
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    idToken: res.id_token,
    expiresIn: res.expires_in,
  };
}

export interface RefreshArgs {
  refreshToken: string;
  env?: OauthEnv;
}

export async function refreshAccessToken(args: RefreshArgs): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const env = args.env ?? readEnv();
  const res = await postToken({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
    client_id: env.clientId,
    client_secret: env.clientSecret,
  });
  return { accessToken: res.access_token, expiresIn: res.expires_in };
}

/** Revoke a refresh token at Google. Best-effort: callers should ignore errors. */
export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
}

// Exported for tests so we can inject env without process.env mutation.
export const _internal = { readEnv };
