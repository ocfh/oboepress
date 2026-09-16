import type { SettingsSchema } from "@/lib/settings-schema";

/**
 * Widget registry ("小工具" in WordPress, "theme modules").
 *
 * A widget **type** declares its settings schema and how to fetch its data; a
 * widget **instance** (a row in the `widgets` table) binds a type into a
 * theme-declared area with a title, order and per-instance config.
 *
 * Data fetching lives in lib/services/widgets.ts so this module stays free of
 * DB imports and can be shared with the admin (client) bundle.
 */

export interface WidgetTypeDef {
  type: string;
  label: string;
  description: string;
  /** lucide-react icon name for the admin picker. */
  icon: string;
  settings: SettingsSchema;
}

export const WIDGET_TYPES: WidgetTypeDef[] = [
  {
    type: "recent-posts",
    label: "最新文章",
    description: "按发布时间倒序列出最近的文章",
    icon: "FileText",
    settings: [
      {
        key: "main",
        label: "选项",
        fields: [
          { key: "count", label: "显示数量", type: "number", default: 5, min: 1, max: 30, half: true },
          {
            key: "showDate",
            label: "显示日期",
            type: "switch",
            default: true,
            half: true,
          },
          { key: "showThumb", label: "显示缩略图", type: "switch", default: false },
          {
            key: "category",
            label: "限定分类 slug",
            type: "text",
            default: "",
            placeholder: "留空为全部",
          },
        ],
      },
    ],
  },
  {
    type: "popular-posts",
    label: "热门文章",
    description: "按阅读量排序的文章列表",
    icon: "Flame",
    settings: [
      {
        key: "main",
        label: "选项",
        fields: [
          { key: "count", label: "显示数量", type: "number", default: 5, min: 1, max: 30, half: true },
          { key: "showViews", label: "显示阅读量", type: "switch", default: true, half: true },
        ],
      },
    ],
  },
  {
    type: "categories",
    label: "分类目录",
    description: "列出全部分类，可显示文章数",
    icon: "Folder",
    settings: [
      {
        key: "main",
        label: "选项",
        fields: [
          { key: "showCount", label: "显示文章数", type: "switch", default: true, half: true },
          { key: "hideEmpty", label: "隐藏空分类", type: "switch", default: false, half: true },
        ],
      },
    ],
  },
  {
    type: "tag-cloud",
    label: "标签云",
    description: "标签云，字号随文章数变化",
    icon: "Tags",
    settings: [
      {
        key: "main",
        label: "选项",
        fields: [
          { key: "count", label: "最多显示", type: "number", default: 30, min: 5, max: 200, half: true },
          { key: "scale", label: "字号缩放", type: "switch", default: true, half: true },
        ],
      },
    ],
  },
  {
    type: "search",
    label: "搜索框",
    description: "站内搜索输入框",
    icon: "Search",
    settings: [
      {
        key: "main",
        label: "选项",
        fields: [
          { key: "placeholder", label: "占位文案", type: "text", default: "搜索文章…" },
        ],
      },
    ],
  },
  {
    type: "archive",
    label: "文章归档",
    description: "按年月归档的文章数量列表",
    icon: "CalendarDays",
    settings: [
      {
        key: "main",
        label: "选项",
        fields: [
          {
            key: "mode",
            label: "归档粒度",
            type: "select",
            default: "month",
            options: [
              { value: "month", label: "按月" },
              { value: "year", label: "按年" },
            ],
            half: true,
          },
          { key: "showCount", label: "显示数量", type: "switch", default: true, half: true },
          { key: "limit", label: "最多显示", type: "number", default: 12, min: 1, max: 120 },
        ],
      },
    ],
  },
  {
    type: "text",
    label: "文本 / HTML",
    description: "自由文本，支持 HTML 与短代码",
    icon: "Type",
    settings: [
      {
        key: "main",
        label: "内容",
        fields: [
          {
            key: "body",
            label: "内容",
            type: "code",
            default: "",
            help: "支持 HTML 与短代码，例如 [button href=\"/about\"]关于[/button]",
          },
        ],
      },
    ],
  },
  {
    type: "profile",
    label: "个人名片",
    description: "头像 + 简介 + 社交链接",
    icon: "UserCircle",
    settings: [
      {
        key: "main",
        label: "资料",
        fields: [
          { key: "avatar", label: "头像", type: "image", default: "" },
          { key: "name", label: "昵称", type: "text", default: "", half: true },
          { key: "role", label: "一句话身份", type: "text", default: "", half: true },
          { key: "bio", label: "简介", type: "textarea", default: "" },
          { key: "links", label: "社交链接", type: "links", default: [] },
        ],
      },
    ],
  },
  {
    type: "recent-comments",
    label: "最新评论",
    description: "展示最近通过审核的评论",
    icon: "MessageSquare",
    settings: [
      {
        key: "main",
        label: "选项",
        fields: [
          { key: "count", label: "显示数量", type: "number", default: 5, min: 1, max: 20, half: true },
          { key: "excerptLength", label: "摘要长度", type: "number", default: 48, half: true },
        ],
      },
    ],
  },
  {
    type: "links",
    label: "友情链接",
    description: "自定义链接列表",
    icon: "Link2",
    settings: [
      {
        key: "main",
        label: "链接",
        fields: [{ key: "items", label: "链接列表", type: "links", default: [] }],
      },
    ],
  },
  {
    type: "stats",
    label: "站点统计",
    description: "文章 / 分类 / 标签 / 评论 / 总阅读量",
    icon: "BarChart3",
    settings: [
      {
        key: "main",
        label: "选项",
        fields: [
          { key: "showPosts", label: "文章数", type: "switch", default: true, half: true },
          { key: "showComments", label: "评论数", type: "switch", default: true, half: true },
          { key: "showViews", label: "总阅读量", type: "switch", default: true, half: true },
          { key: "showRuntime", label: "运行天数", type: "switch", default: false, half: true },
          {
            key: "since",
            label: "建站日期",
            type: "text",
            default: "",
            placeholder: "2024-01-01",
            showIf: { key: "showRuntime", equals: "true" },
          },
        ],
      },
    ],
  },
];

export function getWidgetType(type: string): WidgetTypeDef | null {
  return WIDGET_TYPES.find((w) => w.type === type) ?? null;
}
