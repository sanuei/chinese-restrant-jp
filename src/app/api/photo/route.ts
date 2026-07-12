import { getImagesBucket } from "@/lib/cloudflare";

/**
 * 餐厅照片代理 / 缓存路由
 *
 * 目的：Google Places Photo API 是「按次计费」（约 $7 / 1000 次），
 * 之前每次页面展示图片都直连 Google，导致费用暴涨。
 *
 * 现在：图片经由本路由。第一次请求某张图时向 Google 抓取一次并写入 R2，
 * 之后全部由 R2 + Cloudflare 边缘缓存提供，Google 端每张图最多只被调用一次。
 *
 * 用法：/api/photo?ref=<photo_reference>&w=800
 *  - ref：D1 里存的 photo_reference（Ab43m-... ）或完整图片 URL
 *  - w  ：期望宽度（可选，默认 800，会被限制在 200~1600）
 */

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop";

// 缓存一年，标记为不可变（内容按 ref+宽度 唯一）
const CACHE_HEADER = "public, max-age=31536000, immutable";

async function hashKey(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clampWidth(raw: string | null): number {
  const w = Number(raw);
  if (!Number.isFinite(w)) return 800;
  return Math.max(200, Math.min(1600, Math.round(w)));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref");
  const width = clampWidth(url.searchParams.get("w"));

  if (!ref) {
    return Response.redirect(FALLBACK_IMAGE, 302);
  }

  // 已经是完整 URL（比如历史数据里存的 lh3.googleusercontent.com）直接透传
  if (ref.startsWith("http")) {
    return Response.redirect(ref, 302);
  }

  const bucket = await getImagesBucket();
  const key = `photos/${await hashKey(`${ref}@${width}`)}.jpg`;

  // 1) 命中 R2：直接返回，零 Google 调用
  const cached = await bucket.get(key);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        "Content-Type": cached.httpMetadata?.contentType || "image/jpeg",
        "Cache-Control": CACHE_HEADER,
        "X-Photo-Cache": "HIT",
      },
    });
  }

  // 2) 未命中：向 Google 抓取一次（服务端 key，不再暴露给浏览器）
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Response.redirect(FALLBACK_IMAGE, 302);
  }

  const googleUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
  googleUrl.searchParams.set("maxwidth", String(width));
  googleUrl.searchParams.set("photo_reference", ref);
  googleUrl.searchParams.set("key", apiKey);

  const upstream = await fetch(googleUrl.toString());
  if (!upstream.ok) {
    // Google 抓取失败（key 被禁用 / photo_reference 失效等）→ 回退占位图
    return Response.redirect(FALLBACK_IMAGE, 302);
  }

  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  const bytes = await upstream.arrayBuffer();

  // 3) 写入 R2 供后续复用（失败也不影响本次返回）
  try {
    await bucket.put(key, bytes, { httpMetadata: { contentType } });
  } catch (e) {
    console.error("[photo] R2 put failed:", e);
  }

  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": CACHE_HEADER,
      "X-Photo-Cache": "MISS",
    },
  });
}
