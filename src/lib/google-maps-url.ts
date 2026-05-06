import { nearbySearchPlaces, textSearchPlaces, type GooglePlaceResult } from "@/lib/google-maps";

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
    const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    const url = new URL(withProtocol);
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
  const exactPlaceMatch = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (exactPlaceMatch) {
    return { lat: Number(exactPlaceMatch[1]), lng: Number(exactPlaceMatch[2]) };
  }

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

function normalizePlaceName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadius = 6371000;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function pickBestPlace(
  places: GooglePlaceResult[],
  query: string,
  coordinates: { lat: number; lng: number } | null
): GooglePlaceResult | null {
  const normalizedQuery = normalizePlaceName(query);

  return places
    .filter((place) => place.place_id)
    .map((place) => {
      let score = 0;
      const normalizedName = normalizePlaceName(place.name || "");
      if (normalizedQuery && normalizedName) {
        if (normalizedName === normalizedQuery) score += 120;
        else if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) score += 80;
      }
      if (coordinates && place.geometry?.location) {
        const distance = distanceMeters(coordinates, place.geometry.location);
        score += Math.max(0, 80 - distance);
      }
      score += place.rating ? place.rating : 0;
      return { place, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.place ?? null;
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
  const textResults = await textSearchPlaces(query, coordinates ? { ...coordinates, radius: 500 } : {});
  let best = pickBestPlace(textResults, query, coordinates);

  if (!best && coordinates) {
    const nearbyWithKeyword = await nearbySearchPlaces({ ...coordinates, radius: 150, keyword: query });
    best = pickBestPlace(nearbyWithKeyword, query, coordinates);
  }

  if (!best && coordinates) {
    const nearby = await nearbySearchPlaces({ ...coordinates, radius: 80 });
    best = pickBestPlace(nearby, query, coordinates);
  }

  if (!best?.place_id) {
    throw new Error("Google Maps 没有找到对应餐厅。请确认链接是餐厅店铺页，或直接粘贴 Google place_id");
  }

  return {
    placeId: best.place_id,
    resolvedUrl: resolvedUrl.toString(),
    query,
  };
}
