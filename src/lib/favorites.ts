import { getCurrentUser } from "@/lib/session";
import { getDb } from "@/lib/cloudflare";

/**
 * 批量查询当前登录用户在给定餐厅列表中收藏了哪些。
 * 未登录时直接返回空集合，不查询数据库。
 *
 * 注意：Cloudflare D1 单条 SQL 绑定参数上限为 100，不能把上百个 restaurantId
 * 直接塞进 IN (...)。这里改为只按 user_id 查一次（仅 1 个绑定参数），再在内存取交集，
 * 既避免 too many SQL variables 报错，也更快更安全。
 */
export async function getFavoritedIds(restaurantIds: string[]): Promise<Set<string>> {
  if (restaurantIds.length === 0) return new Set();

  const user = await getCurrentUser();
  if (!user) return new Set();

  try {
    const db = await getDb();
    const { results = [] } = await db
      .prepare(`SELECT restaurant_id FROM favorites WHERE user_id = ?`)
      .bind(user.id)
      .all<{ restaurant_id: string }>();

    const targetSet = new Set(restaurantIds);
    const matched = new Set<string>();
    for (const row of results || []) {
      if (targetSet.has(row.restaurant_id)) {
        matched.add(row.restaurant_id);
      }
    }
    return matched;
  } catch (error) {
    console.error("getFavoritedIds error:", error);
    return new Set();
  }
}
