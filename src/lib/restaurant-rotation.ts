/**
 * 高评分餐厅分档轮换工具
 *
 * 目标：
 * 1. 保持「高口碑优先」—— 按评分分梯队（如每 36 家一档），首页第一页永远来自全站高分梯队；
 * 2. 定期轮换不看腻 —— 按小时生成确定性种子，同一时段内翻页不会重复，每小时自动换新，也支持用户手动「换一批」；
 * 3. 菜系打散不扎堆 —— 在每个梯队洗牌后按菜系交错排列，避免首页一排全是川菜。
 */

const ROTATION_INTERVAL_MS = 60 * 60 * 1000; // 每小时自动轮换一次

/** 当前小时对应的确定性轮换种子 */
export function getHourlyRotationSeed(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / ROTATION_INTERVAL_MS);
}

/** 轻量确定性 PRNG（Mulberry32） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 使用指定种子对数组做 Fisher-Yates 洗牌（不修改原数组） */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 按菜系轮询交错打散：
 * 把同一梯队已洗牌的店铺按菜系分桶，轮流从各桶取一家，
 * 既保留随机性，又能避免同一页里扎堆出现同一种菜系。
 */
function interleaveByCuisine<T extends { cuisine_type?: string | null }>(
  items: T[],
  seed: number
): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = item.cuisine_type || "other";
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }

  // 各菜系桶的出场顺序也随种子打乱，避免每次第一个都是同一菜系
  const keys = seededShuffle([...buckets.keys()], seed ^ 0x9e3779b9);
  const result: T[] = [];
  let remaining = items.length;

  while (remaining > 0) {
    for (const key of keys) {
      const bucket = buckets.get(key);
      if (bucket && bucket.length > 0) {
        result.push(bucket.shift()!);
        remaining--;
      }
    }
  }

  return result;
}

export function rotateRestaurantsByTier<T extends { cuisine_type?: string | null }>(
  sortedByRating: T[],
  seed: number,
  options: { tierSize?: number; diversifyCuisine?: boolean } = {}
): T[] {
  const tierSize = Math.max(1, options.tierSize ?? 36);
  const diversifyCuisine = options.diversifyCuisine !== false;
  const output: T[] = [];

  for (let start = 0, tierIdx = 0; start < sortedByRating.length; start += tierSize, tierIdx++) {
    const tier = sortedByRating.slice(start, start + tierSize);
    const tierSeed = (seed + tierIdx * 9973) >>> 0;
    const shuffled = seededShuffle(tier, tierSeed);
    output.push(...(diversifyCuisine ? interleaveByCuisine(shuffled, tierSeed) : shuffled));
  }

  return output;
}
