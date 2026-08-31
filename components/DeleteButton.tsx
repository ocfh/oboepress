"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export default function DeleteButton({
  endpoint,
  label = "删除",
}: {
  endpoint: string;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function del() {
    if (!confirm("确定要删除吗？此操作不可撤销。")) return;
    setLoading(true);
    const res = await fetch(endpoint, { method: "DELETE" });
    setLoading(false);
    if (res.ok) router.refresh();
    else alert("删除失败");
  }

  return (
    <button
      onClick={del}
      disabled={loading}
      title={label}
      className="inline-flex items-center gap-1 rounded border border-red-900 px-2 py-1 text-xs text-red-400 transition hover:bg-red-950 disabled:opacity-50"
    >
      <Trash2 size={14} />
      {loading ? "…" : label}
    </button>
  );
}
