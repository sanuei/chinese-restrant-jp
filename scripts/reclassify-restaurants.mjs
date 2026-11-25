/**
 * 离线复核并修复餐厅的「正宗度 / 菜系 / 品类」分类。
 *
 * 目标：
 *   1. 复核所有 authenticity 为 japanese / unknown 的在架餐厅（纠正早期 AI 把重庆火锅、老火锅、麻辣烫误判成日式中华的问题）
 *   2. 复核所有 cuisine_type='other' 或 dish_type='other' 但店名/摘要含明显业态词的在架餐厅
 *
 * 全程只读数据库已有字段 + 调用 DeepSeek（10 家一批），不调用任何 Google Maps API（0 地图费用）。
 *
 * 用法：
 *   node scripts/reclassify-restaurants.mjs           # 只生成 SQL 预览
 *   APPLY=1 node scripts/reclassify-restaurants.mjs   # 生成并写入远程 D1
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// 零外部依赖加载 .env.local
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

const DB = "gachi-chukanavi-db";
const OUT = "db/migrations/0008_reclassify_restaurants.generated.sql";
const APPLY = process.env.APPLY === "1";
const BATCH = 10;
const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_BASE = (process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com").replace(/\/+$/, "");
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";

const CUISINES = ["sichuan", "cantonese", "northern", "fujian", "hunan", "jiangsu", "northwest", "yunnan", "other"];
const DISHES = ["hotpot", "bbq", "noodles", "malatang", "dumpling", "riceNoodle", "grilledFish", "dimsum", "deli", "grocery", "other"];
const AUTHS = ["authentic", "adapted", "japanese", "unknown"];

// 如果 dish_type='other' 但店名或摘要出现这些词，说明大概率有更精确的业态分类
const DISH_HINT_RE = /火锅|火鍋|涮|麻辣烫|麻辣湯|マーラータン|冒菜|串串|烧烤|焼烤|烤肉|羊肉串|烤鱼|烤魚|饺|餃|小笼包|小籠包|包子|生煎|拉面|拉麺|麺|面馆|麺館|牛肉面|牛肉麺|担々|担担|米线|米線|米粉|螺蛳粉|螺螄粉|点心|點心|饮茶|飲茶|茶餐厅|茶餐廳/;

const sq = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

function d1(sql) {
  const out = execFileSync(
    process.execPath,
    ["./node_modules/wrangler/bin/wrangler.js", "d1", "execute", DB, "--remote", "--command", sql, "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out.slice(out.indexOf("[")))[0].results || [];
}

const SYSTEM = `你是「ガチ中華ナビ」的餐厅分类复核专家，极其熟悉在日华人餐饮语境、中国各大菜系、以及「正宗中华 / 改良中华 / 日式中华」的区别。

请根据每家餐厅的店名、地址、现有摘要与评论线索，准确给出它的：
1. cuisine_type（菜系，只能是）：sichuan(川菜/重庆), cantonese(粤菜/港式), northern(东北/北方/京津/鲁), fujian(闽菜), hunan(湘菜), jiangsu(江浙/上海), northwest(新疆/兰州/陕西/西安), yunnan(云南/贵州/广西), other(实在无法归入单一地域)
2. dish_type（品类/业态，只能是）：hotpot(火锅/涮锅), bbq(烧烤/烤串/羊肉串), noodles(拉面/刀削面/兰州牛肉面/本帮面/拌面为主), malatang(麻辣烫/冒菜/串串香麻辣烫), dumpling(饺子/水饺/生煎/包子为主), riceNoodle(米线/米粉/螺蛳粉为主), grilledFish(烤鱼为主), dimsum(点心/饮茶/小笼包专门店/港式茶餐厅), other(综合炒菜/正餐馆)
3. authenticity（正宗度，只能是）：authentic(正宗中国味), adapted(改良中国味), japanese(日式中华/町中華/日式拉面/日式饺子居酒屋), unknown(实在无法判断)
4. authenticity_score（0-100整数）：authentic 通常 75-95，adapted 通常 50-74，japanese 通常 15-45。

重要纠偏规则：
- 重庆火锅、四川老火锅、麻辣烫、冒菜、东北菜、湘菜、兰州牛肉面、新疆料理、粤式饮茶等中式专门店，只要面向华人或做正宗中国味，**绝不能**误判成 japanese（即使店名含片假名或开在繁华商圈，如「楼上重庆火锅」「熊猫火锅」「老妈麻辣汤」「久久老火锅」都是 authentic 或 adapted，不是 japanese）。
- 只有日本本地化的町中華（如日式ラーメン・チャーハン・焼き餃子・天津飯、连锁日式饺子居酒屋如「餃子のかっちゃん」「餃子壱兆」）才判 japanese 或 adapted。
- 严格区分 dish_type：店名或主打是饺子/小笼包/水饺/烧卖的优先归 dumpling 或 dimsum；主打麻辣烫/冒菜归 malatang；主打火锅归 hotpot；主打面食归 noodles；主打烧烤/串归 bbq；不要偷懒全部塞进 other。

严格返回 JSON 数组（按输入 index 一一对应），不要 markdown，不要解释：
[{"index":0,"cuisine_type":"...","dish_type":"...","authenticity":"...","authenticity_score":80}, ...]`;

async function askDeepSeek(items) {
  if (!API_KEY) throw new Error("缺少 DEEPSEEK_API_KEY");
  const user = items
    .map(
      (r, i) =>
        `[${i}] 店名: ${r.name_original} | 中文名: ${r.name_zh || "-"}\n` +
        `    当前分类: cuisine=${r.cuisine_type}, dish=${r.dish_type}, auth=${r.authenticity}(${r.authenticity_score})\n` +
        `    摘要: ${r.ai_summary_zh || "-"} | 理由: ${r.authenticity_reason_zh || "-"}`
    )
    .join("\n");

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      thinking: { type: "disabled" },
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  let c = String(data.choices?.[0]?.message?.content || "").trim();
  const fence = c.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) c = fence[1].trim();
  const a = c.indexOf("[");
  const b = c.lastIndexOf("]");
  return JSON.parse(a >= 0 ? c.slice(a, b + 1) : c);
}

const allActive = d1(`
  SELECT id, name_original, name_zh, cuisine_type, dish_type, authenticity, authenticity_score,
         ai_summary_zh, authenticity_reason_zh
  FROM restaurants
  WHERE is_active = 1
`);

const targets = allActive.filter((r) => {
  if (r.authenticity === "japanese" || r.authenticity === "unknown") return true;
  if (r.cuisine_type === "other") return true;
  if (r.dish_type === "other") {
    const text = `${r.name_original || ""} ${r.name_zh || ""} ${r.ai_summary_zh || ""}`;
    if (DISH_HINT_RE.test(text)) return true;
  }
  return false;
});

console.log(`[reclassify] 在架总数 ${allActive.length}，待复核 ${targets.length} 家`);

const sqlLines = [];
const changes = [];

for (let i = 0; i < targets.length; i += BATCH) {
  const batch = targets.slice(i, i + BATCH);
  process.stdout.write(`[reclassify] 批次 ${Math.floor(i / BATCH) + 1}/${Math.ceil(targets.length / BATCH)} (${batch.length} 家)... `);
  const results = await askDeepSeek(batch);
  let batchChanged = 0;

  for (const item of results) {
    const orig = batch[item.index];
    if (!orig) continue;
    const cuisine = CUISINES.includes(item.cuisine_type) ? item.cuisine_type : orig.cuisine_type;
    const dish = DISHES.includes(item.dish_type) ? item.dish_type : orig.dish_type;
    const auth = AUTHS.includes(item.authenticity) ? item.authenticity : orig.authenticity;
    const score = Number.isFinite(Number(item.authenticity_score))
      ? Math.max(0, Math.min(100, Math.round(Number(item.authenticity_score))))
      : orig.authenticity_score;

    if (cuisine !== orig.cuisine_type || dish !== orig.dish_type || auth !== orig.authenticity) {
      batchChanged++;
      changes.push({
        name: orig.name_zh || orig.name_original,
        before: `${orig.cuisine_type}/${orig.dish_type}/${orig.authenticity}`,
        after: `${cuisine}/${dish}/${auth}`,
      });
      sqlLines.push(
        `UPDATE restaurants SET cuisine_type=${sq(cuisine)}, dish_type=${sq(dish)}, authenticity=${sq(auth)}, authenticity_score=${score}, updated_at=datetime('now') WHERE id=${sq(orig.id)};`
      );
    }
  }
  console.log(`变更 ${batchChanged} 家`);
}

writeFileSync(OUT, sqlLines.join("\n") + (sqlLines.length ? "\n" : ""), "utf8");
console.log(`\n[reclassify] 共生成 ${sqlLines.length} 条更新 -> ${OUT}`);
for (const c of changes) {
  console.log(`  - ${c.name}: ${c.before}  ==>  ${c.after}`);
}

if (APPLY && sqlLines.length > 0) {
  console.log(`\n[reclassify] 正在写入远程 D1...`);
  execFileSync(
    process.execPath,
    ["./node_modules/wrangler/bin/wrangler.js", "d1", "execute", DB, "--remote", "--yes", "--file", OUT],
    { stdio: "inherit" }
  );
  console.log(`[reclassify] ✓ 已写入远程 D1`);
}
