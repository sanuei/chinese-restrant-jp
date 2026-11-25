import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin-auth";

type RouteCtx = { params: Promise<{ id: string; commentId: string }> };

/** 删除生活专区留言（仅作者本人或管理员） */
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id: placeId, commentId } = await ctx.params;
  const db = await getDb();

  const row = await db
    .prepare(`SELECT id, user_id FROM life_place_comments WHERE id = ? AND place_id = ? AND is_deleted = 0`)
    .bind(commentId, placeId)
    .first<{ id: string; user_id: string }>();

  if (!row) {
    return NextResponse.json({ error: "留言不存在" }, { status: 404 });
  }

  if (row.user_id !== user.id && !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "无权删除此留言" }, { status: 403 });
  }

  await db.batch([
    db.prepare(`UPDATE life_place_comments SET is_deleted = 1 WHERE id = ?`).bind(commentId),
    db.prepare(`UPDATE life_place_comments SET is_deleted = 1 WHERE parent_id = ?`).bind(commentId),
  ]);

  return NextResponse.json({ ok: true });
}
