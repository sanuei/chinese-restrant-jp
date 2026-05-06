import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === "zh";
  const siteName = isZh ? "真味中华" : "ガチ中華ナビ";
  const title = isZh
    ? "真味中华 - 东京ガチ中華与中国餐厅评鉴"
    : "ガチ中華ナビ - 東京の本格中華ガイド";
  const description = isZh
    ? "按菜系、地区、可信评分寻找东京和关东的ガチ中華。支持 Google Maps 链接 AI 鉴定餐厅。"
    : "東京・関東のガチ中華を料理ジャンル、エリア、信頼スコアで探せるAIレストランガイド。";

  return {
    title: {
      default: title,
      template: `%s | ${siteName}`,
    },
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: {
        zh: "/zh",
        ja: "/ja",
        "x-default": "/zh",
      },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}`,
      siteName: "ガチ中華ナビ | 真味中华",
      locale: isZh ? "zh_CN" : "ja_JP",
      alternateLocale: isZh ? "ja_JP" : "zh_CN",
      type: "website",
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "zh" | "ja")) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <Navbar locale={locale} />
      <main className="min-h-screen">{children}</main>
      <Footer locale={locale} />
    </NextIntlClientProvider>
  );
}
