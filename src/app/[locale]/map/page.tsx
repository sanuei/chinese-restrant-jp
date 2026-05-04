import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MapPinned } from "lucide-react";
import { getTranslations } from "next-intl/server";
import RestaurantMap, { type MapRestaurant } from "@/components/RestaurantMap";
import { getDb } from "@/lib/cloudflare";
import {
  authenticityTypes,
  cuisineTypes,
  getRating,
  getRestaurantName,
  getRestaurantSummary,
  normalizeAuthenticity,
  normalizeCuisineType,
  type Authenticity,
  type CuisineType,
  type RestaurantRow,
} from "@/lib/restaurant-types";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };
type SqlBind = string | number | boolean | null;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
};

function getQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getCuisineFilter(value: string): CuisineType | "" {
  return cuisineTypes.includes(value as CuisineType) ? (value as CuisineType) : "";
}

function getAuthenticityFilter(value: string): Authenticity | "" {
  return authenticityTypes.includes(value as Authenticity) ? (value as Authenticity) : "";
}

function getMinRatingFilter(value: string): number | null {
  const rating = Number(value);
  return rating === 4.5 || rating === 4 || rating === 3.5 ? rating : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "地图找餐厅" : "マップで探す",
  };
}

export default async function MapPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const queryParams = await searchParams;
  const tc = await getTranslations({ locale, namespace: "cuisine" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });

  const q = getQueryValue(queryParams.q).trim();
  const cuisine = getCuisineFilter(getQueryValue(queryParams.cuisine));
  const authenticity = getAuthenticityFilter(getQueryValue(queryParams.authenticity));
  const minRating = getMinRatingFilter(getQueryValue(queryParams.minRating));
  const selectedId = getQueryValue(queryParams.restaurant);

  let sql = `SELECT * FROM restaurants WHERE is_active = 1 AND lat IS NOT NULL AND lng IS NOT NULL`;
  const binds: SqlBind[] = [];

  if (q) {
    sql += ` AND (name_zh LIKE ? OR name_ja LIKE ? OR name_original LIKE ? OR address LIKE ? OR ward LIKE ?)`;
    const likeQ = `%${q}%`;
    binds.push(likeQ, likeQ, likeQ, likeQ, likeQ);
  }

  if (cuisine) {
    sql += ` AND cuisine_type = ?`;
    binds.push(cuisine);
  }

  if (authenticity) {
    sql += ` AND authenticity = ?`;
    binds.push(authenticity);
  }

  if (minRating) {
    sql += ` AND COALESCE(trusted_rating, raw_rating, 0) >= ?`;
    binds.push(minRating);
  }

  sql += ` ORDER BY trusted_rating DESC, raw_review_count DESC LIMIT 200`;

  const db = await getDb();
  let rows: RestaurantRow[] = [];

  try {
    const { results = [] } = await db.prepare(sql).bind(...binds).all<RestaurantRow>();
    rows = results;
  } catch (error) {
    console.error("Map query error:", error);
  }

  const restaurants: MapRestaurant[] = rows
    .filter((restaurant) => Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng))
    .map((restaurant) => {
      const cuisineType = normalizeCuisineType(restaurant.cuisine_type);
      const restaurantAuthenticity = normalizeAuthenticity(restaurant.authenticity);
      return {
        id: restaurant.id,
        name: getRestaurantName(restaurant, locale),
        address: restaurant.address,
        lat: restaurant.lat,
        lng: restaurant.lng,
        rating: getRating(restaurant),
        rawRating: restaurant.raw_rating || 0,
        cuisineLabel: tc(cuisineType),
        cuisineType,
        authenticityLabel: ta(restaurantAuthenticity),
        authenticity: restaurantAuthenticity,
        summary: getRestaurantSummary(restaurant, locale),
        ward: restaurant.ward,
      };
    });

  const backQuery = new URLSearchParams();
  if (q) backQuery.set("q", q);
  if (cuisine) backQuery.set("cuisine", cuisine);
  if (authenticity) backQuery.set("authenticity", authenticity);
  if (minRating) backQuery.set("minRating", String(minRating));
  const backHref = `/${locale}/restaurants${backQuery.toString() ? `?${backQuery.toString()}` : ""}`;
  const copy = locale === "zh"
    ? {
        eyebrow: "地图全景",
        title: "在地图上找一口家乡味",
        subtitle: "用位置关系快速判断今天去哪一家，列表条件会同步带到地图。",
        back: "返回列表",
      }
    : {
        eyebrow: "Map View",
        title: "地図で本格中華を探す",
        subtitle: "位置関係を見ながら、今日行きたい一軒を選べます。",
        back: "リストへ戻る",
      };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase mb-2 text-vermilion-700">
            <MapPinned size={15} />
            {copy.eyebrow}
          </div>
          <h1 className="font-serif text-3xl font-black leading-tight text-ink-900">{copy.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-400">{copy.subtitle}</p>
        </div>
        <Link
          href={backHref}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-warm-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:text-vermilion-700"
        >
          <ArrowLeft size={16} />
          {copy.back}
        </Link>
      </div>

      <RestaurantMap
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
        restaurants={restaurants}
        locale={locale}
        selectedId={selectedId}
      />
    </div>
  );
}
