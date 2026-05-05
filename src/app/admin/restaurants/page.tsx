"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

const CUISINES = ["sichuan","cantonese","northern","fujian","hunan","jiangsu","northwest","yunnan","other"];
const AUTHENTICITIES = ["authentic","adapted","japanese","unknown"];
const SORTS = [
  { value: "trusted_rating", label: "可信评分" },
  { value: "raw_rating", label: "Google 评分" },
  { value: "raw_review_count", label: "评论数" },
  { value: "authenticity_score", label: "正宗度" },
  { value: "newest", label: "最近同步" },
  { value: "name_zh", label: "名称" },
];

const CUISINE_LABELS: Record<string, string> = {
  sichuan: "川菜", cantonese: "粤菜", northern: "北方菜", fujian: "闽菜",
  hunan: "湘菜", jiangsu: "苏菜", northwest: "西北菜", yunnan: "云南菜", other: "其他",
};
const AUTH_LABELS: Record<string, string> = {
  authentic: "正宗", adapted: "改良", japanese: "日式", unknown: "未知",
};

interface Restaurant {
  id: string; name_zh: string; name_ja: string; name_original: string;
  address: string; ward: string; city: string;
  cuisine_type: string; authenticity: string; authenticity_score: number;
  raw_rating: number; trusted_rating: number; raw_review_count: number;
  last_synced_at: string; is_active: number;
}

type RowUpdateStatus = {
  state: "updating" | "success" | "error";
  message: string;
};

function AdminRestaurantsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Restaurant[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [rowUpdates, setRowUpdates] = useState<Record<string, RowUpdateStatus>>({});

  const [q, setQ] = useState(searchParams.get("q") || "");
  const [cuisine, setCuisine] = useState(searchParams.get("cuisine") || "");
  const [auth, setAuth] = useState(searchParams.get("authenticity") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "trusted_rating");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1", 10));

  const buildListParams = useCallback(() => {
    const params: Record<string, string> = { sort, page: String(page), pageSize: "20" };
    if (q) params.q = q;
    if (cuisine) params.cuisine = cuisine;
    if (auth) params.authenticity = auth;
    return params;
  }, [auth, cuisine, page, q, sort]);

  const fetchData = useCallback(async (params: Record<string, string>) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`/api/admin/restaurants?${qs}`, {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN}` },
      });
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setData(json.data);
      setPagination(json.pagination);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchData(buildListParams()));
  }, [buildListParams, fetchData]);

  const applyFilters = () => {
    setPage(1);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cuisine) params.set("cuisine", cuisine);
    if (auth) params.set("authenticity", auth);
    if (sort !== "trusted_rating") params.set("sort", sort);
    router.push(`/admin/restaurants?${params.toString()}`);
  };

  const clearFilters = () => {
    setQ(""); setCuisine(""); setAuth(""); setSort("trusted_rating"); setPage(1);
    router.push("/admin/restaurants");
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除 "${name}"？`)) return;
    const res = await fetch(`/api/admin/restaurants/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN}` },
    });
    if (res.ok) { setData(prev => prev.filter(r => r.id !== id)); }
    else { alert("删除失败"); }
  };

  const handleUpdate = async (restaurant: Restaurant) => {
    setRowUpdates((prev) => ({
      ...prev,
      [restaurant.id]: { state: "updating", message: "正在更新 Google 信息、评论和 AI 分析" },
    }));

    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({ place_id: restaurant.id }),
      });
      const text = await res.text();

      if (!res.ok) {
        throw new Error(`${res.status}: ${text.slice(0, 160)}`);
      }

      let reviewsCount = "-";
      try {
        const payload = JSON.parse(text);
        reviewsCount = String(payload.reviews_count ?? "-");
      } catch {
        reviewsCount = "-";
      }

      setRowUpdates((prev) => ({
        ...prev,
        [restaurant.id]: { state: "success", message: `已更新，评论 ${reviewsCount} 条` },
      }));
      await fetchData(buildListParams());
    } catch (error) {
      setRowUpdates((prev) => ({
        ...prev,
        [restaurant.id]: {
          state: "error",
          message: error instanceof Error ? error.message : "更新失败",
        },
      }));
    }
  };

  const pageNumbers = () => {
    const pages: (number | "...")[] = [];
    const { totalPages } = pagination;
    const cur = page;
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (cur > 3) pages.push("...");
      for (let i = Math.max(2, cur - 1); i <= Math.min(totalPages - 1, cur + 1); i++) pages.push(i);
      if (cur < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">餐厅管理</h1>
        <Link href="/admin" className="text-gray-500 hover:text-gray-800 text-sm">← 返回仪表盘</Link>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500 block mb-1">搜索</label>
            <input
              type="text" value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyFilters()}
              placeholder="餐厅名称 / 地址 / 区"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">菜系</label>
            <select value={cuisine} onChange={e => setCuisine(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全部</option>
              {CUISINES.map(c => <option key={c} value={c}>{CUISINE_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">正宗度</label>
            <select value={auth} onChange={e => setAuth(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">全部</option>
              {AUTHENTICITIES.map(a => <option key={a} value={a}>{AUTH_LABELS[a]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">排序</label>
            <select value={sort} onChange={e => setSort(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <button onClick={applyFilters} className="btn-primary min-h-[42px]">筛选</button>
          {(q || cuisine || auth || sort !== "trusted_rating") && (
            <button onClick={clearFilters} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg">清除</button>
          )}
          <div className="ml-auto text-sm text-gray-500 self-center">
            共 {pagination.total} 条
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">加载中...</div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center text-gray-400">没有找到餐厅</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">餐厅</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">菜系</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">正宗度</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">可信评分</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Google</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">评论数</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">同步时间</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => {
                  const updateStatus = rowUpdates[r.id];
                  const updating = updateStatus?.state === "updating";
                  return (
                  <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50 ${
                    updateStatus?.state === "success" ? "bg-green-50/40" :
                    updateStatus?.state === "error" ? "bg-red-50/40" : ""
                  }`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.name_zh || r.name_original}</div>
                      <div className="text-xs text-gray-400">{r.ward || r.city}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded capitalize">{CUISINE_LABELS[r.cuisine_type] || r.cuisine_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${
                          r.authenticity === "authentic" ? "bg-red-500" :
                          r.authenticity === "adapted" ? "bg-yellow-500" :
                          r.authenticity === "japanese" ? "bg-blue-500" : "bg-gray-400"
                        }`} />
                        <span className="text-xs">{AUTH_LABELS[r.authenticity] || r.authenticity}</span>
                        {r.authenticity_score > 0 && (
                          <span className="text-xs text-gray-400 ml-1">({r.authenticity_score})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-green-600">{(r.trusted_rating || 0).toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{(r.raw_rating || 0).toFixed(1)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{r.raw_review_count?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {r.last_synced_at ? new Date(r.last_synced_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleUpdate(r)}
                          disabled={updating || loading}
                          className={`inline-flex min-w-[64px] items-center justify-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                            updateStatus?.state === "success" ? "border-green-200 bg-green-50 text-green-700" :
                            updateStatus?.state === "error" ? "border-red-200 bg-red-50 text-red-700" :
                            "border-warm-200 bg-white text-gray-700 hover:bg-warm-50"
                          }`}
                          title="重新拉取 Google 详情、最新评论和 AI 分析"
                        >
                          {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                            updateStatus?.state === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                            updateStatus?.state === "error" ? <AlertCircle className="h-3.5 w-3.5" /> :
                            <RefreshCw className="h-3.5 w-3.5" />}
                          {updating ? "更新中" : "更新"}
                        </button>
                        <Link href={`/admin/restaurants/${r.id}`} className="text-blue-600 hover:underline text-xs">编辑</Link>
                        <button onClick={() => handleDelete(r.id, r.name_zh || r.name_original)} className="text-red-500 hover:underline text-xs">删除</button>
                      </div>
                      {updateStatus && (
                        <div className={`mt-1 text-xs ${
                          updateStatus.state === "success" ? "text-green-700" :
                          updateStatus.state === "error" ? "text-red-600" :
                          "text-gray-400"
                        }`}>
                          {updateStatus.message}
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">上一页</button>
          {pageNumbers().map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-gray-400">…</span>
            ) : (
              <button key={p} onClick={() => setPage(p as number)}
                className={`px-3 py-1.5 text-sm border rounded-lg ${p === page ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-gray-50"}`}>
                {p}
              </button>
            )
          )}
          <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">下一页</button>
        </div>
      )}
    </div>
  );
}

export default function AdminRestaurantsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-400">加载中...</div>}>
      <AdminRestaurantsContent />
    </Suspense>
  );
}
