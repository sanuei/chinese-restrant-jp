import { walkMinutes } from "@/lib/restaurant-types";

/** 在日华人生活专区 8 大核心分类 */
export const lifeCategories = [
  "hair",
  "medical",
  "fitness",
  "massage",
  "beauty",
  "entertainment",
  "housing",
  "services",
] as const;

export type LifeCategory = (typeof lifeCategories)[number];

/** 中文服务友好度等级 */
export const chineseSupportLevels = ["native", "bilingual", "friendly"] as const;
export type ChineseSupportLevel = (typeof chineseSupportLevels)[number];

export interface LifePlaceRow {
  id: string;
  name_zh: string | null;
  name_ja: string | null;
  name_original: string;
  category: string;
  chinese_support: string;
  address: string;
  city: string | null;
  ward: string | null;
  lat: number;
  lng: number;
  nearest_station: string | null;
  nearest_station_zh: string | null;
  station_distance_m: number | null;
  phone: string | null;
  website: string | null;
  google_maps_url: string | null;
  price_level: number | null;
  rating: number | null;
  review_count: number | null;
  summary_zh: string | null;
  summary_ja: string | null;
  tags_zh: string | null;
  tags_ja: string | null;
  opening_hours: string | null;
  photos: string | null;
  business_status: string | null;
  is_active: number | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const LIFE_CATEGORY_META: Record<
  LifeCategory,
  {
    zh: string;
    ja: string;
    descZh: string;
    descJa: string;
    accent: string;
    badgeBg: string;
  }
> = {
  hair: {
    zh: "华人理发",
    ja: "中国語ヘアサロン",
    descZh: "懂亚洲发质与国内流行审美的华人发型师",
    descJa: "中国語対応・トレンドに強いヘアサロン",
    accent: "#f2cb72",
    badgeBg: "rgba(242, 203, 114, 0.14)",
  },
  medical: {
    zh: "中文医院・诊所",
    ja: "中国語クリニック",
    descZh: "支持中文问诊的内科、牙科、妇产、眼科及综合医院",
    descJa: "中国語で受診できる内科・歯科・各種クリニック",
    accent: "#60d394",
    badgeBg: "rgba(96, 211, 148, 0.14)",
  },
  fitness: {
    zh: "健身房・私教",
    ja: "ジム・フィットネス",
    descZh: "中文私教工作室、健身房、瑜伽普拉提与格斗馆",
    descJa: "中国語トレーナー在籍のジム・ヨガ・ピラティス",
    accent: "#ff8c5a",
    badgeBg: "rgba(255, 140, 90, 0.15)",
  },
  massage: {
    zh: "中医推拿・养生",
    ja: "整体・漢方・足つぼ",
    descZh: "中式正骨推拿、足疗拔罐、艾灸针灸调理",
    descJa: "中国式整体・足つぼ・鍼灸・漢方ケア",
    accent: "#c8a2ff",
    badgeBg: "rgba(200, 162, 255, 0.15)",
  },
  beauty: {
    zh: "美容・美甲美睫",
    ja: "美容・ネイル・エステ",
    descZh: "中式审美美甲美睫、皮肤管理与美容护理",
    descJa: "中国語対応ネイル・まつエク・フェイシャル",
    accent: "#ff99c8",
    badgeBg: "rgba(255, 153, 200, 0.15)",
  },
  entertainment: {
    zh: "KTV・棋牌桌游",
    ja: "カラオケ・娯楽",
    descZh: "中文曲库 KTV、麻将馆、剧本杀与聚会娱乐空间",
    descJa: "中国語曲豊富なカラオケ・ボードゲーム・麻雀",
    accent: "#70c1ff",
    badgeBg: "rgba(112, 193, 255, 0.15)",
  },
  housing: {
    zh: "房产・搬家物流",
    ja: "不動産・引越し",
    descZh: "华人租房买房中介、东京搬家与中日物流转运",
    descJa: "中国語対応の賃貸不動産・引越し・国際配送",
    accent: "#ffd166",
    badgeBg: "rgba(255, 209, 102, 0.14)",
  },
  services: {
    zh: "签证・行政生活",
    ja: "ビザ・行政書士",
    descZh: "签证更新永住行政书士、税务财会、驾校与通讯服务",
    descJa: "ビザ手続き・行政書士・税務・生活サポート",
    accent: "#7ce0d3",
    badgeBg: "rgba(124, 224, 211, 0.15)",
  },
};

export const CHINESE_SUPPORT_META: Record<
  ChineseSupportLevel,
  { zh: string; ja: string; cls: string }
> = {
  native: {
    zh: "华人主理",
    ja: "中華系・完全中国語",
    cls: "border-vermilion-500/45 bg-vermilion-700/25 text-[#ffb49f]",
  },
  bilingual: {
    zh: "中文常驻",
    ja: "中国語スタッフ常駐",
    cls: "border-gold-300/40 bg-gold-500/18 text-gold-300",
  },
  friendly: {
    zh: "中文友好",
    ja: "中国語対応可",
    cls: "border-sky-400/35 bg-sky-500/16 text-sky-300",
  },
};

export function normalizeLifeCategory(value: string | null | undefined): LifeCategory {
  return lifeCategories.includes(value as LifeCategory) ? (value as LifeCategory) : "services";
}

export function normalizeChineseSupport(value: string | null | undefined): ChineseSupportLevel {
  return chineseSupportLevels.includes(value as ChineseSupportLevel)
    ? (value as ChineseSupportLevel)
    : "bilingual";
}

export function getLifeCategoryLabel(category: LifeCategory, locale: string): string {
  const meta = LIFE_CATEGORY_META[category];
  return locale === "zh" ? meta.zh : meta.ja;
}

export function getChineseSupportLabel(level: ChineseSupportLevel, locale: string): string {
  const meta = CHINESE_SUPPORT_META[level];
  return locale === "zh" ? meta.zh : meta.ja;
}

export function getLifePlaceName(
  place: Pick<LifePlaceRow, "name_zh" | "name_ja" | "name_original">,
  locale: string
): string {
  return locale === "zh"
    ? place.name_zh || place.name_original
    : place.name_ja || place.name_original;
}

export function getLifePlaceSummary(
  place: Pick<LifePlaceRow, "summary_zh" | "summary_ja">,
  locale: string
): string | null {
  return locale === "zh" ? place.summary_zh : place.summary_ja;
}

export function parseLifeTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 6);
  } catch {
    return [];
  }
}

export function getLifeStationLabel(
  place: Pick<LifePlaceRow, "nearest_station" | "nearest_station_zh" | "station_distance_m">,
  locale: string
): string | null {
  const name = (locale === "zh" ? place.nearest_station_zh : null) || place.nearest_station;
  const minutes = walkMinutes(place.station_distance_m);
  if (!name || !minutes || (place.station_distance_m ?? 0) > 1800) return null;
  return locale === "zh" ? `${name}站 步行${minutes}分钟` : `${name}駅 徒歩${minutes}分`;
}
