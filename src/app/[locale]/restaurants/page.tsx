import { getDb } from "@/lib/cloudflare";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Filter, Map, MapPin, Search, Star } from "lucide-react";
import {
  authenticityTypes,
  cuisineTypes,
  getRating,
  getRestaurantName,
  getRestaurantSummary,
  normalizeAuthenticity,
  normalizeCuisineType,
  normalizePriceLevel,
  parsePhotoReferences,
  type Authenticity,
  type CuisineType,
  type RestaurantRow,
} from "@/lib/restaurant-types";
import { buildRestaurantSearchClause } from "@/lib/restaurant-search";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };
type SqlBind = string | number | boolean | null;
type SortOption = "rating" | "reviews" | "newest";

const minRatingOptions = [4.5, 4, 3.5] as const;

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
  return minRatingOptions.includes(rating as (typeof minRatingOptions)[number]) ? rating : null;
}

function getSortOption(value: string): SortOption {
  return value === "reviews" || value === "newest" ? value : "rating";
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const queryParams = await searchParams;
  const q = getQueryValue(queryParams.q).trim();
  const cuisine = getCuisineFilter(getQueryValue(queryParams.cuisine));
  const isZh = locale === "zh";
  const title = q
    ? (isZh ? `${q} 餐厅搜索` : `${q} の検索結果`)
    : (isZh ? "东京中餐餐厅索引" : "東京の中国料理レストラン一覧");
  const description = isZh
    ? "按菜系、正宗度、可信评分筛选东京和关东ガチ中華。支持川菜、粤菜、茶餐厅、湖南菜等关键词搜索。"
    : "料理ジャンル、認定、信頼スコアで東京・関東のガチ中華を検索できます。";
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (cuisine) query.set("cuisine", cuisine);

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/restaurants${query.toString() ? `?${query.toString()}` : ""}`,
    },
  };
}

export default async function RestaurantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "restaurant" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });
  const tc = await getTranslations({ locale, namespace: "cuisine" });
  const queryParams = await searchParams;
  
  const q = getQueryValue(queryParams.q).trim();
  const cuisine = getCuisineFilter(getQueryValue(queryParams.cuisine));
  const authenticityFilter = getAuthenticityFilter(getQueryValue(queryParams.authenticity));
  const minRating = getMinRatingFilter(getQueryValue(queryParams.minRating));
  const sort = getSortOption(getQueryValue(queryParams.sort));
  const hasFilters = Boolean(q || cuisine || authenticityFilter || minRating || sort !== "rating");

  const db = await getDb();

  // 构建查询语句
  let sql = `SELECT * FROM restaurants WHERE is_active = 1`;
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

  if (authenticityFilter) {
    sql += ` AND authenticity = ?`;
    binds.push(authenticityFilter);
  }

  if (minRating) {
    sql += ` AND COALESCE(trusted_rating, raw_rating, 0) >= ?`;
    binds.push(minRating);
  }

  if (sort === "reviews") {
    sql += ` ORDER BY raw_review_count DESC, trusted_rating DESC LIMIT 50`;
  } else if (sort === "newest") {
    sql += ` ORDER BY last_synced_at DESC, updated_at DESC, trusted_rating DESC LIMIT 50`;
  } else {
    sql += ` ORDER BY trusted_rating DESC, raw_review_count DESC LIMIT 50`;
  }

  let restaurants: RestaurantRow[] = [];
  try {
    const { results = [] } = await db.prepare(sql).bind(...binds).all<RestaurantRow>();
    restaurants = results || [];
  } catch (error) {
    console.error("Database query error:", error);
  }

  const filterQuery = new URLSearchParams();
  if (q) filterQuery.set("q", q);
  if (cuisine) filterQuery.set("cuisine", cuisine);
  if (authenticityFilter) filterQuery.set("authenticity", authenticityFilter);
  if (minRating) filterQuery.set("minRating", String(minRating));
  if (sort !== "rating") filterQuery.set("sort", sort);
  const filterQueryString = filterQuery.toString();
  const mapHref = `/${locale}/map${filterQueryString ? `?${filterQueryString}` : ""}`;
  const copy = locale === "zh"
    ? {
        title: q ? `搜索结果: "${q}"` : "全部餐厅",
        subtitle: "按菜系、正宗度和可信评分筛选东京餐厅。",
        search: "餐厅、菜系、地区",
        allCuisines: "全部菜系",
        allAuthenticity: "全部认证",
        minRating: "最低可信评分",
        anyRating: "不限评分",
        sort: "排序",
        sortRating: "可信评分优先",
        sortReviews: "评论量优先",
        sortNewest: "最近同步优先",
        submit: "筛选",
        reset: "清除",
        map: "地图视图",
        count: `找到 ${restaurants.length} 家餐厅`,
        empty: "没有找到相关餐厅。请尝试其他关键词或菜系。",
      }
    : {
        title: q ? `検索結果: "${q}"` : "すべてのレストラン",
        subtitle: "料理ジャンル・認定・信頼スコアで東京の店を絞り込み。",
        search: "店名・ジャンル・エリア",
        allCuisines: "すべてのジャンル",
        allAuthenticity: "すべての認定",
        minRating: "最低信頼スコア",
        anyRating: "指定なし",
        sort: "並び替え",
        sortRating: "信頼スコア順",
        sortReviews: "レビュー数順",
        sortNewest: "同期が新しい順",
        submit: "絞り込む",
        reset: "クリア",
        map: "マップ表示",
        count: `${restaurants.length}件のレストラン`,
        empty: "該当するレストランが見つかりません。条件を変えてお試しください。",
      };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase mb-2 text-vermilion-700">
              <Filter size={14} />
              {locale === "zh" ? "餐厅索引" : "Restaurant Index"}
            </div>
            <h1 className="font-serif font-bold text-3xl mb-2" style={{ color: "var(--color-ink-900)" }}>
              {copy.title}
            </h1>
            <p className="text-sm text-ink-400">{copy.subtitle}</p>
          </div>

          <Link href={mapHref} className="btn-primary w-full sm:w-auto">
            <Map size={16} />
            {copy.map}
          </Link>
        </div>

        <form action={`/${locale}/restaurants`} className="bg-white border border-warm-200 rounded-xl shadow-sm p-4">
          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] gap-3">
            <label className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none z-10" />
              <input
                name="q"
                defaultValue={q}
                placeholder={copy.search}
                className="search-input search-input-compact search-input-with-icon"
              />
            </label>

            <select name="cuisine" defaultValue={cuisine} className="filter-select">
              <option value="">{copy.allCuisines}</option>
              {cuisineTypes.map((type) => (
                <option key={type} value={type}>{tc(type)}</option>
              ))}
            </select>

            <select name="authenticity" defaultValue={authenticityFilter} className="filter-select">
              <option value="">{copy.allAuthenticity}</option>
              {authenticityTypes.map((type) => (
                <option key={type} value={type}>{ta(type)}</option>
              ))}
            </select>

            <select name="minRating" defaultValue={minRating ? String(minRating) : ""} className="filter-select">
              <option value="">{copy.anyRating}</option>
              {minRatingOptions.map((rating) => (
                <option key={rating} value={rating}>{copy.minRating} {rating}+</option>
              ))}
            </select>

            <select name="sort" defaultValue={sort} className="filter-select">
              <option value="rating">{copy.sortRating}</option>
              <option value="reviews">{copy.sortReviews}</option>
              <option value="newest">{copy.sortNewest}</option>
            </select>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary min-h-11 px-4 flex-1 xl:flex-none">
                {copy.submit}
              </button>
              {hasFilters && (
                <Link
                  href={`/${locale}/restaurants`}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-warm-200 bg-white px-4 text-sm font-semibold text-ink-700 hover:text-vermilion-700"
                >
                  {copy.reset}
                </Link>
              )}
            </div>
          </div>
        </form>

        <div className="text-sm text-ink-400">{copy.count}</div>
      </div>

      {restaurants.length === 0 ? (
        <div className="text-center py-20 text-ink-400">
          <p>{copy.empty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {restaurants.map((restaurant) => {
            const name = getRestaurantName(restaurant, locale);
            const summary = getRestaurantSummary(restaurant, locale);
            const authenticity = normalizeAuthenticity(restaurant.authenticity);
            const cuisineType = normalizeCuisineType(restaurant.cuisine_type);
            const priceLevel = normalizePriceLevel(restaurant.price_level);
            
            let photoUrl = "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop"; // fallback
            const photos = parsePhotoReferences(restaurant.photos);
            if (photos.length > 0) {
              const first = photos[0];
              photoUrl = first.startsWith("http")
                ? first
                : `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${first}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
            }

            return (
              <Link key={restaurant.id} href={`/${locale}/restaurants/${restaurant.id}`} className="restaurant-card group block">
                <div className="relative h-48 overflow-hidden bg-warm-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={photoUrl} 
                    alt={name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-3 right-3 flex gap-2">
                    <span className={`badge-${authenticity}`}>
                      {authenticity === "authentic" ? "🔴 " : authenticity === "adapted" ? "🟡 " : "🔵 "}
                      {ta(authenticity)}
                    </span>
                  </div>
                </div>
                
                <div className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg leading-tight" style={{ color: "var(--color-ink-900)" }}>
                      {name}
                    </h3>
                    <div className="flex items-center gap-1 bg-warm-50 px-2 py-1 rounded-md" style={{ color: "var(--color-ink-900)" }}>
                      <Star size={14} className="fill-gold-500 text-gold-500" style={{ color: "var(--color-gold-500)", fill: "var(--color-gold-500)" }} />
                      <span className="font-bold text-sm">{getRating(restaurant).toFixed(1)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs mb-4" style={{ color: "var(--color-ink-400)" }}>
                    <span className="flex items-center gap-1"><MapPin size={12} /> {restaurant.ward || restaurant.city}</span>
                    <span className={`cuisine-tag cuisine-${cuisineType}`}>{tc(cuisineType)}</span>
                    {priceLevel && <span>{t(`price_level.${priceLevel}`)}</span>}
                  </div>

                  {typeof restaurant.value_score === "number" && (
                    <div className="mb-4 inline-flex items-center rounded-md bg-gold-50 px-2.5 py-1 text-xs font-semibold text-gold-700">
                      {t("value_score")} {restaurant.value_score}
                    </div>
                  )}

                  {summary && (
                    <div className="ai-summary-card text-sm leading-snug" style={{ color: "var(--color-ink-700)" }}>
                      {summary}
                    </div>
                  )}
                  
                  <div className="mt-4 text-xs flex justify-between items-center" style={{ color: "var(--color-ink-400)" }}>
                    <span>{restaurant.trusted_review_count || 0} {t("trusted_reviews")}</span>
                    <span>Google: {(restaurant.raw_rating || 0).toFixed(1)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
