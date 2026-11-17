import { redirect } from "next/navigation";
import LandingPage, { buildLandingMetadata } from "@/components/LandingPage";
import { landingCuisines, type LandingCuisine } from "@/lib/landing";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; cuisine: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale, cuisine } = await params;
  if (!landingCuisines.includes(cuisine as LandingCuisine)) return {};
  return buildLandingMetadata({ locale, category: cuisine });
}

export default async function CuisineLandingPage({ params }: Props) {
  const { locale, cuisine } = await params;
  // 以前这里对所有菜系都是跳转到筛选页；现在除了「综合/其他」都是独立落地页，
  // 未知菜系仍和以前一样落到 other 的筛选页
  if (!landingCuisines.includes(cuisine as LandingCuisine)) {
    redirect(`/${locale}/restaurants?cuisine=other`);
  }
  return <LandingPage locale={locale} category={cuisine} />;
}
