/**
 * DeepSeek AI API 封装（OpenAI 兼容的 /chat/completions）
 * 用于评论可信度分析、菜系分类和摘要生成。
 *
 * 换供应商注意（2026-09 从 MiniMax 切到 DeepSeek 时踩到的坑）：
 * deepseek-flash / deepseek-v4-pro 默认开思考模式，思考过程记在
 * message.reasoning_content 里，并且**和正文共享 max_tokens**。
 * 本站这种「一次判断菜系+品类+正宗度+双语摘要+多条评论可信度」的 prompt
 * 思考就能吃掉 400+ token，正文直接为空、finish_reason=length，
 * 表现为「返回了但内容是空的」。所以这里显式传 thinking:{type:"disabled"}，
 * 并且在正文为空时给出可诊断的报错，而不是让它伪装成 JSON 解析失败。
 */

import { consumeQuota } from "@/lib/google-quota";

const DEFAULT_API_BASE = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";

interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function getConfig() {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY,
    apiBase: (process.env.DEEPSEEK_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, ""),
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
  };
}

type ChatCompletion = {
  choices?: {
    message?: { content?: string | null; reasoning_content?: string | null };
    finish_reason?: string;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

async function requestCompletion(
  messages: DeepSeekMessage[],
  temperature: number,
  maxTokens: number
): Promise<ChatCompletion> {
  const { apiKey, apiBase, model } = getConfig();
  if (!apiKey) throw new Error("Missing DEEPSEEK_API_KEY");

  // AI 也要过闸门：DeepSeek 是余额制，被刷就是真金白银。
  // 计数放在真正发请求的地方（不是逻辑调用处），重试也会各算一次。
  if (!(await consumeQuota("ai"))) {
    throw new Error("AI 本月调用额度已用完，已自动停止调用以避免产生费用");
  }

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      top_p: 0.95,
      max_tokens: maxTokens,
      // 结构化分类/抽取任务不需要长链路推理，思考模式只会烧掉正文预算
      thinking: { type: "disabled" },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${err.slice(0, 500)}`);
  }

  return (await response.json()) as ChatCompletion;
}

async function callDeepSeek<T = unknown>(messages: DeepSeekMessage[], temperature: number = 0.1): Promise<T> {
  // 正文为空时不立刻判定失败：先加大预算重试一次（模型偶尔会无视 thinking:disabled），
  // 第二次仍为空才报错，报错里带上 reasoning token 数方便定位。
  const attempts = [4096, 8192];
  let lastDiagnostic = "";

  for (const maxTokens of attempts) {
    const data = await requestCompletion(messages, temperature, maxTokens);
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error(`DeepSeek API unexpected response: ${JSON.stringify(data).slice(0, 500)}`);
    }

    let content = String(choice.message?.content || "").trim();

    if (!content) {
      const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      const reasoning = String(choice.message?.reasoning_content || "");
      lastDiagnostic =
        `finish_reason=${choice.finish_reason} reasoning_tokens=${reasoningTokens} ` +
        `reasoning_len=${reasoning.length} completion_tokens=${data.usage?.completion_tokens ?? 0}`;
      continue;
    }

    // 提取 markdown 中的 JSON 块
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      content = jsonMatch[1].trim();
    } else {
      content = content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    }

    try {
      return JSON.parse(content) as T;
    } catch {
      const objectStart = content.indexOf("{");
      const objectEnd = content.lastIndexOf("}");
      const arrayStart = content.indexOf("[");
      const arrayEnd = content.lastIndexOf("]");
      const canExtractObject = objectStart >= 0 && objectEnd > objectStart;
      const canExtractArray = arrayStart >= 0 && arrayEnd > arrayStart;
      const extracted =
        canExtractObject && (!canExtractArray || objectStart < arrayStart)
          ? content.slice(objectStart, objectEnd + 1)
          : canExtractArray
            ? content.slice(arrayStart, arrayEnd + 1)
            : "";

      if (extracted) {
        try {
          return JSON.parse(extracted) as T;
        } catch {
          // 落到下面的详细报错
        }
      }

      console.error("Failed to parse JSON:", content);
      throw new Error(`DeepSeek response was not valid JSON (finish_reason=${choice.finish_reason})`);
    }
  }

  throw new Error(`DeepSeek 返回空正文（${lastDiagnostic}）`);
}

// 1. 批量评论可信度分析（一次 API 调用分析所有评论）
export interface ReviewCredibilityResult {
  credibility_score: number;
  credibility_action: "keep" | "flag" | "remove";
  credibility_reason: string;
}

export async function analyzeReviewsCredibilityBatch(
  reviews: { text: string; rating: number; author_name: string }[],
  restaurantName: string
): Promise<ReviewCredibilityResult[]> {
  const systemPrompt = `你是一个专业的餐厅评价打假与分析专家。
请分析以下关于餐厅「${restaurantName}」的多条评论，判断每条的真实可信度。
返回严格的 JSON 数组格式（一一对应）：
[
  {"credibility_score": 0-100整数, "credibility_action": "keep|flag|remove", "credibility_reason": "简短理由"},
  ...
]
判断标准：
- 过于空泛的溢美之词、情绪化攻击，降低分数。
- 提到具体菜品细节、有优点也有缺点的客观描述，提高分数。
- 日文和中文一视同仁。`;

  const userContent = reviews
    .map((r, i) => `[${i}] ${r.author_name} (★${r.rating}): ${r.text}`)
    .join('\n');

  return callDeepSeek<ReviewCredibilityResult[]>([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ]);
}

export interface RestaurantAiReviewResult extends ReviewCredibilityResult {
  index: number;
}

export interface RestaurantAiAnalysisResult {
  cuisine_type: "sichuan" | "cantonese" | "northern" | "fujian" | "hunan" | "jiangsu" | "northwest" | "yunnan" | "other";
  cuisine_confidence: number;
  dish_type: "hotpot" | "bbq" | "noodles" | "malatang" | "dumpling" | "riceNoodle" | "grilledFish" | "dimsum" | "other";
  authenticity: "authentic" | "adapted" | "japanese" | "unknown";
  authenticity_score: number;
  authenticity_reason_zh: string;
  authenticity_reason_ja: string;
  ai_summary_zh: string;
  ai_summary_ja: string;
  reviews: RestaurantAiReviewResult[];
}

export async function analyzeRestaurantSnapshot(input: {
  restaurantName: string;
  address: string;
  rating: number;
  reviewCount: number;
  priceLevel?: number | null;
  reviews: { text: string; rating: number; author_name: string; language?: string }[];
}): Promise<RestaurantAiAnalysisResult> {
  const systemPrompt = `你是“ガチ中華ナビ”的餐厅数据分析专家，熟悉中国各地菜系、日本中華、在日华人餐饮语境和虚假评论识别。

请把同一家餐厅的所有 AI 任务合并完成：
1. 判断菜系（地域风味）。
2. 判断品类（经营业态）。
3. 判断正宗度。
4. 生成中文和日文短摘要。
5. 判断每条 Google 评论的可信度。

菜系 cuisine_type 只能是以下之一：
sichuan(川菜), cantonese(粤菜), northern(北方菜), fujian(闽菜), hunan(湘菜), jiangsu(苏浙菜), northwest(西北菜), yunnan(云贵菜), other(综合/其他)。

品类 dish_type 是和菜系平行的另一个维度，描述这家店的经营业态/上菜形式，只能是以下之一：
hotpot(火锅), bbq(烧烤), noodles(拉面/面食为主), malatang(麻辣烫/冒菜), dumpling(饺子/包子为主), riceNoodle(米线/米粉为主), grilledFish(烤鱼), dimsum(点心/茶餐厅), other(综合正餐，不属于以上任何一种业态)。
判断依据主要看店名和菜品结构（例如店名带"火锅""合桌"、或评论反复提到锅底涮菜，判 hotpot；店名带"烧烤""烤肉""串"，判 bbq；主要卖拉面/刀削面/炸酱面等面食，判 noodles；卖麻辣烫、冒菜等自选称重小吃，判 malatang；主打水饺、生煎、包子，判 dumpling；主打云南/广西风味米线米粉，判 riceNoodle；主打烤鱼，判 grilledFish；粤式茶餐厅、点心为主，判 dimsum；普通中餐馆、菜品综合没有明显单一业态特征，判 other）。

正宗度 authenticity 只能是：
authentic(正宗中国味), adapted(改良中国味), japanese(日式中华), unknown(无法确定)。

评论可信度 action 只能是 keep、flag、remove。
评论如果空泛、刷评感强、只有情绪化赞美或攻击，降低可信度；如果提到具体菜品、口味、排队、服务、价格、环境，或优缺点并存，提高可信度。

返回严格 JSON，不要 markdown，不要解释。格式：
{
  "cuisine_type": "...",
  "cuisine_confidence": 0-100,
  "dish_type": "...",
  "authenticity": "...",
  "authenticity_score": 0-100,
  "authenticity_reason_zh": "中文理由，1-2句",
  "authenticity_reason_ja": "日本語理由、1-2文",
  "ai_summary_zh": "中文综合印象，30字以内",
  "ai_summary_ja": "日本語の総評、40字以内",
  "reviews": [
    {"index": 0, "credibility_score": 0-100, "credibility_action": "keep|flag|remove", "credibility_reason": "简短理由"}
  ]
}`;

  const reviewsText = input.reviews.length
    ? input.reviews
        .map((review, index) => {
          const language = review.language ? ` lang=${review.language}` : "";
          return `[${index}] ${review.author_name}${language} ★${review.rating}\n${review.text}`;
        })
        .join("\n---\n")
    : "暂无 Google 评论正文。";

  const userContent = `餐厅名: ${input.restaurantName}
地址: ${input.address}
Google评分: ${input.rating}
Google评论总数: ${input.reviewCount}
价格等级: ${input.priceLevel ?? "unknown"}
Google评论（最多5条）:
${reviewsText}`;

  return callDeepSeek<RestaurantAiAnalysisResult>([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ], 0.2);
}

// 2. 菜系分类与正宗度判断
export async function analyzeRestaurantCuisine(
  restaurantName: string, 
  reviewsText: string[]
) {
  const systemPrompt = `你是一个深入了解中国八大菜系与日本“日式中华”区别的美食专家。
请根据餐厅名和部分评论内容，分析该餐厅的菜系和正宗度。
菜系(cuisine_type)只能是以下之一: sichuan(川菜), cantonese(粤菜), northern(北方菜), fujian(闽菜), hunan(湘菜), jiangsu(苏浙菜), northwest(西北菜), yunnan(云贵菜), other(综合/其他)。
正宗度(authenticity)只能是以下之一: authentic(正宗中国味), adapted(改良中国味), japanese(日式中华), unknown(无法确定)。

返回严格的 JSON 格式：
{
  "cuisine_type": "...",
  "cuisine_confidence": 0-100整数,
  "authenticity": "...",
  "authenticity_score": 0-100整数,
  "authenticity_reason_zh": "中文理由(1-2句)",
  "authenticity_reason_ja": "日文理由(1-2句)"
}`;

  const userContent = `餐厅名: ${restaurantName}\n评论摘录:\n${reviewsText.join('\n---\n')}`;
  return callDeepSeek([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ]);
}

// 3. 双语摘要生成
export async function generateBilingualSummary(
  restaurantName: string, 
  reviewsText: string[],
  rating: number,
  authenticity: string
) {
  const systemPrompt = `你是一个专业的美食编辑。请根据提供的用户评论，为餐厅生成结构化的摘要（包含中文和日文版本）。
风格要求：客观、有参考价值，像一张“食评便条”。

返回严格的 JSON 格式：
{
  "zh": "中文综合印象（限制30字以内）",
  "ja": "日文综合印象（限制40字以内）"
}`;

  const userContent = `餐厅名: ${restaurantName}\n当前评分: ${rating}\n正宗度分类: ${authenticity}\n评论摘录:\n${reviewsText.join('\n---\n')}`;
  
  return callDeepSeek([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 0.3); // 略微提高温度让语言更自然
}
