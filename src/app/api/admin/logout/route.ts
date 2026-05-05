import { NextResponse } from "next/server";
import { getAdminSessionCookieName } from "@/lib/admin-auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(getAdminSessionCookieName());
  return response;
}
