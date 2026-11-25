import { getDb } from "@/lib/cloudflare";
import { isAdminEmail } from "@/lib/admin-auth";
import type { CurrentUser } from "@/lib/session";
import type {
  CommunityComment,
  CommunityPayload,
  CommunityReply,
  RatingSummary,
} from "@/lib/community";

type RatingRow = { rating: number; cnt: number };
type CommentDbRow = {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar: string | null;
  parent_id: string | null;
  reply_to_name: string | null;
  rating: number | null;
  content: string;
  likes_count: number;
  created_at: string;
};

/** 获取生活专区单个地点的站内评分汇总 */
export async function getLifeRatingSummary(
  placeId: string,
  userId: string | null
): Promise<RatingSummary> {
  const db = await getDb();
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  const [distRes, myRow] = await Promise.all([
    db
      .prepare(
        `SELECT rating, COUNT(*) AS cnt
         FROM life_place_ratings
         WHERE place_id = ?
         GROUP BY rating`
      )
      .bind(placeId)
      .all<RatingRow>(),
    userId
      ? db
          .prepare(`SELECT rating FROM life_place_ratings WHERE place_id = ? AND user_id = ?`)
          .bind(placeId, userId)
          .first<{ rating: number }>()
      : Promise.resolve(null),
  ]);

  let total = 0;
  let sum = 0;
  for (const row of distRes.results || []) {
    const r = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
    if (r >= 1 && r <= 5) {
      distribution[r] = row.cnt;
      total += row.cnt;
      sum += r * row.cnt;
    }
  }

  return {
    average: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
    count: total,
    distribution,
    myRating: myRow ? Number(myRow.rating) : null,
  };
}

/** 获取生活专区单个地点的评分 + 留言 + 楼中楼回复 */
export async function getLifePlaceCommunity(
  placeId: string,
  currentUser: CurrentUser | null
): Promise<CommunityPayload> {
  const db = await getDb();
  const userId = currentUser?.id ?? null;
  const userIsAdmin = isAdminEmail(currentUser?.email);

  const [ratingSummary, commentsRes, likedRes] = await Promise.all([
    getLifeRatingSummary(placeId, userId),
    db
      .prepare(
        `SELECT id, user_id, author_name, author_avatar, parent_id, reply_to_name,
                rating, content, likes_count, created_at
         FROM life_place_comments
         WHERE place_id = ? AND is_deleted = 0
         ORDER BY created_at DESC
         LIMIT 200`
      )
      .bind(placeId)
      .all<CommentDbRow>(),
    userId
      ? db
          .prepare(`SELECT comment_id FROM life_comment_likes WHERE user_id = ?`)
          .bind(userId)
          .all<{ comment_id: string }>()
      : Promise.resolve({ results: [] as { comment_id: string }[] }),
  ]);

  const likedSet = new Set((likedRes.results || []).map((row) => row.comment_id));
  const rows = commentsRes.results || [];

  const topMap = new Map<string, CommunityComment>();
  const repliesByParent = new Map<string, CommunityReply[]>();

  for (const row of rows) {
    const canDelete = Boolean(userId && (row.user_id === userId || userIsAdmin));
    const likedByMe = likedSet.has(row.id);

    if (!row.parent_id) {
      topMap.set(row.id, {
        id: row.id,
        authorName: row.author_name,
        authorAvatar: row.author_avatar,
        rating: row.rating,
        content: row.content,
        likesCount: row.likes_count || 0,
        likedByMe,
        canDelete,
        createdAt: row.created_at,
        replies: [],
      });
    } else {
      const list = repliesByParent.get(row.parent_id) || [];
      list.push({
        id: row.id,
        parentId: row.parent_id,
        authorName: row.author_name,
        authorAvatar: row.author_avatar,
        replyToName: row.reply_to_name,
        content: row.content,
        likesCount: row.likes_count || 0,
        likedByMe,
        canDelete,
        createdAt: row.created_at,
      });
      repliesByParent.set(row.parent_id, list);
    }
  }

  for (const [parentId, replies] of repliesByParent.entries()) {
    const parent = topMap.get(parentId);
    if (!parent) continue;
    replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    parent.replies = replies;
  }

  const comments = Array.from(topMap.values());
  const totalComments = comments.reduce((acc, c) => acc + 1 + c.replies.length, 0);

  return {
    ratingSummary,
    comments,
    totalComments,
  };
}
