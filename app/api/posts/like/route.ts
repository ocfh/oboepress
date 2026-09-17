import { z } from "zod";
import { handleError, ok, readJson } from "@/lib/http";
import { likePost } from "@/lib/services/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const likeSchema = z.object({
  id: z.number().int().positive(),
});

export async function POST(req: Request) {
  try {
    const body = await readJson(req, likeSchema);
    if ("res" in body) return body.res;
    const likes = await likePost(body.data.id);
    return ok({ likes });
  } catch (e) {
    return handleError(e);
  }
}
