import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-admin-pathname", pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: [
    "/admin/:path*",
    // 匹配所有前台路径，排除 API、静态文件、_next，以及没有扩展名的图标类 file convention 路由
    // （apple-icon 是 Next.js 约定的固定路径，不应该被当成缺 locale 前缀而被重定向）
    "/((?!api|_next|_vercel|admin|apple-icon|.*\\..*).*)",
  ],
};
