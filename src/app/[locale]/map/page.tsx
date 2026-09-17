import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/cloudflare";
import RestaurantMap, { type MapRestaurant } from "@/components/RestaurantMap";
import {
  authenticityTypes,
  cuisineTypes,
  getRating,
  getRestaurantName,
  normalizeAuthenticity,
  normalizeCuisineType,
  parsePhotoReferences,
  photoSrc,
  type RestaurantRow,
} from "@/lib/restaurant-types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

/** 地图只需要这些列，不用 SELECT *（少拉一半数据，也少序列化给客户端） */
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
  | "authenticity"
  | "trusted_rating"
  | "raw_rating"
  | "photos"
  | "google_maps_url"
>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "地图找餐厅" : "マップで探す",
    description:
      locale === "zh"
        ? "在地图上浏览东京和关东的ガチ中華，按菜系、正宗度和评分实时筛选，点击标记查看详情。"
        : "東京・関東のガチ中華を地図上で探せます。ジャンル・認定・評価で絞り込み、ピンをタップして詳細を確認。",
    alternates: {
      canonical: `/${locale}/map`,
      languages: { zh: "/zh/map", ja: "/ja/map", "x-default": "/zh/map" },
    },
  };
}

export default async function MapPage({ params }: Props) {
  const { locale } = await params;
  const tc = await getTranslations({ locale, namespace: "cuisine" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });
  const isZh = locale === "zh";

  const db = await getDb();
  let rows: MapRow[] = [];
  try {
    const { results = [] } = await db
      .prepare(
        `SELECT id, name_zh, name_ja, name_original, lat, lng, ward, city,
                cuisine_type, authenticity, trusted_rating, raw_rating, photos, google_maps_url
         FROM restaurants
         WHERE is_active = 1 AND lat IS NOT NULL AND lng IS NOT NULL
         ORDER BY trusted_rating DESC`
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
      const authenticity = normalizeAuthenticity(r.authenticity);
      const photos = parsePhotoReferences(r.photos);
      return {
        id: r.id,
        name: getRestaurantName(r, locale),
        lat: r.lat,
        lng: r.lng,
        ward: r.ward || r.city || "",
        cuisine,
        cuisineLabel: tc(cuisine),
        authenticity,
        authenticityLabel: ta(authenticity),
        rating: getRating(r),
        // 宽度固定 600，和列表卡片共用 R2 缓存，绝不因为地图多打一次 Google Photo API
        photo: photos.length > 0 ? photoSrc(photos[0], 600) : null,
        mapsUrl:
          r.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`,
      };
    });

  return (
    <RestaurantMap
      locale={locale}
      restaurants={restaurants}
      cuisineOptions={cuisineTypes.map((c) => ({ value: c, label: tc(c) }))}
      authenticityOptions={authenticityTypes
        .filter((a) => a !== "unknown")
        .map((a) => ({ value: a, label: ta(a) }))}
      copy={{
        allCuisines: isZh ? "全部菜系" : "全ジャンル",
        allAuthenticity: isZh ? "全部认证" : "すべての認定",
        minRating: isZh ? "评分" : "評価",
        count: isZh ? "家" : "件",
        empty: isZh ? "没有符合条件的餐厅" : "条件に合う店舗がありません",
        detail: isZh ? "查看详情" : "詳細",
        openInMaps: isZh ? "导航" : "ナビ",
        reset: isZh ? "清除筛选" : "条件をクリア",
        loading: isZh ? "地图加载中…" : "地図を読み込み中…",
        listTitle: isZh ? "餐厅列表" : "店舗リスト",
        listHint: isZh ? "点一条 → 地图定位" : "項目をタップ → 地図が移動",
      }}
    />
  );
}
