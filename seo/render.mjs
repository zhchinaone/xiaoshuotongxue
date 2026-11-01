const ORIGIN = 'https://www.xiaoshuotongxue.online';
const BRAND = '小硕同学科研绘图';
const PAGE_SIZE = 24;
const CATEGORIES = { cover: '期刊封面', abstract: '图形摘要', mechanism: '机制示意', render: '3D 渲染', figure: '论文图组' };
const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const json = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const text = value => typeof value === 'string' ? value : '';

function asset(value) {
  const source = text(value).trim();
  if (!source || /[\u0000-\u0020\\]/.test(source) || source.startsWith('//')) return '';
  try {
    const url = new URL(source, ORIGIN);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return url.origin === ORIGIN ? `${url.pathname}${url.search}` : url.href;
  } catch { return ''; }
}

// Keep the bootstrap public: attachment objects and backend identifiers never leave the server.
function publicContent(content = {}) {
  return {
    heroImages: (Array.isArray(content.heroImages) ? content.heroImages : []).map(item => ({ src: asset(item?.src), alt: text(item?.alt) })),
    cases: (Array.isArray(content.cases) ? content.cases : []).filter(item => item && item.published !== false).map(item => {
      const entry = {};
      for (const key of ['caseKey', 'school', 'journal']) entry[key] = text(item[key]);
      entry.year = text(item.year) || (Number.isInteger(item.year) ? String(item.year) : '');
      entry.categories = Array.isArray(item.categories) ? item.categories.filter(v => typeof v === 'string').join(' ') : text(item.categories);
      entry.thumbSrc = asset(item.thumbSrc);
      entry.largeSrc = asset(item.largeSrc);
      entry.detailReviewed = Boolean(item.detailReviewed);
      entry.alt = label(entry);
      return entry;
    }),
  };
}

function reviewed(entry) {
  return Boolean(entry.detailReviewed && entry.caseKey && entry.school && entry.journal && (entry.largeSrc || entry.thumbSrc));
}
const detailPath = entry => `/cases/${encodeURIComponent(entry.caseKey)}/`;
const absolute = path => new URL(path, ORIGIN).href;
const categories = entry => entry.categories.split(/\s+/).filter(Boolean);
const label = entry => [entry.school, entry.journal].filter(Boolean).join(' · ') || '科研绘图作品';

function card(entry) {
  const title = label(entry);
  const image = entry.thumbSrc || entry.largeSrc;
  const large = entry.largeSrc || image;
  return `<article class="case-card" data-category="${esc(entry.categories)}">${image ? `<a class="case-preview" href="${esc(large)}" data-large="${esc(large)}" data-title="${esc(title)}"><img src="${esc(image)}" alt="${esc(title)}" loading="lazy" decoding="async" data-large-src="${esc(large)}" /></a>` : ''}<div class="case-meta">${entry.school ? `<span>${esc(entry.school)}</span>` : ''}${entry.journal ? `<strong>${esc(entry.journal)}</strong>` : ''}${entry.year ? `<span>${esc(entry.year)}</span>` : ''}${reviewed(entry) ? `<a href="${esc(detailPath(entry))}">${esc(title)} · 查看案例</a>` : ''}</div></article>`;
}

const CSS = `<style id="seo-styles">
.case-preview img{object-fit:contain}
.seo-page{max-width:1200px;margin:auto;padding:32px 20px 64px;overflow-wrap:anywhere}
.seo-page h1{font-size:32px;line-height:1.3;margin:24px 0}.seo-page h2{font-size:23px;margin:28px 0 16px}
.seo-nav,.seo-filters,.seo-pagination,.seo-breadcrumbs{display:flex;flex-wrap:wrap;gap:12px 20px;margin:20px 0}
.seo-page a{color:#0066b8}.seo-page .gallery-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.seo-page .case-card{min-width:0;border-radius:8px;overflow:hidden;border:1px solid #e1e3e5;background:#fff}
.seo-page .case-preview{display:flex;align-items:center;justify-content:center;aspect-ratio:4/3;width:100%;height:auto;background:#f5f5f7}
.seo-page .case-preview img{width:100%;height:100%;object-fit:contain;position:static}
.seo-page .case-meta{padding:16px;display:grid;gap:8px}
.seo-detail-image{display:block;width:100%;height:auto;max-height:none;object-fit:contain}.seo-copy{max-width:800px;white-space:pre-line;line-height:1.8}
.seo-page [aria-current=page]{font-weight:bold}.seo-page *{letter-spacing:0}
@media(max-width:760px){.seo-page .gallery-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:480px){.seo-page .gallery-grid{grid-template-columns:minmax(0,1fr)}.seo-page h1{font-size:26px}}
</style>`;

function metadata({ title, description, path, image, noindex, schema }) {
  return `<title>${esc(title)}</title><meta name="description" content="${esc(description)}" /><link rel="canonical" href="${esc(absolute(path))}" /><meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}" /><meta property="og:type" content="website" /><meta property="og:site_name" content="${BRAND}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${esc(absolute(path))}" />${image ? `<meta property="og:image" content="${esc(absolute(image))}" />` : ''}<script type="application/ld+json">${json({ '@context': 'https://schema.org', ...schema })}</script>`;
}

function reply(body, type = 'text/html', status = 200, noindex = false) {
  return { body, status, headers: { 'content-type': `${type}; charset=utf-8`, ...(noindex ? { 'x-robots-tag': 'noindex, follow' } : {}) } };
}

function page({ title, description, path, image, noindex, schema, body, status = 200 }) {
  return reply(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="/styles.css" />${metadata({ title, description, path, image, noindex, schema })}${CSS}</head><body><main class="seo-page"><nav class="seo-nav" aria-label="主导航"><a href="/">${BRAND}</a><a href="/cases/">作品案例</a><a href="/#contact">联系咨询</a></nav>${body}</main></body></html>`, 'text/html', status, noindex);
}

function breadcrumbs(items) {
  return `<nav class="seo-breadcrumbs" aria-label="面包屑">${items.map(([name, href]) => href ? `<a href="${esc(href)}">${esc(name)}</a>` : `<span aria-current="page">${esc(name)}</span>`).join('<span aria-hidden="true">/</span>')}</nav>`;
}

function home(html, content, preview) {
  if (typeof html !== 'string' || !html.includes('</head>')) throw new TypeError('homeHtml must be the original homepage HTML');
  const title = `科研绘图、图形摘要与期刊封面设计 | ${BRAND}`;
  const description = '科研绘图作品展示，涵盖图形摘要、机制示意图、期刊封面、3D 科研渲染与论文图组。';
  const originalSlogan = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
  let body = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b(?=[^>]*(?:name\s*=\s*["'](?:description|robots)["']|property\s*=\s*["']og:[^"']*["']))[^>]*>/gi, '')
    .replace(/<link\b(?=[^>]*rel\s*=\s*["']canonical["'])[^>]*>/gi, '')
    .replace(/<script\b(?=[^>]*(?:type\s*=\s*["']application\/ld\+json["']|id\s*=\s*["']site-content["']))[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\b(src|href)=(['"])(?![a-z][a-z\d+.-]*:|\/|#)([^'"]+)\2/gi, (_, attr, quote, path) => `${attr}=${quote}/${path.replace(/^\.\//, '')}${quote}`)
    .replace(/(<h1\b[^>]*>)[\s\S]*?<\/h1>/i, (_, opening) => `${opening}科研绘图、图形摘要<br />与期刊封面设计。</h1>${originalSlogan ? `<p class="seo-original-slogan">${originalSlogan}</p>` : ''}`)
    .replace(/(<div\b[^>]*\bid=["']gallery["'][^>]*>)[\s\S]*?<\/div>/i, (_, opening) => `${opening}${content.cases.slice(0, 12).map(card).join('')}</div><p class="gallery-actions"><a href="/cases/">浏览全部作品案例</a></p>`)
    .replace(/(<[^>]+\bdata-case-count\b[^>]*>)[\s\S]*?(<\/[^>]+>)/i, (_, opening, closing) => `${opening}${content.cases.length} 个精选案例${closing}`);
  let heroIndex = 0;
  body = body.replace(/<img\b(?=[^>]*\bclass=["'][^"']*\bhero-showcase-image\b)[^>]*>/gi, tag => {
    const image = content.heroImages[heroIndex++];
    if (!image?.src) return tag;
    return tag.replace(/\s(?:src|alt)\s*=\s*(["'])[\s\S]*?\1/gi, '').replace(/\s*\/?>$/, ` src="${esc(image.src)}" alt="${esc(image.alt)}" />`);
  });
  const head = metadata({ title, description, path: '/', image: content.heroImages[0]?.src || content.cases[0]?.largeSrc || content.cases[0]?.thumbSrc, noindex: preview, schema: { '@type': 'WebSite', name: BRAND, url: `${ORIGIN}/`, publisher: { '@type': 'Organization', name: BRAND, url: `${ORIGIN}/` } } });
  body = body.replace('</head>', `${head}${CSS}<script type="application/json" id="site-content">${json(content)}</script></head>`);
  return reply(body, 'text/html', 200, preview);
}

function listing(url, content, preview) {
  const category = url.searchParams.get('category') || '';
  const filtered = category && category !== 'all';
  const entries = filtered ? content.cases.filter(entry => categories(entry).includes(category)) : content.cases;
  const rawPage = url.searchParams.get('page') || '1';
  const number = Number(rawPage);
  const count = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  if (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(number) || number < 1 || number > count) return missing(preview);
  const path = `/cases/${number > 1 ? `?page=${number}` : ''}`;
  const href = n => `/cases/?${new URLSearchParams({ ...(filtered ? { category } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`.replace(/\?$/, '');
  const visible = entries.slice((number - 1) * PAGE_SIZE, number * PAGE_SIZE);
  const title = `${filtered ? CATEGORIES[category] || category : '科研绘图案例'}${number > 1 ? ` · 第 ${number} 页` : ''} | ${BRAND}`;
  return page({ title, description: '浏览科研绘图、图形摘要、期刊封面和机制示意作品。', path, noindex: preview || filtered, image: visible[0]?.largeSrc || visible[0]?.thumbSrc,
    schema: { '@type': 'CollectionPage', name: title, url: absolute(path), mainEntity: { '@type': 'ItemList', itemListElement: visible.filter(reviewed).map((entry, i) => ({ '@type': 'ListItem', position: i + 1, url: absolute(detailPath(entry)), name: label(entry) })) } },
    body: `${breadcrumbs([['首页', '/'], ['作品案例']])}<h1>${esc(filtered ? CATEGORIES[category] || category : '科研绘图案例')}</h1><nav class="seo-filters" aria-label="案例分类"><a href="/cases/">全部</a>${Object.entries(CATEGORIES).map(([key, name]) => `<a href="/cases/?category=${key}"${key === category ? ' aria-current="page"' : ''}>${name}</a>`).join('')}</nav><div class="gallery-grid">${visible.map(card).join('')}</div>${!visible.length ? '<p>暂无作品。</p>' : ''}<nav class="seo-pagination" aria-label="分页">${number > 1 ? `<a rel="prev" href="${esc(href(number - 1))}">上一页</a>` : ''}<span aria-current="page">第 ${number} / ${count} 页</span>${number < count ? `<a rel="next" href="${esc(href(number + 1))}">下一页</a>` : ''}</nav>` });
}

function detail(entry, content, preview) {
  const title = label(entry);
  const path = detailPath(entry);
  const image = entry.largeSrc || entry.thumbSrc;
  const related = content.cases.filter(other => other.caseKey !== entry.caseKey && reviewed(other) && categories(other).some(category => categories(entry).includes(category))).slice(0, 3);
  const crumbs = [['首页', '/'], ['作品案例', '/cases/'], [title, path]];
  const combinedYear = entry.journal.match(/\b(?:19|20)\d{2}\b/)?.[0] || '';
  const year = entry.year || combinedYear;
  const journal = combinedYear ? entry.journal.replace(combinedYear, '').replace(/^[\s·|/—-]+|[\s·|/—-]+$/g, '') : entry.journal;
  const facts = [['学校 / 机构', entry.school], ['年份', year], ['期刊', journal]].filter(([, value]) => value);
  const summary = [entry.school, year, journal].filter(Boolean).join(' · ');
  return page({ title: `${title} | ${BRAND}`, description: summary, path, image, noindex: preview,
    schema: { '@graph': [{ '@type': 'CreativeWork', name: title, description: summary, url: absolute(path), image: absolute(image) }, { '@type': 'BreadcrumbList', itemListElement: crumbs.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: absolute(url) })) }] },
    body: `${breadcrumbs([['首页', '/'], ['作品案例', '/cases/'], [title]])}<article><h1>${esc(title)}</h1><dl class="seo-copy">${facts.map(([name, value]) => `<dt>${name}</dt><dd>${esc(value)}</dd>`).join('')}</dl><a href="${esc(image)}" aria-label="打开完整作品图片"><img class="seo-detail-image" src="${esc(image)}" alt="${esc(title)}" /></a></article>${related.length ? `<section><h2>相关案例</h2><div class="gallery-grid">${related.map(card).join('')}</div></section>` : ''}<p><a href="/#contact">联系咨询</a></p>` });
}

function missing() {
  return page({ title: `页面未找到 | ${BRAND}`, description: '请求的页面不存在。', path: '/404', noindex: true, status: 404, schema: { '@type': 'WebPage', name: '页面未找到' }, body: '<h1>页面未找到</h1><p><a href="/cases/">浏览作品案例</a></p>' });
}

function sitemap(content, preview) {
  const pages = preview ? [] : [{ path: '/' }, ...Array.from({ length: Math.max(1, Math.ceil(content.cases.length / PAGE_SIZE)) }, (_, i) => ({ path: `/cases/${i ? `?page=${i + 1}` : ''}`, images: content.cases.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE).map(entry => entry.largeSrc || entry.thumbSrc).filter(Boolean) })), ...content.cases.filter(reviewed).map(entry => ({ path: detailPath(entry), images: [entry.largeSrc || entry.thumbSrc] }))];
  return reply(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${pages.map(item => `<url><loc>${esc(absolute(item.path))}</loc>${[...new Set(item.images || [])].map(image => `<image:image><image:loc>${esc(absolute(image))}</image:loc></image:image>`).join('')}</url>`).join('')}</urlset>`, 'application/xml', 200, preview);
}

/** Pure, synchronous renderer shared by Node and edge adapters. Static/API routes return null. */
export function renderRoute({ url, content = {}, homeHtml, preview = false }) {
  let parsed;
  try { parsed = new URL(String(url), ORIGIN); } catch { return missing(); }
  const path = parsed.pathname;
  if (path === '/robots.txt') return reply(`User-agent: *\n${preview ? 'Disallow: /' : 'Allow: /\nDisallow: /admin.html\nDisallow: /ocr-tool.html\nDisallow: /api/\nAllow: /api/media\nAllow: /api/asset'}\nSitemap: ${ORIGIN}/sitemap.xml\n`, 'text/plain', 200, preview);
  const data = publicContent(content || {});
  if (path === '/sitemap.xml') return sitemap(data, preview);
  if (path === '/' || path === '/index.html') return home(homeHtml, data, preview);
  if (path === '/cases/' || path === '/cases') return listing(parsed, data, preview);
  if (path.startsWith('/cases/')) {
    const match = path.match(/^\/cases\/([^/]+)\/?$/);
    let key;
    try { key = match ? decodeURIComponent(match[1]) : ''; } catch { return missing(); }
    const entry = data.cases.find(item => item.caseKey === key && reviewed(item));
    return entry ? detail(entry, data, preview) : missing();
  }
  if (/^\/(?:api|assets|static)(?:\/|$)/.test(path) || /^\/(?:admin|ocr-tool)(?:\.html)?\/?$/.test(path) || /\.(?:css|m?js|json|map|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|pdf|mp4|webm|txt|xml)$/i.test(path)) return null;
  return missing();
}
