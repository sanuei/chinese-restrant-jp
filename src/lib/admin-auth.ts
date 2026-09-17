import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export const ADMIN_EMAIL = "sanuei.yann@gmail.com";

export function isAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === ADMIN_EMAIL;
}

/**
 * Browser requests use the Google session. ADMIN_SECRET remains available only
 * for trusted server-side maintenance scripts that cannot complete OAuth.
 */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;

  const session = await auth();
  return isAdminEmail(session?.user?.email);
}
