/**
 * ガチ中華ナビ - 交互式数据管理脚本
 *
 * 功能：
 *   [1] 采集新餐厅   - Google Maps 搜索候选
 *   [2] 同步/更新    - 筛选后同步到 D1
 *   [3] 批量重算评分 - 已有数据，不调 API 直接用公式重算
 *   [4] 删除餐厅
 *   [5] 查看/导出数据
 *
 * 用法:
 *   node scripts/interactive-collect.mjs
 */

import dotenv from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
// ─── Env ───────────────────────────────────────────────────────────────────
// dotenv 必须在读取 process.env 之前加载
dotenv.config({ path: join(__dirname, "..", ".env.local"), quiet: true });

function getEnv(key, fallback = "") {
  return process.env[key] || fallback;
}

const DATA_DIR = join(__dirname, "..", "data");
const CANDIDATES_FILE = join(DATA_DIR, "candidates.json");
const RESULTS_FILE = join(DATA_DIR, "sync-results.json");
const GOOGLE_MAPS_API_KEY = getEnv("GOOGLE_MAPS_API_KEY");
const ADMIN_SECRET = getEnv("ADMIN_SECRET");
const SYNC_API_BASE = getEnv("SYNC_API_BASE", "http://localhost:3000");
const MIN_RATING = Number(getEnv("COLLECT_MIN_RATING", "4.0"));

// ─── 数据库查询 ─────────────────────────────────────────────────────────────
async function queryDb(sql) {
  const { spawn } = await import("child_process");
  const proc = spawn("wrangler", [
    "d1", "execute", "gachi-chukanavi-db",
    "--local",
    "--command", sql,
  ], { cwd: join(__dirname, "..") });

  let so = "";
  proc.stdout.on("data", (d) => { so += d.toString(); });

  return new Promise((resolve, reject) => {
    proc.on("close", async () => {
      await new Promise(r => setTimeout(r, 200));
      // wrangler 输出: ASCII art + 换行 + [JSON array wrapper]
      // 从最后一个 '[' 开始（JSON array），往后找完整闭合
      const arrStart = so.lastIndexOf("[");
      if (arrStart < 0) { reject(new Error("No JSON in wrangler output")); return; }
      // 往右扩展直到解析成功
      for (let end = arrStart + 10; end <= so.length; end++) {
        try {
          resolve(JSON.parse(so.slice(arrStart, end)));
          return;
        } catch { /* continue */ }
      }
      reject(new Error("Could not parse JSON from wrangler output: " + so.slice(arrStart, arrStart + 200)));
    });
    proc.on("error", (e) => reject(e));
  });
}

async function getAllRestaurants() {
  const result = await queryDb(
    "SELECT id, name_original, cuisine_type, authenticity, raw_rating, trusted_rating, raw_review_count, trusted_review_count, ward, last_synced_at FROM restaurants ORDER BY last_synced_at DESC"
  );
  return result || [];
}

async function getStats() {
  const result = await queryDb(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN trusted_review_count = 0 THEN 1 ELSE 0 END) as zero_count,
      AVG(trusted_rating) as avg_trusted_rating,
      SUM(raw_review_count) as total_reviews
    FROM restaurants
  `);
  return result[0] || {};
}

// ─── 进度条工具 ─────────────────────────────────────────────────────────────
class ProgressBar {
  constructor(total, label = "") {
    this.total = total;
    this.current = 0;
    this.label = label;
    this.startTime = Date.now();
  }

  update(current, msg) {
    this.current = current;
    const pct = Math.floor((current / this.total) * 100);
    const filled = Math.floor(pct / 5);
    const bar = "█".repeat(filled) + "░".repeat(20 - filled);
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const eta = current > 0 ? Math.floor((elapsed / current) * (this.total - current)) : 0;
    process.stdout.write(`\r  ${bar} ${pct}%  ${current}/${this.total}  ${msg || ""}  ETA:${eta}s     `);
  }

  clear() {
    process.stdout.write("\r" + " ".repeat(100) + "\r");
  }
}

// ─── 输入工具 ───────────────────────────────────────────────────────────────
function createRl() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

async function askQuestion(question) {
  const rl = createRl();
  return new Promise(resolve => {
    rl.question(question, ans => {
      rl.close();
      resolve(ans);
    });
  });
}

async function askMenu(choices, question = "请选择:") {
  console.log("\n" + "═".repeat(50));
  choices.forEach((c, i) => console.log(`  [${i + 1}] ${c}`));
  console.log("═".repeat(50));
  const ans = await askQuestion(`${question} (1-${choices.length}): `);
  return Math.max(1, Math.min(choices.length, parseInt(ans) || 1));
}

async function askMultiSelect(options, question = "选择 (逗号分隔，空则继续):") {
  console.log("\n  可选值:", options.join(", "));
  const ans = await askQuestion(`${question}: `);
  if (!ans.trim()) return [];
  return ans.split(",").map(s => s.trim()).filter(Boolean);
}

async function askConfirm(question = "确认? (y/N): ") {
  const ans = (await askQuestion(question)).trim().toLowerCase();
  return ans === "y" || ans === "yes";
}

// ─── Google Maps 搜索 ────────────────────────────────────────────────────────
async function searchGoogleMaps(query) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "restaurant");
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`${query}: ${data.status}`);
  }
  return data.results || [];
}

// ─── Sync API 调用 ────────────────────────────────────────────────────────────
async function syncRestaurant(placeId) {
  const res = await fetch(`${SYNC_API_BASE}/api/admin/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ADMIN_SECRET}`,
    },
    body: JSON.stringify({ place_id: placeId }),
  });
  return res.json();
}

// ─── 动作 1: 采集新餐厅 ──────────────────────────────────────────────────────
async function actionCollect() {
  console.log("\n📡 采集新餐厅");
  console.log("─".repeat(40));

  const areas = (await askQuestion("地区 (逗号分隔，默认 新宿,池袋,上野,高田馬場): ")).trim()
    || "新宿,池袋,上野,高田馬場";
  const keywords = (await askQuestion("关键词 (逗号分隔，默认 川菜,湘菜,本格中華): ")).trim()
    || "川菜,湘菜,本格中華";
  const minRating = parseFloat(await askQuestion(`最低评分 (默认 ${MIN_RATING}): `)) || MIN_RATING;
  const limit = parseInt(await askQuestion("每区域最大数量 (默认 20): ")) || 20;

  const areaList = areas.split(",").map(s => s.trim()).filter(Boolean);
  const keywordList = keywords.split(",").map(s => s.trim()).filter(Boolean);

  console.log(`\n搜索: ${areaList.length} 个区域 × ${keywordList.length} 个关键词`);
  const confirm = await askConfirm("开始采集?");
  if (!confirm) return;

  const candidates = new Map();
  const rl = createRl();
  let totalFound = 0;

  for (const area of areaList) {
    for (const keyword of keywordList) {
      const query = `${keyword} ${area} 東京`;
      process.stdout.write(`\n  搜索: ${query} ...`);
      try {
        const results = await searchGoogleMaps(query);
        for (const r of results) {
          if (!r.place_id || (r.rating || 0) < minRating) continue;
          const existing = candidates.get(r.place_id);
          if (existing) {
            if (!existing.sources.includes(`${area}/${keyword}`)) {
              existing.sources.push(`${area}/${keyword}`);
            }
          } else {
            candidates.set(r.place_id, {
              placeId: r.place_id,
              name: r.name,
              address: r.formatted_address || "",
              rating: r.rating || 0,
              reviewCount: r.user_ratings_total || 0,
              sources: [`${area}/${keyword}`],
              query,
              collectedAt: new Date().toISOString(),
              synced: false,
              syncAt: null,
              syncError: null,
            });
          }
        }
        totalFound += results.length;
        process.stdout.write(` ✓ ${results.length} 家`);
      } catch (e) {
        process.stdout.write(` ✗ ${e.message}`);
      }
    }
  }
  rl.close();

  console.log(`\n\n📊 共发现 ${candidates.size} 家不重复餐厅 (共 ${totalFound} 条结果)`);

  const existing = existsSync(CANDIDATES_FILE) ? JSON.parse(readFileSync(CANDIDATES_FILE, "utf-8")) : [];
  const existingMap = new Map(existing.map(c => [c.placeId, c]));
  let newCount = 0, dupCount = 0;

  for (const [pid, c] of candidates) {
    if (existingMap.has(pid)) dupCount++;
    else { existing.push(c); newCount++; }
  }

  console.log(`  新增: ${newCount} | 已存在: ${dupCount}`);

  if (newCount > 0) {
    const save = await askConfirm(`保存 ${newCount} 家到 candidates.json?`);
    if (save) {
      writeFileSync(CANDIDATES_FILE, JSON.stringify(existing, null, 2), "utf-8");
      console.log("  ✓ 已保存");
    }
  }
}

// ─── 动作 2: 同步/更新 ────────────────────────────────────────────────────────
async function actionSync() {
  console.log("\n🔄 同步/更新餐厅");
  console.log("─".repeat(40));

  // 加载候选项
  let candidates = [];
  if (existsSync(CANDIDATES_FILE)) {
    candidates = JSON.parse(readFileSync(CANDIDATES_FILE, "utf-8"));
  }

  // 加载已同步的 place_id
  let syncedIds = new Set();
  if (existsSync(RESULTS_FILE)) {
    const results = JSON.parse(readFileSync(RESULTS_FILE, "utf-8"));
    results.forEach(r => { if (r.success) syncedIds.add(r.placeId); });
  }

  // 过滤
  const cuisineTypes = ["sichuan", "cantonese", "hunan", "northern", "fujian", "jiangsu", "yunnan", "northwest", "other"];
  const authenticityTypes = ["authentic", "adapted", "japanese", "unknown"];
  const wards = ["新宿", "池袋", "上野", "高田馬場", "秋葉原", "神田", "豊島", "千代田", "中央", "港", "文京", "江北", "板橋"];

  console.log("\n[筛选条件 - 直接回车跳过]");
  const selCuisines = await askMultiSelect(cuisineTypes, "菜系");
  const selAuth = await askMultiSelect(authenticityTypes, "正宗度");
  const selWards = await askMultiSelect(wards, "地区");

  const onlyNew = (await askQuestion("仅同步未同步过的? (y/N): ")).trim().toLowerCase() === "y";

  // 应用筛选
  let toSync = candidates.filter(c => {
    if (onlyNew && c.synced) return false;
    if (selCuisines.length && !selCuisines.some(k => c.name.includes("川") ? k === "sichuan" : c.name.includes("粤") ? k === "cantonese" : false)) {
      // 按名称粗筛
    }
    return true;
  });

  if (toSync.length === 0) {
    console.log("没有符合条件的餐厅。");
    return;
  }

  console.log(`\n📋 将同步 ${toSync.length} 家餐厅`);
  const confirm = await askConfirm("确认开始?");
  if (!confirm) return;

  const delay = parseInt(await askQuestion("间隔秒数 (默认 3): ")) || 3;
  const saveResults = [];

  for (let i = 0; i < toSync.length; i++) {
    const c = toSync[i];
    process.stdout.write(`\r  [${i + 1}/${toSync.length}] ${c.name.slice(0, 30)}... `);

    try {
      const result = await syncRestaurant(c.placeId);
      const ok = result.success;
      c.synced = ok;
      c.syncAt = ok ? new Date().toISOString() : null;
      c.syncError = ok ? null : result.error;

      if (ok) syncedIds.add(c.placeId);
      saveResults.push({ placeId: c.placeId, name: c.name, success: ok, trusted_rating: result.trusted_rating, error: result.error });

      process.stdout.write(ok ? `✓ ${result.trusted_rating || ""}` : `✗ ${result.error || "error"}`);
    } catch (e) {
      c.synced = false;
      c.syncError = e.message;
      process.stdout.write(`✗ ${e.message}`);
    }

    // 每步保存进度
    writeFileSync(CANDIDATES_FILE, JSON.stringify(candidates, null, 2), "utf-8");
    writeFileSync(RESULTS_FILE, JSON.stringify(saveResults, null, 2), "utf-8");

    if (i < toSync.length - 1) await new Promise(resolve => setTimeout(resolve, delay * 1000));
  }

  console.log(`\n\n✅ 完成! 成功 ${saveResults.filter(r => r.success).length}/${toSync.length}`);
}

// ─── 动作 3: 批量重算评分 ─────────────────────────────────────────────────────
async function actionRecalc() {
  console.log("\n🧮 批量重算评分");
  console.log("─".repeat(40));
  console.log("  公式: trusted_rating = Bayesian_Avg + authenticity_bonus + quality_penalty");
  console.log("  Bayesian: WR = v/(v+m)×R + m/(v+m)×C  (m=598, C=4.5)");
  console.log("  auth_bonus: max(0, (auth_score-60)/100×0.3)");
  console.log("  quality_penalty: -0.2 if avg_helpful_votes < 3 (平台自写评论)\n");

  const restaurants = await getAllRestaurants();
  if (restaurants.length === 0) { console.log("数据库为空。"); return; }

  // 加载全局参数
  let m, C;
  try {
    const row = await queryDb(`
      SELECT
        AVG(raw_rating) as C,
        (SELECT raw_review_count FROM restaurants ORDER BY raw_review_count
         LIMIT 1 OFFSET MAX(0, (SELECT COUNT(*) FROM restaurants) / 2 - 1)) as m
      FROM restaurants WHERE raw_rating > 0
    `);
    m = row[0]?.m || 598;
    C = row[0]?.C || 4.5;
    console.log(`  全局参数: m=${m}, C=${C.toFixed(4)}\n`);
  } catch (e) {
    m = 598; C = 4.5;
    console.log(`  全局参数: m=598, C=4.5 (fallback)\n`);
  }

  // 筛选
  const selWards = await askMultiSelect(["新宿", "池袋", "上野", "高田馬場", "秋葉原", "豊島区", "台東区"], "地区 (空则全部)");
  const selAuth = await askMultiSelect(["authentic", "adapted", "japanese", "unknown"], "正宗度 (空则全部)");
  const onlyZero = (await askQuestion("仅显示 auth_score >= 60 的? (y/N): ")).trim().toLowerCase() === "y";

  let filtered = restaurants.filter(r => {
    if (selWards.length && !selWards.some(w => r.ward && r.ward.includes(w))) return false;
    if (selAuth.length && !selAuth.includes(r.authenticity)) return false;
    if (onlyZero && (r.authenticity_score || 0) < 60) return false;
    return true;
  });

  console.log(`\n找到 ${filtered.length} 家符合条件`);
  if (filtered.length === 0) return;

  // 显示前 20 家预览
  console.log("\n前 20 家预览 (旧评分 → 新评分):");
  console.log("  名称                              | 旧   | 新   | 评论数 | auth_score | 正宗度");
  console.log("  " + "─".repeat(90));
  filtered.slice(0, 20).forEach(r => {
    const authScore = r.authenticity_score || 0;
    const authBonus = Math.max(0, (authScore - 60) / 100 * 0.3);
    const v = r.raw_review_count || 0;
    const R = r.raw_rating || 0;
    const WR = (v / (v + m)) * R + (m / (v + m)) * C;
    const newRating = Math.round(Math.min(5, Math.max(1, WR + authBonus)) * 10) / 10;
    const name = (r.name_original || "").slice(0, 30).padEnd(30);
    console.log(`  ${name} | ${((r.trusted_rating || 0)+"").padStart(4)} | ${(newRating+"").padStart(4)} | ${(v+"").padStart(7)} | ${(authScore+"").padStart(10)} | ${r.authenticity || "-"}`);
  });

  const confirm = await askConfirm(`\n更新这 ${filtered.length} 家?`);
  if (!confirm) return;

  // 直接 SQL 更新，不调 API
  let ok = 0, fail = 0;
  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    const authScore = r.authenticity_score || 0;
    const authBonus = Math.max(0, (authScore - 60) / 100 * 0.3);
    const v = r.raw_review_count || 0;
    const R = r.raw_rating || 0;
    const WR = (v / (v + m)) * R + (m / (v + m)) * C;
    const newRating = Math.round(Math.min(5, Math.max(1, WR + authBonus)) * 10000) / 10000;

    try {
      await queryDb(
        `UPDATE restaurants SET trusted_rating=${newRating}, updated_at=datetime('now') WHERE id='${r.id}'`
      );
      ok++;
      process.stdout.write(`\r  [${i + 1}/${filtered.length}] ✓ ${r.name_original?.slice(0, 30)} → ${newRating.toFixed(4)}`);
    } catch (e) {
      fail++;
      process.stdout.write(`\r  [${i + 1}/${filtered.length}] ✗ ${r.name_original?.slice(0, 30)}: ${e.message}`);
    }
  }

  console.log(`\n\n✅ 完成! 成功 ${ok}，失败 ${fail}`);
}

// ─── 动作 4: 删除餐厅 ─────────────────────────────────────────────────────────
async function actionDelete() {
  console.log("\n🗑️  删除餐厅");
  console.log("─".repeat(40));

  const restaurants = await getAllRestaurants();
  if (restaurants.length === 0) { console.log("数据库为空。"); return; }

  console.log(`\n共 ${restaurants.length} 家餐厅`);
  const search = await askQuestion("搜索名称 (空则列出全部): ");

  let filtered = restaurants;
  if (search.trim()) {
    filtered = restaurants.filter(r =>
      (r.name_original || "").includes(search.trim())
    );
  }

  console.log(`\n找到 ${filtered.length} 家:`);
  filtered.forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.name_original} (${r.cuisine_type}) rating=${r.trusted_rating}`);
  });

  const sel = await askQuestion("\n选择序号删除 (逗号分隔，all=全部): ");
  let toDelete = [];
  if (sel.trim() === "all") {
    toDelete = filtered;
  } else {
    sel.split(",").map(s => parseInt(s.trim())).forEach(idx => {
      if (idx > 0 && idx <= filtered.length) toDelete.push(filtered[idx - 1]);
    });
  }

  if (toDelete.length === 0) { console.log("取消。"); return; }

  console.log(`\n将删除 ${toDelete.length} 家:`);
  toDelete.forEach(r => console.log(`  - ${r.name_original}`));

  const confirm = await askConfirm("\n⚠️ 确认删除? 此操作不可恢复!");
  if (!confirm) { console.log("取消。"); return; }

  for (const r of toDelete) {
    await queryDb(`DELETE FROM restaurants WHERE id='${r.id}'`);
    console.log(`  ✓ 已删除: ${r.name_original}`);
  }
}

// ─── 动作 5: 查看/导出 ────────────────────────────────────────────────────────
async function actionView() {
  console.log("\n📊 数据统计");
  console.log("─".repeat(40));

  const stats = await getStats();
  console.log(`  总餐厅数:   ${stats.total || 0}`);
  console.log(`  总评论数:   ${stats.total_reviews || 0}`);
  console.log(`  平均评分:   ${((stats.avg_trusted_rating || 0)+"").slice(0, 5)}`);
  console.log(`  0评论餐厅:  ${stats.zero_count || 0}`);

  console.log("\n按菜系分布:");
  const byCuisine = await queryDb("SELECT cuisine_type, COUNT(*) as cnt FROM restaurants WHERE cuisine_type IS NOT NULL AND cuisine_type != '' GROUP BY cuisine_type ORDER BY cnt DESC");
  byCuisine.forEach(r => {
    console.log(`  ${((r.cuisine_type || "unknown")+"").padEnd(10)} ${r.cnt}`);
  });

  console.log("\n按正宗度分布:");
  const byAuth = await queryDb("SELECT authenticity, COUNT(*) as cnt FROM restaurants GROUP BY authenticity ORDER BY cnt DESC");
  byAuth.forEach(r => {
    console.log(`  ${((r.authenticity || "unknown")+"").padEnd(10)} ${r.cnt}`);
  });

  console.log("\n按 authenticity_score 分布:");
  const byScore = await queryDb(`
    SELECT
      CASE
        WHEN authenticity_score >= 80 THEN '80-100 (正宗+)'
        WHEN authenticity_score >= 60 THEN '60-79  (达标)'
        WHEN authenticity_score >= 40 THEN '40-59  (一般)'
        ELSE '0-39   (存疑)'
      END as bucket,
      COUNT(*) as cnt
    FROM restaurants
    GROUP BY bucket
    ORDER BY bucket DESC
  `);
  byScore.forEach(r => {
    console.log(`  ${((r.bucket || "")+"").padEnd(20)} ${r.cnt}`);
  });

  console.log("\n最新 10 家:");
  const latest = await getAllRestaurants();
  latest.slice(0, 10).forEach(r => {
    console.log(`  [${(r.trusted_rating || 0)+""}] ${r.name_original} (${r.cuisine_type}) ${r.ward || ""}`);
  });

  const exp = await askQuestion("\n导出 CSV? (y/N): ");
  if (exp.trim().toLowerCase() === "y") {
    const restaurants = await getAllRestaurants();
    const headers = ["id", "name_original", "cuisine_type", "authenticity", "raw_rating", "trusted_rating", "raw_review_count", "trusted_review_count", "ward", "last_synced_at"];
    const rows = [headers.join(",")];
    restaurants.forEach(r => {
      rows.push(headers.map(h => `"${(r[h] || "").toString().replace(/"/g, '""')}"`).join(","));
    });
    const outFile = join(DATA_DIR, `export_${Date.now()}.csv`);
    writeFileSync(outFile, rows.join("\n"), "utf-8");
    console.log(`  ✓ 已导出: ${outFile}`);
  }
}

// ─── 主菜单 ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🍜 ガチ中華ナビ - 交互式数据管理");
  console.log("═".repeat(50));

  const choice = await askMenu([
    "采集新餐厅 (Google Maps 搜索候选)",
    "同步/更新餐厅 (筛选后同步到 D1)",
    "批量重算评分 (不调 API，直接重算)",
    "删除餐厅",
    "查看数据 / 导出",
  ]);

  try {
    switch (choice) {
      case 1: await actionCollect(); break;
      case 2: await actionSync(); break;
      case 3: await actionRecalc(); break;
      case 4: await actionDelete(); break;
      case 5: await actionView(); break;
    }
  } catch (e) {
    console.error("\n❌ 错误:", e.message);
  }

  console.log("\n");
  const again = await askQuestion("再执行一次? (y/N): ");
  if (again.trim().toLowerCase() === "y") {
    await main();
  } else {
    console.log("bye!");
  }
}

main();
