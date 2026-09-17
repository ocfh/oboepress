import { getLucideIcon } from "@/lib/lucide-icon";

/**
 * 主题无关的服务端 Lucide 图标渲染器：按 kebab-case 名称查找全量 lucide 图标，
 * 仅供 Server Component 使用（切勿在客户端组件中 import，否则会把整套图标
 * 打进客户端包）。bluemix 有自己的 CatIcon（带 1.35 倍缩放），这里用原始尺寸，
 * 供默认主题与共享页面渲染菜单/分类自定义图标。
 */
export default function ServerIcon({
  name,
  size = 16,
  className,
  marginRight,
  marginLeft,
}: {
  name: string | null | undefined;
  size?: number;
  className?: string;
  marginRight?: number | string;
  marginLeft?: number | string;
}) {
  const Comp = getLucideIcon(name);
  if (!Comp) return null;
  return (
    <Comp
      className={className}
      size={size}
      style={{
        display: "inline-block",
        verticalAlign: "-0.125em",
        flexShrink: 0,
        marginRight,
        marginLeft,
      }}
    />
  );
}
