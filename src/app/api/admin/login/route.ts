import { NextRequest, NextResponse } from "next/server";
import {
  getAdminSessionCookieName,
  getExpectedAdminSessionValue,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password?: string };
  const ok = await verifyAdminPassword(String(password || ""));
  if (!ok) {
    return NextResponse.json({ error: "密码不正确" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(getAdminSessionCookieName(), await getExpectedAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
