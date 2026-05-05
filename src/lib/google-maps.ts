/**
 * Google Maps Places API 封装
 * 使用官方 Places API (New) 或旧版 Text Search & Place Details
 */

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export interface GooglePlaceReview {
  author_name: string;
  author_url: string;
  profile_photo_url: string;
  rating: number;
  text: string;
  time: number;
  language?: string;
  translated?: boolean;
}

export interface GooglePlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: { lat: number; lng: number };
  };
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  formatted_phone_number?: string;
  website?: string;
  url?: string;
  reviews?: GooglePlaceReview[];
  photos?: { photo_reference: string }[];
}

export async function textSearchPlaces(
  query: string,
  options: { lat?: number; lng?: number; radius?: number } = {}
): Promise<GooglePlaceResult[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "restaurant");
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");
  url.searchParams.set("key", API_KEY as string);
  if (typeof options.lat === "number" && typeof options.lng === "number") {
    url.searchParams.set("location", `${options.lat},${options.lng}`);
    url.searchParams.set("radius", String(options.radius || 500));
  }

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Maps API error: ${data.status} - ${data.error_message}`);
  }

  return data.results || [];
}

export async function searchRestaurants(query: string, city: string = "tokyo"): Promise<GooglePlaceResult[]> {
  return textSearchPlaces(`${query} in ${city}`);
}

export async function getPlaceDetails(placeId: string): Promise<GooglePlaceResult | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.append("place_id", placeId);
  // 需要的字段：名称,地址,评分,评论数,价格,电话,官网,Google地图链接,评论,照片,经纬度
  url.searchParams.append("fields", "place_id,name,formatted_address,geometry,rating,user_ratings_total,price_level,formatted_phone_number,website,url,reviews,photos");
  url.searchParams.append("key", API_KEY as string);
  url.searchParams.append("language", "ja"); 
  url.searchParams.append("reviews_sort", "newest"); // 获取最新评论
  url.searchParams.append("reviews_no_translations", "true"); // 评论保留原文，不翻译成 language 指定语言

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status === "NOT_FOUND") return null;
  if (data.status !== "OK") {
    throw new Error(`Google Maps API error: ${data.status} - ${data.error_message}`);
  }

  return data.result;
}

export function getPhotoUrl(photoReference: string, maxWidth: number = 800): string {
  const url = new URL("https://maps.googleapis.com/maps/api/place/photo");
  url.searchParams.append("maxwidth", maxWidth.toString());
  url.searchParams.append("photo_reference", photoReference);
  url.searchParams.append("key", API_KEY as string);
  return url.toString();
}
