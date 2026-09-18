"use client";

import dynamic from "next/dynamic";

// 真正的客户端懒加载边界：在 RSC（文章页）里直接用 next/dynamic 且保留
// SSR 时，Next 仍会把评论客户端模块合入路由共享块，导致首页也下载评论
// 代码。经这个 client wrapper 以 ssr:false 懒加载后，评论主块只在文章/
// 独立页面水合时才下载，首页与列表页完全不承担。评论组件本身挂载后才
// 拉 /api/comments/config 决定渲染内容，SSR 产物本来只有“加载评论中…”
// 占位，关闭 SSR 没有实际损失（loading 占位与原首屏一致）。
const Comments = dynamic(() => import("@/components/shared/Comments"), {
  ssr: false,
  loading: () => <div className="sf-comment-close">加载评论中…</div>,
});

export default function CommentsLazy(props: {
  postId: number;
  postType?: string;
  open: boolean;
  requireNameEmail: boolean;
}) {
  return <Comments {...props} />;
}
