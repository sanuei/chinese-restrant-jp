import Link from "next/link";
import { Mail, Megaphone } from "lucide-react";

const CONTACT_EMAIL = "sanuei.yann@gmail.com";

type Props = { locale: string };

/**
 * 首页广告位（招商中）。
 *
 * 刻意不做成一张空的 banner 占位图 —— 现在还没有客户，空框只会显得页面残缺。
 * 这里写成「招租说明 + 联系方式」，既是广告位本身，也是给商家的落地页；
 * 等有客户了，把左侧文案区换成 banner 图 + 跳转链接即可，外框不用动。
 *
 * 图片走 public/ 直出（OpenNext + Workers 上 /_next/image 会 500）。
 */
export default function AdSlot({ locale }: Props) {
  const isZh = locale === "zh";
  const copy = isZh
    ? {
        badge: "广告",
        eyebrow: "首页广告位招租",
        title: "这里可以放你的广告",
        body: "面向在日中华料理店、食材批发、跨境物流与旅游服务。位置在首页正文中段，长期展示，目前只接少量商家，价格和形式都好商量。",
        contactLabel: "合作联系",
        mailCta: "发邮件给我",
        qrTitle: "微信扫码",
        qrHint: "备注「广告合作」",
        more: "其他联系方式",
      }
    : {
        badge: "広告",
        eyebrow: "トップページ広告枠",
        title: "この枠に広告を掲載できます",
        body: "在日の中華料理店、食材卸、越境物流、旅行サービス向け。掲載位置はトップページ本文の中段で長期掲載。現在は少数の枠のみ受け付けています。料金・形式はご相談ください。",
        contactLabel: "お問い合わせ",
        mailCta: "メールで連絡する",
        qrTitle: "WeChatで連絡",
        qrHint: "「広告掲載」と一言",
        more: "その他の連絡方法",
      };

  return (
    <section className="py-8">
      <div
        className="rounded-xl border p-5 md:p-6"
        style={{
          borderColor: "var(--color-gold-300)",
          background:
            "linear-gradient(120deg, var(--color-warm-50) 0%, #fff 60%, var(--color-warm-50) 100%)",
        }}
      >
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_170px] md:items-stretch md:gap-7">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {/* 广告要标清楚，别让人以为是站点自己的内容 */}
              <span
                className="rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-[0.16em]"
                style={{ borderColor: "var(--color-warm-200)", color: "var(--color-ink-400)" }}
              >
                {copy.badge}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.14em] text-vermilion-700">
                <Megaphone size={14} />
                {copy.eyebrow}
              </span>
            </div>

            <h2 className="font-serif text-xl font-black leading-tight text-ink-900 sm:text-2xl">
              {copy.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-500">{copy.body}</p>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-warm-100 pt-4">
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                  isZh ? "首页广告合作咨询" : "トップページ広告掲載の相談"
                )}`}
                className="inline-flex items-center gap-2 rounded-md bg-vermilion-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-vermilion-900"
              >
                <Mail size={15} />
                {copy.mailCta}
              </a>
              <Link
                href={`/${locale}/contact`}
                className="text-sm font-semibold text-vermilion-700 hover:underline"
              >
                {copy.more} →
              </Link>
            </div>

            <p className="mt-2 text-xs text-ink-400">
              {copy.contactLabel}：
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-ink-700 hover:text-vermilion-700"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>

          <aside className="flex items-center gap-3 rounded-lg border border-warm-200 bg-white p-3 md:h-full md:flex-col md:justify-center md:gap-2 md:text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/contact/wechat-add.webp"
              alt={isZh ? "微信二维码：扫码加我谈广告合作" : "WeChat QRコード"}
              width={720}
              height={918}
              loading="lazy"
              className="h-24 w-auto shrink-0 rounded border border-warm-100 bg-white md:h-[112px]"
            />
            <div className="text-xs leading-5 text-ink-400">
              <div className="font-bold text-ink-700">{copy.qrTitle}</div>
              <div>{copy.qrHint}</div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
