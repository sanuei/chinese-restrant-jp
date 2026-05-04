import { getDb } from "@/lib/cloudflare";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Star, MapPin } from "lucide-react";

export const runtime = "edge";

export default async function RestaurantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "restaurant" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });
  const tc = await getTranslations({ locale, namespace: "cuisine" });
  const queryParams = await searchParams;
  
  const q = typeof queryParams.q === 'string' ? queryParams.q : '';
  const cuisine = typeof queryParams.cuisine === 'string' ? queryParams.cuisine : '';

  const db = await getDb();

  // 构建查询语句
  let sql = `SELECT * FROM restaurants WHERE is_active = 1`;
  const binds: any[] = [];

  if (q) {
    // 简单的搜索
    sql += ` AND (name_zh LIKE ? OR name_ja LIKE ? OR name_original LIKE ?)`;
    const likeQ = `%${q}%`;
    binds.push(likeQ, likeQ, likeQ);
  }

  if (cuisine) {
    sql += ` AND cuisine_type = ?`;
    binds.push(cuisine);
  }

  sql += ` ORDER BY trusted_rating DESC, raw_review_count DESC LIMIT 50`;

  let restaurants = [];
  try {
    const { results } = await db.prepare(sql).bind(...binds).all();
    restaurants = results || [];
  } catch (error) {
    console.error("Database query error:", error);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="font-serif font-bold text-3xl mb-8" style={{ color: "var(--color-ink-900)" }}>
        {q ? `搜索结果: "${q}"` : "全部餐厅"}
      </h1>

      {restaurants.length === 0 ? (
        <div className="text-center py-20 text-ink-400">
          <p>没有找到相关餐厅。请尝试其他关键词或菜系。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {restaurants.map((restaurant: any) => {
            const name = locale === "zh" ? (restaurant.name_zh || restaurant.name_original) : (restaurant.name_ja || restaurant.name_original);
            const summary = locale === "zh" ? restaurant.ai_summary_zh : restaurant.ai_summary_ja;
            
            let photoUrl = "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop"; // fallback
            try {
              if (restaurant.photos) {
                const photos = JSON.parse(restaurant.photos);
                if (photos.length > 0) {
                  photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photos[0]}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
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
                    <h3 className="font-bold text-lg leading-tight" style={{ color: "var(--color-ink-900)" }}>
                      {name}
                    </h3>
                    <div className="flex items-center gap-1 bg-warm-50 px-2 py-1 rounded-md" style={{ color: "var(--color-ink-900)" }}>
                      <Star size={14} className="fill-gold-500 text-gold-500" style={{ color: "var(--color-gold-500)", fill: "var(--color-gold-500)" }} />
                      <span className="font-bold text-sm">{(restaurant.trusted_rating || restaurant.raw_rating).toFixed(1)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs mb-4" style={{ color: "var(--color-ink-400)" }}>
                    <span className="flex items-center gap-1"><MapPin size={12} /> {restaurant.ward || restaurant.city}</span>
                    <span className={`cuisine-tag cuisine-${restaurant.cuisine_type}`}>{tc(restaurant.cuisine_type as any)}</span>
                    {restaurant.price_level && <span>{t(`price_level.${restaurant.price_level}` as any)}</span>}
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
          })}
        </div>
      )}
    </div>
  );
}
