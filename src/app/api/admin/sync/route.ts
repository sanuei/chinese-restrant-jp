import { NextRequest, NextResponse } from "next/server";
import { syncRestaurantByPlaceId } from "@/lib/restaurant-sync";

interface SyncRequestBody {
  place_id?: string;
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

    const snapshot = await syncRestaurantByPlaceId(place_id);

    return NextResponse.json({
      success: true,
      restaurant: snapshot.place.name,
      reviews_count: snapshot.reviewData.length,
      cuisine: {
        cuisine_type: snapshot.aiAnalysis.cuisine_type,
        cuisine_confidence: snapshot.aiAnalysis.cuisine_confidence,
        authenticity: snapshot.aiAnalysis.authenticity,
        authenticity_score: snapshot.aiAnalysis.authenticity_score,
      },
      trusted_rating: snapshot.trustedRating,
    });
  } catch (error) {
    console.error("Sync Error:", error);
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
