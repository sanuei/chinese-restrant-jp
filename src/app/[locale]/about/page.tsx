import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, Bot, MapPinned, ScanSearch, ShieldCheck, Star } from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "关于我们" : "このサイトについて",
    description:
      locale === "zh"
        ? "真味中华是一个用 AI 分析 Google 评论、帮你在东京和关东找到真正正宗中餐的指南。了解我们的评分方式、正宗度判定和数据来源。"
        : "ガチ中華ナビは、AIがGoogleレビューを分析して東京・関東の本格中華を探せるガイドです。評価方法、認定基準、データの出どころを説明します。",
    alternates: {
      canonical: `/${locale}/about`,
      languages: { zh: "/zh/about", ja: "/ja/about", "x-default": "/zh/about" },
    },
  };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  const isZh = locale === "zh";

  const copy = isZh
    ? {
        eyebrow: "关于我们",
        title: "在异乡，找到那一口真味",
        lead: "在日本吃中餐，最难的不是找不到店，而是分不清哪家是真正的中国味，哪家是为日本口味改良过的「中華料理」。真味中华就是为了解决这件事做的。",
        sectionHow: "我们怎么判断一家店",
        how: [
          {
            icon: Bot,
            title: "AI 读完每一条评论",
            body: "我们抓取每家店的 Google 评论，交给 AI 逐条判断可信度。空泛的溢美之词、情绪化攻击会被降权；提到具体菜品、口味、排队情况、优缺点并存的评论会被加权。",
          },
          {
            icon: Star,
            title: "可信评分，不是原始评分",
            body: "你在卡片上看到的分数是过滤掉低可信评论之后重新加权的结果，所以它经常和 Google 的原始评分不一样。两个分数我们都会显示，让你自己对照。",
          },
          {
            icon: ShieldCheck,
            title: "正宗度分成四档",
            body: "正宗中华、改良中华、日式中华、待认证。这是一个描述，不是价值判断 —— 日式中华里也有好吃的店，我们只是帮你知道自己要吃的是什么。",
          },
          {
            icon: BookOpenCheck,
            title: "菜系和品类两个维度",
            body: "菜系说的是地域风味（川菜、粤菜、湘菜……），品类说的是经营业态（火锅、烧烤、麻辣烫、米线……）。想吃火锅和想吃川菜是两件事，所以分开做。",
          },
        ],
        sectionScope: "收录范围",
        scope: "目前只收录关东地区（东京及周边）的中餐厅。范围小是故意的 —— 与其铺开做一个哪里都不准的全国站，不如先把一个区域做扎实。",
        sectionVerify: "自己鉴定一家店",
        verifyBody:
          "如果你发现了一家还没被收录的店，可以把它的 Google Maps 链接贴进鉴定页面。AI 会现场分析它的评论并给出判定结果；如果确认是关东地区的中餐厅，它会被自动收录进站点。",
        verifyCta: "去鉴定一家店",
        sectionLimits: "需要说明的局限",
        limits: [
          "AI 判断会出错。评论数太少、店铺信息不全的时候尤其明显。",
          "评分基于 Google 评论，而 Google 评论本身就有偏差 —— 比如中文评论多的店，正宗度往往更容易被判高。",
          "餐厅数据不是实时的，营业时间、是否停业请以 Google 地图和店家为准。",
          "我们不接受付费提高排名。发现哪里不对，欢迎直接写信告诉我们。",
        ],
        contactCta: "联系我们",
        homeCta: "返回首页",
      }
    : {
        eyebrow: "このサイトについて",
        title: "異国で、本物の一口を見つける",
        lead: "日本で中華を食べるとき、難しいのは店を見つけることではなく、どこが本場の味で、どこが日本人向けにアレンジされた「中華料理」なのかを見分けることです。ガチ中華ナビはその一点のために作りました。",
        sectionHow: "どうやって判断しているか",
        how: [
          {
            icon: Bot,
            title: "AIがレビューを1件ずつ読む",
            body: "各店舗のGoogleレビューを取得し、AIが1件ずつ信頼度を判定します。中身のない絶賛や感情的な批判は重みを下げ、具体的な料理名・味・行列・長所と短所の両方に触れたレビューは重みを上げます。",
          },
          {
            icon: Star,
            title: "Google評価ではなく、信頼スコア",
            body: "カードに表示されるスコアは、信頼度の低いレビューを除いて再計算した結果です。そのためGoogleの評価と一致しないことがよくあります。両方を併記しているので、見比べてください。",
          },
          {
            icon: ShieldCheck,
            title: "認定は4段階",
            body: "ガチ中華、アレンジ中華、日式中華、未認定。これは価値判断ではなく説明です。日式中華にも美味しい店はあります。自分が何を食べようとしているのかが分かるようにするためのものです。",
          },
          {
            icon: BookOpenCheck,
            title: "ジャンルと業態の2軸",
            body: "ジャンルは地域の味（四川・広東・湖南…）、業態は店の形態（火鍋・焼烤・麻辣湯・米線…）です。火鍋が食べたいのと四川料理が食べたいのは別の話なので、分けています。",
          },
        ],
        sectionScope: "掲載範囲",
        scope: "現在は関東エリア（東京およびその周辺）の中国料理店のみを掲載しています。範囲が狭いのは意図的です。どこも不正確な全国サイトを作るより、まず一つの地域をしっかり作るほうがいいと考えています。",
        sectionVerify: "自分で鑑定してみる",
        verifyBody:
          "まだ掲載されていない店を見つけたら、そのGoogle Mapsのリンクを鑑定ページに貼ってください。AIがその場でレビューを分析して判定します。関東エリアの中国料理店だと確認できれば、自動的にサイトに掲載されます。",
        verifyCta: "店を鑑定する",
        sectionLimits: "限界についての注意",
        limits: [
          "AIの判断は間違えます。レビュー数が少ない店や情報が不足している店では特にそうです。",
          "評価はGoogleレビューに基づいており、レビュー自体に偏りがあります。たとえば中国語のレビューが多い店ほど、認定が高く出やすい傾向があります。",
          "店舗データはリアルタイムではありません。営業時間や閉店については Google マップと店舗に直接ご確認ください。",
          "掲載順位を有料で上げることはしていません。おかしい点を見つけたら、直接ご連絡ください。",
        ],
        contactCta: "お問い合わせ",
        homeCta: "ホームへ戻る",
      };

  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-vermilion-50 px-3 py-1 text-xs font-bold tracking-[0.14em] text-vermilion-700">
        <MapPinned size={14} />
        {copy.eyebrow}
      </div>
      <h1 className="font-serif text-4xl font-black leading-tight text-ink-900 md:text-5xl">{copy.title}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-ink-500">{copy.lead}</p>

      <div className="divider-chinese" />

      <h2 className="font-serif text-2xl font-bold text-ink-900">{copy.sectionHow}</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {copy.how.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-warm-200 bg-white p-5 shadow-sm">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-vermilion-50">
              <Icon size={18} className="text-vermilion-700" />
            </div>
            <h3 className="font-bold text-ink-900">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-ink-500">{body}</p>
          </div>
        ))}
      </div>

      <div className="divider-chinese" />

      <h2 className="font-serif text-2xl font-bold text-ink-900">{copy.sectionScope}</h2>
      <p className="mt-3 text-base leading-7 text-ink-500">{copy.scope}</p>

      <div className="divider-chinese" />

      <h2 className="font-serif text-2xl font-bold text-ink-900">{copy.sectionVerify}</h2>
      <p className="mt-3 text-base leading-7 text-ink-500">{copy.verifyBody}</p>
      <Link
        href={`/${locale}/verify`}
        className="mt-5 inline-flex items-center gap-2 rounded-md bg-vermilion-700 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <ScanSearch size={16} />
        {copy.verifyCta}
      </Link>

      <div className="divider-chinese" />

      <h2 className="font-serif text-2xl font-bold text-ink-900">{copy.sectionLimits}</h2>
      <ul className="mt-4 space-y-3">
        {copy.limits.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-ink-500">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-warm-100 pt-8 text-sm font-semibold">
        <Link href={`/${locale}/contact`} className="text-vermilion-700 hover:underline">
          {copy.contactCta}
        </Link>
        <span className="text-warm-200">/</span>
        <Link href={`/${locale}`} className="text-ink-700 hover:underline">
          {copy.homeCta}
        </Link>
      </div>
    </main>
  );
}
