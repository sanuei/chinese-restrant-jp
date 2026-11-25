"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Heart, Home, MapPin, UtensilsCrossed } from "lucide-react";

type Props = {
  locale: string;
};

/**
 * 移动端底部固定 5-Tab 导航栏（参考美团 App 交互设计）
 * - 仅在移动端 (< md) 显示
 * - 在门店详情页和地图全屏页自动让位，避免与吸底操作栏或地图悬浮胶囊重叠
 */
export default function MobileTabBar({ locale }: Props) {
  const pathname = usePathname() || "";
  const isZh = locale === "zh";

  // 详情页有专属吸底操作栏，地图页有专属底部“查看列表”胶囊
  const isDetailPage =
    new RegExp(`^/${locale}/restaurants/[^/]+$`).test(pathname) ||
    new RegExp(`^/${locale}/life/[^/]+$`).test(pathname);
  const isMapPage = pathname === `/${locale}/map`;

  if (isDetailPage || isMapPage) {
    return null;
  }

  const tabs = [
    {
      href: `/${locale}`,
      label: isZh ? "首页" : "ホーム",
      Icon: Home,
      active: pathname === `/${locale}`,
    },
    {
      href: `/${locale}/restaurants`,
      label: isZh ? "美食" : "グルメ",
      Icon: UtensilsCrossed,
      active: pathname.startsWith(`/${locale}/restaurants`) || pathname.startsWith(`/${locale}/cuisines`),
    },
    {
      href: `/${locale}/map`,
      label: isZh ? "地图" : "マップ",
      Icon: MapPin,
      active: pathname.startsWith(`/${locale}/map`),
    },
    {
      href: `/${locale}/life`,
      label: isZh ? "生活" : "生活",
      Icon: Compass,
      active: pathname.startsWith(`/${locale}/life`),
    },
    {
      href: `/${locale}/favorites`,
      label: isZh ? "收藏" : "保存",
      Icon: Heart,
      active: pathname.startsWith(`/${locale}/favorites`),
    },
  ];

  return (
    <nav
      aria-label={isZh ? "底部导航" : "ボトムナビゲーション"}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/12 bg-[#0a090e]/94 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid h-15 grid-cols-5 items-center px-1">
        {tabs.map(({ href, label, Icon, active }) => (
          <Link
            key={href}
            href={href}
            className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors ${
              active ? "text-[#f2cb72]" : "text-white/55 hover:text-white/85"
            }`}
          >
            <span
              className={`flex h-7 w-10 items-center justify-center rounded-full transition-all ${
                active
                  ? "bg-gradient-to-r from-[#e05634]/25 to-[#f2cb72]/20 text-[#f2cb72]"
                  : ""
              }`}
            >
              <Icon size={19} strokeWidth={active ? 2.3 : 1.8} />
            </span>
            <span className={`text-[10.5px] leading-none ${active ? "font-bold" : "font-medium"}`}>
              {label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
