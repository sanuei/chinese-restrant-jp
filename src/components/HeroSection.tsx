"use client";

import { useTranslations } from "next-intl";
import { MapPinned, ScanSearch, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { locale: string };
type HeroMode = "search" | "verify";

const AUTH_BADGES = [
  { type: "authentic", tone: "vermilion" },
  { type: "adapted", tone: "gold" },
  { type: "japanese", tone: "blue" },
];

export default function HeroSection({ locale }: Props) {
  const t = useTranslations("home");
  const ta = useTranslations("auth_badge");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<HeroMode>("search");
  const isVerifyMode = mode === "verify";

  const copy = locale === "zh"
    ? {
        kicker: "AI VERIFIED CHINESE RESTAURANT GUIDE",
        headline: "东京与关东的真实中国味评鉴",
        searchTab: "找餐厅",
        verifyTab: "AI 鉴定",
        searchPlaceholder: "搜索餐厅、粤菜、茶餐厅、池袋…",
        verifyPlaceholder: "粘贴 Google Maps 店铺链接",
        searchButton: "搜索餐厅",
        verifyButton: "开始鉴定",
        note: "结合 Google 最新评论、菜系识别与 AI 可信评分",
        scope: "东京 / 关东地区",
        signal: "人工可审的数据体系",
      }
    : {
        kicker: "AI VERIFIED CHINESE RESTAURANT GUIDE",
        headline: "東京と関東の本格中華を見極める",
        searchTab: "探す",
        verifyTab: "AI 鑑定",
        searchPlaceholder: "店名・広東料理・池袋などで検索",
        verifyPlaceholder: "Google Maps の店舗リンクを貼り付け",
        searchButton: "検索",
        verifyButton: "鑑定する",
        note: "Google の最新レビュー、料理ジャンル、AI 信頼スコアを統合",
        scope: "東京 / 関東エリア",
        signal: "人が確認できるデータ設計",
      };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed && isVerifyMode) {
      router.push(`/${locale}/verify`);
      return;
    }
    if (!trimmed) return;

    const nextPath = isVerifyMode
      ? `/${locale}/verify?url=${encodeURIComponent(trimmed)}`
      : `/${locale}/restaurants?q=${encodeURIComponent(trimmed)}`;
    router.push(nextPath);
  };

  return (
    <section className="hero-luxury relative overflow-hidden">
      <div className="hero-luxury-image" aria-hidden />
      <div className="hero-luxury-grain" aria-hidden />
      <div className="hero-luxury-seal" aria-hidden>鑑</div>

      <div className="relative mx-auto flex min-h-[680px] max-w-7xl items-center px-4 py-16 sm:px-6 lg:min-h-[760px] lg:px-8">
        <div className="max-w-3xl">
          <div className="hero-kicker">
            <Sparkles size={15} />
            {copy.kicker}
          </div>

          <h1 className="mt-5 font-serif text-6xl font-black leading-[0.92] tracking-normal text-warm-50 sm:text-7xl lg:text-8xl">
            {t("hero_title")}
          </h1>

          <p className="mt-5 max-w-2xl font-serif text-2xl font-bold leading-tight text-gold-300 sm:text-3xl lg:text-4xl">
            {copy.headline}
          </p>

          <p className="mt-5 max-w-xl text-base leading-7 text-warm-100/82 sm:text-lg">
            {copy.note}
          </p>

          <form onSubmit={handleSearch} className="hero-command mt-10">
            <div className="hero-mode-switch" role="tablist" aria-label={locale === "zh" ? "选择操作" : "操作を選択"}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "search"}
                className={mode === "search" ? "is-active" : ""}
                onClick={() => setMode("search")}
              >
                <Search size={15} />
                {copy.searchTab}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "verify"}
                className={mode === "verify" ? "is-active" : ""}
                onClick={() => setMode("verify")}
              >
                <ScanSearch size={15} />
                {copy.verifyTab}
              </button>
            </div>

            <div className="hero-input-row">
              <div className="relative min-w-0 flex-1">
                {isVerifyMode ? (
                  <MapPinned
                    size={18}
                    className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-gold-300/80"
                  />
                ) : (
                  <Search
                    size={18}
                    className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-gold-300/80"
                  />
                )}
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={isVerifyMode ? copy.verifyPlaceholder : copy.searchPlaceholder}
                  className="hero-search-input"
                />
              </div>
              <button type="submit" className="hero-submit">
                {isVerifyMode ? copy.verifyButton : copy.searchButton}
              </button>
            </div>
          </form>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {AUTH_BADGES.map(({ type, tone }) => (
              <span key={type} className={`hero-cert-badge hero-cert-${tone}`}>
                <span className="hero-cert-dot" />
                {ta(type as "authentic" | "adapted" | "japanese")}
              </span>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 text-xs font-medium uppercase tracking-[0.16em] text-warm-100/62 sm:flex-row sm:items-center sm:gap-6">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck size={14} className="text-gold-300" />
              {copy.signal}
            </span>
            <span className="hidden h-px w-12 bg-gold-300/35 sm:block" />
            <span>{copy.scope}</span>
          </div>
        </div>
      </div>

      <div className="hero-bottom-hint" aria-hidden>
        <span>{locale === "zh" ? "按菜系找餐厅" : "料理ジャンルから探す"}</span>
      </div>
    </section>
  );
}
