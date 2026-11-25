import { getDb } from "@/lib/cloudflare";
import { isAdminEmail } from "@/lib/admin-auth";
import type { CurrentUser } from "@/lib/session";

export type RatingSummary = {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  myRating: number | null;
};

export type CommunityReply = {
  id: string;
  parentId: string;
  authorName: string;
  authorAvatar: string | null;
  replyToName: string | null;
  content: string;
  likesCount: number;
  likedByMe: boolean;
  canDelete: boolean;
  createdAt: string;
};

export type CommunityComment = {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  rating: number | null;
  content: string;
  likesCount: number;
  likedByMe: boolean;
  canDelete: boolean;
  createdAt: string;
  replies: CommunityReply[];
};

export type CommunityPayload = {
  ratingSummary: RatingSummary;
  comments: CommunityComment[];
  totalComments: number;
};

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

export async function getRatingSummary(
  restaurantId: string,
  userId: string | null
): Promise<RatingSummary> {
  const db = await getDb();
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  const [distRes, myRow] = await Promise.all([
    db
      .prepare(
        `SELECT rating, COUNT(*) AS cnt
         FROM restaurant_ratings
         WHERE restaurant_id = ?
         GROUP BY rating`
      )
      .bind(restaurantId)
      .all<RatingRow>(),
    userId
      ? db
          .prepare(`SELECT rating FROM restaurant_ratings WHERE restaurant_id = ? AND user_id = ?`)
          .bind(restaurantId, userId)
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
    myRating: myRow?.rating ?? null,
  };
}

export async function getRestaurantCommunity(
  restaurantId: string,
  currentUser: CurrentUser | null
): Promise<CommunityPayload> {
  const db = await getDb();
  const userId = currentUser?.id ?? null;
  const userIsAdmin = isAdminEmail(currentUser?.email);

  try {
    const [ratingSummary, commentsRes, likesRes] = await Promise.all([
      getRatingSummary(restaurantId, userId),
      db
        .prepare(
          `SELECT id, user_id, author_name, author_avatar, parent_id, reply_to_name,
                  rating, content, likes_count, created_at
           FROM restaurant_comments
           WHERE restaurant_id = ? AND is_deleted = 0
           ORDER BY created_at DESC
           LIMIT 200`
        )
        .bind(restaurantId)
        .all<CommentDbRow>(),
      userId
        ? db
            .prepare(`SELECT comment_id FROM comment_likes WHERE user_id = ?`)
            .bind(userId)
            .all<{ comment_id: string }>()
        : Promise.resolve({ results: [] as { comment_id: string }[] }),
    ]);

    const likedSet = new Set((likesRes.results || []).map((r) => r.comment_id));
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
        const reply: CommunityReply = {
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
        };
        const list = repliesByParent.get(row.parent_id);
        if (list) list.push(reply);
        else repliesByParent.set(row.parent_id, [reply]);
      }
    }

    // 讨论串内的回复按时间正序排列，更符合阅读对话习惯
    const comments: CommunityComment[] = [];
    for (const [id, comment] of topMap) {
      const replies = (repliesByParent.get(id) || []).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      );
      comment.replies = replies;
      comments.push(comment);
    }

    return {
      ratingSummary,
      comments,
      totalComments: rows.length,
    };
  } catch (error) {
    console.error("getRestaurantCommunity error:", error);
    return {
      ratingSummary: { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, myRating: null },
      comments: [],
      totalComments: 0,
    };
  }
}
