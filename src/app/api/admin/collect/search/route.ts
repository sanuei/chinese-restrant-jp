import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { getDb } from "@/lib/cloudflare";

type SearchBody = {
  areas?: string[];
  keywords?: string[];
  minRating?: number;
  minReviews?: number;
  requireTokyo?: boolean;
  limit?: number;
};

type GoogleTextSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
};

type Candidate = {
  placeId: string;
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
  sources: string[];
  existing?: boolean;
};

const DEFAULT_AREAS = [
  "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区", "江東区",
  "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区", "杉並区", "豊島区",
  "北区", "荒川区", "板橋区", "練馬区", "足立区", "葛飾区", "江戸川区",
];

const DEFAULT_KEYWORDS = [
  "湖南料理", "湘菜", "四川料理", "川菜", "重慶火鍋", "麻辣湯", "中国火鍋",
  "中国東北料理", "東北菜", "延辺料理", "新疆料理", "蘭州牛肉麺", "雲南料理",
  "本格中華", "ガチ中華",
];

function normalizeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const list = value.map((item) => String(item).trim()).filter(Boolean);
  return list.length > 0 ? list : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

async function searchGoogle(query: string): Promise<GoogleTextSearchResult[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_MAPS_API_KEY");

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "restaurant");
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Maps search error: ${data.status} ${data.error_message || ""}`);
  }

  return data.results || [];
}

async function markExistingCandidates(candidates: Candidate[]): Promise<Candidate[]> {
  if (candidates.length === 0) return candidates;

  try {
    const db = await getDb();
    const placeholders = candidates.map(() => "?").join(",");
    const ids = candidates.map((candidate) => candidate.placeId);
    const { results } = await db
      .prepare(`SELECT id FROM restaurants WHERE id IN (${placeholders}) AND is_active = 1`)
      .bind(...ids)
      .all<{ id: string }>();
    const existingIds = new Set((results || []).map((row) => row.id));
    return candidates.map((candidate) => ({
      ...candidate,
      existing: existingIds.has(candidate.placeId),
    }));
  } catch (error) {
    console.warn("Could not mark existing collect candidates:", error);
    return candidates;
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as SearchBody;
    const areas = normalizeList(body.areas, DEFAULT_AREAS).slice(0, 30);
    const keywords = normalizeList(body.keywords, DEFAULT_KEYWORDS).slice(0, 30);
    const minRating = clampNumber(body.minRating, 4, 0, 5);
    const minReviews = clampNumber(body.minReviews, 50, 0, 100000);
    const limit = Math.round(clampNumber(body.limit, 80, 1, 300));
    const requireTokyo = body.requireTokyo !== false;

    const candidates = new Map<string, Candidate>();
    const errors: string[] = [];
    let rawCount = 0;

    for (const area of areas) {
      for (const keyword of keywords) {
        const query = `${keyword} ${area} 東京`;
        try {
          const results = await searchGoogle(query);
          rawCount += results.length;

          for (const result of results) {
            if (!result.place_id || !result.name) continue;
            const rating = result.rating || 0;
            const reviewCount = result.user_ratings_total || 0;
            const address = result.formatted_address || "";
            if (rating < minRating) continue;
            if (reviewCount < minReviews) continue;
            if (requireTokyo && !address.includes("東京都")) continue;

            const source = `${area}/${keyword}`;
            const existing = candidates.get(result.place_id);
            if (existing) {
              if (!existing.sources.includes(source)) existing.sources.push(source);
              continue;
            }

            candidates.set(result.place_id, {
              placeId: result.place_id,
              name: result.name,
              address,
              rating,
              reviewCount,
              sources: [source],
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${query}: ${message}`);
        }
      }
    }

    const limitedData = [...candidates.values()]
      .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
      .slice(0, limit);
    const data = await markExistingCandidates(limitedData);

    return NextResponse.json({
      data,
      stats: {
        rawCount,
        candidateCount: candidates.size,
        returnedCount: data.length,
        searchedQueries: areas.length * keywords.length,
      },
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
