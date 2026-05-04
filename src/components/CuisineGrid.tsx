import { useTranslations } from "next-intl";
import Link from "next/link";

type Props = { locale: string };

const CUISINES = [
  { key: "sichuan",   emoji: "🌶️", count: 120 },
  { key: "cantonese", emoji: "🦐", count: 85 },
  { key: "northern",  emoji: "🥟", count: 93 },
  { key: "fujian",    emoji: "🌊", count: 31 },
  { key: "hunan",     emoji: "🌿", count: 48 },
  { key: "jiangsu",   emoji: "🍲", count: 67 },
  { key: "northwest", emoji: "🐏", count: 42 },
  { key: "yunnan",    emoji: "🥬", count: 38 },
  { key: "other",     emoji: "🍜", count: 156 },
] as const;

export default function CuisineGrid({ locale }: Props) {
  const t = useTranslations("home");
  const tc = useTranslations("cuisine");

  return (
    <section className="py-12">
      <h2 className="font-serif font-bold text-2xl sm:text-3xl mb-8"
          style={{ color: "var(--color-ink-900)" }}>
        {t("section_cuisines")}
      </h2>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-9 gap-3">
        {CUISINES.map(({ key, emoji, count }) => (
          <Link
            key={key}
            href={`/${locale}/cuisines/${key}`}
            className={`cuisine-tag cuisine-${key} group flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer`}
            style={{ padding: "14px 8px" }}
          >
            <span className="text-3xl">{emoji}</span>
            <span className="font-semibold text-xs leading-tight whitespace-nowrap">
              {tc(key)}
            </span>
            <span className="text-xs opacity-60">{count}店</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
