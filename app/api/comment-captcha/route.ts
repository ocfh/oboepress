import { ok } from "@/lib/http";
import { createCommentCaptcha } from "@/lib/services/comment-captcha";

export const runtime = "nodejs";
// 每题一次性、答案密封在令牌里，任何缓存都会破坏语义，强制不缓存。
export const dynamic = "force-dynamic";

/** 签发一道评论算术图形验证码：{ token, svg }，无登录要求。 */
export async function GET() {
  const res = ok(createCommentCaptcha());
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
