import { useTranslations } from "next-intl";
import Link from "next/link";
import { dishTypes } from "@/lib/restaurant-types";
import { DISH_TYPE_ICONS } from "@/lib/dish-type-icons";

type Props = {
  locale: string;
  counts: Record<string, number>;
};

export default function DishTypeGrid({ locale, counts }: Props) {
  const t = useTranslations("home");
  const td = useTranslations("dish_type");

  return (
    <section className="py-12">
      <h2 className="font-serif font-bold text-2xl sm:text-3xl mb-8"
          style={{ color: "var(--color-ink-900)" }}>
        {t("section_dish_types")}
      </h2>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-9 gap-3">
        {dishTypes.map((key) => {
          const Icon = DISH_TYPE_ICONS[key];
          return (
            <Link
              key={key}
              href={`/${locale}/restaurants?dish_type=${key}`}
              className="dish-type-tag group flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
              style={{ padding: "14px 8px" }}
            >
              <Icon size={28} />
              <span className="font-semibold text-xs leading-tight whitespace-nowrap">
                {td(key)}
              </span>
              <span className="text-xs opacity-60">
                {counts[key] !== undefined ? `${counts[key]}店` : "-"}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
