import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { buildRestaurantSearchClause } from "@/lib/restaurant-search";
import type { RestaurantRow } from "@/lib/restaurant-types";

// GET /api/admin/restaurants — 列表，支持搜索/筛选/分页
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q") || "";
    const cuisine = searchParams.get("cuisine") || "";
    const authenticity = searchParams.get("authenticity") || "";
    const city = searchParams.get("city") || "";
    const sort = searchParams.get("sort") || "trusted_rating";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") || "20", 10)));
    const offset = (page - 1) * pageSize;

    const db = await getDb();
    const binds: (string | number)[] = [];
    const conditions: string[] = ["is_active = 1"];

    if (q) {
      const searchClause = buildRestaurantSearchClause(q);
      if (searchClause) {
        conditions.push(searchClause.condition);
        binds.push(...searchClause.binds);
      }
    }
    if (cuisine) {
      conditions.push(`cuisine_type = ?`);
      binds.push(cuisine);
    }
    if (authenticity) {
      conditions.push(`authenticity = ?`);
      binds.push(authenticity);
    }
    if (city) {
      conditions.push(`city = ?`);
      binds.push(city);
    }

    const whereSQL = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // 排序
    const orderMap: Record<string, string> = {
      trusted_rating: "trusted_rating DESC, raw_review_count DESC",
      raw_rating: "raw_rating DESC",
      raw_review_count: "raw_review_count DESC",
      newest: "last_synced_at DESC",
      name_zh: "name_zh ASC",
      authenticity_score: "authenticity_score DESC",
    };
    const orderSQL = orderMap[sort] || "trusted_rating DESC";

    // 总数
    const countRow = await db.prepare(`SELECT COUNT(*) as total FROM restaurants ${whereSQL}`).bind(...binds).first<{ total: number }>();
    const total = countRow?.total ?? 0;

    // 数据
    const dataSQL = `SELECT * FROM restaurants ${whereSQL} ORDER BY ${orderSQL} LIMIT ? OFFSET ?`;
    const { results } = await db.prepare(dataSQL).bind(...binds, pageSize, offset).all<RestaurantRow>();

    return NextResponse.json({
      data: results ?? [],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("GET /api/admin/restaurants error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/admin/restaurants — 手动新增（占位，暂时只支持通过 sync 同步）
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ error: "Use POST /api/admin/sync to add restaurants" }, { status: 400 });
}
