import { auth } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";

/**
 * 批量查询当前登录用户在给定餐厅列表中收藏了哪些。
 * 未登录时直接返回空集合，不查询数据库。
 */
export async function getFavoritedIds(restaurantIds: string[]): Promise<Set<string>> {
  if (restaurantIds.length === 0) return new Set();

  const session = await auth();
  if (!session?.user?.id) return new Set();

  const db = await getDb();
  const placeholders = restaurantIds.map(() => "?").join(",");
  const { results = [] } = await db
    .prepare(`SELECT restaurant_id FROM favorites WHERE user_id = ? AND restaurant_id IN (${placeholders})`)
    .bind(session.user.id, ...restaurantIds)
    .all<{ restaurant_id: string }>();

  return new Set(results.map((row) => row.restaurant_id));
}
