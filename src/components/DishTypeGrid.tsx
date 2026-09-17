import { useTranslations } from "next-intl";
import Link from "next/link";
import { dishTypes } from "@/lib/restaurant-types";
import { DISH_TYPE_ICONS } from "@/lib/dish-type-icons";

type Props = {
  locale: string;
  counts: Record<string, number>;
};

/**
 * 品类卡片网格（只有网格，没有标题/外间距）。
 * 首页把它和车站网格一起塞进 HomeDiscovery 的切换标签里，
 * 所以这里必须能脱离 section 单独用；/cuisines 页面走下面的默认导出。
 */
export function DishTypeCardGrid({ locale, counts }: Props) {
  const td = useTranslations("dish_type");

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-9 lg:gap-3">
      {dishTypes.map((key) => {
        const Icon = DISH_TYPE_ICONS[key];
        return (
          <Link
            key={key}
            href={`/${locale}/restaurants?dish_type=${key}`}
            className="dish-type-tag group flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2.5 text-center transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
          >
            <Icon size={22} />
            <span className="font-semibold text-xs leading-tight whitespace-nowrap">
              {td(key)}
            </span>
            <span className="text-[11px] opacity-60">
              {counts[key] !== undefined ? `${counts[key]}店` : "-"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export default function DishTypeGrid({ locale, counts }: Props) {
  const t = useTranslations("home");

  return (
    <section className="py-8">
      <h2 className="font-serif font-bold text-2xl sm:text-3xl mb-5"
          style={{ color: "var(--color-ink-900)" }}>
        {t("section_dish_types")}
      </h2>

      <DishTypeCardGrid locale={locale} counts={counts} />
    </section>
  );
}
