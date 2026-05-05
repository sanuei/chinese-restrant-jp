import { getDb } from "@/lib/cloudflare";
import Link from "next/link";

export const dynamic = "force-dynamic";

type VerificationRow = {
  id: string;
  restaurant_id: string | null;
  place_id: string;
  source_url: string;
  resolved_url: string | null;
  status: string;
  display_eligible: number | null;
  is_kanto: number | null;
  is_chinese: number | null;
  region: string | null;
  verdict: string | null;
  confidence: number | null;
  conclusion_zh: string | null;
  conclusion_ja: string | null;
  evidence_json: string | null;
  created_at: string | null;
  restaurant_name: string | null;
};

type VerificationStats = {
  total: number;
  accepted: number;
  rejected: number;
};

async function ensureVerificationTable() {
  const db = await getDb();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS restaurant_verifications (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT,
      place_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      resolved_url TEXT,
      status TEXT NOT NULL,
      display_eligible INTEGER DEFAULT 0,
      is_kanto INTEGER DEFAULT 0,
      is_chinese INTEGER DEFAULT 0,
      region TEXT,
      verdict TEXT,
      confidence INTEGER DEFAULT 0,
      conclusion_zh TEXT,
      conclusion_ja TEXT,
      evidence_json TEXT,
      raw_ai_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_restaurant_verifications_status ON restaurant_verifications(status)").run();
  return db;
}

function parseReasons(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as { reasons?: unknown };
    return Array.isArray(parsed.reasons) ? parsed.reasons.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" });
}

function statusClass(status: string) {
  if (status === "accepted") return "bg-green-100 text-green-700";
  if (status === "rejected") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
}

async function getVerificationData() {
  const db = await ensureVerificationTable();
  const [totalRow, acceptedRow, rejectedRow, rows] = await Promise.all([
    db.prepare("SELECT COUNT(*) as total FROM restaurant_verifications").first<{ total: number }>(),
    db.prepare("SELECT COUNT(*) as accepted FROM restaurant_verifications WHERE status = 'accepted'").first<{ accepted: number }>(),
    db.prepare("SELECT COUNT(*) as rejected FROM restaurant_verifications WHERE status = 'rejected'").first<{ rejected: number }>(),
    db.prepare(`
      SELECT
        v.id, v.restaurant_id, v.place_id, v.source_url, v.resolved_url, v.status,
        v.display_eligible, v.is_kanto, v.is_chinese, v.region, v.verdict,
        v.confidence, v.conclusion_zh, v.conclusion_ja, v.evidence_json, v.created_at,
        COALESCE(r.name_zh, r.name_original) as restaurant_name
      FROM restaurant_verifications v
      LEFT JOIN restaurants r ON r.id = v.restaurant_id
      ORDER BY v.created_at DESC
      LIMIT 80
    `).all<VerificationRow>(),
  ]);

  return {
    stats: {
      total: totalRow?.total ?? 0,
      accepted: acceptedRow?.accepted ?? 0,
      rejected: rejectedRow?.rejected ?? 0,
    } satisfies VerificationStats,
    rows: rows.results ?? [],
  };
}

export default async function AdminVerificationsPage() {
  const { stats, rows } = await getVerificationData();
  const cards = [
    { label: "全部提交", value: stats.total, className: "bg-gray-50 text-gray-900" },
    { label: "已展示", value: stats.accepted, className: "bg-green-50 text-green-700" },
    { label: "已排除", value: stats.rejected, className: "bg-red-50 text-red-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">鉴定记录</h1>
          <p className="mt-1 text-sm text-gray-500">用户从前台提交的 Google Maps 餐厅鉴定结果</p>
        </div>
        <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-800">← 返回仪表盘</Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-xl p-4 ${card.className}`}>
            <p className="text-3xl font-bold">{card.value}</p>
            <p className="mt-1 text-sm opacity-75">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">暂无用户提交</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">餐厅</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">判断条件</th>
                  <th className="px-4 py-3 font-medium">AI 结论</th>
                  <th className="px-4 py-3 font-medium">提交时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const reasons = parseReasons(row.evidence_json);
                  return (
                    <tr key={row.id} className="border-b border-gray-50 align-top last:border-0">
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900">{row.restaurant_name || row.place_id}</div>
                        <div className="mt-1 max-w-[240px] truncate text-xs text-gray-400">{row.place_id}</div>
                        {row.region && <div className="mt-2 text-xs text-gray-500">{row.region}</div>}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(row.status)}`}>
                          {row.status === "accepted" ? "已展示" : row.status === "rejected" ? "已排除" : "待审核"}
                        </span>
                        <div className="mt-2 text-xs text-gray-500">可信度 {row.confidence ?? 0}%</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full px-2 py-1 text-xs ${row.is_kanto ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                            {row.is_kanto ? "关东" : "非关东"}
                          </span>
                          <span className={`rounded-full px-2 py-1 text-xs ${row.is_chinese ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                            {row.is_chinese ? "中餐" : "非中餐"}
                          </span>
                          <span className={`rounded-full px-2 py-1 text-xs ${row.display_eligible ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                            {row.display_eligible ? "前台显示" : "不显示"}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">{row.verdict || "-"}</div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="max-w-[340px] text-gray-700">{row.conclusion_zh || row.conclusion_ja || "-"}</p>
                        {reasons.length > 0 && (
                          <ul className="mt-2 max-w-[340px] space-y-1 text-xs text-gray-500">
                            {reasons.slice(0, 3).map((reason) => (
                              <li key={reason}>• {reason}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col items-start gap-2">
                          {row.restaurant_id && (
                            <Link href={`/admin/restaurants/${row.restaurant_id}`} className="text-xs text-blue-600 hover:underline">
                              查看餐厅
                            </Link>
                          )}
                          <a href={row.resolved_url || row.source_url} target="_blank" rel="noreferrer" className="text-xs text-gray-500 hover:text-gray-900">
                            Google Maps
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
