import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SYNC_API_BASE = process.env.SYNC_API_BASE || "http://localhost:3000";
const MIN_RATING = Number(process.env.COLLECT_MIN_RATING || 4.0);
const LIMIT = Number(process.env.COLLECT_LIMIT || 6);
const DRY_RUN = process.argv.includes("--dry-run");

const AREAS = (process.env.COLLECT_AREAS || "池袋,上野")
  .split(",")
  .map((area) => area.trim())
  .filter(Boolean);

const KEYWORDS = (process.env.COLLECT_KEYWORDS || "湖南料理,湘菜,四川料理,川菜,本格中華,ガチ中華")
  .split(",")
  .map((keyword) => keyword.trim())
  .filter(Boolean);

function assertEnv() {
  const missing = [];
  if (!GOOGLE_MAPS_API_KEY) missing.push("GOOGLE_MAPS_API_KEY");
  if (!ADMIN_SECRET && !DRY_RUN) missing.push("ADMIN_SECRET");

  if (missing.length > 0) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
}

async function searchText(query) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "restaurant");
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Maps search error for "${query}": ${data.status} ${data.error_message || ""}`);
  }

  return data.results || [];
}

function addCandidate(candidates, result, query, area, keyword) {
  if (!result.place_id) return;
  if ((result.rating || 0) < MIN_RATING) return;

  const existing = candidates.get(result.place_id);
  const source = `${area}/${keyword}`;

  if (existing) {
    existing.sources.add(source);
    return;
  }

  candidates.set(result.place_id, {
    placeId: result.place_id,
    name: result.name,
    address: result.formatted_address || "",
    rating: result.rating || 0,
    reviewCount: result.user_ratings_total || 0,
    sources: new Set([source]),
    query,
  });
}

async function syncCandidate(candidate, index, total) {
  const response = await fetch(`${SYNC_API_BASE}/api/admin/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_SECRET}`,
    },
    body: JSON.stringify({ place_id: candidate.placeId }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Sync failed ${response.status}: ${text}`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  console.log(`[${index}/${total}] synced ${candidate.name} -> ${payload.restaurant || candidate.placeId}`);
  return payload;
}

async function main() {
  assertEnv();

  console.log(`First wave collection`);
  console.log(`areas=${AREAS.join(" / ")}`);
  console.log(`keywords=${KEYWORDS.join(" / ")}`);
  console.log(`minRating=${MIN_RATING} limit=${LIMIT} dryRun=${DRY_RUN}`);

  const candidates = new Map();

  for (const area of AREAS) {
    for (const keyword of KEYWORDS) {
      const query = `${keyword} ${area} 東京`;
      const results = await searchText(query);
      for (const result of results) {
        addCandidate(candidates, result, query, area, keyword);
      }
      console.log(`searched "${query}" -> ${results.length} raw, ${candidates.size} candidates so far`);
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  const selected = [...candidates.values()]
    .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
    .slice(0, LIMIT);

  console.log(`\nSelected ${selected.length} candidates:`);
  selected.forEach((candidate, index) => {
    console.log(
      `${index + 1}. ${candidate.name} | ${candidate.rating} (${candidate.reviewCount}) | ${candidate.address} | ${[...candidate.sources].join(", ")}`
    );
  });

  if (DRY_RUN) return;

  console.log(`\nSyncing selected candidates through ${SYNC_API_BASE}/api/admin/sync`);
  const synced = [];
  for (const [index, candidate] of selected.entries()) {
    try {
      const payload = await syncCandidate(candidate, index + 1, selected.length);
      synced.push({ candidate, payload, ok: true });
    } catch (error) {
      console.error(`[${index + 1}/${selected.length}] failed ${candidate.name}:`, error.message);
      synced.push({ candidate, error: error.message, ok: false });
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  const okCount = synced.filter((item) => item.ok).length;
  console.log(`\nDone. synced=${okCount}/${synced.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
