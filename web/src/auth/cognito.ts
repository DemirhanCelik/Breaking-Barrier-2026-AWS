/**
 * Minimal Amazon Cognito client for the SPA (no Amplify dependency).
 *
 * Signs in with USER_PASSWORD_AUTH against the user pool's public app client
 * (no secret), keeps the ID token for API calls (design §11: Bearer JWT), and
 * refreshes it with the refresh token before it expires.
 *
 * Tokens live in localStorage so a reload keeps the session. That is the usual
 * SPA trade-off; the ID token is short-lived (1h) and the API re-verifies it.
 */

const REGION = import.meta.env.VITE_COGNITO_REGION || 'us-east-1';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
const ENDPOINT = `https://cognito-idp.${REGION}.amazonaws.com/`;
const STORE_KEY = 'codeai-cognito-session';
const REFRESH_SKEW_MS = 2 * 60 * 1000;

interface StoredSession {
  idToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

interface AuthResult {
  IdToken: string;
  RefreshToken?: string;
  ExpiresIn: number;
}

export class CognitoAuthError extends Error {}

function load(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function save(s: StoredSession | null) {
  try {
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    // Storage unavailable (private mode): session lasts for this page only.
  }
  memory = s;
}

let memory: StoredSession | null = load();
let refreshing: Promise<string | null> | null = null;

async function call<T>(target: string, body: unknown): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    __type?: string;
  } & T;
  if (!res.ok) {
    const type = (data.__type || '').split('#').pop();
    const message =
      type === 'NotAuthorizedException' || type === 'UserNotFoundException'
        ? 'Incorrect email or password.'
        : data.message || 'Sign-in failed.';
    throw new CognitoAuthError(message);
  }
  return data;
}

export const cognitoConfigured = Boolean(CLIENT_ID);

export async function signIn(email: string, password: string): Promise<void> {
  if (!CLIENT_ID) throw new CognitoAuthError('Cognito is not configured (VITE_COGNITO_CLIENT_ID).');
  const data = await call<{
    AuthenticationResult?: AuthResult;
    ChallengeName?: string;
  }>('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email.trim(), PASSWORD: password },
  });
  const r = data.AuthenticationResult;
  if (!r) {
    // e.g. NEW_PASSWORD_REQUIRED or MFA: accounts are admin-provisioned with a
    // permanent password and no MFA, so this means the account needs an admin.
    throw new CognitoAuthError(
      `This account needs an administrator to finish setup (${data.ChallengeName ?? 'challenge'}).`,
    );
  }
  save({
    idToken: r.IdToken,
    refreshToken: r.RefreshToken ?? '',
    expiresAt: Date.now() + r.ExpiresIn * 1000,
  });
}

async function refresh(s: StoredSession): Promise<string | null> {
  try {
    const data = await call<{ AuthenticationResult?: AuthResult }>('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { REFRESH_TOKEN: s.refreshToken },
    });
    const r = data.AuthenticationResult;
    if (!r) throw new CognitoAuthError('Refresh failed');
    save({
      idToken: r.IdToken,
      refreshToken: s.refreshToken,
      expiresAt: Date.now() + r.ExpiresIn * 1000,
    });
    return r.IdToken;
  } catch {
    save(null);
    return null;
  }
}

/** Current ID token, refreshed if it is about to expire; null when signed out. */
export async function getIdToken(): Promise<string | null> {
  const s = memory;
  if (!s) return null;
  if (s.expiresAt - REFRESH_SKEW_MS > Date.now()) return s.idToken;
  if (!s.refreshToken) {
    save(null);
    return null;
  }
  refreshing ??= refresh(s).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export function signOut() {
  save(null);
}
