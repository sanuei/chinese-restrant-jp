import { getDb } from "@/lib/cloudflare";
import { getPlaceDetails } from "@/lib/google-maps";
import { analyzeLifePlaceSnapshot } from "@/lib/deepseek";
import {
  normalizeChineseSupport,
  normalizeLifeCategory,
  type LifeCategory,
} from "@/lib/life-types";

const KANTO_PREFECTURES = [
  { key: "tokyo", pattern: "東京都" },
  { key: "kanagawa", pattern: "神奈川県" },
  { key: "saitama", pattern: "埼玉県" },
  { key: "chiba", pattern: "千葉県" },
  { key: "ibaraki", pattern: "茨城県" },
  { key: "tochigi", pattern: "栃木県" },
  { key: "gunma", pattern: "群馬県" },
] as const;

function parseCityAndWard(address: string): { city: string; ward: string | null } {
  const pref = KANTO_PREFECTURES.find((p) => address.includes(p.pattern));
  const city = pref ? pref.key : "tokyo";
  const wardMatch = address.match(/(?:東京都|神奈川県|埼玉県|千葉県|茨城県|栃木県|群馬県)([^0-9０-９\s]{1,8}?(?:区|市|町|村))/);
  return {
    city,
    ward: wardMatch ? wardMatch[1] : null,
  };
}

export interface SyncLifePlaceOptions {
  hintCategory?: LifeCategory;
  autoFilterNonChinese?: boolean;
  nearestStation?: string | null;
  nearestStationZh?: string | null;
  stationDistanceM?: number | null;
}

/** 同步单个 Google Place 到生活专区 life_places 表 */
export async function syncLifePlaceByPlaceId(
  placeId: string,
  options: SyncLifePlaceOptions = {}
) {
  const place = await getPlaceDetails(placeId);
  if (!place) {
    throw new Error(`Place not found: ${placeId}`);
  }

  const lat = place.geometry?.location?.lat;
  const lng = place.geometry?.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Invalid coordinates for place: ${placeId}`);
  }

  const businessStatus =
    place.business_status === "CLOSED_PERMANENTLY" || place.business_status === "CLOSED_TEMPORARILY"
      ? place.business_status
      : "OPERATIONAL";
  const permanentlyClosed = businessStatus === "CLOSED_PERMANENTLY";

  const ai = await analyzeLifePlaceSnapshot({
    name: place.name,
    address: place.formatted_address || "",
    hintCategory: options.hintCategory,
    rating: place.rating || 0,
    reviewCount: place.user_ratings_total || 0,
    website: place.website || null,
    reviews: (place.reviews || []).map((r) => ({
      author_name: r.author_name,
      rating: r.rating,
      text: r.text,
      language: r.language,
    })),
  });

  const category = normalizeLifeCategory(ai.category || options.hintCategory);
  const chineseSupport = normalizeChineseSupport(ai.chinese_support);
  const isActive =
    permanentlyClosed || (options.autoFilterNonChinese && !ai.is_chinese_service) ? 0 : 1;

  const photos = (place.photos || [])
    .slice(0, 6)
    .map((p) => p.photo_reference)
    .filter(Boolean);

  const openingHoursJson = place.opening_hours ? JSON.stringify(place.opening_hours) : null;
  const tagsZh = Array.isArray(ai.tags_zh) ? ai.tags_zh.slice(0, 5) : [];
  const tagsJa = Array.isArray(ai.tags_ja) ? ai.tags_ja.slice(0, 5) : [];
  const { city, ward } = parseCityAndWard(place.formatted_address || "");
  const canonicalId = place.place_id || placeId;
  const now = new Date().toISOString();

  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO life_places (
        id, name_zh, name_ja, name_original, category, chinese_support,
        address, city, ward, lat, lng,
        nearest_station, nearest_station_zh, station_distance_m,
        phone, website, google_maps_url, price_level,
        rating, review_count, summary_zh, summary_ja, tags_zh, tags_ja,
        opening_hours, photos, business_status, is_active, last_synced_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        name_zh = excluded.name_zh,
        name_ja = excluded.name_ja,
        name_original = excluded.name_original,
        category = excluded.category,
        chinese_support = excluded.chinese_support,
        address = excluded.address,
        city = excluded.city,
        ward = excluded.ward,
        lat = excluded.lat,
        lng = excluded.lng,
        nearest_station = COALESCE(excluded.nearest_station, life_places.nearest_station),
        nearest_station_zh = COALESCE(excluded.nearest_station_zh, life_places.nearest_station_zh),
        station_distance_m = COALESCE(excluded.station_distance_m, life_places.station_distance_m),
        phone = excluded.phone,
        website = excluded.website,
        google_maps_url = excluded.google_maps_url,
        price_level = excluded.price_level,
        rating = excluded.rating,
        review_count = excluded.review_count,
        summary_zh = excluded.summary_zh,
        summary_ja = excluded.summary_ja,
        tags_zh = excluded.tags_zh,
        tags_ja = excluded.tags_ja,
        opening_hours = excluded.opening_hours,
        photos = excluded.photos,
        business_status = excluded.business_status,
        is_active = excluded.is_active,
        last_synced_at = excluded.last_synced_at,
        updated_at = excluded.updated_at`
    )
    .bind(
      canonicalId,
      ai.name_zh || place.name,
      ai.name_ja || place.name,
      place.name,
      category,
      chineseSupport,
      place.formatted_address || "",
      city,
      ward,
      lat,
      lng,
      options.nearestStation ?? null,
      options.nearestStationZh ?? null,
      options.stationDistanceM ?? null,
      place.formatted_phone_number || null,
      place.website || null,
      place.url || `https://www.google.com/maps/place/?q=place_id:${canonicalId}`,
      place.price_level ?? null,
      place.rating ?? 0,
      place.user_ratings_total ?? 0,
      ai.summary_zh || null,
      ai.summary_ja || null,
      JSON.stringify(tagsZh),
      JSON.stringify(tagsJa),
      openingHoursJson,
      JSON.stringify(photos),
      businessStatus,
      isActive,
      now,
      now
    )
    .run();

  return {
    id: canonicalId,
    name: place.name,
    name_zh: ai.name_zh || place.name,
    category,
    chinese_support: chineseSupport,
    is_chinese_service: ai.is_chinese_service,
    is_active: isActive,
    rating: place.rating ?? 0,
    review_count: place.user_ratings_total ?? 0,
    lat,
    lng,
    ward,
  };
}
