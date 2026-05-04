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

export type CuisineType = (typeof cuisineTypes)[number];
export type Authenticity = (typeof authenticityTypes)[number];
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

export function parsePhotoReferences(photos: string | null | undefined): string[] {
  if (!photos) return [];

  try {
    const parsed: unknown = JSON.parse(photos);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
