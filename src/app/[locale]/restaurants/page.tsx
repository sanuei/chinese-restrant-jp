import { getDb } from "@/lib/cloudflare";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  Clock3,
  Flame,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  Trophy,
  X,
} from "lucide-react";
import {
  buildRestaurantSearchClause,
  getCuisineTypesForSearchQuery,
} from "@/lib/restaurant-search";
import {
  formatSyncLabel,
  getAreaLabel,
  getOpeningStatus,
  getPriceLevelSymbols,
  getPrimaryPhotoUrl,
  getTrustSummary,
  isTrustedPriority,
  matchesBusinessFilter,
  matchesScene,
  sortRestaurants,
  type BusinessFilter,
  type DiscoveryScene,
  type DiscoverySort,
} from "@/lib/restaurant-discovery";
import {
  authenticityTypes,
  cuisineTypes,
  getRating,
  getRestaurantName,
  getRestaurantSummary,
  normalizeAuthenticity,
  normalizeCuisineType,
  normalizePriceLevel,
  type Authenticity,
  type CuisineType,
  type RestaurantRow,
} from "@/lib/restaurant-types";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };
type SqlBind = string | number | boolean | null;
type AreaRow = { area: string };

const minRatingOptions = [4.5, 4.2, 4] as const;
const priceOptions = [1, 2, 3, 4] as const;
const boardOptions = ["rating", "reviews", "newest"] as const;
const sortOptions = ["recommended", "rating", "reviews", "newest", "trusted"] as const;
const sceneOptions = ["solo", "group", "late-night", "budget"] as const;
const businessOptions = ["lunch", "dinner", "late"] as const;

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

function getSortOption(value: string): DiscoverySort {
  return sortOptions.includes(value as DiscoverySort) ? (value as DiscoverySort) : "recommended";
}

function getBoardOption(value: string): "rating" | "reviews" | "newest" {
  return boardOptions.includes(value as (typeof boardOptions)[number])
    ? (value as "rating" | "reviews" | "newest")
    : "rating";
}

function getPriceFilter(value: string): number | null {
  const level = Number(value);
  return priceOptions.includes(level as (typeof priceOptions)[number]) ? level : null;
}

function getSceneFilter(value: string): DiscoveryScene | "" {
  return sceneOptions.includes(value as DiscoveryScene) ? (value as DiscoveryScene) : "";
}

function getBusinessFilter(value: string): BusinessFilter | "" {
  return businessOptions.includes(value as BusinessFilter) ? (value as BusinessFilter) : "";
}

function getTruthyFlag(value: string): boolean {
  return value === "1" || value === "true";
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "" || value === false) return;
    query.set(key, String(value));
  });
  return query;
}

function removeParam(queryString: string, key: string) {
  const params = new URLSearchParams(queryString);
  params.delete(key);
  return params.toString();
}

function getSortDescription(sort: DiscoverySort, locale: string): string {
  const map = locale === "zh"
    ? {
        recommended: "默认推荐: 可信评分 + 评论量 + 认证强度综合排序",
        rating: "高分优先: 先看可信评分，再看评论量",
        reviews: "热度优先: 按原始评论量排序",
        newest: "最近更新: 按最近同步时间排序",
        trusted: "可信度优先: 先看认证强度、可信评论量和评分稳定度",
      }
    : {
        recommended: "おすすめ順: 信頼スコア、レビュー量、認定強度を総合",
        rating: "高評価順: 信頼スコア優先、次にレビュー量",
        reviews: "人気順: 元レビュー数を優先",
        newest: "最近更新: 最終同期時刻を優先",
        trusted: "信頼度順: 認定強度、信頼レビュー量、評価安定度を優先",
      };
  return map[sort];
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
  const title = q
    ? locale === "zh"
      ? `${q} 餐厅搜索`
      : `${q} の検索結果`
    : locale === "zh"
      ? "东京中餐馆"
      : "東京の中華料理店";

  const query = buildQuery({
    q,
    cuisine: getQueryValue(queryParams.cuisine),
    area: getQueryValue(queryParams.area),
    sort: getQueryValue(queryParams.sort),
  });

  return {
    title,
    description:
      locale === "zh"
        ? "按菜系、区域、价格带、可信度与榜单视角筛选东京中餐馆。"
        : "料理、エリア、価格帯、信頼度、ランキング視点で東京の中華料理店を比較。",
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
  const tc = await getTranslations({ locale, namespace: "cuisine" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });
  const queryParams = await searchParams;

  const q = getQueryValue(queryParams.q).trim();
  const cuisine = getCuisineFilter(getQueryValue(queryParams.cuisine));
  const authenticityFilter = getAuthenticityFilter(getQueryValue(queryParams.authenticity));
  const minRating = getMinRatingFilter(getQueryValue(queryParams.minRating));
  const sort = getSortOption(getQueryValue(queryParams.sort));
  const board = getBoardOption(getQueryValue(queryParams.board));
  const priceLevel = getPriceFilter(getQueryValue(queryParams.price));
  const area = getQueryValue(queryParams.area).trim();
  const scene = getSceneFilter(getQueryValue(queryParams.scene));
  const business = getBusinessFilter(getQueryValue(queryParams.business));
  const trustedOnly = getTruthyFlag(getQueryValue(queryParams.trusted));
  const hasFilters = Boolean(
    q ||
      cuisine ||
      authenticityFilter ||
      minRating ||
      priceLevel ||
      area ||
      scene ||
      business ||
      trustedOnly ||
      sort !== "recommended",
  );

  const db = await getDb();

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

  if (priceLevel) {
    sql += ` AND price_level = ?`;
    binds.push(priceLevel);
  }

  if (area) {
    sql += ` AND (ward = ? OR city = ?)`;
    binds.push(area, area);
  }

  sql += ` LIMIT 240`;

  const [restaurantsResult, areaResult] = await Promise.all([
    db.prepare(sql).bind(...binds).all<RestaurantRow>(),
    db
      .prepare(
        `SELECT DISTINCT COALESCE(ward, city) as area
         FROM restaurants
         WHERE is_active = 1 AND COALESCE(ward, city) IS NOT NULL
         ORDER BY area ASC`
      )
      .all<AreaRow>(),
  ]);

  const areas = (areaResult.results ?? []).map((item) => item.area).filter(Boolean);
  const baseRestaurants = restaurantsResult.results ?? [];
  const filteredRestaurants = baseRestaurants.filter((restaurant) => {
    if (trustedOnly && !isTrustedPriority(restaurant)) return false;
    if (!matchesScene(restaurant, scene)) return false;
    if (!matchesBusinessFilter(restaurant, business)) return false;
    return true;
  });

  const effectiveSort = sort === "recommended" && getQueryValue(queryParams.sort) === "" ? board : sort;
  const restaurants = sortRestaurants(filteredRestaurants, effectiveSort).slice(0, 60);

  const currentQuery = buildQuery({
    q,
    cuisine,
    authenticity: authenticityFilter,
    minRating,
    price: priceLevel,
    area,
    scene,
    business,
    trusted: trustedOnly ? 1 : "",
    sort,
    board,
  });
  const currentQueryString = currentQuery.toString();

  const boardTabs = [
    { id: "rating", label: locale === "zh" ? "高分榜" : "高評価ランキング", icon: Trophy },
    { id: "reviews", label: locale === "zh" ? "热度榜" : "人気ランキング", icon: Flame },
    { id: "newest", label: locale === "zh" ? "最近更新" : "最近更新", icon: Clock3 },
  ] as const;

  const copy = locale === "zh"
    ? {
        title: "东京中餐馆",
        subtitle: "先用高价值筛选缩小范围，再用榜单和卡片做快速比较。",
        summaryPrefix: `${restaurants.length} 家结果`,
        search: "搜索店名、菜系、区域",
        allCuisines: "全部菜系",
        allAuthenticity: "全部认证",
        allAreas: "全部区域",
        price: "价格带",
        allPrices: "不限价格",
        minRating: "最低评分",
        anyRating: "不限评分",
        scene: "场景标签",
        anyScene: "不限场景",
        business: "营业时段",
        anyBusiness: "不限时段",
        sort: "排序方式",
        trustedOnly: "可信优先",
        reset: "清除筛选",
        map: "地图",
        details: "看详情",
        empty: "没有找到完全匹配的餐厅。",
        emptyHint: "可以清空筛选、切换高分榜，或先从热门菜系继续看。",
        boardLabel: "榜单视角",
        sortDescription: getSortDescription(effectiveSort, locale),
        actions: [
          { label: "清空筛选", href: `/${locale}/restaurants` },
          { label: "回到高分榜", href: `/${locale}/restaurants?sort=rating` },
          { label: "看川菜", href: `/${locale}/restaurants?cuisine=sichuan&sort=rating` },
          { label: "看粤菜", href: `/${locale}/restaurants?cuisine=cantonese&sort=reviews` },
        ],
      }
    : {
        title: "東京中華料理店",
        subtitle: "価値の高い条件で候補を減らし、ランキングとカードで一気に比較します。",
        summaryPrefix: `${restaurants.length}件`,
        search: "店名・料理・エリアで検索",
        allCuisines: "すべての料理",
        allAuthenticity: "すべての認定",
        allAreas: "すべてのエリア",
        price: "価格帯",
        allPrices: "価格指定なし",
        minRating: "最低スコア",
        anyRating: "指定なし",
        scene: "シーン",
        anyScene: "シーン指定なし",
        business: "営業時間帯",
        anyBusiness: "時間帯指定なし",
        sort: "並び替え",
        trustedOnly: "信頼優先",
        reset: "クリア",
        map: "地図",
        details: "詳細を見る",
        empty: "条件に合う店が見つかりませんでした。",
        emptyHint: "条件を外すか、高評価ランキングや人気料理から見直すと戻りやすいです。",
        boardLabel: "ランキング視点",
        sortDescription: getSortDescription(effectiveSort, locale),
        actions: [
          { label: "条件を外す", href: `/${locale}/restaurants` },
          { label: "高評価に戻る", href: `/${locale}/restaurants?sort=rating` },
          { label: "四川料理を見る", href: `/${locale}/restaurants?cuisine=sichuan&sort=rating` },
          { label: "広東料理を見る", href: `/${locale}/restaurants?cuisine=cantonese&sort=reviews` },
        ],
      };

  const summaryTags = [
    q ? { key: "q", label: q } : null,
    cuisine ? { key: "cuisine", label: tc(cuisine) } : null,
    area ? { key: "area", label: area } : null,
    priceLevel ? { key: "price", label: getPriceLevelSymbols(priceLevel) } : null,
    minRating ? { key: "minRating", label: `${minRating}+` } : null,
    authenticityFilter ? { key: "authenticity", label: ta(authenticityFilter) } : null,
    scene ? { key: "scene", label: getSceneLabel(scene, locale) } : null,
    business ? { key: "business", label: getBusinessLabel(business, locale) } : null,
    trustedOnly ? { key: "trusted", label: copy.trustedOnly } : null,
  ].filter(Boolean) as { key: string; label: string }[];

  const searchHints = getCuisineTypesForSearchQuery(q);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-[28px] border border-warm-200 bg-[linear-gradient(180deg,#fff,#f6f1e8)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-vermilion-700">
              {locale === "zh" ? "Restaurant Index" : "Restaurant Index"}
            </div>
            <h1 className="mt-3 font-serif text-4xl font-bold text-ink-900">{copy.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-400">{copy.subtitle}</p>
          </div>
          <div className="max-w-2xl text-sm text-ink-700">
            <div className="font-medium">{copy.summaryPrefix}</div>
            <div className="mt-1 text-ink-400">
              {summaryTags.length > 0
                ? `${locale === "zh" ? "已筛选" : "絞り込み"} ${summaryTags.map((tag) => tag.label).join(" / ")}`
                : locale === "zh"
                  ? "当前未加筛选"
                  : "現在は追加条件なし"}
              {" · "}
              {copy.sortDescription}
            </div>
          </div>
        </div>

        <form action={`/${locale}/restaurants`} className="mt-6 rounded-[24px] border border-warm-200 bg-white p-4">
          <input type="hidden" name="board" value={board} />
          <div className="grid gap-3 xl:grid-cols-[1.4fr_0.95fr_0.95fr_0.95fr_0.95fr]">
            <label className="relative">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
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
                <option key={type} value={type}>
                  {tc(type)}
                </option>
              ))}
            </select>

            <select name="area" defaultValue={area} className="filter-select">
              <option value="">{copy.allAreas}</option>
              {areas.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select name="price" defaultValue={priceLevel ? String(priceLevel) : ""} className="filter-select">
              <option value="">{copy.allPrices}</option>
              {priceOptions.map((level) => (
                <option key={level} value={level}>
                  {copy.price} {getPriceLevelSymbols(level)}
                </option>
              ))}
            </select>

            <label className="flex min-h-11 items-center justify-between rounded-md border border-warm-200 bg-warm-50 px-3 text-sm text-ink-700">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck size={15} className="text-[#2F6B5F]" />
                {copy.trustedOnly}
              </span>
              <input
                type="checkbox"
                name="trusted"
                value="1"
                defaultChecked={trustedOnly}
                className="h-4 w-4 accent-[#2F6B5F]"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[0.9fr_0.9fr_0.9fr_1fr_0.9fr_auto]">
            <select name="minRating" defaultValue={minRating ? String(minRating) : ""} className="filter-select">
              <option value="">{copy.anyRating}</option>
              {minRatingOptions.map((rating) => (
                <option key={rating} value={rating}>
                  {copy.minRating} {rating}+
                </option>
              ))}
            </select>

            <select name="authenticity" defaultValue={authenticityFilter} className="filter-select">
              <option value="">{copy.allAuthenticity}</option>
              {authenticityTypes.map((type) => (
                <option key={type} value={type}>
                  {ta(type)}
                </option>
              ))}
            </select>

            <select name="business" defaultValue={business} className="filter-select">
              <option value="">{copy.anyBusiness}</option>
              {businessOptions.map((item) => (
                <option key={item} value={item}>
                  {getBusinessLabel(item, locale)}
                </option>
              ))}
            </select>

            <select name="scene" defaultValue={scene} className="filter-select">
              <option value="">{copy.anyScene}</option>
              {sceneOptions.map((item) => (
                <option key={item} value={item}>
                  {getSceneLabel(item, locale)}
                </option>
              ))}
            </select>

            <select name="sort" defaultValue={sort} className="filter-select">
              <option value="recommended">{locale === "zh" ? "默认推荐" : "おすすめ順"}</option>
              <option value="rating">{locale === "zh" ? "高分优先" : "高評価順"}</option>
              <option value="reviews">{locale === "zh" ? "热度优先" : "人気順"}</option>
              <option value="newest">{locale === "zh" ? "最近更新" : "最近更新"}</option>
              <option value="trusted">{locale === "zh" ? "可信度优先" : "信頼度順"}</option>
            </select>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary min-h-11 flex-1 px-4">
                {locale === "zh" ? "应用筛选" : "条件を適用"}
              </button>
              {hasFilters ? (
                <Link
                  href={`/${locale}/restaurants`}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-warm-200 bg-white px-4 text-sm font-semibold text-ink-700 hover:text-vermilion-700"
                >
                  {copy.reset}
                </Link>
              ) : null}
            </div>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {summaryTags.map((tag) => (
              <Link
                key={tag.key}
                href={`/${locale}/restaurants${removeParam(currentQueryString, tag.key) ? `?${removeParam(currentQueryString, tag.key)}` : ""}`}
                className="inline-flex items-center gap-1 rounded-full border border-warm-200 bg-white px-3 py-1.5 text-sm text-ink-700"
              >
                {tag.label}
                <X size={14} />
              </Link>
            ))}
            {searchHints.length > 0 && !cuisine
              ? searchHints.map((hint) => (
                  <Link
                    key={hint}
                    href={`/${locale}/restaurants?${buildQuery({
                      q,
                      cuisine: hint,
                      area,
                      price: priceLevel,
                      minRating,
                      sort,
                    }).toString()}`}
                    className="inline-flex items-center rounded-full bg-gold-300/20 px-3 py-1.5 text-sm text-ink-700"
                  >
                    {locale === "zh" ? "识别到菜系:" : "料理推定:"} {tc(hint)}
                  </Link>
                ))
              : null}
          </div>

          <Link
            href={`/${locale}/map${currentQueryString ? `?${currentQueryString}` : ""}`}
            className="inline-flex items-center gap-2 rounded-full border border-warm-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:text-vermilion-700"
          >
            <MapPin size={15} />
            {copy.map}
          </Link>
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium text-ink-700">{copy.boardLabel}</div>
          <div className="text-sm text-ink-400">{copy.sortDescription}</div>
        </div>
        <div className="flex flex-wrap gap-3">
          {boardTabs.map((tab) => {
            const href = buildQuery({
              q,
              cuisine,
              authenticity: authenticityFilter,
              minRating,
              price: priceLevel,
              area,
              scene,
              business,
              trusted: trustedOnly ? 1 : "",
              board: tab.id,
              sort: tab.id,
            }).toString();
            const active = effectiveSort === tab.id;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.id}
                href={`/${locale}/restaurants?${href}`}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-vermilion-700 text-white"
                    : "border border-warm-200 bg-white text-ink-700 hover:border-vermilion-200 hover:text-vermilion-700"
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </section>

      {restaurants.length === 0 ? (
        <section className="mt-10 rounded-[28px] border border-dashed border-warm-200 bg-white p-10 text-center">
          <div className="mx-auto max-w-xl">
            <div className="font-serif text-3xl font-bold text-ink-900">{copy.empty}</div>
            <p className="mt-3 text-sm leading-6 text-ink-400">{copy.emptyHint}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {copy.actions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="rounded-full border border-warm-200 bg-warm-50 px-4 py-2 text-sm font-medium text-ink-700 hover:text-vermilion-700"
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-8 space-y-4">
          {restaurants.map((restaurant, index) => {
            const name = getRestaurantName(restaurant, locale);
            const secondaryName =
              locale === "zh"
                ? restaurant.name_ja || restaurant.name_original
                : restaurant.name_zh || restaurant.name_original;
            const summary = getRestaurantSummary(restaurant, locale);
            const cuisineType = normalizeCuisineType(restaurant.cuisine_type);
            const authenticity = normalizeAuthenticity(restaurant.authenticity);
            const price = normalizePriceLevel(restaurant.price_level);
            const areaLabel = getAreaLabel(restaurant);
            const mapHref = restaurant.google_maps_url || `/${locale}/map?restaurant=${restaurant.id}`;

            return (
              <article
                key={restaurant.id}
                className="grid gap-4 rounded-[26px] border border-warm-200 bg-white p-4 shadow-sm lg:grid-cols-[220px_1fr_200px]"
              >
                <div className="relative overflow-hidden rounded-[22px] bg-warm-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getPrimaryPhotoUrl(restaurant, 720)} alt={name} className="h-full min-h-52 w-full object-cover" />
                  <div className="absolute left-3 top-3 flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-300/95 font-serif text-lg font-black text-vermilion-700">
                      {index + 1}
                    </span>
                    {effectiveSort !== "recommended" ? (
                      <span className="rounded-full bg-white/88 px-3 py-1 text-xs font-semibold text-ink-700">
                        {getBoardBadge(effectiveSort, locale)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-serif text-3xl font-bold text-ink-900">{name}</h2>
                        <span className={`badge-${authenticity}`}>{ta(authenticity)}</span>
                      </div>
                      <div className="mt-1 text-sm text-ink-400">{secondaryName}</div>
                    </div>
                    <div className="rounded-[18px] border border-[#2F6B5F]/18 bg-[#2F6B5F]/8 px-4 py-3 text-right">
                      <div className="text-xs font-semibold text-[#2F6B5F]">
                        {locale === "zh" ? "可信评分" : "信頼スコア"}
                      </div>
                      <div className="mt-1 text-3xl font-black text-[#2F6B5F]">{getRating(restaurant).toFixed(1)}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-sm">
                    <span className={`cuisine-tag cuisine-${cuisineType}`}>{tc(cuisineType)}</span>
                    <span className="rounded-full bg-warm-50 px-3 py-1.5 text-ink-700">{areaLabel || (locale === "zh" ? "区域待补充" : "エリア追記予定")}</span>
                    <span className="rounded-full bg-warm-50 px-3 py-1.5 text-ink-700">{price ? `${getPriceLevelSymbols(price)} · ${locale === "zh" ? "人均" : "1人"}` : (locale === "zh" ? "价格待补充" : "価格追記予定")}</span>
                    <span className="rounded-full bg-gold-300/18 px-3 py-1.5 text-ink-700">
                      Google {(restaurant.raw_rating || 0).toFixed(1)} · {(restaurant.raw_review_count || 0).toLocaleString()}
                    </span>
                    <span className="rounded-full bg-warm-50 px-3 py-1.5 text-ink-700">{getOpeningStatus(restaurant.opening_hours, locale)}</span>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-ink-700">
                    {summary || getTrustSummary(restaurant, locale)}
                  </p>

                  <div className="mt-4 grid gap-3 text-sm text-ink-700 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-2xl bg-warm-50 px-4 py-3">
                      <div className="text-xs font-semibold text-ink-400">{locale === "zh" ? "为什么值得信" : "信頼できる理由"}</div>
                      <div className="mt-1">{getTrustSummary(restaurant, locale)}</div>
                    </div>
                    <div className="rounded-2xl bg-warm-50 px-4 py-3">
                      <div className="text-xs font-semibold text-ink-400">{locale === "zh" ? "同步状态" : "同期状況"}</div>
                      <div className="mt-1">{formatSyncLabel(restaurant.last_synced_at || restaurant.updated_at, locale)}</div>
                    </div>
                    <div className="rounded-2xl bg-warm-50 px-4 py-3">
                      <div className="text-xs font-semibold text-ink-400">{locale === "zh" ? "评论可信度" : "レビュー信頼度"}</div>
                      <div className="mt-1">
                        {(restaurant.trusted_review_count || 0).toLocaleString()} / {(restaurant.raw_review_count || 0).toLocaleString()}
                        {locale === "zh" ? " 条可信" : "件が信頼"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-4 rounded-[22px] border border-warm-100 bg-[linear-gradient(180deg,#fff,#faf6ef)] p-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-vermilion-700">
                      <Star size={15} className="fill-gold-500 text-gold-500" />
                      {locale === "zh" ? "首眼对比字段" : "比較しやすい要点"}
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-ink-700">
                      <li>{locale === "zh" ? "可信评分优先展示" : "信頼スコアを最上段表示"}</li>
                      <li>{locale === "zh" ? "Google 评分与评论量同时对照" : "Google評価と件数を同時表示"}</li>
                      <li>{locale === "zh" ? "区域、菜系、价格带一行可扫读" : "エリア、料理、価格帯を一行比較"}</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <Link
                      href={`/${locale}/restaurants/${restaurant.id}`}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-vermilion-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-vermilion-900"
                    >
                      {copy.details}
                    </Link>
                    <Link
                      href={mapHref}
                      className="inline-flex w-full items-center justify-center rounded-xl border border-warm-200 bg-white px-4 py-3 text-sm font-semibold text-ink-700 transition hover:text-vermilion-700"
                    >
                      {copy.map}
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function getSceneLabel(scene: DiscoveryScene, locale: string): string {
  const map = locale === "zh"
    ? {
        solo: "一人食",
        group: "朋友聚餐",
        "late-night": "深夜可去",
        budget: "预算友好",
      }
    : {
        solo: "一人ごはん",
        group: "友人会食",
        "late-night": "深夜利用",
        budget: "予算重視",
      };
  return map[scene];
}

function getBusinessLabel(scene: BusinessFilter, locale: string): string {
  const map = locale === "zh"
    ? {
        lunch: "午市可去",
        dinner: "晚市可去",
        late: "深夜可去",
      }
    : {
        lunch: "昼営業あり",
        dinner: "夜営業あり",
        late: "深夜利用可",
      };
  return map[scene];
}

function getBoardBadge(sort: DiscoverySort, locale: string): string {
  if (sort === "reviews") return locale === "zh" ? "热度榜在列" : "人気ランキング";
  if (sort === "newest") return locale === "zh" ? "最近更新" : "最近更新";
  if (sort === "trusted") return locale === "zh" ? "可信优先" : "信頼優先";
  return locale === "zh" ? "高分榜在列" : "高評価ランキング";
}
