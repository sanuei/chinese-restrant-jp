import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCache, getDb } from "@/lib/cloudflare";
import type { RestaurantRow } from "@/lib/restaurant-types";

/** 排行榜统计窗口：最近 7 天，让榜单能反映「最近在热」而不是历史总量 */
const WINDOW_DAYS = 7;
/** 榜单在 KV 里缓存 5 分钟，避免每次首页渲染都跑一次 GROUP BY */
const CACHE_TTL_SECONDS = 300;
const CACHE_KEY_PREFIX = "ranking:trending:v1";

/** 榜单卡片用到的字段，不用 SELECT *，少拉一半列 */
export type TrendingRestaurant = Pick<
  RestaurantRow,
  | "id"
  | "name_zh"
  | "name_ja"
  | "name_original"
  | "ward"
  | "city"
  | "cuisine_type"
  | "authenticity"
  | "raw_rating"
  | "trusted_rating"
  | "photos"
> & { view_count: number };

const TRENDING_COLUMNS = `r.id, r.name_zh, r.name_ja, r.name_original, r.ward, r.city,
  r.cuisine_type, r.authenticity, r.raw_rating, r.trusted_rating, r.photos`;

// 爬虫不计入热度，否则榜单会被 Googlebot / 各种预览抓取带偏
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|curl|wget|python-requests|okhttp|go-http/i;

function utcDay(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * 记录一次餐厅详情页浏览。
 *
 * 用 waitUntil 把写库丢到响应之后，不占用页面的关键路径；
 * 统计出任何问题都只是少记一次，绝不能让详情页挂掉。
 */
export async function recordRestaurantView(restaurantId: string): Promise<void> {
  try {
    const ua = (await headers()).get("user-agent") || "";
    if (!ua || BOT_UA.test(ua)) return;

    const db = await getDb();
    const write = db
      .prepare(
        `INSERT INTO restaurant_views (restaurant_id, view_date, views)
         VALUES (?, ?, 1)
         ON CONFLICT(restaurant_id, view_date) DO UPDATE SET views = views + 1`
      )
      .bind(restaurantId, utcDay())
      .run();

    const { ctx } = await getCloudflareContext();
    ctx.waitUntil(
      write.catch((error: unknown) => {
        console.error("[views] record failed:", error);
      })
    );
  } catch (error) {
    console.error("[views] record skipped:", error);
  }
}

async function queryTrending(limit: number): Promise<TrendingRestaurant[]> {
  const db = await getDb();
  const since = utcDay(-WINDOW_DAYS);

  const { results = [] } = await db
    .prepare(
      `SELECT ${TRENDING_COLUMNS}, SUM(v.views) AS view_count
       FROM restaurant_views v
       JOIN restaurants r ON r.id = v.restaurant_id
       WHERE v.view_date >= ? AND r.is_active = 1
       GROUP BY r.id
       ORDER BY view_count DESC, r.trusted_rating DESC
       LIMIT ?`
    )
    .bind(since, limit)
    .all<TrendingRestaurant>();

  const ranked = results || [];
  if (ranked.length >= limit) return ranked;

  // 冷启动兜底：统计数据还不够时用高分店补齐，避免榜单空着或只有两三张卡
  const seen = ranked.map((row) => row.id);
  const placeholders = seen.length ? `AND r.id NOT IN (${seen.map(() => "?").join(",")})` : "";
  const { results: filler = [] } = await db
    .prepare(
      `SELECT ${TRENDING_COLUMNS}, 0 AS view_count
       FROM restaurants r
       WHERE r.is_active = 1 ${placeholders}
       ORDER BY r.trusted_rating DESC, r.raw_review_count DESC
       LIMIT ?`
    )
    .bind(...seen, limit - ranked.length)
    .all<TrendingRestaurant>();

  return [...ranked, ...(filler || [])];
}

/**
 * 首页热度榜。KV 缓存 5 分钟 —— 榜单本来就不需要实时，
 * 换掉每次渲染一次 GROUP BY 的开销（Workers 上 CPU 是硬约束）。
 */
export async function getTrendingRestaurants(limit = 12): Promise<TrendingRestaurant[]> {
  const cacheKey = `${CACHE_KEY_PREFIX}:${limit}`;

  try {
    const cache = await getCache();
    const cached = await cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as TrendingRestaurant[];
  } catch (error) {
    console.error("[views] ranking cache read failed:", error);
  }

  let rows: TrendingRestaurant[] = [];
  try {
    rows = await queryTrending(limit);
  } catch (error) {
    console.error("[views] ranking query failed:", error);
    return [];
  }

  try {
    const cache = await getCache();
    await cache.put(cacheKey, JSON.stringify(rows), { expirationTtl: CACHE_TTL_SECONDS });
  } catch (error) {
    console.error("[views] ranking cache write failed:", error);
  }

  return rows;
}
