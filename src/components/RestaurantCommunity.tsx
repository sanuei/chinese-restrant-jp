"use client";

import { useState } from "react";
import {
  MessageSquare,
  Send,
  Star,
  ThumbsUp,
  Trash2,
  CornerDownRight,
  ShieldCheck,
  AlertCircle,
  Loader2,
  LogIn,
} from "lucide-react";
import type { CommunityComment, CommunityReply, RatingSummary } from "@/lib/community";

type Props = {
  restaurantId: string;
  locale: string;
  isLoggedIn: boolean;
  initialRating: RatingSummary;
  initialComments: CommunityComment[];
  initialTotalComments: number;
};

function formatTime(isoLike: string, isZh: boolean): string {
  const normalized = isoLike.includes("T") ? isoLike : `${isoLike.replace(" ", "T")}Z`;
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return isoLike;
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return isZh ? "刚刚" : "たった今";
  if (diffSec < 3600) return isZh ? `${Math.floor(diffSec / 60)} 分钟前` : `${Math.floor(diffSec / 60)}分前`;
  if (diffSec < 86400) return isZh ? `${Math.floor(diffSec / 3600)} 小时前` : `${Math.floor(diffSec / 3600)}時間前`;
  if (diffSec < 86400 * 7) return isZh ? `${Math.floor(diffSec / 86400)} 天前` : `${Math.floor(diffSec / 86400)}日前`;
  return new Date(ms).toLocaleDateString(isZh ? "zh-CN" : "ja-JP");
}

function Avatar({ name, src, size = "md" }: { name: string; src: string | null; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={`${cls} shrink-0 rounded-full object-cover ring-1 ring-white/15`} referrerPolicy="no-referrer" />;
  }
  return (
    <span className={`${cls} inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 font-bold text-gold-300 ring-1 ring-white/15`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function RestaurantCommunity({
  restaurantId,
  locale,
  isLoggedIn,
  initialRating,
  initialComments,
  initialTotalComments,
}: Props) {
  const isZh = locale === "zh";

  const [ratingSummary, setRatingSummary] = useState<RatingSummary>(initialRating);
  const [comments, setComments] = useState<CommunityComment[]>(initialComments);
  const [totalComments, setTotalComments] = useState<number>(initialTotalComments);

  // 独立快速打分状态
  const [hoverStar, setHoverStar] = useState<number>(0);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingNotice, setRatingNotice] = useState<string | null>(null);

  // 主留言表单状态
  const [content, setContent] = useState("");
  const [postRating, setPostRating] = useState<number | null>(initialRating.myRating);
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 楼中楼回复状态
  const [replyTarget, setReplyTarget] = useState<{ parentId: string; replyToName: string } | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const starLabels = isZh
    ? ["", "踩雷不推荐", "一般般", "还不错", "很好吃", "强烈推荐"]
    : ["", "おすすめしない", "いまひとつ", "まあまあ", "おいしい", "超おすすめ"];

  const copy = isZh
    ? {
        sectionTitle: "食客打分与讨论",
        ratingTitle: "本站食客评分",
        noRatingYet: "暂无打分，来做第一位打分食客吧",
        ratingCount: (n: number) => `${n} 人已打分`,
        ratePrompt: "点击星星为这家店打分",
        ratedPrefix: "我的评分",
        loginToRate: "登录后可打分",
        composerTitle: "发表留言 / 发起讨论",
        attachRating: "附带打分（可选）",
        clearRating: "仅留言不打分",
        placeholder: "分享真实口味、推荐菜品、避坑提醒，或向去过的朋友提问（如是否需要预约、辣度如何）...",
        spamHint: "无需审核即时展示 · 系统自动过滤外链/广告/刷屏垃圾留言",
        submitBtn: "发布留言",
        submittingBtn: "发布中...",
        loginBanner: "使用 Google 账号登录后，即可打分、发表真实体验或参与讨论。",
        loginBtn: "立即登录",
        emptyList: "还没有食客留言，欢迎留下第一条真实评价或提问！",
        replyBtn: "回复",
        replyPlaceholder: (name: string) => `回复 @${name}...`,
        replySend: "发送回复",
        cancel: "取消",
        deleteConfirm: "确定删除这条留言吗？",
        replyToPrefix: "回复",
        commentsCount: (n: number) => `共 ${n} 条留言讨论`,
      }
    : {
        sectionTitle: "ユーザー評価・ディスカッション",
        ratingTitle: "ユーザー総合評価",
        noRatingYet: "まだ評価がありません。最初の評価を付けてみましょう",
        ratingCount: (n: number) => `${n}件の評価`,
        ratePrompt: "星をクリックして評価する",
        ratedPrefix: "あなたの評価",
        loginToRate: "ログインして評価",
        composerTitle: "コメントを投稿・質問する",
        attachRating: "評価を添える（任意）",
        clearRating: "評価なしで投稿",
        placeholder: "味の感想、おすすめメニュー、予約の必要性や辛さへの質問などを自由に共有してください...",
        spamHint: "承認不要で即時反映・URLや広告スパムは自動ブロックされます",
        submitBtn: "投稿する",
        submittingBtn: "送信中...",
        loginBanner: "Googleアカウントでログインすると、星評価・口コミ投稿・返信ディスカッションができます。",
        loginBtn: "ログインする",
        emptyList: "まだコメントがありません。最初の口コミや質問を投稿してみませんか？",
        replyBtn: "返信",
        replyPlaceholder: (name: string) => `@${name} へ返信...`,
        replySend: "返信を送信",
        cancel: "キャンセル",
        deleteConfirm: "このコメントを削除しますか？",
        replyToPrefix: "返信",
        commentsCount: (n: number) => `${n}件のコメント`,
      };

  const goToLogin = () => {
    window.location.assign(`/api/auth/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
  };

  // 一键打分 / 改分
  const handleQuickRate = async (star: number) => {
    if (!isLoggedIn) {
      goToLogin();
      return;
    }
    setRatingSaving(true);
    setRatingNotice(null);
    try {
      const res = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: star }),
      });
      const json = (await res.json()) as { ratingSummary?: RatingSummary; error?: string };
      if (!res.ok) throw new Error(json.error || "Failed");
      if (json.ratingSummary) {
        setRatingSummary(json.ratingSummary);
        setPostRating(star);
      }
      setRatingNotice(isZh ? `已打分 ★${star}（${starLabels[star]}）` : `★${star}（${starLabels[star]}）を保存しました`);
    } catch (err) {
      setRatingNotice(err instanceof Error ? err.message : "Error");
    } finally {
      setRatingSaving(false);
    }
  };

  // 发表顶层留言
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      goToLogin();
      return;
    }
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          rating: postRating,
          website: honeypot,
          locale,
        }),
      });
      const json = (await res.json()) as {
        comment?: CommunityComment;
        ratingSummary?: RatingSummary;
        error?: string;
      };
      if (!res.ok || !json.comment) {
        setErrorMsg(json.error || (isZh ? "发布失败" : "投稿に失敗しました"));
        return;
      }

      setComments((prev) => [json.comment!, ...prev]);
      setTotalComments((prev) => prev + 1);
      if (json.ratingSummary) setRatingSummary(json.ratingSummary);
      setContent("");
    } catch {
      setErrorMsg(isZh ? "网络异常，请稍后重试" : "通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  // 发送楼中楼回复
  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyTarget || !replyContent.trim() || replySubmitting) return;
    if (!isLoggedIn) {
      goToLogin();
      return;
    }

    setReplySubmitting(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyContent,
          parentId: replyTarget.parentId,
          replyToName: replyTarget.replyToName,
          website: honeypot,
          locale,
        }),
      });
      const json = (await res.json()) as { comment?: CommunityReply; error?: string };
      if (!res.ok || !json.comment) {
        setReplyError(json.error || (isZh ? "回复失败" : "返信に失敗しました"));
        return;
      }

      const newReply: CommunityReply = {
        id: json.comment.id,
        parentId: replyTarget.parentId,
        authorName: json.comment.authorName,
        authorAvatar: json.comment.authorAvatar,
        replyToName: json.comment.replyToName,
        content: json.comment.content,
        likesCount: 0,
        likedByMe: false,
        canDelete: true,
        createdAt: json.comment.createdAt,
      };

      setComments((prev) =>
        prev.map((c) =>
          c.id === replyTarget.parentId ? { ...c, replies: [...c.replies, newReply] } : c
        )
      );
      setTotalComments((prev) => prev + 1);
      setReplyContent("");
      setReplyTarget(null);
    } catch {
      setReplyError(isZh ? "网络异常，请稍后重试" : "通信エラーが発生しました");
    } finally {
      setReplySubmitting(false);
    }
  };

  // 点赞 / 取消点赞
  const handleToggleLike = async (commentId: string, parentId?: string) => {
    if (!isLoggedIn) {
      goToLogin();
      return;
    }
    try {
      const res = await fetch(
        `/api/restaurants/${encodeURIComponent(restaurantId)}/comments/${encodeURIComponent(commentId)}/like`,
        { method: "POST" }
      );
      if (!res.ok) return;
      const json = (await res.json()) as { liked: boolean; likesCount: number };
      setComments((prev) =>
        prev.map((c) => {
          if (!parentId && c.id === commentId) {
            return { ...c, likedByMe: json.liked, likesCount: json.likesCount };
          }
          if (parentId && c.id === parentId) {
            return {
              ...c,
              replies: c.replies.map((r) =>
                r.id === commentId ? { ...r, likedByMe: json.liked, likesCount: json.likesCount } : r
              ),
            };
          }
          return c;
        })
      );
    } catch {
      // 忽略偶发网络抖动
    }
  };

  // 删除留言或回复
  const handleDelete = async (commentId: string, parentId?: string) => {
    if (!confirm(copy.deleteConfirm)) return;
    try {
      const res = await fetch(
        `/api/restaurants/${encodeURIComponent(restaurantId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) return;

      if (!parentId) {
        setComments((prev) => {
          const target = prev.find((c) => c.id === commentId);
          const removed = target ? 1 + target.replies.length : 1;
          setTotalComments((n) => Math.max(0, n - removed));
          return prev.filter((c) => c.id !== commentId);
        });
      } else {
        setComments((prev) =>
          prev.map((c) =>
            c.id === parentId
              ? { ...c, replies: c.replies.filter((r) => r.id !== commentId) }
              : c
          )
        );
        setTotalComments((n) => Math.max(0, n - 1));
      }
    } catch {
      // 忽略偶发网络抖动
    }
  };

  const activeDisplayStar = hoverStar || ratingSummary.myRating || 0;

  return (
    <section id="community" className="mb-12 scroll-mt-24">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <h2 className="flex items-center gap-2 font-serif text-2xl font-bold text-ink-900">
          <MessageSquare size={22} className="text-gold-300" />
          {copy.sectionTitle}
        </h2>
        <span className="text-xs text-ink-400">{copy.commentsCount(totalComments)}</span>
      </div>

      {/* 1. 食客打分卡 + 评分分布 + 一键互动打分 */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-[#111015] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="grid gap-6 md:grid-cols-[150px_1fr_220px] md:items-center">
          {/* 均分 */}
          <div className="text-center md:border-r md:border-white/10 md:pr-5">
            <div className="text-xs font-medium tracking-wider text-ink-400">{copy.ratingTitle}</div>
            <div className="mt-1 font-serif text-4xl font-black text-gold-300">
              {ratingSummary.count > 0 ? ratingSummary.average.toFixed(1) : "—"}
            </div>
            <div className="mt-1.5 flex items-center justify-center gap-0.5 text-gold-500">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={14}
                  className={s <= Math.round(ratingSummary.average) ? "fill-gold-300 text-gold-300" : "text-white/20"}
                />
              ))}
            </div>
            <div className="mt-1.5 text-xs text-ink-400">
              {ratingSummary.count > 0 ? copy.ratingCount(ratingSummary.count) : copy.noRatingYet}
            </div>
          </div>

          {/* 5 → 1 星分布进度条 */}
          <div className="space-y-1.5">
            {([5, 4, 3, 2, 1] as const).map((star) => {
              const cnt = ratingSummary.distribution[star] || 0;
              const pct = ratingSummary.count > 0 ? Math.round((cnt / ratingSummary.count) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2.5 text-xs">
                  <span className="w-7 shrink-0 text-right font-medium text-ink-400">{star}★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold-500 to-vermilion-500 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-7 shrink-0 text-ink-400">{cnt}</span>
                </div>
              );
            })}
          </div>

          {/* 互动打分区 */}
          <div className="flex flex-col items-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-center">
            <div className="text-xs font-semibold text-ink-700">
              {ratingSummary.myRating
                ? `${copy.ratedPrefix}：★${ratingSummary.myRating}`
                : isLoggedIn
                  ? copy.ratePrompt
                  : copy.loginToRate}
            </div>
            <div
              className="mt-2 flex items-center gap-1"
              onMouseLeave={() => setHoverStar(0)}
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  disabled={ratingSaving}
                  onMouseEnter={() => setHoverStar(star)}
                  onClick={() => handleQuickRate(star)}
                  aria-label={`${star} star`}
                  className="p-0.5 transition-transform hover:scale-125 disabled:opacity-50"
                >
                  <Star
                    size={24}
                    className={
                      star <= activeDisplayStar
                        ? "fill-gold-300 text-gold-300 drop-shadow-[0_0_8px_rgba(242,203,114,0.45)]"
                        : "text-white/25 hover:text-gold-300/70"
                    }
                  />
                </button>
              ))}
            </div>
            <div className="mt-1.5 min-h-[16px] text-[11px] text-gold-300/90">
              {ratingSaving
                ? "..."
                : hoverStar
                  ? starLabels[hoverStar]
                  : ratingNotice || (ratingSummary.myRating ? starLabels[ratingSummary.myRating] : "")}
            </div>
          </div>
        </div>
      </div>

      {/* 2. 发表留言 / 讨论表单 */}
      <div className="mb-8 rounded-2xl border border-white/10 bg-[#111015] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink-900">{copy.composerTitle}</h3>
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-400">
            <ShieldCheck size={13} className="text-gold-300" />
            {copy.spamHint}
          </span>
        </div>

        {isLoggedIn ? (
          <form onSubmit={handleSubmitComment}>
            {/* 隐形蜜罐字段：正常用户不可见，自动化垃圾脚本填写即会被后端拦截 */}
            <input
              type="text"
              name="website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />

            {/* 附带打分选择器 */}
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-400">
              <span>{copy.attachRating}：</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setPostRating(star)}
                    className="p-0.5 transition-transform hover:scale-110"
                  >
                    <Star
                      size={16}
                      className={
                        postRating && star <= postRating
                          ? "fill-gold-300 text-gold-300"
                          : "text-white/25 hover:text-gold-300/70"
                      }
                    />
                  </button>
                ))}
              </div>
              {postRating !== null && (
                <>
                  <span className="text-gold-300">{starLabels[postRating]}</span>
                  <button
                    type="button"
                    onClick={() => setPostRating(null)}
                    className="ml-1 text-[11px] text-ink-400 underline hover:text-white"
                  >
                    {copy.clearRating}
                  </button>
                </>
              )}
            </div>

            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  void handleSubmitComment(e);
                }
              }}
              rows={3}
              maxLength={800}
              placeholder={copy.placeholder}
              className="w-full rounded-xl border border-white/12 bg-[#0a090d] px-4 py-3 text-sm leading-relaxed text-ink-900 placeholder:text-ink-400 focus:border-gold-300/55 focus:outline-none focus:ring-2 focus:ring-gold-300/15"
            />

            {errorMsg && (
              <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-red-500/35 bg-red-950/45 px-3 py-2 text-xs text-red-200">
                <AlertCircle size={14} className="shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-ink-400">{[...content].length} / 800</span>
              <button
                type="submit"
                disabled={submitting || !content.trim()}
                className="btn-primary rounded-full px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                <span>{submitting ? copy.submittingBtn : copy.submitBtn}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-5 text-center sm:flex-row sm:text-left">
            <p className="text-sm text-ink-700">{copy.loginBanner}</p>
            <button
              type="button"
              onClick={goToLogin}
              className="btn-primary shrink-0 rounded-full px-5 py-2 text-sm"
            >
              <LogIn size={15} />
              {copy.loginBtn}
            </button>
          </div>
        )}
      </div>

      {/* 3. 留言与楼中楼讨论列表 */}
      {comments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 bg-[#0d0c11] py-10 text-center text-sm text-ink-400">
          {copy.emptyList}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {comments.map((comment) => {
            const isReplyingHere = replyTarget?.parentId === comment.id;
            return (
              <article
                key={comment.id}
                className="rounded-2xl border border-white/10 bg-[#111015] p-5 transition-colors hover:border-white/18"
              >
                {/* 顶层留言头部 */}
                <div className="flex items-start gap-3">
                  <Avatar name={comment.authorName} src={comment.authorAvatar} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-ink-900">{comment.authorName}</span>
                        {comment.rating !== null && (
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-gold-300/30 bg-gold-300/10 px-2 py-0.5 text-[11px] font-semibold text-gold-300">
                            <Star size={11} className="fill-gold-300 text-gold-300" />
                            {comment.rating}.0
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-ink-400">{formatTime(comment.createdAt, isZh)}</span>
                    </div>

                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700">
                      {comment.content}
                    </p>

                    {/* 操作栏：点赞 / 回复 / 删除 */}
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-400">
                      <button
                        type="button"
                        onClick={() => handleToggleLike(comment.id)}
                        className={`inline-flex items-center gap-1 transition-colors ${
                          comment.likedByMe ? "font-semibold text-vermilion-500" : "hover:text-white"
                        }`}
                      >
                        <ThumbsUp size={13} className={comment.likedByMe ? "fill-current" : ""} />
                        <span>{comment.likesCount > 0 ? comment.likesCount : isZh ? "赞" : "いいね"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!isLoggedIn) {
                            goToLogin();
                            return;
                          }
                          setReplyError(null);
                          setReplyContent("");
                          setReplyTarget(
                            isReplyingHere && replyTarget.replyToName === comment.authorName
                              ? null
                              : { parentId: comment.id, replyToName: comment.authorName }
                          );
                        }}
                        className="inline-flex items-center gap-1 transition-colors hover:text-gold-300"
                      >
                        <CornerDownRight size={13} />
                        <span>{copy.replyBtn}</span>
                      </button>

                      {comment.canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(comment.id)}
                          className="ml-auto inline-flex items-center gap-1 text-ink-400 transition-colors hover:text-red-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 楼中楼讨论回复串 */}
                {comment.replies.length > 0 && (
                  <div className="mt-4 ml-5 space-y-3 border-l border-white/12 pl-4 sm:ml-11">
                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="flex items-start gap-2.5">
                        <Avatar name={reply.authorName} src={reply.authorAvatar} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-bold text-ink-900">{reply.authorName}</span>
                              {reply.replyToName && (
                                <span className="text-ink-400">
                                  {copy.replyToPrefix} <span className="text-gold-300/90">@{reply.replyToName}</span>
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-ink-400">{formatTime(reply.createdAt, isZh)}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-700 sm:text-sm">
                            {reply.content}
                          </p>
                          <div className="mt-1.5 flex items-center gap-4 text-[11px] text-ink-400">
                            <button
                              type="button"
                              onClick={() => handleToggleLike(reply.id, comment.id)}
                              className={`inline-flex items-center gap-1 transition-colors ${
                                reply.likedByMe ? "font-semibold text-vermilion-500" : "hover:text-white"
                              }`}
                            >
                              <ThumbsUp size={12} className={reply.likedByMe ? "fill-current" : ""} />
                              <span>{reply.likesCount > 0 ? reply.likesCount : isZh ? "赞" : "いいね"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!isLoggedIn) {
                                  goToLogin();
                                  return;
                                }
                                setReplyError(null);
                                setReplyContent("");
                                setReplyTarget({ parentId: comment.id, replyToName: reply.authorName });
                              }}
                              className="inline-flex items-center gap-1 transition-colors hover:text-gold-300"
                            >
                              <CornerDownRight size={12} />
                              <span>{copy.replyBtn}</span>
                            </button>
                            {reply.canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDelete(reply.id, comment.id)}
                                className="ml-auto text-ink-400 transition-colors hover:text-red-400"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 内联回复框 */}
                {isReplyingHere && (
                  <form
                    onSubmit={handleSubmitReply}
                    className="mt-4 ml-5 rounded-xl border border-white/12 bg-[#0a090d] p-3 sm:ml-11"
                  >
                    <textarea
                      value={replyContent}
                      onChange={(e) => {
                        setReplyContent(e.target.value);
                        if (replyError) setReplyError(null);
                      }}
                      rows={2}
                      maxLength={500}
                      autoFocus
                      placeholder={copy.replyPlaceholder(replyTarget.replyToName)}
                      className="w-full resize-none bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
                    />
                    {replyError && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-300">
                        <AlertCircle size={13} />
                        <span>{replyError}</span>
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReplyTarget(null)}
                        className="rounded-full px-3 py-1 text-xs text-ink-400 hover:text-white"
                      >
                        {copy.cancel}
                      </button>
                      <button
                        type="submit"
                        disabled={replySubmitting || !replyContent.trim()}
                        className="btn-primary rounded-full px-4 py-1 text-xs disabled:opacity-50"
                      >
                        {replySubmitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        <span>{copy.replySend}</span>
                      </button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
