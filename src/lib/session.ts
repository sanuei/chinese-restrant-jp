import { cache } from "react";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

// Auth.js v5 的 session cookie：HTTPS 下是 __Secure-authjs.session-token，
// 超过 4KB 时还会被拆成 .0 / .1 分片，所以用包含匹配。
const SESSION_COOKIE_KEY = "authjs.session-token";

/**
 * 取当前登录用户，一次请求只算一次。
 *
 * 之前每次 auth() 都会重新走一遍 Auth.js 的解析 + JWE 解密（纯 CPU 操作），
 * 而首页一次渲染要调 5 次（layout 1 次 + 两个 TopRestaurants 各 1 次 +
 * 两次 getFavoritedIds 各 1 次）。在 Cloudflare Workers 的 CPU 配额下这是
 * Error 1102 的主要来源之一。这里做两件事：
 *   1. React cache()：同一次渲染内复用结果，5 次变 1 次
 *   2. 没有 session cookie 时直接返回 null，未登录用户完全不进 auth()
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const hasSession = cookieStore.getAll().some((c) => c.name.includes(SESSION_COOKIE_KEY));
  if (!hasSession) return null;

  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };
});
