import Link from "next/link";
import { useTranslations } from "next-intl";
import { MapPin, Star } from "lucide-react";
import FavoriteButton from "@/components/FavoriteButton";
import {
  getRating,
  getRestaurantName,
  getRestaurantSummary,
  getStationLabel,
  normalizeAuthenticity,
  normalizeCuisineType,
  normalizePriceLevel,
  parsePhotoReferences,
  photoSrc,
  type RestaurantRow,
} from "@/lib/restaurant-types";

const FALLBACK_PHOTO =
  "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop";

type Props = {
  restaurant: RestaurantRow;
  locale: string;
  isLoggedIn: boolean;
  isFavorited: boolean;
  /** 车站落地页上「池袋駅 徒歩3分」比行政区更有用；没有车站信息时回退到行政区 */
  preferStation?: boolean;
  /** 落地页的排名序号 */
  rank?: number;
};

export default function RestaurantCard({ restaurant, locale, isLoggedIn, isFavorited, preferStation, rank }: Props) {
  const t = useTranslations("restaurant");
  const ta = useTranslations("auth_badge");
  const tc = useTranslations("cuisine");

  const name = getRestaurantName(restaurant, locale);
  const summary = getRestaurantSummary(restaurant, locale);
  const authenticity = normalizeAuthenticity(restaurant.authenticity);
  const cuisineType = normalizeCuisineType(restaurant.cuisine_type);
  const priceLevel = normalizePriceLevel(restaurant.price_level);
  const location = (preferStation ? getStationLabel(restaurant, locale) : null) || restaurant.ward || restaurant.city;

  const photos = parsePhotoReferences(restaurant.photos);
  // 经由 /api/photo 代理（R2 缓存），不再每次展示都直连 Google 计费
  const photoUrl = photos.length > 0 ? photoSrc(photos[0], 800) : FALLBACK_PHOTO;

  return (
    <Link href={`/${locale}/restaurants/${restaurant.id}`} className="restaurant-card group block">
      <div className="relative h-48 overflow-hidden bg-warm-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name}
          loading={rank && rank > 3 ? "lazy" : undefined}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute top-3 right-3 flex gap-2">
          <span className={`badge-${authenticity}`}>{ta(authenticity)}</span>
        </div>
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <FavoriteButton
            restaurantId={restaurant.id}
            initialFavorited={isFavorited}
            isLoggedIn={isLoggedIn}
            locale={locale}
          />
          {rank !== undefined && (
            <span className="rounded-md bg-ink-900/80 px-2 py-1 text-xs font-bold text-white">
              {locale === "zh" ? `第 ${rank} 名` : `${rank}位`}
            </span>
          )}
        </div>
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-lg leading-tight" style={{ color: "var(--color-ink-900)" }}>
            {name}
          </h3>
          <div className="flex items-center gap-1 bg-warm-50 px-2 py-1 rounded-md" style={{ color: "var(--color-ink-900)" }}>
            <Star size={14} className="fill-gold-500 text-gold-500" style={{ color: "var(--color-gold-500)", fill: "var(--color-gold-500)" }} />
            <span className="font-bold text-sm">{getRating(restaurant).toFixed(1)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs mb-4" style={{ color: "var(--color-ink-400)" }}>
          <span className="flex items-center gap-1"><MapPin size={12} /> {location}</span>
          <span className={`cuisine-tag cuisine-${cuisineType}`}>{tc(cuisineType)}</span>
          {priceLevel && <span>{t(`price_level.${priceLevel}`)}</span>}
        </div>

        {summary && (
          <div className="ai-summary-card text-sm leading-snug" style={{ color: "var(--color-ink-700)" }}>
            {summary}
          </div>
        )}

        <div className="mt-4 text-xs flex justify-between items-center" style={{ color: "var(--color-ink-400)" }}>
          <span>{restaurant.trusted_review_count || 0} {t("trusted_reviews")}</span>
          <span>Google: {(restaurant.raw_rating || 0).toFixed(1)}</span>
        </div>
      </div>
    </Link>
  );
}
