import { useTranslations } from "next-intl";
import Link from "next/link";
import SocialLinks from "@/components/SocialLinks";

type Props = { locale: string };

export default function Footer({ locale }: Props) {
  const t = useTranslations("footer");
  
  return (
    <footer className="mt-14 border-t border-white/10 bg-[#050507] pt-10 pb-24 md:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <Link href={`/${locale}`} className="flex items-center gap-2">
              {/* 不用 next/image：OpenNext + Workers 上没有图片优化器，
                  /_next/image 在生产返回 500，logo 会变成裂图 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/zhenwei-logo-mark-192.png"
                alt=""
                width={30}
                height={30}
                className="h-[30px] w-[30px] object-contain"
              />
              <span className="font-serif font-black text-lg text-white">
                {locale === "zh" ? "真味中华" : "ガチ中華ナビ"}
              </span>
            </Link>
            <p className="text-xs max-w-md text-center md:text-left text-white/45">
              {t("disclaimer")}
            </p>
            <a
              href="mailto:sanuei.yann@gmail.com"
              className="text-xs font-medium text-white/60 transition-colors hover:text-gold-300"
            >
              sanuei.yann@gmail.com
            </a>
          </div>
          
          <div className="flex flex-col items-center gap-3 md:items-end">
            <div className="flex gap-6 text-sm font-medium text-white/70">
              <Link href={`/${locale}/about`} className="hover:text-gold-300 transition-colors">{t("about")}</Link>
              <Link href={`/${locale}/contact`} className="hover:text-gold-300 transition-colors">{t("contact")}</Link>
              <Link href={`/${locale}/privacy`} className="hover:text-gold-300 transition-colors">{t("privacy")}</Link>
            </div>
            <SocialLinks />
          </div>
        </div>
        
        <div className="mt-6 pt-6 border-t border-white/8 text-center text-xs text-white/35">
          © {new Date().getFullYear()} {locale === "zh" ? "真味中华" : "ガチ中華ナビ"}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
