// Next.js 服务启动钩子：进程一启动就补齐数据库迁移。
// 否则只有登录态请求（token 校验路径）才会触发 ensureMigrations，匿名访客
// 打到新版首页时可能直接撞上「列不存在」之类的错误；失败不阻断启动，后续
// 请求路径仍会按既有的 ensureMigrations 逻辑重试。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureMigrations } = await import("@/db");
    await ensureMigrations();
  } catch (err) {
    console.error("[instrumentation] 启动迁移失败，将在请求路径重试：", err);
  }
}
