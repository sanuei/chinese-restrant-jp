import AdminNav from "@/components/AdminNav";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-admin-pathname") || "/admin";

  if (pathname !== "/admin/login") {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      redirect(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gray-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center h-14 gap-6">
            <span className="font-bold text-vermilion-400 text-lg tracking-wider">ガチ中華ナビ</span>
            <span className="text-gray-400 text-sm border-l border-gray-700 pl-4">Admin Panel</span>
            <AdminNav />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
