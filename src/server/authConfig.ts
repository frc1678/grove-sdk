// convex/auth.config.ts for a Grove app:
//
//   import { groveAuthConfig } from "@frc1678/grove-sdk/server";
//   export default groveAuthConfig();
//
// The Grove signs its JWTs with its own key and publishes the public half
// at <GROVE_SITE_URL>/.well-known/jwks.json. Trusting that issuer is all an
// app deployment needs to accept Grove sign-ins; ctx.auth.getUserIdentity()
// then carries the Grove's claims (identity.ts).
//
// This must be Convex's `customJwt` provider form: the OpenID form validates
// the token but surfaces only the standard subject/issuer, dropping the
// Grove's role and roster claims. customJwt selects the JWKS key by `kid`,
// which the Grove sets on both its tokens and its JWKS.
//
// GROVE_SITE_URL may list several issuers separated by commas — for example
// a developer's Grove dev deployment alongside production — and each becomes
// a provider.

export type GroveAuthProvider = {
  type: "customJwt";
  issuer: string;
  jwks: string;
  algorithm: "RS256";
  applicationID: string;
};

export function groveAuthConfig(options: { siteUrls?: string } = {}): {
  providers: GroveAuthProvider[];
} {
  const raw = options.siteUrls ?? process.env.GROVE_SITE_URL ?? "";
  const issuers = raw
    .split(",")
    .map((value: string) => value.trim().replace(/\/$/, ""))
    .filter((value: string) => value !== "");
  if (issuers.length === 0) {
    throw new Error(
      "GROVE_SITE_URL is not set — the Grove's .convex.site URL this app trusts for sign-in (bunx convex env set GROVE_SITE_URL=https://….convex.site)",
    );
  }
  return {
    providers: issuers.map((issuer: string) => ({
      type: "customJwt",
      issuer,
      jwks: `${issuer}/.well-known/jwks.json`,
      algorithm: "RS256",
      // Convex Auth sets aud to "convex" on every token it issues.
      applicationID: "convex",
    })),
  };
}
