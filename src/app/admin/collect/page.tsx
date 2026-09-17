"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  SquareCheckBig,
  XCircle,
} from "lucide-react";

type Candidate = {
  placeId: string;
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
  sources: string[];
  existing?: boolean;
};

type SyncLog = {
  placeId: string;
  name: string;
  ok: boolean;
  message: string;
};

type Restaurant = {
  id: string;
  name_original: string;
};

type SearchProgress = {
  total: number;
  done: number;
  rawCount: number;
  candidateCount: number;
  returnedCount: number;
  current: string;
  errors: string[];
};

type SearchPayload = {
  data?: Candidate[];
  stats?: {
    rawCount?: number;
  };
  errors?: string[];
  error?: string;
};

type CandidateSyncState = "queued" | "syncing" | "synced" | "failed";

type CandidateSyncStatus = {
  state: CandidateSyncState;
  message?: string;
  syncedAt?: string;
};

const SEARCH_CONCURRENCY = 3;

const DEFAULT_AREAS = [
  "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区", "江東区",
  "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区", "杉並区", "豊島区",
  "北区", "荒川区", "板橋区", "練馬区", "足立区", "葛飾区", "江戸川区",
].join(",");

const DEFAULT_KEYWORDS = [
  "湖南料理", "湘菜", "四川料理", "川菜", "重慶火鍋", "麻辣湯", "中国火鍋",
  "中国東北料理", "東北菜", "延辺料理", "新疆料理", "蘭州牛肉麺", "雲南料理",
  "本格中華", "ガチ中華",
].join(",");

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function addCandidates(map: Map<string, Candidate>, incoming: Candidate[]) {
  for (const candidate of incoming) {
    const existing = map.get(candidate.placeId);
    if (existing) {
      for (const source of candidate.sources) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      }
      continue;
    }
    map.set(candidate.placeId, { ...candidate, sources: [...candidate.sources] });
  }
}

function sortCandidates(map: Map<string, Candidate>, maxCount: number): Candidate[] {
  return [...map.values()]
    .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount || a.name.localeCompare(b.name))
    .slice(0, maxCount);
}

function isSelectableCandidate(candidate: Candidate, status?: CandidateSyncStatus): boolean {
  return !candidate.existing && status?.state !== "queued" && status?.state !== "syncing" && status?.state !== "synced";
}

function CandidateStatusBadge({ candidate, status }: { candidate: Candidate; status?: CandidateSyncStatus }) {
  if (status?.state === "syncing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-vermilion-50 px-2 py-1 text-xs font-medium text-vermilion-700">
        <Loader2 className="h-3 w-3 animate-spin" /> 同步中
      </span>
    );
  }
  if (status?.state === "queued") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold-300/30 px-2 py-1 text-xs font-medium text-gold-700">
        <RefreshCw className="h-3 w-3" /> 等待
      </span>
    );
  }
  if (status?.state === "synced") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" /> 已同步
      </span>
    );
  }
  if (candidate.existing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" /> 已入库
      </span>
    );
  }
  if (status?.state === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
        <AlertCircle className="h-3 w-3" /> 失败
      </span>
    );
  }
  return <span className="text-xs text-ink-400">待同步</span>;
}

export default function AdminCollectPage() {
  const [areas, setAreas] = useState(DEFAULT_AREAS);
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [minRating, setMinRating] = useState("4.0");
  const [minReviews, setMinReviews] = useState("50");
  const [limit, setLimit] = useState("80");

  const [requireTokyo, setRequireTokyo] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(null);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, CandidateSyncStatus>>({});
  const searchAbortRef = useRef<AbortController | null>(null);

  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selected.has(candidate.placeId)),
    [candidates, selected],
  );
  const selectableCandidates = useMemo(
    () => candidates.filter((candidate) => isSelectableCandidate(candidate, syncStatuses[candidate.placeId])),
    [candidates, syncStatuses],
  );
  const syncableSelectedCandidates = useMemo(
    () => selectedCandidates.filter((candidate) => isSelectableCandidate(candidate, syncStatuses[candidate.placeId])),
    [selectedCandidates, syncStatuses],
  );
  const failedCandidates = useMemo(
    () => candidates.filter((candidate) => syncStatuses[candidate.placeId]?.state === "failed"),
    [candidates, syncStatuses],
  );
  const syncedVisibleCount = useMemo(
    () => candidates.filter((candidate) => candidate.existing || syncStatuses[candidate.placeId]?.state === "synced").length,
    [candidates, syncStatuses],
  );
  const allSelectableSelected = selectableCandidates.length > 0 && selectableCandidates.every((candidate) => selected.has(candidate.placeId));
  const progressPercent = searchProgress
    ? Math.round((searchProgress.done / Math.max(1, searchProgress.total)) * 100)
    : 0;

  async function searchCandidates() {
    const areaList = splitList(areas);
    const keywordList = splitList(keywords);
    const tasks = areaList.flatMap((area) => keywordList.map((keyword) => ({ area, keyword })));
    const maxCandidates = Math.max(1, Math.min(300, Number(limit) || 80));
    const autoSelectCount = 10; // 搜索完成后默认自动选中前10个

    if (tasks.length === 0) {
      setStatus("请先输入区域和关键词");
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    const candidateMap = new Map<string, Candidate>();
    const errors: string[] = [];
    let rawCount = 0;
    let done = 0;
    let cursor = 0;

    setLoading(true);
    setStatus(`搜索中 0/${tasks.length}`);
    setLogs([]);
    setCandidates([]);
    setSelected(new Set());
    setSearchProgress({
      total: tasks.length,
      done: 0,
      rawCount: 0,
      candidateCount: 0,
      returnedCount: 0,
      current: "准备开始",
      errors: [],
    });

    const searchOne = async (area: string, keyword: string): Promise<SearchPayload> => {
      const response = await fetch("/api/admin/collect/search", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          areas: [area],
          keywords: [keyword],
          minRating: Number(minRating),
          minReviews: Number(minReviews),
          requireTokyo,
          limit: 300,
        }),
      });
      const payload = (await response.json()) as SearchPayload;
      if (!response.ok) throw new Error(payload.error || "搜索失败");
      return payload;
    };

    const worker = async () => {
      while (cursor < tasks.length && !controller.signal.aborted) {
        const task = tasks[cursor];
        cursor += 1;
        const current = `${task.area} / ${task.keyword}`;
        setSearchProgress((prev) => prev ? { ...prev, current } : prev);
        try {
          const payload = await searchOne(task.area, task.keyword);
          rawCount += payload.stats?.rawCount || 0;
          addCandidates(candidateMap, payload.data || []);
          if (payload.errors?.length) errors.push(...payload.errors);
        } catch (error) {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : "搜索失败";
          errors.push(`${current}: ${message}`);
        }

        done += 1;
        const nextCandidates = sortCandidates(candidateMap, maxCandidates);
        setCandidates(nextCandidates);
        const autoSelected = nextCandidates
          .filter((candidate) => isSelectableCandidate(candidate, syncStatuses[candidate.placeId]))
          .slice(0, autoSelectCount)
          .map((candidate) => candidate.placeId);
        setSelected(new Set(autoSelected));
        setSearchProgress({
          total: tasks.length,
          done,
          rawCount,
          candidateCount: candidateMap.size,
          returnedCount: nextCandidates.length,
          current,
          errors: [...errors],
        });
        setStatus(`搜索中 ${done}/${tasks.length}，候选 ${candidateMap.size} 家`);
      }
    };

    try {
      const workerCount = Math.min(SEARCH_CONCURRENCY, tasks.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      if (controller.signal.aborted) {
        setStatus(`已停止：完成 ${done}/${tasks.length}，候选 ${candidateMap.size} 家`);
      } else {
        setStatus(`搜索完成：候选 ${candidateMap.size} 家，显示 ${Math.min(candidateMap.size, maxCandidates)} 家`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "搜索失败");
    } finally {
      searchAbortRef.current = null;
      setLoading(false);
    }
  }

  function stopSearch() {
    searchAbortRef.current?.abort();
    setStatus("正在停止搜索...");
  }

  async function syncPlace(placeId: string, name: string): Promise<SyncLog> {
    const response = await fetch("/api/admin/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ place_id: placeId }),
    });
    const text = await response.text();
    if (!response.ok) {
      return { placeId, name, ok: false, message: `${response.status}: ${text.slice(0, 180)}` };
    }
    try {
      const payload = JSON.parse(text);
      return {
        placeId,
        name,
        ok: true,
        message: `${payload.restaurant || name} / reviews=${payload.reviews_count ?? "-"}`,
      };
    } catch {
      return { placeId, name, ok: true, message: "同步完成" };
    }
  }

  async function syncSelected() {
    const queue = syncableSelectedCandidates; // 同步所有选中项，不限数量
    if (queue.length === 0) {
      setStatus("没有可同步的选中候选");
      return;
    }
    setRunning(true);
    setLogs([]);
    setStatus(`开始同步 ${queue.length} 家...`);
    setSyncStatuses((prev) => {
      const next = { ...prev };
      for (const candidate of queue) {
        next[candidate.placeId] = { state: "queued", message: "等待同步" };
      }
      return next;
    });
    try {
      const nextLogs: SyncLog[] = [];
      for (let index = 0; index < queue.length; index++) {
        const candidate = queue[index];
        setStatus(`[${index + 1}/${queue.length}] ${candidate.name}`);
        setSyncStatuses((prev) => ({
          ...prev,
          [candidate.placeId]: { state: "syncing", message: "正在同步 Google 详情、评论和 AI 分析" },
        }));
        let log: SyncLog;
        try {
          log = await syncPlace(candidate.placeId, candidate.name);
        } catch (error) {
          log = {
            placeId: candidate.placeId,
            name: candidate.name,
            ok: false,
            message: error instanceof Error ? error.message : "同步失败",
          };
        }
        nextLogs.push(log);
        setLogs([...nextLogs]);
        setSyncStatuses((prev) => ({
          ...prev,
          [candidate.placeId]: {
            state: log.ok ? "synced" : "failed",
            message: log.message,
            syncedAt: log.ok ? new Date().toISOString() : undefined,
          },
        }));
        if (log.ok) {
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(candidate.placeId);
            return next;
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      setStatus(`同步完成：成功 ${nextLogs.filter((log) => log.ok).length}/${nextLogs.length}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "同步失败");
    } finally {
      setRunning(false);
    }
  }

  async function refreshExisting() {
    const count = 10;
    setRunning(true);
    setLogs([]);
    setStatus("读取已有餐厅...");
    try {
      const response = await fetch(`/api/admin/restaurants?pageSize=100&sort=newest`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "读取已有餐厅失败");
      const restaurants = (payload.data || []).slice(0, count) as Restaurant[];
      const nextLogs: SyncLog[] = [];
      for (let index = 0; index < restaurants.length; index++) {
        const restaurant = restaurants[index];
        const name = restaurant.name_original || restaurant.id;
        setStatus(`[${index + 1}/${restaurants.length}] 刷新 ${name}`);
        const log = await syncPlace(restaurant.id, name);
        nextLogs.push(log);
        setLogs([...nextLogs]);
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      setStatus(`刷新完成：成功 ${nextLogs.filter((log) => log.ok).length}/${nextLogs.length}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setRunning(false);
    }
  }

  function toggleCandidate(placeId: string) {
    const candidate = candidates.find((item) => item.placeId === placeId);
    if (!candidate || !isSelectableCandidate(candidate, syncStatuses[placeId])) return;
    const next = new Set(selected);
    if (next.has(placeId)) next.delete(placeId);
    else next.add(placeId);
    setSelected(next);
  }

  function selectTopCandidates() {
    const count = 10; // 选前10个
    setSelected(new Set(selectableCandidates.slice(0, count).map((candidate) => candidate.placeId)));
  }

  function selectAllVisible() {
    setSelected(new Set(selectableCandidates.map((candidate) => candidate.placeId)));
  }

  function toggleAllVisible() {
    if (allSelectableSelected) {
      setSelected(new Set());
      return;
    }
    selectAllVisible();
  }

  function selectFailedCandidates() {
    setSelected(new Set(failedCandidates.map((candidate) => candidate.placeId)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">采集工具</h1>
          <p className="text-sm text-gray-500 mt-1">搜索候选、批量选择、同步状态会直接标在列表里。</p>
        </div>
        <div className="rounded-full bg-white px-3 py-1 text-sm text-gray-500 shadow-sm">{status}</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-warm-200 p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-gray-500 block mb-1">区域</span>
            <textarea value={areas} onChange={(event) => setAreas(event.target.value)} rows={3}
              className="w-full border border-warm-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-500/30" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 block mb-1">关键词</span>
            <textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} rows={3}
              className="w-full border border-warm-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vermilion-500/30" />
          </label>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <label>
            <span className="text-xs text-gray-500 block mb-1">最低评分</span>
            <input value={minRating} onChange={(event) => setMinRating(event.target.value)}
              className="w-24 border border-warm-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label>
            <span className="text-xs text-gray-500 block mb-1">最低评论数</span>
            <input value={minReviews} onChange={(event) => setMinReviews(event.target.value)}
              className="w-28 border border-warm-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label>
            <span className="text-xs text-gray-500 block mb-1">候选显示</span>
            <input value={limit} onChange={(event) => setLimit(event.target.value)}
              className="w-24 border border-warm-200 rounded-lg px-3 py-2 text-sm" />
          </label>

          <label className="flex items-center gap-2 h-[38px] text-sm text-gray-700">
            <input type="checkbox" checked={requireTokyo} onChange={(event) => setRequireTokyo(event.target.checked)} />
            只要東京都地址
          </label>
          <button onClick={searchCandidates} disabled={loading || running} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? "搜索中" : "搜索候选"}
          </button>
          {loading && (
            <button onClick={stopSearch} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-warm-200 text-sm font-medium text-gray-700 hover:bg-warm-50">
              <XCircle className="h-4 w-4" />
              停止搜索
            </button>
          )}
          <button onClick={syncSelected} disabled={loading || running || syncableSelectedCandidates.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            同步选中 ({syncableSelectedCandidates.length})
          </button>
          <button onClick={refreshExisting} disabled={loading || running}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-warm-200 text-sm font-medium text-gray-700 hover:bg-warm-50 disabled:opacity-50">
            <RotateCcw className="h-4 w-4" />
            刷新已有
          </button>
        </div>
      </div>

      {searchProgress && (
        <div className="bg-white rounded-xl shadow-sm border border-warm-200 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-gray-900">搜索进度</h2>
              <p className="text-sm text-gray-500 mt-1">{searchProgress.current}</p>
            </div>
            <div className="text-sm font-medium text-gray-700">
              {searchProgress.done} / {searchProgress.total} · {progressPercent}%
            </div>
          </div>
          <div className="h-2.5 bg-warm-100 rounded-full overflow-hidden">
            <div className="h-full bg-vermilion-700 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg bg-warm-50 px-3 py-2">
              <div className="text-gray-400 text-xs">Google 原始结果</div>
              <div className="font-semibold text-gray-900">{searchProgress.rawCount}</div>
            </div>
            <div className="rounded-lg bg-warm-50 px-3 py-2">
              <div className="text-gray-400 text-xs">去重后候选</div>
              <div className="font-semibold text-gray-900">{searchProgress.candidateCount}</div>
            </div>
            <div className="rounded-lg bg-warm-50 px-3 py-2">
              <div className="text-gray-400 text-xs">当前显示</div>
              <div className="font-semibold text-gray-900">{searchProgress.returnedCount}</div>
            </div>
            <div className="rounded-lg bg-warm-50 px-3 py-2">
              <div className="text-gray-400 text-xs">错误</div>
              <div className="font-semibold text-gray-900">{searchProgress.errors.length}</div>
            </div>
          </div>
          {searchProgress.errors.length > 0 && (
            <div className="text-xs text-red-600 space-y-1">
              {searchProgress.errors.slice(-3).map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-warm-200 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warm-200 bg-warm-50 px-4 py-3 text-sm">
            <div className="text-gray-600">
              已选 <span className="font-semibold text-ink-900">{syncableSelectedCandidates.length}</span>
              <span className="mx-2 text-gray-300">/</span>
              可同步 {selectableCandidates.length}
              <span className="mx-2 text-gray-300">·</span>
              已入库/已同步 {syncedVisibleCount}
              {failedCandidates.length > 0 && (
                <>
                  <span className="mx-2 text-gray-300">·</span>
                  <span className="text-red-600">失败 {failedCandidates.length}</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={selectTopCandidates} disabled={loading || running || selectableCandidates.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-warm-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-warm-100 disabled:opacity-50">
                <SquareCheckBig className="h-3.5 w-3.5" /> 选前10
              </button>
              <button onClick={selectAllVisible} disabled={loading || running || selectableCandidates.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-warm-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-warm-100 disabled:opacity-50">
                <SquareCheckBig className="h-3.5 w-3.5" /> 全选当前
              </button>
              <button onClick={selectFailedCandidates} disabled={loading || running || failedCandidates.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-warm-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-warm-100 disabled:opacity-50">
                <AlertCircle className="h-3.5 w-3.5" /> 只选失败
              </button>
              <button onClick={clearSelection} disabled={loading || running || selected.size === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-warm-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-warm-100 disabled:opacity-50">
                <Square className="h-3.5 w-3.5" /> 清空
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-warm-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allSelectableSelected}
                      disabled={loading || running || selectableCandidates.length === 0}
                      onChange={toggleAllVisible}
                      aria-label="选择所有可同步候选"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">餐厅</th>
                  <th className="px-4 py-3 text-left">状态</th>
                  <th className="px-4 py-3 text-right">评分</th>
                  <th className="px-4 py-3 text-right">评论</th>
                  <th className="px-4 py-3 text-left">来源</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => {
                  const candidateStatus = syncStatuses[candidate.placeId];
                  const selectable = isSelectableCandidate(candidate, candidateStatus);
                  return (
                    <tr key={candidate.placeId} className={`border-b border-warm-100 transition-colors hover:bg-warm-50 ${
                      candidate.existing || candidateStatus?.state === "synced" ? "bg-green-50/40" :
                      candidateStatus?.state === "failed" ? "bg-red-50/40" : ""
                    }`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(candidate.placeId)}
                          disabled={loading || running || !selectable}
                          onChange={() => toggleCandidate(candidate.placeId)}
                          aria-label={`选择 ${candidate.name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{candidate.name}</div>
                        <div className="text-xs text-gray-400">{candidate.address}</div>
                        {candidateStatus?.message && (
                          <div className={`mt-1 text-xs ${candidateStatus.state === "failed" ? "text-red-600" : "text-gray-400"}`}>
                            {candidateStatus.message}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <CandidateStatusBadge candidate={candidate} status={candidateStatus} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600">{candidate.rating.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{candidate.reviewCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-sm">{candidate.sources.slice(0, 4).join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-gray-900 mb-3">运行记录</h2>
          <div className="space-y-2 text-sm">
            {logs.map((log) => (
              <div key={`${log.placeId}-${log.message}`} className={log.ok ? "text-green-700" : "text-red-600"}>
                {log.ok ? "成功" : "失败"} · {log.name} · {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
