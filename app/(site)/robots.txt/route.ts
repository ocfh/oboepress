import { buildRobotsTxt } from "@/lib/services/sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const body = await buildRobotsTxt(req);
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
