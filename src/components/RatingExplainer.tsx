"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Star, Info } from "lucide-react";

type Props = {
  locale: string;
  rawRating: number;
  rawReviewCount: number;
  trustedRating: number;
  authenticityScore: number;
};

const copy = {
  zh: {
    title: "评分说明",
    toggle: "ガチ中華 如何计算评分？",
    step1Title: "① Google 原始评分",
    step1Desc: "来自 Google Maps 的原始用户评分",
    step2Title: "② 贝叶斯加权修正",
    step2Desc: "评论数越少，评分越向全站均值（约 4.5 分）靠拢，防止少量极端好评虚高",
    step3Title: "③ AI 正宗度加成",
    step3Desc: "正宗度超过 60 分时自动加分，最高 +0.3 分，奖励真实的中国饭馆",
    finalTitle: "真实评分",
    reviews: "条评论",
    authentic: "正宗度",
    noBonus: "低于 60 分，无正宗度加成",
  },
  ja: {
    title: "評価説明",
    toggle: "ガチ中華の評価計算方法",
    step1Title: "① Google 元の評価",
    step1Desc: "Google Maps のユーザー評価をそのまま表示",
    step2Title: "② ベイズ加重補正",
    step2Desc: "レビュー数が少ないほど全店平均（約 4.5）に近づき、少数の極端な高評価による歪みを防ぎます",
    step3Title: "③ AI 本格度ボーナス",
    step3Desc: "本格度スコアが 60 点を超えると自動加算（最大 +0.3 点）",
    finalTitle: "真の評価",
    reviews: "件のレビュー",
    authentic: "本格度",
    noBonus: "60点未満のためボーナスなし",
  },
};

export default function RatingExplainer({
  locale,
  rawRating,
  rawReviewCount,
  trustedRating,
  authenticityScore,
}: Props) {
  const [open, setOpen] = useState(false);
  const t = copy[locale as "zh" | "ja"] ?? copy.zh;

  // 贝叶斯修正后（近似值，仅做说明用）
  const M = 598;
  const C = 4.5;
  const bayesRating = (rawReviewCount / (rawReviewCount + M)) * rawRating + (M / (rawReviewCount + M)) * C;
  const authBonus = authenticityScore > 60 ? ((authenticityScore - 60) / 100) * 0.3 : 0;
  const authPct = Math.min(100, authenticityScore);

  return (
    <div className="mt-6 rounded-xl border border-warm-200 bg-warm-50 overflow-hidden text-sm">
      {/* 折叠触发按钮 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-warm-100 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-semibold text-ink-700">
          <Info size={15} className="text-vermilion-700 shrink-0" />
          {t.toggle}
        </span>
        {open ? (
          <ChevronUp size={15} className="text-ink-400 shrink-0" />
        ) : (
          <ChevronDown size={15} className="text-ink-400 shrink-0" />
        )}
      </button>

      {/* 展开内容 */}
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-warm-200">
          {/* Step 1: Google 原始评分 */}
          <div className="pt-4">
            <div className="font-semibold text-ink-800 mb-1">{t.step1Title}</div>
            <p className="text-xs text-ink-400 mb-2">{t.step1Desc}</p>
            <div className="flex items-center gap-2">
              <Star size={14} className="fill-gold-500 text-gold-500" />
              <span className="font-bold text-base text-ink-900">{rawRating.toFixed(1)}</span>
              <span className="text-ink-400 text-xs">({rawReviewCount.toLocaleString()} {t.reviews})</span>
            </div>
          </div>

          {/* 分隔箭头 */}
          <div className="flex items-center gap-2 text-ink-300 text-xs">
            <div className="flex-1 h-px bg-warm-200" />
            <span>↓</span>
            <div className="flex-1 h-px bg-warm-200" />
          </div>

          {/* Step 2: 贝叶斯修正 */}
          <div>
            <div className="font-semibold text-ink-800 mb-1">{t.step2Title}</div>
            <p className="text-xs text-ink-400 mb-2">{t.step2Desc}</p>
            <div className="flex items-center gap-2">
              <Star size={14} className="fill-gold-500 text-gold-500" />
              <span className="font-bold text-base text-ink-900">{bayesRating.toFixed(2)}</span>
              <span className={`text-xs font-medium ${bayesRating >= rawRating ? "text-green-600" : "text-amber-600"}`}>
                ({bayesRating >= rawRating ? "+" : ""}{(bayesRating - rawRating).toFixed(2)})
              </span>
            </div>
          </div>

          {/* 分隔箭头 */}
          <div className="flex items-center gap-2 text-ink-300 text-xs">
            <div className="flex-1 h-px bg-warm-200" />
            <span>↓</span>
            <div className="flex-1 h-px bg-warm-200" />
          </div>

          {/* Step 3: 正宗度加成 */}
          <div>
            <div className="font-semibold text-ink-800 mb-1">{t.step3Title}</div>
            <p className="text-xs text-ink-400 mb-2">{t.step3Desc}</p>
            {/* 正宗度进度条 */}
            <div className="mb-2">
              <div className="flex justify-between text-xs text-ink-500 mb-1">
                <span>{t.authentic}</span>
                <span className="font-semibold">{authenticityScore}/100</span>
              </div>
              <div className="h-2 bg-warm-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${authPct}%`,
                    background: authPct >= 60
                      ? "linear-gradient(90deg, oklch(0.60 0.18 25), oklch(0.78 0.15 80))"
                      : "oklch(0.75 0.05 30)",
                  }}
                />
              </div>
            </div>
            {authBonus > 0 ? (
              <div className="text-xs font-medium text-vermilion-700">
                +{authBonus.toFixed(2)} {locale === "zh" ? "正宗度加成" : "本格度ボーナス"}
              </div>
            ) : (
              <div className="text-xs text-ink-400">{t.noBonus}</div>
            )}
          </div>

          {/* 最终评分高亮 */}
          <div className="rounded-lg bg-vermilion-50 border border-vermilion-100 px-4 py-3 flex items-center justify-between">
            <span className="font-bold text-vermilion-700">{t.finalTitle}</span>
            <div className="flex items-center gap-1.5">
              <Star size={16} className="fill-gold-500 text-gold-500" />
              <span className="font-black text-xl text-ink-900">{trustedRating.toFixed(1)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
