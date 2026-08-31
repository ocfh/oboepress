"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Pen, Search, LayoutGrid } from "lucide-react";
import { useState } from "react";

type NavTab = { label: string; href: string; icon: React.ReactNode };

const NAV_TABS: NavTab[] = [
  { label: "文档", href: "/", icon: <BookOpen size={16} /> },
  { label: "博客", href: "/blog", icon: <Pen size={16} /> },
];

export default function PandaNav({ siteTitle }: { siteTitle: string }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="panda-header">
      <div className="panda-header-inner">
        {/* Logo */}
        <Link href="/" className="panda-logo">
          <div className="panda-logo-icon">W</div>
          <span>{siteTitle}</span>
        </Link>

        {/* Navigation tabs */}
        <nav className="panda-nav-tabs">
          {NAV_TABS.map((tab) => {
            const isActive =
              tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`panda-nav-tab ${isActive ? "active" : ""}`}
              >
                {tab.icon}
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="panda-header-actions">
          <button
            className="panda-grid-btn"
            title="文档网格"
            onClick={() => {}}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            className="panda-search-btn"
            title="搜索"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search size={16} />
          </button>
        </div>
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20" onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-white/90 p-4 shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 rounded-xl bg-[#00185e10] px-4 py-3">
              <Search size={18} className="text-slate-400" />
              <input
                autoFocus
                placeholder="搜索文档…"
                className="flex-1 bg-transparent text-base text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
            <p className="mt-3 text-center text-sm text-slate-400">输入关键词搜索文档内容</p>
          </div>
        </div>
      )}
    </header>
  );
}
