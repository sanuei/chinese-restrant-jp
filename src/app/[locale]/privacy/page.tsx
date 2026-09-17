import type { Metadata } from "next";
import Link from "next/link";
import { Cookie, Database, Lock, Share2, Trash2, UserRound } from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

const contactEmail = "sanuei.yann@gmail.com";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "隐私政策" : "プライバシーポリシー",
    description:
      locale === "zh"
        ? "真味中华收集哪些数据、为什么收集、和谁共享，以及你如何删除自己的数据。"
        : "ガチ中華ナビが取得するデータ、その目的、共有先、削除方法について説明します。",
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: { zh: "/zh/privacy", ja: "/ja/privacy", "x-default": "/zh/privacy" },
    },
    robots: { index: true, follow: true },
  };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  const isZh = locale === "zh";

  const copy = isZh
    ? {
        eyebrow: "隐私政策",
        title: "我们收集什么，不收集什么",
        lead: "简单说：不登录的话，我们不会收集任何能识别你个人的信息。下面是详细说明。",
        updated: "最后更新：2026 年 9 月",
        sections: [
          {
            icon: UserRound,
            title: "登录信息（仅在你用 Google 登录时）",
            body: "如果你选择用 Google 账号登录，我们会保存你的 Google 用户 ID、邮箱、显示名称和头像链接。这些只用于识别你的收藏，不会用于任何其他用途，也不会用来给你发营销邮件。不登录就完全不会产生这些数据。",
          },
          {
            icon: Database,
            title: "收藏记录",
            body: "登录后你收藏的餐厅会被保存，只是「哪个用户收藏了哪家店」这样一条记录。这是让收藏功能能用所必需的。",
          },
          {
            icon: Share2,
            title: "浏览量统计（匿名）",
            body: "为了做首页的热门榜，我们统计每家餐厅每天被打开了多少次。这个统计只记录「餐厅 + 日期 + 次数」，不记录是谁看的，也不和任何用户账号关联，登录与否都一样。",
          },
          {
            icon: Cookie,
            title: "Cookie",
            body: "我们只使用登录所必需的 Cookie（保存你的登录状态）。没有广告 Cookie，没有第三方追踪脚本，不做跨站行为分析。不登录的话，站点不会往你浏览器里写任何 Cookie。",
          },
          {
            icon: Lock,
            title: "第三方服务",
            body: "站点托管在 Cloudflare（会产生标准的服务器访问日志）。餐厅基础信息、评论和照片来自 Google Maps Platform。评论可信度分析和摘要由 DeepSeek 的 AI 接口生成——发送给它的只有餐厅名、地址和公开的 Google 评论内容，不包含任何用户个人信息。",
          },
          {
            icon: Trash2,
            title: "删除你的数据",
            body: `想删除账号和全部收藏记录，发邮件到 ${contactEmail} 说明一下就行，我会手动处理并回复确认。`,
          },
        ],
        neverTitle: "我们明确不做的事",
        never: [
          "不出售、不出租你的任何数据",
          "不投放广告，不接入广告网络",
          "不做用户画像或跨站追踪",
          "不接受付费提升餐厅排名",
        ],
        contactNote: "对这份政策有疑问，或者想知道我们保存了你的哪些数据，直接写信给我：",
        back: "返回首页",
      }
    : {
        eyebrow: "プライバシーポリシー",
        title: "取得する情報と、取得しない情報",
        lead: "端的に言えば、ログインしない限り個人を識別できる情報は一切取得しません。以下が詳細です。",
        updated: "最終更新：2026年9月",
        sections: [
          {
            icon: UserRound,
            title: "ログイン情報（Googleでログインした場合のみ）",
            body: "Googleアカウントでログインした場合、GoogleのユーザーID、メールアドレス、表示名、プロフィール画像のURLを保存します。これはお気に入り機能のための識別にのみ使用し、それ以外の用途やマーケティングメールの送信には使いません。ログインしなければこれらのデータは一切発生しません。",
          },
          {
            icon: Database,
            title: "お気に入りの記録",
            body: "ログイン後に登録したお気に入りは「どのユーザーがどの店を登録したか」という記録として保存されます。機能の実現に必要な最小限の情報です。",
          },
          {
            icon: Share2,
            title: "閲覧数の集計（匿名）",
            body: "トップページの人気ランキングのため、各店舗が1日に何回開かれたかを集計しています。記録するのは「店舗・日付・回数」のみで、誰が見たかは記録せず、ユーザーアカウントとも紐付けません。ログインの有無に関わらず同じです。",
          },
          {
            icon: Cookie,
            title: "Cookie",
            body: "ログイン状態の保持に必要なCookieのみを使用します。広告Cookieや第三者のトラッキングスクリプトは使用せず、サイトをまたいだ行動分析も行いません。ログインしない場合、ブラウザにCookieを書き込むことはありません。",
          },
          {
            icon: Lock,
            title: "第三者サービス",
            body: "サイトはCloudflare上でホストされています（標準的なアクセスログが生成されます）。店舗情報・レビュー・写真は Google Maps Platform から取得しています。レビューの信頼度分析と要約は DeepSeek のAI APIで生成しており、送信するのは店名・住所・公開されているGoogleレビューの本文のみで、利用者の個人情報は含みません。",
          },
          {
            icon: Trash2,
            title: "データの削除",
            body: `アカウントとお気に入り記録の削除をご希望の場合は、${contactEmail} までご連絡ください。手動で対応し、完了後にご返信します。`,
          },
        ],
        neverTitle: "行わないこと",
        never: [
          "データの販売・貸与は行いません",
          "広告の配信、広告ネットワークへの接続は行いません",
          "ユーザープロファイリングやクロスサイト追跡は行いません",
          "有料での掲載順位の引き上げは行いません",
        ],
        contactNote: "本ポリシーに関するご質問、保存されているデータの確認は、こちらまでご連絡ください：",
        back: "ホームへ戻る",
      };

  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-vermilion-50 px-3 py-1 text-xs font-bold tracking-[0.14em] text-vermilion-700">
        <Lock size={14} />
        {copy.eyebrow}
      </div>
      <h1 className="font-serif text-4xl font-black leading-tight text-ink-900 md:text-5xl">{copy.title}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-ink-500">{copy.lead}</p>
      <p className="mt-2 text-xs text-ink-400">{copy.updated}</p>

      <div className="divider-chinese" />

      <div className="space-y-6">
        {copy.sections.map(({ icon: Icon, title, body }) => (
          <section key={title} className="rounded-xl border border-warm-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-ink-900">
              <Icon size={17} className="shrink-0 text-vermilion-700" />
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-500">{body}</p>
          </section>
        ))}
      </div>

      <div className="divider-chinese" />

      <h2 className="font-serif text-2xl font-bold text-ink-900">{copy.neverTitle}</h2>
      <ul className="mt-4 space-y-3">
        {copy.never.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-ink-500">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-10 border-t border-warm-100 pt-8">
        <p className="text-sm leading-6 text-ink-500">{copy.contactNote}</p>
        <a
          href={`mailto:${contactEmail}`}
          className="mt-1 inline-block text-sm font-semibold text-vermilion-700 hover:underline"
        >
          {contactEmail}
        </a>
        <div className="mt-6">
          <Link href={`/${locale}`} className="text-sm font-semibold text-ink-700 hover:underline">
            {copy.back}
          </Link>
        </div>
      </div>
    </main>
  );
}
