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
        className="rounded-2xl border p-5 md:p-6 shadow-[0_18px_42px_rgba(0,0,0,0.6)]"
        style={{
          borderColor: "rgba(242, 203, 114, 0.28)",
          background:
            "linear-gradient(120deg, rgba(235, 168, 52, 0.09) 0%, #111015 55%, rgba(196, 62, 34, 0.09) 100%)",
        }}
      >
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_170px] md:items-stretch md:gap-7">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {/* 广告要标清楚，别让人以为是站点自己的内容 */}
              <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.16em] text-white/55">
                {copy.badge}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.14em] text-gold-300">
                <Megaphone size={14} />
                {copy.eyebrow}
              </span>
            </div>

            <h2 className="font-serif text-xl font-black leading-tight text-white sm:text-2xl">
              {copy.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/62">{copy.body}</p>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-4">
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                  isZh ? "首页广告合作咨询" : "トップページ広告掲載の相談"
                )}`}
                className="btn-primary rounded-full px-4 py-2 text-sm font-bold"
              >
                <Mail size={15} />
                {copy.mailCta}
              </a>
              <Link
                href={`/${locale}/contact`}
                className="text-sm font-semibold text-gold-300 hover:underline"
              >
                {copy.more} →
              </Link>
            </div>

            <p className="mt-2 text-xs text-white/45">
              {copy.contactLabel}：
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-white/80 hover:text-gold-300"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>

          <aside className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-3 md:h-full md:flex-col md:justify-center md:gap-2 md:text-center">
            {/* 二维码保留白底框（qr-light-frame），确保微信扫码稳定识别 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/contact/wechat-add.webp"
              alt={isZh ? "微信二维码：扫码加我谈广告合作" : "WeChat QRコード"}
              width={720}
              height={918}
              loading="lazy"
              className="qr-light-frame h-24 w-auto shrink-0 rounded bg-white p-1 md:h-[112px]"
            />
            <div className="text-xs leading-5 text-white/55">
              <div className="font-bold text-white/90">{copy.qrTitle}</div>
              <div>{copy.qrHint}</div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
