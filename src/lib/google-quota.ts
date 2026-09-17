import { getDb } from "@/lib/cloudflare";

/**
 * 计费 API 的月度调用闸门。
 *
 * 背景：以前这套闸门对所有 SKU 用同一个值（9000），这是**错的**。
 * Google Maps Platform 从 2025-03 起改成 per-SKU 免费额度，各 SKU 的额度
 * **差一个数量级**：
 *
 * | 我们调的接口 | 计费 SKU | 免费额度/月 | 超出单价 |
 * |---|---|---|---|
 * | `place/photo`（照片代理） | Places Photo（Enterprise）81E7-85D0-58A7 | **1,000** | $7 / 1000 |
 * | `place/details/json` | Places Details（Pro）FC5C-DF28-543F | 5,000 | $17 / 1000 |
 * | `place/textsearch/json` | Places - Text Search（Pro）E95A-86C7-7F47 | 5,000 | $32 / 1000 |
 * | `place/nearbysearch/json` | Places - Nearby Search（Pro）6B23-8A17-D29D | 5,000 | $32 / 1000 |
 *
 * 照片只有 1000，旧代码却允许跑到 9000 —— 等于默许超过 1000 之后一直按
 * $7/1000 计费。现在的规则：
 *
 * 1. 每个 SKU 的上限**永远不可能超过它的免费额度**（环境变量写大了也会被
 *    min() 压回来），再乘 0.9 留 10% 余量应付统计偏差。
 * 2. 计数放 D1 而不是 KV。KV 最终一致，高并发下会漏计，超额后还会继续打。
 *    D1 强一致，且下面这条带 WHERE 的 UPSERT 把「检查 + 加一」做成一个原子语句。
 * 3. 只在**真正要发起调用**之前调用；命中缓存的请求绝不能进这里。
 * 4. 计数器本身出错时一律拒绝（返回 false），宁可不显示内容也不产生费用。
 */

export type MeteredApi = "photo" | "details" | "textsearch" | "nearbysearch" | "ai";

/** 真实免费额度（每月）。Google 的按上表；ai 是我们自定的上限，用于防刷 DeepSeek。 */
const FREE_TIER: Record<MeteredApi, number> = {
  photo: 1000,
  details: 5000,
  textsearch: 5000,
  nearbysearch: 5000,
  ai: 400,
};

export const METERED_APIS: MeteredApi[] = ["photo", "details", "textsearch", "nearbysearch", "ai"];

/** 留 10% 安全余量，防止我们的计数和 Google 侧统计有偏差 */
const SAFETY_RATIO = 0.9;

function envBudget(api: MeteredApi): number | null {
  const specific = Number(process.env[`API_MONTHLY_BUDGET_${api.toUpperCase()}`]);
  if (Number.isFinite(specific) && specific > 0) return Math.floor(specific);

  if (api !== "ai") {
    // 兼容旧的单一变量：它只能把上限压更低，压不上去（见 monthlyBudget 的 min）
    const legacy = Number(process.env.GOOGLE_API_MONTHLY_BUDGET);
    if (Number.isFinite(legacy) && legacy > 0) return Math.floor(legacy);
    return null;
  }

  const ai = Number(process.env.AI_MONTHLY_BUDGET);
  return Number.isFinite(ai) && ai > 0 ? Math.floor(ai) : null;
}

/**
 * 某个 SKU 本月的调用上限。
 *
 * Google SKU：上限 = min(配置值 ?? 免费额度, 免费额度) × 0.9 —— 配置得再大
 * 也越不过免费额度，所以不可能产生费用。
 */
export function monthlyBudget(api: MeteredApi): number {
  const free = FREE_TIER[api];
  const configured = envBudget(api);

  if (api === "ai") {
    // 不是 Google 的免费额度，配置多少就是多少
    return Math.max(1, configured ?? free);
  }

  const ceiling = Math.min(configured ?? free, free);
  return Math.max(1, Math.floor(ceiling * SAFETY_RATIO));
}

/** 免费额度本身，给后台展示用 */
export function freeTier(api: MeteredApi): number {
  return FREE_TIER[api];
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM (UTC)
}

/**
 * 尝试占用一次配额。返回 false 表示本月额度已用完，调用方必须放弃这次调用。
 *
 * 注意失败时的方向：如果计数器本身出错（D1 挂了等），这里返回 **false**，
 * 也就是宁可不显示内容也不冒险产生费用。
 */
export async function consumeQuota(api: MeteredApi): Promise<boolean> {
  const budget = monthlyBudget(api);
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
      console.warn(
        `[quota] ${api} 本月额度已用完（上限 ${budget} / 免费额度 ${FREE_TIER[api]}），已停止调用`
      );
      return false;
    }
    return true;
  } catch (error) {
    // 计数器不可用时一律拒绝，绝不放行可能计费的调用
    console.error(`[quota] ${api} 计数失败，保守起见拒绝本次调用:`, error);
    return false;
  }
}

export type QuotaUsageRow = {
  api: string;
  used: number;
  budget: number;
  freeTier: number;
  updated_at: string | null;
};

/** 当前各 SKU 的用量与上限，给后台展示用。没记录过的 SKU 也会列出来（used=0）。 */
export async function getQuotaUsage(): Promise<QuotaUsageRow[]> {
  const period = currentPeriod();
  const latest = new Map<string, { used: number; updated_at: string | null }>();

  try {
    const db = await getDb();
    const { results = [] } = await db
      .prepare(`SELECT api, used, updated_at FROM api_quota WHERE period = ?`)
      .bind(period)
      .all<{ api: string; used: number; updated_at: string | null }>();
    for (const row of results || []) {
      latest.set(row.api, { used: row.used, updated_at: row.updated_at });
    }
  } catch (error) {
    console.error("[quota] 读取用量失败:", error);
  }

  return METERED_APIS.map((api) => ({
    api,
    used: latest.get(api)?.used ?? 0,
    budget: monthlyBudget(api),
    freeTier: FREE_TIER[api],
    updated_at: latest.get(api)?.updated_at ?? null,
  }));
}

/** 旧名字，后台页面在用，保留以兼容 */
export const getGoogleQuotaUsage = getQuotaUsage;
