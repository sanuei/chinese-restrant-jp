import { NextRequest, NextResponse } from "next/server";
import { syncRestaurantByPlaceId } from "@/lib/restaurant-sync";
import { isAdminRequest } from "@/lib/admin-auth";

interface SyncRequestBody {
  place_id?: string;
  // true 时只刷新 Google 原始数据（含照片），跳过 AI 分析，不覆盖已有的菜系/正宗度/摘要
  skip_ai_analysis?: boolean;
  // true 时：仅 AI 判为 authentic / adapted 且未永久歇业的新店自动上架，其余隐藏待审
  auto_filter?: boolean;
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { place_id, skip_ai_analysis, auto_filter } = (await req.json()) as SyncRequestBody;
    if (!place_id) {
      return NextResponse.json({ error: "place_id is required" }, { status: 400 });
    }

    const snapshot = await syncRestaurantByPlaceId(place_id, {
      skipAiAnalysis: skip_ai_analysis,
      autoFilterNonChinese: auto_filter,
    });

    return NextResponse.json({
      success: true,
      place_id: snapshot.place.place_id,
      restaurant: snapshot.place.name,
      name_zh: snapshot.aiAnalysis?.name_zh || null,
      lat: snapshot.place.geometry.location.lat,
      lng: snapshot.place.geometry.location.lng,
      business_status: snapshot.place.business_status || null,
      is_active: snapshot.saveResult.insertActive,
      permanently_closed: snapshot.saveResult.permanentlyClosed,
      redirected_from: snapshot.saveResult.redirectedFromPlaceId,
      reviews_count: snapshot.reviewData.length,
      cuisine: snapshot.aiAnalysis
        ? {
            cuisine_type: snapshot.aiAnalysis.cuisine_type,
            cuisine_confidence: snapshot.aiAnalysis.cuisine_confidence,
            dish_type: snapshot.aiAnalysis.dish_type,
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
