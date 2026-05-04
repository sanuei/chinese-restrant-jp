import { useTranslations } from "next-intl";
import Link from "next/link";
import { Star, MapPin } from "lucide-react";

type Restaurant = {
  id: string;
  nameZh: string;
  nameJa: string;
  ward: string;
  cuisine: string;
  authenticity: "authentic" | "adapted" | "japanese" | "unknown";
  trustedRating: number;
  rawRating: number;
  trustedReviews: number;
  priceLevel: number;
  aiSummaryZh: string;
  aiSummaryJa: string;
  photoUrl: string;
};

// 模拟数据 (开发阶段用)
const MOCK_RESTAURANTS: Restaurant[] = [
  {
    id: "1",
    nameZh: "知音食堂",
    nameJa: "知音食堂",
    ward: "池袋",
    cuisine: "sichuan",
    authenticity: "authentic",
    trustedRating: 4.6,
    rawRating: 4.2,
    trustedReviews: 128,
    priceLevel: 2,
    aiSummaryZh: "极致正宗的四川麻辣风味，辣度不妥协，水煮鱼必点。",
    aiSummaryJa: "妥協のない本格的な辛さ。水煮魚が絶品で、本場の味を求める人におすすめ。",
    photoUrl: "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: "2",
    nameZh: "南国酒家",
    nameJa: "南国酒家",
    ward: "渋谷",
    cuisine: "cantonese",
    authenticity: "adapted",
    trustedRating: 4.2,
    rawRating: 4.5,
    trustedReviews: 85,
    priceLevel: 3,
    aiSummaryZh: "高端粤菜，口味偏清淡，适合商务宴请或家庭聚餐。",
    aiSummaryJa: "上品な広東料理。日本人向けにマイルドにアレンジされており、会食に最適。",
    photoUrl: "https://images.unsplash.com/photo-1525648199074-cee30ba79a4a?q=80&w=600&auto=format&fit=crop",
  },
  {
    id: "3",
    nameZh: "日高屋",
    nameJa: "日高屋",
    ward: "新宿",
    cuisine: "other",
    authenticity: "japanese",
    trustedRating: 3.8,
    rawRating: 3.5,
    trustedReviews: 320,
    priceLevel: 1,
    aiSummaryZh: "标准的日式快餐中华，便宜快捷，深夜食堂。",
    aiSummaryJa: "定番のチェーン店。安くて早く、仕事帰りの一杯や締めのラーメンにぴったり。",
    photoUrl: "https://images.unsplash.com/photo-1552611052-33e04de081de?q=80&w=600&auto=format&fit=crop",
  }
];

export default function TopRestaurants({ locale }: { locale: string }) {
  const t = useTranslations("home");
  const tc = useTranslations("cuisine");
  const ta = useTranslations("auth_badge");
  const tr = useTranslations("restaurant");

  return (
    <section className="py-12">
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-serif font-bold text-2xl sm:text-3xl"
            style={{ color: "var(--color-ink-900)" }}>
          {t("section_top")}
        </h2>
        <Link href={`/${locale}/restaurants`} className="text-sm font-medium hover:underline" style={{ color: "var(--color-vermilion-700)" }}>
          查看全部
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {MOCK_RESTAURANTS.map((restaurant) => {
          const name = locale === "zh" ? restaurant.nameZh : restaurant.nameJa;
          const summary = locale === "zh" ? restaurant.aiSummaryZh : restaurant.aiSummaryJa;
          
          return (
            <Link key={restaurant.id} href={`/${locale}/restaurants/${restaurant.id}`} className="restaurant-card group block">
              <div className="relative h-48 overflow-hidden bg-warm-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={restaurant.photoUrl} 
                  alt={name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute top-3 right-3 flex gap-2">
                  <span className={`badge-${restaurant.authenticity}`}>
                    {restaurant.authenticity === "authentic" ? "🔴 " : restaurant.authenticity === "adapted" ? "🟡 " : "🔵 "}
                    {ta(restaurant.authenticity)}
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
                    <span className="font-bold text-sm">{restaurant.trustedRating.toFixed(1)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs mb-4" style={{ color: "var(--color-ink-400)" }}>
                  <span className="flex items-center gap-1"><MapPin size={12} /> {restaurant.ward}</span>
                  <span className={`cuisine-tag cuisine-${restaurant.cuisine}`}>{tc(restaurant.cuisine)}</span>
                  <span>{tr("price_level").split(",")[restaurant.priceLevel]}</span>
                </div>

                <div className="ai-summary-card text-sm leading-snug" style={{ color: "var(--color-ink-700)" }}>
                  {summary}
                </div>
                
                <div className="mt-4 text-xs flex justify-between items-center" style={{ color: "var(--color-ink-400)" }}>
                  <span>{restaurant.trustedReviews} {tr("trusted_reviews")}</span>
                  <span>Google: {restaurant.rawRating.toFixed(1)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
