import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { resolveGoogleMapsInput } from "@/lib/google-maps-url";
import {
  buildRestaurantSyncSnapshot,
  saveRestaurantSyncSnapshot,
  type RestaurantSyncSnapshot,
} from "@/lib/restaurant-sync";

type VerifyRequestBody = {
  url?: string;
  locale?: "zh" | "ja";
};

const CHINESE_CUISINE_KEYWORDS = [
  "中国料理", "中華料理", "中华", "中華", "四川", "川菜", "湖南", "湘菜", "麻辣", "火鍋", "火锅",
  "新疆", "蘭州", "兰州", "東北", "东北", "延辺", "延边", "雲南", "云南", "広東", "广东",
  "上海", "小籠包", "小笼包", "刀削", "米線", "米线", "酸菜魚", "酸菜鱼", "冒菜", "羊肉串",
];

async function ensureVerificationTable() {
  const db = await getDb();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS restaurant_verifications (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT,
      place_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      resolved_url TEXT,
      status TEXT NOT NULL,
      display_eligible INTEGER DEFAULT 0,
      is_kanto INTEGER DEFAULT 0,
      is_chinese INTEGER DEFAULT 0,
      region TEXT,
      verdict TEXT,
      confidence INTEGER DEFAULT 0,
      conclusion_zh TEXT,
      conclusion_ja TEXT,
      evidence_json TEXT,
      raw_ai_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_restaurant_verifications_place ON restaurant_verifications(place_id)`).run();
  return db;
}

function hasChineseCuisineKeyword(snapshot: RestaurantSyncSnapshot): boolean {
  const text = [
    snapshot.place.name,
    snapshot.place.formatted_address,
    snapshot.aiAnalysis.ai_summary_zh,
    snapshot.aiAnalysis.ai_summary_ja,
    ...snapshot.reviewData.map((review) => review.text),
  ].join("\n");
  return CHINESE_CUISINE_KEYWORDS.some((keyword) => text.includes(keyword));
}

function evaluateDisplayEligibility(snapshot: RestaurantSyncSnapshot) {
  const isKanto = Boolean(snapshot.region);
  const ai = snapshot.aiAnalysis;
  const cuisineSignal = ai.cuisine_type !== "other" && ai.cuisine_confidence >= 50;
  const authenticitySignal = ai.authenticity !== "unknown" && ai.authenticity_score >= 45;
  const keywordSignal = hasChineseCuisineKeyword(snapshot);
  const isChinese = cuisineSignal || authenticitySignal || keywordSignal;
  const displayEligible = isKanto && isChinese;

  const reasons: string[] = [];
  if (!isKanto) reasons.push("目前只接受关东地区的餐厅");
  if (!isChinese) reasons.push("AI 没有确认这是中餐厅");
  if (displayEligible) reasons.push("符合关东地区中餐厅条件，已收录并显示");

  return {
    displayEligible,
    isKanto,
    isChinese,
    reasons,
  };
}

function getVerdict(snapshot: RestaurantSyncSnapshot): string {
  if (snapshot.aiAnalysis.authenticity === "authentic") return "gachi";
  if (snapshot.aiAnalysis.authenticity === "adapted") return "adapted";
  if (snapshot.aiAnalysis.authenticity === "japanese") return "japanese";
  return "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as VerifyRequestBody;
    const sourceUrl = String(body.url || "").trim();
    if (!sourceUrl) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const resolved = await resolveGoogleMapsInput(sourceUrl);
    const snapshot = await buildRestaurantSyncSnapshot(resolved.placeId);
    const eligibility = evaluateDisplayEligibility(snapshot);
    const verdict = getVerdict(snapshot);

    if (eligibility.displayEligible) {
      await saveRestaurantSyncSnapshot(snapshot, { isActive: 1 });
    }

    const db = await ensureVerificationTable();
    const verificationId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO restaurant_verifications (
        id, restaurant_id, place_id, source_url, resolved_url, status, display_eligible,
        is_kanto, is_chinese, region, verdict, confidence, conclusion_zh, conclusion_ja,
        evidence_json, raw_ai_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      verificationId,
      eligibility.displayEligible ? snapshot.place.place_id : null,
      snapshot.place.place_id,
      sourceUrl,
      resolved.resolvedUrl,
      eligibility.displayEligible ? "accepted" : "rejected",
      eligibility.displayEligible ? 1 : 0,
      eligibility.isKanto ? 1 : 0,
      eligibility.isChinese ? 1 : 0,
      snapshot.region?.label || null,
      verdict,
      snapshot.aiAnalysis.authenticity_score,
      snapshot.aiAnalysis.authenticity_reason_zh,
      snapshot.aiAnalysis.authenticity_reason_ja,
      JSON.stringify({
        query: resolved.query,
        place: {
          name: snapshot.place.name,
          address: snapshot.place.formatted_address,
          rating: snapshot.place.rating || 0,
          reviewCount: snapshot.place.user_ratings_total || 0,
          mapsUrl: snapshot.place.url || resolved.resolvedUrl,
        },
        reviews: snapshot.reviewData.map((review) => ({
          rating: review.rating,
          text: review.text,
          language: review.language,
          credibility_action: review.credibility_action,
          credibility_score: review.credibility_score,
        })),
        reasons: eligibility.reasons,
      }),
      JSON.stringify(snapshot.aiAnalysis)
    ).run();

    return NextResponse.json({
      success: true,
      verificationId,
      accepted: eligibility.displayEligible,
      status: eligibility.displayEligible ? "accepted" : "rejected",
      reasons: eligibility.reasons,
      restaurant: {
        id: snapshot.place.place_id,
        name: snapshot.place.name,
        address: snapshot.place.formatted_address,
        region: snapshot.region?.label || null,
        area: snapshot.area,
        rating: snapshot.place.rating || 0,
        reviewCount: snapshot.place.user_ratings_total || 0,
        mapsUrl: snapshot.place.url || resolved.resolvedUrl,
      },
      verdict,
      analysis: {
        cuisine_type: snapshot.aiAnalysis.cuisine_type,
        cuisine_confidence: snapshot.aiAnalysis.cuisine_confidence,
        authenticity: snapshot.aiAnalysis.authenticity,
        authenticity_score: snapshot.aiAnalysis.authenticity_score,
        authenticity_reason_zh: snapshot.aiAnalysis.authenticity_reason_zh,
        authenticity_reason_ja: snapshot.aiAnalysis.authenticity_reason_ja,
        ai_summary_zh: snapshot.aiAnalysis.ai_summary_zh,
        ai_summary_ja: snapshot.aiAnalysis.ai_summary_ja,
      },
      reviews: snapshot.reviewData.map((review) => ({
        author_name: review.author_name,
        rating: review.rating,
        text: review.text,
        language: review.language,
        credibility_score: review.credibility_score,
        credibility_action: review.credibility_action,
      })),
    });
  } catch (error) {
    console.error("Verify Error:", error);
    const message = error instanceof Error ? error.message : "鉴定失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
