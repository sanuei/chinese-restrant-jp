import { textSearchPlaces } from "@/lib/google-maps";

type ResolvedMapsInput = {
  placeId: string;
  resolvedUrl: string;
  query: string;
};

const GOOGLE_MAPS_HOST_RE = /(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$/i;

function isPlaceId(value: string): boolean {
  return /^ChI[A-Za-z0-9_-]{10,}$/.test(value);
}

function normalizeGoogleMapsUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    if (!GOOGLE_MAPS_HOST_RE.test(url.hostname) && !url.hostname.includes("maps.app.goo.gl")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function followGoogleMapsRedirect(url: URL): Promise<URL> {
  const response = await fetch(url.toString(), {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 GachiChukaNavi/1.0",
    },
  });
  return new URL(response.url || url.toString());
}

function extractPlaceId(url: URL): string | null {
  return url.searchParams.get("place_id") || url.searchParams.get("query_place_id");
}

function extractCoordinates(value: string): { lat: number; lng: number } | null {
  const match = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { lat: Number(match[1]), lng: Number(match[2]) };
}

function extractQueryFromUrl(url: URL): string {
  const directQuery = url.searchParams.get("q") || url.searchParams.get("query");
  if (directQuery) return directQuery.trim();

  const placeMatch = decodeURIComponent(url.pathname).match(/\/maps\/place\/([^/@]+)/);
  if (!placeMatch) return "";

  return placeMatch[1].replace(/\+/g, " ").trim();
}

export async function resolveGoogleMapsInput(input: string): Promise<ResolvedMapsInput> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("请输入 Google Maps 链接");

  if (isPlaceId(trimmed)) {
    return { placeId: trimmed, resolvedUrl: trimmed, query: trimmed };
  }

  const sourceUrl = normalizeGoogleMapsUrl(trimmed);
  if (!sourceUrl) {
    throw new Error("请粘贴 Google Maps 店铺链接，或直接输入 place_id");
  }

  const resolvedUrl = await followGoogleMapsRedirect(sourceUrl);
  const directPlaceId = extractPlaceId(resolvedUrl);
  if (directPlaceId) {
    return { placeId: directPlaceId, resolvedUrl: resolvedUrl.toString(), query: directPlaceId };
  }

  const query = extractQueryFromUrl(resolvedUrl);
  if (!query) {
    throw new Error("没有从链接中解析到店名，请打开 Google Maps 店铺页后复制分享链接");
  }

  const coordinates = extractCoordinates(resolvedUrl.toString());
  const results = await textSearchPlaces(query, coordinates ? { ...coordinates, radius: 300 } : {});
  const best = results.find((result) => result.place_id) || null;
  if (!best?.place_id) {
    throw new Error("Google Maps 没有找到对应餐厅，请换完整店铺链接再试");
  }

  return {
    placeId: best.place_id,
    resolvedUrl: resolvedUrl.toString(),
    query,
  };
}
