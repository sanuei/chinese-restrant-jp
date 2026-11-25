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
  name_zh?: string;
  cuisine_type: "sichuan" | "cantonese" | "northern" | "fujian" | "hunan" | "jiangsu" | "northwest" | "yunnan" | "other";
  cuisine_confidence: number;
  dish_type: "hotpot" | "bbq" | "noodles" | "malatang" | "dumpling" | "riceNoodle" | "grilledFish" | "dimsum" | "breakfast" | "deli" | "grocery" | "other";
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
1. 生成中文店名（name_zh）。
2. 判断菜系（地域风味）。
3. 判断品类（经营业态）。
4. 判断正宗度。
5. 生成中文和日文短摘要。
6. 判断每条 Google 评论的可信度。

中文店名 name_zh 规则：
- 原名里的日文汉字直接转成对应简体中文汉字（如「広東料理 海港美食」→「广东料理 海港美食」，「麺館」→「面馆」）。
- 片假名或英文品牌名保留原样不硬译，分店名保留并转简体（如「新宿東口店」→「新宿东口店」）。
- 不要编造原名里没有的词；如果原名本身已是标准中文，原样返回。

菜系 cuisine_type 只能是以下之一：
sichuan(川菜), cantonese(粤菜), northern(北方菜), fujian(闽菜), hunan(湘菜), jiangsu(苏浙菜), northwest(西北菜), yunnan(云贵菜), other(综合/其他)。

品类 dish_type 是和菜系平行的另一个维度，描述这家店的经营业态/上菜形式，只能是以下之一：
hotpot(火锅), bbq(烧烤), noodles(拉面/面食为主), malatang(麻辣烫/冒菜), dumpling(饺子/包子为主), riceNoodle(米线/米粉为主), grilledFish(烤鱼), dimsum(点心/茶餐厅), breakfast(中式早餐/豆浆油条/煎饼果子/豆腐脑/胡辣汤/朝粥), deli(熟食卤味/鸭脖/凉菜/烧腊外带专门店), grocery(中华物产店/中国食材超市/中国食品店), other(综合正餐，不属于以上任何一种业态)。
判断依据主要看店名和菜品结构（例如店名带"火锅""合桌"、或评论反复提到锅底涮菜，判 hotpot；店名带"烧烤""烤肉""串"，判 bbq；主要卖拉面/刀削面/炸酱面等面食，判 noodles；卖麻辣烫、冒菜等自选称重小吃，判 malatang；主打水饺、生煎、包子，判 dumpling；主打云南/广西风味米线米粉，判 riceNoodle；主打烤鱼，判 grilledFish；粤式茶餐厅、点心为主，判 dimsum；主打中式早餐、豆浆油条、煎饼果子、豆腐脑、胡辣汤、咸豆浆、朝粥、台式蛋饼饭团等早点的判 breakfast；主打卤味、鸭脖、猪蹄、凉菜、中式熟食、烧腊外带的判 deli；卖中国调料、零食、冷冻食品的中华物产店/中国超市判 grocery；普通中餐馆、菜品综合没有明显单一业态特征，判 other）。
注意：正宗的中式早餐店、卤味熟食店、中国物产店/中国食材超市，正宗度应判为 authentic，不要误判为 japanese。

正宗度 authenticity 只能是：
authentic(正宗中国味), adapted(改良中国味), japanese(日式中华), unknown(无法确定)。

评论可信度 action 只能是 keep、flag、remove。
评论如果空泛、刷评感强、只有情绪化赞美或攻击，降低可信度；如果提到具体菜品、口味、排队、服务、价格、环境，或优缺点并存，提高可信度。

返回严格 JSON，不要 markdown，不要解释。格式：
{
  "name_zh": "中文店名",
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

export interface LifePlaceAiAnalysis {
  is_chinese_service: boolean;
  name_zh: string;
  name_ja: string;
  category: "hair" | "medical" | "fitness" | "massage" | "beauty" | "entertainment" | "housing" | "services";
  chinese_support: "native" | "bilingual" | "friendly";
  summary_zh: string;
  summary_ja: string;
  tags_zh: string[];
  tags_ja: string[];
}

/** 分析在日华人生活服务门店：判断是否支持中文/面向华人，并输出分类、中文支持等级与双语亮点 */
export async function analyzeLifePlaceSnapshot(input: {
  name: string;
  address: string;
  hintCategory?: string;
  rating: number;
  reviewCount: number;
  website?: string | null;
  reviews: { author_name: string; rating: number; text: string; language?: string }[];
}): Promise<LifePlaceAiAnalysis> {
  const systemPrompt = `你是熟悉东京及关东在日华人生活圈的编辑，负责审核一家门店是否适合收录进「在日华人生活专区」。
请根据门店名称、地址、官网和 Google 评论判断：
1. is_chinese_service: 必须同时满足以下两个条件才返回 true，否则返回 false：
   (a) 该门店必须严格属于下方 8 种「非餐饮生活服务」之一。凡是餐厅、中餐馆、火锅店（如海底捞）、烧烤、拉面、奶茶咖啡、甜品店、居酒屋、中华物产店/超市、酒店宾馆等餐饮/食品零售/住宿场所，一律返回 false，绝不能强行塞进 entertainment 或其他分类！
   (b) 该店确实由华人经营、有中文店员/医生/教练/造型师，或明确提供中文服务/中文友好体验。如果只是普通日本本地店且没有任何华人或中文服务线索（例如完全是普通日本健身房、普通医院且评论与店名均未提及中文/华人），请返回 false。注意：如果店名明显带有华人/中国/中文特征（如「中国語対応」「中華」「华人」「台湾」「中国整体」「中式推拿」「中国語OK」等）或评论中有中文用户提及中文服务/华人老板/中文医生/中文理发师，应返回 true。
2. category 只能是以下 8 种之一：
   - hair: 华人理发店/美发沙龙
   - medical: 中文医院/诊所（内科、牙科、妇产、眼科、综合医院等）
   - fitness: 健身房/私教/瑜伽/普拉提/格斗馆
   - massage: 中医推拿/整体/足疗/针灸/拔罐养生
   - beauty: 美容/美甲美睫/皮肤管理/纹绣
   - entertainment: 中文KTV/麻将棋牌/剧本杀/桌游台球娱乐
   - housing: 华人房产中介/租房买房/搬家/中日物流
   - services: 签证行政书士/税务会计/留学/驾校/生活综合服务
3. chinese_support 只能是以下之一：
   - native: 华人老板主理或全程纯中文沟通
   - bilingual: 有中文医生/理发师/教练/店员常驻
   - friendly: 中文友好/部分人员可中文沟通或中文菜单导诊
4. name_zh: 规范简洁的简体中文店名（不要重复附加冗长广告副标题）
5. name_ja: 规范简洁的日文店名
6. summary_zh: 40-85字中文客观介绍，突出具体服务特色、中文沟通体验和口碑要点
7. summary_ja: 45-95字日文客观介绍
8. tags_zh: 3-4个简短中文特色标签（如 ["全程中文", "理发剪烫", "近池袋站"]）
9. tags_ja: 3-4个对应日文标签

严格返回纯 JSON，不要附加 markdown 代码块或额外解释。`;

  const reviewsText =
    input.reviews.length > 0
      ? input.reviews
          .slice(0, 5)
          .map((r, i) => `${i + 1}. [${r.rating}★] ${(r.text || "").replace(/\s+/g, " ").slice(0, 260)}`)
          .join("\n")
      : "暂无评论";

  const userContent = `店名: ${input.name}
地址: ${input.address}
参考分类: ${input.hintCategory || "未知"}
评分: ${input.rating}（${input.reviewCount}条评论）
官网: ${input.website || "无"}
Google评论:
${reviewsText}`;

  return callDeepSeek<LifePlaceAiAnalysis>(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    0.2
  );
}
