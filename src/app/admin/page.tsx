import { getDb } from "@/lib/cloudflare";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getStats() {
  const db = await getDb();

  const [
    totalRow, authenticRow, adaptedRow, japaneseRow, unknownRow,
    avgRatingRow, recentRow, reviewStatsRow,
  ] = await Promise.all([
    db.prepare("SELECT COUNT(*) as count FROM restaurants WHERE is_active = 1").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM restaurants WHERE is_active = 1 AND authenticity = 'authentic'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM restaurants WHERE is_active = 1 AND authenticity = 'adapted'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM restaurants WHERE is_active = 1 AND authenticity = 'japanese'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM restaurants WHERE is_active = 1 AND authenticity = 'unknown'").first<{ count: number }>(),
    db.prepare("SELECT AVG(trusted_rating) as avg FROM restaurants WHERE is_active = 1 AND trusted_rating > 0").first<{ avg: number }>(),
    db.prepare("SELECT * FROM restaurants WHERE is_active = 1 ORDER BY last_synced_at DESC LIMIT 5").all<Record<string, unknown>>(),
    db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN credibility_action = 'remove' THEN 1 ELSE 0 END) as removed, SUM(CASE WHEN credibility_action = 'flag' THEN 1 ELSE 0 END) as flagged FROM reviews").first<{ total: number; removed: number; flagged: number }>(),
  ]);

  const cuisineResult = await db.prepare(
    "SELECT cuisine_type, COUNT(*) as count FROM restaurants WHERE is_active = 1 GROUP BY cuisine_type ORDER BY count DESC"
  ).all<{ cuisine_type: string; count: number }>();
  const cuisineRows = cuisineResult.results ?? [];

  return {
    total: totalRow?.count ?? 0,
    authentic: authenticRow?.count ?? 0,
    adapted: adaptedRow?.count ?? 0,
    japanese: japaneseRow?.count ?? 0,
    unknown: unknownRow?.count ?? 0,
    avgRating: avgRatingRow?.avg ?? 0,
    recent: (recentRow as any)?.results ?? ([] as any),
    cuisineStats: cuisineRows ?? [],
    reviewStats: reviewStatsRow ?? { total: 0, removed: 0, flagged: 0 },
  };
}

export default async function AdminDashboard() {
  const stats = await getStats();

  const cards = [
    { label: "总餐厅数", value: stats.total, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "正宗中华", value: stats.authentic, color: "text-red-600", bg: "bg-red-50" },
    { label: "改良中华", value: stats.adapted, color: "text-yellow-600", bg: "bg-yellow-50" },
    { label: "日式中华", value: stats.japanese, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "未知分类", value: stats.unknown, color: "text-gray-600", bg: "bg-gray-50" },
    { label: "平均可信评分", value: stats.avgRating > 0 ? stats.avgRating.toFixed(2) : "—", color: "text-green-600", bg: "bg-green-50" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">管理后台</h1>
          <p className="text-gray-500 text-sm mt-1">ガチ中華ナビ 数据管理面板</p>
        </div>
        <Link href="/admin/restaurants" className="btn-primary">
          🍜 餐厅列表
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={`${card.bg} rounded-xl p-4`}>
            <p className="text-3xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">最近同步</h2>
          {stats.recent.length === 0 ? (
            <p className="text-gray-400 text-sm">暂无数据</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-3">餐厅名</th>
                  <th className="pb-3">评分</th>
                  <th className="pb-3">正宗度</th>
                  <th className="pb-3">同步时间</th>
                  <th className="pb-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 font-medium text-gray-900">{r.name_zh || r.name_original}</td>
                    <td className="py-3">
                      <span className="font-bold text-green-600">{(r.trusted_rating || 0).toFixed(2)}</span>
                      <span className="text-gray-400 text-xs ml-1">(Google {(r.raw_rating || 0).toFixed(1)})</span>
                    </td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        r.authenticity === "authentic" ? "bg-red-100 text-red-700" :
                        r.authenticity === "adapted" ? "bg-yellow-100 text-yellow-700" :
                        r.authenticity === "japanese" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>{r.authenticity}</span>
                    </td>
                    <td className="py-3 text-gray-400">{r.last_synced_at ? new Date(r.last_synced_at).toLocaleString("zh-CN") : "—"}</td>
                    <td className="py-3">
                      <Link href={`/admin/restaurants/${r.id}`} className="text-blue-600 hover:underline text-xs">
                        编辑
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Authenticity Distribution */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">正宗度分布</h2>
            <div className="space-y-3">
              {[
                { label: "🔴 正宗中华", count: stats.authentic, color: "bg-red-500" },
                { label: "🟡 改良中华", count: stats.adapted, color: "bg-yellow-500" },
                { label: "🔵 日式中华", count: stats.japanese, color: "bg-blue-500" },
                { label: "⚪ 未知", count: stats.unknown, color: "bg-gray-400" },
              ].map((item) => {
                const pct = stats.total > 0 ? (item.count / stats.total * 100) : 0;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{item.label}</span>
                      <span className="text-gray-500">{item.count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cuisine Distribution */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">菜系分布</h2>
            <div className="space-y-2">
              {stats.cuisineStats.map((c: any) => (
                <div key={c.cuisine_type} className="flex justify-between items-center text-sm">
                  <span className="text-gray-700 capitalize">{c.cuisine_type}</span>
                  <span className="text-gray-500">{c.count}</span>
                </div>
              ))}
              {stats.cuisineStats.length === 0 && <p className="text-gray-400 text-xs">暂无数据</p>}
            </div>
          </div>

          {/* Review Stats */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">评论状态</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">总评论数</span><span className="font-medium">{stats.reviewStats.total.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">已移除</span><span className="text-red-500">{stats.reviewStats.removed.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">标记待审</span><span className="text-yellow-500">{stats.reviewStats.flagged.toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
