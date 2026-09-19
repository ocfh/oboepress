import { z } from "zod";
import { authenticate, authorize, handleError, ok, readJson } from "@/lib/http";
import {
  addCustomProvider,
  listAdminProviders,
  removeCustomProvider,
  saveCustomProvider,
  savePresetProvider,
  type PresetKind,
} from "@/lib/services/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRESET_KEYS = [
  "qq",
  "wechat",
  "weibo",
  "dingtalk",
  "douyin",
  "github",
  "linuxdo",
] as const;

const bool = z.boolean().optional();
const str = z.string().optional();

const presetPatchSchema = z.object({
  enabled: bool,
  clientId: str,
  clientSecret: str,
  allowCreate: bool,
  mergeByEmail: bool,
});

const customPatchSchema = presetPatchSchema.extend({
  label: str,
  authorizeUrl: str,
  tokenUrl: str,
  userInfoUrl: str,
  tokenMethod: z.enum(["POST", "GET"]).optional(),
  tokenAuth: z.enum(["body", "basic"]).optional(),
  userInfoAuth: z.enum(["bearer", "query"]).optional(),
  scope: str,
  openIdField: str,
  nicknameField: str,
  avatarField: str,
  emailField: str,
  emailVerifiedField: str,
});

const updateSchema = z.object({
  key: z.string().min(2).max(80),
  patch: customPatchSchema,
});

const addCustomSchema = z.object({
  slug: z.string().min(2).max(32),
  label: z.string().min(1).max(32),
  clientId: z.string().default(""),
  clientSecret: z.string().default(""),
  enabled: z.boolean().default(false),
  allowCreate: z.boolean().default(true),
  mergeByEmail: z.boolean().default(true),
  authorizeUrl: z.string().min(1),
  tokenUrl: z.string().min(1),
  userInfoUrl: z.string().min(1),
  tokenMethod: z.enum(["POST", "GET"]).default("POST"),
  tokenAuth: z.enum(["body", "basic"]).default("body"),
  userInfoAuth: z.enum(["bearer", "query"]).default("bearer"),
  scope: z.string().default(""),
  openIdField: z.string().min(1),
  nicknameField: z.string().default("name"),
  avatarField: z.string().default("avatar"),
  emailField: z.string().default(""),
  emailVerifiedField: z.string().default(""),
});

const removeSchema = z.object({ key: z.string().min(2).max(80) });

export async function GET() {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;
    return ok(await listAdminProviders());
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;
    const body = await readJson(req, addCustomSchema);
    if ("res" in body) return body.res;
    const key = await addCustomProvider(body.data);
    return ok({ key }, 201);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;
    const body = await readJson(req, updateSchema);
    if ("res" in body) return body.res;
    const { key, patch } = body.data;
    if ((PRESET_KEYS as readonly string[]).includes(key)) {
      const parsed = presetPatchSchema.parse(patch);
      await savePresetProvider(key as PresetKind, parsed);
    } else if (key.startsWith("custom:")) {
      await saveCustomProvider(key, patch);
    } else {
      return handleError(new Error("unknown provider"));
    }
    return ok(await listAdminProviders());
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticate();
    if ("res" in auth) return auth.res;
    const denied = authorize(auth.user, "settings:manage");
    if (denied) return denied;
    const body = await readJson(req, removeSchema);
    if ("res" in body) return body.res;
    await removeCustomProvider(body.data.key);
    return ok(await listAdminProviders());
  } catch (e) {
    return handleError(e);
  }
}
