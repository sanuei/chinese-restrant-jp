import type { Metadata } from "next";
import Link from "next/link";
import { HandCoins, Mail, MessageCircle, MessageSquareText, ShieldCheck } from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

const contactEmail = "sanuei.yann@gmail.com";

const QR_CARDS = [
  {
    key: "wechat-add",
    src: "/contact/wechat-add.webp",
    width: 720,
    height: 918,
    Icon: MessageCircle,
  },
  {
    key: "wechat-pay",
    src: "/contact/wechat-pay.webp",
    width: 720,
    height: 978,
    Icon: HandCoins,
  },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "联系方式" : "お問い合わせ",
    description: locale === "zh"
      ? "联系真味中华，提交餐厅线索、数据修正和合作建议。"
      : "ガチ中華ナビへのお問い合わせ、店舗情報の修正、掲載相談はこちら。",
    alternates: {
      canonical: `/${locale}/contact`,
      languages: {
        zh: "/zh/contact",
        ja: "/ja/contact",
        "x-default": "/zh/contact",
      },
    },
  };
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  const isZh = locale === "zh";
  const copy = isZh
    ? {
        eyebrow: "联系真味中华",
        title: "餐厅线索、数据修正和合作联系",
        lead: "如果你发现餐厅信息不准确、想推荐一家真正值得收录的店，或者有合作想法，可以直接发邮件给我。",
        emailLabel: "联系邮箱",
        tipsTitle: "邮件里最好带上",
        tips: ["Google Maps 店铺链接", "需要修正或推荐的原因", "你的联系方式或称呼"],
        response: "我会优先处理关东地区中餐厅、真实评论线索和明显错误的数据。",
        qrTitle: "微信联系与打赏",
        qrLead: "微信上找我最快——扫码加好友就行，说一句是在真味中华看到的。如果这个站帮到了你，也欢迎扫码请我喝杯奶茶。",
        qrCards: {
          "wechat-add": {
            title: "微信联系",
            hint: "用微信扫一扫，加我为好友",
            alt: "yann 的微信好友二维码，扫码添加好友",
          },
          "wechat-pay": {
            title: "打赏支持",
            hint: "微信扫码，金额随意，心意到了就好",
            alt: "微信支付收款二维码，扫码打赏支持真味中华",
          },
        },
        back: "返回首页",
      }
    : {
        eyebrow: "Contact",
        title: "店舗情報の修正・推薦・掲載相談",
        lead: "掲載情報の誤り、本当におすすめしたい中国料理店、または協業の相談があればメールでご連絡ください。",
        emailLabel: "メール",
        tipsTitle: "メールに含めてほしい情報",
        tips: ["Google Maps の店舗リンク", "推薦または修正したい理由", "お名前または連絡先"],
        response: "関東エリアの中国料理店、信頼できるレビュー情報、明確なデータ修正を優先して確認します。",
        qrTitle: "WeChatでのご連絡・ご支援",
        qrLead: "WeChatが一番早いです。QRコードで友だち追加できます（「ガチ中華ナビを見た」と一言添えてください）。サイトがお役に立てば、投げ銭での応援も歓迎です。",
        qrCards: {
          "wechat-add": {
            title: "WeChatで連絡",
            hint: "WeChatでスキャンして友だち追加",
            alt: "yann のWeChat友だち追加QRコード",
          },
          "wechat-pay": {
            title: "投げ銭（応援）",
            hint: "WeChatでスキャン、金額は自由です",
            alt: "WeChat Pay の送金用QRコード",
          },
        },
        back: "ホームへ戻る",
      };

  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-vermilion-50 px-3 py-1 text-xs font-bold tracking-[0.14em] text-vermilion-700">
        <MessageSquareText size={14} />
        {copy.eyebrow}
      </div>
      <h1 className="font-serif text-4xl font-black leading-tight text-ink-900 md:text-5xl">{copy.title}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-ink-500">{copy.lead}</p>

      <section className="mt-10 grid gap-5 md:grid-cols-[1.05fr_0.95fr]">
        <a
          href={`mailto:${contactEmail}`}
          className="group rounded-xl border border-warm-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-vermilion-200 hover:shadow-md"
        >
          <div className="flex items-center gap-3 text-vermilion-700">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-vermilion-50">
              <Mail size={22} />
            </span>
            <span className="text-sm font-bold">{copy.emailLabel}</span>
          </div>
          <p className="mt-5 text-2xl font-bold text-ink-900 group-hover:text-vermilion-700">{contactEmail}</p>
        </a>

        <div className="rounded-xl border border-warm-200 bg-warm-50 p-6">
          <div className="flex items-center gap-2 font-bold text-ink-900">
            <ShieldCheck size={18} className="text-vermilion-700" />
            {copy.tipsTitle}
          </div>
          <ul className="mt-4 space-y-2 text-sm text-ink-600">
            {copy.tips.map((tip) => (
              <li key={tip} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-gold-500" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl font-black text-ink-900">{copy.qrTitle}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">{copy.qrLead}</p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {QR_CARDS.map(({ key, src, width, height, Icon }) => {
            const card = copy.qrCards[key];
            return (
              <figure key={key} className="rounded-xl border border-warm-200 bg-white p-5 text-center shadow-sm">
                <figcaption>
                  <div className="flex items-center justify-center gap-2 font-bold text-ink-900">
                    <Icon size={18} className="text-vermilion-700" />
                    {card.title}
                  </div>
                  <p className="mt-1 text-xs text-ink-400">{card.hint}</p>
                </figcaption>
                {/* 静态二维码图，走 public/ 直出即可，不需要 next/image 的优化管线 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={card.alt}
                  width={width}
                  height={height}
                  loading="lazy"
                  className="mx-auto mt-4 w-full max-w-[260px] rounded-lg border border-warm-200 bg-white"
                />
              </figure>
            );
          })}
        </div>
      </section>

      <p className="mt-8 text-sm leading-6 text-ink-400">{copy.response}</p>
      <Link href={`/${locale}`} className="mt-8 inline-flex text-sm font-bold text-vermilion-700 hover:text-vermilion-800">
        {copy.back}
      </Link>
    </main>
  );
}
