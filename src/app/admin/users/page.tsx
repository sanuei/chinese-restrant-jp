import { getDb } from "@/lib/cloudflare";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_lang: string | null;
  created_at: string | null;
  favorites_count: number;
};

type UserStats = {
  total: number;
  today: number;
  last7Days: number;
  last30Days: number;
};

async function getUserData() {
  const db = await getDb();

  const [totalRow, todayRow, last7Row, last30Row, rows] = await Promise.all([
    db.prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM users WHERE date(created_at) = date('now')").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-7 days')").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-30 days')").first<{ count: number }>(),
    db.prepare(`
      SELECT
        u.id, u.email, u.display_name, u.avatar_url, u.preferred_lang, u.created_at,
        COUNT(f.id) as favorites_count
      FROM users u
      LEFT JOIN favorites f ON f.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 200
    `).all<UserRow>(),
  ]);

  return {
    stats: {
      total: totalRow?.count ?? 0,
      today: todayRow?.count ?? 0,
      last7Days: last7Row?.count ?? 0,
      last30Days: last30Row?.count ?? 0,
    } satisfies UserStats,
    rows: rows.results ?? [],
  };
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" });
}

export default async function AdminUsersPage() {
  const { stats, rows } = await getUserData();

  const cards = [
    { label: "总用户数", value: stats.total, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "今日新增", value: stats.today, color: "text-green-600", bg: "bg-green-50" },
    { label: "近 7 天新增", value: stats.last7Days, color: "text-yellow-600", bg: "bg-yellow-50" },
    { label: "近 30 天新增", value: stats.last30Days, color: "text-gray-600", bg: "bg-gray-50" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
        <p className="text-gray-500 text-sm mt-1">通过 Google 登录注册的用户，及其收藏情况</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={`${card.bg} rounded-xl p-4`}>
            <p className="text-3xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">暂无注册用户</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">用户</th>
                  <th className="px-4 py-3 font-medium">邮箱</th>
                  <th className="px-4 py-3 font-medium">语言</th>
                  <th className="px-4 py-3 font-medium">收藏数</th>
                  <th className="px-4 py-3 font-medium">注册时间</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 align-middle last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {row.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.avatar_url} alt="" className="h-8 w-8 rounded-full bg-gray-100" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                            {(row.display_name || row.email).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="font-medium text-gray-900">{row.display_name || "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.email}</td>
                    <td className="px-4 py-3 text-gray-500">{row.preferred_lang === "ja" ? "日本語" : "中文"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-vermilion-50 px-2 py-1 text-xs font-medium text-vermilion-700">
                        {row.favorites_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
