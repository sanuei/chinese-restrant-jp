import type { Metadata } from "next";
import { Noto_Serif_SC, Noto_Sans_SC } from "next/font/google";
import "@/app/globals.css";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className={`${notoSerifSC.variable} ${notoSansSC.variable}`} suppressHydrationWarning>
      <body className="font-sans bg-warm-50 text-stone-800 antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
