import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { Page } from "@/db/schema";

/**
 * 3D Book Card — a single book on the shelf with perspective transform,
 * gradient cover, title, and hover animation.
 */
export default function BookCard({ page }: { page: Page }) {
  // Generate a deterministic gradient based on page id
  const gradients = [
    "from-blue-400 to-indigo-500",
    "from-sky-400 to-blue-500",
    "from-indigo-400 to-purple-500",
    "from-cyan-400 to-blue-500",
    "from-blue-500 to-violet-500",
  ];
  const gradient = gradients[page.id % gradients.length];

  return (
    <Link href={`/pages/${page.slug}`} className="panda-book-card group">
      <div className="panda-book-inner">
        {/* Book cover */}
        <div className={`panda-book-cover bg-gradient-to-br ${gradient}`}>
          {page.featuredImage ? (
            <img
              src={page.featuredImage}
              alt={page.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-4">
              <BookOpen size={40} className="mb-3 text-white/80 drop-shadow-lg" />
              <span className="text-center text-sm font-medium leading-tight text-white drop-shadow">
                {page.title}
              </span>
            </div>
          )}
          {/* Shine effect */}
          <div className="panda-book-shine" />
        </div>

        {/* Book spine shadow */}
        <div className="panda-book-spine" />
      </div>

      {/* Book title below */}
      <div className="panda-book-label">
        <span className="text-sm font-medium text-slate-700 group-hover:text-blue-600">
          {page.title}
        </span>
      </div>
    </Link>
  );
}
