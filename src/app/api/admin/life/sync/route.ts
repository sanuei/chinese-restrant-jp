import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { syncLifePlaceByPlaceId } from "@/lib/life-sync";
import { lifeCategories, type LifeCategory } from "@/lib/life-types";

type SyncBody = {
  place_id?: string;
  category?: string;
  auto_filter?: boolean;
  nearest_station?: string | null;
  nearest_station_zh?: string | null;
  station_distance_m?: number | null;
};

/** 管理员同步单家生活专区门店（Google Place Details + DeepSeek AI 核验） */
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as SyncBody;
    if (!body.place_id) {
      return NextResponse.json({ error: "place_id is required" }, { status: 400 });
    }

    const hintCategory = lifeCategories.includes(body.category as LifeCategory)
      ? (body.category as LifeCategory)
      : undefined;

    const result = await syncLifePlaceByPlaceId(body.place_id, {
      hintCategory,
      autoFilterNonChinese: body.auto_filter ?? true,
      nearestStation: body.nearest_station ?? null,
      nearestStationZh: body.nearest_station_zh ?? null,
      stationDistanceM: typeof body.station_distance_m === "number" ? body.station_distance_m : null,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[life sync error]", error);
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
