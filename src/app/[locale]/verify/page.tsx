import type { Metadata } from "next";
import VerifyTool from "@/components/VerifyTool";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "ガチ中華鉴定所" : "ガチ中華鑑定所",
    description: locale === "zh"
      ? "粘贴 Google Maps 链接，让 AI 判断一家店是不是ガチ中華。"
      : "Google Maps のリンクから、AI がガチ中華かどうかを判定します。",
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
