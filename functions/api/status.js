import { createFeishuService, jsonResponse } from "../_shared/site.js";

export async function onRequestGet(context) {
  const feishuService = createFeishuService(context.env, context.request);
  return jsonResponse({
    ok: true,
    connected: feishuService.isConfigured(),
    mode: feishuService.isConfigured() ? "feishu" : "default",
    message: feishuService.isConfigured()
      ? "Feishu Bitable is configured."
      : "Feishu credentials are missing. Fill Cloudflare environment variables first.",
  });
}
