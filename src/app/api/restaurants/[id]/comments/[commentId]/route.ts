import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin-auth";

type RouteParams = { params: Promise<{ id: string; commentId: string }> };

// DELETE /api/restaurants/[id]/comments/[commentId] — 作者本人或管理员可删除留言
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: restaurantId, commentId } = await params;
    const db = await getDb();

    const row = await db
      .prepare(`SELECT id, user_id FROM restaurant_comments WHERE id = ? AND restaurant_id = ? AND is_deleted = 0`)
      .bind(commentId, restaurantId)
      .first<{ id: string; user_id: string }>();

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (row.user_id !== user.id && !isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 软删除该条留言（若为顶层留言，连同其下回复一并隐藏）
    await db
      .prepare(`UPDATE restaurant_comments SET is_deleted = 1 WHERE id = ? OR parent_id = ?`)
      .bind(commentId, commentId)
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE comment error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
