import { KeyRound, UserRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import AccountPasswordForm from "@/components/AccountPasswordForm";
import AccountProfileForm from "@/components/AccountProfileForm";

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
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-4">
            <UserRound size={16} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-100">个人信息</h2>
          </div>
          <div className="px-5 py-5">
            <AccountProfileForm
              initialName={user?.name ?? ""}
              initialEmail={user?.email ?? ""}
            />
            <p className="mt-4 border-t border-zinc-800 pt-4 text-sm text-zinc-400">
              角色
              <span className="ml-2 font-medium text-indigo-400">{user?.role ?? "—"}</span>
            </p>
          </div>
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
