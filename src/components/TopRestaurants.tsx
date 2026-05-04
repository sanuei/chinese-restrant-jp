import { getDb } from "@/lib/cloudflare";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Star, MapPin } from "lucide-react";

export const runtime = "edge";

export default async function TopRestaurants({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "home" });
  const tc = await getTranslations({ locale, namespace: "cuisine" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });
  const tr = await getTranslations({ locale, namespace: "restaurant" });

  const db = await getDb();
  let restaurants = [];
  
  try {
    const { results } = await db.prepare(
      `SELECT * FROM restaurants WHERE is_active = 1 ORDER BY trusted_rating DESC, raw_review_count DESC LIMIT 6`
    ).all();
    restaurants = results || [];
  } catch (e) {
    console.error("Database query error:", e);
  }

  // 开发环境如果没有数据，提供一个占位提示
  if (restaurants.length === 0) {
    return (
      <section className="py-12">
        <h2 className="font-serif font-bold text-2xl sm:text-3xl mb-8 text-ink-900">{t("section_top")}</h2>
        <div className="text-center py-10 bg-warm-100 rounded-2xl text-ink-400">
          尚未采集餐厅数据，请运行同步脚本获取数据。
        </div>
      </section>
    );
  }

  return (
    <section className="py-12">
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-serif font-bold text-2xl sm:text-3xl text-ink-900">
          {t("section_top")}
        </h2>
        <Link href={`/${locale}/restaurants`} className="text-sm font-medium hover:underline text-vermilion-700">
          查看全部
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {restaurants.map((restaurant: any) => {
          const name = locale === "zh" ? (restaurant.name_zh || restaurant.name_original) : (restaurant.name_ja || restaurant.name_original);
          const summary = locale === "zh" ? restaurant.ai_summary_zh : restaurant.ai_summary_ja;
          
          let photoUrl = "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop";
          try {
            if (restaurant.photos) {
              const photos = JSON.parse(restaurant.photos);
              if (photos.length > 0) {
                photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${photos[0]}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
              }
            }
          } catch (e) {}

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
                  <span className={`badge-${restaurant.authenticity}`}>
                    {restaurant.authenticity === "authentic" ? "🔴 " : restaurant.authenticity === "adapted" ? "🟡 " : "🔵 "}
                    {ta(restaurant.authenticity as any)}
                  </span>
                </div>
              </div>
              
              <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg leading-tight text-ink-900 line-clamp-1">
                    {name}
                  </h3>
                  <div className="flex items-center gap-1 bg-warm-50 px-2 py-1 rounded-md text-ink-900">
                    <Star size={14} className="fill-gold-500 text-gold-500" />
                    <span className="font-bold text-sm">{(restaurant.trusted_rating || restaurant.raw_rating).toFixed(1)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs mb-4 text-ink-400">
                  <span className="flex items-center gap-1"><MapPin size={12} /> {restaurant.ward || restaurant.city}</span>
                  <span className={`cuisine-tag cuisine-${restaurant.cuisine_type}`}>{tc(restaurant.cuisine_type as any)}</span>
                  {restaurant.price_level && <span>{tr(`price_level.${restaurant.price_level}` as any)}</span>}
                </div>

                {summary && (
                  <div className="ai-summary-card text-sm leading-snug text-ink-700 line-clamp-2">
                    {summary}
                  </div>
                )}
                
                <div className="mt-4 text-xs flex justify-between items-center text-ink-400">
                  <span>{restaurant.trusted_review_count || 0} {tr("trusted_reviews")}</span>
                  <span>Google: {(restaurant.raw_rating || 0).toFixed(1)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
