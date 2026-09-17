import Link from "next/link";
import { TrainFront } from "lucide-react";
import { useTranslations } from "next-intl";
import { stationAreas, type StationAreaKey } from "@/lib/station-areas";

type Props = {
  locale: string;
  counts: Record<StationAreaKey, number>;
};

/**
 * 车站卡片网格（只有网格，没有标题/外间距）——首页的切换标签要复用，
 * 所以和 DishTypeCardGrid 一样做成可独立渲染的组件。
 * 卡片排成「图标 + 站名 + 家数」的横条，比原来 min-h-28 的竖版矮一半，
 * 首页一屏能多露出一整块内容。
 */
export function StationCardGrid({ locale, counts }: Props) {
  const t = useTranslations("home");

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8 lg:gap-3">
      {stationAreas.map((station) => {
        const label = locale === "zh" ? station.zh : station.ja;
        const query = new URLSearchParams({
          q: station.searchTerm,
          authenticity: "authentic",
        });

        return (
          <Link
            key={station.key}
            href={`/${locale}/restaurants?${query.toString()}`}
            className="group flex items-center gap-2 rounded-lg border border-warm-200 bg-white px-2.5 py-2 transition-all hover:-translate-y-0.5 hover:border-vermilion-300 hover:shadow-md"
          >
            <TrainFront size={18} className="shrink-0 text-vermilion-700 transition-transform group-hover:scale-110" />
            <div className="min-w-0">
              <div className="font-serif text-sm font-bold leading-tight text-ink-900">{label}</div>
              <div className="text-[11px] leading-tight text-ink-400">
                {t("station_count", { count: counts[station.key] })}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function StationGrid({ locale, counts }: Props) {
  const t = useTranslations("home");

  return (
    <section className="py-8">
      <div className="mb-5">
        <h2 className="font-serif text-2xl font-bold text-ink-900 sm:text-3xl">
          {t("section_stations")}
        </h2>
        <p className="mt-1.5 text-sm text-ink-400">{t("section_stations_hint")}</p>
      </div>

      <StationCardGrid locale={locale} counts={counts} />
    </section>
  );
}
