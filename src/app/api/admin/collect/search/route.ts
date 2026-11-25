import { consumeQuota } from "@/lib/google-quota";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { isAdminRequest } from "@/lib/admin-auth";

type SearchBody = {
  areas?: string[];
  keywords?: string[];
  minRating?: number;
  minReviews?: number;
  requireTokyo?: boolean;
  // true 时（默认）限制在关东 7 都县内，避免非东京搜索跑偏到关西或海外
  requireKanto?: boolean;
  limit?: number;
};

type GoogleTextSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  business_status?: string;
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
  "広東料理", "茶餐廳", "飲茶", "福建料理", "上海料理", "烤魚", "東北鉄鍋燉", "螺螄粉",
  "中華惣菜", "鴨脖 滷味", "中華物産店", "中国物産", "中華朝食", "豆漿 油条", "煎餅果子",
  "本格中華", "ガチ中華",
];

// 搜索中华物产店、外带熟食卤味或中式早餐时，Google 上这类门店的 type 往往是 store/grocery/cafe/food 而非 restaurant，
// 强传 type=restaurant 会把绝大多数物产店、熟食店和早餐铺过滤掉，因此遇到这些关键词自动放开 type 限制
const NON_RESTAURANT_TYPE_HINTS = [
  "物産", "物产", "超市", "食品", "食材", "商店", "熟食", "卤味", "滷味", "鸭脖", "鴨脖", "惣菜", "焼臘", "烧腊",
  "朝食", "早餐", "豆漿", "豆浆", "油条", "油條", "煎餅", "煎饼", "朝粥", "胡辣湯", "胡辣汤",
];

function shouldRestrictRestaurantType(query: string): boolean {
  return !NON_RESTAURANT_TYPE_HINTS.some((hint) => query.includes(hint));
}

const KANTO_PATTERNS = ["東京都", "神奈川県", "埼玉県", "千葉県", "茨城県", "栃木県", "群馬県"];

// 非东京都内的关东热门区域名，拼接查询词时不强行加「東京」
const NON_TOKYO_AREA_HINTS = [
  "神奈川", "横浜", "川崎", "埼玉", "川口", "西川口", "蕨", "大宮", "浦和",
  "千葉", "船橋", "西船橋", "松戸", "柏", "市川", "津田沼",
];

function buildSearchQuery(keyword: string, area: string): string {
  const isNonTokyo = NON_TOKYO_AREA_HINTS.some((hint) => area.includes(hint));
  return isNonTokyo ? `${keyword} ${area}` : `${keyword} ${area} 東京`;
}

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

  if (!(await consumeQuota("textsearch"))) {
    throw new Error("Google API 本月免费额度已用完，已自动停止调用以避免产生费用");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  if (shouldRestrictRestaurantType(query)) {
    url.searchParams.set("type", "restaurant");
  }
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
    // D1 单条查询有参数上限，按 80 个一组分批去重；查全表（含已下架的店），避免反复采回被过滤/删除的店
    const existingIds = new Set<string>();
    const chunkSize = 80;
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const ids = chunk.map((candidate) => candidate.placeId);
      const { results } = await db
        .prepare(`SELECT id FROM restaurants WHERE id IN (${placeholders})`)
        .bind(...ids)
        .all<{ id: string }>();
      for (const row of results || []) {
        existingIds.add(row.id);
      }
    }
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
  if (!(await isAdminRequest(req))) {
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
    const requireKanto = body.requireKanto !== false;

    const candidates = new Map<string, Candidate>();
    const errors: string[] = [];
    let rawCount = 0;

    for (const area of areas) {
      for (const keyword of keywords) {
        const query = buildSearchQuery(keyword, area);
        try {
          const results = await searchGoogle(query);
          rawCount += results.length;

          for (const result of results) {
            if (!result.place_id || !result.name) continue;
            if (result.business_status === "CLOSED_PERMANENTLY") continue;
            const rating = result.rating || 0;
            const reviewCount = result.user_ratings_total || 0;
            const address = result.formatted_address || "";
            if (rating < minRating) continue;
            if (reviewCount < minReviews) continue;
            if (requireTokyo && !address.includes("東京都")) continue;
            if (!requireTokyo && requireKanto && !KANTO_PATTERNS.some((p) => address.includes(p))) continue;

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
