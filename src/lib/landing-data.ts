import { cache } from "react";
import { getDb } from "@/lib/cloudflare";
import { stationAreas, type StationAreaKey } from "@/lib/station-areas";
import type { RestaurantRow } from "@/lib/restaurant-types";
import {
  MIN_INDEXABLE_COUNT,
  allLandingCategories,
  filterSql,
  getStationArea,
  matchesFilter,
  parseCategorySlug,
  type LandingFilter,
} from "@/lib/landing";

/** 一页最多列多少家；超过的引导去筛选页看全部 */
export const LANDING_LIST_LIMIT = 60;

export type LightRow = Pick<
  RestaurantRow,
  "nearest_station" | "station_distance_m" | "cuisine_type" | "dish_type" | "authenticity"
>;

/**
 * 所有在营餐厅的少数几列（两百多行），用来算各落地页的家数、相关链接和 sitemap。
 * cache() 让同一次请求里的 generateMetadata 和页面本体共用一次查询。
 */
export const getLightRows = cache(async (): Promise<LightRow[]> => {
  try {
    const db = await getDb();
    const { results = [] } = await db
      .prepare(
        `SELECT nearest_station, station_distance_m, cuisine_type, dish_type, authenticity
         FROM restaurants WHERE is_active = 1`
      )
      .all<LightRow>();
    return results;
  } catch (error) {
    console.error("Landing light rows query error:", error);
    return [];
  }
});

export function countMatching(rows: LightRow[], filter: LandingFilter): number {
  return rows.reduce((n, row) => (matchesFilter(row, filter) ? n + 1 : n), 0);
}

/** 所有达到收录门槛的落地页（车站、分类、车站×分类），sitemap 和相关链接用 */
export function indexableLandings(rows: LightRow[]): { filter: LandingFilter; count: number }[] {
  const filters: LandingFilter[] = [
    ...stationAreas.map(({ key }) => ({ area: key })),
    ...allLandingCategories.map((category) => ({ category })),
    ...stationAreas.flatMap(({ key }) => allLandingCategories.map((category) => ({ area: key, category }))),
  ];

  return filters
    .map((filter) => ({ filter, count: countMatching(rows, filter) }))
    .filter(({ count }) => count >= MIN_INDEXABLE_COUNT);
}

/** URL 参数 → 落地页筛选条件；参数不合法返回 null（调用方 404） */
export function parseLandingParams(areaKey?: string, categorySlug?: string): LandingFilter | null {
  const filter: LandingFilter = {};

  if (areaKey !== undefined) {
    const area = getStationArea(areaKey);
    if (!area) return null;
    filter.area = area.key as StationAreaKey;
  }
  if (categorySlug !== undefined) {
    const category = parseCategorySlug(categorySlug);
    if (!category) return null;
    filter.category = category;
  }

  return filter.area || filter.category ? filter : null;
}

/** 落地页的餐厅列表：可信评分优先。参数用原始字符串，方便 cache() 按值去重 */
export const getLandingRestaurants = cache(
  async (areaKey: string | undefined, categorySlug: string | undefined): Promise<RestaurantRow[]> => {
    const filter = parseLandingParams(areaKey, categorySlug);
    if (!filter) return [];

    const { condition, binds } = filterSql(filter);
    try {
      const db = await getDb();
      const { results = [] } = await db
        .prepare(
          `SELECT * FROM restaurants WHERE ${condition}
           ORDER BY trusted_rating DESC, raw_review_count DESC LIMIT ${LANDING_LIST_LIMIT}`
        )
        .bind(...binds)
        .all<RestaurantRow>();
      return results;
    } catch (error) {
      console.error("Landing restaurants query error:", error);
      return [];
    }
  }
);
