import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/session";
import { getRatingSummary, getRestaurantCommunity } from "@/lib/community";
import { checkCommentSpam, normalizeForDedup } from "@/lib/spam-filter";

type RouteParams = { params: Promise<{ id: string }> };

type CreateCommentBody = {
  content?: unknown;
  rating?: unknown;
  parentId?: unknown;
  replyToName?: unknown;
  website?: unknown; // 隐形蜜罐字段，正常用户不会填写
  locale?: unknown;
};

// GET /api/restaurants/[id]/comments — 获取餐厅评分汇总与全部留言讨论
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const user = await getCurrentUser();
  const data = await getRestaurantCommunity(id, user);
  return NextResponse.json(data);
}

// POST /api/restaurants/[id]/comments — 发布留言或讨论回复（免审核，自动过滤垃圾留言）
export async function POST(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录后再留言讨论" }, { status: 401 });
  }

  try {
    const { id: restaurantId } = await params;
    const body = (await req.json()) as CreateCommentBody;
    const isJa = body.locale === "ja";
    const rawParentId = typeof body.parentId === "string" && body.parentId.trim() ? body.parentId.trim() : null;

    // 1. 多维垃圾留言内容过滤
    const spamResult = checkCommentSpam({
      content: body.content,
      honeypot: body.website,
      isReply: Boolean(rawParentId),
    });
    if (!spamResult.ok) {
      return NextResponse.json(
        { error: isJa ? spamResult.messageJa : spamResult.messageZh, code: spamResult.code },
        { status: 400 }
      );
    }

    const db = await getDb();

    // 2. 校验餐厅存在
    const restaurant = await db
      .prepare(`SELECT id FROM restaurants WHERE id = ? AND is_active = 1`)
      .bind(restaurantId)
      .first<{ id: string }>();
    if (!restaurant) {
      return NextResponse.json({ error: isJa ? "店舗が見つかりません" : "餐厅不存在" }, { status: 404 });
    }

    // 3. 速率限制与防重复刷屏（同一用户 20 秒内限 1 条，10 分钟内限 6 条，24 小时内同店内容不可重复）
    const [recentByUser, recentInShop] = await Promise.all([
      db
        .prepare(
          `SELECT created_at FROM restaurant_comments
           WHERE user_id = ? AND is_deleted = 0
             AND created_at >= datetime('now', '-10 minutes')
           ORDER BY created_at DESC
           LIMIT 10`
        )
        .bind(user.id)
        .all<{ created_at: string }>(),
      db
        .prepare(
          `SELECT content FROM restaurant_comments
           WHERE user_id = ? AND restaurant_id = ? AND is_deleted = 0
             AND created_at >= datetime('now', '-24 hours')
           ORDER BY created_at DESC
           LIMIT 10`
        )
        .bind(user.id, restaurantId)
        .all<{ content: string }>(),
    ]);

    const recentTimes = recentByUser.results || [];
    if (recentTimes.length >= 6) {
      return NextResponse.json(
        {
          error: isJa
            ? "短時間に投稿が多すぎます。少し時間をおいてからお試しください。"
            : "发言过于频繁，请 10 分钟后再试。",
        },
        { status: 429 }
      );
    }

    if (recentTimes.length > 0) {
      const latestMs = Date.parse(recentTimes[0].created_at.replace(" ", "T") + "Z");
      if (Number.isFinite(latestMs) && Date.now() - latestMs < 20_000) {
        return NextResponse.json(
          {
            error: isJa
              ? "連続投稿の間隔が短すぎます。20秒ほど待ってから投稿してください。"
              : "发言间隔太短，请 20 秒后再发。",
          },
          { status: 429 }
        );
      }
    }

    const incomingNorm = normalizeForDedup(spamResult.cleaned);
    const isDuplicate = (recentInShop.results || []).some(
      (row) => normalizeForDedup(row.content) === incomingNorm
    );
    if (isDuplicate) {
      return NextResponse.json(
        {
          error: isJa
            ? "同じ内容のコメントがすでに投稿されています。"
            : "你已经在这家店发过相同内容了，请勿重复刷屏。",
        },
        { status: 400 }
      );
    }

    // 4. 若是楼中楼回复，校验父留言并统一归并到顶层讨论串（保持清爽的 2 级结构）
    let resolvedParentId: string | null = null;
    let resolvedReplyToName: string | null = null;
    if (rawParentId) {
      const parent = await db
        .prepare(
          `SELECT id, parent_id, author_name FROM restaurant_comments
           WHERE id = ? AND restaurant_id = ? AND is_deleted = 0`
        )
        .bind(rawParentId, restaurantId)
        .first<{ id: string; parent_id: string | null; author_name: string }>();
      if (!parent) {
        return NextResponse.json(
          { error: isJa ? "返信先のコメントが見つかりません" : "回复的留言不存在或已删除" },
          { status: 404 }
        );
      }
      resolvedParentId = parent.parent_id || parent.id;
      const customReplyTo = typeof body.replyToName === "string" ? body.replyToName.trim().slice(0, 40) : "";
      resolvedReplyToName = customReplyTo || parent.author_name;
    }

    // 5. 解析主留言附带的评分（仅顶层留言允许附带 1-5 星打分）
    let parsedRating: number | null = null;
    if (!resolvedParentId && body.rating !== undefined && body.rating !== null && body.rating !== "") {
      const r = Number(body.rating);
      if (Number.isInteger(r) && r >= 1 && r <= 5) {
        parsedRating = r;
      }
    }

    const commentId = `cm_${crypto.randomUUID().replace(/-/g, "")}`;
    const authorName = (user.name || user.email?.split("@")[0] || "食客").trim().slice(0, 40);
    const authorAvatar = user.image || null;

    await db
      .prepare(
        `INSERT INTO restaurant_comments (
           id, restaurant_id, user_id, author_name, author_avatar,
           parent_id, reply_to_name, rating, content, likes_count, is_deleted, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'))`
      )
      .bind(
        commentId,
        restaurantId,
        user.id,
        authorName,
        authorAvatar,
        resolvedParentId,
        resolvedReplyToName,
        parsedRating,
        spamResult.cleaned
      )
      .run();

    // 若主留言附带评分，同步更新用户在 restaurant_ratings 的唯一评分
    if (parsedRating !== null) {
      const ratingRowId = `rt_${restaurantId}_${user.id}`;
      await db
        .prepare(
          `INSERT INTO restaurant_ratings (id, restaurant_id, user_id, rating, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(restaurant_id, user_id) DO UPDATE SET
             rating = excluded.rating,
             updated_at = datetime('now')`
        )
        .bind(ratingRowId, restaurantId, user.id, parsedRating)
        .run();
    }

    const ratingSummary = await getRatingSummary(restaurantId, user.id);

    return NextResponse.json({
      success: true,
      comment: {
        id: commentId,
        parentId: resolvedParentId,
        authorName,
        authorAvatar,
        replyToName: resolvedReplyToName,
        rating: parsedRating,
        content: spamResult.cleaned,
        likesCount: 0,
        likedByMe: false,
        canDelete: true,
        createdAt: new Date().toISOString().replace("T", " ").slice(0, 19),
        replies: [],
      },
      ratingSummary,
    });
  } catch (error) {
    console.error("POST /api/restaurants/[id]/comments error:", error);
    return NextResponse.json({ error: "发布失败，请稍后重试" }, { status: 500 });
  }
}
