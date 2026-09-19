"use client";

import dynamic from "next/dynamic";

// 同 CommentsLazy 的边界原理：分享条真实代码经 client wrapper 懒加载，
// 不进入全站初始 chunk（首页/列表页/后台都不下载）；ssr:true 保留文章页
// 首屏分享条 HTML。
const ShareButtons = dynamic(() => import("@/components/shared/ShareButtons"), {
  ssr: true,
});

export default function ShareButtonsLazy(props: { title: string; url: string }) {
  return <ShareButtons {...props} />;
}
