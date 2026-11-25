import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/session";
import { getLifePlaceCommunity, getLifeRatingSummary } from "@/lib/life-community";
import { checkCommentSpam, normalizeForDedup } from "@/lib/spam-filter";

type RouteCtx = { params: Promise<{ id: string }> };

/** 获取生活专区门店的评分汇总与留言列表 */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id: placeId } = await ctx.params;
  const user = await getCurrentUser();
  const data = await getLifePlaceCommunity(placeId, user);
  return NextResponse.json(data);
}

/** 发表生活专区留言或楼中楼回复（免审核，自动垃圾留言过滤） */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录后再留言" }, { status: 401 });
  }

  const { id: placeId } = await ctx.params;
  if (!placeId) {
    return NextResponse.json({ error: "Missing place id" }, { status: 400 });
  }

  let body: {
    content?: unknown;
    parentId?: unknown;
    replyToName?: unknown;
    rating?: unknown;
    website?: unknown;
    locale?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const isJa = body.locale === "ja";
  const rawContent = typeof body.content === "string" ? body.content : "";
  const parentId = typeof body.parentId === "string" && body.parentId.trim() ? body.parentId.trim() : null;
  const replyToName =
    typeof body.replyToName === "string" && body.replyToName.trim()
      ? body.replyToName.trim().slice(0, 40)
      : null;
  const honeypot = typeof body.website === "string" ? body.website : "";

  const spamCheck = checkCommentSpam({
    content: rawContent,
    isReply: Boolean(parentId),
    honeypot,
  });
  if (!spamCheck.ok) {
    return NextResponse.json(
      { error: isJa ? spamCheck.messageJa : spamCheck.messageZh, code: spamCheck.code },
      { status: 400 }
    );
  }

  let parsedRating: number | null = null;
  if (!parentId && body.rating !== undefined && body.rating !== null && body.rating !== "") {
    const r = Number(body.rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return NextResponse.json({ error: "评分需为 1 到 5 的整数" }, { status: 400 });
    }
    parsedRating = r;
  }

  const db = await getDb();
  const exists = await db
    .prepare(`SELECT id FROM life_places WHERE id = ? AND is_active = 1`)
    .bind(placeId)
    .first<{ id: string }>();

  if (!exists) {
    return NextResponse.json({ error: "未找到该门店" }, { status: 404 });
  }

  let resolvedParentId: string | null = null;
  if (parentId) {
    const parentRow = await db
      .prepare(
        `SELECT id, parent_id FROM life_place_comments
         WHERE id = ? AND place_id = ? AND is_deleted = 0`
      )
      .bind(parentId, placeId)
      .first<{ id: string; parent_id: string | null }>();
    if (!parentRow) {
      return NextResponse.json({ error: "回复的留言不存在或已删除" }, { status: 404 });
    }
    resolvedParentId = parentRow.parent_id || parentRow.id;
  }

  // 防灌水频控：20 秒内最多 1 条，10 分钟内最多 6 条
  const twentySecondsAgo = new Date(Date.now() - 20_000).toISOString();
  const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
  const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [recentOne, recentTenMin, recentSamePlace] = await Promise.all([
    db
      .prepare(`SELECT id FROM life_place_comments WHERE user_id = ? AND created_at > ? LIMIT 1`)
      .bind(user.id, twentySecondsAgo)
      .first<{ id: string }>(),
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM life_place_comments WHERE user_id = ? AND created_at > ?`)
      .bind(user.id, tenMinutesAgo)
      .first<{ cnt: number }>(),
    db
      .prepare(
        `SELECT content FROM life_place_comments
         WHERE user_id = ? AND place_id = ? AND is_deleted = 0 AND created_at > ?
         ORDER BY created_at DESC LIMIT 8`
      )
      .bind(user.id, placeId, oneDayAgo)
      .all<{ content: string }>(),
  ]);

  if (recentOne) {
    return NextResponse.json({ error: "发言太快了，请稍等 20 秒后再试" }, { status: 429 });
  }
  if ((recentTenMin?.cnt ?? 0) >= 6) {
    return NextResponse.json({ error: "短时间内留言过多，请稍后再试" }, { status: 429 });
  }

  const dedupKey = normalizeForDedup(spamCheck.cleaned);
  const isDuplicate = (recentSamePlace.results || []).some(
    (row) => normalizeForDedup(row.content) === dedupKey
  );
  if (isDuplicate) {
    return NextResponse.json({ error: "请勿在同一家店重复发送相同内容" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const commentId = crypto.randomUUID();
  const authorName = (user.name || "匿名用户").trim().slice(0, 40);

  const stmts = [
    db
      .prepare(
        `INSERT INTO life_place_comments (
           id, place_id, user_id, author_name, author_avatar,
           parent_id, reply_to_name, rating, content, likes_count, is_deleted, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
      )
      .bind(
        commentId,
        placeId,
        user.id,
        authorName,
        user.image || null,
        resolvedParentId,
        resolvedParentId ? replyToName : null,
        parsedRating,
        spamCheck.cleaned,
        now
      ),
  ];

  if (parsedRating !== null) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO life_place_ratings (id, place_id, user_id, rating, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(place_id, user_id) DO UPDATE SET
             rating = excluded.rating,
             updated_at = excluded.updated_at`
        )
        .bind(crypto.randomUUID(), placeId, user.id, parsedRating, now, now)
    );
  }

  await db.batch(stmts);
  const ratingSummary =
    parsedRating !== null ? await getLifeRatingSummary(placeId, user.id) : undefined;

  const comment = resolvedParentId
    ? {
        id: commentId,
        parentId: resolvedParentId,
        authorName,
        authorAvatar: user.image || null,
        replyToName,
        content: spamCheck.cleaned,
        likesCount: 0,
        likedByMe: false,
        canDelete: true,
        createdAt: now,
      }
    : {
        id: commentId,
        authorName,
        authorAvatar: user.image || null,
        rating: parsedRating,
        content: spamCheck.cleaned,
        likesCount: 0,
        likedByMe: false,
        canDelete: true,
        createdAt: now,
        replies: [],
      };

  return NextResponse.json({ ok: true, comment, ratingSummary }, { status: 201 });
}
