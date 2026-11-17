import LandingPage, { buildLandingMetadata } from "@/components/LandingPage";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; area: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale, area } = await params;
  return buildLandingMetadata({ locale, area });
}

export default async function AreaLandingPage({ params }: Props) {
  const { locale, area } = await params;
  return <LandingPage locale={locale} area={area} />;
}
