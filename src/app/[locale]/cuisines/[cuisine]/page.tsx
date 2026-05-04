import { redirect } from "next/navigation";
import { cuisineTypes, type CuisineType } from "@/lib/restaurant-types";

type Props = {
  params: Promise<{ locale: string; cuisine: string }>;
};

export default async function CuisineRedirectPage({ params }: Props) {
  const { locale, cuisine } = await params;
  const cuisineFilter = cuisineTypes.includes(cuisine as CuisineType) ? cuisine : "other";

  redirect(`/${locale}/restaurants?cuisine=${cuisineFilter}`);
}
