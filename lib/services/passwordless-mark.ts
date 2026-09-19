import "server-only";
import { getOption, setOption } from "./options";

/**
 * 「无密码账号」标记（options KV，key=oauth.nopassword）。
 *
 * 纯第三方登录建号、以及管理员允许「密码非必填」时直接注册的账号，
 * users.passwordHash 列是 NOT NULL，只能存一个随机未知哈希，并用本标记
 * 表示「该用户从未设置自己的密码」：改密时免旧密码校验、禁止解绑最后
 * 一个第三方账号。
 *
 * 抽成中性模块是为了打破循环依赖：oauth.ts 依赖 members.ts（注册门控），
 * members.ts 又需要写无密码标记，双方都只能引用本模块。
 */

const NOPASSWORD_KEY = "oauth.nopassword";

export async function getPasswordlessSet(): Promise<Set<number>> {
  const arr = await getOption<number[]>(NOPASSWORD_KEY, []);
  return new Set(Array.isArray(arr) ? arr : []);
}

export async function addPasswordlessMark(userId: number): Promise<void> {
  const set = await getPasswordlessSet();
  set.add(userId);
  await setOption(NOPASSWORD_KEY, [...set]);
}

/** 用户主动设置了密码后清除「无密码」标记（供账号密码接口调用）。 */
export async function clearPasswordlessMark(userId: number): Promise<void> {
  const set = await getPasswordlessSet();
  if (set.delete(userId)) await setOption(NOPASSWORD_KEY, [...set]);
}

/** 该用户是否为「尚未设置自己密码」状态（纯第三方登录或免密注册）。 */
export async function isPasswordlessUser(userId: number): Promise<boolean> {
  const set = await getPasswordlessSet();
  return set.has(userId);
}
