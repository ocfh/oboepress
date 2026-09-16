import { KeyRound, UserRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import AccountPasswordForm from "@/components/AccountPasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getSession();
  return (
    <div>
      <div className="flex items-center gap-2">
        <UserRound size={22} className="text-indigo-400" />
        <h1 className="text-2xl font-bold">我的账号</h1>
      </div>
      <div className="mt-6 max-w-md space-y-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-sm text-zinc-400">姓名</p>
          <p className="mt-1 font-medium text-zinc-100">{user?.name ?? "—"}</p>
          <p className="mt-4 text-sm text-zinc-400">邮箱</p>
          <p className="mt-1 font-medium text-zinc-100">{user?.email ?? "—"}</p>
          <p className="mt-4 text-sm text-zinc-400">角色</p>
          <p className="mt-1 font-medium text-indigo-400">{user?.role ?? "—"}</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-4">
            <KeyRound size={16} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-100">登录密码</h2>
          </div>
          <div className="px-5 py-5">
            <AccountPasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}