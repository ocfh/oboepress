import Link from "next/link";
import { CalendarDays, Eye } from "lucide-react";
import {
  getArchiveIndex,
  getPublishedCount,
  listArchiveEntries,
} from "@/lib/services/archives";
import { formatSiteDate, getSettings } from "@/lib/services/settings";
import { maintenanceGate } from "@/lib/services/maintenance";
import MaintenanceScreen from "@/components/site/MaintenanceScreen";
import { POST_FORMATS } from "@/lib/post-formats";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const settings = await getSettings();
  // Bare title — the root title template appends the site name itself.
  return {
    title: "文章归档",
    description: `${settings.siteTitle} 的全部文章按时间归档`,
  };
}

/**
 * Full-site archive timeline — `?year=2026&month=8` narrows the list, and the
 * year/month index doubles as the filter UI.
 */
export default async function ArchivesPage({
  searchParams,
}: {
  searchParams?: { year?: string; month?: string };
}) {
  const year = Number(searchParams?.year) || undefined;
  const month = Number(searchParams?.month) || undefined;

  // 维护模式优先，避免维护期间继续查询归档数据。
  const maintenance = await maintenanceGate();
  if (maintenance) return <MaintenanceScreen settings={maintenance} />;

  const [index, total, entries, settings] = await Promise.all([
    getArchiveIndex(),
    getPublishedCount(),
    listArchiveEntries({ year, month }),
    getSettings(),
  ]);

  // Group the flat list back into year → month buckets for the timeline.
  const buckets = new Map<string, typeof entries>();
  for (const e of entries) {
    const d = e.publishedAt ? new Date(e.publishedAt) : null;
    const key = d ? `${d.getFullYear()}-${d.getMonth() + 1}` : "未发布";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  }

  const filtered = !!(year || month);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
      <div>
        <header className="mb-8">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-[var(--text)]">
            <CalendarDays size={26} style={{ color: "var(--accent)" }} />
            文章归档
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            共 <span style={{ color: "var(--accent)" }}>{total}</span> 篇文章
            {filtered && (
              <>
                {" · "}
                当前筛选 {year ?? "全部"} 年{month ? ` ${month} 月` : ""}
                {" · "}
                <Link href="/archives" className="underline" style={{ color: "var(--link)" }}>
                  清除
                </Link>
              </>
            )}
          </p>
        </header>

        {!entries.length && (
          <p
            className="rounded-2xl border p-10 text-center text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--muted)",
            }}
          >
            这个时间段还没有文章。
          </p>
        )}

        <div className="space-y-8">
          {[...buckets.entries()].map(([key, list]) => (
            <section key={key}>
              <h2
                className="mb-3 border-b pb-1.5 text-sm font-semibold"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                {key === "未发布" ? key : key.replace("-", " 年 ") + " 月"}
                <span className="ml-2 text-xs opacity-60">{list.length} 篇</span>
              </h2>
              <ul className="space-y-1">
                {list.map((p) => {
                  const fmt = POST_FORMATS.find((f) => f.value === p.format);
                  return (
                    <li key={p.id}>
                      <Link
                        href={p.url}
                        className="group flex items-baseline gap-3 rounded-md px-2 py-1.5 transition"
                        style={{ color: "var(--text)" }}
                      >
                        <span
                          className="w-20 shrink-0 font-mono text-xs tabular-nums"
                          style={{ color: "var(--muted)" }}
                        >
                          {formatSiteDate(p.publishedAt, settings)}
                        </span>
                        <span className="flex-1 group-hover:underline">{p.title}</span>
                        {fmt && fmt.value !== "standard" && (
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                            style={{
                              background: "var(--accent-soft)",
                              color: "var(--accent)",
                            }}
                          >
                            {fmt.label}
                          </span>
                        )}
                        <span
                          className="hidden shrink-0 items-center gap-1 text-[11px] sm:flex"
                          style={{ color: "var(--muted)" }}
                        >
                          <Eye size={11} /> {p.views}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {/* Year / month index */}
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {index.map((y) => (
          <div key={y.year}>
            <Link
              href={`/archives?year=${y.year}`}
              className="flex items-center justify-between text-sm font-semibold transition hover:underline"
              style={{ color: year === y.year ? "var(--accent)" : "var(--text)" }}
            >
              {y.year}
              <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>
                {y.count}
              </span>
            </Link>
            <ul className="mt-1 space-y-0.5 pl-3">
              {y.months.map((m) => (
                <li key={m.month}>
                  <Link
                    href={`/archives?year=${m.year}&month=${m.month}`}
                    className="flex items-center justify-between text-xs transition hover:underline"
                    style={{
                      color:
                        year === m.year && month === m.month
                          ? "var(--accent)"
                          : "var(--muted)",
                    }}
                  >
                    {m.month} 月
                    <span className="opacity-60">{m.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  );
}
