import { useTranslations } from "next-intl";
import Link from "next/link";
import { ChevronRight, ShoppingBag, Sparkles, Store } from "lucide-react";
import { dishTypes, FEATURED_DISH_TYPES, type DishType } from "@/lib/restaurant-types";
import { DISH_TYPE_ICONS } from "@/lib/dish-type-icons";

type Props = {
  locale: string;
  counts: Record<string, number>;
};

const FEATURED_SET = new Set<string>(FEATURED_DISH_TYPES);

/**
 * 品类卡片网格：
 * 1) 顶部特别强调「熟食卤味」与「中华物产店」两大在日华人刚需特色专区；
 * 2) 下方为精细化后的 15 大餐饮业态网格。
 */
export function DishTypeCardGrid({ locale, counts }: Props) {
  const td = useTranslations("dish_type");
  const isZh = locale === "zh";

  const featuredCards: Array<{
    key: DishType;
    badge: string;
    subtitle: string;
    gradient: string;
    border: string;
    iconBg: string;
    accent: string;
    Icon: typeof ShoppingBag;
  }> = [
    {
      key: "deli",
      badge: isZh ? "特色必逛 · 外带熟食" : "注目 · 中華惣菜",
      subtitle: isZh
        ? "周黑鸭风味鸭脖、卤猪蹄、夫妻肺片、口水鸡、广式烧腊外带专门店"
        : "鴨首・豚足煮込み・冷菜・広東焼臘などテイクアウト専門の中華熟食",
      gradient: "from-[#2c1512] via-[#1c1215] to-[#131117]",
      border: "border-[#f06d49]/45 hover:border-[#f2cb72]/80",
      iconBg: "bg-[#f06d49]/20 border-[#f06d49]/40",
      accent: "#ff9b7b",
      Icon: ShoppingBag,
    },
    {
      key: "grocery",
      badge: isZh ? "华人囤货 · 食材超市" : "注目 · 食材スーパー",
      subtitle: isZh
        ? "火锅底料、中国调味料、老干妈、速食螺蛳粉、冷冻水饺与国内零食一站购齐"
        : "火鍋の素・本場調味料・中国菓子・冷凍点心・中華食材が揃う物産店",
      gradient: "from-[#12241d] via-[#121918] to-[#131117]",
      border: "border-emerald-400/40 hover:border-[#f2cb72]/80",
      iconBg: "bg-emerald-500/20 border-emerald-400/40",
      accent: "#6ee7b7",
      Icon: Store,
    },
  ];

  const regularDishTypes = dishTypes.filter((key) => !FEATURED_SET.has(key));

  return (
    <div className="space-y-4">
      {/* 特别强调：熟食卤味 & 中华物产店双高亮大卡 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {featuredCards.map(({ key, badge, subtitle, gradient, border, iconBg, accent, Icon }) => {
          const count = counts[key] ?? 0;
          return (
            <Link
              key={key}
              href={`/${locale}/restaurants?dish_type=${key}`}
              className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(0,0,0,0.6),0_0_24px_rgba(242,203,114,0.16)] sm:p-5 ${gradient} ${border}`}
            >
              {/* 右上角微妙星光 */}
              <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-[#f2cb72]/10 blur-2xl transition-opacity group-hover:opacity-100" />

              <div className="relative flex items-start gap-3.5">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${iconBg}`}
                >
                  <Icon size={24} style={{ color: accent }} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#f2cb72]/35 bg-[#f2cb72]/12 px-2 py-0.5 text-[10.5px] font-bold text-[#f2cb72]">
                      <Sparkles size={10} />
                      {badge}
                    </span>
                    <span className="text-xs font-bold text-white/80">
                      {count > 0 ? (isZh ? `${count} 家门店` : `${count}店舗`) : isZh ? "持续收录中" : "順次追加中"}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <h3 className="font-serif text-lg font-black text-white transition-colors group-hover:text-[#f2cb72] sm:text-xl">
                      {td(key)}
                    </h3>
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[#f2cb72] transition-transform group-hover:translate-x-0.5">
                      {isZh ? "去逛逛" : "見る"}
                      <ChevronRight size={14} />
                    </span>
                  </div>

                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/65">
                    {subtitle}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 精细化餐饮业态网格 */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:gap-2.5">
        {regularDishTypes.map((key) => {
          const Icon = DISH_TYPE_ICONS[key];
          const count = counts[key];
          return (
            <Link
              key={key}
              href={`/${locale}/restaurants?dish_type=${key}`}
              className="dish-type-tag group flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
            >
              <Icon size={20} />
              <span className="text-xs font-semibold leading-tight whitespace-nowrap">
                {td(key)}
              </span>
              <span className="text-[11px] opacity-60">
                {count !== undefined && count > 0 ? `${count}${isZh ? "店" : "件"}` : "-"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function DishTypeGrid({ locale, counts }: Props) {
  const t = useTranslations("home");

  return (
    <section className="py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <h2
          className="font-serif text-2xl font-bold sm:text-3xl"
          style={{ color: "var(--color-ink-900)" }}
        >
          {t("section_dish_types")}
        </h2>
        <span className="text-xs text-white/50">
          {locale === "zh"
            ? "重点推荐「熟食卤味」与「中华物产店」，餐饮业态已细分为 15 类"
            : "「中華惣菜・熟食」「中華物産店」をピックアップ掲載"}
        </span>
      </div>

      <DishTypeCardGrid locale={locale} counts={counts} />
    </section>
  );
}
