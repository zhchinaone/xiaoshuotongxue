import { createFeishuService, decodeBase64Url } from "../_shared/site.js";

export async function onRequestGet(context) {
  const feishuService = createFeishuService(context.env, context.request);
  if (!feishuService.isConfigured()) {
    return new Response("Asset proxy unavailable", { status: 404 });
  }

  const requestUrl = new URL(context.request.url);
  const encoded = requestUrl.searchParams.get("u");
  if (!encoded) {
    return new Response("Missing asset url", { status: 400 });
  }

  const remoteUrl = decodeBase64Url(encoded);
  const assetResponse = await feishuService.fetchAsset(remoteUrl);
  return new Response(assetResponse.bytes, {
    status: assetResponse.status,
    headers: {
      "Content-Type": assetResponse.contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
