import {
  getRating,
  normalizeAuthenticity,
  normalizePriceLevel,
  parsePhotoReferences,
  type PriceLevel,
  type RestaurantRow,
} from "@/lib/restaurant-types";

export type DiscoverySort = "recommended" | "rating" | "reviews" | "newest" | "trusted";
export type DiscoveryScene = "solo" | "group" | "late-night" | "budget";
export type BusinessFilter = "lunch" | "dinner" | "late";

export function getPrimaryPhotoUrl(restaurant: RestaurantRow, maxWidth = 900): string {
  const fallback =
    "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=1200&auto=format&fit=crop";
  const photos = parsePhotoReferences(restaurant.photos);
  const first = photos[0];
  if (!first) return fallback;
  if (first.startsWith("http")) return first;
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${first}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
}

export function getAreaLabel(restaurant: RestaurantRow): string {
  return restaurant.ward || restaurant.city || "";
}

export function getPriceLevelSymbols(priceLevel: number | null | undefined): string {
  const normalized = normalizePriceLevel(priceLevel);
  if (!normalized) return "¥?";
  return "¥".repeat(normalized);
}

export function getPriceLevelText(priceLevel: PriceLevel | null, locale: string): string {
  if (!priceLevel) return locale === "zh" ? "价格待补充" : "価格帯は追記予定";
  return locale === "zh"
    ? `${getPriceLevelSymbols(priceLevel)} / 人均`
    : `${getPriceLevelSymbols(priceLevel)} / 1人`;
}

export function formatSyncLabel(value: string | null | undefined, locale: string): string {
  if (!value) return locale === "zh" ? "同步时间待补充" : "同期時刻は追記予定";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return locale === "zh" ? "同步时间待补充" : "同期時刻は追記予定";
  }

  const now = new Date();
  const diffDays = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
  if (locale === "zh") {
    if (diffDays === 0) return "最近同步: 今天";
    if (diffDays === 1) return "最近同步: 1 天前";
    return `最近同步: ${diffDays} 天前`;
  }
  if (diffDays === 0) return "最終同期: 今日";
  if (diffDays === 1) return "最終同期: 1日前";
  return `最終同期: ${diffDays}日前`;
}

export function formatSyncDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return locale === "zh" ? "待补充" : "追記予定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "zh" ? "待补充" : "追記予定";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function getOpeningHoursLines(openingHours: string | null | undefined): string[] {
  if (!openingHours) return [];
  return openingHours
    .split(/\n|;|；|\|/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getOpeningStatus(openingHours: string | null | undefined, locale: string): string {
  const lines = getOpeningHoursLines(openingHours);
  if (lines.length === 0) return locale === "zh" ? "营业时间待补充" : "営業時間は追記予定";

  const text = lines.join(" ");
  if (/23:|24:|00:|01:|02:|深夜/.test(text)) {
    return locale === "zh" ? "深夜可去" : "深夜利用可";
  }
  if (/17:|18:|19:|20:|晚/.test(text)) {
    return locale === "zh" ? "含晚市" : "夜営業あり";
  }
  if (/11:|12:|13:|午/.test(text)) {
    return locale === "zh" ? "含午市" : "昼営業あり";
  }
  return lines[0];
}

export function matchesBusinessFilter(
  restaurant: RestaurantRow,
  filter: BusinessFilter | "",
): boolean {
  if (!filter) return true;
  const text = (restaurant.opening_hours || "").toLowerCase();
  if (!text) return false;
  if (filter === "late") return /23:|24:|00:|01:|02:|深夜/.test(text);
  if (filter === "dinner") return /17:|18:|19:|20:|晚/.test(text);
  return /11:|12:|13:|午/.test(text);
}

export function matchesScene(restaurant: RestaurantRow, scene: DiscoveryScene | ""): boolean {
  if (!scene) return true;
  const price = normalizePriceLevel(restaurant.price_level);
  const text = `${restaurant.ai_summary_zh || ""} ${restaurant.ai_summary_ja || ""} ${restaurant.opening_hours || ""}`.toLowerCase();
  const cuisine = (restaurant.cuisine_type || "").toLowerCase();

  switch (scene) {
    case "solo":
      return price === 1 || price === 2 || /一人|一個人|solo|一人でも/.test(text);
    case "group":
      return price === 3 || /聚餐|宴会|聚會|グループ|会食/.test(text) || cuisine === "sichuan";
    case "late-night":
      return /23:|24:|00:|深夜|夜宵|夜食/.test(text);
    case "budget":
      return price === 1 || /实惠|平价|コスパ|リーズナブル/.test(text);
    default:
      return true;
  }
}

export function isTrustedPriority(restaurant: RestaurantRow): boolean {
  return (
    normalizeAuthenticity(restaurant.authenticity) === "authentic" ||
    (restaurant.authenticity_score || 0) >= 75 ||
    (restaurant.trusted_review_count || 0) >= 30
  );
}

export function sortRestaurants(restaurants: RestaurantRow[], sort: DiscoverySort): RestaurantRow[] {
  return [...restaurants].sort((a, b) => {
    if (sort === "reviews") {
      return (b.raw_review_count || 0) - (a.raw_review_count || 0) || getRating(b) - getRating(a);
    }
    if (sort === "newest") {
      return (
        getSortTimestamp(b.last_synced_at || b.updated_at) - getSortTimestamp(a.last_synced_at || a.updated_at) ||
        getRating(b) - getRating(a)
      );
    }
    if (sort === "trusted") {
      return (
        (b.authenticity_score || 0) - (a.authenticity_score || 0) ||
        (b.trusted_review_count || 0) - (a.trusted_review_count || 0) ||
        getRating(b) - getRating(a)
      );
    }
    if (sort === "recommended") {
      return (
        getRating(b) - getRating(a) ||
        (b.raw_review_count || 0) - (a.raw_review_count || 0) ||
        (b.authenticity_score || 0) - (a.authenticity_score || 0)
      );
    }
    return (
      getRating(b) - getRating(a) ||
      (b.raw_review_count || 0) - (a.raw_review_count || 0) ||
      (b.authenticity_score || 0) - (a.authenticity_score || 0)
    );
  });
}

export function getCompletenessScore(restaurant: RestaurantRow): number {
  const fields = [
    restaurant.address,
    restaurant.phone,
    restaurant.website,
    restaurant.opening_hours,
    restaurant.price_level,
    restaurant.authenticity_reason_zh || restaurant.authenticity_reason_ja,
    restaurant.google_maps_url,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

export function getTrustSummary(restaurant: RestaurantRow, locale: string): string {
  const trustedCount = restaurant.trusted_review_count || 0;
  const rawCount = restaurant.raw_review_count || 0;
  const authenticityScore = restaurant.authenticity_score || 0;
  const completeness = getCompletenessScore(restaurant);

  if (locale === "zh") {
    if (trustedCount >= 50 && authenticityScore >= 75 && completeness >= 70) {
      return "样本量足、认证较强、信息完整，适合直接加入候选。";
    }
    if (trustedCount < 15 || completeness < 45) {
      return "样本或信息仍偏少，建议结合原始评论与地图再判断。";
    }
    if (rawCount > 0 && trustedCount / rawCount < 0.5) {
      return "可信评论占比较低，建议重点查看筛后的真实评论。";
    }
    return "评分与认证信号较稳，适合和同区域餐厅横向比较。";
  }

  if (trustedCount >= 50 && authenticityScore >= 75 && completeness >= 70) {
    return "サンプル量と認定、情報量のバランスが良く、候補に入れやすい店です。";
  }
  if (trustedCount < 15 || completeness < 45) {
    return "サンプル数または情報量がまだ少なく、地図や原文レビューの併読が安全です。";
  }
  if (rawCount > 0 && trustedCount / rawCount < 0.5) {
    return "信頼レビュー比率が低めのため、抽出後レビューを先に確認すると判断しやすいです。";
  }
  return "評価と認定の信号は安定しており、同エリア比較に向いています。";
}

export function getEvidenceMetrics(restaurant: RestaurantRow) {
  const rawCount = restaurant.raw_review_count || 0;
  const trustedCount = restaurant.trusted_review_count || 0;
  const trustedRatio = rawCount > 0 ? Math.round((trustedCount / rawCount) * 100) : 0;
  const filteredCount = Math.max(0, rawCount - trustedCount);
  return {
    trustedCount,
    rawCount,
    trustedRatio,
    filteredCount,
    completeness: getCompletenessScore(restaurant),
  };
}

export function getReviewCredibilityLabel(action: string | null | undefined, locale: string): string {
  if (action === "keep") return locale === "zh" ? "真实评论" : "信頼レビュー";
  if (action === "flag") return locale === "zh" ? "存疑评论" : "要確認レビュー";
  return locale === "zh" ? "待判定" : "判定待ち";
}

function getSortTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
