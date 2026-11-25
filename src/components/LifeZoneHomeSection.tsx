import Link from "next/link";
import { ChevronRight, Compass, Star, TrainFront } from "lucide-react";
import {
  CHINESE_SUPPORT_META,
  LIFE_CATEGORY_META,
  lifeCategories,
  normalizeChineseSupport,
  normalizeLifeCategory,
  getLifePlaceName,
  getLifeStationLabel,
  type LifePlaceRow,
} from "@/lib/life-types";
import { LIFE_CATEGORY_ICONS } from "@/lib/life-icons";
import { parsePhotoReferences, photoSrc } from "@/lib/restaurant-types";

type Props = {
  locale: string;
  categoryCounts: Record<string, number>;
  featuredPlaces: LifePlaceRow[];
};

/** 首页「在日华人生活专区」导览区块：8 大分类卡片 + 精选推荐门店 */
export default function LifeZoneHomeSection({ locale, categoryCounts, featuredPlaces }: Props) {
  const isZh = locale === "zh";
  const totalCount = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  return (
    <section className="py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-gold-300/30 bg-gold-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-gold-300">
            <Compass size={12} />
            <span>{isZh ? "新增专区" : "NEW"}</span>
            {totalCount > 0 && (
              <>
                <span className="text-white/35">·</span>
                <span className="text-white/80">
                  {isZh ? `已收录 ${totalCount} 家` : `${totalCount}件掲載`}
                </span>
              </>
            )}
          </div>
          <h2 className="font-serif text-2xl font-black text-ink-900 sm:text-3xl">
            {isZh ? "在日华人生活专区" : "在日中華ライフガイド"}
          </h2>
          <p className="mt-1 text-sm text-ink-400">
            {isZh
              ? "华人理发店、中文医院诊所、健身房私教、中医推拿、美甲美容、KTV 与房产签证一站直达"
              : "中国語対応のヘアサロン、クリニック、ジム、整体、美容、カラオケ、不動産・ビザ手続きまで"}
          </p>
        </div>

        <Link
          href={`/${locale}/life`}
          className="inline-flex items-center gap-1 rounded-full border border-gold-300/35 bg-gold-500/10 px-4 py-2 text-xs font-semibold text-gold-300 transition-all hover:border-gold-300/65 hover:bg-gold-500/20"
        >
          <span>{isZh ? "进入生活专区" : "すべて見る"}</span>
          <ChevronRight size={14} />
        </Link>
      </div>

      {/* 8 大生活分类入口 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {lifeCategories.map((cat) => {
          const Icon = LIFE_CATEGORY_ICONS[cat];
          const meta = LIFE_CATEGORY_META[cat];
          const count = categoryCounts[cat] || 0;
          return (
            <Link
              key={cat}
              href={`/${locale}/life?category=${cat}`}
              className="dish-type-tag group flex flex-col items-center justify-center rounded-2xl border px-3 py-4 text-center transition-all hover:-translate-y-0.5"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10"
                style={{ backgroundColor: meta.badgeBg }}
              >
                <Icon size={19} style={{ color: meta.accent }} />
              </span>
              <span className="mt-2.5 text-xs font-bold text-white group-hover:text-gold-300">
                {isZh ? meta.zh : meta.ja}
              </span>
              <span className="mt-0.5 text-[11px] text-white/45">
                {count > 0 ? (isZh ? `${count} 家` : `${count}件`) : isZh ? "浏览" : "見る"}
              </span>
            </Link>
          );
        })}
      </div>

      {/* 精选生活服务门店 */}
      {featuredPlaces.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featuredPlaces.map((place) => {
            const cat = normalizeLifeCategory(place.category);
            const support = normalizeChineseSupport(place.chinese_support);
            const catMeta = LIFE_CATEGORY_META[cat];
            const supportMeta = CHINESE_SUPPORT_META[support];
            const CatIcon = LIFE_CATEGORY_ICONS[cat];
            const photos = parsePhotoReferences(place.photos);
            const name = getLifePlaceName(place, locale);
            const stationLabel = getLifeStationLabel(place, locale);

            return (
              <Link
                key={place.id}
                href={`/${locale}/life/${place.id}`}
                className="restaurant-card group flex flex-col overflow-hidden"
              >
                <div className="relative h-36 w-full overflow-hidden bg-[#181620]">
                  {photos.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoSrc(photos[0], 600)}
                      alt={name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-400 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/25">
                      <CatIcon size={28} style={{ color: catMeta.accent, opacity: 0.55 }} />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />
                  <span
                    className={`absolute top-2.5 left-2.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold backdrop-blur-md ${supportMeta.cls}`}
                  >
                    {isZh ? supportMeta.zh : supportMeta.ja}
                  </span>
                  {Number(place.rating || 0) > 0 && (
                    <span className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-0.5 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-bold text-gold-300">
                      <Star size={10} className="fill-gold-300 text-gold-300" />
                      {Number(place.rating).toFixed(1)}
                    </span>
                  )}
                </div>

                <div className="p-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: catMeta.accent }}>
                    <CatIcon size={11} />
                    <span>{isZh ? catMeta.zh : catMeta.ja}</span>
                  </div>
                  <div className="mt-1 truncate font-serif text-sm font-bold text-white group-hover:text-gold-300">
                    {name}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] text-white/50">
                    <TrainFront size={11} className="shrink-0 text-white/40" />
                    <span className="truncate">{stationLabel || place.ward || ""}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
