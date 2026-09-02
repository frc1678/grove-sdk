import { requireEnv } from "./env";

// Google API access for a service account, signed with Web Crypto in the
// default Convex runtime (no "use node"). The service account JSON lives in
// the app deployment's GOOGLE_SERVICE_ACCOUNT_JSON env var; pass `subject`
// to impersonate a Workspace user when the account has domain-wide
// delegation. Copied from grove/convex/sync.ts so every app signs the same
// way.
export async function googleAccessToken(
  scopes: string[],
  subject?: string,
): Promise<string> {
  const raw = requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
  let serviceAccount: { client_email: string; private_key: string };
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = base64UrlEncode(
    encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
  );
  const claims: Record<string, unknown> = {
    iss: serviceAccount.client_email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  if (subject !== undefined) {
    claims.sub = subject;
  }
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(serviceAccount.private_key).buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(`${header}.${payload}`),
  );
  const jwt = `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    )}&assertion=${jwt}`,
  });
  const data = (await response.json()) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!response.ok || data.access_token === undefined) {
    throw new Error(
      `Google auth failed: ${data.error_description ?? data.error ?? response.status}`,
    );
  }
  return data.access_token;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
