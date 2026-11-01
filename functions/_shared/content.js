import { createFeishuService, DEFAULT_CONTENT } from './site.js';

const entries = new Map();
const TTL = 300000;
export function invalidateContent(env) {
  entries.delete(env.FEISHU_BITABLE_APP_TOKEN || 'default');
}
export async function loadPublicContent(env, request) {
  const service = createFeishuService(env, request);
  if (!service.isConfigured()) return DEFAULT_CONTENT;
  const key = env.FEISHU_BITABLE_APP_TOKEN;
  const cached = entries.get(key);
  if (cached && cached.expires > Date.now()) return cached.content;
  const content = await service.loadContent();
  entries.set(key, { content, expires: Date.now() + TTL });
  return content;
}
