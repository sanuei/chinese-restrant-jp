import { getDb } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/session";
import { getFavoritedIds } from "@/lib/favorites";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Filter, MapPin, Star, TrainFront } from "lucide-react";
import FavoriteButton from "@/components/FavoriteButton";
import RestaurantFilterBar from "@/components/RestaurantFilterBar";
import {
  authenticityTypes,
  cuisineTypes,
  dishTypes,
  getRating,
  getRestaurantName,
  getRestaurantSummary,
  getStationLabel,
  isPermanentlyClosed,
  isTemporarilyClosed,
  normalizeAuthenticity,
  normalizeCuisineType,
  normalizeDishType,
  normalizePriceLevel,
  parsePhotoReferences,
  photoSrc,
  type Authenticity,
  type CuisineType,
  type DishType,
  type RestaurantRow,
} from "@/lib/restaurant-types";
import { buildRestaurantSearchClause } from "@/lib/restaurant-search";
import {
  buildStationAreaSqlClause,
  getStationArea,
  getStationAreaLabel,
  stationAreas,
  type StationAreaKey,
} from "@/lib/station-areas";

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

function getDishTypeFilter(value: string): DishType | "" {
  return dishTypes.includes(value as DishType) ? (value as DishType) : "";
}

function getAuthenticityFilter(value: string): Authenticity | "" {
  return authenticityTypes.includes(value as Authenticity) ? (value as Authenticity) : "";
}

function getStationFilter(value: string): StationAreaKey | "" {
  return getStationArea(value)?.key ?? "";
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
    ? isZh
      ? `${q} 餐厅搜索`
      : `${q} の検索結果`
    : isZh
      ? "东京中餐餐厅索引"
      : "東京の中国料理レストラン一覧";
  const description = isZh
    ? "按菜系、品类、熟食卤味、中华物产店、正宗度与可信评分筛选东京和关东中餐。"
    : "料理ジャンル、業態、認定、信頼スコアで東京・関東のガチ中華を検索できます。";
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
  const isZh = locale === "zh";
  const t = await getTranslations({ locale, namespace: "restaurant" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });
  const tc = await getTranslations({ locale, namespace: "cuisine" });
  const td = await getTranslations({ locale, namespace: "dish_type" });
  const queryParams = await searchParams;

  const q = getQueryValue(queryParams.q).trim();
  const cuisine = getCuisineFilter(getQueryValue(queryParams.cuisine));
  const dishType = getDishTypeFilter(getQueryValue(queryParams.dish_type));
  const station = getStationFilter(getQueryValue(queryParams.station));
  const stationInfo = station ? getStationArea(station) : null;
  const authenticityFilter = getAuthenticityFilter(getQueryValue(queryParams.authenticity));
  const minRating = getMinRatingFilter(getQueryValue(queryParams.minRating));
  const sort = getSortOption(getQueryValue(queryParams.sort));

  const db = await getDb();

  let whereSql = `WHERE is_active = 1`;
  const binds: SqlBind[] = [];

  if (q) {
    const searchClause = buildRestaurantSearchClause(q);
    if (searchClause) {
      whereSql += ` AND ${searchClause.condition}`;
      binds.push(...searchClause.binds);
    }
  }

  if (cuisine) {
    whereSql += ` AND cuisine_type = ?`;
    binds.push(cuisine);
  }

  if (dishType) {
    whereSql += ` AND dish_type = ?`;
    binds.push(dishType);
  }

  if (station) {
    const stationClause = buildStationAreaSqlClause(station);
    if (stationClause) {
      whereSql += ` AND ${stationClause.condition}`;
      binds.push(...stationClause.binds);
    }
  }

  if (authenticityFilter) {
    whereSql += ` AND authenticity = ?`;
    binds.push(authenticityFilter);
  }

  if (minRating) {
    whereSql += ` AND COALESCE(trusted_rating, raw_rating, 0) >= ?`;
    binds.push(minRating);
  }

  // 停业店保留供搜索查看，但自动沉底不抢正常营业餐厅的展示位
  const closedOrderPrefix = `CASE WHEN business_status = 'CLOSED_PERMANENTLY' THEN 1 ELSE 0 END ASC`;
  const orderSql =
    sort === "reviews"
      ? `ORDER BY ${closedOrderPrefix}, raw_review_count DESC, trusted_rating DESC`
      : sort === "newest"
        ? `ORDER BY ${closedOrderPrefix}, last_synced_at DESC, updated_at DESC, trusted_rating DESC`
        : `ORDER BY ${closedOrderPrefix}, trusted_rating DESC, raw_review_count DESC`;

  const displayLimit = 120;
  let restaurants: RestaurantRow[] = [];
  let totalCount = 0;
  try {
    const [countRow, listRes] = await Promise.all([
      db
        .prepare(`SELECT COUNT(*) AS total FROM restaurants ${whereSql}`)
        .bind(...binds)
        .first<{ total: number }>(),
      db
        .prepare(`SELECT * FROM restaurants ${whereSql} ${orderSql} LIMIT ${displayLimit}`)
        .bind(...binds)
        .all<RestaurantRow>(),
    ]);
    restaurants = listRes.results || [];
    totalCount = countRow?.total ?? restaurants.length;
  } catch (error) {
    console.error("Database query error:", error);
  }

  const isLoggedIn = Boolean(await getCurrentUser());
  const favoritedIds = await getFavoritedIds(restaurants.map((restaurant) => restaurant.id));

  const filterQuery = new URLSearchParams();
  if (q) filterQuery.set("q", q);
  if (cuisine) filterQuery.set("cuisine", cuisine);
  if (dishType) filterQuery.set("dish_type", dishType);
  if (station) filterQuery.set("station", station);
  if (authenticityFilter) filterQuery.set("authenticity", authenticityFilter);
  if (minRating) filterQuery.set("minRating", String(minRating));
  if (sort !== "rating") filterQuery.set("sort", sort);
  const filterQueryString = filterQuery.toString();
  const mapHref = `/${locale}/map${filterQueryString ? `?${filterQueryString}` : ""}`;
  const stationTitle = stationInfo ? getStationAreaLabel(stationInfo, locale) : "";
  const dishTitle = dishType ? td(dishType) : "";

  const headingTitle = q
    ? isZh
      ? `搜索结果: "${q}"`
      : `検索結果: "${q}"`
    : dishTitle
      ? isZh
        ? `${dishTitle}精选`
        : `${dishTitle}一覧`
      : stationTitle
        ? isZh
          ? `${stationTitle} 附近餐厅`
          : `${stationTitle} エリアのレストラン`
        : isZh
          ? "全部餐厅"
          : "すべてのレストラン";

  const countText = isZh
    ? totalCount > restaurants.length
      ? `找到 ${totalCount} 家门店（展示前 ${restaurants.length} 家）`
      : `共找到 ${totalCount} 家门店`
    : totalCount > restaurants.length
      ? `${totalCount}件ヒット（上位${restaurants.length}件を表示）`
      : `${totalCount}件の店舗`;

  const emptyText = isZh
    ? "没有找到符合条件的门店，试试切换品类或清空部分筛选条件。"
    : "該当する店舗が見つかりません。条件を変えてお試しください。";

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 pb-10 sm:px-6 md:py-10 lg:px-8">
      {/* 桌面端页头标题（移动端为极速扫店模式，首屏直接展示美团风吸顶搜索与4栏筛选） */}
      <div className="mb-5 hidden md:block">
        <div className="mb-1.5 inline-flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase text-vermilion-700">
          <Filter size={13} />
          {isZh ? "餐厅与特色门店索引" : "Restaurant Index"}
        </div>
        <h1 className="font-serif text-3xl font-bold text-ink-900">{headingTitle}</h1>
        <p className="mt-1 text-sm text-ink-400">
          {isZh
            ? "按细分品类、熟食卤味、中华物产店、菜系、商圈与可信评分快速筛选东京与关东好店。"
            : "業態・料理ジャンル・駅エリア・信頼スコアで東京と関東のお店を絞り込み。"}
        </p>
      </div>

      {/* 全新双端自适应筛选栏（桌面宽敞双层面板 + 移动端美团4栏下拉抽屉） */}
      <RestaurantFilterBar
        locale={locale}
        initial={{
          q,
          cuisine,
          dishType,
          station,
          authenticity: authenticityFilter,
          minRating: minRating ? String(minRating) : "",
          sort,
        }}
        cuisineOptions={cuisineTypes.map((c) => ({ value: c, label: tc(c) }))}
        dishTypeOptions={dishTypes.map((d) => ({ value: d, label: td(d) }))}
        stationOptions={stationAreas.map((s) => ({
          value: s.key,
          label: getStationAreaLabel(s, locale),
        }))}
        authenticityOptions={authenticityTypes.map((a) => ({ value: a, label: ta(a) }))}
        mapHref={mapHref}
        totalCountText={countText}
      />

      {/* 门店列表 */}
      {restaurants.length === 0 ? (
        <div className="py-20 text-center text-sm text-ink-400">
          <p>{emptyText}</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:mt-6 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
          {restaurants.map((restaurant) => {
            const name = getRestaurantName(restaurant, locale);
            const summary = getRestaurantSummary(restaurant, locale);
            const authenticity = normalizeAuthenticity(restaurant.authenticity);
            const cuisineType = normalizeCuisineType(restaurant.cuisine_type);
            const currentDish = normalizeDishType(restaurant.dish_type);
            const priceLevel = normalizePriceLevel(restaurant.price_level);
            const stationLabel = getStationLabel(restaurant, locale);
            const closedPermanently = isPermanentlyClosed(restaurant);
            const closedTemporarily = isTemporarilyClosed(restaurant);

            let photoUrl =
              "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop";
            const photos = parsePhotoReferences(restaurant.photos);
            if (photos.length > 0) {
              photoUrl = photoSrc(photos[0], 600);
            }

            return (
              <Link
                key={restaurant.id}
                href={`/${locale}/restaurants/${restaurant.id}`}
                className={`restaurant-card group block overflow-hidden ${closedPermanently ? "opacity-75" : ""}`}
              >
                {/* ==================== 移动端：美团 App 经典左图右文紧凑信息流卡 ==================== */}
                <div className="flex gap-3 p-3 md:hidden">
                  <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-warm-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl}
                      alt={name}
                      loading="lazy"
                      className={`h-full w-full object-cover ${closedPermanently ? "grayscale" : ""}`}
                    />
                    <span
                      className={`badge-${authenticity} !px-1.5 !py-[1px] !text-[10px] absolute top-1.5 left-1.5`}
                    >
                      {ta(authenticity)}
                    </span>
                    {(closedPermanently || closedTemporarily) && (
                      <span className="absolute inset-x-0 bottom-0 bg-black/75 py-0.5 text-center text-[10px] font-bold text-amber-200">
                        {closedPermanently
                          ? isZh
                            ? "已停业"
                            : "閉店"
                          : isZh
                            ? "暂停营业"
                            : "休業中"}
                      </span>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-1 font-serif text-[15px] font-bold leading-snug text-white">
                          {name}
                        </h3>
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-[#f2cb72]/14 px-1.5 py-0.5 text-xs font-extrabold text-[#f2cb72]">
                          <Star size={11} className="fill-[#f2cb72] text-[#f2cb72]" />
                          {getRating(restaurant).toFixed(1)}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-white/55">
                        <span className={`cuisine-tag !py-0 !px-1.5 !text-[10px] cuisine-${cuisineType}`}>
                          {tc(cuisineType)}
                        </span>
                        <span className="rounded border border-white/12 bg-white/[0.05] px-1.5 py-0 text-[10px] text-white/75">
                          {td(currentDish)}
                        </span>
                        {priceLevel && <span>{t(`price_level.${priceLevel}`)}</span>}
                      </div>

                      {summary && (
                        <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-[#cfc8bc]">
                          {summary}
                        </p>
                      )}
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-white/45">
                      <span className="inline-flex min-w-0 items-center gap-1 truncate">
                        {stationLabel ? (
                          <>
                            <TrainFront size={11} className="shrink-0 text-[#f2cb72]/80" />
                            <span className="truncate">{stationLabel}</span>
                          </>
                        ) : (
                          <>
                            <MapPin size={11} className="shrink-0" />
                            <span className="truncate">{restaurant.ward || restaurant.city}</span>
                          </>
                        )}
                      </span>
                      <span className="shrink-0">
                        {restaurant.raw_review_count || restaurant.trusted_review_count || 0}
                        {isZh ? "条评" : "件"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ==================== 桌面端：精致 3 列大图卡 ==================== */}
                <div className="hidden md:block">
                  <div className="relative h-48 overflow-hidden bg-warm-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl}
                      alt={name}
                      loading="lazy"
                      className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${closedPermanently ? "grayscale" : ""}`}
                    />
                    <div className="absolute top-3 right-3 flex gap-2">
                      {closedPermanently && (
                        <span className="inline-flex items-center rounded-full border border-red-400/50 bg-black/80 px-2.5 py-0.5 font-serif text-xs font-bold text-red-300 backdrop-blur-md">
                          {isZh ? "已停业" : "閉店"}
                        </span>
                      )}
                      {closedTemporarily && (
                        <span className="inline-flex items-center rounded-full border border-amber-400/50 bg-black/80 px-2.5 py-0.5 font-serif text-xs font-bold text-amber-200 backdrop-blur-md">
                          {isZh ? "暂停营业" : "休業中"}
                        </span>
                      )}
                      <span className={`badge-${authenticity}`}>{ta(authenticity)}</span>
                    </div>
                    <div className="absolute top-3 left-3">
                      <FavoriteButton
                        restaurantId={restaurant.id}
                        initialFavorited={favoritedIds.has(restaurant.id)}
                        isLoggedIn={isLoggedIn}
                        locale={locale}
                      />
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="font-serif text-lg font-bold leading-tight text-ink-900 group-hover:text-gold-300 transition-colors">
                        {name}
                      </h3>
                      <div className="flex shrink-0 items-center gap-1 rounded-md bg-warm-50 px-2 py-1 text-ink-900">
                        <Star
                          size={14}
                          className="fill-gold-500 text-gold-500"
                          style={{ color: "var(--color-gold-500)", fill: "var(--color-gold-500)" }}
                        />
                        <span className="text-sm font-bold">{getRating(restaurant).toFixed(1)}</span>
                      </div>
                    </div>

                    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                      <span className="inline-flex items-center gap-1">
                        {stationLabel ? (
                          <>
                            <TrainFront size={12} className="text-gold-300" />
                            <span>{stationLabel}</span>
                          </>
                        ) : (
                          <>
                            <MapPin size={12} />
                            <span>{restaurant.ward || restaurant.city}</span>
                          </>
                        )}
                      </span>
                      <span className={`cuisine-tag cuisine-${cuisineType}`}>{tc(cuisineType)}</span>
                      <span className="rounded border border-white/12 bg-white/[0.04] px-1.5 py-0.5 text-[11px] font-medium text-white/75">
                        {td(currentDish)}
                      </span>
                      {priceLevel && <span>{t(`price_level.${priceLevel}`)}</span>}
                    </div>

                    {summary && (
                      <div className="ai-summary-card text-sm leading-snug text-ink-700">
                        {summary}
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between text-xs text-ink-400">
                      <span>
                        {restaurant.trusted_review_count || 0} {t("trusted_reviews")}
                      </span>
                      <span>Google: {(restaurant.raw_rating || 0).toFixed(1)}</span>
                    </div>
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
