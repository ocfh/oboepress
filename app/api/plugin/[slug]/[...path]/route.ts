import { NextResponse } from "next/server";
import { dispatchPluginApi } from "@/lib/services/plugin-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { slug: string; path: string[] } };

async function handle(request: Request, ctx: Ctx): Promise<Response> {
  const res = await dispatchPluginApi(
    ctx.params.slug,
    ctx.params.path ?? [],
    request,
  );
  if (!res) {
    return NextResponse.json({ error: "接口不存在" }, { status: 404 });
  }
  return NextResponse.json(res.body ?? null, {
    status: res.status ?? 200,
    headers: res.headers,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
