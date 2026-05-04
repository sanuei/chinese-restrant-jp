import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: [
    // 匹配所有路径，排除 API、静态文件、_next 及 /admin
    "/((?!api|_next|_vercel|admin|.*\\..*).*)",
  ],
};
