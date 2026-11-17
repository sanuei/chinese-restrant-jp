import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRight, Map, SlidersHorizontal, TrainFront, UtensilsCrossed } from "lucide-react";
import JsonLd from "@/components/JsonLd";
import RestaurantCard from "@/components/RestaurantCard";
import { getCurrentUser } from "@/lib/session";
import { getFavoritedIds } from "@/lib/favorites";
import { buildBreadcrumbJsonLd, buildItemListJsonLd } from "@/lib/json-ld";
import { stationAreas } from "@/lib/station-areas";
import { getRating, getRestaurantName } from "@/lib/restaurant-types";
import {
  MIN_INDEXABLE_COUNT,
  allLandingCategories,
  buildLandingCopy,
  filterQuery,
  getStationArea,
  landingCuisines,
  landingPath,
  matchesFilter,
  type LandingCategory,
  type LandingFilter,
} from "@/lib/landing";
import {
  countMatching,
  getLandingRestaurants,
  getLightRows,
  parseLandingParams,
  type LightRow,
} from "@/lib/landing-data";

export type LandingParams = { locale: string; area?: string; category?: string };

async function loadLanding({ locale, area, category }: LandingParams) {
  const filter = parseLandingParams(area, category);
  if (!filter) return null;

  const [rows, restaurants, tc, td] = await Promise.all([
    getLightRows(),
    getLandingRestaurants(area, category),
    getTranslations({ locale, namespace: "cuisine" }),
    getTranslations({ locale, namespace: "dish_type" }),
  ]);

  const matching = rows.filter((row) => matchesFilter(row, filter));
  // 统计查询失败时（rows 为空）至少用列表本身的家数，不至于把有内容的页面 404 掉
  const total = Math.max(matching.length, restaurants.length);
  if (total === 0) return null;

  const labelOf = (c: LandingCategory) => (c.kind === "cuisine" ? tc(c.key) : td(c.key));
  const areaObj = filter.area ? getStationArea(filter.area) : null;

  let breakdown: { label: string; count: number }[] = [];
  if (filter.area && !filter.category) {
    breakdown = landingCuisines
      .map((key) => ({ label: tc(key), count: matching.filter((r) => r.cuisine_type === key).length }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  } else if (!filter.area && filter.category) {
    breakdown = stationAreas
      .map((a) => ({ label: locale === "zh" ? a.zh : a.ja, count: countMatching(matching, { area: a.key }) }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }

  const first = restaurants[0];
  const copy = buildLandingCopy({
    locale,
    area: areaObj,
    categoryLabel: filter.category ? labelOf(filter.category) : null,
    total,
    authentic: matching.filter((r) => r.authenticity === "authentic").length,
    breakdown,
    top: first ? { name: getRestaurantName(first, locale), rating: getRating(first) } : null,
  });

  return { filter, area: areaObj, total, restaurants, copy, rows, labelOf };
}

export async function buildLandingMetadata(params: LandingParams): Promise<Metadata> {
  const data = await loadLanding(params);
  if (!data) return {};

  const { locale } = params;
  const path = landingPath(data.filter);
  return {
    title: data.copy.title,
    description: data.copy.description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: { zh: `/zh${path}`, ja: `/ja${path}`, "x-default": `/zh${path}` },
    },
    openGraph: {
      title: data.copy.title,
      description: data.copy.description,
      url: `/${locale}${path}`,
      siteName: "ガチ中華ナビ | 真味中华",
      locale: locale === "zh" ? "zh_CN" : "ja_JP",
      type: "website",
    },
    // 家数太少的组合照常能看，但不让搜索引擎收录，免得被当成薄内容拖累整站
    ...(data.total < MIN_INDEXABLE_COUNT ? { robots: { index: false, follow: true } } : {}),
  };
}

type LinkItem = { href: string; label: string; count: number };
type LinkGroup = { title: string; links: LinkItem[] };

function relatedGroups(
  locale: string,
  filter: LandingFilter,
  rows: LightRow[],
  labelOf: (c: LandingCategory) => string
): LinkGroup[] {
  const zh = locale === "zh";
  const areaName = (key: string) => {
    const a = getStationArea(key);
    return a ? (zh ? a.zh : a.ja) : key;
  };
  const toLink = (f: LandingFilter, label: string): LinkItem | null => {
    const count = countMatching(rows, f);
    return count >= MIN_INDEXABLE_COUNT ? { href: `/${locale}${landingPath(f)}`, label, count } : null;
  };
  const compact = (items: (LinkItem | null)[]) => items.filter((i): i is LinkItem => i !== null);
  const sameCategory = (a: LandingCategory, b: LandingCategory) => a.kind === b.kind && a.key === b.key;

  const { area, category } = filter;
  const groups: LinkGroup[] = [];

  if (area) {
    groups.push({
      title: zh ? `${areaName(area)}按菜系 / 品类细分` : `${areaName(area)}をジャンル別に見る`,
      links: compact([
        category ? toLink({ area }, zh ? `${areaName(area)}全部中餐` : `${areaName(area)}の中華すべて`) : null,
        ...allLandingCategories
          .filter((c) => !category || !sameCategory(c, category))
          .map((c) => toLink({ area, category: c }, labelOf(c))),
      ]),
    });
  }

  if (category) {
    groups.push({
      title: zh ? `其他车站的${labelOf(category)}` : `ほかの駅の${labelOf(category)}`,
      links: compact([
        area ? toLink({ category }, zh ? `东京全部${labelOf(category)}` : `東京の${labelOf(category)}すべて`) : null,
        ...stationAreas
          .filter((a) => a.key !== area)
          .map((a) => toLink({ area: a.key, category }, zh ? a.zh : a.ja)),
      ]),
    });
  }

  if (!category) {
    groups.push({
      title: zh ? "其他车站" : "ほかの駅から探す",
      links: compact(stationAreas.filter((a) => a.key !== area).map((a) => toLink({ area: a.key }, zh ? a.zh : a.ja))),
    });
  }

  if (!area && category) {
    groups.push({
      title: zh ? "其他菜系 / 品类" : "ほかのジャンル",
      links: compact(
        allLandingCategories.filter((c) => !sameCategory(c, category)).map((c) => toLink({ category: c }, labelOf(c)))
      ),
    });
  }

  return groups.filter((g) => g.links.length > 0);
}

export default async function LandingPage(params: LandingParams) {
  const data = await loadLanding(params);
  if (!data) notFound();

  const { locale } = params;
  const zh = locale === "zh";
  const { filter, area, total, restaurants, copy } = data;
  const path = landingPath(filter);
  const query = filterQuery(filter);

  const [user, favoritedIds] = await Promise.all([
    getCurrentUser(),
    getFavoritedIds(restaurants.map((r) => r.id)),
  ]);

  const crumbs = [
    { name: zh ? "首页" : "ホーム", url: `/${locale}` },
    ...(filter.area && filter.category
      ? [{ name: zh ? `${copy.placeLabel}中餐` : `${copy.placeLabel}の中華`, url: `/${locale}${landingPath({ area: filter.area })}` }]
      : []),
    ...(!filter.area ? [{ name: zh ? "按菜系找" : "ジャンルから探す", url: `/${locale}/cuisines` }] : []),
    { name: copy.title, url: `/${locale}${path}` },
  ];

  const groups = relatedGroups(locale, filter, data.rows, data.labelOf);
  const eyebrow = area
    ? (zh ? `${area.zh}站周边` : `${area.ja}駅周辺`)
    : (zh ? "东京 · 菜系特辑" : "東京 · ジャンル特集");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
      <JsonLd data={buildBreadcrumbJsonLd(crumbs)} />
      <JsonLd
        data={buildItemListJsonLd(
          copy.title,
          restaurants.map((r) => ({ name: getRestaurantName(r, locale), url: `/${locale}/restaurants/${r.id}` }))
        )}
      />

      <nav aria-label="breadcrumb" className="mb-5 flex flex-wrap items-center gap-1 text-xs text-ink-400">
        {crumbs.map((crumb, i) => (
          <span key={crumb.url} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} />}
            {i < crumbs.length - 1 ? (
              <Link href={crumb.url} className="hover:text-vermilion-700">{crumb.name}</Link>
            ) : (
              <span className="text-ink-700">{crumb.name}</span>
            )}
          </span>
        ))}
      </nav>

      <header className="mb-8 flex flex-col gap-4">
        <div className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase text-vermilion-700">
          {area ? <TrainFront size={14} /> : <UtensilsCrossed size={14} />}
          {eyebrow}
        </div>
        <h1 className="font-serif font-bold text-3xl sm:text-4xl leading-tight text-ink-900">{copy.title}</h1>
        <p className="max-w-3xl text-sm sm:text-base leading-7 text-ink-700">{copy.intro}</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href={`/${locale}/map?${query}`} className="btn-primary w-full sm:w-auto">
            <Map size={16} />
            {zh ? "在地图上看" : "マップで見る"}
          </Link>
          <Link
            href={`/${locale}/restaurants?${query}`}
            className="inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-md border border-warm-200 bg-white px-4 text-sm font-semibold text-ink-700 hover:text-vermilion-700"
          >
            <SlidersHorizontal size={16} />
            {zh ? "按评分、价格等继续筛选" : "条件を変えて絞り込む"}
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {restaurants.map((restaurant, index) => (
          <RestaurantCard
            key={restaurant.id}
            restaurant={restaurant}
            locale={locale}
            isLoggedIn={Boolean(user)}
            isFavorited={favoritedIds.has(restaurant.id)}
            preferStation={Boolean(filter.area)}
            rank={index + 1}
          />
        ))}
      </div>

      {total > restaurants.length && (
        <div className="mt-8 text-center">
          <Link href={`/${locale}/restaurants?${query}`} className="text-sm font-semibold text-vermilion-700 hover:underline">
            {zh ? `查看全部 ${total} 家 →` : `${total}軒すべて見る →`}
          </Link>
        </div>
      )}

      {groups.length > 0 && (
        <section className="mt-14 border-t border-warm-200 pt-8 space-y-6">
          {groups.map((group) => (
            <div key={group.title}>
              <h2 className="font-serif text-lg font-bold text-ink-900 mb-3">{group.title}</h2>
              <div className="flex flex-wrap gap-2">
                {group.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-white px-3 py-1.5 text-sm text-ink-700 transition-colors hover:border-vermilion-300 hover:text-vermilion-700"
                  >
                    {link.label}
                    <span className="text-xs text-ink-400">{zh ? `${link.count} 家` : `${link.count}軒`}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
