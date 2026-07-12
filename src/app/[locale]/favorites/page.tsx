import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Heart, MapPin, Star } from "lucide-react";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { getTranslations } from "next-intl/server";
import FavoriteButton from "@/components/FavoriteButton";
import {
  getRating,
  getRestaurantName,
  getRestaurantSummary,
  normalizeAuthenticity,
  normalizeCuisineType,
  normalizePriceLevel,
  parsePhotoReferences,
  photoSrc,
  type RestaurantRow,
} from "@/lib/restaurant-types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "我的收藏" : "お気に入り",
    alternates: { canonical: `/${locale}/favorites` },
    robots: { index: false, follow: false },
  };
}

export default async function FavoritesPage({ params }: Props) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}/favorites`)}`);
  }

  const t = await getTranslations({ locale, namespace: "restaurant" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });
  const tc = await getTranslations({ locale, namespace: "cuisine" });

  const db = await getDb();
  let restaurants: RestaurantRow[] = [];
  try {
    const { results = [] } = await db
      .prepare(`
        SELECT r.* FROM restaurants r
        JOIN favorites f ON f.restaurant_id = r.id
        WHERE f.user_id = ? AND r.is_active = 1
        ORDER BY f.created_at DESC
      `)
      .bind(session.user.id)
      .all<RestaurantRow>();
    restaurants = results || [];
  } catch (error) {
    console.error("Favorites query error:", error);
  }

  const copy = locale === "zh"
    ? {
        eyebrow: "我的收藏",
        title: "收藏的餐厅",
        subtitle: "点击卡片上的爱心可以取消收藏。",
        empty: "还没有收藏任何餐厅，去列表看看吧。",
        browse: "浏览餐厅",
      }
    : {
        eyebrow: "Favorites",
        title: "お気に入りのレストラン",
        subtitle: "カード上のハートをクリックすると解除できます。",
        empty: "まだお気に入りに追加したレストランがありません。",
        browse: "レストランを探す",
      };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase mb-2 text-vermilion-700">
          <Heart size={14} />
          {copy.eyebrow}
        </div>
        <h1 className="font-serif font-bold text-3xl mb-2 text-ink-900">{copy.title}</h1>
        <p className="text-sm text-ink-400">{copy.subtitle}</p>
      </div>

      {restaurants.length === 0 ? (
        <div className="text-center py-20 text-ink-400">
          <p className="mb-4">{copy.empty}</p>
          <Link href={`/${locale}/restaurants`} className="btn-primary inline-flex">
            {copy.browse}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {restaurants.map((restaurant) => {
            const name = getRestaurantName(restaurant, locale);
            const summary = getRestaurantSummary(restaurant, locale);
            const authenticity = normalizeAuthenticity(restaurant.authenticity);
            const cuisineType = normalizeCuisineType(restaurant.cuisine_type);
            const priceLevel = normalizePriceLevel(restaurant.price_level);

            let photoUrl = "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop";
            const photos = parsePhotoReferences(restaurant.photos);
            if (photos.length > 0) {
              photoUrl = photoSrc(photos[0], 600);
            }

            return (
              <Link key={restaurant.id} href={`/${locale}/restaurants/${restaurant.id}`} className="restaurant-card group block">
                <div className="relative h-48 overflow-hidden bg-warm-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt={name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-3 right-3 flex gap-2">
                    <span className={`badge-${authenticity}`}>
                      {authenticity === "authentic" ? "🔴 " : authenticity === "adapted" ? "🟡 " : "🔵 "}
                      {ta(authenticity)}
                    </span>
                  </div>
                  <div className="absolute top-3 left-3">
                    <FavoriteButton
                      restaurantId={restaurant.id}
                      initialFavorited={true}
                      isLoggedIn={true}
                      locale={locale}
                    />
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg leading-tight text-ink-900 line-clamp-1">{name}</h3>
                    <div className="flex items-center gap-1 bg-warm-50 px-2 py-1 rounded-md text-ink-900">
                      <Star size={14} className="fill-gold-500 text-gold-500" />
                      <span className="font-bold text-sm">{getRating(restaurant).toFixed(1)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs mb-4 text-ink-400">
                    <span className="flex items-center gap-1"><MapPin size={12} /> {restaurant.ward || restaurant.city}</span>
                    <span className={`cuisine-tag cuisine-${cuisineType}`}>{tc(cuisineType)}</span>
                    {priceLevel && <span>{t(`price_level.${priceLevel}`)}</span>}
                  </div>

                  {summary && (
                    <div className="ai-summary-card text-sm leading-snug text-ink-700 line-clamp-2">{summary}</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
