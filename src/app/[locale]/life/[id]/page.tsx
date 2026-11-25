import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  MapPin,
  Navigation,
  Phone,
  Sparkles,
  Star,
  TrainFront,
} from "lucide-react";
import { getDb } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/session";
import { getLifePlaceCommunity } from "@/lib/life-community";
import OpeningHours from "@/components/OpeningHours";
import RestaurantCommunity from "@/components/RestaurantCommunity";
import {
  CHINESE_SUPPORT_META,
  LIFE_CATEGORY_META,
  getLifePlaceName,
  getLifePlaceSummary,
  getLifeStationLabel,
  normalizeChineseSupport,
  normalizeLifeCategory,
  parseLifeTags,
  type LifePlaceRow,
} from "@/lib/life-types";
import { LIFE_CATEGORY_ICONS } from "@/lib/life-icons";
import { parsePhotoReferences, photoSrc } from "@/lib/restaurant-types";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

async function getLifePlace(id: string): Promise<LifePlaceRow | null> {
  const db = await getDb();
  const row = await db
    .prepare(`SELECT * FROM life_places WHERE id = ? AND is_active = 1`)
    .bind(id)
    .first<LifePlaceRow>();
  return row ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const place = await getLifePlace(id);
  if (!place) {
    return { title: locale === "zh" ? "未找到门店" : "見つかりません" };
  }
  const name = getLifePlaceName(place, locale);
  const category = normalizeLifeCategory(place.category);
  const catLabel = locale === "zh" ? LIFE_CATEGORY_META[category].zh : LIFE_CATEGORY_META[category].ja;
  const summary = getLifePlaceSummary(place, locale);

  return {
    title: `${name} - ${catLabel}`,
    description: summary || `${name} (${place.address})`,
    alternates: {
      canonical: `/${locale}/life/${id}`,
      languages: {
        zh: `/zh/life/${id}`,
        ja: `/ja/life/${id}`,
        "x-default": `/zh/life/${id}`,
      },
    },
  };
}

export default async function LifePlaceDetailPage({ params }: Props) {
  const { locale, id } = await params;
  const isZh = locale === "zh";
  const place = await getLifePlace(id);

  if (!place) {
    notFound();
  }

  const db = await getDb();
  const currentUser = await getCurrentUser();

  const [community, relatedRes] = await Promise.all([
    getLifePlaceCommunity(place.id, currentUser),
    db
      .prepare(
        `SELECT *
         FROM life_places
         WHERE is_active = 1
           AND COALESCE(business_status, 'OPERATIONAL') != 'CLOSED_PERMANENTLY'
           AND category = ?
           AND id != ?
         ORDER BY COALESCE(rating, 0) DESC, COALESCE(review_count, 0) DESC
         LIMIT 4`
      )
      .bind(place.category, place.id)
      .all<LifePlaceRow>(),
  ]);

  const category = normalizeLifeCategory(place.category);
  const support = normalizeChineseSupport(place.chinese_support);
  const catMeta = LIFE_CATEGORY_META[category];
  const supportMeta = CHINESE_SUPPORT_META[support];
  const CatIcon = LIFE_CATEGORY_ICONS[category];

  const name = getLifePlaceName(place, locale);
  const altName =
    place.name_original && place.name_original !== name ? place.name_original : null;
  const summary = getLifePlaceSummary(place, locale);
  const tags = parseLifeTags(isZh ? place.tags_zh : place.tags_ja);
  const stationLabel = getLifeStationLabel(place, locale);
  const photos = parsePhotoReferences(place.photos);
  const mapsUrl =
    place.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  const isPermClosed = place.business_status === "CLOSED_PERMANENTLY";
  const isTempClosed = place.business_status === "CLOSED_TEMPORARILY";
  const relatedPlaces = relatedRes.results || [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 返回导航 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/${locale}/life?category=${category}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white/65 transition-colors hover:text-gold-300"
        >
          <ArrowLeft size={16} />
          <span>{isZh ? `返回${catMeta.zh}` : `${catMeta.ja}一覧に戻る`}</span>
        </Link>
        <Link
          href={`/${locale}/life`}
          className="text-xs font-medium text-white/45 transition-colors hover:text-white"
        >
          {isZh ? "华人生活专区首页" : "生活サービストップ"}
        </Link>
      </div>

      {/* 停业 / 暂停营业提示 */}
      {(isPermClosed || isTempClosed) && (
        <div
          className={`mb-6 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm ${
            isPermClosed
              ? "border-red-500/40 bg-red-500/15 text-red-200"
              : "border-amber-400/40 bg-amber-500/15 text-amber-200"
          }`}
        >
          <AlertTriangle size={17} className="shrink-0" />
          <span>
            {isPermClosed
              ? isZh
                ? "该门店已标记为永久停业，页面仅作历史信息保留。"
                : "この店舗は閉店済みとして記録されています。"
              : isZh
                ? "该门店目前标记为暂停营业，前往前建议先电话或查看官网确认。"
                : "現在一時休業中となっています。訪問前に最新情報をご確認ください。"}
          </span>
        </div>
      )}

      {/* 顶部封面相册 */}
      {photos.length > 0 && (
        <div
          className={`mb-7 grid gap-2.5 overflow-hidden rounded-2xl border border-white/10 ${
            photos.length === 1
              ? "grid-cols-1"
              : photos.length === 2
                ? "grid-cols-1 sm:grid-cols-2"
                : "grid-cols-1 sm:grid-cols-3"
          }`}
        >
          {photos.slice(0, 3).map((ref, idx) => (
            <div
              key={`${ref}-${idx}`}
              className={`relative overflow-hidden bg-[#181620] ${
                idx === 0 && photos.length >= 3 ? "h-64 sm:col-span-2 sm:h-80" : "h-56 sm:h-80"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoSrc(ref, idx === 0 ? 1000 : 600)}
                alt={`${name} ${idx + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {/* 主体两栏布局 */}
      <div className="mb-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* 左栏：门店主信息 + AI 介绍 */}
        <div className="space-y-6 lg:col-span-2">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs font-bold"
                style={{ backgroundColor: catMeta.badgeBg, color: catMeta.accent }}
              >
                <CatIcon size={13} />
                {isZh ? catMeta.zh : catMeta.ja}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${supportMeta.cls}`}
              >
                {isZh ? supportMeta.zh : supportMeta.ja}
              </span>
            </div>

            <h1 className="font-serif text-2xl font-black tracking-tight text-white sm:text-3xl">
              {name}
            </h1>
            {altName && <p className="mt-1 text-sm text-white/50">{altName}</p>}

            {/* Google 评分 + 站内评分概览 */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              {Number(place.rating || 0) > 0 && (
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-gold-300/25 bg-gold-500/10 px-3 py-1.5">
                  <Star size={15} className="fill-gold-300 text-gold-300" />
                  <span className="font-bold text-gold-300">{Number(place.rating).toFixed(1)}</span>
                  <span className="text-xs text-white/60">
                    Google ({place.review_count || 0} {isZh ? "条评" : "件"})
                  </span>
                </div>
              )}

              {community.ratingSummary.count > 0 && (
                <a
                  href="#community"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80 hover:border-gold-300/45 hover:text-gold-300"
                >
                  <Star size={14} className="fill-vermilion-500 text-vermilion-500" />
                  <span className="font-bold text-white">{community.ratingSummary.average.toFixed(1)}</span>
                  <span>
                    {isZh
                      ? `站内 ${community.ratingSummary.count} 人评分`
                      : `ユーザー評価 (${community.ratingSummary.count})`}
                  </span>
                </a>
              )}
            </div>
          </div>

          {/* AI 服务亮点摘要 */}
          {summary && (
            <div className="ai-summary-card">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-gold-300">
                <Sparkles size={13} />
                <span>{isZh ? "服务亮点与中文体验" : "サービスの特徴・中国語対応"}</span>
              </div>
              <p className="text-sm leading-relaxed text-[#e5dfd5]">{summary}</p>
            </div>
          )}

          {/* 特色标签 */}
          {tags.length > 0 && (
            <div>
              <h2 className="mb-2.5 text-xs font-semibold tracking-wider text-white/50 uppercase">
                {isZh ? "服务标签" : "特徴タグ"}
              </h2>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/85"
                  >
                    # {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右栏：实用信息卡片 */}
        <aside className="rounded-2xl border border-white/12 bg-[#111016] p-5 shadow-xl lg:self-start">
          <h2 className="mb-4 font-serif text-base font-bold text-white">
            {isZh ? "门店信息" : "店舗・施設情報"}
          </h2>

          {!isPermClosed && <OpeningHours raw={place.opening_hours} locale={locale} />}

          <div className="space-y-3 text-sm text-white/75">
            {stationLabel && (
              <div className="flex items-start gap-2.5">
                <TrainFront size={16} className="mt-0.5 shrink-0 text-gold-300" />
                <span>{stationLabel}</span>
              </div>
            )}

            <div className="flex items-start gap-2.5">
              <MapPin size={16} className="mt-0.5 shrink-0 text-vermilion-500" />
              <span className="leading-snug">{place.address}</span>
            </div>

            {place.phone && (
              <div className="flex items-center gap-2.5">
                <Phone size={15} className="shrink-0 text-white/50" />
                <a href={`tel:${place.phone}`} className="hover:text-gold-300 hover:underline">
                  {place.phone}
                </a>
              </div>
            )}

            {place.website && (
              <div className="flex items-center gap-2.5">
                <Globe size={15} className="shrink-0 text-white/50" />
                <a
                  href={place.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 truncate text-gold-300 hover:underline"
                >
                  <span className="truncate">{place.website.replace(/^https?:\/\//, "")}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full justify-center"
            >
              <Navigation size={15} />
              <span>{isZh ? "在 Google 地图中导航" : "Google マップで経路を見る"}</span>
            </a>
          </div>
        </aside>
      </div>

      {/* 用户打分、留言与楼中楼讨论区（免审核 + 自动垃圾过滤） */}
      <RestaurantCommunity
        restaurantId={place.id}
        apiBasePath={`/api/life/${encodeURIComponent(place.id)}`}
        subjectType="life"
        locale={locale}
        isLoggedIn={Boolean(currentUser)}
        initialRating={community.ratingSummary}
        initialComments={community.comments}
        initialTotalComments={community.totalComments}
      />

      {/* 同分类推荐 */}
      {relatedPlaces.length > 0 && (
        <section className="border-t border-white/10 pt-10">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-white">
              {isZh ? `更多${catMeta.zh}推荐` : `その他の${catMeta.ja}`}
            </h2>
            <Link
              href={`/${locale}/life?category=${category}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gold-300 hover:underline"
            >
              {isZh ? "查看全部" : "すべて見る"}
              <ChevronRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedPlaces.map((item) => {
              const itemPhotos = parsePhotoReferences(item.photos);
              const itemName = getLifePlaceName(item, locale);
              const itemStation = getLifeStationLabel(item, locale);
              return (
                <Link
                  key={item.id}
                  href={`/${locale}/life/${item.id}`}
                  className="restaurant-card group flex flex-col overflow-hidden"
                >
                  <div className="relative h-32 w-full overflow-hidden bg-[#181620]">
                    {itemPhotos.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoSrc(itemPhotos[0], 600)}
                        alt={itemName}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/25">
                        <CatIcon size={24} style={{ color: catMeta.accent, opacity: 0.6 }} />
                      </div>
                    )}
                    {Number(item.rating || 0) > 0 && (
                      <span className="absolute right-2 bottom-2 inline-flex items-center gap-0.5 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-bold text-gold-300">
                        <Star size={10} className="fill-gold-300 text-gold-300" />
                        {Number(item.rating).toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="truncate text-sm font-bold text-white group-hover:text-gold-300">
                      {itemName}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-white/50">
                      {itemStation || item.ward || ""}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
