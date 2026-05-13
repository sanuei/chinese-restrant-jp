import { type CuisineType } from "@/lib/restaurant-types";
import { expandSearchVariants, SEARCH_SHADOW_FIELDS } from "@/lib/restaurant-search-index";

type SearchClause = {
  condition: string;
  binds: string[];
};

const SEARCH_COLUMNS = [
  "name_zh",
  "name_ja",
  "name_original",
  "address",
  "ward",
  "cuisine_type",
  "ai_summary_zh",
  "ai_summary_ja",
  "authenticity_reason_zh",
  "authenticity_reason_ja",
];

const cuisineAliases: Record<CuisineType, string[]> = {
  sichuan: ["川菜", "四川", "四川菜", "麻辣", "水煮", "担担", "担々", "四川料理", "sichuan"],
  cantonese: [
    "粤菜",
    "粵菜",
    "广东菜",
    "廣東菜",
    "广式",
    "廣式",
    "港式",
    "香港",
    "茶餐厅",
    "茶餐廳",
    "饮茶",
    "飲茶",
    "点心",
    "點心",
    "烧腊",
    "燒臘",
    "広東",
    "広東料理",
    "香港料理",
    "dim sum",
    "cha chaan teng",
    "cantonese",
    "guangdong",
  ],
  northern: ["北方菜", "东北菜", "東北菜", "东北", "東北", "饺子", "餃子", "羊肉串", "北方料理", "northern"],
  fujian: ["闽菜", "閩菜", "福建", "福建料理", "fujian"],
  hunan: ["湘菜", "湖南", "湖南菜", "湖南料理", "hunan"],
  jiangsu: ["苏浙菜", "蘇浙菜", "江浙", "江苏", "江蘇", "上海菜", "上海料理", "jiangsu"],
  northwest: ["西北菜", "西北", "兰州", "蘭州", "新疆", "羊肉", "拉面", "拉麺", "northwest"],
  yunnan: ["云南", "雲南", "贵州", "貴州", "米线", "米線", "云南菜", "雲南料理", "yunnan"],
  other: ["综合", "綜合", "中華", "中华", "中国料理", "町中華", "other"],
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim();
}

export function getCuisineTypesForSearchQuery(query: string): CuisineType[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const matches: CuisineType[] = [];
  for (const [cuisine, aliases] of Object.entries(cuisineAliases) as [CuisineType, string[]][]) {
    const hit = aliases.some((alias) => {
      const normalizedAlias = normalizeSearchText(alias);
      return normalizedQuery.includes(normalizedAlias) || normalizedAlias.includes(normalizedQuery);
    });
    if (hit) matches.push(cuisine);
  }
  return matches;
}

export function buildRestaurantSearchClause(query: string): SearchClause | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const conditions: string[] = [];
  const binds: string[] = [];
  const likeValue = `%${trimmed}%`;
  const normalizedQueryVariants = expandSearchVariants(trimmed);

  conditions.push(`(${SEARCH_COLUMNS.map((column) => `${column} LIKE ?`).join(" OR ")})`);
  binds.push(...SEARCH_COLUMNS.map(() => likeValue));

  if (normalizedQueryVariants.length > 0) {
    const normalizedConditions = normalizedQueryVariants.map(
      () => `(${SEARCH_SHADOW_FIELDS.map((column) => `${column} LIKE ?`).join(" OR ")})`
    );
    conditions.push(`(${normalizedConditions.join(" OR ")})`);
    for (const variant of normalizedQueryVariants) {
      const normalizedLikeValue = `%${variant}%`;
      binds.push(...SEARCH_SHADOW_FIELDS.map(() => normalizedLikeValue));
    }
  }

  const cuisines = getCuisineTypesForSearchQuery(trimmed);
  if (cuisines.length > 0) {
    conditions.push(`cuisine_type IN (${cuisines.map(() => "?").join(", ")})`);
    binds.push(...cuisines);
  }

  return {
    condition: `(${conditions.join(" OR ")})`,
    binds,
  };
}
