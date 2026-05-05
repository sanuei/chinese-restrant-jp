import { getDb } from "@/lib/cloudflare";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Star, MapPin, Phone, Globe, ShieldCheck, ShieldAlert, MapPinned } from "lucide-react";
import {
  getRating,
  getRestaurantName,
  getRestaurantSummary,
  normalizeAuthenticity,
  normalizeCuisineType,
  parsePhotoReferences,
  type RestaurantRow,
  type ReviewRow,
} from "@/lib/restaurant-types";

export const dynamic = "force-dynamic";

export default async function RestaurantDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "restaurant" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });
  const tc = await getTranslations({ locale, namespace: "cuisine" });

  const db = await getDb();
  
  let restaurant: RestaurantRow | null = null;
  let reviews: ReviewRow[] = [];
  
  try {
    const { results: rResults = [] } = await db.prepare(`SELECT * FROM restaurants WHERE id = ?`).bind(id).all<RestaurantRow>();
    if (rResults && rResults.length > 0) {
      restaurant = rResults[0];
    }
    
    if (restaurant) {
      const { results: revResults = [] } = await db.prepare(
        `SELECT * FROM reviews WHERE restaurant_id = ? AND credibility_action != 'remove' ORDER BY credibility_score DESC LIMIT 20`
      ).bind(id).all<ReviewRow>();
      reviews = revResults || [];
    }
  } catch (error) {
    console.error("Database error:", error);
  }

  if (!restaurant) {
    notFound();
  }

  const name = getRestaurantName(restaurant, locale);
  const summary = getRestaurantSummary(restaurant, locale);
  const authenticityReason = locale === "zh" ? restaurant.authenticity_reason_zh : restaurant.authenticity_reason_ja;
  const authenticity = normalizeAuthenticity(restaurant.authenticity);
  const cuisineType = normalizeCuisineType(restaurant.cuisine_type);
  
  const rawPhotos = parsePhotoReferences(restaurant.photos).slice(0, 5);
  const photos = rawPhotos.map((ref) =>
    ref.startsWith("http")
      ? ref
      : `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* 头部：照片轮播占位符 */}
      <div className="flex gap-2 h-64 sm:h-96 mb-8 overflow-hidden rounded-2xl">
        {photos.length > 0 ? (
          <>
            <div className="flex-1 overflow-hidden bg-warm-100">
               {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos[0]} alt={name} className="w-full h-full object-cover" />
            </div>
            {photos.length > 1 && (
              <div className="w-1/3 flex flex-col gap-2">
                {photos.slice(1, 3).map((p, i) => (
                  <div key={i} className="flex-1 overflow-hidden bg-warm-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt={name} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full bg-warm-200 flex items-center justify-center text-ink-400">
            暂无照片
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-12">
        {/* 左侧：主要信息 */}
        <div className="flex-1">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <span className={`badge-${authenticity}`}>
                {authenticity === "authentic" ? "🔴 " : authenticity === "adapted" ? "🟡 " : "🔵 "}
                {ta(authenticity)}
              </span>
              <span className={`cuisine-tag cuisine-${cuisineType}`}>
                {tc(cuisineType)}
              </span>
            </div>
            <h1 className="font-serif font-black text-4xl leading-tight mb-4 text-ink-900">
              {name}
            </h1>
            
            <div className="flex flex-wrap items-center gap-6 text-sm text-ink-700">
              <div className="flex items-center gap-1.5">
                <Star size={18} className="fill-gold-500 text-gold-500" />
                <span className="font-bold text-lg">{getRating(restaurant).toFixed(1)}</span>
                <span className="text-ink-400 ml-1">
                  ({restaurant.trusted_review_count || 0} {t("trusted_reviews")})
                </span>
              </div>
              
              <div className="flex items-center gap-1.5 text-ink-400">
                <span className="line-through opacity-70">Google: {(restaurant.raw_rating || 0).toFixed(1)}</span>
              </div>
            </div>
          </div>

          <div className="divider-chinese" />

          {/* AI 综合摘要 */}
          <section className="mb-12">
            <h2 className="font-serif font-bold text-2xl mb-6 text-ink-900">{t("ai_summary")}</h2>
            <div className="ai-summary-card text-lg leading-relaxed text-ink-700 shadow-md">
              {summary || "摘要生成中..."}
              
              {authenticityReason && (
                <div className="mt-4 pt-4 border-t border-gold-300/30 text-sm">
                  <span className="font-bold text-vermilion-700">{t("authenticity_reason")}: </span>
                  {authenticityReason}
                </div>
              )}
            </div>
          </section>

          {/* 真实评论列表 */}
          <section>
            <h2 className="font-serif font-bold text-2xl mb-6 text-ink-900">大家都在说</h2>
            <div className="flex flex-col gap-6">
              {reviews.length > 0 ? reviews.map((review) => (
                <div key={review.id} className="p-5 border border-warm-200 bg-white rounded-xl shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {review.author_photo_url && <img src={review.author_photo_url} alt="" className="w-10 h-10 rounded-full bg-warm-100" />}
                    <div>
                      <div className="font-bold text-sm text-ink-900">{review.author_name}</div>
                      <div className="text-xs text-ink-400">{review.published_at ? new Date(review.published_at).toLocaleDateString() : ""}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="flex text-gold-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={14} className={i < review.rating ? "fill-current" : "opacity-30"} />
                        ))}
                      </div>
                      {review.credibility_action === "flag" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                          <ShieldAlert size={12} /> 存疑
                        </span>
                      )}
                      {review.credibility_action === "keep" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 flex items-center gap-1">
                          <ShieldCheck size={12} /> 真实
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-700">{review.text || ""}</p>
                </div>
              )) : (
                <div className="text-center py-10 text-ink-400">暂无评论</div>
              )}
            </div>
          </section>
        </div>

        {/* 右侧：侧边栏信息 */}
        <div className="w-full md:w-80 shrink-0">
          <div className="sticky top-24 p-6 bg-white border border-warm-200 rounded-xl shadow-sm">
            <h3 className="font-bold text-lg mb-4 text-ink-900">餐厅信息</h3>
            <Link
              href={`/${locale}/map?restaurant=${restaurant.id}`}
              className="mb-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-vermilion-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-vermilion-900"
            >
              <MapPinned size={16} />
              {locale === "zh" ? "在地图中查看" : "地図で見る"}
            </Link>
            
            <ul className="flex flex-col gap-4 text-sm text-ink-700">
              <li className="flex gap-3">
                <MapPin size={18} className="text-vermilion-700 shrink-0 mt-0.5" />
                <span>{restaurant.address}</span>
              </li>
              {restaurant.phone && (
                <li className="flex gap-3">
                  <Phone size={18} className="text-vermilion-700 shrink-0 mt-0.5" />
                  <span>{restaurant.phone}</span>
                </li>
              )}
              {restaurant.website && (
                <li className="flex gap-3">
                  <Globe size={18} className="text-vermilion-700 shrink-0 mt-0.5" />
                  <a href={restaurant.website} target="_blank" rel="noopener noreferrer" className="hover:text-vermilion-700 underline truncate">
                    访问网站
                  </a>
                </li>
              )}
            </ul>

            <div className="mt-8 pt-6 border-t border-warm-100 text-xs text-ink-400 text-center">
              Google Maps Place ID: <br/> {restaurant.id}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
