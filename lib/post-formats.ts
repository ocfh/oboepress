import type { PostFormat } from "@/db/schema";

/**
 * Post formats (WordPress「文章形式」/ Tumblr post types).
 *
 * A format is a *presentation hint*, not a content type: the same blocks are
 * stored either way, but themes can render an `aside` as a bare snippet, a
 * `quote` as a pull-quote card, a `link` as a link card, and so on.
 *
 * `extraFields` declares the per-format inputs the editor shows; the values
 * live in `posts.formatMeta` so no schema change is needed to add a format.
 */

export type PostFormatDef = {
  value: PostFormat;
  label: string;
  /** lucide-react icon name. */
  icon: string;
  description: string;
  /** Whether the theme should hide the title (asides/statuses usually do). */
  hideTitle?: boolean;
  extraFields?: {
    key: string;
    label: string;
    type: "text" | "textarea" | "url" | "image";
    placeholder?: string;
  }[];
};

export const POST_FORMATS: PostFormatDef[] = [
  {
    value: "standard",
    label: "标准",
    icon: "FileText",
    description: "常规文章，标题 + 正文",
  },
  {
    value: "aside",
    label: "日志",
    icon: "StickyNote",
    description: "无标题的短随笔，适合碎片想法",
    hideTitle: true,
  },
  {
    value: "quote",
    label: "引语",
    icon: "Quote",
    description: "以引言为主体，突出显示引文与出处",
    extraFields: [
      { key: "quote", label: "引文", type: "textarea", placeholder: "被引用的话" },
      { key: "cite", label: "出处", type: "text", placeholder: "作者 / 书名" },
    ],
  },
  {
    value: "link",
    label: "链接",
    icon: "Link2",
    description: "分享一个外部链接，标题直接指向目标",
    extraFields: [
      { key: "url", label: "目标链接", type: "url", placeholder: "https://" },
      { key: "source", label: "来源名称", type: "text" },
    ],
  },
  {
    value: "image",
    label: "图片",
    icon: "Image",
    description: "单张大图为主体",
    extraFields: [
      { key: "image", label: "图片", type: "image" },
      { key: "caption", label: "图注", type: "text" },
    ],
  },
  {
    value: "gallery",
    label: "相册",
    icon: "Images",
    description: "多图相册，用短代码 [gallery] 或图片区块排布",
  },
  {
    value: "video",
    label: "视频",
    icon: "Video",
    description: "嵌入视频，正文作为说明",
    extraFields: [
      { key: "url", label: "视频地址", type: "url", placeholder: "https://... 或 /uploads/x.mp4" },
      { key: "poster", label: "封面图", type: "image" },
    ],
  },
  {
    value: "audio",
    label: "音频",
    icon: "Music",
    description: "播客 / 音乐，附带播放器",
    extraFields: [
      { key: "url", label: "音频地址", type: "url" },
      { key: "cover", label: "封面图", type: "image" },
    ],
  },
  {
    value: "status",
    label: "状态",
    icon: "MessageCircle",
    description: "一句话动态，类似微博",
    hideTitle: true,
  },
];

export function getPostFormat(value: string | null | undefined): PostFormatDef {
  return POST_FORMATS.find((f) => f.value === value) ?? POST_FORMATS[0];
}

/** Formats whose title the theme should suppress. */
export function formatHidesTitle(value: string | null | undefined): boolean {
  return !!getPostFormat(value).hideTitle;
}

/** Select options for the editor dropdown. */
export const POST_FORMAT_OPTIONS = POST_FORMATS.map((f) => ({
  value: f.value,
  label: f.label,
}));
