import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import HeroSection, { type HeroShowcaseRestaurant } from "@/components/HeroSection";
import TopRestaurants from "@/components/TopRestaurants";
import TrendingRanking from "@/components/TrendingRanking";
import HomeDiscovery from "@/components/HomeDiscovery";
import AdSlot from "@/components/AdSlot";
import JsonLd from "@/components/JsonLd";
import { buildOrganizationJsonLd } from "@/lib/json-ld";
import { getDb } from "@/lib/cloudflare";
import { getHourlyRotationSeed, rotateRestaurantsByTier } from "@/lib/restaurant-rotation";
import { matchesStationArea, stationAreas, type StationAreaKey } from "@/lib/station-areas";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ topPage?: string | string[]; topSeed?: string | string[] }>;
};

function parsePage(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(Array.isArray(value) ? value[0] : value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseSeed(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

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

async function getCuisineCounts(): Promise<Record<string, number>> {
  try {
    const db = await getDb();
    // 统计全部在架餐厅，与 /cuisines 页及点击跳转后的 /restaurants?cuisine= 列表保持 100% 一致
    const result = await db
      .prepare(
        `SELECT cuisine_type, COUNT(*) as count
         FROM restaurants
         WHERE is_active = 1
         GROUP BY cuisine_type`
      )
      .all<{ cuisine_type: string; count: number }>();

    const counts: Record<string, number> = {};
    for (const row of result.results ?? []) {
      counts[row.cuisine_type] = row.count;
    }
    return counts;
  } catch {
    return {};
  }
}

async function getDishTypeCounts(): Promise<Record<string, number>> {
  try {
    const db = await getDb();
    // 统计全部在架餐厅，与点击跳转后的 /restaurants?dish_type= 列表保持 100% 一致
    const result = await db
      .prepare(
        `SELECT dish_type, COUNT(*) as count
         FROM restaurants
         WHERE is_active = 1
         GROUP BY dish_type`
      )
      .all<{ dish_type: string; count: number }>();

    const counts: Record<string, number> = {};
    for (const row of result.results ?? []) {
      counts[row.dish_type] = row.count;
    }
    return counts;
  } catch {
    return {};
  }
}

async function getStationAreaCounts(): Promise<Record<StationAreaKey, number>> {
  const counts = Object.fromEntries(stationAreas.map(({ key }) => [key, 0])) as Record<StationAreaKey, number>;

  try {
    const db = await getDb();
    // 统计全部在架餐厅，使用统一的 matchesStationArea 规则，与 /restaurants?station= 结果严格一致
    const result = await db
      .prepare(
        `SELECT nearest_station, COUNT(*) AS count
         FROM restaurants
         WHERE is_active = 1 AND nearest_station IS NOT NULL
         GROUP BY nearest_station`
      )
      .all<{ nearest_station: string; count: number }>();

    for (const row of result.results ?? []) {
      for (const station of stationAreas) {
        if (matchesStationArea(row.nearest_station, station)) counts[station.key] += row.count;
      }
    }
  } catch {
    // 首页其他模块仍可正常渲染。
  }

  return counts;
}

async function getHeroShowcaseRestaurants(): Promise<HeroShowcaseRestaurant[]> {
  try {
    const db = await getDb();
    // 精选有实拍照片的高分正宗餐厅，按小时轮换并按菜系打散取 16 家用于 3D 可滑动弧形画廊
    const result = await db
      .prepare(
        `SELECT id, name_zh, name_ja, name_original, cuisine_type, trusted_rating, raw_rating, photos
         FROM restaurants
         WHERE is_active = 1 AND authenticity = 'authentic'
           AND photos IS NOT NULL AND photos NOT IN ('', '[]')
         ORDER BY trusted_rating DESC, raw_review_count DESC
         LIMIT 36`
      )
      .all<HeroShowcaseRestaurant>();

    const pool = result.results ?? [];
    return rotateRestaurantsByTier(pool, getHourlyRotationSeed() + 777, {
      tierSize: 36,
      diversifyCuisine: true,
    }).slice(0, 16);
  } catch {
    return [];
  }
}

export default async function HomePage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  const topPage = parsePage(query.topPage);
  const topSeed = parseSeed(query.topSeed);
  const t = await getTranslations({ locale, namespace: "home" });
  const [cuisineCounts, dishTypeCounts, stationAreaCounts, heroShowcase] = await Promise.all([
    getCuisineCounts(),
    getDishTypeCounts(),
    getStationAreaCounts(),
    getHeroShowcaseRestaurants(),
  ]);

  return (
    <>
      <JsonLd data={buildOrganizationJsonLd(locale)} />
      <HeroSection locale={locale} counts={cuisineCounts} showcaseRestaurants={heroShowcase} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <HomeDiscovery
          locale={locale}
          dishTypeCounts={dishTypeCounts}
          stationCounts={stationAreaCounts}
        />
        <div className="divider-chinese" />
        <TrendingRanking locale={locale} />
        <div className="divider-chinese" />
        <AdSlot locale={locale} />
        <div className="divider-chinese" />
        <TopRestaurants
          locale={locale}
          title={t("section_top")}
          limit={9}
          page={topPage}
          paginated
          sortMode="top"
          rotationSeed={topSeed}
        />
        <div className="divider-chinese" />
        <TopRestaurants locale={locale} title={t("section_new")} limit={6} sortMode="new" />
      </div>
    </>
  );
}
