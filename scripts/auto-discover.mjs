/**
 * 自动发现并入库新餐厅脚本（支持定时轮换 & 手动自定义）
 *
 * 流程：
 *   1. 按周轮换（或按环境变量指定的）区域 + 菜系关键词，分区域调用线上 /api/admin/collect/search
 *   2. 排除库里已存在的所有餐厅（含已下架/被过滤的店），按评分+评论数取 Top N 新店
 *   3. 逐家调用线上 /api/admin/sync（开启 auto_filter=true：正宗/改良中餐自动上架，日式中华/永久歇业自动隐藏待审，同时自动生成中文店名）
 *   4. 离线根据 OpenStreetMap 关东车站数据算出最近车站并 PATCH 回写（零 Google 费用，失败自动跳过）
 *   5. 遇到月度配额闸门立即优雅停止，避免产生任何额外费用
 *
 * 用法：
 *   # 按本周轮换组自动发现并入库最多 15 家新店
 *   node scripts/auto-discover.mjs
 *
 *   # 试跑（只搜索预览，不写入数据库）
 *   DRY_RUN=1 node scripts/auto-discover.mjs
 *
 *   # 自定义区域、关键词和数量
 *   AREAS="西川口,錦糸町" KEYWORDS="中国東北料理,ガチ中華" MAX_NEW=10 node scripts/auto-discover.mjs
 *
 *   # 指定跑第几组轮换方案（0-5）
 *   ROTATION_INDEX=0 MAX_NEW=10 node scripts/auto-discover.mjs
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_STATIONS_FILE = join(__dirname, "kanto-stations.json");

// 零外部依赖加载 .env.local（本地生效；GitHub Actions 直接使用注入的环境变量）
if (existsSync(".env.local")) {
  for (const rawLine of readFileSync(".env.local", "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// ─── 配置参数 ───────────────────────────────────────────────────────────────

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SYNC_API_BASE = (process.env.SYNC_API_BASE || "https://gachi.soniclab.cc").replace(/\/+$/, "");
const MAX_NEW = Math.max(1, Math.min(50, Number(process.env.MAX_NEW || 15)));
const MIN_RATING = Number(process.env.MIN_RATING || 4.0);
const MIN_REVIEWS = Number(process.env.MIN_REVIEWS || 50);
const REQUIRE_TOKYO = process.env.REQUIRE_TOKYO === "1";
const SYNC_DELAY = Math.max(500, Number(process.env.SYNC_DELAY || 3000));
const DRY_RUN = process.env.DRY_RUN === "1";
const STATION_CACHE = "/tmp/gachi-stations.json";
const KANTO_BBOX = "35.35,139.20,36.15,140.35";

/**
 * 6 组轮换方案：覆盖东京都内空白/薄弱区 + 关东热门ガチ中華区 + 细分菜系
 * 每组约 5 区域 × 5 关键词 = 25 次 textsearch，每周跑 1 组每月仅消耗 ~100 次（上限 4500）
 */
const ROTATIONS = [
  {
    name: "东京都心补盲（品川/蒲田/目黒/渋谷/港）",
    areas: ["品川区", "大田区 蒲田", "目黒区", "渋谷区", "港区"],
    keywords: ["広東料理", "四川料理", "湖南料理", "本格中華", "ガチ中華"],
  },
  {
    name: "东东京华人大区（錦糸町/亀戸/小岩/新小岩/葛西）",
    areas: ["錦糸町", "亀戸", "小岩", "新小岩", "葛西"],
    keywords: ["中国東北料理", "四川料理", "麻辣湯", "中国火鍋", "ガチ中華"],
  },
  {
    name: "北东京 & 埼玉（板橋/赤羽/北千住/西川口/蕨）",
    areas: ["板橋区", "赤羽", "北千住", "西川口", "蕨"],
    keywords: ["中国東北料理", "四川料理", "新疆料理", "蘭州牛肉麺", "ガチ中華"],
  },
  {
    name: "神奈川 & 千葉（横浜中華街/関内/川崎/船橋/西船橋）",
    areas: ["横浜中華街", "関内", "川崎", "船橋", "西船橋"],
    keywords: ["広東料理", "福建料理", "四川料理", "飲茶", "ガチ中華"],
  },
  {
    name: "核心商圈细分菜系（池袋/新宿/高田馬場/大久保/上野）",
    areas: ["池袋", "新宿", "高田馬場", "大久保", "上野"],
    keywords: ["福建料理", "雲南料理", "茶餐廳", "烤魚", "上海料理", "螺螄粉"],
  },
  {
    name: "西东京 & 文教区补盲（中野/杉並/世田谷/練馬/文京）",
    areas: ["中野区", "杉並区", "世田谷区", "練馬区", "文京区"],
    keywords: ["四川料理", "広東料理", "中国東北料理", "蘭州牛肉麺", "本格中華"],
  },
  {
    name: "中华早餐 / 熟食卤味 / 中华物产店（池袋/上野/高田馬場/新大久保/西川口/横浜）",
    areas: ["池袋", "上野", "高田馬場", "新大久保", "西川口", "新小岩", "横浜中華街"],
    keywords: ["中華朝食", "豆漿 油条", "中華物産店", "滷味 鴨脖", "中華惣菜"],
  },
];

// ─── 工具函数 ───────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitEnvList(raw) {
  if (!raw) return [];
  return raw
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 计算当前 ISO 周数，用于按周稳定轮换区域组 */
function getIsoWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function isQuotaError(message) {
  return typeof message === "string" && (message.includes("额度已用完") || message.includes("免费额度"));
}

function resolvePlan() {
  const customAreas = splitEnvList(process.env.AREAS);
  const customKeywords = splitEnvList(process.env.KEYWORDS);

  const rawIdx = process.env.ROTATION_INDEX;
  const idx =
    rawIdx !== undefined && rawIdx !== "" && Number.isFinite(Number(rawIdx))
      ? ((Math.floor(Number(rawIdx)) % ROTATIONS.length) + ROTATIONS.length) % ROTATIONS.length
      : getIsoWeekNumber() % ROTATIONS.length;

  const base = ROTATIONS[idx];
  return {
    label: customAreas.length || customKeywords.length ? `自定义（基准组 #${idx}）` : `轮换组 #${idx}: ${base.name}`,
    areas: customAreas.length ? customAreas : base.areas,
    keywords: customKeywords.length ? customKeywords : base.keywords,
  };
}

// ─── 离线车站匹配（OSM Overpass，免费不计费） ────────────────────────────────

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function loadKantoStations() {
  try {
    // 优先使用随仓库内置的关东 1552 个车站静态表，0ms 离线计算、不依赖公共 Overpass 节点
    if (existsSync(BUNDLED_STATIONS_FILE)) {
      const compact = JSON.parse(readFileSync(BUNDLED_STATIONS_FILE, "utf8"));
      return compact.map(([name, zh, lat, lng]) => ({ name, zh, lat, lng }));
    }
    if (existsSync(STATION_CACHE)) {
      const cached = JSON.parse(readFileSync(STATION_CACHE, "utf8"));
      return extractStations(cached);
    }
    log("正在从 OpenStreetMap 拉取关东车站坐标（用于免费计算最近车站）...");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "User-Agent": "GachiChukaNavi/1.0 (auto-discover station lookup)" },
      body: new URLSearchParams({
        data: `[out:json][timeout:25];node["railway"="station"]["name"](${KANTO_BBOX});out body;`,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const json = await res.json();
    try {
      writeFileSync(STATION_CACHE, JSON.stringify(json));
    } catch {
      // 缓存写失败不影响主流程
    }
    return extractStations(json);
  } catch (error) {
    log(`⚠️ 车站数据加载失败，跳过最近车站补全（不影响新店入库）: ${error.message}`);
    return [];
  }
}

function extractStations(raw) {
  const elements = Array.isArray(raw?.elements) ? raw.elements : [];
  return elements
    .filter((e) => e.tags?.name && Number.isFinite(e.lat) && Number.isFinite(e.lon))
    .map((e) => ({
      name: e.tags.name,
      zh: e.tags["name:zh"] || null,
      lat: e.lat,
      lng: e.lon,
    }));
}

function findNearestStation(stations, lat, lng) {
  if (!stations.length || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best = null;
  let bestDist = Infinity;
  for (const s of stations) {
    if (Math.abs(s.lat - lat) > 0.03 || Math.abs(s.lng - lng) > 0.04) continue;
    const d = haversine({ lat, lng }, s);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  if (!best || bestDist > 3000) return null;
  return {
    nearest_station: best.name,
    nearest_station_zh: best.zh,
    station_distance_m: Math.round(bestDist),
  };
}

// ─── 线上 Admin API 调用 ────────────────────────────────────────────────────

async function searchAreaCandidates(area, keywords) {
  const res = await fetch(`${SYNC_API_BASE}/api/admin/collect/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_SECRET}`,
    },
    body: JSON.stringify({
      areas: [area],
      keywords,
      minRating: MIN_RATING,
      minReviews: MIN_REVIEWS,
      requireTokyo: REQUIRE_TOKYO,
      requireKanto: true,
      limit: 120,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Search HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function syncNewRestaurant(placeId) {
  const res = await fetch(`${SYNC_API_BASE}/api/admin/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_SECRET}`,
    },
    body: JSON.stringify({
      place_id: placeId,
      auto_filter: true,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sync HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function patchStation(placeId, station) {
  const res = await fetch(`${SYNC_API_BASE}/api/admin/restaurants/${encodeURIComponent(placeId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_SECRET}`,
    },
    body: JSON.stringify(station),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH station HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

// ─── GitHub Actions 摘要输出 ────────────────────────────────────────────────

function writeSummary(plan, stats, records) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;

  const lines = [
    `## 🍜 自动发现新餐厅报告`,
    ``,
    `- **执行方案**：${plan.label}`,
    `- **区域**：${plan.areas.join("、")}`,
    `- **关键词**：${plan.keywords.join("、")}`,
    `- **筛选门槛**：评分 ≥ ${MIN_RATING}，评论数 ≥ ${MIN_REVIEWS}，单次上限 ${MAX_NEW} 家${DRY_RUN ? "（DRY-RUN 试跑）" : ""}`,
    `- **候选去重结果**：共发现 ${stats.totalCandidates} 家合格候选，其中全新 **${stats.newCandidates}** 家`,
    `- **入库统计**：自动上架 **${stats.published}** 家 | 自动隐藏待审（日式/歇业/未知） **${stats.hidden}** 家 | 失败 **${stats.failed}** 家`,
    ``,
  ];

  if (records.length > 0) {
    lines.push(`| 状态 | 中文名 / 原名 | 菜系 | 正宗度 | 评分 | 最近车站 |`);
    lines.push(`| --- | --- | --- | --- | ---: | --- |`);
    for (const r of records) {
      const displayName = r.nameZh && r.nameZh !== r.name ? `${r.nameZh}（${r.name}）` : r.name;
      lines.push(
        `| ${r.status} | ${displayName.replace(/\|/g, "\\|")} | ${r.cuisine || "-"} | ${r.authenticity || "-"} | ${r.rating ?? "-"} | ${r.station || "-"} |`
      );
    }
    lines.push(``);
  }

  appendFileSync(summaryFile, lines.join("\n"), "utf8");
}

// ─── 主流程 ─────────────────────────────────────────────────────────────────

async function main() {
  if (!ADMIN_SECRET) {
    throw new Error("缺少环境变量 ADMIN_SECRET");
  }

  const plan = resolvePlan();
  log(`=== 自动发现新餐厅开始 ===`);
  log(`目标站点: ${SYNC_API_BASE}`);
  log(`执行方案: ${plan.label}`);
  log(`区域(${plan.areas.length}): ${plan.areas.join(", ")}`);
  log(`关键词(${plan.keywords.length}): ${plan.keywords.join(", ")}`);
  log(`门槛: rating>=${MIN_RATING}, reviews>=${MIN_REVIEWS}, maxNew=${MAX_NEW}, dryRun=${DRY_RUN}`);

  // 1. 分区域搜索并汇总去重（每个 area 单独调一次，避免 Worker 单次请求超时）
  const candidateMap = new Map();
  let quotaExhausted = false;

  for (const area of plan.areas) {
    try {
      log(`搜索区域「${area}」(${plan.keywords.length} 个关键词)...`);
      const payload = await searchAreaCandidates(area, plan.keywords);
      const items = Array.isArray(payload.data) ? payload.data : [];
      const errors = Array.isArray(payload.errors) ? payload.errors : [];

      for (const item of items) {
        const prev = candidateMap.get(item.placeId);
        if (prev) {
          prev.existing = prev.existing || item.existing;
          for (const s of item.sources || []) {
            if (!prev.sources.includes(s)) prev.sources.push(s);
          }
        } else {
          candidateMap.set(item.placeId, { ...item, sources: [...(item.sources || [])] });
        }
      }

      const freshInArea = items.filter((i) => !i.existing).length;
      log(`  -> 返回 ${items.length} 家候选，其中新店 ${freshInArea} 家`);

      if (errors.some(isQuotaError)) {
        log("⚠️ 搜索阶段触发本月配额上限，停止继续搜索，优先处理已找到的候选。");
        quotaExhausted = true;
        break;
      }
      if (errors.length > 0) {
        log(`  ⚠️ 部分查询有告警: ${errors.slice(0, 3).join(" | ")}`);
      }
    } catch (error) {
      log(`  ✗ 区域「${area}」搜索失败: ${error.message}`);
      if (isQuotaError(error.message)) {
        quotaExhausted = true;
        break;
      }
    }
    await sleep(500);
  }

  const allCandidates = [...candidateMap.values()];
  const newCandidates = allCandidates
    .filter((c) => !c.existing)
    .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);

  log(`\n搜索汇总: 合格候选 ${allCandidates.length} 家，排除已有后剩全新 ${newCandidates.length} 家`);

  const toSync = newCandidates.slice(0, MAX_NEW);
  const stats = {
    totalCandidates: allCandidates.length,
    newCandidates: newCandidates.length,
    published: 0,
    hidden: 0,
    failed: 0,
  };
  const records = [];

  if (toSync.length === 0) {
    log("本次没有发现符合门槛的新餐厅，结束。");
    writeSummary(plan, stats, records);
    return;
  }

  log(`\n将处理 Top ${toSync.length} 家新餐厅:`);
  toSync.forEach((c, i) => {
    log(`  ${i + 1}. ${c.name} | ★${c.rating} (${c.reviewCount}) | ${c.address} | [${c.sources.join(", ")}]`);
  });

  if (DRY_RUN) {
    log("\n[DRY-RUN] 试跑完成，未写入数据库。");
    for (const c of toSync) {
      records.push({
        status: "👀 试跑预览",
        name: c.name,
        nameZh: "",
        cuisine: "-",
        authenticity: "-",
        rating: c.rating,
        station: "-",
      });
    }
    writeSummary(plan, stats, records);
    return;
  }

  // 2. 预加载关东车站坐标（免费离线匹配最近车站）
  const stations = await loadKantoStations();
  if (stations.length > 0) {
    log(`已加载 ${stations.length} 个关东车站坐标。`);
  }

  // 3. 逐家调用线上 /api/admin/sync（带自动过滤）并补齐最近车站
  for (let i = 0; i < toSync.length; i++) {
    const c = toSync[i];
    const prefix = `[${i + 1}/${toSync.length}]`;
    const start = Date.now();

    try {
      const result = await syncNewRestaurant(c.placeId);
      const canonicalId = result.place_id || c.placeId;
      const cuisineObj = typeof result.cuisine === "object" && result.cuisine ? result.cuisine : null;
      const isPublished = result.is_active === 1;

      if (isPublished) stats.published++;
      else stats.hidden++;

      // 补齐最近车站
      let stationLabel = "-";
      const nearest = findNearestStation(stations, result.lat, result.lng);
      if (nearest) {
        try {
          await patchStation(canonicalId, nearest);
          const mins = Math.max(1, Math.ceil(nearest.station_distance_m / 80));
          stationLabel = `${nearest.nearest_station}（步行${mins}分）`;
        } catch (stErr) {
          log(`  ⚠️ 最近车站写入失败（不影响入库）: ${stErr.message}`);
        }
      }

      const statusIcon = result.permanently_closed
        ? "⛔ 已歇业(隐藏)"
        : isPublished
          ? "✅ 已上架"
          : "🕶️ 已隐藏待审";

      log(
        `${prefix} ${statusIcon} ${result.name_zh || result.restaurant} | ` +
          `${cuisineObj?.cuisine_type || "-"}/${cuisineObj?.authenticity || "-"} | ` +
          `评分=${result.trusted_rating} | 车站=${stationLabel} (${((Date.now() - start) / 1000).toFixed(1)}s)`
      );

      records.push({
        status: statusIcon,
        name: result.restaurant || c.name,
        nameZh: result.name_zh || "",
        cuisine: cuisineObj?.cuisine_type || "-",
        authenticity: cuisineObj?.authenticity || "-",
        rating: typeof result.trusted_rating === "number" ? result.trusted_rating.toFixed(2) : c.rating,
        station: stationLabel,
      });
    } catch (error) {
      stats.failed++;
      log(`${prefix} ✗ ${c.name} 入库失败: ${error.message}`);
      records.push({
        status: "❌ 失败",
        name: c.name,
        nameZh: "",
        cuisine: "-",
        authenticity: "-",
        rating: c.rating,
        station: error.message.slice(0, 60),
      });

      if (isQuotaError(error.message)) {
        log("⚠️ 同步阶段触发本月配额上限，立即优雅停止。");
        quotaExhausted = true;
        break;
      }
    }

    if (i < toSync.length - 1) {
      await sleep(SYNC_DELAY);
    }
  }

  log(
    `\n=== 自动发现完成 === 新上架 ${stats.published} 家 | 自动隐藏 ${stats.hidden} 家 | 失败 ${stats.failed} 家` +
      (quotaExhausted ? "（因触及月度配额保护提前停止）" : "")
  );
  writeSummary(plan, stats, records);

  // 如果全部失败且不是配额熔断，返回非 0 以便 GitHub Actions 发告警
  if (stats.published === 0 && stats.hidden === 0 && stats.failed > 0 && !quotaExhausted) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
