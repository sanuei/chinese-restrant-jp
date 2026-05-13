export const SEARCH_SHADOW_FIELDS = [
  "name_zh_search",
  "name_ja_search",
  "name_original_search",
  "address_search",
  "ward_search",
  "ai_summary_zh_search",
  "ai_summary_ja_search",
  "authenticity_reason_zh_search",
  "authenticity_reason_ja_search",
] as const;

type SearchShadowField = (typeof SEARCH_SHADOW_FIELDS)[number];

type SearchSource = {
  name_zh?: string | null;
  name_ja?: string | null;
  name_original?: string | null;
  address?: string | null;
  ward?: string | null;
  ai_summary_zh?: string | null;
  ai_summary_ja?: string | null;
  authenticity_reason_zh?: string | null;
  authenticity_reason_ja?: string | null;
};

const CHARACTER_VARIANTS: Array<[string, string]> = [
  ["杨", "楊"],
  ["国", "國"],
  ["厅", "廳"],
  ["粤", "粵"],
  ["广", "廣"],
  ["东", "東"],
  ["门", "門"],
  ["线", "線"],
  ["云", "雲"],
  ["苏", "蘇"],
  ["贵", "貴"],
  ["兰", "蘭"],
  ["饮", "飲"],
  ["点", "點"],
  ["烧", "燒"],
  ["腊", "臘"],
  ["综", "綜"],
  ["华", "華"],
  ["区", "區"],
  ["汤", "湯"],
  ["锅", "鍋"],
  ["饭", "飯"],
  ["馆", "館"],
  ["面", "麵"],
  ["鱼", "魚"],
  ["鸡", "雞"],
  ["龙", "龍"],
  ["气", "氣"],
  ["庆", "慶"],
  ["丰", "豐"],
  ["刘", "劉"],
  ["张", "張"],
  ["陈", "陳"],
  ["吴", "吳"],
  ["孙", "孫"],
  ["赵", "趙"],
  ["叶", "葉"],
  ["乡", "鄉"],
  ["万", "萬"],
  ["饺", "餃"],
  ["凉", "涼"],
  ["炉", "爐"],
  ["卤", "滷"],
  ["台", "臺"],
  ["阳", "陽"],
  ["阴", "陰"],
  ["沪", "滬"],
  ["凤", "鳳"],
];

const SIMPLIFIED_TO_TRADITIONAL = new Map(CHARACTER_VARIANTS);
const TRADITIONAL_TO_SIMPLIFIED = new Map(
  CHARACTER_VARIANTS.map(([simplified, traditional]) => [traditional, simplified] as const)
);

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function convertVariant(value: string, variantMap: Map<string, string>): string {
  return [...value].map((char) => variantMap.get(char) || char).join("");
}

export function expandSearchVariants(value: string): string[] {
  const normalized = normalizeForSearch(value);
  if (!normalized) return [];

  return [...new Set([
    normalized,
    convertVariant(normalized, SIMPLIFIED_TO_TRADITIONAL),
    convertVariant(normalized, TRADITIONAL_TO_SIMPLIFIED),
  ])];
}

export function buildSearchShadow(value: string | null | undefined): string {
  if (!value) return "";
  return expandSearchVariants(value).join(" ");
}

export function buildRestaurantSearchShadows(source: SearchSource): Record<SearchShadowField, string> {
  return {
    name_zh_search: buildSearchShadow(source.name_zh),
    name_ja_search: buildSearchShadow(source.name_ja),
    name_original_search: buildSearchShadow(source.name_original),
    address_search: buildSearchShadow(source.address),
    ward_search: buildSearchShadow(source.ward),
    ai_summary_zh_search: buildSearchShadow(source.ai_summary_zh),
    ai_summary_ja_search: buildSearchShadow(source.ai_summary_ja),
    authenticity_reason_zh_search: buildSearchShadow(source.authenticity_reason_zh),
    authenticity_reason_ja_search: buildSearchShadow(source.authenticity_reason_ja),
  };
}
