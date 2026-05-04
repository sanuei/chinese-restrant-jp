/**
 * MiniMax AI API 封装
 * 用于评论可信度分析、菜系分类和摘要生成
 */

const API_KEY = process.env.MINIMAX_API_KEY;
const API_BASE = process.env.MINIMAX_API_BASE || "https://api.minimaxi.chat/v1";
const MODEL = "abab6.5s-chat"; // 性价比高，适合批量处理

interface MiniMaxMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callMiniMax(messages: MiniMaxMessage[], temperature: number = 0.1) {
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
      max_tokens: 1024,
      response_format: { type: "json_object" } // 强制返回 JSON 格式
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`MiniMax API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

// 1. 评论可信度分析
export async function analyzeReviewCredibility(reviewText: string, restaurantName: string) {
  const systemPrompt = `你是一个专业的餐厅评价打假与分析专家。
请分析以下关于餐厅「${restaurantName}」的评论文本，判断其真实可信度。
返回严格的 JSON 格式：
{
  "credibility_score": 0-100的整数 (100最可信),
  "credibility_action": "keep" | "flag" | "remove",
  "credibility_reason": "简短的一句话理由"
}
判断标准：
- 过于空泛的溢美之词、情绪化攻击，降低分数。
- 提到具体菜品细节、有优点也有缺点的客观描述，提高分数。
- 日文和中文一视同仁。`;

  return callMiniMax([
    { role: "system", content: systemPrompt },
    { role: "user", content: reviewText }
  ]);
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
