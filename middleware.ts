import createMiddleware from "next-intl/middleware";
import { routing } from "./src/i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: [
    // 匹配所有路径，除了 API 路由、静态文件、图片优化
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
