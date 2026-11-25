import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/session";

type RouteParams = { params: Promise<{ id: string; commentId: string }> };

// POST /api/restaurants/[id]/comments/[commentId]/like — 切换点赞状态
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录后再点赞" }, { status: 401 });
  }

  try {
    const { id: restaurantId, commentId } = await params;
    const db = await getDb();

    const target = await db
      .prepare(`SELECT id, likes_count FROM restaurant_comments WHERE id = ? AND restaurant_id = ? AND is_deleted = 0`)
      .bind(commentId, restaurantId)
      .first<{ id: string; likes_count: number }>();

    if (!target) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const existing = await db
      .prepare(`SELECT comment_id FROM comment_likes WHERE comment_id = ? AND user_id = ?`)
      .bind(commentId, user.id)
      .first<{ comment_id: string }>();

    let liked = false;
    if (existing) {
      await db.batch([
        db.prepare(`DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?`).bind(commentId, user.id),
        db
          .prepare(`UPDATE restaurant_comments SET likes_count = MAX(0, likes_count - 1) WHERE id = ?`)
          .bind(commentId),
      ]);
      liked = false;
    } else {
      await db.batch([
        db
          .prepare(`INSERT OR IGNORE INTO comment_likes (comment_id, user_id) VALUES (?, ?)`)
          .bind(commentId, user.id),
        db
          .prepare(`UPDATE restaurant_comments SET likes_count = likes_count + 1 WHERE id = ?`)
          .bind(commentId),
      ]);
      liked = true;
    }

    const updated = await db
      .prepare(`SELECT likes_count FROM restaurant_comments WHERE id = ?`)
      .bind(commentId)
      .first<{ likes_count: number }>();

    return NextResponse.json({
      success: true,
      liked,
      likesCount: updated?.likes_count ?? 0,
    });
  } catch (error) {
    console.error("POST comment like error:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
