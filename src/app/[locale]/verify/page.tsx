import type { Metadata } from "next";
import VerifyTool from "@/components/VerifyTool";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "ガチ中華鉴定所" : "ガチ中華鑑定所",
    description: locale === "zh"
      ? "粘贴 Google Maps 店铺链接，AI 会读取餐厅信息和最新评论，判断它是不是值得收录的关东ガチ中華。"
      : "Google Maps の店舗リンクから、AI が関東エリアのガチ中華として掲載できるかを判定します。",
    alternates: {
      canonical: `/${locale}/verify`,
      languages: {
        zh: "/zh/verify",
        ja: "/ja/verify",
        "x-default": "/zh/verify",
      },
    },
  };
}

export default async function VerifyPage({ params }: Props) {
  const { locale } = await params;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <VerifyTool locale={locale} />
    </main>
  );
}
