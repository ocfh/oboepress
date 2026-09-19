"use client";

import dynamic from "next/dynamic";

// 同 CommentsLazy 的边界原理：文章目录真实代码经 client wrapper 懒加载，
// 不进入全站初始 chunk（首页/后台都不下载）；ssr:true 保留文章页首屏目录。
const PostToc = dynamic(() => import("@/components/shared/PostToc"), { ssr: true });

export default function PostTocLazy(props: { selector?: string }) {
  return <PostToc {...props} />;
}
