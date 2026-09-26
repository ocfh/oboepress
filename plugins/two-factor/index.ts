import { definePlugin } from "@/lib/plugins/api";
import type { AdminMenuItem } from "@/lib/admin-extensions";
import type { SessionUser } from "@/lib/auth";
import { getTwoFaState, verifyTwoFaCode } from "@/lib/services/twofa";

/**
 * 两步验证插件（TOTP，RFC 6238）。
 *
 * 核心登录路由在密码校验通过后触发 auth.challenge：本插件发现该用户存在
 * enabled 的绑定即要求第二因素，核心改发 10 分钟挑战票据；第二步由
 * auth.challenge.verify 裁决，6 位动态码走时间窗校验，恢复码一次性消费。
 * 绑定/解绑/恢复码管理界面在同目录 admin.tsx（挂载于
 * /admin/plugins/two-factor），数据存在 options KV（twofa:user:<id>）。
 */
export default definePlugin({
  setup({ addFilter, HOOKS }) {
    addFilter<{
      user: SessionUser;
      challenge: { type: string } | null;
    }>(HOOKS.authChallenge, async (payload) => {
      if (payload.challenge) return payload;
      const state = await getTwoFaState(payload.user.id);
      if (state?.enabled) return { ...payload, challenge: { type: "totp" } };
      return payload;
    });

    addFilter<{ user: SessionUser; code: string; ok: boolean }>(
      HOOKS.authChallengeVerify,
      async (payload) => {
        if (payload.ok) return payload;
        const passed = await verifyTwoFaCode(payload.user.id, payload.code);
        return passed ? { ...payload, ok: true } : payload;
      },
    );

    addFilter<{ items: AdminMenuItem[] }>(HOOKS.adminMenu, (payload) => {
      payload.items.push({
        href: "/admin/plugins/two-factor",
        label: "两步验证",
        icon: "shield",
      });
      return payload;
    });
  },
});
