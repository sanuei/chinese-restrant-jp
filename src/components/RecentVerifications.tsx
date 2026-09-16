import Link from "next/link";
import { History, ShieldCheck, ShieldX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/cloudflare";

type Row = {
  id: string;
  restaurant_id: string | null;
  place_name: string | null;
  status: string;
  verdict: string | null;
  region: string | null;
  created_at: string | null;
};

// 鉴定接口存的 verdict 是 gachi/adapted/japanese/unknown，
// 而站内 badge 用的是 authentic/adapted/japanese/unknown
const VERDICT_TO_BADGE: Record<string, string> = {
  gachi: "authentic",
  adapted: "adapted",
  japanese: "japanese",
  unknown: "unknown",
};

function timeAgo(iso: string | null, locale: string): string {
  if (!iso) return "";
  // D1 里存的是 "YYYY-MM-DD HH:MM:SS"（UTC），补成 ISO 才能被正确解析
  const ms = Date.parse(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(ms)) return "";
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  const isZh = locale === "zh";
  if (mins < 60) return isZh ? `${mins} 分钟前` : `${mins}分前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return isZh ? `${hours} 小时前` : `${hours}時間前`;
  const days = Math.round(hours / 24);
  if (days < 30) return isZh ? `${days} 天前` : `${days}日前`;
  const months = Math.round(days / 30);
  return isZh ? `${months} 个月前` : `${months}ヶ月前`;
}

export default async function RecentVerifications({ locale, limit = 20 }: { locale: string; limit?: number }) {
  const ta = await getTranslations({ locale, namespace: "auth_badge" });
  const isZh = locale === "zh";

  let rows: Row[] = [];
  try {
    const db = await getDb();
    const { results = [] } = await db
      .prepare(
        `SELECT id, restaurant_id, place_name, status, verdict, region, created_at
         FROM restaurant_verifications
         WHERE place_name IS NOT NULL AND place_name != ''
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(limit)
      .all<Row>();
    rows = results || [];
  } catch (error) {
    console.error("[verify] recent list failed:", error);
    return null;
  }

  if (rows.length === 0) return null;

  const copy = isZh
    ? {
        title: "最近的鉴定记录",
        lead: "所有人提交的鉴定都会出现在这里。已收录的可以直接点进去看详情。",
        accepted: "已收录",
        rejected: "未收录",
      }
    : {
        title: "最近の鑑定履歴",
        lead: "みんなが送信した鑑定結果です。掲載されたお店はそのまま詳細ページへ。",
        accepted: "掲載",
        rejected: "対象外",
      };

  return (
    <section className="mt-14">
      <h2 className="flex items-center gap-2 font-serif text-2xl font-bold text-ink-900">
        <History size={20} className="text-vermilion-700" />
        {copy.title}
      </h2>
      <p className="mt-1 text-sm text-ink-400">{copy.lead}</p>

      <ul className="mt-5 divide-y divide-warm-100 overflow-hidden rounded-xl border border-warm-200 bg-white">
        {rows.map((row) => {
          const accepted = row.status === "accepted";
          const badge = VERDICT_TO_BADGE[row.verdict || "unknown"] || "unknown";
          const name = row.place_name || "";
          const inner = (
            <div className="flex items-center gap-3 px-4 py-3">
              {accepted ? (
                <ShieldCheck size={17} className="shrink-0 text-vermilion-700" />
              ) : (
                <ShieldX size={17} className="shrink-0 text-ink-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink-900">{name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                  <span className={accepted ? "font-semibold text-vermilion-700" : ""}>
                    {accepted ? copy.accepted : copy.rejected}
                  </span>
                  {row.region && <span>{row.region}</span>}
                  <span>{timeAgo(row.created_at, locale)}</span>
                </div>
              </div>
              <span className={`badge-${badge} shrink-0`}>{ta(badge)}</span>
            </div>
          );

          return (
            <li key={row.id}>
              {accepted && row.restaurant_id ? (
                <Link
                  href={`/${locale}/restaurants/${row.restaurant_id}`}
                  className="block transition-colors hover:bg-warm-50"
                >
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
