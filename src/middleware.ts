import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionCookieName, getExpectedAdminSessionValue } from "@/lib/admin-auth";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const session = req.cookies.get(getAdminSessionCookieName())?.value;
    const expected = await getExpectedAdminSessionValue();
    if (!session || session !== expected) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: [
    "/admin/:path*",
    // 匹配所有前台路径，排除 API、静态文件、_next
    "/((?!api|_next|_vercel|admin|.*\\..*).*)",
  ],
};
