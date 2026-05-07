import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Flame,
  MapPin,
  ScrollText,
  ShieldCheck,
  Star,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import CuisineGrid from "@/components/CuisineGrid";
import { getDb } from "@/lib/cloudflare";
import {
  formatSyncLabel,
  getAreaLabel,
  getOpeningStatus,
  getPrimaryPhotoUrl,
  getPriceLevelSymbols,
  getTrustSummary,
  sortRestaurants,
} from "@/lib/restaurant-discovery";
import {
  getRating,
  getRestaurantName,
  getRestaurantSummary,
  normalizePriceLevel,
  type RestaurantRow,
} from "@/lib/restaurant-types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

type AreaCountRow = { area: string; count: number };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return {
    title: t("hero_title"),
    description: t("hero_tagline"),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        zh: "/zh",
        ja: "/ja",
        "x-default": "/zh",
      },
    },
  };
}

async function getHomeData() {
  try {
    const db = await getDb();
    const [restaurantsResult, countsResult, areasResult] = await Promise.all([
      db
        .prepare(
          `SELECT * FROM restaurants
           WHERE is_active = 1
           ORDER BY trusted_rating DESC, raw_review_count DESC
           LIMIT 72`
        )
        .all<RestaurantRow>(),
      db
        .prepare(
          `SELECT cuisine_type, COUNT(*) as count
           FROM restaurants
           WHERE is_active = 1
           GROUP BY cuisine_type`
        )
        .all<{ cuisine_type: string; count: number }>(),
      db
        .prepare(
          `SELECT COALESCE(ward, city) as area, COUNT(*) as count
           FROM restaurants
           WHERE is_active = 1 AND COALESCE(ward, city) IS NOT NULL
           GROUP BY COALESCE(ward, city)
           ORDER BY count DESC
           LIMIT 6`
        )
        .all<AreaCountRow>(),
    ]);

    const cuisineCounts: Record<string, number> = {};
    for (const row of countsResult.results ?? []) {
      cuisineCounts[row.cuisine_type] = row.count;
    }

    return {
      restaurants: restaurantsResult.results ?? [],
      cuisineCounts,
      areas: areasResult.results ?? [],
    };
  } catch {
    return { restaurants: [], cuisineCounts: {}, areas: [] as AreaCountRow[] };
  }
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  const { restaurants, cuisineCounts, areas } = await getHomeData();
  const tc = await getTranslations({ locale, namespace: "cuisine" });

  const copy = locale === "zh"
    ? {
        quickEntries: [
          {
            title: "本周热门榜",
            desc: "按评论热度和可信评分组合",
            href: `/${locale}/restaurants?sort=reviews`,
            icon: Flame,
          },
          {
            title: "高可信推荐",
            desc: "优先看认证更稳、样本更足的店",
            href: `/${locale}/restaurants?sort=trusted&trusted=1`,
            icon: ShieldCheck,
          },
          {
            title: "最新同步",
            desc: "先看最近 2 天更新的餐厅",
            href: `/${locale}/restaurants?sort=newest`,
            icon: Clock3,
          },
          {
            title: "第一次来东京怎么选",
            desc: "从高分榜与区域入口开始",
            href: `/${locale}/restaurants?sort=rating`,
            icon: ScrollText,
          },
        ],
        scenarios: [
          { label: "一人食", href: `/${locale}/restaurants?scene=solo` },
          { label: "朋友聚餐", href: `/${locale}/restaurants?scene=group` },
          { label: "深夜可去", href: `/${locale}/restaurants?scene=late-night` },
          { label: "预算友好", href: `/${locale}/restaurants?scene=budget` },
        ],
        areaTitle: "按区域快速探索",
        areaCta: "查看全部区域",
        areaSuffix: "家餐厅",
        rankingsTitle: "本周精选榜单",
        rankingGroups: [
          { id: "rating", title: "高分榜", desc: "可信评分优先，评论量做次序校正" },
          { id: "reviews", title: "热度榜", desc: "优先看讨论最多、搜索最热的店" },
          { id: "newest", title: "最近更新", desc: "先看数据新鲜度最高的餐厅" },
        ] as const,
        trustTitle: "味探 · 可信中餐馆指南",
        trustDesc: "基于平台原始评分、人工可审的菜系识别、评论可信度筛选和最近同步时间，帮助你先理解为什么值得信，再决定要不要去。",
        trustCta: "了解我们的可信标准",
      }
    : {
        quickEntries: [
          {
            title: "今週の人気ランキング",
            desc: "レビュー熱度と信頼スコアをまとめて確認",
            href: `/${locale}/restaurants?sort=reviews`,
            icon: Flame,
          },
          {
            title: "高信頼おすすめ",
            desc: "認定とサンプル量が安定した店を優先",
            href: `/${locale}/restaurants?sort=trusted&trusted=1`,
            icon: ShieldCheck,
          },
          {
            title: "最新同期",
            desc: "この 2 日で更新された店から見る",
            href: `/${locale}/restaurants?sort=newest`,
            icon: Clock3,
          },
          {
            title: "初めて東京で探すなら",
            desc: "高評価ランキングとエリア入口から始める",
            href: `/${locale}/restaurants?sort=rating`,
            icon: ScrollText,
          },
        ],
        scenarios: [
          { label: "一人ごはん", href: `/${locale}/restaurants?scene=solo` },
          { label: "友人会食", href: `/${locale}/restaurants?scene=group` },
          { label: "深夜利用", href: `/${locale}/restaurants?scene=late-night` },
          { label: "予算重視", href: `/${locale}/restaurants?scene=budget` },
        ],
        areaTitle: "エリアからすばやく探す",
        areaCta: "エリア一覧を見る",
        areaSuffix: "軒",
        rankingsTitle: "今週のピックアップランキング",
        rankingGroups: [
          { id: "rating", title: "高評価ランキング", desc: "信頼スコア優先、レビュー量で補正" },
          { id: "reviews", title: "人気ランキング", desc: "話題量とレビュー量を先に確認" },
          { id: "newest", title: "最近更新", desc: "更新鮮度の高い店を先に見る" },
        ] as const,
        trustTitle: "味探 · 信頼できる中華ガイド",
        trustDesc: "元の評価、料理認定、レビュー信頼度、最終同期時刻を同じ画面で見せ、先に納得してから店を選べる構成にしています。",
        trustCta: "信頼基準を見る",
      };

  const rankingGroups = copy.rankingGroups.map((group) => ({
    ...group,
    restaurants: sortRestaurants(restaurants, group.id).slice(0, 5),
  }));

  return (
    <>
      <HeroSection locale={locale} />

      <div id="discover" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="-mt-16 relative z-10 rounded-[28px] border border-warm-200 bg-white/96 p-5 shadow-[0_20px_60px_rgba(31,26,23,0.08)] sm:p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {copy.quickEntries.map(({ title, desc, href, icon: Icon }) => (
              <Link
                key={title}
                href={href}
                className="rounded-[20px] border border-warm-200 bg-[linear-gradient(180deg,#fff,#f9f3eb)] p-5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-vermilion-50 text-vermilion-700">
                  <Icon size={22} />
                </div>
                <div className="font-serif text-xl font-bold text-ink-900">{title}</div>
                <p className="mt-2 text-sm leading-6 text-ink-400">{desc}</p>
              </Link>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {copy.scenarios.map((scene) => (
              <Link
                key={scene.label}
                href={scene.href}
                className="inline-flex items-center rounded-full border border-warm-200 bg-warm-50 px-4 py-2 text-sm font-medium text-ink-700 transition hover:border-vermilion-200 hover:text-vermilion-700"
              >
                {scene.label}
              </Link>
            ))}
          </div>
        </section>

        <section id="areas" className="py-14">
          <div className="mb-7 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-serif text-3xl font-bold text-ink-900">{copy.areaTitle}</h2>
              <p className="mt-2 text-sm text-ink-400">
                {locale === "zh"
                  ? "从区域入口先建立候选池，再用列表页筛选缩小范围。"
                  : "まずはエリアで候補を作り、その後に一覧で条件を絞り込みます。"}
              </p>
            </div>
            <Link href={`/${locale}/restaurants`} className="text-sm font-semibold text-vermilion-700 hover:underline">
              {copy.areaCta}
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {areas.slice(0, 3).map((area, index) => (
              <Link
                key={area.area}
                href={`/${locale}/restaurants?area=${encodeURIComponent(area.area)}`}
                className="group relative overflow-hidden rounded-[24px] border border-warm-200 bg-ink-900 p-6 text-white"
              >
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-55 transition duration-500 group-hover:scale-105"
                  style={{
                    backgroundImage:
                      index === 0
                        ? "url(https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=1200&auto=format&fit=crop)"
                        : index === 1
                          ? "url(https://images.unsplash.com/photo-1513407030348-c983a97b98d8?q=80&w=1200&auto=format&fit=crop)"
                          : "url(https://images.unsplash.com/photo-1492571350019-22de08371fd3?q=80&w=1200&auto=format&fit=crop)",
                  }}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,10,0.1),rgba(10,10,10,0.7))]" />
                <div className="relative">
                  <div className="text-4xl font-black font-serif">{area.area}</div>
                  <div className="mt-1 text-sm uppercase tracking-[0.18em] text-white/80">
                    {area.area.toUpperCase()}
                  </div>
                  <div className="mt-12 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-sm">
                    <MapPin size={14} />
                    {area.count} {copy.areaSuffix}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <CuisineGrid locale={locale} counts={cuisineCounts} />

        <section id="rankings" className="py-14">
          <div className="mb-8">
            <h2 className="font-serif text-3xl font-bold text-ink-900">{copy.rankingsTitle}</h2>
            <p className="mt-2 text-sm text-ink-400">
              {locale === "zh"
                ? "把榜单作为第一步入口，降低“从零搜索”的负担。"
                : "まずはランキングから入り、ゼロから検索する負担を下げます。"}
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            {rankingGroups.map((group) => (
              <section key={group.id} className="rounded-[24px] border border-warm-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-serif text-2xl font-bold text-ink-900">{group.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-400">{group.desc}</p>
                  </div>
                  <Link
                    href={`/${locale}/restaurants?sort=${group.id}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-vermilion-700"
                  >
                    {locale === "zh" ? "看完整榜单" : "一覧を見る"}
                    <ArrowRight size={15} />
                  </Link>
                </div>

                <div className="space-y-4">
                  {group.restaurants.map((restaurant, index) => {
                    const name = getRestaurantName(restaurant, locale);
                    const area = getAreaLabel(restaurant);
                    const summary = getRestaurantSummary(restaurant, locale);
                    const priceLevel = normalizePriceLevel(restaurant.price_level);

                    return (
                      <Link
                        key={`${group.id}-${restaurant.id}`}
                        href={`/${locale}/restaurants/${restaurant.id}`}
                        className="grid grid-cols-[48px_88px_1fr] gap-3 rounded-[18px] border border-warm-100 p-3 transition hover:border-vermilion-200 hover:shadow-sm"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-300/40 font-serif text-xl font-black text-vermilion-700">
                          {index + 1}
                        </div>
                        <div className="overflow-hidden rounded-2xl bg-warm-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={getPrimaryPhotoUrl(restaurant, 480)} alt={name} className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-bold text-ink-900">{name}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                                <span>{area}</span>
                                <span>{restaurant.cuisine_type ? tc(restaurant.cuisine_type) : (locale === "zh" ? "菜系待补充" : "料理未設定")}</span>
                                <span>{priceLevel ? getPriceLevelSymbols(priceLevel) : "¥?"}</span>
                              </div>
                            </div>
                            <div className="rounded-xl bg-vermilion-50 px-2 py-1 text-sm font-bold text-vermilion-700">
                              {getRating(restaurant).toFixed(1)}
                            </div>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-700">
                            {summary || getTrustSummary(restaurant, locale)}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-400">
                            <span className="inline-flex items-center gap-1">
                              <Star size={12} className="fill-gold-500 text-gold-500" />
                              Google {(restaurant.raw_rating || 0).toFixed(1)}
                            </span>
                            <span>{getOpeningStatus(restaurant.opening_hours, locale)}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="py-8">
          <div className="overflow-hidden rounded-[28px] border border-[#2F6B5F] bg-[#1f5448] px-6 py-7 text-white shadow-[0_20px_50px_rgba(31,84,72,0.16)]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]">
                  <CheckCircle2 size={14} />
                  {copy.trustTitle}
                </div>
                <p className="mt-4 text-base leading-7 text-white/84">{copy.trustDesc}</p>
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-white/72">
                  <span>{locale === "zh" ? "可信评分可解释" : "信頼スコアを説明可能"}</span>
                  <span>{locale === "zh" ? "评论可信度可区分" : "レビュー信頼度を区分表示"}</span>
                  <span>{locale === "zh" ? "同步时间可追溯" : "同期時刻を追跡可能"}</span>
                </div>
              </div>
              <div className="flex flex-col gap-3 text-sm">
                <Link
                  href={`/${locale}/restaurants?sort=trusted&trusted=1`}
                  className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white px-5 py-3 font-semibold text-[#1f5448] transition hover:bg-warm-50"
                >
                  {copy.trustCta}
                </Link>
                <div className="text-white/70">
                  {restaurants[0] ? formatSyncLabel(restaurants[0].last_synced_at || restaurants[0].updated_at, locale) : ""}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
