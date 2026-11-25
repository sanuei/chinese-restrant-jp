import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/session";

type RouteCtx = { params: Promise<{ id: string; commentId: string }> };

/** 生活专区留言点赞 / 取消点赞 */
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录后再点赞" }, { status: 401 });
  }

  const { id: placeId, commentId } = await ctx.params;
  const db = await getDb();

  const comment = await db
    .prepare(`SELECT id, likes_count FROM life_place_comments WHERE id = ? AND place_id = ? AND is_deleted = 0`)
    .bind(commentId, placeId)
    .first<{ id: string; likes_count: number }>();

  if (!comment) {
    return NextResponse.json({ error: "留言不存在" }, { status: 404 });
  }

  const existing = await db
    .prepare(`SELECT comment_id FROM life_comment_likes WHERE comment_id = ? AND user_id = ?`)
    .bind(commentId, user.id)
    .first<{ comment_id: string }>();

  if (existing) {
    await db.batch([
      db.prepare(`DELETE FROM life_comment_likes WHERE comment_id = ? AND user_id = ?`).bind(commentId, user.id),
      db
        .prepare(`UPDATE life_place_comments SET likes_count = MAX(0, likes_count - 1) WHERE id = ?`)
        .bind(commentId),
    ]);
    return NextResponse.json({ liked: false, likesCount: Math.max(0, (comment.likes_count || 0) - 1) });
  }

  await db.batch([
    db
      .prepare(`INSERT OR IGNORE INTO life_comment_likes (comment_id, user_id) VALUES (?, ?)`)
      .bind(commentId, user.id),
    db
      .prepare(`UPDATE life_place_comments SET likes_count = likes_count + 1 WHERE id = ?`)
      .bind(commentId),
  ]);
  return NextResponse.json({ liked: true, likesCount: (comment.likes_count || 0) + 1 });
}
