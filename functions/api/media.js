import { createFeishuService } from '../_shared/site.js';
import { loadPublicContent } from '../_shared/content.js';
export async function onRequestGet(context) {
  const token = new URL(context.request.url).searchParams.get('token');
  if (!token || !/^[a-zA-Z0-9_-]+$/.test(token)) return new Response('Not found', { status: 404 });
  try {
    const content = await loadPublicContent(context.env, context.request);
    const attachments = [...content.heroImages.map((entry) => entry.attachment), ...content.cases.flatMap((entry) => [entry.thumbAttachment, entry.largeAttachment])];
    if (!attachments.some((entry) => entry?.file_token === token)) return new Response('Not found', { status: 404 });
    const asset = await createFeishuService(context.env, context.request).fetchAssetByToken(token);
    return new Response(asset.bytes, { status: asset.status, headers: { 'Content-Type': asset.contentType, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return new Response('Image unavailable', { status: 503, headers: { 'Retry-After': '60' } });
  }
}
