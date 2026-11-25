"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Flame,
  Map,
  RotateCcw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  X,
} from "lucide-react";

export type FilterOption = { value: string; label: string };

type Props = {
  locale: string;
  initial: {
    q: string;
    cuisine: string;
    dishType: string;
    station: string;
    authenticity: string;
    minRating: string;
    sort: string;
  };
  cuisineOptions: FilterOption[];
  dishTypeOptions: FilterOption[];
  stationOptions: FilterOption[];
  authenticityOptions: FilterOption[];
  mapHref: string;
  totalCountText: string;
};

type MobileSheet = null | "station" | "category" | "sort" | "more";
type CategoryTab = "featured" | "dish" | "cuisine";

const QUICK_DISH_KEYS = [
  "deli",
  "grocery",
  "hotpot",
  "malatang",
  "stirfry",
  "bbq",
  "noodles",
  "stewpot",
  "breakfast",
  "dimsum",
] as const;

export default function RestaurantFilterBar({
  locale,
  initial,
  cuisineOptions,
  dishTypeOptions,
  stationOptions,
  authenticityOptions,
  mapHref,
  totalCountText,
}: Props) {
  const router = useRouter();
  const isZh = locale === "zh";
  const [isPending, startTransition] = useTransition();

  const [queryText, setQueryText] = useState(initial.q);
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const [categoryTab, setCategoryTab] = useState<CategoryTab>("featured");

  // 移动端“筛选”面板内的临时选择（点确定才提交）
  const [draftAuth, setDraftAuth] = useState(initial.authenticity);
  const [draftMinRating, setDraftMinRating] = useState(initial.minRating);

  const dishLabelMap = Object.fromEntries(dishTypeOptions.map((o) => [o.value, o.label]));
  const cuisineLabelMap = Object.fromEntries(cuisineOptions.map((o) => [o.value, o.label]));
  const stationLabelMap = Object.fromEntries(stationOptions.map((o) => [o.value, o.label]));
  const authLabelMap = Object.fromEntries(authenticityOptions.map((o) => [o.value, o.label]));

  const sortOptions: FilterOption[] = isZh
    ? [
        { value: "rating", label: "可信评分优先" },
        { value: "reviews", label: "评论量优先" },
        { value: "newest", label: "最新收录优先" },
      ]
    : [
        { value: "rating", label: "信頼スコア順" },
        { value: "reviews", label: "レビュー数順" },
        { value: "newest", label: "新着順" },
      ];

  const minRatingChoices: FilterOption[] = isZh
    ? [
        { value: "", label: "不限评分" },
        { value: "4.5", label: "4.5分以上" },
        { value: "4", label: "4.0分以上" },
        { value: "3.5", label: "3.5分以上" },
      ]
    : [
        { value: "", label: "指定なし" },
        { value: "4.5", label: "4.5以上" },
        { value: "4", label: "4.0以上" },
        { value: "3.5", label: "3.5以上" },
      ];

  const navigateWith = (patch: Partial<typeof initial>) => {
    const next = { ...initial, q: queryText.trim(), ...patch };
    const sp = new URLSearchParams();
    if (next.q) sp.set("q", next.q);
    if (next.cuisine) sp.set("cuisine", next.cuisine);
    if (next.dishType) sp.set("dish_type", next.dishType);
    if (next.station) sp.set("station", next.station);
    if (next.authenticity) sp.set("authenticity", next.authenticity);
    if (next.minRating) sp.set("minRating", next.minRating);
    if (next.sort && next.sort !== "rating") sp.set("sort", next.sort);

    const qs = sp.toString();
    setMobileSheet(null);
    startTransition(() => {
      router.push(`/${locale}/restaurants${qs ? `?${qs}` : ""}`);
    });
  };

  const resetAll = () => {
    setQueryText("");
    setDraftAuth("");
    setDraftMinRating("");
    setMobileSheet(null);
    startTransition(() => {
      router.push(`/${locale}/restaurants`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateWith({ q: queryText.trim() });
  };

  // 已激活的筛选条件标签（支持一键单独清除）
  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (initial.q) {
    activeChips.push({
      key: "q",
      label: isZh ? `关键词: ${initial.q}` : `検索: ${initial.q}`,
      onRemove: () => {
        setQueryText("");
        navigateWith({ q: "" });
      },
    });
  }
  if (initial.dishType) {
    activeChips.push({
      key: "dishType",
      label: `${isZh ? "品类" : "業態"}: ${dishLabelMap[initial.dishType] || initial.dishType}`,
      onRemove: () => navigateWith({ dishType: "" }),
    });
  }
  if (initial.cuisine) {
    activeChips.push({
      key: "cuisine",
      label: `${isZh ? "菜系" : "ジャンル"}: ${cuisineLabelMap[initial.cuisine] || initial.cuisine}`,
      onRemove: () => navigateWith({ cuisine: "" }),
    });
  }
  if (initial.station) {
    activeChips.push({
      key: "station",
      label: `${isZh ? "商圈" : "エリア"}: ${stationLabelMap[initial.station] || initial.station}`,
      onRemove: () => navigateWith({ station: "" }),
    });
  }
  if (initial.authenticity) {
    activeChips.push({
      key: "authenticity",
      label: authLabelMap[initial.authenticity] || initial.authenticity,
      onRemove: () => navigateWith({ authenticity: "" }),
    });
  }
  if (initial.minRating) {
    activeChips.push({
      key: "minRating",
      label: `${initial.minRating}+ ★`,
      onRemove: () => navigateWith({ minRating: "" }),
    });
  }

  const hasAnyFilter = activeChips.length > 0 || initial.sort !== "rating";
  const moreFilterCount = (initial.authenticity ? 1 : 0) + (initial.minRating ? 1 : 0);

  const mobileCategoryLabel = initial.dishType
    ? dishLabelMap[initial.dishType]
    : initial.cuisine
      ? cuisineLabelMap[initial.cuisine]
      : isZh
        ? "全部分类"
        : "カテゴリ";

  const mobileStationLabel = initial.station
    ? stationLabelMap[initial.station]
    : isZh
      ? "全城商圈"
      : "エリア";

  const mobileSortLabel =
    sortOptions.find((s) => s.value === initial.sort)?.label ||
    (isZh ? "智能排序" : "並び替え");

  return (
    <div className={`relative ${isPending ? "opacity-80 transition-opacity" : ""}`}>
      {/* ==================== 桌面端：层次分明的高质感双层筛选面板 ==================== */}
      <div className="hidden md:block rounded-2xl border border-white/10 bg-[#111016]/95 p-5 shadow-[0_14px_38px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        {/* 第一层：搜索栏 + 排序分段切换 + 地图视图 */}
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[260px]">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={
                isZh
                  ? "搜店名、菜系、熟食卤味、中华物产店或车站..."
                  : "店名・料理ジャンル・惣菜・中華物産・駅名で検索..."
              }
              className="h-11 w-full rounded-xl border border-white/12 bg-[#17161e] pr-20 pl-10 text-sm text-white placeholder:text-white/38 focus:border-[#f2cb72]/60 focus:outline-none focus:ring-2 focus:ring-[#f2cb72]/15"
            />
            {queryText && (
              <button
                type="button"
                onClick={() => {
                  setQueryText("");
                  if (initial.q) navigateWith({ q: "" });
                }}
                className="absolute right-16 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/45 hover:bg-white/10 hover:text-white"
                aria-label={isZh ? "清空" : "クリア"}
              >
                <X size={14} />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-gradient-to-r from-[#e05634] to-[#c43f21] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:brightness-110"
            >
              {isZh ? "搜索" : "検索"}
            </button>
          </form>

          {/* 排序分段胶囊 */}
          <div className="inline-flex items-center rounded-xl border border-white/10 bg-[#17161e] p-1">
            {sortOptions.map((opt) => {
              const active = initial.sort === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => navigateWith({ sort: opt.value })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? "bg-[#f2cb72]/18 text-[#f2cb72] shadow-inner"
                      : "text-white/55 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <Link
            href={mapHref}
            className="btn-primary inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-xs font-bold"
          >
            <Map size={15} />
            <span>{isZh ? "地图视图" : "マップ表示"}</span>
          </Link>
        </div>

        {/* 第二层：5 维宽敞下拉筛选器（选中即生效，彻底告别文字截断） */}
        <div className="mt-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
          {/* 品类 */}
          <label className="relative block">
            <span className="pointer-events-none absolute top-1.5 left-3 text-[10px] font-medium text-white/40">
              {isZh ? "经营品类" : "業態"}
            </span>
            <select
              value={initial.dishType}
              onChange={(e) => navigateWith({ dishType: e.target.value })}
              className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#17161e] pt-4 pr-8 pb-1 pl-3 text-xs font-semibold text-white transition-colors hover:border-white/25 focus:border-[#f2cb72]/60 focus:outline-none"
            >
              <option value="">{isZh ? "全部品类" : "すべての業態"}</option>
              {dishTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45"
            />
          </label>

          {/* 菜系 */}
          <label className="relative block">
            <span className="pointer-events-none absolute top-1.5 left-3 text-[10px] font-medium text-white/40">
              {isZh ? "地域菜系" : "料理ジャンル"}
            </span>
            <select
              value={initial.cuisine}
              onChange={(e) => navigateWith({ cuisine: e.target.value })}
              className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#17161e] pt-4 pr-8 pb-1 pl-3 text-xs font-semibold text-white transition-colors hover:border-white/25 focus:border-[#f2cb72]/60 focus:outline-none"
            >
              <option value="">{isZh ? "全部菜系" : "すべて"}</option>
              {cuisineOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45"
            />
          </label>

          {/* 商圈车站 */}
          <label className="relative block">
            <span className="pointer-events-none absolute top-1.5 left-3 text-[10px] font-medium text-white/40">
              {isZh ? "热门商圈" : "駅・エリア"}
            </span>
            <select
              value={initial.station}
              onChange={(e) => navigateWith({ station: e.target.value })}
              className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#17161e] pt-4 pr-8 pb-1 pl-3 text-xs font-semibold text-white transition-colors hover:border-white/25 focus:border-[#f2cb72]/60 focus:outline-none"
            >
              <option value="">{isZh ? "全部商圈/车站" : "すべてのエリア"}</option>
              {stationOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45"
            />
          </label>

          {/* 正宗认证 */}
          <label className="relative block">
            <span className="pointer-events-none absolute top-1.5 left-3 text-[10px] font-medium text-white/40">
              {isZh ? "正宗度认证" : "ガチ度認定"}
            </span>
            <select
              value={initial.authenticity}
              onChange={(e) => navigateWith({ authenticity: e.target.value })}
              className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#17161e] pt-4 pr-8 pb-1 pl-3 text-xs font-semibold text-white transition-colors hover:border-white/25 focus:border-[#f2cb72]/60 focus:outline-none"
            >
              <option value="">{isZh ? "全部认证" : "すべて"}</option>
              {authenticityOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45"
            />
          </label>

          {/* 最低评分 */}
          <label className="relative block">
            <span className="pointer-events-none absolute top-1.5 left-3 text-[10px] font-medium text-white/40">
              {isZh ? "可信评分" : "信頼スコア"}
            </span>
            <select
              value={initial.minRating}
              onChange={(e) => navigateWith({ minRating: e.target.value })}
              className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#17161e] pt-4 pr-8 pb-1 pl-3 text-xs font-semibold text-white transition-colors hover:border-white/25 focus:border-[#f2cb72]/60 focus:outline-none"
            >
              {minRatingChoices.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45"
            />
          </label>
        </div>

        {/* 第三层：特色快捷直达胶囊（重点突出熟食卤味 & 中华物产店） */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3.5">
          <span className="text-[11px] font-semibold text-white/40">
            {isZh ? "快捷直达：" : "クイック："}
          </span>
          {QUICK_DISH_KEYS.map((key) => {
            const label = dishLabelMap[key];
            if (!label) return null;
            const active = initial.dishType === key;
            const isDeli = key === "deli";
            const isGrocery = key === "grocery";
            return (
              <button
                key={key}
                type="button"
                onClick={() => navigateWith({ dishType: active ? "" : key })}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                  active
                    ? "border-[#f2cb72] bg-[#f2cb72]/20 text-[#f2cb72] shadow-[0_0_12px_rgba(242,203,114,0.2)]"
                    : isDeli
                      ? "border-[#f06d49]/45 bg-[#f06d49]/14 text-[#ffb49d] hover:border-[#f06d49]/80 hover:bg-[#f06d49]/22"
                      : isGrocery
                        ? "border-emerald-400/40 bg-emerald-500/14 text-emerald-200 hover:border-emerald-400/75 hover:bg-emerald-500/22"
                        : "border-white/10 bg-white/[0.04] text-white/70 hover:border-white/25 hover:text-white"
                }`}
              >
                {isDeli && <ShoppingBag size={12} />}
                {isGrocery && <Store size={12} />}
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* 已选条件标签 + 统计条 */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-white/55">{totalCountText}</span>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onRemove}
                className="inline-flex items-center gap-1 rounded-full border border-[#f2cb72]/35 bg-[#f2cb72]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#f2cb72] hover:bg-[#f2cb72]/20"
              >
                <span>{chip.label}</span>
                <X size={11} />
              </button>
            ))}
          </div>

          {hasAnyFilter && (
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1 text-xs font-semibold text-white/55 hover:text-[#f2cb72]"
            >
              <RotateCcw size={12} />
              <span>{isZh ? "重置全部筛选" : "すべてクリア"}</span>
            </button>
          )}
        </div>
      </div>

      {/* ==================== 移动端：参考美团 App 的吸顶搜索 + 4栏下拉抽屉 + 横滑快筛 ==================== */}
      {mobileSheet && (
        <div
          className="fixed inset-0 top-16 z-30 bg-black/70 backdrop-blur-[2px] md:hidden"
          onClick={() => setMobileSheet(null)}
        />
      )}
      <div className="md:hidden -mx-4 sticky top-16 z-40 border-b border-white/10 bg-[#0a090e] px-3.5 pt-2.5 pb-2.5">
        {/* 顶部搜索胶囊 + 地图图标按钮 */}
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45"
            />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={isZh ? "搜餐厅、熟食卤味、中华物产..." : "店名・ジャンル・駅名..."}
              className="h-9.5 w-full rounded-full border border-white/12 bg-[#17161f] pr-8 pl-9 text-xs text-white placeholder:text-white/40 focus:border-[#f2cb72]/60 focus:outline-none"
            />
            {queryText && (
              <button
                type="button"
                onClick={() => {
                  setQueryText("");
                  if (initial.q) navigateWith({ q: "" });
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45"
                aria-label="clear"
              >
                <X size={14} />
              </button>
            )}
          </form>

          <Link
            href={mapHref}
            className="flex h-9.5 shrink-0 items-center gap-1 rounded-full border border-white/15 bg-[#17161f] px-3 text-xs font-semibold text-[#f2cb72]"
          >
            <Map size={14} />
            <span>{isZh ? "地图" : "地図"}</span>
          </Link>
        </div>

        {/* 美团经典 4 栏吸顶筛选条 */}
        <div className="mt-2.5 grid grid-cols-4 gap-1 border-t border-white/8 pt-2">
          <button
            type="button"
            onClick={() => setMobileSheet(mobileSheet === "station" ? null : "station")}
            className={`flex items-center justify-center gap-0.5 truncate rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              mobileSheet === "station" || initial.station
                ? "text-[#f2cb72]"
                : "text-white/80"
            }`}
          >
            <span className="truncate">{mobileStationLabel}</span>
            <ChevronDown
              size={13}
              className={`shrink-0 transition-transform ${mobileSheet === "station" ? "rotate-180" : ""}`}
            />
          </button>

          <button
            type="button"
            onClick={() => setMobileSheet(mobileSheet === "category" ? null : "category")}
            className={`flex items-center justify-center gap-0.5 truncate rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              mobileSheet === "category" || initial.dishType || initial.cuisine
                ? "text-[#f2cb72]"
                : "text-white/80"
            }`}
          >
            <span className="truncate">{mobileCategoryLabel}</span>
            <ChevronDown
              size={13}
              className={`shrink-0 transition-transform ${mobileSheet === "category" ? "rotate-180" : ""}`}
            />
          </button>

          <button
            type="button"
            onClick={() => setMobileSheet(mobileSheet === "sort" ? null : "sort")}
            className={`flex items-center justify-center gap-0.5 truncate rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              mobileSheet === "sort" || initial.sort !== "rating"
                ? "text-[#f2cb72]"
                : "text-white/80"
            }`}
          >
            <span className="truncate">{mobileSortLabel}</span>
            <ChevronDown
              size={13}
              className={`shrink-0 transition-transform ${mobileSheet === "sort" ? "rotate-180" : ""}`}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              setDraftAuth(initial.authenticity);
              setDraftMinRating(initial.minRating);
              setMobileSheet(mobileSheet === "more" ? null : "more");
            }}
            className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              mobileSheet === "more" || moreFilterCount > 0
                ? "text-[#f2cb72]"
                : "text-white/80"
            }`}
          >
            <span>{isZh ? "筛选" : "絞込"}</span>
            {moreFilterCount > 0 ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e65a35] text-[10px] font-bold text-white">
                {moreFilterCount}
              </span>
            ) : (
              <SlidersHorizontal size={12} />
            )}
          </button>
        </div>

        {/* 美团风横滑快捷标签条 */}
        <div className="scroll-row mt-1.5 !gap-1.5 !pb-0.5">
          <button
            type="button"
            onClick={() => navigateWith({ dishType: initial.dishType === "deli" ? "" : "deli" })}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              initial.dishType === "deli"
                ? "border-[#f2cb72] bg-[#f2cb72]/20 text-[#f2cb72]"
                : "border-[#f06d49]/45 bg-[#f06d49]/15 text-[#ffb49d]"
            }`}
          >
            <ShoppingBag size={11} />
            <span>{dishLabelMap.deli || (isZh ? "熟食卤味" : "中華惣菜")}</span>
          </button>

          <button
            type="button"
            onClick={() => navigateWith({ dishType: initial.dishType === "grocery" ? "" : "grocery" })}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              initial.dishType === "grocery"
                ? "border-[#f2cb72] bg-[#f2cb72]/20 text-[#f2cb72]"
                : "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
            }`}
          >
            <Store size={11} />
            <span>{dishLabelMap.grocery || (isZh ? "中华物产店" : "中華物産店")}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              navigateWith({
                authenticity: initial.authenticity === "authentic" ? "" : "authentic",
              })
            }
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              initial.authenticity === "authentic"
                ? "border-[#f2cb72] bg-[#f2cb72]/20 text-[#f2cb72]"
                : "border-white/12 bg-white/[0.05] text-white/75"
            }`}
          >
            <Sparkles size={11} />
            <span>{isZh ? "正宗中华" : "ガチ中華"}</span>
          </button>

          <button
            type="button"
            onClick={() => navigateWith({ minRating: initial.minRating === "4.5" ? "" : "4.5" })}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              initial.minRating === "4.5"
                ? "border-[#f2cb72] bg-[#f2cb72]/20 text-[#f2cb72]"
                : "border-white/12 bg-white/[0.05] text-white/75"
            }`}
          >
            <span>{isZh ? "4.5分+" : "4.5以上"}</span>
          </button>

          {(["hotpot", "malatang", "stirfry", "bbq", "noodles"] as const).map((k) => {
            const label = dishLabelMap[k];
            if (!label) return null;
            const active = initial.dishType === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => navigateWith({ dishType: active ? "" : k })}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  active
                    ? "border-[#f2cb72] bg-[#f2cb72]/20 text-[#f2cb72]"
                    : "border-white/12 bg-white/[0.05] text-white/75"
                }`}
              >
                {k === "hotpot" && <Flame size={11} className="text-[#f06d49]" />}
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* 移动端统计与重置提示 */}
        <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
          <span>{totalCountText}</span>
          {hasAnyFilter && (
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1 font-semibold text-[#f2cb72]"
            >
              <RotateCcw size={11} />
              <span>{isZh ? "清空筛选" : "クリア"}</span>
            </button>
          )}
        </div>

        {/* ========== 移动端弹出式美团筛选抽屉 ========== */}
        {mobileSheet && (
          <div className="absolute inset-x-0 top-full z-50 max-h-[68vh] overflow-y-auto border-b border-white/15 bg-[#121118] shadow-2xl">
              {/* 1. 全城商圈 */}
              {mobileSheet === "station" && (
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => navigateWith({ station: "" })}
                      className={`rounded-xl border px-2.5 py-2.5 text-xs font-semibold ${
                        !initial.station
                          ? "border-[#f2cb72] bg-[#f2cb72]/15 text-[#f2cb72]"
                          : "border-white/10 bg-white/[0.04] text-white/75"
                      }`}
                    >
                      {isZh ? "全部商圈" : "すべて"}
                    </button>
                    {stationOptions.map((st) => (
                      <button
                        key={st.value}
                        type="button"
                        onClick={() => navigateWith({ station: st.value })}
                        className={`truncate rounded-xl border px-2.5 py-2.5 text-xs font-semibold ${
                          initial.station === st.value
                            ? "border-[#f2cb72] bg-[#f2cb72]/15 text-[#f2cb72]"
                            : "border-white/10 bg-white/[0.04] text-white/75"
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. 美团经典左右双栏：特色 / 品类 / 菜系 */}
              {mobileSheet === "category" && (
                <div className="grid min-h-[300px] grid-cols-[112px_1fr]">
                  {/* 左栏切换 */}
                  <div className="border-r border-white/10 bg-[#0d0c12] py-2">
                    {[
                      { id: "featured" as const, label: isZh ? "特色必逛" : "注目" },
                      { id: "dish" as const, label: isZh ? "按品类" : "業態別" },
                      { id: "cuisine" as const, label: isZh ? "按菜系" : "料理別" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCategoryTab(tab.id)}
                        className={`w-full px-3 py-3 text-left text-xs font-bold transition-colors ${
                          categoryTab === tab.id
                            ? "border-l-2 border-[#f2cb72] bg-[#16151f] text-[#f2cb72]"
                            : "text-white/60"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* 右栏选项 */}
                  <div className="max-h-[340px] overflow-y-auto p-3">
                    {categoryTab === "featured" && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => navigateWith({ dishType: "", cuisine: "" })}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                            !initial.dishType && !initial.cuisine
                              ? "border-[#f2cb72] bg-[#f2cb72]/15 text-[#f2cb72]"
                              : "border-white/10 bg-white/[0.03] text-white/80"
                          }`}
                        >
                          <span>{isZh ? "全部餐厅与门店" : "すべて表示"}</span>
                          {!initial.dishType && !initial.cuisine && <Check size={14} />}
                        </button>

                        {(["deli", "grocery", "breakfast", "hotpot", "malatang"] as const).map((k) => {
                          const label = dishLabelMap[k];
                          if (!label) return null;
                          const active = initial.dishType === k;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => navigateWith({ dishType: k, cuisine: "" })}
                              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-bold ${
                                active
                                  ? "border-[#f2cb72] bg-[#f2cb72]/15 text-[#f2cb72]"
                                  : k === "deli"
                                    ? "border-[#f06d49]/40 bg-[#f06d49]/10 text-[#ffb49d]"
                                    : k === "grocery"
                                      ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                                      : "border-white/10 bg-white/[0.03] text-white/80"
                              }`}
                            >
                              <span>{label}</span>
                              {active && <Check size={14} />}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {categoryTab === "dish" && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => navigateWith({ dishType: "" })}
                          className={`rounded-xl border px-2.5 py-2 text-xs font-semibold ${
                            !initial.dishType
                              ? "border-[#f2cb72] bg-[#f2cb72]/15 text-[#f2cb72]"
                              : "border-white/10 bg-white/[0.04] text-white/75"
                          }`}
                        >
                          {isZh ? "全部品类" : "すべて"}
                        </button>
                        {dishTypeOptions.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => navigateWith({ dishType: o.value })}
                            className={`truncate rounded-xl border px-2.5 py-2 text-xs font-semibold ${
                              initial.dishType === o.value
                                ? "border-[#f2cb72] bg-[#f2cb72]/15 text-[#f2cb72]"
                                : "border-white/10 bg-white/[0.04] text-white/75"
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {categoryTab === "cuisine" && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => navigateWith({ cuisine: "" })}
                          className={`rounded-xl border px-2.5 py-2 text-xs font-semibold ${
                            !initial.cuisine
                              ? "border-[#f2cb72] bg-[#f2cb72]/15 text-[#f2cb72]"
                              : "border-white/10 bg-white/[0.04] text-white/75"
                          }`}
                        >
                          {isZh ? "全部菜系" : "すべて"}
                        </button>
                        {cuisineOptions.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => navigateWith({ cuisine: o.value })}
                            className={`truncate rounded-xl border px-2.5 py-2 text-xs font-semibold ${
                              initial.cuisine === o.value
                                ? "border-[#f2cb72] bg-[#f2cb72]/15 text-[#f2cb72]"
                                : "border-white/10 bg-white/[0.04] text-white/75"
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 3. 智能排序 */}
              {mobileSheet === "sort" && (
                <div className="divide-y divide-white/8 px-4 py-1">
                  {sortOptions.map((opt) => {
                    const active = initial.sort === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => navigateWith({ sort: opt.value })}
                        className={`flex w-full items-center justify-between py-3.5 text-sm font-semibold ${
                          active ? "text-[#f2cb72]" : "text-white/80"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {active && <Check size={16} />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 4. 更多筛选（正宗认证 + 最低评分） */}
              {mobileSheet === "more" && (
                <div className="p-4 space-y-4">
                  <div>
                    <div className="mb-2 text-xs font-bold text-white/60">
                      {isZh ? "正宗度认证" : "ガチ度認定"}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setDraftAuth("")}
                        className={`rounded-xl border py-2 text-xs font-semibold ${
                          !draftAuth
                            ? "border-[#f2cb72] bg-[#f2cb72]/15 text-[#f2cb72]"
                            : "border-white/10 bg-white/[0.04] text-white/75"
                        }`}
                      >
                        {isZh ? "不限" : "指定なし"}
                      </button>
                      {authenticityOptions.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setDraftAuth(draftAuth === o.value ? "" : o.value)}
                          className={`rounded-xl border py-2 text-xs font-semibold ${
                            draftAuth === o.value
                              ? "border-[#f2cb72] bg-[#f2cb72]/15 text-[#f2cb72]"
                              : "border-white/10 bg-white/[0.04] text-white/75"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-bold text-white/60">
                      {isZh ? "最低可信评分" : "最低信頼スコア"}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {minRatingChoices.map((o) => (
                        <button
                          key={o.value || "any"}
                          type="button"
                          onClick={() => setDraftMinRating(o.value)}
                          className={`rounded-xl border py-2 text-xs font-semibold ${
                            draftMinRating === o.value
                              ? "border-[#f2cb72] bg-[#f2cb72]/15 text-[#f2cb72]"
                              : "border-white/10 bg-white/[0.04] text-white/75"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 border-t border-white/10 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftAuth("");
                        setDraftMinRating("");
                      }}
                      className="rounded-xl border border-white/15 bg-white/[0.04] py-2.5 text-xs font-bold text-white/80"
                    >
                      {isZh ? "重置" : "リセット"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        navigateWith({
                          authenticity: draftAuth,
                          minRating: draftMinRating,
                        })
                      }
                      className="btn-primary rounded-xl py-2.5 text-xs font-bold"
                    >
                      {isZh ? "确定" : "適用する"}
                    </button>
                  </div>
                </div>
              )}
            </div>
        )}
      </div>
    </div>
  );
}
