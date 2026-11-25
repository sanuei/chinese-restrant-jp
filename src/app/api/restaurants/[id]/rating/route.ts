import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/session";
import { getRatingSummary } from "@/lib/community";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/restaurants/[id]/rating — 登录用户打分（1-5星，可随时更新）
export async function POST(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录后再打分" }, { status: 401 });
  }

  try {
    const { id: restaurantId } = await params;
    const body = (await req.json()) as { rating?: unknown };
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "评分必须为 1 到 5 之间的整数" }, { status: 400 });
    }

    const db = await getDb();
    const exists = await db
      .prepare(`SELECT id FROM restaurants WHERE id = ? AND is_active = 1`)
      .bind(restaurantId)
      .first<{ id: string }>();
    if (!exists) {
      return NextResponse.json({ error: "餐厅不存在" }, { status: 404 });
    }

    const rowId = `rt_${restaurantId}_${user.id}`;
    await db
      .prepare(
        `INSERT INTO restaurant_ratings (id, restaurant_id, user_id, rating, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(restaurant_id, user_id) DO UPDATE SET
           rating = excluded.rating,
           updated_at = datetime('now')`
      )
      .bind(rowId, restaurantId, user.id, rating)
      .run();

    const ratingSummary = await getRatingSummary(restaurantId, user.id);
    return NextResponse.json({ success: true, ratingSummary });
  } catch (error) {
    console.error("POST /api/restaurants/[id]/rating error:", error);
    return NextResponse.json({ error: "评分保存失败，请稍后重试" }, { status: 500 });
  }
}
