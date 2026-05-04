import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { getPlaceDetails } from "@/lib/google-maps";
import { getDataForSeoReviews } from "@/lib/dataforseo";
import {
  analyzeReviewsCredibilityBatch,
  type ReviewCredibilityResult,
  analyzeRestaurantCuisine,
  generateBilingualSummary
} from "@/lib/minimax";

interface SyncRequestBody {
  place_id?: string;
}

interface ReviewData {
  id: string;
  restaurant_id: string;
  author_name: string;
  author_photo_url: string;
  rating: number;
  text: string;
  published_at: string;
  credibility_score: number;
  credibility_action: string;
  credibility_reason: string;
}

function extractTokyoWard(address: string): string | null {
  const match = address.match(/東京都([^、\s]+区)/);
  return match?.[1] || null;
}

// ─── 评分公式参数（Bayesian Average）─────────────────────────────────────────
// m: 最小样本量（中位数），C: 全量餐厅 Google 评分均值
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

/**
 * 计算可信评分
 * trusted_rating = Bayesian_Avg + authenticity_bonus + quality_penalty
 *
 * Bayesian WR  = v/(v+m) × R + m/(v+m) × C
 * auth_bonus   = max(0, (auth_score - 60) / 100 × 0.3)
 * quality_penalty = -0.2 if avg_helpful_votes >= 0 && avg_helpful_votes < 3, else 0
 *   (Google API 不提供 per-review votes，传 -1 跳过；平台自写评论可记录 helpful_count)
 */
function computeTrustedRating(
  rawRating: number,
  rawReviewCount: number,
  authScore: number,
  avgHelpfulVotes: number
): number {
  const R = rawRating || 0;
  const v = rawReviewCount || 0;

  // 1. Bayesian Average
  const WR = (v / (v + GLOBAL_M)) * R + (GLOBAL_M / (v + GLOBAL_M)) * GLOBAL_C;

  // 2. authenticity_bonus（正宗度 60% 以下不加分）
  const authBonus = Math.max(0, ((authScore || 0) - 60) / 100 * 0.3);

  // 3. quality_penalty（篇均 helpful_votes < 3 扣分；-1 表示无数据不扣分）
  const qualityPenalty = avgHelpfulVotes >= 0 && avgHelpfulVotes < 3 ? -0.2 : 0;

  const final = WR + authBonus + qualityPenalty;
  return Math.round(Math.min(5, Math.max(1, final)) * 10000) / 10000;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { place_id } = (await req.json()) as SyncRequestBody;
    if (!place_id) {
      return NextResponse.json({ error: "place_id is required" }, { status: 400 });
    }

    const db = await getDb();
    await loadGlobalParams(db);

    // 1. 获取 Google Maps 详情（照片 + 基本信息）
    const place = await getPlaceDetails(place_id);
    if (!place) {
      return NextResponse.json({ error: "Place not found" }, { status: 404 });
    }

    // 2. 获取评论（DataForSEO，比 Google API 更全）
    let dfseoReviews: Awaited<ReturnType<typeof getDataForSeoReviews>> = [];
    try {
      dfseoReviews = await getDataForSeoReviews(place_id, 30);
    } catch (e) {
      console.warn(`DataForSEO reviews failed for ${place_id}: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 优先使用 DataForSEO 评论，fallback 到 Google 评论
    const sourceReviews = dfseoReviews.length > 0 ? dfseoReviews : [];
    const reviewData: ReviewData[] = [];
    const reviewTexts: string[] = [];

    // 3. 一次性分析所有评论可信度（单次 API 调用）
    const reviewsWithText = sourceReviews.filter(r => r.review_text);
    let credibilityResults: ReviewCredibilityResult[];

    try {
      credibilityResults = await analyzeReviewsCredibilityBatch(
        reviewsWithText.map(r => ({ text: r.review_text, rating: r.rating, author_name: r.profile_name })),
        place.name
      );
    } catch (e) {
      console.error("MiniMax Batch Review Analysis Error:", e);
      credibilityResults = reviewsWithText.map(() => ({
        credibility_score: 50, credibility_action: "keep" as const, credibility_reason: "分析失败默认保留"
      }));
    }

    for (let i = 0; i < reviewsWithText.length; i++) {
      const review = reviewsWithText[i];
      const credibility = credibilityResults[i] || { credibility_score: 50, credibility_action: "keep" as const, credibility_reason: "分析失败默认保留" };

      reviewData.push({
        id: review.review_id || `${place_id}_${i}`,
        restaurant_id: place_id,
        author_name: review.profile_name,
        author_photo_url: review.profile_image_url,
        rating: review.rating,
        text: review.review_text,
        published_at: review.timestamp,
        credibility_score: credibility.credibility_score,
        credibility_action: credibility.credibility_action,
        credibility_reason: credibility.credibility_reason,
      });

      reviewTexts.push(review.review_text);
    }

    // 3. 分析菜系与正宗度
    let cuisineAnalysis;
    try {
      cuisineAnalysis = await analyzeRestaurantCuisine(place.name, reviewTexts.slice(0, 5));
    } catch (e) {
      console.error("MiniMax Cuisine Analysis Error:", e);
      cuisineAnalysis = {
        cuisine_type: "other",
        cuisine_confidence: 0,
        authenticity: "unknown",
        authenticity_score: 0,
        authenticity_reason_zh: "分析失败",
        authenticity_reason_ja: "分析エラー",
      };
    }

    // 4. 生成双语摘要
    let summary;
    try {
      summary = await generateBilingualSummary(
        place.name,
        reviewTexts.slice(0, 5),
        place.rating || 0,
        cuisineAnalysis.authenticity
      );
    } catch (e) {
      console.error("MiniMax Summary Error:", e);
      summary = { zh: "暂无摘要", ja: "概要なし" };
    }

    const ward = extractTokyoWard(place.formatted_address);

    // 5. 用新公式计算可信评分
    // Google API 不提供 per-review helpful_count，quality_penalty 不生效（传 -1）
    const finalTrustedRating = computeTrustedRating(
      place.rating || 0,
      place.user_ratings_total || 0,
      cuisineAnalysis.authenticity_score,
      -1
    );

    // 6. 存入 D1 数据库
    await db.prepare(`
      INSERT INTO restaurants (
        id, name_original, address, city, ward, lat, lng, phone, website, google_maps_url, price_level,
        cuisine_type, cuisine_confidence, authenticity, authenticity_score,
        authenticity_reason_zh, authenticity_reason_ja,
        raw_rating, trusted_rating, raw_review_count, trusted_review_count,
        ai_summary_zh, ai_summary_ja, photos, last_synced_at
      ) VALUES (?, ?, ?, 'tokyo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
        photos = excluded.photos,
        last_synced_at = excluded.last_synced_at
    `).bind(
      place_id, place.name, place.formatted_address, ward, place.geometry.location.lat, place.geometry.location.lng,
      place.formatted_phone_number || null, place.website || null, place.url || null,
      place.price_level || 2,
      cuisineAnalysis.cuisine_type, cuisineAnalysis.cuisine_confidence,
      cuisineAnalysis.authenticity, cuisineAnalysis.authenticity_score,
      cuisineAnalysis.authenticity_reason_zh, cuisineAnalysis.authenticity_reason_ja,
      place.rating || 0, finalTrustedRating, place.user_ratings_total || 0, place.user_ratings_total || 0,
      summary.zh, summary.ja,
      JSON.stringify(place.photos?.map(p => p.photo_reference) || [])
    ).run();

    // 6.2 存储评论（先删后插，避免重复）
    await db.prepare(`DELETE FROM reviews WHERE restaurant_id = ? AND source = 'google'`).bind(place_id).run();

    if (reviewData.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO reviews (
          id, restaurant_id, author_name, author_photo_url, rating, text,
          published_at, credibility_score, credibility_action, credibility_reason, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'google')
      `);

      const batchArgs = reviewData.map(r =>
        stmt.bind(
          r.id, r.restaurant_id, r.author_name, r.author_photo_url, r.rating, r.text,
          r.published_at, r.credibility_score, r.credibility_action, r.credibility_reason
        )
      );

      await db.batch(batchArgs);
    }

    return NextResponse.json({
      success: true,
      restaurant: place.name,
      cuisine: cuisineAnalysis,
      trusted_rating: finalTrustedRating
    });

  } catch (error) {
    console.error("Sync Error:", error);
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
