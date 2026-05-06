"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, MapPin, SearchCheck, Sparkles, Star } from "lucide-react";

type VerifyResult = {
  success: boolean;
  accepted: boolean;
  status: "accepted" | "rejected";
  reasons: string[];
  restaurant: {
    id: string;
    name: string;
    address: string;
    region: string | null;
    area: string | null;
    rating: number;
    reviewCount: number;
    mapsUrl: string;
  };
  verdict: "gachi" | "adapted" | "japanese" | "unknown";
  analysis: {
    cuisine_type: string;
    cuisine_confidence: number;
    authenticity: string;
    authenticity_score: number;
    authenticity_reason_zh: string;
    authenticity_reason_ja: string;
    ai_summary_zh: string;
    ai_summary_ja: string;
  };
  reviews: {
    author_name: string;
    rating: number;
    text: string;
    language: string;
    credibility_score: number;
    credibility_action: string;
  }[];
};

const cuisineZh: Record<string, string> = {
  sichuan: "川菜",
  cantonese: "粤菜",
  northern: "北方菜",
  fujian: "闽菜",
  hunan: "湘菜",
  jiangsu: "苏浙菜",
  northwest: "西北菜",
  yunnan: "云贵菜",
  other: "综合/其他",
};

const cuisineJa: Record<string, string> = {
  sichuan: "四川料理",
  cantonese: "広東料理",
  northern: "北方料理",
  fujian: "福建料理",
  hunan: "湖南料理",
  jiangsu: "江蘇・上海料理",
  northwest: "西北料理",
  yunnan: "雲南・貴州料理",
  other: "総合・その他",
};

const verdictCopy = {
  zh: {
    gachi: "ガチ中華",
    adapted: "改良中華",
    japanese: "日式中华",
    unknown: "待确认",
  },
  ja: {
    gachi: "ガチ中華",
    adapted: "アレンジ中華",
    japanese: "日式中華",
    unknown: "要確認",
  },
};

export default function VerifyTool({ locale, initialUrl = "" }: { locale: string; initialUrl?: string }) {
  const isZh = locale === "zh";
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);

  const copy = isZh
    ? {
        title: "ガチ中華鉴定所",
        lead: "粘贴 Google Maps 店铺链接，AI 会读取餐厅信息和最新评论，判断它是不是值得收录的中餐厅。",
        placeholder: "粘贴 Google Maps 店铺链接，例如 https://maps.app.goo.gl/...",
        button: "开始鉴定",
        running: "鉴定中",
        accepted: "已收录到网页",
        rejected: "已保存记录，暂不显示",
        rule: "当前只自动展示关东地区的中餐厅；其他地区或非中餐厅会保留为后台记录。",
        result: "鉴定结果",
        evidence: "AI 依据",
        reviews: "最新评论样本",
        view: "查看餐厅页",
        maps: "打开 Google Maps",
      }
    : {
        title: "ガチ中華鑑定所",
        lead: "Google Maps の店舗リンクを貼ると、AI が店舗情報と最新レビューを読んで判定します。",
        placeholder: "Google Maps の店舗リンクを貼り付け",
        button: "鑑定する",
        running: "鑑定中",
        accepted: "サイトに掲載しました",
        rejected: "記録しました。表示は保留です",
        rule: "現在は関東エリアの中国料理店のみ自動掲載します。対象外は管理側の記録に残します。",
        result: "鑑定結果",
        evidence: "AI の根拠",
        reviews: "最新レビュー例",
        view: "店舗ページを見る",
        maps: "Google Maps を開く",
      };

  async function submitVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, locale }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Verify failed");
      setResult(payload as VerifyResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setLoading(false);
    }
  }

  const cuisineLabels = isZh ? cuisineZh : cuisineJa;
  const verdictLabel = result ? verdictCopy[isZh ? "zh" : "ja"][result.verdict] : "";
  const reason = result ? (isZh ? result.analysis.authenticity_reason_zh : result.analysis.authenticity_reason_ja) : "";
  const summary = result ? (isZh ? result.analysis.ai_summary_zh : result.analysis.ai_summary_ja) : "";

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-xl border border-warm-200 bg-white p-6 shadow-sm md:p-8">
        <div className="absolute right-6 top-4 select-none font-serif text-8xl font-black text-vermilion-700 opacity-[0.04]">
          鑑
        </div>
        <div className="relative max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-vermilion-50 px-3 py-1 text-xs font-bold text-vermilion-700">
            <Sparkles size={14} /> AI Gachi Check
          </div>
          <h1 className="font-serif text-4xl font-black text-vermilion-700 md:text-5xl">{copy.title}</h1>
          <p className="mt-3 text-base text-ink-700 md:text-lg">{copy.lead}</p>
          <p className="mt-2 text-sm text-ink-400">{copy.rule}</p>
        </div>

        <form onSubmit={submitVerify} className="relative mt-8 flex flex-col gap-3 md:flex-row">
          <div className="relative min-w-0 flex-1">
            <SearchCheck className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-ink-400" />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={copy.placeholder}
              className="search-input search-input-with-icon"
            />
          </div>
          <button type="submit" disabled={loading || !url.trim()} className="btn-primary min-h-[56px] shrink-0 disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? copy.running : copy.button}
          </button>
        </form>

        {loading && (
          <div className="mt-5 grid gap-2 text-sm text-ink-400 md:grid-cols-4">
            {["Google Maps", "最新评论", "菜系判断", "收录规则"].map((step, index) => (
              <div key={step} className="rounded-lg bg-warm-50 px-3 py-2">
                <span className="mr-2 text-vermilion-700">{index + 1}</span>{step}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </section>

      {result && (
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-warm-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-vermilion-500">{copy.result}</p>
                <h2 className="mt-2 text-2xl font-black text-ink-900">{result.restaurant.name}</h2>
                <p className="mt-1 flex items-center gap-1 text-sm text-ink-400">
                  <MapPin size={14} /> {result.restaurant.address}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${
                result.accepted ? "bg-green-50 text-green-700" : "bg-gold-300/30 text-gold-700"
              }`}>
                {result.accepted ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                {result.accepted ? copy.accepted : copy.rejected}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Verdict" value={verdictLabel} />
              <Metric label={isZh ? "菜系" : "ジャンル"} value={cuisineLabels[result.analysis.cuisine_type] || result.analysis.cuisine_type} />
              <Metric label={isZh ? "正宗度" : "認定スコア"} value={`${result.analysis.authenticity_score}`} />
              <Metric label="Google" value={`${result.restaurant.rating.toFixed(1)} / ${result.restaurant.reviewCount}`} />
            </div>

            <div className="mt-6 rounded-lg bg-warm-50 p-4">
              <p className="text-sm font-bold text-vermilion-700">{copy.evidence}</p>
              <p className="mt-2 text-sm leading-7 text-ink-700">{reason}</p>
              <p className="mt-2 text-sm text-ink-400">{summary}</p>
              {result.reasons.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.reasons.map((item) => (
                    <span key={item} className="rounded-full bg-white px-2.5 py-1 text-xs text-ink-400">
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {result.accepted && (
                <Link href={`/${locale}/restaurants/${result.restaurant.id}`} className="btn-primary">
                  {copy.view}
                </Link>
              )}
              <a href={result.restaurant.mapsUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-warm-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:text-vermilion-700">
                {copy.maps} <ExternalLink size={14} />
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-warm-200 bg-white p-6 shadow-sm">
            <h3 className="font-bold text-ink-900">{copy.reviews}</h3>
            <div className="mt-4 space-y-3">
              {result.reviews.slice(0, 5).map((review, index) => (
                <div key={`${review.author_name}-${index}`} className="rounded-lg border border-warm-200 p-3">
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs text-ink-400">
                    <span className="flex items-center gap-1 text-gold-700">
                      <Star size={13} className="fill-current" /> {review.rating}
                    </span>
                    <span>{review.language} · {review.credibility_score}</span>
                  </div>
                  <p className="line-clamp-4 text-sm leading-6 text-ink-700">{review.text}</p>
                </div>
              ))}
              {result.reviews.length === 0 && (
                <p className="text-sm text-ink-400">{isZh ? "没有可展示的评论正文。" : "表示できるレビュー本文がありません。"}</p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-warm-200 bg-white px-3 py-3">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-1 truncate text-lg font-black text-ink-900">{value}</div>
    </div>
  );
}
