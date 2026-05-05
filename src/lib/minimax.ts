/**
 * MiniMax AI API 封装
 * 用于评论可信度分析、菜系分类和摘要生成
 */

const API_KEY = process.env.MINIMAX_API_KEY;
const API_BASE = process.env.MINIMAX_API_BASE || "https://api.minimax.chat/v1";
const MODEL = "MiniMax-M2.7-highspeed"; // 使用最新支持的模型

interface MiniMaxMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callMiniMax<T = unknown>(messages: MiniMaxMessage[], temperature: number = 0.1): Promise<T> {
  const response = await fetch(`${API_BASE}/text/chatcompletion_v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      top_p: 0.95,
      max_tokens: 4096,
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`MiniMax API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0]) {
    throw new Error(`MiniMax API unexpected response: ${JSON.stringify(data)}`);
  }
  
  let content = String(data.choices[0].message.content || "").trim();
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
        // Fall through to the detailed error below.
      }
    }

    console.error("Failed to parse JSON:", content);
    throw new Error("MiniMax response was not valid JSON");
  }
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

  return callMiniMax<ReviewCredibilityResult[]>([
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
1. 判断菜系。
2. 判断正宗度。
3. 生成中文和日文短摘要。
4. 判断每条 Google 评论的可信度。

菜系 cuisine_type 只能是以下之一：
sichuan(川菜), cantonese(粤菜), northern(北方菜), fujian(闽菜), hunan(湘菜), jiangsu(苏浙菜), northwest(西北菜), yunnan(云贵菜), other(综合/其他)。

正宗度 authenticity 只能是：
authentic(正宗中国味), adapted(改良中国味), japanese(日式中华), unknown(无法确定)。

评论可信度 action 只能是 keep、flag、remove。
评论如果空泛、刷评感强、只有情绪化赞美或攻击，降低可信度；如果提到具体菜品、口味、排队、服务、价格、环境，或优缺点并存，提高可信度。

返回严格 JSON，不要 markdown，不要解释。格式：
{
  "cuisine_type": "...",
  "cuisine_confidence": 0-100,
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

  return callMiniMax<RestaurantAiAnalysisResult>([
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
  return callMiniMax([
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
  
  return callMiniMax([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 0.3); // 略微提高温度让语言更自然
}
