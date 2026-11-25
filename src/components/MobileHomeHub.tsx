"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Dumbbell,
  Flame,
  MapPin,
  Scissors,
  Search,
  ShoppingBag,
  Soup,
  Stethoscope,
  Store,
  Utensils,
  Wheat,
} from "lucide-react";

type Props = {
  locale: string;
};

/**
 * 移动端首页「美团 App 风格」吸顶搜索栏 + 10 宫格金刚区
 * 一屏直达：熟食卤味、中华物产店、火锅、麻辣烫、川菜、华人理发、中文医院、健身房、地图找店
 */
export default function MobileHomeHub({ locale }: Props) {
  const router = useRouter();
  const isZh = locale === "zh";
  const [q, setQ] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    router.push(
      trimmed
        ? `/${locale}/restaurants?q=${encodeURIComponent(trimmed)}`
        : `/${locale}/restaurants`
    );
  };

  const kingKongItems = [
    {
      href: `/${locale}/restaurants?dish_type=deli`,
      label: isZh ? "熟食卤味" : "中華惣菜",
      badge: isZh ? "热" : "人気",
      bg: "from-[#f06d49] to-[#c73c1f]",
      Icon: ShoppingBag,
    },
    {
      href: `/${locale}/restaurants?dish_type=grocery`,
      label: isZh ? "中华物产" : "中華物産",
      badge: isZh ? "逛" : "必見",
      bg: "from-emerald-500 to-teal-700",
      Icon: Store,
    },
    {
      href: `/${locale}/restaurants?dish_type=hotpot`,
      label: isZh ? "火锅" : "火鍋",
      bg: "from-rose-500 to-red-700",
      Icon: Soup,
    },
    {
      href: `/${locale}/restaurants?dish_type=malatang`,
      label: isZh ? "麻辣烫" : "麻辣湯",
      bg: "from-amber-500 to-orange-600",
      Icon: Flame,
    },
    {
      href: `/${locale}/restaurants?dish_type=stirfry`,
      label: isZh ? "家常炒菜" : "本格炒め",
      bg: "from-yellow-500 to-amber-700",
      Icon: Utensils,
    },
    {
      href: `/${locale}/restaurants?dish_type=noodles`,
      label: isZh ? "拉面面食" : "麺類",
      bg: "from-orange-400 to-amber-600",
      Icon: Wheat,
    },
    {
      href: `/${locale}/life?category=hair`,
      label: isZh ? "华人理发" : "美容室",
      bg: "from-pink-500 to-rose-600",
      Icon: Scissors,
    },
    {
      href: `/${locale}/life?category=medical`,
      label: isZh ? "中文医院" : "病院・歯科",
      bg: "from-sky-500 to-blue-700",
      Icon: Stethoscope,
    },
    {
      href: `/${locale}/life?category=fitness`,
      label: isZh ? "健身私教" : "ジム",
      bg: "from-violet-500 to-indigo-700",
      Icon: Dumbbell,
    },
    {
      href: `/${locale}/map`,
      label: isZh ? "地图找店" : "地図検索",
      bg: "from-[#e5ab3c] to-[#b87b16]",
      Icon: MapPin,
    },
  ];

  const hotTags = isZh
    ? [
        { label: "池袋美食", href: `/${locale}/restaurants?station=ikebukuro` },
        { label: "高田马场", href: `/${locale}/restaurants?station=takadanobaba` },
        { label: "上野", href: `/${locale}/restaurants?station=ueno` },
        { label: "铁锅炖/酸菜鱼", href: `/${locale}/restaurants?dish_type=stewpot` },
        { label: "正宗川菜", href: `/${locale}/restaurants?cuisine=sichuan&authenticity=authentic` },
      ]
    : [
        { label: "池袋", href: `/${locale}/restaurants?station=ikebukuro` },
        { label: "高田馬場", href: `/${locale}/restaurants?station=takadanobaba` },
        { label: "上野", href: `/${locale}/restaurants?station=ueno` },
        { label: "鉄鍋・酸菜魚", href: `/${locale}/restaurants?dish_type=stewpot` },
        { label: "ガチ四川", href: `/${locale}/restaurants?cuisine=sichuan&authenticity=authentic` },
      ];

  return (
    <section className="md:hidden border-b border-white/8 bg-[#09080d] px-3.5 pt-3 pb-4">
      {/* 美团风搜索胶囊 */}
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 text-white/45"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            isZh
              ? "搜火锅 / 熟食卤味 / 中华物产 / 池袋..."
              : "火鍋・中華惣菜・中華物産・池袋を検索..."
          }
          className="h-10.5 w-full rounded-full border border-[#f2cb72]/35 bg-[#15141c] pr-16 pl-9.5 text-xs text-white placeholder:text-white/45 focus:border-[#f2cb72] focus:outline-none"
        />
        <button
          type="submit"
          className="absolute right-1 rounded-full bg-gradient-to-r from-[#e05634] to-[#c43f21] px-4 py-1.5 text-xs font-bold text-white shadow-sm"
        >
          {isZh ? "搜索" : "検索"}
        </button>
      </form>

      {/* 热搜词横滑条 */}
      <div className="scroll-row mt-2.5 !gap-1.5 !pb-0">
        {hotTags.map((tag) => (
          <Link
            key={tag.href}
            href={tag.href}
            className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11px] font-medium text-white/70 active:bg-white/10"
          >
            {tag.label}
          </Link>
        ))}
      </div>

      {/* 5列×2行 美团金刚区宫格 */}
      <div className="mt-3.5 grid grid-cols-5 gap-y-3 gap-x-1.5 rounded-2xl border border-white/8 bg-[#121118]/90 px-2 py-3.5">
        {kingKongItems.map(({ href, label, badge, bg, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
          >
            <div className="relative">
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ${bg}`}
              >
                <Icon size={20} strokeWidth={2.1} />
              </span>
              {badge && (
                <span className="absolute -top-1.5 -right-2 rounded-full border border-[#09080d] bg-[#f2cb72] px-1.5 py-[1px] text-[9px] font-black leading-tight text-[#141008] shadow">
                  {badge}
                </span>
              )}
            </div>
            <span className="text-[11px] font-semibold leading-tight text-white/85 whitespace-nowrap">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
