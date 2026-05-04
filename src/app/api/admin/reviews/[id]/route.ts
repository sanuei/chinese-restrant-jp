import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";

function authCheck(req: NextRequest): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

// PATCH /api/admin/reviews/[id] — 更新单条评论（credibility_action, credibility_score）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authCheck(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();

    const { credibility_score, credibility_action, credibility_reason, helpful_count } = body;

    await db.prepare(`
      UPDATE reviews SET
        credibility_score = COALESCE(?, credibility_score),
        credibility_action = COALESCE(?, credibility_action),
        credibility_reason = ?,
        helpful_count = COALESCE(?, helpful_count)
      WHERE id = ?
    `).bind(
      credibility_score ?? null,
      credibility_action ?? null,
      credibility_reason ?? null,
      helpful_count ?? null,
      id
    ).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/admin/reviews/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE /api/admin/reviews/[id] — 删除评论
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authCheck(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const db = await getDb();
    await db.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/reviews/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
