"use client";

import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Globe, LogOut } from "lucide-react";
import Link from "next/link";
import { googleSignIn, userSignOut } from "@/lib/auth-actions";
import { BRAND_ICON as BrandIcon } from "@/lib/cuisine-icons";

type NavUser = { name: string | null; image: string | null };
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
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-warm-100"
         style={{ borderBottomColor: "var(--color-warm-200)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href={`/${locale}`} className="flex items-center gap-2 shrink-0">
            <BrandIcon size={26} style={{ color: "var(--color-vermilion-700)" }} strokeWidth={2} />
            <div className="hidden sm:block">
              <div className="font-serif font-black text-base leading-tight"
                   style={{ color: "var(--color-vermilion-700)" }}>
                {locale === "zh" ? "真味中华" : "ガチ中華ナビ"}
              </div>
              <div className="text-xs leading-tight"
                   style={{ color: "var(--color-ink-400)" }}>
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
                className="text-sm font-medium transition-colors hover:text-vermilion-700"
                style={{ color: "var(--color-ink-700)" }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right: Language + Auth + Mobile Menu */}
          <div className="flex items-center gap-3">
            <button
              onClick={switchLocale}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors"
              style={{
                color: "var(--color-vermilion-700)",
                border: "1px solid var(--color-vermilion-200)",
              }}
            >
              <Globe size={14} />
              {otherLocaleLabel}
            </button>

            <div className="hidden md:block">
              {user ? (
                <div className="flex items-center gap-2">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt={user.name || ""} className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-warm-100 text-xs font-bold text-ink-700">
                      {(user.name || "U").slice(0, 1)}
                    </span>
                  )}
                  <span className="max-w-[100px] truncate text-sm font-medium text-ink-700">{user.name}</span>
                  <form action={userSignOut.bind(null, pathname)}>
                    <button
                      type="submit"
                      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-ink-400 transition-colors hover:text-vermilion-700"
                      aria-label={t("logout")}
                      title={t("logout")}
                    >
                      <LogOut size={16} />
                    </button>
                  </form>
                </div>
              ) : (
                <form action={googleSignIn.bind(null, pathname)}>
                  <button type="submit" className="btn-primary px-4 py-1.5 text-sm">
                    {t("login")}
                  </button>
                </form>
              )}
            </div>

            <button
              className="md:hidden p-2 rounded-md"
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ color: "var(--color-ink-700)" }}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden py-3 border-t" style={{ borderTopColor: "var(--color-warm-200)" }}>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-2 py-2.5 text-sm font-medium rounded-md"
                style={{ color: "var(--color-ink-700)" }}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t px-2 pt-3" style={{ borderTopColor: "var(--color-warm-200)" }}>
              {user ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.image} alt={user.name || ""} className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-warm-100 text-xs font-bold text-ink-700">
                        {(user.name || "U").slice(0, 1)}
                      </span>
                    )}
                    <span className="truncate text-sm font-medium text-ink-700">{user.name}</span>
                  </div>
                  <form action={userSignOut.bind(null, pathname)}>
                    <button type="submit" className="flex items-center gap-1 text-sm text-ink-400">
                      <LogOut size={16} />
                      {t("logout")}
                    </button>
                  </form>
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
