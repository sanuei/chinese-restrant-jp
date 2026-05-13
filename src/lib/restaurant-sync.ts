import { getDb } from "@/lib/cloudflare";
import { getPlaceDetails, type GooglePlaceResult } from "@/lib/google-maps";
import { computeValueScore } from "@/lib/restaurant-metrics";
import { buildRestaurantSearchShadows } from "@/lib/restaurant-search-index";
import {
  analyzeRestaurantSnapshot,
  type RestaurantAiAnalysisResult,
  type RestaurantAiReviewResult,
} from "@/lib/minimax";

export type RestaurantReviewData = {
  id: string;
  restaurant_id: string;
  author_name: string;
  author_photo_url: string;
  rating: number;
  text: string;
  language: string;
  published_at: string;
  credibility_score: number;
  credibility_action: string;
  credibility_reason: string;
};

export type KantoRegion = {
  key: "tokyo" | "kanagawa" | "saitama" | "chiba" | "ibaraki" | "tochigi" | "gunma";
  label: string;
};

export type RestaurantSyncSnapshot = {
  place: GooglePlaceResult;
  aiAnalysis: RestaurantAiAnalysisResult;
  reviewData: RestaurantReviewData[];
  trustedRating: number;
  trustedReviewCount: number;
  region: KantoRegion | null;
  area: string | null;
};

type SaveRestaurantOptions = {
  isActive?: number | null;
};

const KANTO_PREFECTURES: Array<KantoRegion & { pattern: string }> = [
  { key: "tokyo", label: "東京都", pattern: "東京都" },
  { key: "kanagawa", label: "神奈川県", pattern: "神奈川県" },
  { key: "saitama", label: "埼玉県", pattern: "埼玉県" },
  { key: "chiba", label: "千葉県", pattern: "千葉県" },
  { key: "ibaraki", label: "茨城県", pattern: "茨城県" },
  { key: "tochigi", label: "栃木県", pattern: "栃木県" },
  { key: "gunma", label: "群馬県", pattern: "群馬県" },
];

let GLOBAL_M = 598;
let GLOBAL_C = 4.5;
let paramsLoaded = false;

async function loadGlobalParams(db: Awaited<ReturnType<typeof getDb>>) {
  if (paramsLoaded) return;
  try {
    const row = await db.prepare(`
      SELECT
        AVG(raw_rating) as C,
        (SELECT raw_review_count FROM restaurants ORDER BY raw_review_count LIMIT 1 OFFSET MAX(0, (SELECT COUNT(*) FROM restaurants) / 2 - 1)) as m
      FROM restaurants WHERE raw_rating > 0
    `).first<{ C: number; m: number }>();
    if (row) {
      GLOBAL_C = Math.round((row.C || 4.5) * 10000) / 10000;
      GLOBAL_M = Math.round(row.m || 598);
    }
  } catch (e) {
    console.warn("[Rating] Could not load global params, using defaults:", e);
  }
  paramsLoaded = true;
}

function computeTrustedRating(
  rawRating: number,
  rawReviewCount: number,
  authScore: number,
  avgHelpfulVotes: number
): number {
  const R = rawRating || 0;
  const v = rawReviewCount || 0;
  const WR = (v / (v + GLOBAL_M)) * R + (GLOBAL_M / (v + GLOBAL_M)) * GLOBAL_C;
  const authBonus = Math.max(0, ((authScore || 0) - 60) / 100 * 0.3);
  const qualityPenalty = avgHelpfulVotes >= 0 && avgHelpfulVotes < 3 ? -0.2 : 0;
  const final = WR + authBonus + qualityPenalty;
  return Math.round(Math.min(5, Math.max(1, final)) * 10000) / 10000;
}

const CUISINE_TYPES = new Set(["sichuan", "cantonese", "northern", "fujian", "hunan", "jiangsu", "northwest", "yunnan", "other"]);
const AUTHENTICITY_TYPES = new Set(["authentic", "adapted", "japanese", "unknown"]);
const CREDIBILITY_ACTIONS = new Set(["keep", "flag", "remove"]);

function clampScore(value: unknown, fallback = 50): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeAiAnalysis(value: RestaurantAiAnalysisResult | null | undefined): RestaurantAiAnalysisResult {
  const cuisine = value?.cuisine_type || "other";
  const authenticity = value?.authenticity || "unknown";
  const reviews = Array.isArray(value?.reviews) ? value.reviews : [];

  return {
    cuisine_type: CUISINE_TYPES.has(cuisine) ? cuisine : "other",
    cuisine_confidence: clampScore(value?.cuisine_confidence, 0),
    authenticity: AUTHENTICITY_TYPES.has(authenticity) ? authenticity : "unknown",
    authenticity_score: clampScore(value?.authenticity_score, 0),
    authenticity_reason_zh: value?.authenticity_reason_zh || "分析失败",
    authenticity_reason_ja: value?.authenticity_reason_ja || "分析エラー",
    ai_summary_zh: value?.ai_summary_zh || "暂无摘要",
    ai_summary_ja: value?.ai_summary_ja || "概要なし",
    reviews: reviews.map((review, index) => ({
      index: Number.isInteger(review.index) ? review.index : index,
      credibility_score: clampScore(review.credibility_score, 50),
      credibility_action: CREDIBILITY_ACTIONS.has(review.credibility_action) ? review.credibility_action : "keep",
      credibility_reason: review.credibility_reason || "AI未给出理由",
    })),
  };
}

function getReviewAnalysis(results: RestaurantAiReviewResult[], index: number): RestaurantAiReviewResult {
  return results.find((item) => item.index === index) || {
    index,
    credibility_score: 50,
    credibility_action: "keep",
    credibility_reason: "AI未给出该条评论结果，默认保留",
  };
}

export function getKantoRegion(address: string): KantoRegion | null {
  const match = KANTO_PREFECTURES.find((prefecture) => address.includes(prefecture.pattern));
  return match ? { key: match.key, label: match.label } : null;
}

export function extractAreaLabel(address: string): string | null {
  const tokyoWard = address.match(/東京都([^、\s]+区)/);
  if (tokyoWard) return tokyoWard[1];

  const municipality = address.match(/(?:神奈川県|埼玉県|千葉県|茨城県|栃木県|群馬県)([^、\s]+?(?:市|区|町|村))/);
  return municipality?.[1] || null;
}

export async function buildRestaurantSyncSnapshot(placeId: string): Promise<RestaurantSyncSnapshot> {
  const db = await getDb();
  await loadGlobalParams(db);

  const place = await getPlaceDetails(placeId);
  if (!place) {
    throw new Error("Place not found");
  }

  const sourceReviews = (place.reviews || []).slice(0, 5);
  const reviewsWithText = sourceReviews.filter((review) => review.text);
  let aiAnalysis: RestaurantAiAnalysisResult;

  try {
    aiAnalysis = normalizeAiAnalysis(await analyzeRestaurantSnapshot({
      restaurantName: place.name,
      address: place.formatted_address,
      rating: place.rating || 0,
      reviewCount: place.user_ratings_total || 0,
      priceLevel: place.price_level || null,
      reviews: reviewsWithText.map((review) => ({
        text: review.text,
        rating: review.rating,
        author_name: review.author_name,
        language: review.language,
      })),
    }));
  } catch (e) {
    console.error("MiniMax Combined Analysis Error:", e);
    aiAnalysis = normalizeAiAnalysis(null);
  }

  const reviewData: RestaurantReviewData[] = reviewsWithText.map((review, index) => {
    const credibility = getReviewAnalysis(aiAnalysis.reviews, index);
    return {
      id: `${placeId}_review_${index}_${review.time}`,
      restaurant_id: placeId,
      author_name: review.author_name,
      author_photo_url: review.profile_photo_url || "",
      rating: review.rating,
      text: review.text || "",
      language: review.language || "und",
      published_at: new Date(review.time * 1000).toISOString(),
      credibility_score: credibility.credibility_score,
      credibility_action: credibility.credibility_action,
      credibility_reason: credibility.credibility_reason,
    };
  });

  const trustedReviewCount = reviewData.filter((review) => review.credibility_action !== "remove").length;
  const trustedRating = computeTrustedRating(
    place.rating || 0,
    place.user_ratings_total || 0,
    aiAnalysis.authenticity_score,
    -1
  );

  return {
    place,
    aiAnalysis,
    reviewData,
    trustedRating,
    trustedReviewCount,
    region: getKantoRegion(place.formatted_address),
    area: extractAreaLabel(place.formatted_address),
  };
}

export async function saveRestaurantSyncSnapshot(
  snapshot: RestaurantSyncSnapshot,
  options: SaveRestaurantOptions = {}
) {
  const db = await getDb();
  const { place, aiAnalysis } = snapshot;
  const isActive = options.isActive ?? null;
  const existingRestaurant = await db
    .prepare("SELECT name_zh, name_ja FROM restaurants WHERE id = ?")
    .bind(place.place_id)
    .first<{ name_zh: string | null; name_ja: string | null }>();
  const valueScore = computeValueScore(snapshot.trustedRating, place.price_level || 2, place.user_ratings_total || 0);
  const searchShadows = buildRestaurantSearchShadows({
    name_zh: existingRestaurant?.name_zh || null,
    name_ja: existingRestaurant?.name_ja || null,
    name_original: place.name,
    address: place.formatted_address,
    ward: snapshot.area,
    ai_summary_zh: aiAnalysis.ai_summary_zh,
    ai_summary_ja: aiAnalysis.ai_summary_ja,
    authenticity_reason_zh: aiAnalysis.authenticity_reason_zh,
    authenticity_reason_ja: aiAnalysis.authenticity_reason_ja,
  });

  await db.prepare(`
    INSERT INTO restaurants (
      id, name_original, address, city, ward, lat, lng, phone, website, google_maps_url, price_level,
      value_score,
      cuisine_type, cuisine_confidence, authenticity, authenticity_score,
      authenticity_reason_zh, authenticity_reason_ja,
      raw_rating, trusted_rating, raw_review_count, trusted_review_count,
      ai_summary_zh, ai_summary_ja,
      name_zh_search, name_ja_search, name_original_search, address_search, ward_search,
      ai_summary_zh_search, ai_summary_ja_search, authenticity_reason_zh_search, authenticity_reason_ja_search,
      photos, is_active, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 1), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name_original = excluded.name_original,
      address = excluded.address,
      city = excluded.city,
      ward = excluded.ward,
      lat = excluded.lat,
      lng = excluded.lng,
      phone = excluded.phone,
      website = excluded.website,
      google_maps_url = excluded.google_maps_url,
      price_level = excluded.price_level,
      value_score = excluded.value_score,
      cuisine_type = excluded.cuisine_type,
      cuisine_confidence = excluded.cuisine_confidence,
      authenticity = excluded.authenticity,
      authenticity_score = excluded.authenticity_score,
      authenticity_reason_zh = excluded.authenticity_reason_zh,
      authenticity_reason_ja = excluded.authenticity_reason_ja,
      raw_rating = excluded.raw_rating,
      trusted_rating = excluded.trusted_rating,
      raw_review_count = excluded.raw_review_count,
      trusted_review_count = excluded.trusted_review_count,
      ai_summary_zh = excluded.ai_summary_zh,
      ai_summary_ja = excluded.ai_summary_ja,
      name_zh_search = excluded.name_zh_search,
      name_ja_search = excluded.name_ja_search,
      name_original_search = excluded.name_original_search,
      address_search = excluded.address_search,
      ward_search = excluded.ward_search,
      ai_summary_zh_search = excluded.ai_summary_zh_search,
      ai_summary_ja_search = excluded.ai_summary_ja_search,
      authenticity_reason_zh_search = excluded.authenticity_reason_zh_search,
      authenticity_reason_ja_search = excluded.authenticity_reason_ja_search,
      photos = excluded.photos,
      is_active = COALESCE(?, restaurants.is_active),
      last_synced_at = excluded.last_synced_at
  `).bind(
    place.place_id,
    place.name,
    place.formatted_address,
    snapshot.region?.key || "tokyo",
    snapshot.area,
    place.geometry.location.lat,
    place.geometry.location.lng,
    place.formatted_phone_number || null,
    place.website || null,
    place.url || null,
    place.price_level || 2,
    valueScore,
    aiAnalysis.cuisine_type,
    aiAnalysis.cuisine_confidence,
    aiAnalysis.authenticity,
    aiAnalysis.authenticity_score,
    aiAnalysis.authenticity_reason_zh,
    aiAnalysis.authenticity_reason_ja,
    place.rating || 0,
    snapshot.trustedRating,
    place.user_ratings_total || 0,
    snapshot.trustedReviewCount,
    aiAnalysis.ai_summary_zh,
    aiAnalysis.ai_summary_ja,
    searchShadows.name_zh_search,
    searchShadows.name_ja_search,
    searchShadows.name_original_search,
    searchShadows.address_search,
    searchShadows.ward_search,
    searchShadows.ai_summary_zh_search,
    searchShadows.ai_summary_ja_search,
    searchShadows.authenticity_reason_zh_search,
    searchShadows.authenticity_reason_ja_search,
    JSON.stringify(place.photos?.map((photo) => photo.photo_reference) || []),
    isActive,
    isActive
  ).run();

  await db.prepare(`DELETE FROM reviews WHERE restaurant_id = ? AND source = 'google'`).bind(place.place_id).run();

  if (snapshot.reviewData.length > 0) {
    const stmt = db.prepare(`
      INSERT INTO reviews (
        id, restaurant_id, author_name, author_photo_url, rating, text, language,
        published_at, credibility_score, credibility_action, credibility_reason, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'google')
    `);

    await db.batch(snapshot.reviewData.map((review) =>
      stmt.bind(
        review.id,
        review.restaurant_id,
        review.author_name,
        review.author_photo_url,
        review.rating,
        review.text,
        review.language,
        review.published_at,
        review.credibility_score,
        review.credibility_action,
        review.credibility_reason
      )
    ));
  }
}

export async function syncRestaurantByPlaceId(placeId: string, options: SaveRestaurantOptions = {}) {
  const snapshot = await buildRestaurantSyncSnapshot(placeId);
  await saveRestaurantSyncSnapshot(snapshot, options);
  return snapshot;
}
