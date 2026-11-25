#!/usr/bin/env node
/**
 * 批量采集在日华人生活专区门店（理发/中文医院/健身房/中医推拿/美容美甲/KTV棋牌/房产搬家/签证服务）
 *
 * 用法：
 *   node scripts/collect-life-places.mjs
 *   node scripts/collect-life-places.mjs --categories=hair,medical,fitness --per-category=8
 */
import fs from "node:fs";
import path from "node:path";

// 读取 .env.local 中的 ADMIN_SECRET 与 SYNC_API_BASE
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const API_BASE = (process.env.SYNC_API_BASE || "https://gachi.soniclab.cc").replace(/\/+$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("缺少 ADMIN_SECRET，请检查 .env.local");
  process.exit(1);
}

// 加载关东车站坐标用于自动匹配最近车站
const stationsRaw = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "scripts/kanto-stations.json"), "utf8")
);

function haversineMeters(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function findNearestStation(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best = null;
  for (const [nameJa, nameZh, sLat, sLng] of stationsRaw) {
    const dist = haversineMeters(lat, lng, sLat, sLng);
    if (!best || dist < best.distance) {
      best = { nameJa, nameZh: nameZh || null, distance: dist };
    }
  }
  return best && best.distance <= 2000 ? best : null;
}

// 8 大生活分类的高命中搜索配置
const CATEGORY_PLANS = {
  hair: {
    areas: ["池袋", "新宿", "高田馬場", "上野", "渋谷"],
    keywords: ["中国語対応 美容室", "中国人 美容室 ヘアサロン", "中国語 カット 美容院"],
    minRating: 3.7,
    minReviews: 3,
  },
  medical: {
    areas: ["池袋", "新宿", "高田馬場", "上野", "銀座", "渋谷"],
    keywords: ["中国語対応 クリニック", "中国語対応 歯科", "中国語対応 内科"],
    minRating: 3.5,
    minReviews: 5,
  },
  fitness: {
    areas: ["池袋", "新宿", "高田馬場", "渋谷", "上野", "六本木"],
    keywords: ["中国語 パーソナルジム", "中国語 フィットネス ジム", "中国語 ヨガ ピラティス"],
    minRating: 3.7,
    minReviews: 3,
  },
  massage: {
    areas: ["池袋", "新宿", "上野", "高田馬場", "新大久保"],
    keywords: ["中国整体 足つぼ", "中式推拿 マッサージ", "漢方 整体 中国語"],
    minRating: 3.9,
    minReviews: 8,
  },
  beauty: {
    areas: ["池袋", "新宿", "高田馬場", "渋谷", "銀座"],
    keywords: ["中国語対応 ネイルサロン", "中国語 マツエク", "中国語 エステ サロン"],
    minRating: 3.8,
    minReviews: 3,
  },
  entertainment: {
    areas: ["池袋", "新宿", "高田馬場", "上野"],
    keywords: ["中国語 カラオケ KTV", "中国 麻雀 雀荘", "中国語 ボードゲーム マーダーミステリー"],
    minRating: 3.6,
    minReviews: 3,
  },
  housing: {
    areas: ["池袋", "新宿", "高田馬場", "上野", "西川口"],
    keywords: ["中国語対応 不動産", "中国人向け 賃貸 不動産", "中国語 引越し"],
    minRating: 3.8,
    minReviews: 5,
  },
  services: {
    areas: ["池袋", "新宿", "高田馬場", "上野", "銀座"],
    keywords: ["中国語対応 行政書士 ビザ", "中国語 税理士", "中国語 法律事務所"],
    minRating: 3.8,
    minReviews: 3,
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  let categories = Object.keys(CATEGORY_PLANS);
  let perCategory = 8;

  for (const arg of args) {
    if (arg.startsWith("--categories=")) {
      categories = arg
        .slice("--categories=".length)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => Boolean(CATEGORY_PLANS[s]));
    } else if (arg.startsWith("--per-category=")) {
      const n = Number(arg.slice("--per-category=".length));
      if (Number.isFinite(n) && n > 0) perCategory = Math.min(20, Math.floor(n));
    }
  }
  return { categories, perCategory };
}

async function apiPost(endpoint, payload) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_SECRET}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${endpoint} HTTP ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const { categories, perCategory } = parseArgs();
  console.log(`开始采集生活专区门店 -> 目标分类: ${categories.join(", ")} | 每类目标入库上限: ${perCategory}`);

  const summary = {};

  for (const cat of categories) {
    const plan = CATEGORY_PLANS[cat];
    console.log(`\n========== [${cat}] 搜索候选 ==========`);
    let searchData;
    try {
      searchData = await apiPost("/api/admin/life/search", {
        areas: plan.areas,
        keywords: plan.keywords,
        minRating: plan.minRating,
        minReviews: plan.minReviews,
        limit: perCategory * 3,
      });
    } catch (err) {
      console.error(`[${cat}] 搜索失败:`, err.message);
      continue;
    }

    const fresh = (searchData.candidates || []).filter((c) => !c.existing);
    console.log(`[${cat}] 共搜到 ${searchData.candidates?.length || 0} 家，新候选 ${fresh.length} 家`);

    let added = 0;
    let filteredOut = 0;
    let failed = 0;

    for (const c of fresh) {
      if (added >= perCategory) break;
      const station = findNearestStation(c.lat, c.lng);
      try {
        const res = await apiPost("/api/admin/life/sync", {
          place_id: c.placeId,
          category: cat,
          auto_filter: true,
          nearest_station: station?.nameJa || null,
          nearest_station_zh: station?.nameZh || null,
          station_distance_m: station?.distance ?? null,
        });

        if (res.is_active === 1) {
          added += 1;
          console.log(
            `  [+${added}] ${res.name_zh} (${res.category} / ${res.chinese_support} / ★${res.rating}) ${
              station ? `@ ${station.nameJa} ${station.distance}m` : ""
            }`
          );
        } else {
          filteredOut += 1;
          console.log(`  [过滤] ${c.name} (非华人/中文服务或已歇业)`);
        }
      } catch (err) {
        failed += 1;
        console.error(`  [失败] ${c.name}: ${err.message}`);
      }
    }

    summary[cat] = { added, filteredOut, failed };
  }

  console.log("\n========== 生活专区采集完成汇总 ==========");
  console.table(summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
