/**
 * DataForSEO Reviews API 封装
 * 用于获取 Google Maps 餐厅评论文本（补充 Google Places API 的评论限制）
 */

const BASE64_AUTH = Buffer.from(
  `${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`
).toString("base64");

const API_BASE = "https://api.dataforseo.com/v3/business_data/google/reviews";

export interface DataForSeoReview {
  review_id: string;
  profile_name: string;
  profile_image_url: string;
  rating: number; // 1-5
  review_text: string;
  timestamp: string; // ISO date string
  local_guide: boolean;
  reviews_count: number; // 作者的总评论数
  photos_count: number;
}

/**
 * 获取餐厅评论（异步任务模式）
 * @param placeId Google Place ID
 * @param limit 最大获取条数，默认 30
 */
export async function getDataForSeoReviews(
  placeId: string,
  limit: number = 30
): Promise<DataForSeoReview[]> {
  // 1. 创建任务
  const createResp = await fetch(`${API_BASE}/task_post`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${BASE64_AUTH}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        place_id: placeId,
        language_code: "en",
        location_code: 2392, // Tokyo
      },
    ]),
  });

  const createData = await createResp.json();
  const taskId = createData.tasks?.[0]?.id;
  if (!taskId) {
    throw new Error(`DataForSEO task creation failed: ${JSON.stringify(createData)}`);
  }

  // 2. 轮询等待完成（最多等 60 秒）
  const maxAttempts = 15; // 15 × 4s = 60s
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 4000));

    const readyResp = await fetch(`${API_BASE}/tasks_ready`, {
      headers: { Authorization: `Basic ${BASE64_AUTH}` },
      signal: AbortSignal.timeout(8000),
    });
    const readyData = await readyResp.json();
    const ourTask = readyData.tasks?.find(
      (t: { id: string }) => t.id.includes(taskId.split("-")[2])
    );

    if (ourTask?.status_code === 20000) {
      // 结果已在 tasks_ready 中，直接从 ourTask.result 拿
      const resultItems: Record<string, unknown>[] = ourTask.result?.[0]?.items || [];

      return resultItems.map((item): DataForSeoReview => ({
        review_id: String(item.review_id || ""),
        profile_name: String(item.profile_name || "Anonymous"),
        profile_image_url: String(item.profile_image_url || ""),
        rating: item.rating && typeof item.rating === "object"
          ? Number((item.rating as { value?: number }).value || 3)
          : 3,
        review_text: String(item.review_text || ""),
        timestamp: String(item.timestamp || new Date().toISOString()),
        local_guide: Boolean(item.local_guide),
        reviews_count: Number(item.reviews_count || 0),
        photos_count: Number(item.photos_count || 0),
      }));
    }

    console.log(`[DataForSEO] Attempt ${i + 1}/${maxAttempts}: status=${ourTask?.status_code} for ${placeId}`);
  }

  throw new Error(`DataForSEO task timed out for place_id: ${placeId}`);
}
