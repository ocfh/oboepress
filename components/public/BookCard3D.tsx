import Link from "next/link";
import type { Page } from "@/db/schema";

/**
 * 3D Book Card — a single book on the shelf.
 * Uses the exact same CSS structure as the original Panda Studio site:
 * .book-3d > .book-face + .book-page-1 + .book-page-2 + .book-cover + .book-title
 */
export default function BookCard3D({ page, index }: { page: Page; index: number }) {
  const gradients = [
    "linear-gradient(135deg, #60a5fa, #3b82f6)",
    "linear-gradient(135deg, #818cf8, #6366f1)",
    "linear-gradient(135deg, #38bdf8, #0ea5e9)",
    "linear-gradient(135deg, #a78bfa, #8b5cf6)",
    "linear-gradient(135deg, #34d399, #10b981)",
  ];
  const gradient = gradients[index % gradients.length];

  return (
    <Link href={`/pages/${page.slug}`} className="book-3d transform" style={{ textDecoration: "none" }}>
      {/* Book face (spine + page edges) */}
      <div className="book-face" />

      {/* Page layers */}
      <div className="book-page book-page-1" />
      <div className="book-page book-page-2" />

      {/* Cover */}
      <div className="book-cover">
        {page.featuredImage ? (
          <img src={page.featuredImage} alt={page.title} className="book-cover-img" />
        ) : (
          <div className="book-cover-placeholder" style={{ background: gradient }}>
            <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="book-title">{page.title}</div>

      {/* Order badge */}
      <div className="book-order">{index + 1}</div>

      {/* Reading link (appears on hover) */}
      <div className="book-reading">
        <span className="book-reading-btn">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          阅读
        </span>
      </div>
    </Link>
  );
}
