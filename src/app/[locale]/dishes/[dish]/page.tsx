import { notFound, redirect } from "next/navigation";
import LandingPage, { buildLandingMetadata } from "@/components/LandingPage";
import { landingDishes, type LandingDish } from "@/lib/landing";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; dish: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale, dish } = await params;
  if (!landingDishes.includes(dish as LandingDish)) return {};
  return buildLandingMetadata({ locale, category: dish });
}

export default async function DishLandingPage({ params }: Props) {
  const { locale, dish } = await params;
  // 「综合正餐」不是有人会搜的品类，没有落地页，沿用原来的筛选页
  if (dish === "other") redirect(`/${locale}/restaurants?dish_type=other`);
  // 菜系的 key 走 /cuisines/，这里不接，免得同一内容出现两个 URL
  if (!landingDishes.includes(dish as LandingDish)) notFound();
  return <LandingPage locale={locale} category={dish} />;
}
