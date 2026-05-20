export interface AuthenticatedUser {
  userId: string;
  userDetails: string;
  identityProvider: string;
  userRoles: string[];
}

interface StaticWebAppsPrincipal {
  userId?: unknown;
  userDetails?: unknown;
  identityProvider?: unknown;
  userRoles?: unknown;
}

interface StaticWebAppsAuthResponse {
  clientPrincipal?: StaticWebAppsPrincipal | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readResponsePayload(payload: unknown): StaticWebAppsPrincipal | null | undefined {
  if (Array.isArray(payload)) {
    return payload[0] as StaticWebAppsPrincipal | undefined;
  }

  if (isObject(payload) && 'clientPrincipal' in payload) {
    const withPrincipal = payload as StaticWebAppsAuthResponse;
    return withPrincipal.clientPrincipal;
  }

  return undefined;
}

function parseUser(principal: StaticWebAppsPrincipal | null | undefined): AuthenticatedUser | null {
  if (!principal) {
    return null;
  }

  const userId = typeof principal.userId === 'string' ? principal.userId : '';
  const userDetails = typeof principal.userDetails === 'string' ? principal.userDetails : '';
  const identityProvider = typeof principal.identityProvider === 'string' ? principal.identityProvider : '';
  const userRoles = Array.isArray(principal.userRoles)
    ? principal.userRoles.filter((role): role is string => typeof role === 'string')
    : [];

  if (!userId || !userDetails) {
    return null;
  }

  return {
    userId,
    userDetails,
    identityProvider,
    userRoles
  };
}

export async function fetchAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  try {
    const response = await fetch('/.auth/me', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as unknown;
    return parseUser(readResponsePayload(payload));
  } catch {
    return null;
  }
}

export function buildGitHubLoginUrl(redirectPath: string): string {
  const baseUrl = new URL('/.auth/login/github', window.location.origin);
  const redirectUrl = new URL(redirectPath, window.location.origin);
  baseUrl.searchParams.set('post_login_redirect_uri', redirectUrl.toString());
  return baseUrl.toString();
}

export function buildLogoutUrl(redirectPath: string = '/'): string {
  const baseUrl = new URL('/.auth/logout', window.location.origin);
  const redirectUrl = new URL(redirectPath, window.location.origin);
  baseUrl.searchParams.set('post_logout_redirect_uri', redirectUrl.toString());
  return baseUrl.toString();
}
