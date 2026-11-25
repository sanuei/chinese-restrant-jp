import { NextRequest, NextResponse } from "next/server";
import { consumeQuota } from "@/lib/google-quota";
import { getDb } from "@/lib/cloudflare";
import { isAdminRequest } from "@/lib/admin-auth";

type SearchBody = {
  areas?: string[];
  keywords?: string[];
  minRating?: number;
  minReviews?: number;
  limit?: number;
};

type GoogleTextSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  business_status?: string;
  types?: string[];
  geometry?: { location?: { lat?: number; lng?: number } };
};

const KANTO_PATTERNS = ["東京都", "神奈川県", "埼玉県", "千葉県", "茨城県", "栃木県", "群馬県"];
const NON_TOKYO_HINTS = ["横浜", "川崎", "川口", "西川口", "埼玉", "千葉", "船橋", "松戸", "大宮"];

// 排除纯餐饮、食品零售、酒店等非生活服务业态（餐饮归主站管理）
const EXCLUDED_FOOD_TYPES = new Set([
  "restaurant",
  "meal_takeaway",
  "meal_delivery",
  "cafe",
  "bakery",
  "grocery_or_supermarket",
  "supermarket",
  "convenience_store",
  "liquor_store",
  "lodging",
]);
const ALLOWED_LIFE_TYPES = new Set([
  "hair_care",
  "beauty_salon",
  "spa",
  "gym",
  "doctor",
  "hospital",
  "dentist",
  "physiotherapist",
  "health",
  "pharmacy",
  "real_estate_agency",
  "moving_company",
  "lawyer",
  "accounting",
  "night_club",
  "bowling_alley",
  "amusement_center",
]);

function isExcludedFoodPlace(types?: string[]): boolean {
  if (!Array.isArray(types) || types.length === 0) return false;
  const hasFood = types.some((t) => EXCLUDED_FOOD_TYPES.has(t));
  if (!hasFood) return false;
  const hasAllowedLife = types.some((t) => ALLOWED_LIFE_TYPES.has(t));
  return !hasAllowedLife;
}

async function searchGoogleLife(query: string): Promise<GoogleTextSearchResult[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_MAPS_API_KEY");

  if (!(await consumeQuota("textsearch"))) {
    throw new Error("Google API 本月免费额度已用完，已自动停止调用以避免产生费用");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const data = (await res.json()) as {
    status?: string;
    error_message?: string;
    results?: GoogleTextSearchResult[];
  };
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Maps search error: ${data.status} ${data.error_message || ""}`);
  }
  return data.results || [];
}

/** 管理员搜索生活专区候选门店（不限 type=restaurant，支持理发/医院/健身/推拿/美容/KTV/房产/服务） */
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as SearchBody;
    const areas = Array.isArray(body.areas) && body.areas.length > 0 ? body.areas : ["池袋", "新宿"];
    const keywords = Array.isArray(body.keywords) && body.keywords.length > 0 ? body.keywords : [];
    const minRating = Number.isFinite(Number(body.minRating)) ? Number(body.minRating) : 3.5;
    const minReviews = Number.isFinite(Number(body.minReviews)) ? Number(body.minReviews) : 3;
    const limit = Math.min(80, Math.max(1, Number(body.limit) || 30));

    if (keywords.length === 0) {
      return NextResponse.json({ error: "keywords is required" }, { status: 400 });
    }

    const byId = new Map<
      string,
      {
        placeId: string;
        name: string;
        address: string;
        rating: number;
        reviewCount: number;
        lat: number | null;
        lng: number | null;
        sources: string[];
      }
    >();

    for (const area of areas) {
      const isNonTokyo = NON_TOKYO_HINTS.some((h) => area.includes(h));
      for (const keyword of keywords) {
        const q = isNonTokyo ? `${keyword} ${area}` : `${keyword} ${area} 東京`;
        const results = await searchGoogleLife(q);
        for (const item of results) {
          if (!item.place_id || !item.name) continue;
          if (item.business_status === "CLOSED_PERMANENTLY") continue;
          if (isExcludedFoodPlace(item.types)) continue;
          const address = item.formatted_address || "";
          if (!KANTO_PATTERNS.some((p) => address.includes(p))) continue;

          const rating = Number(item.rating || 0);
          const reviewCount = Number(item.user_ratings_total || 0);
          if (rating < minRating || reviewCount < minReviews) continue;

          const prev = byId.get(item.place_id);
          if (prev) {
            if (!prev.sources.includes(q)) prev.sources.push(q);
          } else {
            byId.set(item.place_id, {
              placeId: item.place_id,
              name: item.name,
              address,
              rating,
              reviewCount,
              lat: item.geometry?.location?.lat ?? null,
              lng: item.geometry?.location?.lng ?? null,
              sources: [q],
            });
          }
        }
      }
    }

    const candidates = Array.from(byId.values())
      .sort((a, b) => b.rating * Math.log10(b.reviewCount + 10) - a.rating * Math.log10(a.reviewCount + 10))
      .slice(0, limit);

    // 标记已在 life_places 中的门店，避免重复同步
    const existingIds = new Set<string>();
    if (candidates.length > 0) {
      const db = await getDb();
      const chunkSize = 80;
      for (let i = 0; i < candidates.length; i += chunkSize) {
        const chunk = candidates.slice(i, i + chunkSize).map((c) => c.placeId);
        const placeholders = chunk.map(() => "?").join(",");
        const res = await db
          .prepare(`SELECT id FROM life_places WHERE id IN (${placeholders})`)
          .bind(...chunk)
          .all<{ id: string }>();
        for (const row of res.results || []) existingIds.add(row.id);
      }
    }

    const enriched = candidates.map((c) => ({
      ...c,
      existing: existingIds.has(c.placeId),
    }));

    return NextResponse.json({
      candidates: enriched,
      newCount: enriched.filter((c) => !c.existing).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
