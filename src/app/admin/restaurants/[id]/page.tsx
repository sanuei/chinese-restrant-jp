"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const CUISINES = ["sichuan","cantonese","northern","fujian","hunan","jiangsu","northwest","yunnan","other"];
const CUISINE_LABELS: Record<string, string> = {
  sichuan: "川菜", cantonese: "粤菜", northern: "北方菜", fujian: "闽菜",
  hunan: "湘菜", jiangsu: "苏菜", northwest: "西北菜", yunnan: "云南菜", other: "其他",
};

interface Review {
  id: string; author_name: string; rating: number; text: string;
  language: string | null;
  published_at: string; credibility_score: number; credibility_action: string;
  credibility_reason: string; source: string; helpful_count: number;
}

interface Restaurant {
  id: string; name_zh: string; name_ja: string; name_original: string;
  address: string; city: string; ward: string; lat: number; lng: number;
  phone: string; website: string; google_maps_url: string;
  price_level: number | null; price_level_source: string | null; value_score: number; cuisine_type: string; cuisine_confidence: number;
  authenticity: string; authenticity_score: number;
  authenticity_reason_zh: string; authenticity_reason_ja: string;
  raw_rating: number; trusted_rating: number; raw_review_count: number;
  trusted_review_count: number;
  ai_summary_zh: string; ai_summary_ja: string;
  opening_hours: string; photos: string;
  is_active: number; last_synced_at: string; created_at: string;
}

type Tab = "info" | "ai" | "reviews" | "delete";

export default function EditRestaurantPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string>("");
  const [tab, setTab] = useState<Tab>("info");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);

  // Form state
  const [form, setForm] = useState({
    name_zh: "", name_ja: "", name_original: "",
    address: "", city: "tokyo", ward: "",
    lat: "", lng: "",
    phone: "", website: "", google_maps_url: "",
    price_level: "", value_score: "", cuisine_type: "other", cuisine_confidence: "0",
    authenticity: "unknown", authenticity_score: "0",
    authenticity_reason_zh: "", authenticity_reason_ja: "",
    raw_rating: "", trusted_rating: "",
    raw_review_count: "", trusted_review_count: "",
    ai_summary_zh: "", ai_summary_ja: "",
    is_active: "1",
  });

  useEffect(() => {
    params.then(p => setId(p.id));
  }, [params]);

  const fetchData = useCallback(async (restaurantId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/restaurants/${restaurantId}`, {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN}` },
      });
      if (!res.ok) { router.push("/admin/restaurants"); return; }
      const json = await res.json();
      const r = json.restaurant;
      setRestaurant(r);
      setReviews(json.reviews || []);

      setForm({
        name_zh: r.name_zh || "", name_ja: r.name_ja || "", name_original: r.name_original || "",
        address: r.address || "", city: r.city || "tokyo", ward: r.ward || "",
        lat: String(r.lat || ""), lng: String(r.lng || ""),
        phone: r.phone || "", website: r.website || "", google_maps_url: r.google_maps_url || "",
        price_level: r.price_level ? String(r.price_level) : "",
        value_score: String(r.value_score || ""),
        cuisine_type: r.cuisine_type || "other",
        cuisine_confidence: String(r.cuisine_confidence || "0"),
        authenticity: r.authenticity || "unknown",
        authenticity_score: String(r.authenticity_score || "0"),
        authenticity_reason_zh: r.authenticity_reason_zh || "",
        authenticity_reason_ja: r.authenticity_reason_ja || "",
        raw_rating: String(r.raw_rating || ""),
        trusted_rating: String(r.trusted_rating || ""),
        raw_review_count: String(r.raw_review_count || ""),
        trusted_review_count: String(r.trusted_review_count || ""),
        ai_summary_zh: r.ai_summary_zh || "",
        ai_summary_ja: r.ai_summary_ja || "",
        is_active: String(r.is_active ?? 1),
      });
    } catch (e) {
      console.error(e);
      router.push("/admin/restaurants");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (id) void Promise.resolve().then(() => fetchData(id));
  }, [id, fetchData]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        name_zh: form.name_zh || null,
        name_ja: form.name_ja || null,
        name_original: form.name_original || null,
        address: form.address || null,
        city: form.city || null,
        ward: form.ward || null,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        phone: form.phone || null,
        website: form.website || null,
        google_maps_url: form.google_maps_url || null,
        price_level: form.price_level ? parseInt(form.price_level) : null,
        value_score: form.value_score ? parseInt(form.value_score) : null,
        cuisine_type: form.cuisine_type || null,
        cuisine_confidence: form.cuisine_confidence ? parseInt(form.cuisine_confidence) : null,
        authenticity: form.authenticity || null,
        authenticity_score: form.authenticity_score ? parseInt(form.authenticity_score) : null,
        authenticity_reason_zh: form.authenticity_reason_zh || null,
        authenticity_reason_ja: form.authenticity_reason_ja || null,
        raw_rating: form.raw_rating ? parseFloat(form.raw_rating) : null,
        trusted_rating: form.trusted_rating ? parseFloat(form.trusted_rating) : null,
        raw_review_count: form.raw_review_count ? parseInt(form.raw_review_count) : null,
        trusted_review_count: form.trusted_review_count ? parseInt(form.trusted_review_count) : null,
        ai_summary_zh: form.ai_summary_zh || null,
        ai_summary_ja: form.ai_summary_ja || null,
        is_active: parseInt(form.is_active),
      };

      const res = await fetch(`/api/admin/restaurants/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "保存成功" });
        fetchData(id);
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: err.error || "保存失败" });
      }
    } catch {
      setMessage({ type: "error", text: "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleReviewAction = async (reviewId: string, action: "keep" | "flag" | "remove") => {
    await fetch(`/api/admin/reviews/${reviewId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ credibility_action: action }),
    });
    setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, credibility_action: action } : r));
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm("确定删除这条评论？")) return;
    await fetch(`/api/admin/reviews/${reviewId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN}` },
    });
    setReviews(prev => prev.filter(r => r.id !== reviewId));
  };

  const handleDelete = async () => {
    if (!confirm("确定删除此餐厅？（软删除，可恢复）")) return;
    const res = await fetch(`/api/admin/restaurants/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN}` },
    });
    if (res.ok) router.push("/admin/restaurants");
  };

  if (loading) {
    return <div className="p-12 text-center text-gray-400">加载中...</div>;
  }

  if (!restaurant) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "info", label: "基本信息" },
    { key: "ai", label: "AI 分析" },
    { key: "reviews", label: `评论 (${reviews.length})` },
    { key: "delete", label: "危险操作" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/restaurants" className="text-gray-500 hover:text-gray-800 text-sm">← 返回列表</Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{restaurant.name_zh || restaurant.name_original}</h1>
          <p className="text-xs text-gray-400">ID: {id}</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? "保存中..." : "💾 保存修改"}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {tab === "info" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-4">
            <Section title="基本信息">
              <Field label="中文名称" id="name_zh">
                <input id="name_zh" value={form.name_zh} onChange={e => setForm(f => ({ ...f, name_zh: e.target.value }))}
                  className="field-input" placeholder="如：楊国福麻辣湯" />
              </Field>
              <Field label="日文名称" id="name_ja">
                <input id="name_ja" value={form.name_ja} onChange={e => setForm(f => ({ ...f, name_ja: e.target.value }))}
                  className="field-input" placeholder="如：養国福マーラータン" />
              </Field>
              <Field label="原始名称" id="name_original">
                <input id="name_original" value={form.name_original} onChange={e => setForm(f => ({ ...f, name_original: e.target.value }))}
                  className="field-input" />
              </Field>
              <Field label="地址" id="address">
                <input id="address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="field-input" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="城市" id="city">
                  <input id="city" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    className="field-input" />
                </Field>
                <Field label="区" id="ward">
                  <input id="ward" value={form.ward} onChange={e => setForm(f => ({ ...f, ward: e.target.value }))}
                    className="field-input" placeholder="例：新宿" />
                </Field>
                <Field label="价格等级" id="price_level">
                  <select id="price_level" value={form.price_level} onChange={e => setForm(f => ({ ...f, price_level: e.target.value }))}
                    className="field-input">
                    <option value="">未确认</option>
                    <option value="1">$ (低价)</option>
                    <option value="2">$$ (中等)</option>
                    <option value="3">$$$ (较高)</option>
                    <option value="4">$$$$ (高价)</option>
                  </select>
                </Field>
                <Field label="性价比分" id="value_score">
                  <input id="value_score" value={form.value_score}
                    onChange={e => setForm(f => ({ ...f, value_score: e.target.value }))}
                    className="field-input" type="number" min="0" max="100" />
                </Field>
              </div>
            </Section>

            <Section title="联系方式">
              <Field label="电话" id="phone">
                <input id="phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="field-input" />
              </Field>
              <Field label="网站" id="website">
                <input id="website" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                  className="field-input" type="url" />
              </Field>
              <Field label="Google Maps URL" id="google_maps_url">
                <input id="google_maps_url" value={form.google_maps_url} onChange={e => setForm(f => ({ ...f, google_maps_url: e.target.value }))}
                  className="field-input" type="url" />
              </Field>
            </Section>

            <Section title="坐标">
              <div className="grid grid-cols-2 gap-3">
                <Field label="纬度" id="lat">
                  <input id="lat" value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                    className="field-input" type="number" step="any" />
                </Field>
                <Field label="经度" id="lng">
                  <input id="lng" value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                    className="field-input" type="number" step="any" />
                </Field>
              </div>
            </Section>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <Section title="菜系与正宗度">
              <div className="grid grid-cols-2 gap-3">
                <Field label="菜系" id="cuisine_type">
                  <select id="cuisine_type" value={form.cuisine_type} onChange={e => setForm(f => ({ ...f, cuisine_type: e.target.value }))}
                    className="field-input">
                    {CUISINES.map(c => <option key={c} value={c}>{CUISINE_LABELS[c]}</option>)}
                  </select>
                </Field>
                <Field label="菜系置信度" id="cuisine_confidence">
                  <input id="cuisine_confidence" value={form.cuisine_confidence}
                    onChange={e => setForm(f => ({ ...f, cuisine_confidence: e.target.value }))}
                    className="field-input" type="number" min="0" max="100" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="正宗度" id="authenticity">
                  <select id="authenticity" value={form.authenticity}
                    onChange={e => setForm(f => ({ ...f, authenticity: e.target.value }))}
                    className="field-input">
                    <option value="authentic">🔴 Authentic（正宗）</option>
                    <option value="adapted">🟡 Adapted（改良）</option>
                    <option value="japanese">🔵 Japanese（日式）</option>
                    <option value="unknown">⚪ Unknown（未知）</option>
                  </select>
                </Field>
                <Field label="正宗度分" id="authenticity_score">
                  <input id="authenticity_score" value={form.authenticity_score}
                    onChange={e => setForm(f => ({ ...f, authenticity_score: e.target.value }))}
                    className="field-input" type="number" min="0" max="100" />
                </Field>
              </div>
            </Section>

            <Section title="评分">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Google 原始评分" id="raw_rating">
                  <input id="raw_rating" value={form.raw_rating}
                    onChange={e => setForm(f => ({ ...f, raw_rating: e.target.value }))}
                    className="field-input" type="number" step="0.1" min="1" max="5" />
                </Field>
                <Field label="可信评分" id="trusted_rating">
                  <input id="trusted_rating" value={form.trusted_rating}
                    onChange={e => setForm(f => ({ ...f, trusted_rating: e.target.value }))}
                    className="field-input font-bold text-green-700" type="number" step="0.01" min="1" max="5" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Google 评论数" id="raw_review_count">
                  <input id="raw_review_count" value={form.raw_review_count}
                    onChange={e => setForm(f => ({ ...f, raw_review_count: e.target.value }))}
                    className="field-input" type="number" />
                </Field>
                <Field label="可信评论数" id="trusted_review_count">
                  <input id="trusted_review_count" value={form.trusted_review_count}
                    onChange={e => setForm(f => ({ ...f, trusted_review_count: e.target.value }))}
                    className="field-input" type="number" />
                </Field>
              </div>
            </Section>

            <Section title="系统">
              <div className="grid grid-cols-2 gap-3">
                <Field label="激活状态" id="is_active">
                  <select id="is_active" value={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.value }))}
                    className="field-input">
                    <option value="1">✅ 激活</option>
                    <option value="0">❌ 已删除</option>
                  </select>
                </Field>
                <Field label="上次同步">
                  <div className="field-input bg-gray-50 text-xs text-gray-500">
                    {restaurant.last_synced_at ? new Date(restaurant.last_synced_at).toLocaleString("zh-CN") : "—"}
                  </div>
                </Field>
              </div>
            </Section>
          </div>
        </div>
      )}

      {/* Tab: AI */}
      {tab === "ai" && (
        <div className="space-y-4">
          <Section title="正宗度判断理由">
            <Field label="中文理由" id="auth_reason_zh">
              <textarea id="auth_reason_zh" value={form.authenticity_reason_zh}
                onChange={e => setForm(f => ({ ...f, authenticity_reason_zh: e.target.value }))}
                className="field-input h-24 resize-none" />
            </Field>
            <Field label="日文理由" id="auth_reason_ja">
              <textarea id="auth_reason_ja" value={form.authenticity_reason_ja}
                onChange={e => setForm(f => ({ ...f, authenticity_reason_ja: e.target.value }))}
                className="field-input h-24 resize-none" />
            </Field>
          </Section>

          <Section title="AI 摘要">
            <Field label="中文摘要" id="ai_summary_zh">
              <textarea id="ai_summary_zh" value={form.ai_summary_zh}
                onChange={e => setForm(f => ({ ...f, ai_summary_zh: e.target.value }))}
                className="field-input h-32 resize-none" />
            </Field>
            <Field label="日文摘要" id="ai_summary_ja">
              <textarea id="ai_summary_ja" value={form.ai_summary_ja}
                onChange={e => setForm(f => ({ ...f, ai_summary_ja: e.target.value }))}
                className="field-input h-32 resize-none" />
            </Field>
          </Section>
        </div>
      )}

      {/* Tab: Reviews */}
      {tab === "reviews" && (
        <div className="space-y-3">
          {reviews.length === 0 && <div className="text-center py-12 text-gray-400">暂无评论</div>}
          {reviews.map(review => (
            <div key={review.id} className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${
              review.credibility_action === "remove" ? "border-red-400 opacity-60" :
              review.credibility_action === "flag" ? "border-yellow-400" : "border-green-400"
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-gray-900">{review.author_name || "匿名用户"}</span>
                    <span className="text-yellow-500 text-sm">{"★".repeat(review.rating)}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      review.credibility_action === "remove" ? "bg-red-100 text-red-700" :
                      review.credibility_action === "flag" ? "bg-yellow-100 text-yellow-700" :
                      "bg-green-100 text-green-700"
                    }`}>
                      {review.credibility_action === "remove" ? "移除" : review.credibility_action === "flag" ? "标记" : "正常"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {review.published_at ? new Date(review.published_at).toLocaleDateString("zh-CN") : ""}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      {review.language || "und"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-3">{review.text}</p>
                  {review.credibility_reason && (
                    <p className="text-xs text-gray-400 mt-1">AI理由: {review.credibility_reason}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => handleReviewAction(review.id, "keep")}
                    className={`text-xs px-2 py-1 rounded border ${review.credibility_action === "keep" ? "bg-green-100 border-green-300 text-green-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    保留
                  </button>
                  <button onClick={() => handleReviewAction(review.id, "flag")}
                    className={`text-xs px-2 py-1 rounded border ${review.credibility_action === "flag" ? "bg-yellow-100 border-yellow-300 text-yellow-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    标记
                  </button>
                  <button onClick={() => handleReviewAction(review.id, "remove")}
                    className={`text-xs px-2 py-1 rounded border ${review.credibility_action === "remove" ? "bg-red-100 border-red-300 text-red-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    移除
                  </button>
                  <button onClick={() => handleDeleteReview(review.id)}
                    className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 mt-1">
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Delete */}
      {tab === "delete" && (
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-lg">
          <h2 className="text-lg font-bold text-red-600 mb-2">⚠️ 危险操作</h2>
          <p className="text-sm text-gray-500 mb-4">
            删除后餐厅将从前台隐藏，但仍保留在数据库中。如需彻底删除请访问数据库管理界面。
          </p>
          <button onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors">
            删除此餐厅
          </button>
        </div>
      )}

      {/* Styles */}
      <style jsx>{`
        .field-input {
          width: 100%; border: 1px solid #e5e7eb; border-radius: 0.5rem;
          padding: 0.5rem 0.75rem; font-size: 0.875rem; color: #111827;
          background: white; transition: border-color 0.15s;
        }
        .field-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
      </div>
      <div className="p-5 space-y-3">
        {children}
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id?: string; children: React.ReactElement }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
