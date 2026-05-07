"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { MapPinned, Search, ShieldCheck, ShieldQuestion, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { locale: string };

export default function HeroSection({ locale }: Props) {
  const t = useTranslations("home");
  const router = useRouter();
  const [query, setQuery] = useState("");

  const copy = locale === "zh"
    ? {
        kicker: "TRUSTED CHINESE RESTAURANT GUIDE",
        headline: "可信评分、榜单推荐、按菜系与区域快速筛选",
        searchPlaceholder: "搜索餐厅、粤菜、茶餐厅、池袋…",
        searchButton: "开始找店",
        rankingButton: "查看本周榜单",
        note: "先逛榜单、再看区域、最后用筛选缩小范围，减少盲搜和无效点击。",
        scope: "东京 / 关东地区",
        signal: "人工可审的数据体系",
        trustPoints: ["可信评分", "菜系识别", "人工可审"] as const,
        hotQueries: ["池袋 川菜", "新宿 粤菜", "上野 一人食"] as const,
      }
    : {
        kicker: "TRUSTED CHINESE RESTAURANT GUIDE",
        headline: "信頼スコア、ランキング、料理別・エリア別の絞り込みで探す",
        searchPlaceholder: "店名・広東料理・池袋などで検索",
        searchButton: "店を探す",
        rankingButton: "今週のランキング",
        note: "先にランキングとエリアから入り、必要な条件だけ絞って判断できる導線です。",
        scope: "東京 / 関東エリア",
        signal: "人が確認できるデータ設計",
        trustPoints: ["信頼スコア", "料理識別", "人が確認可能"] as const,
        hotQueries: ["池袋 四川料理", "新宿 広東料理", "上野 一人ごはん"] as const,
      };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/${locale}/restaurants?q=${encodeURIComponent(trimmed)}` : `/${locale}/restaurants`);
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
            <div className="hero-mode-switch" aria-label={locale === "zh" ? "站点价值" : "サイト価値"}>
              <span className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gold-300">
                <ShieldCheck size={15} />
                {locale === "zh" ? "找更值得专程去的中餐馆" : "わざわざ行く価値がある店を探す"}
              </span>
            </div>

            <div className="hero-input-row">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-gold-300/80"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={copy.searchPlaceholder}
                  className="hero-search-input"
                />
              </div>
              <button type="submit" className="hero-submit">
                {copy.searchButton}
              </button>
              <Link
                href={`/${locale}/restaurants?sort=reviews`}
                className="inline-flex min-h-14 items-center justify-center rounded-md border border-gold-300/45 bg-transparent px-5 text-sm font-semibold text-warm-50 transition hover:bg-white/8"
              >
                {copy.rankingButton}
              </Link>
            </div>
          </form>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {copy.trustPoints.map((point, index) => (
              <span
                key={point}
                className={`hero-cert-badge ${index === 1 ? "hero-cert-gold" : index === 2 ? "hero-cert-blue" : ""}`}
              >
                <span className="hero-cert-dot" />
                {point}
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

          <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-warm-100/82">
            <span className="inline-flex items-center gap-2 font-semibold text-gold-300">
              <ShieldQuestion size={15} />
              {locale === "zh" ? "热门搜索" : "人気の探し方"}
            </span>
            {copy.hotQueries.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => router.push(`/${locale}/restaurants?q=${encodeURIComponent(item)}`)}
                className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-left transition hover:bg-white/15"
              >
                {item}
              </button>
            ))}
            <Link href={`/${locale}/verify`} className="inline-flex items-center gap-2 text-gold-300 hover:text-white">
              <MapPinned size={15} />
              {locale === "zh" ? "贴 Google Maps 链接做单店鉴定" : "Google Maps リンクで単店チェック"}
            </Link>
          </div>
        </div>
      </div>

      <div className="hero-bottom-hint" aria-hidden>
        <span>{locale === "zh" ? "榜单 · 场景 · 区域 · 菜系" : "ランキング・シーン・エリア・料理"}</span>
      </div>
    </section>
  );
}
