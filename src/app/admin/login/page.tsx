"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, Loader2 } from "lucide-react";

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "登录失败");
      router.push(searchParams.get("next") || "/admin");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center">
      <form onSubmit={submitLogin} className="w-full rounded-xl border border-warm-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-vermilion-50 text-vermilion-700">
            <LockKeyhole size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">管理后台登录</h1>
            <p className="text-sm text-gray-500">请输入管理密码继续。</p>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">密码</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-warm-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-vermilion-500/30"
            autoFocus
          />
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={loading || !password}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          登录
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-400">加载中...</div>}>
      <AdminLoginContent />
    </Suspense>
  );
}
