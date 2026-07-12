import { NextRequest, NextResponse } from "next/server";
import { syncRestaurantByPlaceId } from "@/lib/restaurant-sync";

interface SyncRequestBody {
  place_id?: string;
  // true 时只刷新 Google 原始数据（含照片），跳过 AI 分析，不覆盖已有的菜系/正宗度/摘要
  skip_ai_analysis?: boolean;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { place_id, skip_ai_analysis } = (await req.json()) as SyncRequestBody;
    if (!place_id) {
      return NextResponse.json({ error: "place_id is required" }, { status: 400 });
    }

    const snapshot = await syncRestaurantByPlaceId(place_id, { skipAiAnalysis: skip_ai_analysis });

    return NextResponse.json({
      success: true,
      restaurant: snapshot.place.name,
      reviews_count: snapshot.reviewData.length,
      cuisine: snapshot.aiAnalysis
        ? {
            cuisine_type: snapshot.aiAnalysis.cuisine_type,
            cuisine_confidence: snapshot.aiAnalysis.cuisine_confidence,
            authenticity: snapshot.aiAnalysis.authenticity,
            authenticity_score: snapshot.aiAnalysis.authenticity_score,
          }
        : "skipped",
      trusted_rating: snapshot.aiAnalysis ? snapshot.trustedRating : "unchanged",
    });
  } catch (error) {
    console.error("Sync Error:", error);
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
