/**
 * 修复 AI 分析失败被写成占位值的餐厅。
 *
 * 起因：批量刷新时 MiniMax 有 35 家调用失败，而当时的代码把
 * normalizeAiAnalysis(null) 的占位结果当成正常分析写回了数据库，
 * 把原本正确的菜系/品类/正宗度/摘要全抹成了 other / unknown / 「暂无摘要」。
 *
 * 这个脚本只读数据库里已有的评论重新跑一次 AI，
 * 不调用任何 Google 接口，不消耗地图配额。
 *
 * 用法：
 *   node scripts/repair-ai-analysis.mjs           # 只生成 SQL
 *   APPLY=1 node scripts/repair-ai-analysis.mjs   # 生成并写库
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const DB = "gachi-chukanavi-db";
const OUT = "db/migrations/0007_repair_ai_analysis.generated.sql";
const APPLY = process.env.APPLY === "1";
const API_KEY = process.env.MINIMAX_API_KEY;
const API_BASE = process.env.MINIMAX_API_BASE || "https://api.minimax.chat/v1";

const CUISINES = ["sichuan","cantonese","northern","fujian","hunan","jiangsu","northwest","yunnan","other"];
const DISHES = ["hotpot","bbq","noodles","malatang","dumpling","riceNoodle","grilledFish","dimsum","other"];
const AUTHS = ["authentic","adapted","japanese","unknown"];

const sq = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const clamp = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d;
};

function d1(sql) {
  const out = execFileSync("npx", ["wrangler","d1","execute",DB,"--remote","--command",sql,"--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

const SYSTEM = `你是「ガチ中華ナビ」的餐厅数据分析专家，熟悉中国各地菜系、日本中華和在日华人餐饮语境。

根据餐厅信息和 Google 评论，判断：菜系、品类（经营业态）、正宗度，并写中日双语短摘要。

菜系 cuisine_type 只能是：${CUISINES.join(", ")}
品类 dish_type 只能是：${DISHES.join(", ")}（看店名和菜品结构：带火锅/涮判 hotpot，烧烤/串判 bbq，面食为主判 noodles，麻辣烫冒菜判 malatang，饺子包子判 dumpling，米线米粉判 riceNoodle，烤鱼判 grilledFish，点心茶餐厅判 dimsum，综合中餐判 other）
正宗度 authenticity 只能是：${AUTHS.join(", ")}

严格返回 JSON，不要 markdown：
{"cuisine_type":"...","cuisine_confidence":0-100,"dish_type":"...","authenticity":"...","authenticity_score":0-100,"authenticity_reason_zh":"中文理由1-2句","authenticity_reason_ja":"日本語理由1-2文","ai_summary_zh":"中文综合印象30字内","ai_summary_ja":"日本語の総評40字内"}`;

async function analyze(r, reviews) {
  const reviewText = reviews.length
    ? reviews.map((v, i) => `[${i}] ★${v.rating} ${v.text}`).join("\n---\n")
    : "暂无评论正文。";
  const res = await fetch(`${API_BASE}/text/chatcompletion_v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: "MiniMax-M3",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `餐厅名: ${r.name_original}\n中文名: ${r.name_zh || "-"}\n地址: ${r.address}\nGoogle评分: ${r.raw_rating}\n评论数: ${r.raw_review_count}\n评论:\n${reviewText}` },
      ],
      temperature: 0.2, max_tokens: 2048, thinking: { type: "disabled" },
    }),
  });
  if (!res.ok) throw new Error(`MiniMax ${res.status}`);
  const data = await res.json();
  let c = String(data.choices?.[0]?.message?.content || "").trim();
  const fence = c.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) c = fence[1].trim();
  const a = c.indexOf("{"), b = c.lastIndexOf("}");
  return JSON.parse(a >= 0 ? c.slice(a, b + 1) : c);
}

const broken = d1(`SELECT id, name_original, name_zh, address, raw_rating, raw_review_count
  FROM restaurants WHERE is_active=1 AND (ai_summary_zh='暂无摘要' OR authenticity_reason_zh='分析失败')`);
console.log(`[repair] 待修复 ${broken.length} 家`);

const lines = [];
for (let i = 0; i < broken.length; i++) {
  const r = broken[i];
  process.stdout.write(`[repair] ${i + 1}/${broken.length} ${r.name_original.slice(0, 20)} … `);
  try {
    const reviews = d1(`SELECT rating, text FROM reviews WHERE restaurant_id='${r.id.replace(/'/g, "''")}' AND text IS NOT NULL AND text != '' LIMIT 5`);
    const a = await analyze(r, reviews);
    const cuisine = CUISINES.includes(a.cuisine_type) ? a.cuisine_type : "other";
    const dish = DISHES.includes(a.dish_type) ? a.dish_type : "other";
    const auth = AUTHS.includes(a.authenticity) ? a.authenticity : "unknown";
    lines.push(
      `UPDATE restaurants SET cuisine_type=${sq(cuisine)}, cuisine_confidence=${clamp(a.cuisine_confidence)}, ` +
      `dish_type=${sq(dish)}, authenticity=${sq(auth)}, authenticity_score=${clamp(a.authenticity_score)}, ` +
      `authenticity_reason_zh=${sq(a.authenticity_reason_zh)}, authenticity_reason_ja=${sq(a.authenticity_reason_ja)}, ` +
      `ai_summary_zh=${sq(a.ai_summary_zh)}, ai_summary_ja=${sq(a.ai_summary_ja)} WHERE id=${sq(r.id)};`
    );
    console.log(`${cuisine}/${dish}/${auth}`);
  } catch (e) {
    console.log(`失败: ${e.message}`);
  }
}

writeFileSync(OUT, lines.join("\n") + "\n");
console.log(`\n[repair] 生成 ${lines.length}/${broken.length} 条 -> ${OUT}`);
if (APPLY && lines.length) {
  execFileSync("npx", ["wrangler","d1","execute",DB,"--remote","--file",OUT], { stdio: "inherit" });
}
