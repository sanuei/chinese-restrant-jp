"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

type Props = { locale: string };

const AUTH_BADGES = [
  { type: "authentic", emoji: "🔴", className: "badge-authentic" },
  { type: "adapted",   emoji: "🟡", className: "badge-adapted" },
  { type: "japanese",  emoji: "🔵", className: "badge-japanese" },
];

export default function HeroSection({ locale }: Props) {
  const t = useTranslations("home");
  const ta = useTranslations("auth_badge");
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/${locale}/restaurants?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <section
      className="relative py-20 sm:py-28 hero-pattern overflow-hidden"
      style={{ background: "linear-gradient(135deg, var(--color-warm-50) 0%, var(--color-vermilion-50) 100%)" }}
    >
      {/* 装饰性背景文字 */}
      <div
        className="absolute right-8 top-8 text-[180px] font-black opacity-[0.03] select-none leading-none font-serif"
        style={{ color: "var(--color-vermilion-700)" }}
        aria-hidden
      >
        食
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
        {/* 品牌名 */}
        <div className="mb-2 text-sm font-semibold tracking-widest uppercase"
             style={{ color: "var(--color-vermilion-500)" }}>
          {locale === "zh" ? "在日中国餐厅权威评鉴" : "在日中国料理 権威レビューガイド"}
        </div>

        <h1 className="font-serif font-black text-5xl sm:text-7xl mb-4 leading-tight"
            style={{ color: "var(--color-vermilion-700)" }}>
          {t("hero_title")}
        </h1>

        <p className="text-lg sm:text-xl mb-10"
           style={{ color: "var(--color-ink-700)" }}>
          {t("hero_tagline")}
        </p>

        {/* 搜索框 */}
        <form onSubmit={handleSearch} className="flex gap-3 max-w-2xl mx-auto mb-10">
          <div className="relative flex-1 min-w-0">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10"
              style={{ color: "var(--color-ink-400)" }}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_placeholder")}
              className="search-input search-input-with-icon"
            />
          </div>
          <button type="submit" className="btn-primary shrink-0">
            {t("search_btn")}
          </button>
        </form>

        <Link
          href={`/${locale}/verify`}
          className="mx-auto mb-8 flex max-w-xl items-center justify-between gap-3 rounded-xl border border-vermilion-100 bg-white/80 px-4 py-3 text-left shadow-sm transition-colors hover:border-vermilion-200 hover:bg-white"
        >
          <span>
            <span className="block text-sm font-bold text-vermilion-700">
              {locale === "zh" ? "ガチ中華鉴定所" : "ガチ中華鑑定所"}
            </span>
            <span className="block text-xs text-ink-400">
              {locale === "zh"
                ? "粘贴 Google Maps 链接，让 AI 判断这家店正不正。"
                : "Google Maps リンクを貼って、AI がガチ度を判定。"}
            </span>
          </span>
          <span className="shrink-0 rounded-md bg-vermilion-700 px-3 py-1.5 text-xs font-bold text-white">
            {locale === "zh" ? "去鉴定" : "鑑定へ"}
          </span>
        </Link>

        {/* 认证说明 */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {AUTH_BADGES.map(({ type, emoji, className }) => (
            <span key={type} className={className}>
              {emoji} {ta(type as "authentic" | "adapted" | "japanese")}
            </span>
          ))}
          <span className="text-xs ml-1" style={{ color: "var(--color-ink-400)" }}>
            {locale === "zh" ? "AI 智能认证" : "AI自動認定"}
          </span>
        </div>
      </div>
    </section>
  );
}
