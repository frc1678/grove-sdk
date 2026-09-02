// Framework-free helpers for apps that don't use React. The Grove contract
// is a plain JWT: any client that has one can call an app backend with it,
// and any frontend on the Grove's origin can read the session the Grove's
// sign-in page stored.

export type GroveClaims = {
  name?: string;
  email?: string;
  role?: string;
  effectiveRole?: string;
  status?: string;
  rosterEntryId?: string;
  rosterYear?: number;
  rosterRole?: string;
  subteam?: string;
  groups?: string[];
};

// Decode (not verify) the payload of a Grove JWT for display purposes.
// Verification is the backend's job.
export function decodeGroveClaims(token: string): GroveClaims & {
  sub: string;
  iss: string;
  exp: number;
} {
  const [, payload] = token.split(".");
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

export function groveSignInUrl(signInPath = "/sign-in", next?: string): string {
  const target =
    next ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `${signInPath}?next=${encodeURIComponent(target)}`;
}

// The keys @convex-dev/auth uses in localStorage, namespaced by the Grove
// deployment URL. Handy for non-React frontends on the Grove's origin that
// want the current token without the React provider.
export function groveTokenFromStorage(groveUrl: string): string | null {
  const namespace = groveUrl.replace(/[^a-zA-Z0-9]/g, "");
  try {
    return window.localStorage.getItem(`__convexAuthJWT_${namespace}`);
  } catch {
    return null;
  }
}
