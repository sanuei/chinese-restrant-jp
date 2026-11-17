import LandingPage, { buildLandingMetadata } from "@/components/LandingPage";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; area: string; category: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale, area, category } = await params;
  return buildLandingMetadata({ locale, area, category });
}

export default async function AreaCategoryLandingPage({ params }: Props) {
  const { locale, area, category } = await params;
  return <LandingPage locale={locale} area={area} category={category} />;
}
