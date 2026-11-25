import { getDb } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/session";
import { getFavoritedIds } from "@/lib/favorites";
import { getRestaurantCommunity } from "@/lib/community";
import { recordRestaurantView } from "@/lib/views";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Star, MapPin, Phone, Globe, ShieldCheck, ShieldAlert, MapPinned, TrainFront, AlertTriangle, MessageSquare } from "lucide-react";
import RatingExplainer from "@/components/RatingExplainer";
import RestaurantCommunity from "@/components/RestaurantCommunity";
import FavoriteButton from "@/components/FavoriteButton";
import ShareButton from "@/components/ShareButton";
import JsonLd from "@/components/JsonLd";
import OpeningHours from "@/components/OpeningHours";
import { buildBreadcrumbJsonLd, buildRestaurantJsonLd } from "@/lib/json-ld";
import {
  getRating,
  getRestaurantName,
  getRestaurantSummary,
  isPermanentlyClosed,
  isTemporarilyClosed,
  normalizeAuthenticity,
  normalizeCuisineType,
  getStationLabel,
  parsePhotoReferences,
  photoSrc,
  type RestaurantRow,
  type ReviewRow,
} from "@/lib/restaurant-types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  try {
    const db = await getDb();
    const restaurant = await db
      .prepare("SELECT * FROM restaurants WHERE id = ? AND is_active = 1")
      .bind(id)
      .first<RestaurantRow>();
    if (!restaurant) return {};

    const name = getRestaurantName(restaurant, locale);
    const closed = isPermanentlyClosed(restaurant);
    const summary = getRestaurantSummary(restaurant, locale);
    const photos = parsePhotoReferences(restaurant.photos);
    const ogImage = photos.length > 0 ? photoSrc(photos[0], 1200) : undefined;
    const isZh = locale === "zh";
    const pageTitle = closed ? `${isZh ? "【已停业】" : "【閉店】"}${name}` : name;

    return {
      title: pageTitle,
      description: summary || `${name} のガチ中華評価、Google レビュー分析、可信评分。`,
      alternates: {
        canonical: `/${locale}/restaurants/${id}`,
        languages: {
          zh: `/zh/restaurants/${id}`,
          ja: `/ja/restaurants/${id}`,
          "x-default": `/zh/restaurants/${id}`,
        },
      },
      openGraph: {
        title: pageTitle,
        description: summary || undefined,
        url: `/${locale}/restaurants/${id}`,
        type: "article",
        siteName: "ガチ中華ナビ | 真味中华",
        locale: isZh ? "zh_CN" : "ja_JP",
        alternateLocale: isZh ? "ja_JP" : "zh_CN",
        ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      },
    };
  } catch {
    return {};
  }
}

export default async function RestaurantDetailPage({ params }: Props) {
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

  // 计入首页热度榜。内部用 waitUntil 异步落库，不阻塞这次渲染
  await recordRestaurantView(restaurant.id);

  const name = getRestaurantName(restaurant, locale);
  const summary = getRestaurantSummary(restaurant, locale);
  const authenticityReason = locale === "zh" ? restaurant.authenticity_reason_zh : restaurant.authenticity_reason_ja;
  const stationLabel = getStationLabel(restaurant, locale);
  const authenticity = normalizeAuthenticity(restaurant.authenticity);
  const cuisineType = normalizeCuisineType(restaurant.cuisine_type);
  const closedPermanently = isPermanentlyClosed(restaurant);
  const closedTemporarily = isTemporarilyClosed(restaurant);
  const isZh = locale === "zh";
  
  const rawPhotos = parsePhotoReferences(restaurant.photos).slice(0, 5);
  // 经由 /api/photo 代理（R2 缓存），不再每次展示都直连 Google 计费
  const photos = rawPhotos.map((ref) => photoSrc(ref, 800));

  const currentUser = await getCurrentUser();
  const isLoggedIn = Boolean(currentUser);
  const [favoritedIds, community] = await Promise.all([
    getFavoritedIds([restaurant.id]),
    getRestaurantCommunity(restaurant.id, currentUser),
  ]);

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: locale === "zh" ? "首页" : "ホーム", url: `/${locale}` },
    { name: locale === "zh" ? "餐厅" : "レストラン", url: `/${locale}/restaurants` },
    { name, url: `/${locale}/restaurants/${restaurant.id}` },
  ]);
  const restaurantJsonLd = buildRestaurantJsonLd(restaurant, locale);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <JsonLd data={restaurantJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />

      {/* 停业 / 暂停营业醒目警示横幅 */}
      {closedPermanently && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-950/55 px-5 py-4 text-red-100 shadow-lg"
        >
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-400" />
          <div>
            <div className="font-serif text-base font-bold text-red-200">
              {isZh ? "该餐厅已停业" : "この店舗は閉店しました"}
            </div>
            <p className="mt-1 text-sm text-red-200/80">
              {isZh
                ? "本店已停止营业，以下资料与评价仅作历史留档参考，请勿前往。"
                : "この店舗はすでに閉店しています。掲載情報・口コミは過去の参考記録として残しています。"}
            </p>
          </div>
        </div>
      )}

      {closedTemporarily && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-950/45 px-5 py-4 text-amber-100"
        >
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <div className="font-serif text-base font-bold text-amber-200">
              {isZh ? "该餐厅目前暂停营业" : "この店舗は一時休業中です"}
            </div>
            <p className="mt-1 text-sm text-amber-200/80">
              {isZh
                ? "出发前建议先在 Google 地图或致电确认最新营业状态。"
                : "ご訪問前に Google マップやお電話で最新の営業状況をご確認ください。"}
            </p>
          </div>
        </div>
      )}

      {/* 头部：照片轮播占位符 */}
      <div className="relative flex gap-2 h-64 sm:h-96 mb-8 overflow-hidden rounded-2xl">
        {photos.length > 0 ? (
          <>
            <div className="flex-1 overflow-hidden bg-warm-100">
               {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos[0]}
                alt={name}
                className={`w-full h-full object-cover ${closedPermanently ? "grayscale opacity-65" : ""}`}
              />
            </div>
            {photos.length > 1 && (
              <div className="w-1/3 flex flex-col gap-2">
                {photos.slice(1, 3).map((p, i) => (
                  <div key={i} className="flex-1 overflow-hidden bg-warm-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p}
                      alt={name}
                      className={`w-full h-full object-cover ${closedPermanently ? "grayscale opacity-65" : ""}`}
                    />
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
        {closedPermanently && (
          <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-red-400/50 bg-black/80 px-4 py-1.5 font-serif text-sm font-bold tracking-wider text-red-300 backdrop-blur-md">
            {isZh ? "已停业" : "閉店"}
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-12">
        {/* 左侧：主要信息 */}
        <div className="flex-1">
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              {closedPermanently && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-500/50 bg-red-950/80 px-3 py-1 font-serif text-xs font-bold tracking-wider text-red-200">
                  {isZh ? "已停业" : "閉店"}
                </span>
              )}
              {closedTemporarily && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-950/70 px-3 py-1 font-serif text-xs font-bold tracking-wider text-amber-200">
                  {isZh ? "暂停营业" : "休業中"}
                </span>
              )}
              <span className={`badge-${authenticity}`}>
                {ta(authenticity)}
              </span>
              <span className={`cuisine-tag cuisine-${cuisineType}`}>
                {tc(cuisineType)}
              </span>
            </div>
            <h1 className={`font-serif font-black text-4xl leading-tight mb-4 ${closedPermanently ? "text-ink-400 line-through decoration-red-400/60" : "text-ink-900"}`}>
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

          <RatingExplainer
            locale={locale}
            rawRating={restaurant.raw_rating || 0}
            rawReviewCount={restaurant.raw_review_count || 0}
            trustedRating={getRating(restaurant)}
            authenticityScore={restaurant.authenticity_score || 0}
          />

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

          {/* 食客打分、留言与楼中楼讨论区（免审核即时发布 + 自动垃圾过滤） */}
          <RestaurantCommunity
            restaurantId={restaurant.id}
            locale={locale}
            isLoggedIn={isLoggedIn}
            initialRating={community.ratingSummary}
            initialComments={community.comments}
            initialTotalComments={community.totalComments}
          />

          <div className="divider-chinese" />

          {/* Google 真实评论列表 */}
          <section>
            <h2 className="font-serif font-bold text-2xl mb-6 text-ink-900">
              {isZh ? "Google 精选评论" : "Google 厳選レビュー"}
            </h2>
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
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-lg text-ink-900">{locale === "zh" ? "餐厅信息" : "店舗情報"}</h3>
              <div className="flex items-center gap-2">
              <ShareButton
                title={name}
                text={summary || undefined}
                locale={locale}
              />
              <FavoriteButton
                restaurantId={restaurant.id}
                initialFavorited={favoritedIds.has(restaurant.id)}
                isLoggedIn={isLoggedIn}
                locale={locale}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-warm-200 transition-colors hover:border-vermilion-700"
              />
              </div>
            </div>
            {closedPermanently ? (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/35 bg-red-950/50 px-3 py-2.5 text-sm font-semibold text-red-200">
                <AlertTriangle size={16} className="shrink-0 text-red-400" />
                <span>{isZh ? "已停业（仅供参考）" : "閉店しました（参考情報）"}</span>
              </div>
            ) : (
              <OpeningHours raw={restaurant.opening_hours} locale={locale} />
            )}
            {stationLabel && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-warm-50 px-3 py-2 text-sm text-ink-700">
                <TrainFront size={16} className="mt-0.5 shrink-0 text-vermilion-700" />
                <span className="font-semibold">{stationLabel}</span>
              </div>
            )}
            <a
              href={restaurant.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${restaurant.lat},${restaurant.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-vermilion-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-vermilion-900"
            >
              <MapPinned size={16} />
              {locale === "zh" ? "在 Google 地图中打开" : "Google マップで開く"}
            </a>

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

      {/* 移动端美团风吸底操作栏：收藏 / 写评价 / 一键导航 */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/12 bg-[#0b0a10]/95 px-4 py-2.5 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FavoriteButton
              restaurantId={restaurant.id}
              initialFavorited={favoritedIds.has(restaurant.id)}
              isLoggedIn={isLoggedIn}
              locale={locale}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.05]"
            />
            <a
              href="#community"
              className="inline-flex h-10 items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-3 text-xs font-semibold text-white/85"
            >
              <MessageSquare size={14} className="text-[#f2cb72]" />
              <span>{isZh ? "评一评" : "評価"}</span>
            </a>
          </div>
          <a
            href={restaurant.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${restaurant.lat},${restaurant.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex h-10.5 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-bold"
          >
            <MapPinned size={16} />
            <span>{isZh ? "去这里 · 地图导航" : "ここへ行く · ナビ"}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
