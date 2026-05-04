import type { Metadata } from "next";
import { Noto_Serif_SC, Noto_Sans_SC } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import "../globals.css";

const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-serif",
  display: "swap",
});

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ガチ中華ナビ | 真味中华 - 在日中国餐厅评鉴",
    template: "%s | ガチ中華ナビ",
  },
  description:
    "AI驱动的在日中国餐厅评鉴平台。按菜系分类、过滤虚假评论、区分正宗中华与日式中华。東京の本格中華料理をAIで徹底分析。",
  keywords: ["中华料理", "ガチ中華", "在日中国餐厅", "中国料理 東京", "本格中華"],
  openGraph: {
    siteName: "ガチ中華ナビ | 真味中华",
    locale: "zh_CN",
    alternateLocale: "ja_JP",
    type: "website",
  },
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "zh" | "ja")) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} className={`${notoSerifSC.variable} ${notoSansSC.variable}`} suppressHydrationWarning>
      <body className="font-sans bg-warm-50 text-stone-800 antialiased" suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <Navbar locale={locale} />
          <main className="min-h-screen">{children}</main>
          <Footer locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
