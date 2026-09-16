import { Clock } from "lucide-react";
import { getOpenState, getTodayText, parseOpeningHours } from "@/lib/opening-hours";

type Props = { raw: string | null; locale: string };

export default function OpeningHours({ raw, locale }: Props) {
  const hours = parseOpeningHours(raw);
  if (!hours) return null;

  const state = getOpenState(hours);
  const todayText = getTodayText(hours);
  const isZh = locale === "zh";

  const label =
    state.status === "open"
      ? isZh ? "营业中" : "営業中"
      : state.status === "closed"
        ? isZh ? "已打烊" : "営業時間外"
        : isZh ? "营业时间" : "営業時間";

  const detail =
    state.until && state.status === "open"
      ? isZh ? `营业至 ${state.until}` : `${state.until} まで`
      : state.until && state.status === "closed"
        ? isZh ? `${state.until} 开门` : `${state.until} 開店`
        : null;

  return (
    <details className="mb-4 rounded-lg bg-warm-50 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-ink-700">
        <Clock size={16} className="shrink-0 text-vermilion-700" />
        <span
          className={`font-bold ${state.status === "open" ? "text-vermilion-700" : "text-ink-700"}`}
        >
          {label}
        </span>
        {detail && <span className="text-xs text-ink-400">{detail}</span>}
      </summary>
      {hours.weekday_text.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-warm-200 pt-2 text-xs text-ink-500">
          {hours.weekday_text.map((line) => (
            <li key={line} className={line === todayText ? "font-bold text-ink-900" : undefined}>
              {line}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
