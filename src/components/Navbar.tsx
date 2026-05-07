"use client";

import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Globe, UserCircle2 } from "lucide-react";
import Link from "next/link";

type Props = { locale: string };

export default function Navbar({ locale }: Props) {
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
    { href: `/${locale}#rankings`, label: t("rankings") },
    { href: `/${locale}/restaurants`, label: t("restaurants") },
    { href: `/${locale}#areas`, label: t("areas") },
    { href: `/${locale}/cuisines`, label: t("cuisines") },
    { href: `/${locale}#discover`, label: t("discover") },
  ];

  return (
    <nav
      className="sticky top-0 z-50 border-b border-warm-100 bg-white/95 backdrop-blur-sm"
      style={{ borderBottomColor: "var(--color-warm-200)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href={`/${locale}`} className="flex items-center gap-2 shrink-0">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-vermilion-200 bg-vermilion-50 text-lg text-vermilion-700">
              味
            </span>
            <div className="hidden sm:block">
              <div
                className="font-serif text-base leading-tight font-black"
                style={{ color: "var(--color-vermilion-700)" }}
              >
                {locale === "zh" ? "味探" : "味探"}
              </div>
              <div
                className="text-xs leading-tight"
                style={{ color: "var(--color-ink-400)" }}
              >
                {locale === "zh" ? "可信的中餐馆指南" : "可信の中国料理指南"}
              </div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
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

            <button
              className="hidden items-center gap-1.5 rounded-md border border-warm-200 px-3 py-1.5 text-sm text-ink-700 md:inline-flex"
              type="button"
            >
              <UserCircle2 size={14} />
              {locale === "zh" ? "登录/注册" : "ログイン/登録"}
            </button>

            <button
              className="md:hidden p-2 rounded-md"
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ color: "var(--color-ink-700)" }}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

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
            <button
              type="button"
              className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left text-sm font-medium text-ink-700"
            >
              <UserCircle2 size={16} />
              {locale === "zh" ? "登录/注册" : "ログイン/登録"}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
