import Link from "next/link";
import { Flame, Star, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getTrendingRestaurants } from "@/lib/views";
import {
  getRating,
  getRestaurantName,
  normalizeAuthenticity,
  normalizeCuisineType,
  parsePhotoReferences,
  photoSrc,
} from "@/lib/restaurant-types";

type Props = {
  locale: string;
  limit?: number;
};

const FALLBACK_PHOTO =
  "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop";

/** 前三名给金银铜，之后统一用素色，避免整排都在抢注意力 */
function rankStyle(rank: number): string {
  if (rank === 1) return "bg-gold-500 text-ink-900 border-gold-700";
  if (rank === 2) return "bg-warm-200 text-ink-900 border-ink-400";
  if (rank === 3) return "bg-vermilion-200 text-vermilion-900 border-vermilion-500";
  return "bg-white/90 text-ink-700 border-warm-200";
}

export default async function TrendingRanking({ locale, limit = 12 }: Props) {
  const t = await getTranslations({ locale, namespace: "home" });
  const tr = await getTranslations({ locale, namespace: "restaurant" });
  const tc = await getTranslations({ locale, namespace: "cuisine" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });

  const restaurants = await getTrendingRestaurants(limit);
  if (restaurants.length === 0) return null;

  return (
    <section className="py-8">
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h2 className="font-serif font-bold text-2xl sm:text-3xl text-ink-900 flex items-center gap-2">
            <Flame size={24} className="text-vermilion-700" />
            {t("section_trending")}
          </h2>
          <p className="text-sm text-ink-400 mt-1">{t("section_trending_hint")}</p>
        </div>
        <Link
          href={`/${locale}/restaurants`}
          className="text-sm font-medium hover:underline text-vermilion-700 shrink-0"
        >
          {t("see_all")}
        </Link>
      </div>

      {/* 横向滑动：移动端直接甩，桌面端用滚轮/拖拽。负边距让卡片能滑到屏幕边缘 */}
      <div className="scroll-row -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {restaurants.map((restaurant, index) => {
          const rank = index + 1;
          const name = getRestaurantName(restaurant, locale);
          const photos = parsePhotoReferences(restaurant.photos);
          // 宽度必须和列表卡片一致（600）：/api/photo 的 R2 缓存键是 ref+宽度，
          // 用没缓存过的宽度会回源 Google，key 一旦失效图片就全挂
          const photoUrl = photos.length > 0 ? photoSrc(photos[0], 600) : FALLBACK_PHOTO;
          const authenticity = normalizeAuthenticity(restaurant.authenticity);
          const cuisineType = normalizeCuisineType(restaurant.cuisine_type);

          return (
            <Link
              key={restaurant.id}
              href={`/${locale}/restaurants/${restaurant.id}`}
              className="scroll-row-item restaurant-card group block"
            >
              <div className="relative h-32 overflow-hidden bg-warm-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt={name}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span
                  className={`absolute top-2 left-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-sm font-bold shadow-sm ${rankStyle(rank)}`}
                >
                  {rank}
                </span>
                <span className={`absolute top-2 right-2 badge-${authenticity}`}>{ta(authenticity)}</span>
              </div>

              <div className="p-3">
                <h3 className="font-bold text-sm leading-tight text-ink-900 line-clamp-2 min-h-[2.5em]">
                  {name}
                </h3>

                <div className="mt-2 flex items-center gap-2 text-xs text-ink-400">
                  <span className={`cuisine-tag cuisine-${cuisineType}`}>{tc(cuisineType)}</span>
                  <span className="truncate">{restaurant.ward || restaurant.city}</span>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-ink-900 font-bold">
                    <Star size={12} className="fill-gold-500 text-gold-500" />
                    {getRating(restaurant).toFixed(1)}
                  </span>
                  {restaurant.view_count > 0 && (
                    <span className="flex items-center gap-1 text-vermilion-700">
                      <TrendingUp size={12} />
                      {restaurant.view_count.toLocaleString()} {tr("views")}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
