import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/session";
import { getLifeRatingSummary } from "@/lib/life-community";

type RouteCtx = { params: Promise<{ id: string }> };

/** 生活专区门店打分（1-5 星，支持随时更新） */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录后再打分" }, { status: 401 });
  }

  const { id: placeId } = await ctx.params;
  if (!placeId) {
    return NextResponse.json({ error: "Missing place id" }, { status: 400 });
  }

  let body: { rating?: unknown };
  try {
    body = (await req.json()) as { rating?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "评分需为 1 到 5 的整数" }, { status: 400 });
  }

  const db = await getDb();
  const exists = await db
    .prepare(`SELECT id FROM life_places WHERE id = ? AND is_active = 1`)
    .bind(placeId)
    .first<{ id: string }>();

  if (!exists) {
    return NextResponse.json({ error: "未找到该门店" }, { status: 404 });
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO life_place_ratings (id, place_id, user_id, rating, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(place_id, user_id) DO UPDATE SET
         rating = excluded.rating,
         updated_at = excluded.updated_at`
    )
    .bind(crypto.randomUUID(), placeId, user.id, rating, now, now)
    .run();

  const ratingSummary = await getLifeRatingSummary(placeId, user.id);
  return NextResponse.json({ ok: true, ratingSummary });
}
