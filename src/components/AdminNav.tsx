"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/admin", label: "仪表盘", icon: "📊" },
  { href: "/admin/restaurants", label: "餐厅管理", icon: "🍜" },
  { href: "/", label: "← 返回前台", icon: "" },
];

export default function AdminNav() {
  const pathname = usePathname();

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
    </nav>
  );
}
