import { loadPublicContent } from './_shared/content.js';
import { renderRoute } from '../seo/render.mjs';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname.startsWith('/api/')) return context.next();
  if (/\.(css|js|jpg|jpeg|png|webp|svg|json|ico|woff2?)$/.test(url.pathname)) return context.next();
  const preview = context.env.CF_PAGES_BRANCH && context.env.CF_PAGES_BRANCH !== 'main';
  if (/\/(admin|ocr-tool)\.html$/.test(url.pathname)) {
    const response = await context.next();
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, { status: response.status, headers });
  }
  try {
    const content = await loadPublicContent(context.env, context.request);
    const home = await context.env.ASSETS.fetch(new Request(new URL('/index.html', url)));
    const result = renderRoute({ url, content, homeHtml: await home.text(), preview: Boolean(preview) });
    if (!result) return context.next();
    return new Response(result.body, { status: result.status, headers: { ...result.headers, 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Page content unavailable:', error.message);
    return new Response('内容暂时无法加载，请稍后重试。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  }
}
