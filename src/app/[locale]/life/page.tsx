import type { Metadata } from "next";
import { getDb } from "@/lib/cloudflare";
import LifeExplorer, { type LifePlaceCardItem } from "@/components/LifeExplorer";
import {
  getLifePlaceName,
  getLifePlaceSummary,
  getLifeStationLabel,
  LIFE_CATEGORY_META,
  lifeCategories,
  normalizeChineseSupport,
  normalizeLifeCategory,
  parseLifeTags,
  type LifePlaceRow,
} from "@/lib/life-types";
import { parsePhotoReferences, photoSrc } from "@/lib/restaurant-types";
import { getStationAreaLabel, matchesStationArea, stationAreas } from "@/lib/station-areas";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    category?: string;
    q?: string;
    support?: string;
    station?: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === "zh";
  return {
    title: isZh ? "华人生活专区" : "生活サービス特集",
    description: isZh
      ? "东京与关东在日华人生活指南：精选华人理发店、中文医院诊所、健身房私教、中医推拿、美容美甲、KTV 棋牌与房产签证服务。"
      : "東京・関東の中国語対応ヘアサロン、クリニック、ジム、整体、美容、カラオケ、不動産・ビザ手続き窓口を厳選紹介。",
    alternates: {
      canonical: `/${locale}/life`,
      languages: { zh: "/zh/life", ja: "/ja/life", "x-default": "/zh/life" },
    },
  };
}

export default async function LifePage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const db = await getDb();

  let rows: LifePlaceRow[] = [];
  try {
    const res = await db
      .prepare(
        `SELECT *
         FROM life_places
         WHERE is_active = 1
           AND COALESCE(business_status, 'OPERATIONAL') != 'CLOSED_PERMANENTLY'
         ORDER BY COALESCE(rating, 0) DESC, COALESCE(review_count, 0) DESC`
      )
      .all<LifePlaceRow>();
    rows = res.results || [];
  } catch (error) {
    console.error("LifePage query error:", error);
  }

  const stationCountMap = new Map<string, number>();

  const places: LifePlaceCardItem[] = rows.map((r) => {
    const category = normalizeLifeCategory(r.category);
    const chineseSupport = normalizeChineseSupport(r.chinese_support);
    const name = getLifePlaceName(r, locale);
    const photos = parsePhotoReferences(r.photos);
    const tags = parseLifeTags(locale === "zh" ? r.tags_zh : r.tags_ja);
    const ward = r.ward || r.city || "";
    const stationLabel = getLifeStationLabel(r, locale);

    const stationKeys = stationAreas
      .filter((area) => {
        if (matchesStationArea(r.nearest_station, area)) return true;
        return area.matchTerms.some((term) => (r.address || "").includes(term));
      })
      .map((area) => area.key);

    for (const key of stationKeys) {
      stationCountMap.set(key, (stationCountMap.get(key) || 0) + 1);
    }

    const catMeta = LIFE_CATEGORY_META[category];
    const searchText = [
      name,
      r.name_zh,
      r.name_ja,
      r.name_original,
      r.address,
      r.nearest_station,
      r.nearest_station_zh,
      ward,
      catMeta.zh,
      catMeta.ja,
      r.summary_zh,
      r.summary_ja,
      ...tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      id: r.id,
      name,
      category,
      chineseSupport,
      ward,
      stationLabel,
      stationKeys,
      rating: Number(r.rating || 0),
      reviewCount: Number(r.review_count || 0),
      summary: getLifePlaceSummary(r, locale),
      tags,
      photo: photos.length > 0 ? photoSrc(photos[0], 600) : null,
      mapsUrl:
        r.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`,
      isTempClosed: r.business_status === "CLOSED_TEMPORARILY",
      searchText,
      createdAt: r.created_at || "",
    };
  });

  const stationOptions = stationAreas
    .map((area) => ({
      key: area.key,
      label: getStationAreaLabel(area, locale),
      count: stationCountMap.get(area.key) || 0,
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const initialCategory =
    typeof sp.category === "string" &&
    lifeCategories.includes(sp.category as (typeof lifeCategories)[number])
      ? sp.category
      : "";

  return (
    <LifeExplorer
      locale={locale}
      places={places}
      stationOptions={stationOptions}
      initialCategory={initialCategory}
      initialQuery={typeof sp.q === "string" ? sp.q.slice(0, 60) : ""}
      initialSupport={typeof sp.support === "string" ? sp.support : ""}
      initialStation={typeof sp.station === "string" ? sp.station : ""}
    />
  );
}
