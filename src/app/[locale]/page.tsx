import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import HeroSection from "@/components/HeroSection";
import CuisineGrid from "@/components/CuisineGrid";
import TopRestaurants from "@/components/TopRestaurants";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return {
    title: t("hero_title"),
    description: t("hero_tagline"),
  };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;

  return (
    <>
      <HeroSection locale={locale} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <CuisineGrid locale={locale} />
        <div className="divider-chinese" />
        <TopRestaurants locale={locale} />
      </div>
    </>
  );
}
