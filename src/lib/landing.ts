import { stationAreas, type StationAreaKey } from "@/lib/station-areas";
import { cuisineTypes, dishTypes, type CuisineType, type DishType, type RestaurantRow } from "@/lib/restaurant-types";

/**
 * SEO 落地页（车站 / 菜系 / 品类 / 车站×菜系或品类）的纯逻辑：定义、匹配规则、URL、文案。
 * 不碰数据库，查询在 landing-data.ts。
 *
 * 为什么要有这些页：Web Analytics 显示搜索引擎带来的访问几乎为 0，
 * 而现有的筛选结果都是 `/restaurants?q=...` 这种查询串 URL，搜索引擎不会把它们当独立页面收录。
 * 「池袋 ガチ中華」「東京 麻辣湯」这类词需要有固定 URL、有标题、有正文的页面来承接。
 */

/** 少于这个家数的组合页面照常能打开，但 noindex 且不进 sitemap，避免被判成薄内容 */
export const MIN_INDEXABLE_COUNT = 3;

/** 和 getStationLabel 一致：超过 1.5km 就不算「车站周边」 */
export const MAX_STATION_DISTANCE_M = 1500;

export type LandingCuisine = Exclude<CuisineType, "other">;
export type LandingDish = Exclude<DishType, "other">;

// 「other（综合/其他）」不是一个有人会搜的品类，不做落地页
export const landingCuisines = cuisineTypes.filter((c): c is LandingCuisine => c !== "other");
export const landingDishes = dishTypes.filter((d): d is LandingDish => d !== "other");

export type LandingCategory =
  | { kind: "cuisine"; key: LandingCuisine }
  | { kind: "dish"; key: LandingDish };

export type LandingFilter = {
  area?: StationAreaKey;
  category?: LandingCategory;
};

export type StationArea = (typeof stationAreas)[number];

export const allLandingCategories: LandingCategory[] = [
  ...landingCuisines.map((key) => ({ kind: "cuisine" as const, key })),
  ...landingDishes.map((key) => ({ kind: "dish" as const, key })),
];

export function getStationArea(key: string): StationArea | null {
  return stationAreas.find((area) => area.key === key) ?? null;
}

/** 菜系和品类的 key 去掉 other 之后不重名，所以车站×分类页可以共用一个 URL 段 */
export function parseCategorySlug(slug: string): LandingCategory | null {
  if ((landingCuisines as string[]).includes(slug)) return { kind: "cuisine", key: slug as LandingCuisine };
  if ((landingDishes as string[]).includes(slug)) return { kind: "dish", key: slug as LandingDish };
  return null;
}

export function landingPath(filter: LandingFilter): string {
  const { area, category } = filter;
  if (area && category) return `/area/${area}/${category.key}`;
  if (area) return `/area/${area}`;
  if (category?.kind === "cuisine") return `/cuisines/${category.key}`;
  if (category?.kind === "dish") return `/dishes/${category.key}`;
  return "/restaurants";
}

/** 落地页对应的筛选页（地图、更多筛选按钮用） */
export function filterQuery(filter: LandingFilter): string {
  const query = new URLSearchParams();
  if (filter.area) {
    const area = getStationArea(filter.area);
    if (area) query.set("q", area.searchTerm);
  }
  if (filter.category?.kind === "cuisine") query.set("cuisine", filter.category.key);
  if (filter.category?.kind === "dish") query.set("dish_type", filter.category.key);
  return query.toString();
}

type MatchRow = Pick<RestaurantRow, "nearest_station" | "station_distance_m" | "cuisine_type" | "dish_type">;

export function matchesArea(row: MatchRow, areaKey: StationAreaKey): boolean {
  const area = getStationArea(areaKey);
  if (!area || !row.nearest_station?.includes(area.searchTerm)) return false;
  return row.station_distance_m == null || row.station_distance_m <= MAX_STATION_DISTANCE_M;
}

export function matchesCategory(row: MatchRow, category: LandingCategory): boolean {
  return category.kind === "cuisine" ? row.cuisine_type === category.key : row.dish_type === category.key;
}

export function matchesFilter(row: MatchRow, filter: LandingFilter): boolean {
  if (filter.area && !matchesArea(row, filter.area)) return false;
  if (filter.category && !matchesCategory(row, filter.category)) return false;
  return true;
}

/** 和 matchesFilter 等价的 SQL 条件，列表查询用 */
export function filterSql(filter: LandingFilter): { condition: string; binds: (string | number)[] } {
  const conditions: string[] = ["is_active = 1"];
  const binds: (string | number)[] = [];

  if (filter.area) {
    const area = getStationArea(filter.area);
    conditions.push("nearest_station LIKE ?", "(station_distance_m IS NULL OR station_distance_m <= ?)");
    binds.push(`%${area?.searchTerm ?? ""}%`, MAX_STATION_DISTANCE_M);
  }
  if (filter.category) {
    conditions.push(filter.category.kind === "cuisine" ? "cuisine_type = ?" : "dish_type = ?");
    binds.push(filter.category.key);
  }

  return { condition: conditions.join(" AND "), binds };
}

export type LandingCopyInput = {
  locale: string;
  area: StationArea | null;
  categoryLabel: string | null;
  total: number;
  authentic: number;
  /** 车站页列菜系分布，菜系页列车站分布；车站×分类页为空 */
  breakdown: { label: string; count: number }[];
  top: { name: string; rating: number } | null;
};

export type LandingCopy = {
  title: string;
  description: string;
  intro: string;
  placeLabel: string;
};

export function buildLandingCopy(input: LandingCopyInput): LandingCopy {
  const { locale, area, categoryLabel, total, authentic, breakdown, top } = input;
  const rating = top ? top.rating.toFixed(1) : "";

  if (locale === "zh") {
    const placeLabel = area ? area.zh : "东京";
    const placeDesc = area ? `${area.zh}站周边` : "东京及关东";
    const subject = categoryLabel ?? "中餐厅";
    const title = categoryLabel
      ? `${placeLabel}${categoryLabel}推荐 ${total} 家`
      : `${placeLabel}中餐厅推荐 ${total} 家（ガチ中華）`;
    const list = breakdown.map((b) => `${b.label}（${b.count} 家）`).join("、");

    return {
      placeLabel,
      title,
      description: `${placeDesc}共收录 ${total} 家${subject}，其中 ${authentic} 家为 AI 判定的正宗中华。按过滤刷评后的可信评分排序${top ? `，第一名是「${top.name}」` : ""}。`,
      intro: [
        `${placeDesc}共收录 ${total} 家${subject}，其中 ${authentic} 家被 AI 判定为「正宗中华」。`,
        list ? `以${list}为主。` : "",
        top ? `可信评分最高的是「${top.name}」（${rating} 分）。` : "",
        "以下按过滤刷评和无关评论之后的可信评分排序。",
      ].join(""),
    };
  }

  const placeLabel = area ? area.ja : "東京";
  const placeDesc = area ? `${area.ja}駅周辺` : "東京・関東";
  const subject = categoryLabel ?? "中華料理店";
  const title = categoryLabel
    ? `${placeLabel}の${categoryLabel} おすすめ${total}軒`
    : `${placeLabel}のガチ中華・中華料理 おすすめ${total}軒`;
  const list = breakdown.map((b) => `${b.label}（${b.count}軒）`).join("、");

  return {
    placeLabel,
    title,
    description: `${placeDesc}の${subject}${total}軒を、AIの本場度判定と口コミを精査した信頼スコアでランキング。うちガチ中華認定は${authentic}軒${top ? `、1位は「${top.name}」` : ""}。`,
    intro: [
      `${placeDesc}で当サイトが収録している${subject}は${total}軒、そのうち${authentic}軒をAIが「ガチ中華」と判定しています。`,
      list ? `${list}が中心です。` : "",
      top ? `信頼スコアが最も高いのは「${top.name}」（${rating}）。` : "",
      "サクラや無関係な口コミを除いた信頼スコア順に並べています。",
    ].join(""),
  };
}
