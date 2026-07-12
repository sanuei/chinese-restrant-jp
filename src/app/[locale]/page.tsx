import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import HeroSection from "@/components/HeroSection";
import TopRestaurants from "@/components/TopRestaurants";
import DishTypeGrid from "@/components/DishTypeGrid";
import JsonLd from "@/components/JsonLd";
import { buildOrganizationJsonLd } from "@/lib/json-ld";
import { getDb } from "@/lib/cloudflare";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

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

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  const [cuisineCounts, dishTypeCounts] = await Promise.all([getCuisineCounts(), getDishTypeCounts()]);

  return (
    <>
      <JsonLd data={buildOrganizationJsonLd(locale)} />
      <HeroSection locale={locale} counts={cuisineCounts} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <DishTypeGrid locale={locale} counts={dishTypeCounts} />
        <div className="divider-chinese" />
        <TopRestaurants locale={locale} title={t("section_top")} limit={9} sortMode="top" />
        <div className="divider-chinese" />
        <TopRestaurants locale={locale} title={t("section_new")} limit={6} sortMode="new" />
      </div>
    </>
  );
}
