import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import HeroSection from "@/components/HeroSection";
import TopRestaurants from "@/components/TopRestaurants";
import TrendingRanking from "@/components/TrendingRanking";
import HomeDiscovery from "@/components/HomeDiscovery";
import AdSlot from "@/components/AdSlot";
import JsonLd from "@/components/JsonLd";
import { buildOrganizationJsonLd } from "@/lib/json-ld";
import { getDb } from "@/lib/cloudflare";
import { stationAreas, type StationAreaKey } from "@/lib/station-areas";
import { countMatching, getLightRows } from "@/lib/landing-data";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ topPage?: string | string[] }>;
};

function parsePage(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(Array.isArray(value) ? value[0] : value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
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
    const result = await db
      .prepare(
        `SELECT cuisine_type, COUNT(*) as count
         FROM restaurants
         WHERE is_active = 1 AND authenticity = 'authentic'
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
    const result = await db
      .prepare(
        `SELECT dish_type, COUNT(*) as count
         FROM restaurants
         WHERE is_active = 1 AND authenticity = 'authentic'
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

/** 和车站落地页同一套规则（含非正宗店、1.5km 以内），卡片上的家数和点进去看到的一致 */
async function getStationAreaCounts(): Promise<Record<StationAreaKey, number>> {
  const rows = await getLightRows();
  return Object.fromEntries(
    stationAreas.map(({ key }) => [key, countMatching(rows, { area: key })])
  ) as Record<StationAreaKey, number>;
}

export default async function HomePage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  const topPage = parsePage(query.topPage);
  const t = await getTranslations({ locale, namespace: "home" });
  const [cuisineCounts, dishTypeCounts, stationAreaCounts] = await Promise.all([
    getCuisineCounts(),
    getDishTypeCounts(),
    getStationAreaCounts(),
  ]);

  return (
    <>
      <JsonLd data={buildOrganizationJsonLd(locale)} />
      <HeroSection locale={locale} counts={cuisineCounts} />
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
        />
        <div className="divider-chinese" />
        <TopRestaurants locale={locale} title={t("section_new")} limit={6} sortMode="new" />
      </div>
    </>
  );
}
