import { getDb } from "@/lib/cloudflare";

/**
 * Google API 月度调用配额的硬闸门。
 *
 * 背景：Google Places Photo API 按次计费，之前失控过一次，一个月产生了
 * 约 7000 元账单。现在每个 SKU 每月有 10000 次免费额度，超出就开始收费，
 * 所以这里的目标只有一个——**到达上限就彻底停止调用**，宁可少显示一张图，
 * 也不能再产生费用。
 *
 * 实现要点：
 * - 计数放 D1 而不是 KV。KV 最终一致，高并发下会漏计，超额后还会继续打。
 *   D1 强一致，且下面这条带 WHERE 的 UPSERT 把「检查 + 加一」做成一个原子语句。
 * - 每个 SKU 单独计数。Google 的免费额度是按 SKU 给的，合并计数会过早停掉。
 * - 预算默认留 10% 余量（9000 而不是 10000），防止计数和 Google 侧统计有偏差。
 * - 只在**真正要打 Google** 之前调用；命中缓存的请求绝不能进这里。
 */

export type GoogleApi = "photo" | "details" | "textsearch" | "nearbysearch";

/** Google 每个 SKU 每月免费 10000 次，这里留 10% 安全余量 */
const DEFAULT_BUDGET = 9000;

function monthlyBudget(): number {
  const configured = Number(process.env.GOOGLE_API_MONTHLY_BUDGET);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_BUDGET;
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM (UTC)
}

/**
 * 尝试占用一次配额。返回 false 表示本月额度已用完，调用方必须放弃这次 Google 调用。
 *
 * 注意失败时的方向：如果计数器本身出错（D1 挂了等），这里返回 **false**，
 * 也就是宁可不显示内容也不冒险产生费用。
 */
export async function consumeGoogleQuota(api: GoogleApi): Promise<boolean> {
  const budget = monthlyBudget();
  const period = currentPeriod();

  try {
    const db = await getDb();
    const row = await db
      .prepare(
        `INSERT INTO api_quota (api, period, used, updated_at)
         VALUES (?, ?, 1, datetime('now'))
         ON CONFLICT(api, period) DO UPDATE
           SET used = used + 1, updated_at = datetime('now')
           WHERE api_quota.used < ?
         RETURNING used`
      )
      .bind(api, period, budget)
      .first<{ used: number }>();

    // WHERE 不满足时 UPSERT 不会更新任何行，RETURNING 也就没有结果 —— 说明额度已用完
    if (!row) {
      console.warn(`[quota] ${api} 本月额度已用完（上限 ${budget}），已停止调用 Google`);
      return false;
    }
    return true;
  } catch (error) {
    // 计数器不可用时一律拒绝，绝不放行可能计费的调用
    console.error(`[quota] ${api} 计数失败，保守起见拒绝本次调用:`, error);
    return false;
  }
}

/** 当前各 SKU 的用量，给后台展示用 */
export async function getGoogleQuotaUsage(): Promise<
  { api: string; used: number; budget: number; updated_at: string | null }[]
> {
  const budget = monthlyBudget();
  try {
    const db = await getDb();
    const { results = [] } = await db
      .prepare(`SELECT api, used, updated_at FROM api_quota WHERE period = ? ORDER BY used DESC`)
      .bind(currentPeriod())
      .all<{ api: string; used: number; updated_at: string | null }>();
    return (results || []).map((row) => ({ ...row, budget }));
  } catch (error) {
    console.error("[quota] 读取用量失败:", error);
    return [];
  }
}
