/**
 * 分阶段餐厅数据采集脚本
 *
 * Phase 1: 搜索 Google Maps，收集候选餐厅，保存到 JSON
 * Phase 2: 读取 JSON，慢慢同步到 D1（控制速率）
 *
 * 用法:
 *   # Phase 1: 收集候选（默认 dry-run，不写库）
 *   node scripts/batch-collect.mjs --phase=collect
 *
 *   # Phase 1: 指定区域和关键词
 *   AREAS="新宿,高田馬場" KEYWORDS="川菜,湘菜,本格中華" node scripts/batch-collect.mjs --phase=collect
 *
 *   # Phase 1: 确认后正式收集（写入 JSON）
 *   FORCE=1 node scripts/batch-collect.mjs --phase=collect
 *
 *   # Phase 2: 慢慢同步到 D1（默认每家间隔 3s）
 *   node scripts/batch-collect.mjs --phase=sync
 *
 *   # Phase 2: 每家间隔 5s（更保守）
 *   SYNC_DELAY=5000 node scripts/batch-collect.mjs --phase=sync
 *
 *   # Phase 2: 只同步前 10 家
 *   SYNC_LIMIT=10 node scripts/batch-collect.mjs --phase=sync
 *
 *   # Phase 3: 刷新数据库里已有餐厅（重新拉 Google 照片/5条评论/AI）
 *   SYNC_LIMIT=20 node scripts/batch-collect.mjs --phase=refresh
 */

import dotenv from "dotenv";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: ".env.local", quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const CANDIDATES_FILE = join(DATA_DIR, "candidates.json");
const RESULTS_FILE = join(DATA_DIR, "sync-results.json");

// ─── Env ───────────────────────────────────────────────────────────────────

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SYNC_API_BASE = process.env.SYNC_API_BASE || "http://localhost:3000";
const FORCE = process.env.FORCE === "1";
const MIN_RATING = Number(process.env.COLLECT_MIN_RATING || 4.0);
const MIN_REVIEWS = Number(process.env.COLLECT_MIN_REVIEWS || 50);
const LIMIT = Number(process.env.COLLECT_LIMIT || 100);
const SYNC_DELAY = Number(process.env.SYNC_DELAY || 3000);
const SYNC_LIMIT = Number(process.env.SYNC_LIMIT || 0);
const RESYNC = process.env.RESYNC === "1";
const REQUIRE_TOKYO = process.env.COLLECT_REQUIRE_TOKYO !== "0";
const RESET_CANDIDATES = process.env.RESET_CANDIDATES === "1";

const TOKYO_23_AREAS = [
  "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区", "江東区",
  "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区", "杉並区", "豊島区",
  "北区", "荒川区", "板橋区", "練馬区", "足立区", "葛飾区", "江戸川区",
];

function parseAreas() {
  const raw = process.env.AREAS || "tokyo23";
  if (raw.toLowerCase() === "tokyo23") return TOKYO_23_AREAS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const AREAS = parseAreas();

const KEYWORDS = (process.env.KEYWORDS || "湖南料理,湘菜,四川料理,川菜,重慶火鍋,麻辣湯,中国火鍋,中国東北料理,東北菜,延辺料理,新疆料理,蘭州牛肉麺,雲南料理,本格中華,ガチ中華")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ─── Helpers ────────────────────────────────────────────────────────────────

function assertEnv(...vars) {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadCandidates() {
  if (!existsSync(CANDIDATES_FILE)) return [];
  return JSON.parse(readFileSync(CANDIDATES_FILE, "utf-8"));
}

function saveCandidates(candidates) {
  ensureDataDir();
  writeFileSync(CANDIDATES_FILE, JSON.stringify(candidates, null, 2), "utf-8");
}

function loadResults() {
  if (!existsSync(RESULTS_FILE)) return [];
  return JSON.parse(readFileSync(RESULTS_FILE, "utf-8"));
}

function saveResults(results) {
  ensureDataDir();
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), "utf-8");
}

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Phase 1: Collect ──────────────────────────────────────────────────────

async function searchGoogle(query) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "restaurant");
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Maps "${query}": ${data.status} ${data.error_message || ""}`);
  }

  return data.results || [];
}

function addCandidate(map, result, query, area, keyword) {
  if (!result.place_id) return;
  if (!isEligibleCandidate({
    rating: result.rating || 0,
    reviewCount: result.user_ratings_total || 0,
    address: result.formatted_address || "",
  })) return;

  const key = result.place_id;
  const source = `${area}/${keyword}`;

  const existing = map.get(key);
  if (existing) {
    // sources 可能是数组（从 JSON 加载）或 Set（新建时）
    if (Array.isArray(existing.sources)) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
    } else {
      existing.sources.add(source);
    }
    return;
  }

  map.set(key, {
    placeId: result.place_id,
    name: result.name,
    address: result.formatted_address || "",
    rating: result.rating || 0,
    reviewCount: result.user_ratings_total || 0,
    sources: [source],
    query,
    collectedAt: new Date().toISOString(),
    synced: false,
    syncAt: null,
    syncError: null,
  });
}

function isEligibleCandidate(candidate) {
  if ((candidate.rating || 0) < MIN_RATING) return false;
  if ((candidate.reviewCount || 0) < MIN_REVIEWS) return false;
  if (REQUIRE_TOKYO && !(candidate.address || "").includes("東京都")) return false;
  return true;
}

async function phaseCollect() {
  assertEnv("GOOGLE_MAPS_API_KEY");
  ensureDataDir();

  log(`Phase 1: Collect`);
  log(`areas=${AREAS.join(" / ")}`);
  log(`keywords=${KEYWORDS.join(" / ")}`);
  log(`minRating=${MIN_RATING} minReviews=${MIN_REVIEWS} requireTokyo=${REQUIRE_TOKYO} limit=${LIMIT}`);

  // 合并已有数据；RESET_CANDIDATES=1 时重建候选池，避免旧关键词污染。
  const existing = RESET_CANDIDATES ? new Map() : new Map(loadCandidates().map((c) => [c.placeId, c]));

  const fresh = new Map();
  let searchCount = 0;

  for (const area of AREAS) {
    for (const keyword of KEYWORDS) {
      const q = `${keyword} ${area} 東京`;
      searchCount++;
      try {
        const results = await searchGoogle(q);
        for (const r of results) {
          addCandidate(fresh, r, q, area, keyword);
        }
        log(`[${searchCount}] "${q}" -> ${results.length} raw, total candidates: ${fresh.size}`);
      } catch (err) {
        log(`[${searchCount}] ERROR "${q}": ${err.message}`);
      }
      await sleep(200);
    }
  }

  // 合并 fresh 到 existing（fresh 优先，更新 sources 和 collectedAt）
  for (const [placeId, candidate] of fresh) {
    const existingCandidate = existing.get(placeId);
    if (existingCandidate) {
      // 合并来源
      const mergedSources = new Set([...existingCandidate.sources, ...candidate.sources]);
      existingCandidate.sources = [...mergedSources];
      existingCandidate.collectedAt = candidate.collectedAt;
    } else {
      existing.set(placeId, candidate);
    }
  }

  const all = [...existing.values()].filter(isEligibleCandidate);

  // 按评分+评论数排序，取前 LIMIT
  const selected = all
    .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
    .slice(0, LIMIT);

  log(`\nTotal candidates: ${all.length}, showing top ${selected.length}:`);
  for (let i = 0; i < selected.length; i++) {
    const c = selected[i];
    log(`  ${i + 1}. ${c.name} | ★${c.rating} (${c.reviewCount}) | ${c.address} | ${c.sources.join(", ")}`);
  }

  if (!FORCE) {
    log(`\n[DRY-RUN] 候选已选出，FORCE=1 才会写入 ${CANDIDATES_FILE}`);
    log(`预览完毕，退出。`);
    return;
  }

  // 保存全部候选（不只是前 LIMIT），方便后续扩展
  saveCandidates(all);
  log(`\nSaved ${all.length} candidates to ${CANDIDATES_FILE}`);
}

// ─── Phase 2: Sync ─────────────────────────────────────────────────────────

async function syncCandidate(candidate) {
  const url = `${SYNC_API_BASE}/api/admin/sync`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_SECRET}`,
    },
    body: JSON.stringify({ place_id: candidate.placeId }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sync ${res.status}: ${text}`);
  }

  return JSON.parse(text);
}

async function fetchExistingRestaurants() {
  assertEnv("ADMIN_SECRET");

  const restaurants = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const url = new URL(`${SYNC_API_BASE}/api/admin/restaurants`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("sort", "newest");

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Fetch existing restaurants ${res.status}: ${text}`);
    }

    const payload = JSON.parse(text);
    restaurants.push(...(payload.data || []));

    const pagination = payload.pagination || {};
    if (!pagination.totalPages || page >= pagination.totalPages) break;
    page++;
  }

  return restaurants;
}

async function phaseSync() {
  assertEnv("ADMIN_SECRET");

  const candidates = loadCandidates();
  const results = loadResults();
  const successfulIds = new Set(results.filter((r) => r.ok).map((r) => r.placeId));

  // 过滤未同步的
  const pending = candidates
    .filter((c) => RESYNC || (!c.synced && !successfulIds.has(c.placeId)))
    .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);

  if (pending.length === 0) {
    log("No pending candidates to sync.");
    return;
  }

  const toSync = SYNC_LIMIT > 0 ? pending.slice(0, SYNC_LIMIT) : pending;

  log(`Phase 2: Sync`);
  log(`pending=${pending.length} total candidates=${candidates.length}`);
  log(`will sync=${toSync.length} delay=${SYNC_DELAY}ms`);

  const newResults = [...results];

  for (let i = 0; i < toSync.length; i++) {
    const c = toSync[i];
    const index = i + 1;
    const start = Date.now();

    try {
      const payload = await syncCandidate(c);
      const entry = {
        placeId: c.placeId,
        name: c.name,
        syncedAt: new Date().toISOString(),
        ok: true,
        payload,
      };
      newResults.push(entry);
      // 标记 candidates 中该条为已同步
      c.synced = true;
      c.syncAt = entry.syncedAt;
      log(`[${index}/${toSync.length}] ✓ ${c.name} (${(Date.now() - start) / 1000}s)`);
    } catch (err) {
      const entry = {
        placeId: c.placeId,
        name: c.name,
        syncedAt: new Date().toISOString(),
        ok: false,
        error: err.message,
      };
      newResults.push(entry);
      c.synced = false;
      c.syncError = err.message;
      log(`[${index}/${toSync.length}] ✗ ${c.name}: ${err.message}`);
    }

    // 更新进度文件（每条都写，防止中断丢失）
    saveResults(newResults);
    saveCandidates(candidates);

    if (i < toSync.length - 1) {
      log(`  waiting ${SYNC_DELAY}ms...`);
      await sleep(SYNC_DELAY);
    }
  }

  const okCount = newResults.filter((r) => r.ok).length;
  log(`\nDone. synced=${okCount}/${newResults.length} (total results file)`);
  log(`Results: ${RESULTS_FILE}`);
}

async function phaseRefresh() {
  assertEnv("ADMIN_SECRET");

  const restaurants = await fetchExistingRestaurants();
  const toRefresh = (SYNC_LIMIT > 0 ? restaurants.slice(0, SYNC_LIMIT) : restaurants)
    .filter((restaurant) => restaurant.id);

  if (toRefresh.length === 0) {
    log("No existing restaurants to refresh.");
    return;
  }

  log(`Phase 3: Refresh existing restaurants`);
  log(`total existing=${restaurants.length} will refresh=${toRefresh.length} delay=${SYNC_DELAY}ms`);

  const results = loadResults();
  const newResults = [...results];

  for (let i = 0; i < toRefresh.length; i++) {
    const restaurant = toRefresh[i];
    const start = Date.now();
    const name = restaurant.name_original || restaurant.name_zh || restaurant.id;

    try {
      const payload = await syncCandidate({ placeId: restaurant.id });
      const entry = {
        placeId: restaurant.id,
        name,
        syncedAt: new Date().toISOString(),
        ok: true,
        phase: "refresh",
        payload,
      };
      newResults.push(entry);
      log(`[${i + 1}/${toRefresh.length}] ✓ refreshed ${name} (${(Date.now() - start) / 1000}s)`);
    } catch (err) {
      const entry = {
        placeId: restaurant.id,
        name,
        syncedAt: new Date().toISOString(),
        ok: false,
        phase: "refresh",
        error: err.message,
      };
      newResults.push(entry);
      log(`[${i + 1}/${toRefresh.length}] ✗ refresh ${name}: ${err.message}`);
    }

    saveResults(newResults);

    if (i < toRefresh.length - 1) {
      log(`  waiting ${SYNC_DELAY}ms...`);
      await sleep(SYNC_DELAY);
    }
  }

  const refreshOk = newResults.filter((r) => r.phase === "refresh" && r.ok).length;
  log(`\nDone. refresh ok entries=${refreshOk}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

const PHASE = process.argv.includes("--phase=sync")
  ? "sync"
  : process.argv.includes("--phase=refresh")
    ? "refresh"
    : "collect";

if (PHASE === "collect") {
  phaseCollect().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (PHASE === "sync") {
  phaseSync().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  phaseRefresh().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
