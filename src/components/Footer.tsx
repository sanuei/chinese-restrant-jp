import { useTranslations } from "next-intl";
import Link from "next/link";

type Props = { locale: string };

export default function Footer({ locale }: Props) {
  const t = useTranslations("footer");
  
  return (
    <footer className="bg-white border-t py-12 mt-20" style={{ borderTopColor: "var(--color-warm-200)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <Link href={`/${locale}`} className="flex items-center gap-2">
              <span className="text-2xl">🍜</span>
              <span className="font-serif font-black text-lg" style={{ color: "var(--color-vermilion-700)" }}>
                {locale === "zh" ? "真味中华" : "ガチ中華ナビ"}
              </span>
            </Link>
            <p className="text-xs max-w-md text-center md:text-left" style={{ color: "var(--color-ink-400)" }}>
              {t("disclaimer")}
            </p>
            <a
              href="mailto:sanuei.yann@gmail.com"
              className="text-xs font-medium text-ink-500 transition-colors hover:text-vermilion-700"
            >
              sanuei.yann@gmail.com
            </a>
          </div>
          
          <div className="flex gap-6 text-sm font-medium" style={{ color: "var(--color-ink-700)" }}>
            <Link href={`/${locale}/about`} className="hover:text-vermilion-700 transition-colors">{t("about")}</Link>
            <Link href={`/${locale}/contact`} className="hover:text-vermilion-700 transition-colors">{t("contact")}</Link>
            <Link href={`/${locale}/privacy`} className="hover:text-vermilion-700 transition-colors">{t("privacy")}</Link>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t text-center text-xs" style={{ borderTopColor: "var(--color-warm-100)", color: "var(--color-ink-400)" }}>
          © {new Date().getFullYear()} {locale === "zh" ? "真味中华" : "ガチ中華ナビ"}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
