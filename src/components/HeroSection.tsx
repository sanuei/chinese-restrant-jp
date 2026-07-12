import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";
import { cuisineTypes } from "@/lib/restaurant-types";
import { CUISINE_ICONS } from "@/lib/cuisine-icons";

type Props = { locale: string; counts: Record<string, number> };

const AUTH_BADGES = [
  { type: "authentic", tone: "vermilion" },
  { type: "adapted", tone: "gold" },
  { type: "japanese", tone: "blue" },
];

export default async function HeroSection({ locale, counts }: Props) {
  const t = await getTranslations({ locale, namespace: "home" });
  const ta = await getTranslations({ locale, namespace: "auth_badge" });
  const tc = await getTranslations({ locale, namespace: "cuisine" });

  const copy = locale === "zh"
    ? {
        kicker: "AI VERIFIED CHINESE RESTAURANT GUIDE",
        headline: "东京与关东的真实中国味评鉴",
        note: "结合 Google 最新评论、菜系识别与 AI 可信评分",
        cuisinePrompt: "按菜系直接找店",
        scope: "东京 / 关东地区",
        signal: "人工可审的数据体系",
        bottomHint: "浏览全部餐厅 →",
      }
    : {
        kicker: "AI VERIFIED CHINESE RESTAURANT GUIDE",
        headline: "東京と関東の本格中華を見極める",
        note: "Google の最新レビュー、料理ジャンル、AI 信頼スコアを統合",
        cuisinePrompt: "料理ジャンルから直接探す",
        scope: "東京 / 関東エリア",
        signal: "人が確認できるデータ設計",
        bottomHint: "全レストランを見る →",
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

          <div className="mt-10">
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-gold-300/80">
              {copy.cuisinePrompt}
            </div>
            <div className="hero-cuisine-grid grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-9">
              {cuisineTypes.map((key) => {
                const Icon = CUISINE_ICONS[key];
                return (
                  <Link key={key} href={`/${locale}/restaurants?cuisine=${key}`} className="hero-cuisine-chip">
                    <Icon size={24} />
                    <span className="hero-cuisine-chip-label">{tc(key)}</span>
                    <span className="hero-cuisine-chip-count">
                      {counts[key] !== undefined ? `${counts[key]}店` : "-"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

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

      <Link href={`/${locale}/restaurants`} className="hero-bottom-hint" aria-hidden>
        <span>{copy.bottomHint}</span>
      </Link>
    </section>
  );
}
