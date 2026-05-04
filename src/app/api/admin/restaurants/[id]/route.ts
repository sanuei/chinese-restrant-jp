import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import type { RestaurantRow } from "@/lib/restaurant-types";

interface RouteParams { params: Promise<{ id: string }> }

function authCheck(req: NextRequest): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

// GET /api/admin/restaurants/[id]
export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!authCheck(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const db = await getDb();
    const restaurant = await db.prepare("SELECT * FROM restaurants WHERE id = ?").bind(id).first<RestaurantRow>();

    if (!restaurant) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 获取评论
    const { results: reviews } = await db.prepare(
      "SELECT * FROM reviews WHERE restaurant_id = ? ORDER BY published_at DESC LIMIT 200"
    ).bind(id).all();

    return NextResponse.json({ restaurant, reviews: reviews ?? [] });
  } catch (error) {
    console.error("GET /api/admin/restaurants/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// PUT /api/admin/restaurants/[id] — 更新餐厅所有字段
export async function PUT(req: NextRequest, { params }: RouteParams) {
  if (!authCheck(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();

    // 检查存在
    const existing = await db.prepare("SELECT id FROM restaurants WHERE id = ?").bind(id).first();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const {
      name_zh, name_ja, name_original, address, city, ward,
      lat, lng, phone, website, google_maps_url,
      price_level, cuisine_type, cuisine_confidence,
      authenticity, authenticity_score,
      authenticity_reason_zh, authenticity_reason_ja,
      raw_rating, trusted_rating, raw_review_count, trusted_review_count,
      ai_summary_zh, ai_summary_ja,
      opening_hours, photos, is_active,
    } = body;

    await db.prepare(`
      UPDATE restaurants SET
        name_zh = COALESCE(?, name_zh),
        name_ja = COALESCE(?, name_ja),
        name_original = COALESCE(?, name_original),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        ward = ?,
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng),
        phone = ?,
        website = ?,
        google_maps_url = ?,
        price_level = COALESCE(?, price_level),
        cuisine_type = COALESCE(?, cuisine_type),
        cuisine_confidence = COALESCE(?, cuisine_confidence),
        authenticity = COALESCE(?, authenticity),
        authenticity_score = COALESCE(?, authenticity_score),
        authenticity_reason_zh = ?,
        authenticity_reason_ja = ?,
        raw_rating = COALESCE(?, raw_rating),
        trusted_rating = COALESCE(?, trusted_rating),
        raw_review_count = COALESCE(?, raw_review_count),
        trusted_review_count = COALESCE(?, trusted_review_count),
        ai_summary_zh = ?,
        ai_summary_ja = ?,
        opening_hours = ?,
        photos = ?,
        is_active = COALESCE(?, is_active),
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      name_zh ?? null, name_ja ?? null, name_original ?? null, address ?? null, city ?? null, ward ?? null,
      lat ?? null, lng ?? null, phone ?? null, website ?? null, google_maps_url ?? null,
      price_level ?? null, cuisine_type ?? null, cuisine_confidence ?? null,
      authenticity ?? null, authenticity_score ?? null,
      authenticity_reason_zh ?? null, authenticity_reason_ja ?? null,
      raw_rating ?? null, trusted_rating ?? null,
      raw_review_count ?? null, trusted_review_count ?? null,
      ai_summary_zh ?? null, ai_summary_ja ?? null,
      opening_hours ?? null, photos ?? null,
      is_active ?? null,
      id
    ).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/admin/restaurants/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE /api/admin/restaurants/[id] — 软删除（is_active = 0）
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!authCheck(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const db = await getDb();
    await db.prepare("UPDATE restaurants SET is_active = 0, updated_at = datetime('now') WHERE id = ?").bind(id).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/restaurants/[id] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
