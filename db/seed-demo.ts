/**
 * Demo content seed for the Bluemix theme.
 *
 * Creates a demo author, 4 categories, a handful of tags and ~10 published
 * posts with cover images so the homepage, coverflow hero and sidebar widgets
 * actually have something to render at first boot.
 *
 * Safe to re-run: skips anything already present. Run from the project root:
 *   npm run db:seed-demo
 *
 * NOTE: this opens the same pglite directory the dev server uses, so the dev
 * server must be stopped while it runs (a second PGlite on one dir aborts).
 */
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, ensureMigrations } from "@/db";
import {
  users,
  categories,
  tags,
  posts,
  postTags,
  postCategories,
  siteSettings,
} from "@/db/schema";
import { ensureBootstrap } from "@/lib/services/bootstrap";
import type { Block } from "@/lib/blocks";

const PASSWORD = "demo123456";

// Guaranteed local admin: always upserted to these same credentials on every
// re-run, so local testing always has a definite account/password to use.
// (db:seed demo — dev only; the /admin/setup wizard still creates fresh
// accounts in production-style first runs.)
const ADMIN_EMAIL = "admin@cms.local";
const ADMIN_PASSWORD = "admin123";

const CATEGORIES = [
  { name: "设计与灵感", slug: "design" },
  { name: "生活随笔", slug: "life" },
  { name: "技术手记", slug: "tech" },
  { name: "旅行日志", slug: "travel" },
];

const TAGS = ["玻璃拟物", "Next.js", "主题开发", "摄影", "极简", "开源", "日记"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function cover(n: number): string {
  return `https://picsum.photos/seed/Bluemix${n}/900/640`;
}

function excerptOf(paras: string[]): string {
  return (paras[0] || "").slice(0, 90);
}

function makeContent(lead: string, paras: string[]): Block[] {
  const list: Block[] = [];
  list.push({ id: nanoid(), type: "paragraph", text: lead });
  for (const p of paras) list.push({ id: nanoid(), type: "paragraph", text: p });
  list.push({ id: nanoid(), type: "heading", level: 2, text: "小结" });
  list.push({
    id: nanoid(),
    type: "paragraph",
    text: "感谢阅读。更多内容请浏览站内其他文章。",
  });
  return list;
}

// title uses " · " so the theme splits it into a two-line card title (type 2)
const POSTS: Array<{
  title: string;
  cat: string;
  tags: string[];
  paras: string[];
  views: number;
}> = [
  {
    title: "复盘「Bluemix」玻璃拟物主题 · Design",
    cat: "design",
    tags: ["玻璃拟物", "主题开发"],
    paras: [
      "Glassmorphism——玻璃拟物——是近年最受欢迎的界面趋势之一。半透明、背景模糊、细描边加上高光层的组合，让卡片像悬浮在彩色背景上的毛玻璃。",
      "这套 Bluemix 主题正是这种语言的代表作：浅蓝灰画布上叠加白色半透明卡片，配合封面大图与封面覆盖层，整体通透又有层次。",
      "Bluemix 精心对齐了视觉变量、卡片色调计算与布局结构，让整体观感通透而统一。",
    ],
    views: 1280,
  },
  {
    title: "用 Next.js 构建无头 CMS · Dev",
    cat: "tech",
    tags: ["Next.js", "主题开发", "开源"],
    paras: [
      "OboePress 是一个 Serverless 友好的内容管理系统，核心基于 Next.js、Drizzle 与 PostgreSQL，同时内置 pglite 让本地零配置即可运行。",
      "主题采用注册表机制，业务代码与 UI 解耦。切换主题只需修改 activeThemeSlug，前端布局组件随之替换。",
      "这让博客的主题化开发变得非常顺滑——在 OboePress 的注册表机制下，主题与业务代码完全解耦，切换主题只需一行配置。",
    ],
    views: 956,
  },
  {
    title: "晨间的光 · Life",
    cat: "life",
    tags: ["摄影", "日记"],
    paras: [
      "清晨六点半的阳台，光线从窗帘缝隙漏进来，在木质桌面上拉出一道柔和的轨迹。猫安静地蜷在窗台。",
      "有时候生活的质感就藏在这些细小而确定的瞬间里。没有宏大的叙事，只有白瓷杯里冒着热气的拿铁。",
      "记录它们，是为了在忙碌的日常里，依然记得自己为什么而活。",
    ],
    views: 412,
  },
  {
    title: "京都三日漫游 · Travel",
    cat: "travel",
    tags: ["旅行", "摄影"],
    paras: [
      "从哲学之道到伏见稻荷，京都总能用一种不费力的方式让时间慢下来。石板路、木质町屋与远处的东山。",
      "许多地方是需要步行才能抵达的，沿途的小神社与茶屋都值得停留。在鸭川边坐着看日落，是这次旅程最好的收尾。",
      "旅行未必需要太多计划，把节奏放慢，惊喜自然会来。",
    ],
    views: 2301,
  },
  {
    title: "封面大图与卡片色调 · Design",
    cat: "design",
    tags: ["玻璃拟物", "主题开发"],
    paras: [
      "为什么这套主题的卡片调和得这么舒服？关键在于每个卡片的颜色并非写死的，而是从封面图的主色调动态推导。",
      "主题运行时会把图片解压为像素，采样主色，通过 HSL 映射生成 --default、--bg、--control-color 等变量。",
      "在服务端渲染的移植版里，我们采用基于文章 slug 的稳定配色来模拟这一行为，让同文同色、重载不变。",
    ],
    views: 765,
  },
  {
    title: "关于容器布局的取舍 · Dev",
    cat: "tech",
    tags: ["Next.js"],
    paras: [
      "响应式布局首要考虑的是内容优先：主内容区宽度自适应，侧边栏在窄屏时收纳到顶部或隐藏。",
      "这篇主题采用 content + sidebar 的双栏结构，并在中屏以下自动降为单栏，保证阅读宽度不受挤压。",
      "栅格列数也随断点切换，从 4 列逐步降到 2 列，卡片始终饱满不留白。",
    ],
    views: 320,
  },
  {
    title: "冬日手记 · Life",
    cat: "life",
    tags: ["日记"],
    paras: [
      "冬天适合煮一壶茶，把窗户上的雾气当作白纸写字。炉火、厚实的毛衣、翻旧的书页。",
      "想到去年此时立下的计划，多数平凡，少数成真，倒也无妨。开始总比完美重要。",
      "愿新的一年，仍保有对微小事物的热忱。",
    ],
    views: 281,
  },
  {
    title: "城市漫游：上海 · Travel",
    cat: "travel",
    tags: ["旅行", "摄影"],
    paras: [
      "沿着武康路向南，梧桐树下的老洋房与咖啡馆交替出现。在安福路的小巷里发现一家旧书店。",
      "傍晚去外滩看两岸的灯次第亮起，黄浦江的风带来咸湿的凉意。",
      "上海的另一面藏在这些新旧交叠的街巷里，需要放慢脚步才能读到。",
    ],
    views: 1893,
  },
  {
    title: "深浅色下的玻璃拟物 · Design",
    cat: "design",
    tags: ["玻璃拟物", "主题开发"],
    paras: [
      "默认出品为浅色方案：浅蓝灰的背景、白色半透明卡片与深色文字，让玻璃质感在白天光线下呈现得最干净。",
      "深色模式下玻璃拟物同样成立，但高光与阴影的关系需要反向调整，避免文字漂浮在浑浊的底上。",
      "本主题默认浅色，通透的观感留给阅读本身。",
    ],
    views: 522,
  },
  {
    title: "pglite：零配置的嵌入式数据库 · Dev",
    cat: "tech",
    tags: ["开源", "Next.js"],
    paras: [
      "pglite 把 PostgreSQL 编译到了 WASM，Node 环境里可以直接在进程内跑一个真正的 Postgres，完全不需要 Docker 或外部服务。",
      "OboePress 借此实现了零配置启动：第一次请求自动建表、跑迁移，数据落盘到本地目录。",
      "开发体验因此接近 SQLite 的轻量，同时保留 Postgres 全部能力。",
    ],
    views: 1104,
  },
];

async function main() {
  await ensureMigrations();
  await ensureBootstrap(); // site_settings + themes + menus

  // Point the public site at the Bluemix theme and give it an identity, so the
  // fresh database opens straight into the Bluemix theme (no setup wizard).
  await db
    .update(siteSettings)
    .set({
      activeThemeSlug: "bluemix",
      siteTitle: "OboePress 示例站",
      siteDescription: "Design a colorful life — 玻璃拟物主题 Bluemix",
      tagline: "设计、摄影与生活的色彩",
      footerText: "Designed & Coded by OboePress",
      logoUrl: "",
    })
    .where(eq(siteSettings.id, 1));
  console.log("✓ 活动主题已设为 Bluemix");

  // 1. Demo author
  let author = await db
    .select()
    .from(users)
    .where(eq(users.email, "demo@example.com"))
    .limit(1);
  let authorId: number;
  if (author.length) {
    authorId = author[0].id;
    console.log("✓ 使用已有演示作者 #" + authorId);
  } else {
    const [u] = await db
      .insert(users)
      .values({
        email: "demo@example.com",
        name: "OboePress 演示作者",
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: "admin",
        bio: "Bluemix 主题演示作者",
      })
      .returning();
    authorId = u.id;
    console.log("✓ 创建演示作者 #" + authorId + "（密码 " + PASSWORD + "）");
  }

  // 1b. Guaranteed local admin login — always reset to the fixed password so
  // the account/password is never "different next time".
  await db
    .update(users)
    .set({ role: "admin", passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10) })
    .where(eq(users.email, ADMIN_EMAIL));
  const [adminRow] = await db
    .select()
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);
  if (!adminRow) {
    await db.insert(users).values({
      email: ADMIN_EMAIL,
      name: "站长",
      role: "admin",
      bio: "本地测试管理员",
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
    });
    console.log("✓ 创建本地管理员 " + ADMIN_EMAIL + "（密码 " + ADMIN_PASSWORD + "）");
  } else {
    console.log("✓ 已重置本地管理员 " + ADMIN_EMAIL + " 的密码为 " + ADMIN_PASSWORD);
  }

  // 2. Categories (get-or-create)
  const catIds: Record<string, number> = {};
  for (const c of CATEGORIES) {
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, c.slug))
      .limit(1);
    if (rows.length) {
      catIds[c.slug] = rows[0].id;
    } else {
      const [n] = await db
        .insert(categories)
        .values({ name: c.name, slug: c.slug, description: "" })
        .returning();
      catIds[c.slug] = n.id;
    }
  }
  console.log("✓ 分类就绪：" + Object.keys(catIds).join(", "));

  // 3. Tags (get-or-create)
  const tagIds: Record<string, number> = {};
  for (const name of TAGS) {
    const slug = slugify(name);
    const rows = await db
      .select()
      .from(tags)
      .where(eq(tags.slug, slug))
      .limit(1);
    if (rows.length) {
      tagIds[slug] = rows[0].id;
    } else {
      const [n] = await db.insert(tags).values({ name, slug }).returning();
      tagIds[slug] = n.id;
    }
  }
  console.log("✓ 标签就绪：" + Object.keys(tagIds).length + " 个");

  // 4. Posts
  let created = 0;
  for (const [i, p] of POSTS.entries()) {
    const slug = `${i + 1}-${slugify(p.title)}`;
    const rows = await db
      .select()
      .from(posts)
      .where(eq(posts.slug, slug))
      .limit(1);
    if (rows.length) continue;

    const catId = catIds[p.cat];
    const tagSlugs = p.tags.map((t) => slugify(t));
    const [post] = await db
      .insert(posts)
      .values({
        title: p.title,
        slug,
        excerpt: excerptOf(p.paras),
        content: makeContent(p.paras[0], p.paras.slice(1)),
        status: "published",
        featuredImage: cover(i + 1),
        commentStatus: "open",
        views: p.views,
        authorId,
        publishedAt: new Date(Date.now() - i * 86400000),
        format: "standard",
      })
      .returning();

    if (catId) await db.insert(postCategories).values({ postId: post.id, categoryId: catId });
    const ptags = [...new Set(tagSlugs)]
      .map((s) => tagIds[s])
      .filter((id): id is number => !!id);
    if (ptags.length)
      await db.insert(postTags).values(ptags.map((tagId) => ({ postId: post.id, tagId })));

    created++;
    console.log(`  + 「${p.title}」 -> /blog/${slug}`);
  }

  console.log(`\n✅ 完成：新建 ${created} 篇文章，已有 ${POSTS.length - created} 篇跳过。`);
  console.log(`首页 -> http://localhost:3000  |  作者: /admin/... (演示作者 ${authorId})`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 种子失败：", err instanceof Error ? err.stack : err);
  process.exit(1);
});