/**
 * 给每家餐厅算出最近车站，生成可直接执行的 SQL。
 *
 * 车站数据来自 OpenStreetMap 的 Overpass API：免费、不需要 key、不计费。
 * 刻意不用 Google 的地点/距离接口 —— 那些按次计费，而这件事完全可以离线算。
 *
 * 用法：
 *   node scripts/assign-stations.mjs                 # 生成 SQL
 *   npx wrangler d1 execute <db> --remote --file=... # 再执行
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BBOX = "35.35,139.20,36.15,140.35"; // 关东主要范围
const CACHE = "/tmp/gachi-stations.json";
const OUT = "db/migrations/0005_assign_stations.generated.sql";
const DB = "gachi-chukanavi-db";

/** 日本不动产惯例：步行速度按 80m/分钟，不足一分钟算一分钟 */
const WALK_METERS_PER_MIN = 80;

async function loadStations() {
  if (existsSync(CACHE)) {
    console.log("[stations] 用本地缓存");
    return JSON.parse(readFileSync(CACHE, "utf8"));
  }
  console.log("[stations] 从 Overpass 拉取…");
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": "GachiChukaNavi/1.0 (station data import)" },
    body: new URLSearchParams({
      data: `[out:json][timeout:90];node["railway"="station"]["name"](${BBOX});out body;`,
    }),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = await res.json();
  writeFileSync(CACHE, JSON.stringify(json));
  return json;
}

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

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB, "--remote", "--command", sql, "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

const sq = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const stationsRaw = await loadStations();
const stations = stationsRaw.elements
  .filter((e) => e.tags?.name && Number.isFinite(e.lat) && Number.isFinite(e.lon))
  .map((e) => ({ name: e.tags.name, zh: e.tags["name:zh"] || null, lat: e.lat, lng: e.lon }));
console.log(`[stations] 可用车站 ${stations.length} 个`);

const restaurants = d1(
  "SELECT id, name_original, lat, lng FROM restaurants WHERE lat IS NOT NULL AND lng IS NOT NULL"
);
console.log(`[stations] 待处理餐厅 ${restaurants.length} 家`);

const lines = [];
let far = 0;
for (const r of restaurants) {
  let best = null;
  let bestD = Infinity;
  for (const s of stations) {
    // 先用便宜的矩形距离粗筛，省掉绝大多数 haversine
    if (Math.abs(s.lat - r.lat) > 0.03 || Math.abs(s.lng - r.lng) > 0.04) continue;
    const d = haversine(r, s);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (!best) {
    far++;
    continue;
  }
  lines.push(
    `UPDATE restaurants SET nearest_station=${sq(best.name)}, nearest_station_zh=${sq(best.zh)}, station_distance_m=${Math.round(bestD)} WHERE id=${sq(r.id)};`
  );
}

writeFileSync(OUT, lines.join("\n") + "\n");
console.log(`[stations] 已生成 ${lines.length} 条 UPDATE -> ${OUT}`);
if (far) console.log(`[stations] ${far} 家附近 3km 内没有车站，跳过`);

const dist = lines
  .map((l) => Number(l.match(/station_distance_m=(\d+)/)[1]))
  .sort((a, b) => a - b);
const q = (p) => dist[Math.floor(dist.length * p)];
console.log(`[stations] 步行距离 中位数 ${q(0.5)}m / P90 ${q(0.9)}m / 最远 ${dist[dist.length - 1]}m`);
console.log(`[stations] 换算步行 中位数 ${Math.ceil(q(0.5) / WALK_METERS_PER_MIN)} 分钟`);
