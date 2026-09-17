import { useTranslations } from "next-intl";
import { DishTypeCardGrid } from "@/components/DishTypeGrid";
import { StationCardGrid } from "@/components/StationGrid";
import type { StationAreaKey } from "@/lib/station-areas";

type Props = {
  locale: string;
  dishTypeCounts: Record<string, number>;
  stationCounts: Record<StationAreaKey, number>;
};

/**
 * 首页「按品类找餐厅」+「按车站找餐厅」合并成一个模块，右上角切换。
 *
 * 之前两块各占一个 section（py-12 + 分隔线 + 两行卡片），首页首屏基本被它们吃掉，
 * 密度很低。合并后：一个标题位、一个切换按钮、一格卡片高度。
 *
 * 切换用隐藏 radio + :checked 兄弟选择器实现，不引入 client component：
 * 站点跑在 Cloudflare Workers 上，CPU/JS 是硬约束，能不加 hydration 就不加。
 * 键盘也能用（radio 原生支持方向键切换），选中的 radio 用 :focus-visible 显示焦点环。
 */
export default function HomeDiscovery({ locale, dishTypeCounts, stationCounts }: Props) {
  const t = useTranslations("home");

  return (
    <section className="py-8">
      <div className="discovery-tabs">
        <input
          type="radio"
          id="discovery-tab-dish"
          name="home-discovery"
          className="discovery-tab-input"
          defaultChecked
        />
        <input
          type="radio"
          id="discovery-tab-station"
          name="home-discovery"
          className="discovery-tab-input"
        />

        <div className="discovery-head mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div>
            <h2
              className="discovery-pane font-serif text-2xl font-bold text-ink-900 sm:text-3xl"
              data-tab="dish"
            >
              {t("section_dish_types")}
            </h2>
            <h2
              className="discovery-pane font-serif text-2xl font-bold text-ink-900 sm:text-3xl"
              data-tab="station"
            >
              {t("section_stations")}
            </h2>
            <p className="discovery-pane mt-1.5 text-sm text-ink-400" data-tab="station">
              {t("section_stations_hint")}
            </p>
          </div>

          <div className="discovery-switch">
            <label htmlFor="discovery-tab-dish" className="discovery-switch-btn">
              {t("tab_dish_types")}
            </label>
            <label htmlFor="discovery-tab-station" className="discovery-switch-btn">
              {t("tab_stations")}
            </label>
          </div>
        </div>

        <div className="discovery-panels">
          <div className="discovery-pane" data-panel="dish">
            <DishTypeCardGrid locale={locale} counts={dishTypeCounts} />
          </div>
          <div className="discovery-pane" data-panel="station">
            <StationCardGrid locale={locale} counts={stationCounts} />
          </div>
        </div>
      </div>
    </section>
  );
}
