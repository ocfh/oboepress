import { cache } from "react";
import { addAction, HOOKS } from "@/lib/hooks";

/**
 * 公开渲染热路径的进程级短 TTL 缓存（零依赖）。
 *
 * 两层结构：
 * 1. React cache() —— 同一次请求内相同 key 直接合并。generateMetadata
 *    与页面组件各跑一遍路由解析、resolveSitePath 取到文章后主题组件又按
 *    slug 重取一次，这些同请求重复取数在这里只算一次；
 * 2. 进程内 Map + 命名空间版本号 —— 跨请求短 TTL 复用。后台写操作按
 *    命名空间 bump() 立即换版本（旧条目顺手清掉），不必干等 TTL。
 *
 * 使用约定：
 * - 只缓存「已发布内容」的公开读取；后台列表、未发布内容、搜索、随机
 *   排序一律走旁路实时查库（随机被缓存就不再随机了）。
 * - 缓存对象视为不可变，调用方不得原地修改返回的数组/对象。
 * - TTL 只是兜底（外部直改数据库等绕过服务层的情况）；正常内容变更
 *   全部由写路径显式 bump，前台应当即时生效。
 * - incrementViews / likePost 之类计数写不触发失效：浏览量滞后 ≤ TTL
 *   可接受，换热门列表不被每次刷新击穿。
 */

/** 兜底有效期；正常失效不依赖它。 */
const TTL_MS = 60_000;
/** key 段分隔符，取不会出现在正常 slug / JSON 里的控制字符。 */
const SEP = "\u0001";

type Entry = { v: unknown; exp: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const versions = new Map<string, number>();

let ops = 0;

/** 命名空间失效：版本号 +1 并清掉该空间当前版本的全部条目/单飞。 */
export function bump(ns: string): void {
  const old = versions.get(ns) ?? 0;
  versions.set(ns, old + 1);
  const prefix = `${ns}${SEP}${old}${SEP}`;
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  for (const k of inflight.keys()) if (k.startsWith(prefix)) inflight.delete(k);
}

/** 全局失效：固定链接、插件启停这类「一切 URL/列表都可能变」的场景。 */
export function bumpAll(): void {
  store.clear();
  inflight.clear();
  versions.clear();
}

/** 生成带当前版本号的完整键；bump 之后同名 detail 自然落到新键。 */
export function cacheKey(ns: string, detail: string): string {
  return `${ns}${SEP}${versions.get(ns) ?? 0}${SEP}${detail}`;
}

async function ttlGet<T>(fullKey: string, produce: () => Promise<T>): Promise<T> {
  const hit = store.get(fullKey);
  if (hit && hit.exp > Date.now()) return hit.v as T;

  // 缓存击穿保护：同 key 并发请求合并到同一个 Promise。
  let job = inflight.get(fullKey) as Promise<T> | undefined;
  if (!job) {
    job = Promise.resolve().then(produce);
    inflight.set(fullKey, job as Promise<unknown>);
    job.then(
      () => inflight.delete(fullKey),
      () => inflight.delete(fullKey),
    );
  }
  const v = await job;
  // 注：bump 可能发生在 produce 执行期间，那时条目会挂在旧键上成为孤儿，
  // 永不命中也会在下次清扫时回收，正确性不受影响。
  store.set(fullKey, { v, exp: Date.now() + TTL_MS });

  // 每 256 次读顺手清扫过期条目，防止冷门键无限堆积（小站体量下极廉价）。
  if ((++ops & 255) === 0) {
    const now = Date.now();
    for (const [k, e] of store) if (e.exp <= now) store.delete(k);
  }
  return v;
}

/**
 * 公开读取唯一入口：请求级合并（React cache 按首参字符串键记忆）+
 * 跨请求 TTL 复用。务必用 cacheKey() 生成 fullKey 传入。
 */
export const publicCached = cache(
  <T>(fullKey: string, produce: () => Promise<T>): Promise<T> =>
    ttlGet(fullKey, produce),
);

/* -------------------------------------------------------------------------- */
/* 核心内容变更的统一失效订阅                                                   */
/* -------------------------------------------------------------------------- */

// 文章保存/发布：列表、归档聚合、含文章数据的小工具全部可能变化。
addAction(HOOKS.postSaved, () => {
  bump("posts");
  bump("archive");
  bump("widgets");
});
addAction(HOOKS.postPublished, () => {
  bump("posts");
  bump("archive");
  bump("widgets");
});
// 新评论：评论树/评论数变化，且评论数是文章、页面表上的冗余列，
// 最新评论小工具也依赖它，故四个空间一起失效。
addAction(HOOKS.commentCreated, () => {
  bump("comments");
  bump("posts");
  bump("pages");
  bump("widgets");
});
