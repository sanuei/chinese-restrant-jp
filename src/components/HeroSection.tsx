import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  cuisineTypes,
  getRating,
  getRestaurantName,
  normalizeCuisineType,
  parsePhotoReferences,
  photoSrc,
  type RestaurantRow,
} from "@/lib/restaurant-types";
import { CUISINE_ICONS } from "@/lib/cuisine-icons";
import HeroArcGallery, { type HeroArcCardItem } from "@/components/HeroArcGallery";

export type HeroShowcaseRestaurant = Pick<
  RestaurantRow,
  "id" | "name_zh" | "name_ja" | "name_original" | "cuisine_type" | "trusted_rating" | "raw_rating" | "photos"
>;

type Props = {
  locale: string;
  counts: Record<string, number>;
  showcaseRestaurants: HeroShowcaseRestaurant[];
};

const FALLBACK_PHOTOS = [
  "https://images.unsplash.com/photo-1621916805571-2e804f82170c?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1525755662778-989d0524087e?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1555126634-323283e090fa?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?q=80&w=600&auto=format&fit=crop",
];

export default async function HeroSection({ locale, counts, showcaseRestaurants }: Props) {
  const tc = await getTranslations({ locale, namespace: "cuisine" });

  const copy = locale === "zh"
    ? {
        titleLine1: "东京与关东的",
        titleLine2: "真实中国味评鉴",
        subtitleLine1: "结合 Google 最新真实评论、AI 可信评分与正宗度评鉴，",
        subtitleLine2: "不用翻遍攻略，几秒锁定真正地道的中餐馆。",
        cta: "探索全部餐厅",
        features: [
          {
            title: "AI 真实口碑评鉴",
            desc: "过滤水分与刷评，结合华人真实反馈，还原每家店的真实水准与正宗度。",
          },
          {
            title: "全菜系与商圈直达",
            desc: "覆盖川湘粤东北西北云贵闽苏浙，按菜系、品类与 16 大热门车站一键筛选。",
          },
          {
            title: "每周持续自动收录",
            desc: "覆盖东京 23 区及横滨、川崎、西川口与船桥，每周自动发现高分新好店。",
          },
        ],
      }
    : {
        titleLine1: "東京と関東の",
        titleLine2: "本物の中華を見極める",
        subtitleLine1: "Google の最新レビューと AI 信頼スコア・ガチ度鑑定を統合。",
        subtitleLine2: "迷わず数秒で、本当に美味しいガチ中華に出会えます。",
        cta: "レストランを探す",
        features: [
          {
            title: "AI 信頼スコア鑑定",
            desc: "サクラや偏った評価を除外し、現地のリアルな口コミから本当の実力を可視化。",
          },
          {
            title: "ジャンル・業態・駅で即検索",
            desc: "四川・広東・東北・西北など全菜系と業態、主要16駅エリアから直感的に絞り込み。",
          },
          {
            title: "毎週自動で新店を収録",
            desc: "東京23区から横浜・川崎・西川口・船橋まで、高評価の新店舗を毎週自動追加。",
          },
        ],
      };

  // 至少 9 张，最多 16 张真实高分正宗餐厅卡片，支持无限环形左右滑动
  const cardCount = Math.max(9, Math.min(16, showcaseRestaurants.length));
  const cards: HeroArcCardItem[] = Array.from({ length: cardCount }, (_, idx) => {
    const item = showcaseRestaurants[idx];
    if (!item) {
      return {
        key: `fallback-${idx}`,
        href: `/${locale}/restaurants`,
        photo: FALLBACK_PHOTOS[idx % FALLBACK_PHOTOS.length],
        name: locale === "zh" ? "精选正宗中餐" : "厳選ガチ中華",
        cuisineLabel: "",
        rating: null,
      };
    }

    const refs = parsePhotoReferences(item.photos);
    // 统一使用 600px 宽度，直接命中 /api/photo 的 R2 缓存，不产生额外 Google Photo 费用
    const photo = refs.length > 0 ? photoSrc(refs[0], 600) : FALLBACK_PHOTOS[idx % FALLBACK_PHOTOS.length];
    const cuisine = normalizeCuisineType(item.cuisine_type);
    return {
      key: item.id,
      href: `/${locale}/restaurants/${item.id}`,
      photo,
      name: getRestaurantName(item, locale),
      cuisineLabel: tc(cuisine),
      rating: getRating(item),
    };
  });

  return (
    <section className="hero-showcase pt-14 pb-16 sm:pt-20 sm:pb-20">
      <div className="hero-showcase-glow" aria-hidden />
      <div className="hero-showcase-dots" aria-hidden />

      {/* 顶部居中标题 + 副标题 + 发光胶囊 CTA */}
      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
        <h1 className="font-serif text-4xl font-bold leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-[3.55rem]">
          <span className="block">{copy.titleLine1}</span>
          <span className="mt-1 block bg-gradient-to-b from-white via-warm-50 to-gold-300 bg-clip-text text-transparent">
            {copy.titleLine2}
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">
          <span className="block">{copy.subtitleLine1}</span>
          <span className="block">{copy.subtitleLine2}</span>
        </p>

        <div className="mt-8 flex justify-center">
          <Link href={`/${locale}/restaurants`} className="hero-cta-pill">
            <span>{copy.cta}</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* 视觉焦点：可左右无限滑动的 3D 内凹弧形真实餐厅画廊 */}
      <HeroArcGallery cards={cards} locale={locale} />

      {/* 菜系快捷细胶囊条（保留首页按菜系一键筛选功能） */}
      <div className="relative mx-auto mt-6 max-w-5xl px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {cuisineTypes.map((key) => {
            const Icon = CUISINE_ICONS[key];
            return (
              <Link
                key={key}
                href={`/${locale}/restaurants?cuisine=${key}`}
                className="hero-cuisine-pill"
              >
                <Icon size={14} />
                <span>{tc(key)}</span>
                {counts[key] !== undefined && (
                  <span className="text-[11px] text-white/45">{counts[key]}</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 底部 3 栏核心亮点（对应参考图底部三栏排版） */}
      <div className="relative mx-auto mt-12 max-w-5xl px-4 sm:mt-14 sm:px-6">
        <div className="grid grid-cols-1 gap-8 text-center sm:grid-cols-3 sm:gap-10">
          {copy.features.map((feat) => (
            <div key={feat.title} className="px-2">
              <h2 className="text-base font-semibold tracking-wide text-white/95 sm:text-[1.05rem]">
                {feat.title}
              </h2>
              <p className="mx-auto mt-2.5 max-w-xs text-xs leading-relaxed text-white/48 sm:text-[13px]">
                {feat.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
