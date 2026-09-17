import Link from "next/link";
import { TrainFront } from "lucide-react";
import { useTranslations } from "next-intl";
import { stationAreas, type StationAreaKey } from "@/lib/station-areas";

type Props = {
  locale: string;
  counts: Record<StationAreaKey, number>;
};

export default function StationGrid({ locale, counts }: Props) {
  const t = useTranslations("home");

  return (
    <section className="py-12">
      <div className="mb-8">
        <h2 className="font-serif text-2xl font-bold text-ink-900 sm:text-3xl">
          {t("section_stations")}
        </h2>
        <p className="mt-2 text-sm text-ink-400">{t("section_stations_hint")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
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
              className="group flex min-h-28 flex-col justify-between rounded-xl border border-warm-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-vermilion-300 hover:shadow-md"
            >
              <TrainFront size={23} className="text-vermilion-700 transition-transform group-hover:scale-110" />
              <div>
                <div className="font-serif text-base font-bold text-ink-900">{label}</div>
                <div className="mt-1 text-xs text-ink-400">
                  {t("station_count", { count: counts[station.key] })}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
