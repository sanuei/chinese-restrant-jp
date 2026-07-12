export const cuisineTypes = [
  "sichuan",
  "cantonese",
  "northern",
  "fujian",
  "hunan",
  "jiangsu",
  "northwest",
  "yunnan",
  "other",
] as const;

export const authenticityTypes = ["authentic", "adapted", "japanese", "unknown"] as const;

// 品类：经营业态，和菜系（地域风味）是平行的第二套分类，一店一个
export const dishTypes = [
  "hotpot",
  "bbq",
  "noodles",
  "malatang",
  "dumpling",
  "riceNoodle",
  "grilledFish",
  "dimsum",
  "other",
] as const;

export type CuisineType = (typeof cuisineTypes)[number];
export type Authenticity = (typeof authenticityTypes)[number];
export type DishType = (typeof dishTypes)[number];
export type PriceLevel = 1 | 2 | 3 | 4;

export interface RestaurantRow {
  id: string;
  name_zh: string | null;
  name_ja: string | null;
  name_original: string;
  address: string;
  city: string | null;
  ward: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  google_maps_url: string | null;
  price_level: number | null;
  cuisine_type: string | null;
  cuisine_confidence: number | null;
  dish_type: string | null;
  authenticity: string | null;
  authenticity_score: number | null;
  authenticity_reason_zh: string | null;
  authenticity_reason_ja: string | null;
  raw_rating: number | null;
  trusted_rating: number | null;
  raw_review_count: number | null;
  trusted_review_count: number | null;
  ai_summary_zh: string | null;
  ai_summary_ja: string | null;
  ai_summary_updated_at: string | null;
  opening_hours: string | null;
  photos: string | null;
  is_active: number | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ReviewRow {
  id: string;
  restaurant_id: string;
  author_name: string | null;
  author_photo_url: string | null;
  rating: number;
  text: string | null;
  language: string | null;
  published_at: string | null;
  credibility_score: number | null;
  credibility_action: string | null;
  credibility_reason: string | null;
  source: string | null;
  user_id: string | null;
  helpful_count: number | null;
  created_at: string | null;
}

export function normalizeCuisineType(value: string | null | undefined): CuisineType {
  return cuisineTypes.includes(value as CuisineType) ? (value as CuisineType) : "other";
}

export function normalizeDishType(value: string | null | undefined): DishType {
  return dishTypes.includes(value as DishType) ? (value as DishType) : "other";
}

export function normalizeAuthenticity(value: string | null | undefined): Authenticity {
  return authenticityTypes.includes(value as Authenticity) ? (value as Authenticity) : "unknown";
}

export function normalizePriceLevel(value: number | null | undefined): PriceLevel | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

export function getRestaurantName(restaurant: RestaurantRow, locale: string): string {
  return locale === "zh"
    ? restaurant.name_zh || restaurant.name_original
    : restaurant.name_ja || restaurant.name_original;
}

export function getRestaurantSummary(restaurant: RestaurantRow, locale: string): string | null {
  return locale === "zh" ? restaurant.ai_summary_zh : restaurant.ai_summary_ja;
}

export function getRating(restaurant: RestaurantRow): number {
  return restaurant.trusted_rating || restaurant.raw_rating || 0;
}

/**
 * 把 photo_reference 或完整 URL 转成实际用于 <img src> 的地址。
 * - 完整 URL（http 开头）：原样返回
 * - photo_reference：走本站 /api/photo 代理（首次抓取后由 R2 缓存，避免 Google 按次计费）
 */
export function photoSrc(ref: string, width = 800): string {
  if (!ref) return "";
  if (ref.startsWith("http")) return ref;
  return `/api/photo?ref=${encodeURIComponent(ref)}&w=${width}`;
}

export function parsePhotoReferences(photos: string | null | undefined): string[] {
  if (!photos) return [];

  try {
    const parsed: unknown = JSON.parse(photos);
    if (!Array.isArray(parsed)) return [];

    // 完整 URL（lh3.googleusercontent.com）直接返回
    // photo_reference（Ab43m-...）也直接返回，由调用方决定如何拼接
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
