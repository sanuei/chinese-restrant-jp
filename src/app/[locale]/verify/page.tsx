import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import VerifyTool from "@/components/VerifyTool";
import RecentVerifications from "@/components/RecentVerifications";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ url?: string | string[] }>;
};

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

/**
 * 鉴定要调用 Google Place Details 和 AI，每次都产生费用。
 * 以前这个页面和 /api/verify 都是完全公开的，任何人都能刷 —— 所以现在
 * 必须登录才能用（服务端也在 /api/verify 里挡了一道）。
 */
export default async function VerifyPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  const initialUrl = Array.isArray(query?.url) ? query.url[0] || "" : query?.url || "";
  const user = await getCurrentUser();
  const isZh = locale === "zh";

  if (!user) {
    const copy = isZh
      ? {
          badge: "需要登录",
          title: "登录后才能鉴定",
          body: "鉴定一次会调用 Google 店铺数据和 AI 分析，两者都是按次计费的，所以只对登录用户开放，避免被脚本刷掉额度。",
          note: "用 Google 账号一键登录即可，不收集手机号，也不会发邮件给你。",
          cta: "用 Google 登录",
        }
      : {
          badge: "ログインが必要",
          title: "鑑定にはログインが必要です",
          body: "鑑定は Google の店舗データと AI 解析を呼び出すため、どちらも従量課金です。スクリプトに枠を使い切られないよう、ログインした方のみに開放しています。",
          note: "Google アカウントでワンクリック。電話番号は取得せず、メールも送りません。",
          cta: "Google でログイン",
        };

    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-xl border border-warm-200 bg-white p-6 shadow-sm md:max-w-3xl md:p-10">
          <div className="absolute right-6 top-4 select-none font-serif text-8xl font-black text-vermilion-700 opacity-[0.04]">
            鑑
          </div>
          <div className="relative max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-vermilion-50 px-3 py-1 text-xs font-bold text-vermilion-700">
              <LockKeyhole size={14} />
              {copy.badge}
            </div>
            <h1 className="font-serif text-3xl font-black leading-tight text-ink-900 md:text-4xl">
              {copy.title}
            </h1>
            <p className="mt-4 text-sm leading-7 text-ink-500">{copy.body}</p>
            <p className="mt-2 text-xs text-ink-400">{copy.note}</p>

            <a
              href={`/api/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}/verify`)}`}
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-vermilion-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-vermilion-900"
            >
              {copy.cta}
            </a>

            <div className="mt-4">
              <Link
                href={`/${locale}`}
                className="text-xs font-semibold text-vermilion-700 hover:underline"
              >
                {isZh ? "先去看看收录的餐厅 →" : "掲載店舗を見る →"}
              </Link>
            </div>
          </div>
        </section>

        <RecentVerifications locale={locale} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <VerifyTool locale={locale} initialUrl={initialUrl} />
      <RecentVerifications locale={locale} />
    </main>
  );
}
