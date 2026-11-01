import {
  DEFAULT_CONTENT,
  createFeishuService,
  jsonResponse,
  normalizeIncomingContent,
  readJsonBody,
} from "../_shared/site.js";
import { loadPublicContent, invalidateContent } from '../_shared/content.js';

export async function onRequestGet(context) {
  const feishuService = createFeishuService(context.env, context.request);

  if (!feishuService.isConfigured()) {
    if (context.env.CF_PAGES_BRANCH || context.env.CF_PAGES) {
      return jsonResponse({ ok: false, error: 'Feishu configuration missing in deployed environment' }, 503, { 'Retry-After': '60' });
    }
    return jsonResponse({
      ok: true,
      mode: "default",
      content: DEFAULT_CONTENT,
    });
  }

  try {
    const content = await loadPublicContent(context.env, context.request);
    return jsonResponse({
      ok: true,
      mode: "feishu",
      content,
    });
  } catch (error) {
    console.warn("Failed to load Feishu content, falling back to default:", error.message);
    return jsonResponse({ ok: false, error: 'Content temporarily unavailable' }, 503, { 'Retry-After': '60', 'Cache-Control': 'no-store' });
  }
}

export async function onRequestPost(context) {
  const feishuService = createFeishuService(context.env, context.request);
  if (!feishuService.isConfigured()) {
    return jsonResponse(
      {
        ok: false,
        error: "Feishu credentials are missing. Fill Cloudflare environment variables first.",
      },
      503,
    );
  }

  try {
    const body = await readJsonBody(context.request);
    const content = normalizeIncomingContent(body?.content || {});
    const saved = await feishuService.saveContent(content, {
      env: context.env,
      request: context.request,
      feishuService,
      deletedCaseIds: body.deletedCaseIds || [],
    });
    invalidateContent(context.env);

    return jsonResponse({
      ok: true,
      mode: "feishu",
      content: saved,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error.message || "Failed to save content",
      },
      500,
    );
  }
}
