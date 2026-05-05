const COOKIE_NAME = "gachi_admin_session";

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET || "";
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function getAdminSessionCookieName(): string {
  return COOKIE_NAME;
}

export async function getExpectedAdminSessionValue(): Promise<string> {
  const password = getAdminPassword();
  const secret = process.env.ADMIN_SECRET || "gachi-admin";
  return sha256Hex(`gachi-admin:${password}:${secret}`);
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const expected = getAdminPassword();
  return Boolean(expected) && password === expected;
}
