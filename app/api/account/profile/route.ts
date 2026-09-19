import { ok, readJson, handleError, authenticate } from "@/lib/http";
import { profileSchema } from "@/lib/validation";
import { changeOwnProfile, getOwnProfile } from "@/lib/services/users";
import { normalizeContactTarget } from "@/lib/services/members";
import { verifyCode } from "@/lib/services/verify-codes";
import { setSessionCookie } from "@/lib/auth";
import { ValidationError } from "@/lib/services/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authenticate();
  if ("res" in auth) return auth.res;
  const body = await readJson(req, profileSchema);
  if ("res" in body) return body.res;
  try {
    const data = body.data;
    const cur = await getOwnProfile(auth.user);

    // 归一化目标联系方式；格式非法时 normalizeContactTarget 直接抛 ValidationError。
    const email = normalizeContactTarget("email", data.email);
    const phone = data.phone?.trim() ? normalizeContactTarget("sms", data.phone) : null;

    // 换绑成新邮箱/新手机时，必须先消费一枚 purpose=bind 的验证码；
    // 未变更或仅解绑手机（phone 由有到空）不要求验证码。
    if (email !== (cur.email ?? "")) {
      if (!data.emailCode) throw new ValidationError("请完成新邮箱的验证码校验");
      await verifyCode({ channel: "email", target: email, purpose: "bind", code: data.emailCode });
    }
    if (phone && phone !== cur.phone) {
      if (!data.phoneCode) throw new ValidationError("请完成新手机号的验证码校验");
      await verifyCode({ channel: "sms", target: phone, purpose: "bind", code: data.phoneCode });
    }

    const user = await changeOwnProfile(auth.user, { name: data.name, email, phone });
    // 昵称/邮箱写进会话 JWT，改完立刻重签 cookie，刷新后即生效。
    await setSessionCookie({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    return ok({ id: user.id, name: user.name, email: user.email, phone: user.phone });
  } catch (e) {
    return handleError(e);
  }
}
