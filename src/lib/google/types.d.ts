/**
 * Minimal type definitions for the Google Identity Services token client API.
 * Loaded globally via `<script src="https://accounts.google.com/gsi/client">`
 * in `index.html`. We only declare what we actually call.
 */

interface GoogleTokenClient {
  requestAccessToken(opts?: {
    /** "consent" forces a prompt even if user already granted; "" requests silently. */
    prompt?: "" | "consent" | "select_account";
    hint?: string;
  }): void;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  scope: string;
  token_type: "Bearer";
  /** Present when the user dismissed the popup or denied access. */
  error?: string;
  error_description?: string;
}

interface GoogleAccounts {
  oauth2: {
    initTokenClient(config: {
      client_id: string;
      scope: string;
      prompt?: string;
      callback: (resp: GoogleTokenResponse) => void;
      error_callback?: (err: { type: string; message?: string }) => void;
    }): GoogleTokenClient;
    revoke(token: string, done?: () => void): void;
  };
}

declare global {
  interface Window {
    google?: {
      accounts: GoogleAccounts;
    };
  }
}

export {};
