import type { Metadata } from "next";
import CuisineGrid from "@/components/CuisineGrid";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "按菜系找餐厅" : "料理ジャンルから探す",
  };
}

export default async function CuisinesPage({ params }: Props) {
  const { locale } = await params;
  const copy = locale === "zh"
    ? {
        eyebrow: "菜系导航",
        title: "先选味型，再选餐厅",
        subtitle: "川菜、粤菜、北方菜等入口会直接带你进入餐厅列表筛选结果。",
      }
    : {
        eyebrow: "Cuisine Guide",
        title: "料理ジャンルから探す",
        subtitle: "ジャンルを選ぶと、レストラン一覧の絞り込み結果へ移動します。",
      };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-vermilion-700">{copy.eyebrow}</div>
      <h1 className="font-serif text-3xl font-black text-ink-900">{copy.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-400">{copy.subtitle}</p>
      <CuisineGrid locale={locale} />
    </div>
  );
}
