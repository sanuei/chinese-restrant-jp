"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/admin", label: "仪表盘", icon: "📊" },
  { href: "/admin/restaurants", label: "餐厅管理", icon: "🍜" },
  { href: "/", label: "← 返回前台", icon: "" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Admin Navbar */}
      <header className="bg-gray-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center h-14 gap-6">
            <span className="font-bold text-vermilion-400 text-lg tracking-wider">ガチ中華ナビ</span>
            <span className="text-gray-400 text-sm border-l border-gray-700 pl-4">Admin Panel</span>
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
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
