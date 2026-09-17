/**
 * 给缺中文名的餐厅补上中文店名。
 *
 * 背景：站点主打在日华人，但 96% 的店只有日文原名（広東料理 海港美食 这种），
 * 中文用户搜不到、记不住、没法转发给朋友，中文 SEO 也做不起来。
 *
 * 只用已有的店名/地址/摘要，不调用任何 Google 接口，不消耗地图配额。
 *
 * 用法：
 *   LIMIT=10 node scripts/fill-chinese-names.mjs      # 先小批量看质量
 *   node scripts/fill-chinese-names.mjs               # 全量
 *   APPLY=1 node scripts/fill-chinese-names.mjs       # 生成 SQL 后直接写库
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const DB = "gachi-chukanavi-db";
const OUT = "db/migrations/0006_chinese_names.generated.sql";
const BATCH = Number(process.env.BATCH || 15);
const LIMIT = Number(process.env.LIMIT || 0);
const APPLY = process.env.APPLY === "1";

const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_BASE = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";

const sq = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB, "--remote", "--command", sql, "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

const SYSTEM = `你在给一个面向在日华人的中餐厅导航站补中文店名。

给你若干家日本餐厅的信息，为每家给出一个中文店名。

规则（务必严格遵守）：
1. 原名里的日文汉字，直接转成对应的简体中文汉字。例：「広東料理 海港美食」→「广东料理 海港美食」，「餃包」→「饺包」，「麺館」→「面馆」。
2. 片假名或英文的品牌名，保留原样不要硬译。例：「MO-MO-PARADISE 新宿東口店」→「MO-MO-PARADISE 新宿东口店」。
3. 分店信息必须保留并转成简体。例：「上野店」→「上野店」，「新宿東口店」→「新宿东口店」。
4. 绝对不要创造与原名无关的名字，不要加原名里没有的词（比如原名没有「餐厅」就不要加）。
5. 如果原名本身已经是标准中文，原样返回。
6. 只做「让中文用户能读懂和搜索」这一件事，不做美化。

严格返回 JSON 数组，不要 markdown，不要解释：
[{"index": 0, "name_zh": "中文店名"}, ...]`;

async function askDeepSeek(items) {
  const user = items
    .map(
      (r, i) =>
        `[${i}] 原名: ${r.name_original}\n    地址: ${r.address || "-"}\n    菜系: ${r.cuisine_type || "-"}`
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
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  let content = String(data.choices?.[0]?.message?.content || "").trim();
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) content = fence[1].trim();
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  return JSON.parse(start >= 0 ? content.slice(start, end + 1) : content);
}

let rows = d1(
  `SELECT id, name_original, address, cuisine_type FROM restaurants
   WHERE is_active = 1 AND (name_zh IS NULL OR name_zh = '')
   ORDER BY trusted_rating DESC`
);
if (LIMIT) rows = rows.slice(0, LIMIT);
console.log(`[names] 待补中文名: ${rows.length} 家`);

const updates = [];
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  process.stdout.write(`[names] ${i + 1}-${i + chunk.length} / ${rows.length} … `);
  try {
    const result = await askDeepSeek(chunk);
    let ok = 0;
    for (const item of result) {
      const target = chunk[item.index];
      const nameZh = String(item.name_zh || "").trim();
      if (!target || !nameZh) continue;
      updates.push({ id: target.id, original: target.name_original, zh: nameZh });
      ok++;
    }
    console.log(`${ok} 条`);
  } catch (e) {
    console.log(`失败: ${e.message}`);
  }
}

console.log("\n=== 抽样检查 ===");
for (const u of updates.slice(0, 12)) {
  console.log(`  ${u.original.padEnd(30)} → ${u.zh}`);
}

const sql = updates
  .map((u) => `UPDATE restaurants SET name_zh=${sq(u.zh)} WHERE id=${sq(u.id)};`)
  .join("\n");
writeFileSync(OUT, sql + "\n");
console.log(`\n[names] 已生成 ${updates.length} 条 UPDATE -> ${OUT}`);

if (APPLY) {
  console.log("[names] 写入数据库…");
  execFileSync("npx", ["wrangler", "d1", "execute", DB, "--remote", "--file", OUT], {
    stdio: "inherit",
  });
}
