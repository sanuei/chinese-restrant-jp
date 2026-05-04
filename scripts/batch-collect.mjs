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
const LIMIT = Number(process.env.COLLECT_LIMIT || 20);
const SYNC_DELAY = Number(process.env.SYNC_DELAY || 3000);
const SYNC_LIMIT = Number(process.env.SYNC_LIMIT || 0);

const AREAS = (process.env.AREAS || "池袋,上野,新宿,高田馬場,秋葉原,神田")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const KEYWORDS = (process.env.KEYWORDS || "川菜,湘菜,四川料理,湖南料理,本格中華,ガチ中華,餃子,新疆料理,雲南料理")
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
  if ((result.rating || 0) < MIN_RATING) return;

  const key = result.place_id;
  const source = `${area}/${keyword}`;

  if (map.has(key)) {
    map.get(key).sources.add(source);
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

async function phaseCollect() {
  assertEnv("GOOGLE_MAPS_API_KEY");
  ensureDataDir();

  log(`Phase 1: Collect`);
  log(`areas=${AREAS.join(" / ")}`);
  log(`keywords=${KEYWORDS.join(" / ")}`);
  log(`minRating=${MIN_RATING} limit=${LIMIT}`);

  // 合并已有数据
  const existing = new Map(loadCandidates().map((c) => [c.placeId, c]));

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

  const all = [...existing.values()];

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

async function phaseSync() {
  assertEnv("ADMIN_SECRET");

  const candidates = loadCandidates();
  const results = loadResults();
  const resultsMap = new Map(results.map((r) => [r.placeId, r]));

  // 过滤未同步的
  const pending = candidates.filter((c) => !c.synced && !resultsMap.has(c.placeId));

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
      resultsMap.set(c.placeId, entry);
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
      resultsMap.set(c.placeId, entry);
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

// ─── Main ──────────────────────────────────────────────────────────────────

const PHASE = process.argv.includes("--phase=sync") ? "sync" : "collect";

if (PHASE === "collect") {
  phaseCollect().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  phaseSync().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
