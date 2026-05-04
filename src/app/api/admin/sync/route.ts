import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { getPlaceDetails } from "@/lib/google-maps";
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

export async function POST(req: NextRequest) {
  // 简单的鉴权
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
    
    // 1. 获取 Google Maps 详情
    const place = await getPlaceDetails(place_id);
    if (!place) {
      return NextResponse.json({ error: "Place not found" }, { status: 404 });
    }

    const reviews = place.reviews || [];
    let trustedRatingSum = 0;
    let trustedReviewCount = 0;
    const reviewData: ReviewData[] = [];
    const reviewTexts: string[] = [];

    // 2. 一次性分析所有评论可信度（单次 API 调用）
    const reviewsWithText = reviews.filter(r => r.text);
    let credibilityResults: ReviewCredibilityResult[];

    try {
      credibilityResults = await analyzeReviewsCredibilityBatch(
        reviewsWithText.map(r => ({ text: r.text, rating: r.rating, author_name: r.author_name })),
        place.name
      );
    } catch (e) {
      console.error("MiniMax Batch Review Analysis Error:", e);
      // Fallback: 所有评论默认 keep
      credibilityResults = reviewsWithText.map(() => ({
        credibility_score: 50, credibility_action: "keep" as const, credibility_reason: "分析失败默认保留"
      }));
    }

    for (let i = 0; i < reviewsWithText.length; i++) {
      const review = reviewsWithText[i];
      const credibility = credibilityResults[i] || { credibility_score: 50, credibility_action: "keep" as const, credibility_reason: "分析失败默认保留" };

      let weight = 1.0;
      if (credibility.credibility_action === "flag") weight = 0.3;
      if (credibility.credibility_action === "remove") weight = 0;

      if (weight > 0) {
        trustedRatingSum += (review.rating * weight);
        trustedReviewCount += weight;
      }

      reviewData.push({
        id: `${place_id}_${review.time}`,
        restaurant_id: place_id,
        author_name: review.author_name,
        author_photo_url: review.profile_photo_url,
        rating: review.rating,
        text: review.text,
        published_at: new Date(review.time * 1000).toISOString(),
        credibility_score: credibility.credibility_score,
        credibility_action: credibility.credibility_action,
        credibility_reason: credibility.credibility_reason,
      });

      reviewTexts.push(review.text);
    }

    // 至少需要 0.5 的有效权重才使用加权平均，否则 fallback 到 Google 原始评分
    const MIN_TRUSTED_WEIGHT = 0.5;
    // 当有效权重低于阈值，或者有任何评论被标记为 remove（权重=0）时，fallback 到 Google 原始评分
    const hasRemovedReview = reviewData.some(r => r.credibility_action === 'remove');
    const finalTrustedRating = (!hasRemovedReview && trustedReviewCount >= MIN_TRUSTED_WEIGHT)
      ? (trustedRatingSum / trustedReviewCount)
      : (place.rating || 0);

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

    // 5. 存入 D1 数据库
    // 5.1 存储餐厅
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
      place.rating || 0, finalTrustedRating, place.user_ratings_total || 0, Math.round(trustedReviewCount),
      summary.zh, summary.ja,
      JSON.stringify(place.photos?.map(p => p.photo_reference) || [])
    ).run();

    // 5.2 存储评论 (简化版：先删除旧评论再插入，以避免重复)
    await db.prepare(`DELETE FROM reviews WHERE restaurant_id = ? AND source = 'google'`).bind(place_id).run();
    
    if (reviewData.length > 0) {
      // 批量插入
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
