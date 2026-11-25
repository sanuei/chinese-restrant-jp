"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ChevronRight,
  Compass,
  MapPin,
  Navigation,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  TrainFront,
  X,
} from "lucide-react";
import {
  CHINESE_SUPPORT_META,
  LIFE_CATEGORY_META,
  chineseSupportLevels,
  lifeCategories,
  type ChineseSupportLevel,
  type LifeCategory,
} from "@/lib/life-types";
import { LIFE_CATEGORY_ICONS } from "@/lib/life-icons";

export type LifePlaceCardItem = {
  id: string;
  name: string;
  category: LifeCategory;
  chineseSupport: ChineseSupportLevel;
  ward: string;
  stationLabel: string | null;
  stationKeys: string[];
  rating: number;
  reviewCount: number;
  summary: string | null;
  tags: string[];
  photo: string | null;
  mapsUrl: string;
  isTempClosed: boolean;
  searchText: string;
  createdAt: string;
};

type Props = {
  locale: string;
  places: LifePlaceCardItem[];
  stationOptions: { key: string; label: string; count: number }[];
  initialCategory: string;
  initialQuery: string;
  initialSupport: string;
  initialStation: string;
};

type SortKey = "rating" | "reviews" | "newest";

export default function LifeExplorer({
  locale,
  places,
  stationOptions,
  initialCategory,
  initialQuery,
  initialSupport,
  initialStation,
}: Props) {
  const isZh = locale === "zh";

  const [category, setCategory] = useState<string>(initialCategory);
  const [query, setQuery] = useState<string>(initialQuery);
  const [support, setSupport] = useState<string>(initialSupport);
  const [station, setStation] = useState<string>(initialStation);
  const [sortBy, setSortBy] = useState<SortKey>("rating");

  const copy = useMemo(
    () => ({
      badge: isZh ? "在日华人生活指南" : "在日中華ライフガイド",
      title: isZh ? "华人生活专区" : "生活サービス特集",
      subtitle: isZh
        ? "精选东京与关东可中文沟通的理发沙龙、医院诊所、健身私教、中医推拿、美甲美容、KTV 与房产签证服务，省去语言顾虑。"
        : "東京・関東で中国語対応のヘアサロン、クリニック、ジム、整体、美容、カラオケ、不動産・ビザ窓口を厳選。",
      searchPlaceholder: isZh
        ? "搜索理发、牙科、内科、健身、池袋、新宿…"
        : "ヘアサロン・歯科・内科・ジム・池袋などで検索…",
      allCategories: isZh ? "全部分类" : "すべて",
      allSupport: isZh ? "全部中文服务" : "すべての対応",
      allAreas: isZh ? "全部商圈" : "全エリア",
      sortRating: isZh ? "口碑优先" : "評価順",
      sortReviews: isZh ? "热度优先" : "レビュー順",
      sortNewest: isZh ? "最新收录" : "新着順",
      countLabel: (n: number) => (isZh ? `共 ${n} 家门店` : `全 ${n} 件`),
      reviewsUnit: isZh ? "条评" : "件",
      detail: isZh ? "查看详情" : "詳細",
      navigate: isZh ? "导航" : "地図",
      reset: isZh ? "清除筛选" : "リセット",
      tempClosed: isZh ? "暂停营业" : "一時休業",
      emptyTitle: isZh ? "当前筛选下暂无收录门店" : "条件に合うスポットがありません",
      emptyDesc: isZh
        ? "可以切换其他分类或清空搜索条件，我们会持续扩充更多优质华人生活门店。"
        : "別のカテゴリーや条件をお試しください。掲載スポットは随時拡充しています。",
    }),
    [isZh]
  );

  // 各分类实时门店数
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of places) {
      map[p.category] = (map[p.category] || 0) + 1;
    }
    return map;
  }, [places]);

  // 过滤 + 排序
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = places.filter((p) => {
      if (category && p.category !== category) return false;
      if (support && p.chineseSupport !== support) return false;
      if (station && !p.stationKeys.includes(station)) return false;
      if (q && !p.searchText.includes(q)) return false;
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === "reviews") {
        if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
        return b.rating - a.rating;
      }
      if (sortBy === "newest") {
        return b.createdAt.localeCompare(a.createdAt);
      }
      // 默认口碑优先（综合评分 + 评论数权重）
      const scoreA = a.rating * Math.log10(a.reviewCount + 12);
      const scoreB = b.rating * Math.log10(b.reviewCount + 12);
      if (Math.abs(scoreB - scoreA) > 0.001) return scoreB - scoreA;
      return b.rating - a.rating;
    });

    return sorted;
  }, [places, category, support, station, query, sortBy]);

  const hasFilter = Boolean(category || support || station || query.trim());

  const handleReset = () => {
    setCategory("");
    setSupport("");
    setStation("");
    setQuery("");
  };

  return (
    <div className="min-h-screen pb-20">
      {/* 顶部暗黑曜石氛围 Hero */}
      <section className="relative overflow-hidden border-b border-white/10 bg-[#07070a] py-12 sm:py-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 62% 280px at 50% 0%, rgba(235, 168, 52, 0.14) 0%, rgba(196, 62, 34, 0.07) 48%, transparent 78%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold-300/30 bg-gold-500/10 px-3.5 py-1 text-xs font-semibold tracking-wide text-gold-300">
              <Compass size={13} />
              <span>{copy.badge}</span>
              <span className="text-white/40">·</span>
              <span className="text-white/80">{copy.countLabel(places.length)}</span>
            </div>

            <h1 className="mt-4 font-serif text-3xl font-black tracking-tight text-white sm:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/65 sm:text-base">
              {copy.subtitle}
            </p>

            {/* 搜索框 */}
            <div className="relative mx-auto mt-6 max-w-xl">
              <Search
                size={17}
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-white/45"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={copy.searchPlaceholder}
                className="w-full rounded-full border border-white/15 bg-[#121118]/95 py-3.5 pr-11 pl-11 text-sm text-white shadow-[0_12px_36px_rgba(0,0,0,0.45)] placeholder:text-white/40 focus:border-gold-300/60 focus:outline-none focus:ring-2 focus:ring-gold-300/15"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear"
                  className="absolute top-1/2 right-3.5 -translate-y-1/2 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {/* 8 大生活分类快捷网格 */}
          <div className="mt-9 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-9">
            <button
              type="button"
              onClick={() => setCategory("")}
              className={`group flex flex-col items-center justify-center rounded-2xl border px-3 py-3.5 text-center transition-all ${
                !category
                  ? "border-gold-300/65 bg-gradient-to-b from-[#e05634]/22 to-[#14121a] text-white shadow-[0_10px_28px_rgba(224,86,52,0.22)]"
                  : "border-white/10 bg-[#121117]/85 text-white/75 hover:border-gold-300/40 hover:text-white"
              }`}
            >
              <Sparkles size={19} className={!category ? "text-gold-300" : "text-white/60 group-hover:text-gold-300"} />
              <span className="mt-2 text-xs font-bold">{copy.allCategories}</span>
              <span className="mt-0.5 text-[11px] text-white/45">{places.length}</span>
            </button>

            {lifeCategories.map((cat) => {
              const Icon = LIFE_CATEGORY_ICONS[cat];
              const meta = LIFE_CATEGORY_META[cat];
              const count = categoryCounts[cat] || 0;
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(active ? "" : cat)}
                  className={`group flex flex-col items-center justify-center rounded-2xl border px-2.5 py-3.5 text-center transition-all ${
                    active
                      ? "border-gold-300/70 bg-gradient-to-b from-gold-500/18 to-[#14121a] text-white shadow-[0_10px_28px_rgba(235,168,52,0.2)]"
                      : "border-white/10 bg-[#121117]/85 text-white/78 hover:border-gold-300/40 hover:bg-[#17151f] hover:text-white"
                  }`}
                >
                  <Icon
                    size={19}
                    style={{ color: active ? meta.accent : undefined }}
                    className={active ? "" : "text-gold-300/80 transition-transform group-hover:scale-110"}
                  />
                  <span className="mt-2 line-clamp-1 text-xs font-bold">
                    {isZh ? meta.zh : meta.ja}
                  </span>
                  <span className="mt-0.5 text-[11px] text-white/45">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 二级筛选条 + 结果区 */}
      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        {/* 当前分类说明 */}
        {category && lifeCategories.includes(category as LifeCategory) && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-gold-300/20 bg-gradient-to-r from-gold-500/10 via-[#13121a] to-[#13121a] px-4 py-3">
            <div>
              <h2 className="font-serif text-base font-bold text-white">
                {isZh
                  ? LIFE_CATEGORY_META[category as LifeCategory].zh
                  : LIFE_CATEGORY_META[category as LifeCategory].ja}
              </h2>
              <p className="mt-0.5 text-xs text-white/60">
                {isZh
                  ? LIFE_CATEGORY_META[category as LifeCategory].descZh
                  : LIFE_CATEGORY_META[category as LifeCategory].descJa}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCategory("")}
              className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 hover:border-gold-300/50 hover:text-gold-300"
            >
              {copy.allCategories}
            </button>
          </div>
        )}

        {/* 中文支持度 + 商圈 + 排序 */}
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#100f15] p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* 中文支持度胶囊 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSupport("")}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  !support
                    ? "border-gold-300/60 bg-gold-500/18 text-gold-300"
                    : "border-white/10 bg-white/[0.04] text-white/70 hover:text-white"
                }`}
              >
                {copy.allSupport}
              </button>
              {chineseSupportLevels.map((lvl) => {
                const active = support === lvl;
                const meta = CHINESE_SUPPORT_META[lvl];
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSupport(active ? "" : lvl)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      active
                        ? "border-gold-300/70 bg-vermilion-700 text-white"
                        : "border-white/10 bg-white/[0.04] text-white/75 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    {isZh ? meta.zh : meta.ja}
                  </button>
                );
              })}
            </div>

            {/* 数量 + 排序 */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-white/70">
                {copy.countLabel(filtered.length)}
              </span>
              {hasFilter && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 text-xs font-medium text-gold-300 hover:underline"
                >
                  <RotateCcw size={12} />
                  {copy.reset}
                </button>
              )}
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#171620] p-0.5">
                <ArrowUpDown size={11} className="ml-1.5 text-white/40" />
                {(
                  [
                    { key: "rating", label: copy.sortRating },
                    { key: "reviews", label: copy.sortReviews },
                    { key: "newest", label: copy.sortNewest },
                  ] as { key: SortKey; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSortBy(opt.key)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                      sortBy === opt.key
                        ? "bg-white/12 text-gold-300"
                        : "text-white/55 hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 热门商圈快捷条 */}
          {stationOptions.length > 0 && (
            <div className="scroll-row !gap-1.5 !pb-0 border-t border-white/[0.07] pt-2.5">
              <button
                type="button"
                onClick={() => setStation("")}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                  !station
                    ? "border-white/25 bg-white/12 text-white"
                    : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white"
                }`}
              >
                {copy.allAreas}
              </button>
              {stationOptions.map((st) => {
                const active = station === st.key;
                return (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setStation(active ? "" : st.key)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                      active
                        ? "border-gold-300/65 bg-vermilion-700 text-white"
                        : "border-white/10 bg-white/[0.03] text-white/70 hover:border-gold-300/35 hover:text-white"
                    }`}
                  >
                    {st.label}
                    <span className={`ml-1 text-[10px] ${active ? "text-white/80" : "text-white/40"}`}>
                      {st.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 门店卡片网格 */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#111016] px-6 py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-gold-300">
              <MapPin size={22} />
            </div>
            <p className="text-base font-bold text-white">{copy.emptyTitle}</p>
            <p className="mt-1.5 text-xs text-white/55">{copy.emptyDesc}</p>
            {hasFilter && (
              <button
                type="button"
                onClick={handleReset}
                className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-gold-300/45 bg-gold-500/15 px-4 py-2 text-xs font-semibold text-gold-300 hover:bg-gold-500/25"
              >
                <RotateCcw size={13} />
                {copy.reset}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => {
              const catMeta = LIFE_CATEGORY_META[item.category];
              const supportMeta = CHINESE_SUPPORT_META[item.chineseSupport];
              const CatIcon = LIFE_CATEGORY_ICONS[item.category];
              return (
                <article
                  key={item.id}
                  className="restaurant-card group flex flex-col overflow-hidden"
                >
                  {/* 封面图 */}
                  <Link
                    href={`/${locale}/life/${item.id}`}
                    className="relative block h-44 w-full overflow-hidden bg-[#181620]"
                  >
                    {item.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.photo}
                        alt={item.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#1b1924] to-[#100f15] text-white/25">
                        <CatIcon size={34} style={{ color: catMeta.accent, opacity: 0.55 }} />
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />

                    {/* 左上：中文服务徽章 */}
                    <span
                      className={`absolute top-3 left-3 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold backdrop-blur-md ${supportMeta.cls}`}
                    >
                      {isZh ? supportMeta.zh : supportMeta.ja}
                    </span>

                    {/* 右上：暂停营业或分类角标 */}
                    {item.isTempClosed ? (
                      <span className="absolute top-3 right-3 rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[11px] font-bold text-black">
                        {copy.tempClosed}
                      </span>
                    ) : (
                      <span
                        className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-md"
                        style={{ color: catMeta.accent }}
                      >
                        <CatIcon size={11} />
                        {isZh ? catMeta.zh : catMeta.ja}
                      </span>
                    )}

                    {/* 左下：评分 */}
                    {item.rating > 0 && (
                      <div className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/75 px-2.5 py-0.5 text-xs font-bold text-gold-300 backdrop-blur-sm">
                        <Star size={12} className="fill-gold-300 text-gold-300" />
                        <span>{item.rating.toFixed(1)}</span>
                        {item.reviewCount > 0 && (
                          <span className="font-normal text-white/60">
                            ({item.reviewCount}
                            {copy.reviewsUnit})
                          </span>
                        )}
                      </div>
                    )}
                  </Link>

                  {/* 卡片正文 */}
                  <div className="flex flex-1 flex-col p-4">
                    <Link
                      href={`/${locale}/life/${item.id}`}
                      className="line-clamp-1 font-serif text-base font-bold text-white transition-colors group-hover:text-gold-300"
                    >
                      {item.name}
                    </Link>

                    {/* 车站 / 行政区 */}
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-white/55">
                      <TrainFront size={13} className="shrink-0 text-gold-300/75" />
                      <span className="truncate">{item.stationLabel || item.ward}</span>
                    </div>

                    {/* AI 服务亮点摘要 */}
                    {item.summary && (
                      <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-white/68">
                        {item.summary}
                      </p>
                    )}

                    {/* 特色标签 */}
                    {item.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/70"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 底部按钮 */}
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.07] pt-3.5">
                      <Link
                        href={`/${locale}/life/${item.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gold-300 hover:underline"
                      >
                        {copy.detail}
                        <ChevronRight size={13} />
                      </Link>
                      <a
                        href={item.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/75 transition-colors hover:border-gold-300/45 hover:text-gold-300"
                      >
                        <Navigation size={11} />
                        {copy.navigate}
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
