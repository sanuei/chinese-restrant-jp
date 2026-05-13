import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { computeValueScore } from "@/lib/restaurant-metrics";
import { buildRestaurantSearchShadows } from "@/lib/restaurant-search-index";
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
    const existing = await db.prepare("SELECT * FROM restaurants WHERE id = ?").bind(id).first<RestaurantRow>();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const {
      name_zh, name_ja, name_original, address, city, ward,
      lat, lng, phone, website, google_maps_url,
      price_level, value_score, cuisine_type, cuisine_confidence,
      authenticity, authenticity_score,
      authenticity_reason_zh, authenticity_reason_ja,
      raw_rating, trusted_rating, raw_review_count, trusted_review_count,
      ai_summary_zh, ai_summary_ja,
      opening_hours, photos, is_active,
    } = body;

    const effectiveRestaurant: RestaurantRow = {
      ...existing,
      name_zh: name_zh ?? existing.name_zh,
      name_ja: name_ja ?? existing.name_ja,
      name_original: name_original ?? existing.name_original,
      address: address ?? existing.address,
      city: city ?? existing.city,
      ward: ward ?? existing.ward,
      lat: lat ?? existing.lat,
      lng: lng ?? existing.lng,
      phone: phone ?? existing.phone,
      website: website ?? existing.website,
      google_maps_url: google_maps_url ?? existing.google_maps_url,
      price_level: price_level ?? existing.price_level,
      cuisine_type: cuisine_type ?? existing.cuisine_type,
      cuisine_confidence: cuisine_confidence ?? existing.cuisine_confidence,
      authenticity: authenticity ?? existing.authenticity,
      authenticity_score: authenticity_score ?? existing.authenticity_score,
      authenticity_reason_zh: authenticity_reason_zh ?? existing.authenticity_reason_zh,
      authenticity_reason_ja: authenticity_reason_ja ?? existing.authenticity_reason_ja,
      raw_rating: raw_rating ?? existing.raw_rating,
      trusted_rating: trusted_rating ?? existing.trusted_rating,
      raw_review_count: raw_review_count ?? existing.raw_review_count,
      trusted_review_count: trusted_review_count ?? existing.trusted_review_count,
      ai_summary_zh: ai_summary_zh ?? existing.ai_summary_zh,
      ai_summary_ja: ai_summary_ja ?? existing.ai_summary_ja,
      opening_hours: opening_hours ?? existing.opening_hours,
      photos: photos ?? existing.photos,
      is_active: is_active ?? existing.is_active,
      value_score: existing.value_score,
      name_zh_search: existing.name_zh_search,
      name_ja_search: existing.name_ja_search,
      name_original_search: existing.name_original_search,
      address_search: existing.address_search,
      ward_search: existing.ward_search,
      ai_summary_zh_search: existing.ai_summary_zh_search,
      ai_summary_ja_search: existing.ai_summary_ja_search,
      authenticity_reason_zh_search: existing.authenticity_reason_zh_search,
      authenticity_reason_ja_search: existing.authenticity_reason_ja_search,
      ai_summary_updated_at: existing.ai_summary_updated_at,
      last_synced_at: existing.last_synced_at,
      created_at: existing.created_at,
      updated_at: existing.updated_at,
      id,
    };
    const nextValueScore = value_score ?? computeValueScore(
      effectiveRestaurant.trusted_rating,
      effectiveRestaurant.price_level,
      effectiveRestaurant.raw_review_count
    );
    const searchShadows = buildRestaurantSearchShadows(effectiveRestaurant);

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
        value_score = ?,
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
        name_zh_search = ?,
        name_ja_search = ?,
        name_original_search = ?,
        address_search = ?,
        ward_search = ?,
        ai_summary_zh_search = ?,
        ai_summary_ja_search = ?,
        authenticity_reason_zh_search = ?,
        authenticity_reason_ja_search = ?,
        opening_hours = ?,
        photos = ?,
        is_active = COALESCE(?, is_active),
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      name_zh ?? null, name_ja ?? null, name_original ?? null, address ?? null, city ?? null, ward ?? null,
      lat ?? null, lng ?? null, phone ?? null, website ?? null, google_maps_url ?? null,
      price_level ?? null, nextValueScore, cuisine_type ?? null, cuisine_confidence ?? null,
      authenticity ?? null, authenticity_score ?? null,
      authenticity_reason_zh ?? null, authenticity_reason_ja ?? null,
      raw_rating ?? null, trusted_rating ?? null,
      raw_review_count ?? null, trusted_review_count ?? null,
      ai_summary_zh ?? null, ai_summary_ja ?? null,
      searchShadows.name_zh_search,
      searchShadows.name_ja_search,
      searchShadows.name_original_search,
      searchShadows.address_search,
      searchShadows.ward_search,
      searchShadows.ai_summary_zh_search,
      searchShadows.ai_summary_ja_search,
      searchShadows.authenticity_reason_zh_search,
      searchShadows.authenticity_reason_ja_search,
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
