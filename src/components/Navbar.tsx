"use client";

import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Globe, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { googleSignIn, userSignOut } from "@/lib/auth-actions";

type NavUser = { name: string | null; image: string | null; isAdmin: boolean };
type Props = { locale: string; user: NavUser | null };

export default function Navbar({ locale, user }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const otherLocale = locale === "zh" ? "ja" : "zh";
  const otherLocaleLabel = locale === "zh" ? "日本語" : "中文";

  // 切换语言：替换路径前缀
  const switchLocale = () => {
    const newPath = pathname.replace(`/${locale}`, `/${otherLocale}`);
    router.push(newPath);
  };

  const navLinks = [
    { href: `/${locale}`, label: t("home") },
    { href: `/${locale}/restaurants`, label: t("restaurants") },
    { href: `/${locale}/verify`, label: t("verify") },
    { href: `/${locale}/cuisines`, label: t("cuisines") },
    { href: `/${locale}/map`, label: t("map") },
    { href: `/${locale}/favorites`, label: t("favorites") },
    { href: `/${locale}/about`, label: t("about") },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#060608]/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href={`/${locale}`} className="flex items-center gap-2.5 shrink-0">
            {/* 走 public/ 直出、不用 next/image：OpenNext + Workers 上没有可用的图片优化器，
                /_next/image 在生产返回 500（error 1101），logo 会变成裂图 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/zhenwei-logo-mark-192.png"
              alt=""
              width={38}
              height={38}
              className="h-9 w-9 object-contain"
            />
            <div className="hidden sm:block">
              <div className="font-serif font-black text-base leading-tight text-white">
                {locale === "zh" ? "真味中华" : "ガチ中華ナビ"}
              </div>
              <div className="text-[11px] leading-tight text-white/48">
                {locale === "zh" ? "在日中国餐厅评鉴" : "在日中国料理ガイド"}
              </div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.slice(1).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/75 transition-colors hover:text-gold-300"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right: Language + Auth + Mobile Menu */}
          <div className="flex items-center gap-3">
            <button
              onClick={switchLocale}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/85 transition-colors hover:border-gold-300/50 hover:text-gold-300"
            >
              <Globe size={13} />
              {otherLocaleLabel}
            </button>

            <div className="hidden md:block">
              {user ? (
                <div className="flex items-center gap-2">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt={user.name || ""} className="h-8 w-8 rounded-full ring-1 ring-white/20" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/90">
                      {(user.name || "U").slice(0, 1)}
                    </span>
                  )}
                  <span className="max-w-[100px] truncate text-sm font-medium text-white/80">{user.name}</span>
                  {user.isAdmin && (
                    <Link
                      href="/admin"
                      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-gold-300"
                    >
                      <ShieldCheck size={16} />
                      {t("admin")}
                    </Link>
                  )}
                  <form action={userSignOut.bind(null, pathname)}>
                    <button
                      type="submit"
                      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-white/50 transition-colors hover:text-white"
                      aria-label={t("logout")}
                      title={t("logout")}
                    >
                      <LogOut size={16} />
                    </button>
                  </form>
                </div>
              ) : (
                <form action={googleSignIn.bind(null, pathname)}>
                  <button type="submit" className="btn-primary rounded-full px-4 py-1.5 text-sm">
                    {t("login")}
                  </button>
                </form>
              )}
            </div>

            <button
              className="md:hidden p-2 rounded-md text-white/80 hover:bg-white/10"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden py-3 border-t border-white/10">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-2 py-2.5 text-sm font-medium text-white/80 rounded-md hover:bg-white/5 hover:text-gold-300"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-white/10 px-2 pt-3">
              {user ? (
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {user.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.image} alt={user.name || ""} className="h-8 w-8 rounded-full ring-1 ring-white/20" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/90">
                          {(user.name || "U").slice(0, 1)}
                        </span>
                      )}
                      <span className="truncate text-sm font-medium text-white/85">{user.name}</span>
                    </div>
                    <form action={userSignOut.bind(null, pathname)}>
                      <button type="submit" className="flex items-center gap-1 text-sm text-white/55 hover:text-white">
                        <LogOut size={16} />
                        {t("logout")}
                      </button>
                    </form>
                  </div>
                  {user.isAdmin && (
                    <Link
                      href="/admin"
                      className="mt-3 flex items-center gap-2 rounded-md bg-white/5 px-3 py-2.5 text-sm font-medium text-white/85"
                      onClick={() => setMenuOpen(false)}
                    >
                      <ShieldCheck size={16} className="text-gold-300" />
                      {t("admin")}
                    </Link>
                  )}
                </div>
              ) : (
                <form action={googleSignIn.bind(null, pathname)}>
                  <button type="submit" className="btn-primary w-full py-2 text-sm">
                    {t("login")}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
