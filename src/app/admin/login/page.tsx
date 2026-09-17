import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { adminGoogleSignIn } from "@/lib/auth-actions";
import { ADMIN_EMAIL, isAdminEmail } from "@/lib/admin-auth";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

function getNextPath(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path?.startsWith("/admin") && !path.startsWith("//") ? path : "/admin";
}

export default async function AdminLoginPage({ searchParams }: Props) {
  const session = await auth();
  const { next } = await searchParams;
  const nextPath = getNextPath(next);

  if (isAdminEmail(session?.user?.email)) redirect(nextPath);

  const signInAction = adminGoogleSignIn.bind(null, nextPath);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center">
      <div className="w-full rounded-xl border border-warm-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">管理后台登录</h1>
          <p className="mt-1 text-sm text-gray-500">使用指定的 Google 管理员账号继续。</p>
        </div>

        {session?.user?.email && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            当前账号 {session.user.email} 没有后台访问权限，请切换账号。
          </p>
        )}

        <form action={signInAction}>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
              <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z" />
              <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z" />
              <path fill="#FBBC05" d="M6.5 14.1a6 6 0 0 1 0-4.2V7.3H3.2a10 10 0 0 0 0 9.4l3.3-2.6Z" />
              <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.2 7.3l3.3 2.6a5.8 5.8 0 0 1 5.5-4Z" />
            </svg>
            使用 Google 登录
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">仅允许 {ADMIN_EMAIL}</p>
      </div>
    </div>
  );
}
