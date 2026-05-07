import { getDb } from "@/lib/cloudflare";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Clock3,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trophy,
} from "lucide-react";
import RatingExplainer from "@/components/RatingExplainer";
import {
  formatSyncDateTime,
  getAreaLabel,
  getEvidenceMetrics,
  getOpeningHoursLines,
  getOpeningStatus,
  getPriceLevelSymbols,
  getPrimaryPhotoUrl,
  getReviewCredibilityLabel,
  getTrustSummary,
  sortRestaurants,
} from "@/lib/restaurant-discovery";
import {
  getRating,
  getRestaurantName,
  getRestaurantSummary,
  normalizeAuthenticity,
  normalizeCuisineType,
  normalizePriceLevel,
  parsePhotoReferences,
  type RestaurantRow,
  type ReviewRow,
} from "@/lib/restaurant-types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; id: string }> };

type RankRow = { rank: number };

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
    const summary = getRestaurantSummary(restaurant, locale);
    return {
      title: name,
      description: summary || `${name} 的可信评分、评论证据与营业信息`,
      alternates: {
        canonical: `/${locale}/restaurants/${id}`,
      },
      openGraph: {
        title: name,
        description: summary || undefined,
        url: `/${locale}/restaurants/${id}`,
        type: "article",
      },
    };
  } catch {
    return {};
  }
}

export default async function RestaurantDetailPage({ params }: Props) {
  const { locale, id } = await params;
  const db = await getDb();
  const tc = await getTranslations({ locale, namespace: "cuisine" });

  const [restaurantResult, reviewsResult] = await Promise.all([
    db.prepare(`SELECT * FROM restaurants WHERE id = ? AND is_active = 1`).bind(id).first<RestaurantRow>(),
    db
      .prepare(
        `SELECT * FROM reviews
         WHERE restaurant_id = ? AND credibility_action != 'remove'
         ORDER BY credibility_score DESC, published_at DESC
         LIMIT 20`
      )
      .bind(id)
      .all<ReviewRow>(),
  ]);

  const restaurant = restaurantResult;
  if (!restaurant) notFound();

  const [relatedResult, wardRankResult, cuisineRankResult] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM restaurants
         WHERE is_active = 1
           AND id != ?
           AND (cuisine_type = ? OR ward = ? OR city = ?)
         LIMIT 36`
      )
      .bind(id, restaurant.cuisine_type, restaurant.ward, restaurant.city)
      .all<RestaurantRow>(),
    restaurant.ward && restaurant.cuisine_type
      ? db
          .prepare(
            `SELECT rank FROM (
              SELECT id, ROW_NUMBER() OVER (
                ORDER BY COALESCE(trusted_rating, raw_rating, 0) DESC, raw_review_count DESC
              ) AS rank
              FROM restaurants
              WHERE is_active = 1 AND ward = ? AND cuisine_type = ?
            ) ranked
            WHERE id = ?`
          )
          .bind(restaurant.ward, restaurant.cuisine_type, restaurant.id)
          .first<RankRow>()
      : Promise.resolve(null),
    restaurant.cuisine_type
      ? db
          .prepare(
            `SELECT rank FROM (
              SELECT id, ROW_NUMBER() OVER (
                ORDER BY COALESCE(trusted_rating, raw_rating, 0) DESC, raw_review_count DESC
              ) AS rank
              FROM restaurants
              WHERE is_active = 1 AND cuisine_type = ?
            ) ranked
            WHERE id = ?`
          )
          .bind(restaurant.cuisine_type, restaurant.id)
          .first<RankRow>()
      : Promise.resolve(null),
  ]);

  const reviews = reviewsResult.results ?? [];
  const related = sortRestaurants(relatedResult.results ?? [], "recommended").slice(0, 3);
  const name = getRestaurantName(restaurant, locale);
  const summary = getRestaurantSummary(restaurant, locale);
  const authenticityReason =
    locale === "zh" ? restaurant.authenticity_reason_zh : restaurant.authenticity_reason_ja;
  const authenticity = normalizeAuthenticity(restaurant.authenticity);
  const cuisineType = normalizeCuisineType(restaurant.cuisine_type);
  const priceLevel = normalizePriceLevel(restaurant.price_level);
  const areaLabel = getAreaLabel(restaurant);
  const openingHours = getOpeningHoursLines(restaurant.opening_hours);
  const photos = parsePhotoReferences(restaurant.photos).slice(0, 5);
  const evidence = getEvidenceMetrics(restaurant);
  const suspiciousCount = reviews.filter((review) => review.credibility_action === "flag").length;
  const reviewCoverage =
    evidence.rawCount > 0
      ? `${evidence.trustedRatio}%`
      : locale === "zh"
        ? "待补充"
        : "追記予定";

  const copy = locale === "zh"
    ? {
        breadcrumb: "东京中餐馆",
        trustPanel: "为什么值得信",
        trustSummary: getTrustSummary(restaurant, locale),
        recommendTitle: "推荐理由",
        infoTitle: "结构化信息",
        hours: "营业时间",
        address: "地址",
        price: "价格带",
        summary: "AI 摘要",
        reviews: "真实评论",
        related: "相似餐厅",
        authenticity: "认证说明",
        map: "地图导航",
        website: "访问官网",
        call: "电话咨询",
        fallback: "待补充",
        rankWard: wardRankResult?.rank
          ? `${restaurant.ward} ${cuisineType ? "·" : ""} ${wardRankResult.rank} 位`
          : "区域榜单待补充",
        rankCuisine: cuisineRankResult?.rank
          ? `${cuisineRankResult.rank} 位高分榜`
          : "菜系榜单待补充",
        evidenceFields: [
          { label: "样本量足够", value: `${evidence.trustedCount.toLocaleString()} / ${evidence.rawCount.toLocaleString()} 条评论` },
          { label: "真实性验证", value: evidence.filteredCount > 0 ? `已降权 ${evidence.filteredCount} 条可疑评论` : "未发现明显异常评论" },
          { label: "评论可信度", value: `可信评论覆盖 ${reviewCoverage}` },
          { label: "数据新鲜度", value: formatSyncDateTime(restaurant.last_synced_at || restaurant.updated_at, locale) },
          { label: "数据完整度", value: `${evidence.completeness}%` },
          { label: "风险提示", value: suspiciousCount > 0 ? `有 ${suspiciousCount} 条存疑评论待进一步核对` : "当前未见高风险信号" },
        ],
      }
    : {
        breadcrumb: "東京中華料理店",
        trustPanel: "なぜ信頼できるか",
        trustSummary: getTrustSummary(restaurant, locale),
        recommendTitle: "おすすめ理由",
        infoTitle: "構造化情報",
        hours: "営業時間",
        address: "住所",
        price: "価格帯",
        summary: "AI要約",
        reviews: "レビュー",
        related: "似ている店",
        authenticity: "認定説明",
        map: "地図を見る",
        website: "公式サイト",
        call: "電話する",
        fallback: "追記予定",
        rankWard: wardRankResult?.rank
          ? `${restaurant.ward} ${wardRankResult.rank}位`
          : "エリア順位は追記予定",
        rankCuisine: cuisineRankResult?.rank
          ? `料理別ランキング ${cuisineRankResult.rank}位`
          : "料理別順位は追記予定",
        evidenceFields: [
          { label: "サンプル量", value: `${evidence.trustedCount.toLocaleString()} / ${evidence.rawCount.toLocaleString()}件` },
          { label: "真正性検証", value: evidence.filteredCount > 0 ? `${evidence.filteredCount}件を要注意として減衰` : "大きな異常レビューは未検出" },
          { label: "レビュー信頼度", value: `信頼レビュー比率 ${reviewCoverage}` },
          { label: "同期の新しさ", value: formatSyncDateTime(restaurant.last_synced_at || restaurant.updated_at, locale) },
          { label: "情報充実度", value: `${evidence.completeness}%` },
          { label: "注意点", value: suspiciousCount > 0 ? `${suspiciousCount}件の要確認レビューあり` : "現在は強い注意信号なし" },
        ],
      };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-5 text-sm text-ink-400">
        <Link href={`/${locale}/restaurants`} className="hover:text-vermilion-700">
          {copy.breadcrumb}
        </Link>
        <span className="mx-2">/</span>
        <span>{name}</span>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.95fr]">
        <div className="rounded-[28px] border border-warm-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_156px]">
            <div className="overflow-hidden rounded-[24px] bg-warm-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPrimaryPhotoUrl(restaurant, 1200)}
                alt={name}
                className="h-full min-h-[360px] w-full object-cover"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
              {(photos.length > 0 ? photos : [getPrimaryPhotoUrl(restaurant, 320)]).slice(0, 4).map((photo, index) => (
                <div key={`${photo}-${index}`} className="overflow-hidden rounded-[18px] bg-warm-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.startsWith("http") ? photo : getPrimaryPhotoUrl(restaurant, 320)}
                    alt={name}
                    className="h-full min-h-24 w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-warm-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge-${authenticity}`}>
              {authenticity === "authentic" ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
              {locale === "zh"
                ? authenticity === "authentic"
                  ? "可信认证"
                  : authenticity === "adapted"
                    ? "风味有改良"
                    : "待进一步确认"
                : authenticity === "authentic"
                  ? "信頼認定"
                  : authenticity === "adapted"
                    ? "アレンジあり"
                    : "追加確認待ち"}
            </span>
            <span className={`cuisine-tag cuisine-${cuisineType}`}>{tc(cuisineType)}</span>
            <span className="rounded-full bg-warm-50 px-3 py-1.5 text-sm text-ink-700">{areaLabel || copy.fallback}</span>
            <span className="rounded-full bg-warm-50 px-3 py-1.5 text-sm text-ink-700">{priceLevel ? getPriceLevelSymbols(priceLevel) : copy.fallback}</span>
          </div>

          <h1 className="mt-4 font-serif text-5xl font-black leading-tight text-ink-900">{name}</h1>
          <div className="mt-2 text-base text-ink-400">
            {locale === "zh" ? restaurant.name_ja || restaurant.name_original : restaurant.name_zh || restaurant.name_original}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MetricCard title={locale === "zh" ? "可信评分" : "信頼スコア"} value={getRating(restaurant).toFixed(1)} tone="trust" />
            <MetricCard
              title={locale === "zh" ? "Google 原始评分" : "Google 評価"}
              value={(restaurant.raw_rating || 0).toFixed(1)}
              subtitle={`${(restaurant.raw_review_count || 0).toLocaleString()} ${locale === "zh" ? "条评论" : "件のレビュー"}`}
            />
            <MetricCard
              title={locale === "zh" ? "榜单名次" : "ランキング"}
              value={wardRankResult?.rank ? `#${wardRankResult.rank}` : "--"}
              subtitle={copy.rankCuisine}
              tone="rank"
            />
          </div>

          <div className="mt-6 grid gap-3 text-sm text-ink-700 md:grid-cols-2">
            <InfoPill icon={Clock3} label={locale === "zh" ? "最近同步" : "最終同期"} value={formatSyncDateTime(restaurant.last_synced_at || restaurant.updated_at, locale)} />
            <InfoPill icon={MapPin} label={locale === "zh" ? "地址 / 最近区域" : "住所 / エリア"} value={restaurant.address || areaLabel || copy.fallback} />
            <InfoPill icon={ShieldCheck} label={locale === "zh" ? "评论可信度" : "レビュー信頼度"} value={`${evidence.trustedCount.toLocaleString()} / ${evidence.rawCount.toLocaleString()} · ${reviewCoverage}`} />
            <InfoPill icon={Trophy} label={locale === "zh" ? "区域榜单" : "エリア順位"} value={copy.rankWard} />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <ActionLink href={restaurant.google_maps_url || `/${locale}/map?restaurant=${restaurant.id}`} primary>
              {copy.map}
            </ActionLink>
            <ActionLink href={restaurant.website || "#"} disabled={!restaurant.website}>
              {copy.website}
            </ActionLink>
            <ActionLink href={restaurant.phone ? `tel:${restaurant.phone}` : "#"} disabled={!restaurant.phone}>
              {copy.call}
            </ActionLink>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-[#2F6B5F]/18 bg-[linear-gradient(180deg,#ffffff,#edf5f2)] p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#2F6B5F]">
            <ShieldCheck size={16} />
            {copy.trustPanel}
          </div>
          <h2 className="mt-3 font-serif text-3xl font-bold text-ink-900">{copy.trustSummary}</h2>
          <p className="mt-3 text-sm leading-7 text-ink-700">
            {authenticityReason || getTrustSummary(restaurant, locale)}
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {copy.evidenceFields.map((field) => (
              <div key={field.label} className="rounded-[20px] border border-white bg-white/90 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">{field.label}</div>
                <div className="mt-2 text-sm leading-6 text-ink-900">{field.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <RatingExplainer
              locale={locale}
              rawRating={restaurant.raw_rating || 0}
              rawReviewCount={restaurant.raw_review_count || 0}
              trustedRating={getRating(restaurant)}
              authenticityScore={restaurant.authenticity_score || 0}
            />
          </div>
        </div>

        <div className="grid gap-6">
          <section className="rounded-[28px] border border-warm-200 bg-white p-6 shadow-sm">
            <h2 className="font-serif text-3xl font-bold text-ink-900">{copy.recommendTitle}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {buildReasonTags(summary, authenticityReason, locale).map((tag) => (
                <span key={tag} className="rounded-full bg-gold-300/18 px-3 py-1.5 text-sm text-ink-700">
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <InfoBox title={copy.hours} value={openingHours.length > 0 ? openingHours.join(" / ") : copy.fallback} />
              <InfoBox title={copy.address} value={restaurant.address || copy.fallback} />
              <InfoBox title={copy.price} value={priceLevel ? `${getPriceLevelSymbols(priceLevel)} · ${getOpeningStatus(restaurant.opening_hours, locale)}` : copy.fallback} />
              <InfoBox title={copy.authenticity} value={authenticityReason || copy.fallback} />
            </div>
          </section>

          <section className="rounded-[28px] border border-warm-200 bg-white p-6 shadow-sm">
            <h2 className="font-serif text-3xl font-bold text-ink-900">{copy.summary}</h2>
            <div className="ai-summary-card mt-5 text-base leading-8 text-ink-700">
              {summary || copy.fallback}
            </div>
          </section>
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[28px] border border-warm-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-serif text-3xl font-bold text-ink-900">{copy.reviews}</h2>
            <div className="text-sm text-ink-400">
              {locale === "zh" ? "优先展示可信度更高的评论" : "信頼度が高いレビューを優先表示"}
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {reviews.length > 0 ? reviews.map((review) => {
              const suspicious = review.credibility_action === "flag";
              return (
                <article key={review.id} className={`rounded-[22px] border p-4 ${suspicious ? "border-amber-200 bg-amber-50/50" : "border-warm-200 bg-white"}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    {review.author_photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={review.author_photo_url} alt="" className="h-11 w-11 rounded-full bg-warm-100 object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-warm-100 text-sm font-semibold text-ink-400">
                        {(review.author_name || "?").slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="font-semibold text-ink-900">{review.author_name || (locale === "zh" ? "匿名用户" : "匿名ユーザー")}</div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${suspicious ? "bg-amber-100 text-amber-700" : "bg-[#2F6B5F]/10 text-[#2F6B5F]"}`}>
                          {suspicious ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                          {getReviewCredibilityLabel(review.credibility_action, locale)}
                        </span>
                        <span className="text-xs text-ink-400">
                          {review.published_at ? formatSyncDateTime(review.published_at, locale) : copy.fallback}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-gold-500">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={index} size={14} className={index < review.rating ? "fill-current" : "opacity-25"} />
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-7 text-ink-700">{review.text || copy.fallback}</p>
                      {review.credibility_reason ? (
                        <div className="mt-3 text-xs leading-6 text-ink-400">
                          {locale === "zh" ? "判定依据: " : "判定メモ: "}
                          {review.credibility_reason}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            }) : (
              <div className="rounded-[20px] border border-dashed border-warm-200 bg-warm-50 px-5 py-8 text-center text-sm text-ink-400">
                {copy.fallback}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-warm-200 bg-white p-6 shadow-sm">
          <h2 className="font-serif text-3xl font-bold text-ink-900">{copy.related}</h2>
          <div className="mt-6 space-y-3">
            {related.map((item) => (
              <Link
                key={item.id}
                href={`/${locale}/restaurants/${item.id}`}
                className="grid grid-cols-[84px_1fr] gap-3 rounded-[20px] border border-warm-100 p-3 transition hover:border-vermilion-200"
              >
                <div className="overflow-hidden rounded-[16px] bg-warm-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getPrimaryPhotoUrl(item, 360)} alt={getRestaurantName(item, locale)} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-ink-900">{getRestaurantName(item, locale)}</div>
                  <div className="mt-1 text-xs text-ink-400">
                    {getAreaLabel(item) || copy.fallback} · {tc(normalizeCuisineType(item.cuisine_type))}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-sm text-ink-700">
                    <span>{locale === "zh" ? "可信" : "信頼"} {getRating(item).toFixed(1)}</span>
                    <span>Google {(item.raw_rating || 0).toFixed(1)}</span>
                  </div>
                </div>
              </Link>
            ))}
            <Link
              href={`/${locale}/restaurants?cuisine=${restaurant.cuisine_type || ""}&area=${encodeURIComponent(areaLabel)}`}
              className="inline-flex items-center gap-2 pt-2 text-sm font-semibold text-vermilion-700"
            >
              {locale === "zh" ? "查看更多相似餐厅" : "似ている店をもっと見る"}
            </Link>
          </div>
        </section>
      </section>
    </div>
  );
}

function buildReasonTags(summary: string | null, authenticityReason: string | null, locale: string) {
  const source = `${summary || ""} ${authenticityReason || ""}`;
  const keywords = locale === "zh"
    ? [
        ["锅气", "锅气足"],
        ["地道", "地道风味"],
        ["麻辣", "麻辣稳定"],
        ["点心", "点心可点"],
        ["聚餐", "适合聚餐"],
        ["服务", "服务信息"],
      ]
    : [
        ["鍋気", "鍋気あり"],
        ["本格", "本格寄り"],
        ["辛", "辛味が安定"],
        ["点心", "点心あり"],
        ["会食", "会食向き"],
        ["サービス", "サービス言及あり"],
      ];

  const tags = keywords
    .filter(([needle]) => source.includes(needle))
    .map(([, label]) => label);

  if (tags.length > 0) return tags.slice(0, 5);
  return locale === "zh"
    ? ["可信评分一眼可比", "样本量可核对", "同步时间可追溯"]
    : ["信頼スコアを比較しやすい", "サンプル量を確認できる", "同期時刻を追跡できる"];
}

function MetricCard({
  title,
  value,
  subtitle,
  tone = "default",
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "default" | "trust" | "rank";
}) {
  const toneClass =
    tone === "trust"
      ? "border-[#2F6B5F]/18 bg-[#2F6B5F]/8 text-[#2F6B5F]"
      : tone === "rank"
        ? "border-gold-300/40 bg-gold-300/12 text-vermilion-700"
        : "border-warm-200 bg-warm-50 text-ink-900";
  return (
    <div className={`rounded-[20px] border px-4 py-4 ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.16em]">{title}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-ink-400">{subtitle}</div> : null}
    </div>
  );
}

function InfoPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] bg-warm-50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
        <Icon size={14} />
        {label}
      </div>
      <div className="mt-2 text-sm leading-6 text-ink-900">{value}</div>
    </div>
  );
}

function ActionLink({
  href,
  children,
  primary = false,
  disabled = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
  disabled?: boolean;
}) {
  const className = primary
    ? "inline-flex items-center justify-center rounded-xl bg-vermilion-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-vermilion-900"
    : "inline-flex items-center justify-center rounded-xl border border-warm-200 bg-white px-5 py-3 text-sm font-semibold text-ink-700 transition hover:text-vermilion-700";

  if (disabled) {
    return <span className={`${className} cursor-not-allowed opacity-50`}>{children}</span>;
  }

  const external = href.startsWith("http") || href.startsWith("tel:");
  if (external) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function InfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-warm-100 bg-warm-50 px-4 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">{title}</div>
      <div className="mt-2 text-sm leading-7 text-ink-900">{value}</div>
    </div>
  );
}
