import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/cloudflare";
import RestaurantMap, { type MapRestaurant, type MapStationPreset } from "@/components/RestaurantMap";
import {
  authenticityTypes,
  cuisineTypes,
  dishTypes,
  getRating,
  getRestaurantName,
  getRestaurantSummary,
  getStationLabel,
  normalizeAuthenticity,
  normalizeBusinessStatus,
  normalizeCuisineType,
  normalizeDishType,
  normalizePriceLevel,
  parsePhotoReferences,
  photoSrc,
  type RestaurantRow,
} from "@/lib/restaurant-types";
import { getStationAreaLabel, matchesStationArea, stationAreas } from "@/lib/station-areas";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    cuisine?: string;
    dish?: string;
    auth?: string;
    station?: string;
    minRating?: string;
  }>;
};

/** 地图页按需查询字段，避免 SELECT * 增加传输与序列化开销 */
type MapRow = Pick<
  RestaurantRow,
  | "id"
  | "name_zh"
  | "name_ja"
  | "name_original"
  | "lat"
  | "lng"
  | "ward"
  | "city"
  | "cuisine_type"
  | "dish_type"
  | "authenticity"
  | "trusted_rating"
  | "raw_rating"
  | "trusted_review_count"
  | "raw_review_count"
  | "price_level"
  | "nearest_station"
  | "nearest_station_zh"
  | "station_distance_m"
  | "ai_summary_zh"
  | "ai_summary_ja"
  | "business_status"
  | "photos"
  | "google_maps_url"
>;

/** 各热门商圈默认视觉中心（当门店数较少时作为兜底飞跃坐标） */
const STATION_CENTERS: Record<string, { lng: number; lat: number; zoom: number }> = {
  ikebukuro: { lng: 139.7109, lat: 35.7295, zoom: 14.3 },
  ueno: { lng: 139.7745, lat: 35.709, zoom: 14.2 },
  takadanobaba: { lng: 139.7038, lat: 35.7123, zoom: 14.6 },
  shinkoiwa: { lng: 139.869, lat: 35.725, zoom: 13.4 },
  shinjuku: { lng: 139.7006, lat: 35.6938, zoom: 14.2 },
  roppongi: { lng: 139.7314, lat: 35.6628, zoom: 13.9 },
  akihabara: { lng: 139.7731, lat: 35.6984, zoom: 14.0 },
  kameido: { lng: 139.821, lat: 35.6975, zoom: 14.0 },
  shibuya: { lng: 139.7016, lat: 35.658, zoom: 13.8 },
  ginza: { lng: 139.763, lat: 35.6695, zoom: 14.1 },
  shinokubo: { lng: 139.7002, lat: 35.7008, zoom: 14.8 },
  yokohama: { lng: 139.6455, lat: 35.4426, zoom: 15.0 },
  kawasaki: { lng: 139.6969, lat: 35.5308, zoom: 14.2 },
  asakusa: { lng: 139.7967, lat: 35.7119, zoom: 14.5 },
  nishikawaguchi: { lng: 139.7044, lat: 35.8156, zoom: 14.3 },
  funabashi: { lng: 139.9853, lat: 35.7017, zoom: 13.8 },
};

/** 截断 AI 摘要作为地图预览卡片的一句话亮点 */
function trimSnippet(summary: string | null, maxLen = 96): string | null {
  if (!summary) return null;
  const clean = summary.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > maxLen ? `${clean.slice(0, maxLen).trimEnd()}…` : clean;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "地图找餐厅" : "マップで探す",
    description:
      locale === "zh"
        ? "在交互式地图上探索东京与关东正宗中餐，支持关键词搜索、商圈直达、菜系品类筛选与视野联动。"
        : "東京・関東のガチ中華をインタラクティブ地図で探索。キーワード検索・人気エリア移動・ジャンルや業態での絞り込みに対応。",
    alternates: {
      canonical: `/${locale}/map`,
      languages: { zh: "/zh/map", ja: "/ja/map", "x-default": "/zh/map" },
    },
  };
}

export default async function MapPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const tc = await getTranslations({ locale, namespace: "cuisine" });
  const td = await getTranslations({ locale, namespace: "dish_type" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });

  const db = await getDb();
  let rows: MapRow[] = [];
  try {
    const { results = [] } = await db
      .prepare(
        `SELECT id, name_zh, name_ja, name_original, lat, lng, ward, city,
                cuisine_type, dish_type, authenticity,
                trusted_rating, raw_rating, trusted_review_count, raw_review_count,
                price_level, nearest_station, nearest_station_zh, station_distance_m,
                ai_summary_zh, ai_summary_ja, business_status, photos, google_maps_url
         FROM restaurants
         WHERE is_active = 1
           AND COALESCE(business_status, 'OPERATIONAL') != 'CLOSED_PERMANENTLY'
           AND lat IS NOT NULL AND lng IS NOT NULL
         ORDER BY COALESCE(trusted_rating, raw_rating, 0) DESC,
                  COALESCE(trusted_review_count, raw_review_count, 0) DESC`
      )
      .all<MapRow>();
    rows = results || [];
  } catch (error) {
    console.error("Map query error:", error);
  }

  const restaurants: MapRestaurant[] = rows
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .map((r) => {
      const cuisine = normalizeCuisineType(r.cuisine_type);
      const dishType = normalizeDishType(r.dish_type);
      const authenticity = normalizeAuthenticity(r.authenticity);
      const businessStatus = normalizeBusinessStatus(r.business_status);
      const photos = parsePhotoReferences(r.photos);
      const stationLabel = getStationLabel(r, locale);
      const stationKeys = stationAreas
        .filter((area) => matchesStationArea(r.nearest_station, area))
        .map((area) => area.key);
      const name = getRestaurantName(r, locale);
      const cuisineLabel = tc(cuisine);
      const dishTypeLabel = td(dishType);
      const ward = r.ward || r.city || "";
      const reviewCount = r.trusted_review_count || r.raw_review_count || 0;

      // 预拼接小写搜索串，客户端输入关键词时可零开销瞬时过滤中/日店名、车站、行政区与分类
      const searchText = [
        name,
        r.name_zh,
        r.name_ja,
        r.name_original,
        r.nearest_station,
        r.nearest_station_zh,
        ward,
        cuisineLabel,
        dishTypeLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return {
        id: r.id,
        name,
        lat: r.lat,
        lng: r.lng,
        ward,
        stationLabel,
        stationKeys,
        cuisine,
        cuisineLabel,
        dishType,
        dishTypeLabel,
        authenticity,
        authenticityLabel: ta(authenticity),
        rating: getRating(r),
        reviewCount,
        priceLevel: normalizePriceLevel(r.price_level),
        summarySnippet: trimSnippet(getRestaurantSummary(r, locale)),
        isTempClosed: businessStatus === "CLOSED_TEMPORARILY",
        // 宽度固定 600，与列表卡片共用 R2 缓存，避免额外触发 Google Photo API
        photo: photos.length > 0 ? photoSrc(photos[0], 600) : null,
        mapsUrl:
          r.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`,
        searchText,
      };
    });

  // 统计各商圈实际门店数，仅展示有收录的热门商圈并按门店数倒序排列
  const stationCountMap = new Map<string, number>();
  for (const r of restaurants) {
    for (const key of r.stationKeys) {
      stationCountMap.set(key, (stationCountMap.get(key) || 0) + 1);
    }
  }

  const stationPresets: MapStationPreset[] = stationAreas
    .map((area) => {
      const center = STATION_CENTERS[area.key] || { lng: 139.7036, lat: 35.6895, zoom: 14 };
      return {
        key: area.key,
        label: getStationAreaLabel(area, locale),
        count: stationCountMap.get(area.key) || 0,
        lng: center.lng,
        lat: center.lat,
        zoom: center.zoom,
      };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const initialFilters = {
    q: typeof sp.q === "string" ? sp.q.slice(0, 60) : "",
    cuisine: typeof sp.cuisine === "string" && cuisineTypes.includes(sp.cuisine as (typeof cuisineTypes)[number]) ? sp.cuisine : "",
    dishType: typeof sp.dish === "string" && dishTypes.includes(sp.dish as (typeof dishTypes)[number]) ? sp.dish : "",
    authenticity:
      typeof sp.auth === "string" && authenticityTypes.includes(sp.auth as (typeof authenticityTypes)[number]) ? sp.auth : "",
    station: typeof sp.station === "string" && stationPresets.some((s) => s.key === sp.station) ? sp.station : "",
    minRating: sp.minRating === "4.5" ? 4.5 : sp.minRating === "4" ? 4 : 0,
  };

  return (
    <RestaurantMap
      locale={locale}
      restaurants={restaurants}
      cuisineOptions={cuisineTypes.map((c) => ({ value: c, label: tc(c) }))}
      dishTypeOptions={dishTypes.map((d) => ({ value: d, label: td(d) }))}
      authenticityOptions={authenticityTypes
        .filter((a) => a !== "unknown")
        .map((a) => ({ value: a, label: ta(a) }))}
      stationPresets={stationPresets}
      initialFilters={initialFilters}
    />
  );
}
