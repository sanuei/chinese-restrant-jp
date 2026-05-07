import type { Metadata } from "next";
import { Noto_Serif_SC, Noto_Sans_SC } from "next/font/google";
import "@/app/globals.css";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://gachi.soniclab.cc");

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
  metadataBase: siteUrl,
  applicationName: "味探",
  title: {
    default: "味探 - 东京中餐与ガチ中華餐厅指南",
    template: "%s | 味探",
  },
  description:
    "AI驱动的在日中国餐厅评鉴平台。收录东京及关东ガチ中華，按川菜、粤菜、茶餐厅、湖南菜等菜系分类，过滤低可信评论。",
  keywords: [
    "ガチ中華",
    "味探",
    "东京中餐",
    "東京 中華料理",
    "中国料理 東京",
    "本格中華",
    "粤菜 東京",
    "茶餐厅 東京",
    "四川料理 東京",
    "湖南料理 東京",
    "在日中国餐厅",
  ],
  authors: [{ name: "味探", url: siteUrl.toString() }],
  creator: "味探",
  publisher: "味探",
  category: "restaurant guide",
  alternates: {
    canonical: "/zh",
    languages: {
      zh: "/zh",
      ja: "/ja",
      "x-default": "/zh",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    siteName: "味探",
    title: "味探 - 东京中餐与ガチ中華餐厅指南",
    description: "AI 帮你在东京和关东找到可信的ガチ中華、中国餐厅与家乡味。",
    url: "/zh",
    locale: "zh_CN",
    alternateLocale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "味探 - 东京中餐与ガチ中華餐厅指南",
    description: "东京及关东ガチ中華餐厅评鉴、菜系搜索和 Google Maps 餐厅鉴定。",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className={`${notoSerifSC.variable} ${notoSansSC.variable}`} suppressHydrationWarning>
      <body className="font-sans bg-warm-50 text-stone-800 antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
