"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const nav = [
  { href: "/admin", label: "仪表盘", icon: "📊" },
  { href: "/admin/restaurants", label: "餐厅管理", icon: "🍜" },
  { href: "/admin/verifications", label: "鉴定记录", icon: "✓" },
  { href: "/admin/collect", label: "采集工具", icon: "＋" },
  { href: "/", label: "← 返回前台", icon: "" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") {
    return null;
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <nav className="flex items-center gap-1 ml-auto">
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            pathname === item.href
              ? "bg-gray-800 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
        >
          {item.icon && <span>{item.icon}</span>}
          {item.label}
        </Link>
      ))}
      <button
        onClick={logout}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
      >
        退出
      </button>
    </nav>
  );
}
