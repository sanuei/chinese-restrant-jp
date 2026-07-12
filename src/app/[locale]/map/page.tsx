import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MapPin, MapPinned, Star } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/cloudflare";
import {
  authenticityTypes,
  cuisineTypes,
  getRating,
  getRestaurantName,
  normalizeAuthenticity,
  normalizeCuisineType,
  type Authenticity,
  type CuisineType,
  type RestaurantRow,
} from "@/lib/restaurant-types";
import { buildRestaurantSearchClause } from "@/lib/restaurant-search";

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

// 优先用采集时保存的官方 Google Maps 链接；没有的话用经纬度拼一个搜索链接。
// 这里只生成一个普通网址（maps.google.com），不调用任何计费 API。
function buildGoogleMapsUrl(restaurant: RestaurantRow): string {
  if (restaurant.google_maps_url) return restaurant.google_maps_url;
  return `https://www.google.com/maps/search/?api=1&query=${restaurant.lat},${restaurant.lng}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "地图找餐厅" : "マップで探す",
    description: locale === "zh"
      ? "按地区浏览东京和关东ガチ中華，按菜系、评分和正宗度筛选，一键在 Google 地图中打开。"
      : "地域別に東京・関東のガチ中華を一覧表示し、ジャンルや信頼スコアで絞り込んで Google マップで開けます。",
    alternates: {
      canonical: `/${locale}/map`,
      languages: {
        zh: "/zh/map",
        ja: "/ja/map",
        "x-default": "/zh/map",
      },
    },
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

  let sql = `SELECT * FROM restaurants WHERE is_active = 1 AND lat IS NOT NULL AND lng IS NOT NULL`;
  const binds: SqlBind[] = [];

  if (q) {
    const searchClause = buildRestaurantSearchClause(q);
    if (searchClause) {
      sql += ` AND ${searchClause.condition}`;
      binds.push(...searchClause.binds);
    }
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

  const restaurants = rows.filter((restaurant) => Number.isFinite(restaurant.lat) && Number.isFinite(restaurant.lng));

  const backQuery = new URLSearchParams();
  if (q) backQuery.set("q", q);
  if (cuisine) backQuery.set("cuisine", cuisine);
  if (authenticity) backQuery.set("authenticity", authenticity);
  if (minRating) backQuery.set("minRating", String(minRating));
  const backHref = `/${locale}/restaurants${backQuery.toString() ? `?${backQuery.toString()}` : ""}`;
  const copy = locale === "zh"
    ? {
        eyebrow: "地点一览",
        title: "找一口家乡味，一键在地图中打开",
        subtitle: "按条件筛选后，点击「在 Google 地图中打开」即可跳转导航。",
        back: "返回列表",
        empty: "当前筛选条件下没有可显示的餐厅。",
        openInMaps: "在 Google 地图中打开",
        viewDetail: "查看详情",
        count: "家餐厅",
      }
    : {
        eyebrow: "Location List",
        title: "本格中華を探して、地図アプリで開く",
        subtitle: "条件で絞り込んだあと「Google マップで開く」からナビできます。",
        back: "リストへ戻る",
        empty: "現在の条件では表示できるレストランがありません。",
        openInMaps: "Google マップで開く",
        viewDetail: "詳細を見る",
        count: "件",
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

      {restaurants.length === 0 ? (
        <div className="py-20 text-center text-ink-400">{copy.empty}</div>
      ) : (
        <>
          <div className="mb-4 text-sm font-semibold text-ink-700">
            {restaurants.length} {copy.count}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((restaurant) => {
              const cuisineType = normalizeCuisineType(restaurant.cuisine_type);
              const restaurantAuthenticity = normalizeAuthenticity(restaurant.authenticity);
              const name = getRestaurantName(restaurant, locale);
              const rating = getRating(restaurant);
              return (
                <div key={restaurant.id} className="flex flex-col rounded-xl border border-warm-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="font-bold leading-snug text-ink-900">{name}</div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-warm-50 px-2 py-1 text-xs font-bold text-ink-900">
                      <Star size={13} className="fill-gold-500 text-gold-500" />
                      {rating.toFixed(1)}
                    </span>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                    <span className={`cuisine-tag cuisine-${cuisineType}`}>{tc(cuisineType)}</span>
                    <span>{ta(restaurantAuthenticity)}</span>
                  </div>
                  <div className="mb-4 flex items-start gap-2 text-xs text-ink-400">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-vermilion-700" />
                    <span>{restaurant.ward || restaurant.address}</span>
                  </div>
                  <div className="mt-auto flex items-center gap-3 border-t border-warm-100 pt-3 text-xs font-semibold">
                    <a
                      href={buildGoogleMapsUrl(restaurant)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-vermilion-700 hover:underline"
                    >
                      <ExternalLink size={13} />
                      {copy.openInMaps}
                    </a>
                    <Link href={`/${locale}/restaurants/${restaurant.id}`} className="text-ink-700 hover:underline">
                      {copy.viewDetail}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
