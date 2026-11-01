import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderRoute } from './render.mjs';

const homeHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const origin = 'https://www.xiaoshuotongxue.online';
const entry = (i = 0, extra = {}) => ({
  caseKey: `sample-${i}`, school: `Institution ${i}`, journal: 'Journal · 2025', detailReviewed: true,
  categories: 'mechanism render', thumbSrc: `assets/cases/thumb-${i}.jpg`,
  largeSrc: `assets/cases/large-${i}.jpg`, ...extra,
});
const render = (url, cases = [entry()], extra = {}) => renderRoute({ url, content: { cases }, homeHtml, ...extra });
const scripts = body => [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));

test('homepage preserves original sections, renders 12 cards, canonical and bootstrap before application scripts', () => {
  const cases = Array.from({ length: 30 }, (_, i) => entry(i));
  const { body, status, headers } = render('/', cases);
  assert.equal(status, 200);
  assert.equal(headers['content-type'], 'text/html; charset=utf-8');
  assert.equal((body.match(/class="case-card"/g) || []).length, 12);
  assert.match(body, /<h1[^>]*>科研绘图/);
  assert.match(body, /id="services"/);
  assert.match(body, /id="contact"/);
  assert.match(body, /科研成果的下一张/);
  assert.match(body, /href="\/cases\/"/);
  assert.match(body, /src="\/script.js"/);
  assert.match(body, /href="\/styles.css"/);
  assert.match(body, /src="\/assets\/brand\//);
  assert.match(body, /30 个精选案例/);
  assert.equal((body.match(/<title>/g) || []).length, 1);
  assert.ok(body.indexOf('id="site-content"') < body.indexOf('src="/script.js"'));
  const bootstrap = JSON.parse(body.match(/id="site-content">([\s\S]*?)<\/script>/)[1]);
  assert.equal(bootstrap.cases.length, 30);
  assert.equal(bootstrap.cases[0].largeSrc, '/assets/cases/large-0.jpg');
  assert.equal(scripts(body)[0]['@type'], 'WebSite');
  assert.equal(scripts(body)[0].publisher['@type'], 'Organization');
  assert.equal(scripts(body)[0].publisher.name, '小硕同学科研绘图');
  assert.match(body, new RegExp(`rel="canonical" href="${origin}/"`));
});

test('homepage preserves the Baidu ownership verification exactly once inside head', () => {
  for (const preview of [false, true]) {
    const { body } = render('/', [entry()], { preview });
    const head = body.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)[1];
    assert.match(head, /<meta name="baidu-site-verification" content="codeva-vp7NuHIDpf" \/>/);
    assert.equal((body.match(/name="baidu-site-verification"/g) || []).length, 1);
  }
});

test('homepage preserves the Google ownership verification exactly once inside head', () => {
  for (const preview of [false, true]) {
    const { body } = render('/', [entry()], { preview });
    const head = body.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)[1];
    assert.match(head, /<meta name="google-site-verification" content="jt6_xLtZocnKy2F7KJQ3Q6KPzPMttt_k8qJZ_hsqFh4" \/>/);
    assert.equal((body.match(/name="google-site-verification"/g) || []).length, 1);
  }
});

test('pagination is server-rendered, 24 per page, canonical excludes tracking', () => {
  const cases = Array.from({ length: 49 }, (_, i) => entry(i));
  const first = render('/cases/', cases).body;
  assert.equal((first.match(/class="case-card"/g) || []).length, 24);
  assert.match(first, /rel="next" href="\/cases\/\?page=2"/);
  const second = render('http://localhost:3000/cases/?page=2&utm_source=test', cases).body;
  assert.equal((second.match(/class="case-card"/g) || []).length, 24);
  assert.match(second, /rel="prev" href="\/cases\/"/);
  assert.match(second, /canonical" href="https:\/\/www.xiaoshuotongxue.online\/cases\/\?page=2"/);
  assert.doesNotMatch(second, /utm_source|localhost/);
  assert.equal((render('/cases/?page=3', cases).body.match(/class="case-card"/g) || []).length, 1);
  for (const page of ['0', '-1', '4', 'abc', '1.5', 'Infinity', '9007199254740992']) assert.equal(render(`/cases/?page=${page}`, cases).status, 404);
});

test('category filtering uses tokens and preserves category on pagination; filters noindex', () => {
  const cases = Array.from({ length: 26 }, (_, i) => entry(i, { categories: ['cover', 'render'] }));
  cases.push(entry(90, { categories: 'covering' }));
  const result = render('/cases/?category=cover', cases);
  assert.equal(result.headers['x-robots-tag'], 'noindex, follow');
  assert.equal((result.body.match(/class="case-card"/g) || []).length, 24);
  assert.match(result.body, /href="\/cases\/\?category=cover&amp;page=2"/);
  assert.doesNotMatch(result.body, /sample-90/);
  assert.match(result.body, /rel="canonical" href="https:\/\/www.xiaoshuotongxue.online\/cases\/"/);
  assert.match(render('/cases/?category=unknown', cases).body, /暂无作品/);
  assert.equal(render('/cases/?category=all', cases).headers['x-robots-tag'], undefined);
});

test('detail gate matches script fields and does not expose unpublished or incomplete details', () => {
  for (const key of ['caseKey', 'school', 'journal']) {
    const item = entry(0, { [key]: '' });
    assert.equal(render('/cases/sample-0/', [item]).status, 404, key);
    assert.doesNotMatch(render('/cases/', [item]).body, /href="\/cases\/sample-0\/"/);
    assert.doesNotMatch(render('/sitemap.xml', [item]).body, /<loc>[^<]*\/cases\/sample-0\//);
  }
  for (const extra of [{ detailReviewed: false }, { largeSrc: '', thumbSrc: '' }, { published: false }]) {
    assert.equal(render('/cases/sample-0/', [entry(0, extra)]).status, 404);
  }
  assert.equal(render('/cases/sample-0/', [entry(0, { largeSrc: '' })]).status, 200);
  assert.equal(render('/cases/sample-0/', [entry(0, { thumbSrc: '' })]).status, 200);
  assert.equal(render('/cases/sample-0', [entry()]).status, 200);
});

test('detail contains only factual metadata, full image, breadcrumbs, at most 3 related and contact', () => {
  const result = render('/cases/sample-0/', Array.from({ length: 8 }, (_, i) => entry(i)));
  assert.equal(result.status, 200);
  assert.match(result.body, /class="seo-detail-image" src="\/assets\/cases\/large-0.jpg"/);
  assert.match(result.body, /<a href="\/assets\/cases\/large-0.jpg" aria-label="打开完整作品图片">/);
  assert.match(result.body, /<h1>Institution 0 · Journal · 2025<\/h1>/);
  assert.match(result.body, /<dt>年份<\/dt><dd>2025<\/dd>/);
  assert.match(result.body, /<dt>期刊<\/dt><dd>Journal<\/dd>/);
  assert.match(result.body, /aria-label="面包屑"/);
  assert.equal((result.body.match(/class="case-card"/g) || []).length, 3);
  assert.match(result.body, /href="\/#contact"/);
  assert.match(result.body, /object-fit:contain/);
  const graph = scripts(result.body)[0]['@graph'];
  assert.equal(graph[0]['@type'], 'CreativeWork');
  assert.equal(graph[0].name, 'Institution 0 · Journal · 2025');
  assert.equal(graph[0].description, 'Institution 0 · 2025 · Journal');
  assert.equal(graph[1].itemListElement.length, 3);
  assert.doesNotMatch(result.body, /datePublished|reviewCount|aggregateRating|author|客户姓名/);
});

test('standalone cards are native image links with existing preview attributes, not inert buttons', () => {
  const { body } = render('/cases/', [entry(0, { detailReviewed: false })]);
  assert.match(body, /<a class="case-preview" href="\/assets\/cases\/large-0.jpg" data-large=/);
  assert.match(body, /data-title=/);
  assert.match(body, /class="case-meta"/);
  assert.doesNotMatch(body, /<button|<script src=|href="\/cases\/sample-0\/"/);
});

test('HTML, bootstrap, JSON-LD and XML escape untrusted content; no private fields', () => {
  const attack = '</script><script>alert("x")</script>&\u2028';
  const item = entry(0, { title: attack, background: attack, school: attack, alt: attack,
    largeSrc: 'assets/image.jpg?a=1&b=2', largeAttachment: { file_token: 'PRIVATE_TOKEN' }, privateNote: 'PRIVATE_NOTE' });
  const content = { cases: [item], appSecret: 'PRIVATE_SECRET' };
  const home = render('/', [], { content }).body;
  assert.doesNotMatch(home, /PRIVATE_TOKEN|PRIVATE_NOTE|PRIVATE_SECRET|<script>alert/);
  const initial = JSON.parse(home.match(/id="site-content">([\s\S]*?)<\/script>/)[1]);
  assert.equal(initial.cases[0].school, attack);
  assert.equal(initial.cases[0].alt, `${attack} · Journal · 2025`);
  assert.equal(initial.cases[0].title, undefined);
  const detail = render('/cases/sample-0/', [item]).body;
  assert.doesNotMatch(detail, /<script>alert/);
  assert.equal(scripts(detail)[0]['@graph'][0].name, `${attack} · Journal · 2025`);
  assert.match(detail, /&lt;\/script&gt;/);
  assert.match(render('/sitemap.xml', [item]).body, /a=1&amp;b=2/);
  const unsafe = render('/cases/', [entry(0, { largeSrc: 'javascript:alert(1)', thumbSrc: 'data:text/html,unsafe' })]).body;
  assert.doesNotMatch(unsafe, /javascript:|data:text\/html/);
});

test('robots and sitemap are real typed responses on the fixed canonical host', () => {
  const cases = Array.from({ length: 25 }, (_, i) => entry(i, { detailReviewed: i === 0 }));
  const robots = render('/robots.txt');
  assert.equal(robots.headers['content-type'], 'text/plain; charset=utf-8');
  assert.match(robots.body, /User-agent: \*/);
  assert.match(robots.body, /Allow: \/api\/media/);
  assert.match(robots.body, /Allow: \/api\/asset/);
  assert.ok(robots.body.includes(`Sitemap: ${origin}/sitemap.xml`));
  const sitemap = render('http://attacker.invalid/sitemap.xml', cases);
  assert.equal(sitemap.headers['content-type'], 'application/xml; charset=utf-8');
  assert.match(sitemap.body, /xmlns:image=/);
  assert.match(sitemap.body, /<image:loc>https:\/\/www.xiaoshuotongxue.online\/assets\//);
  assert.match(sitemap.body, /<loc>https:\/\/www.xiaoshuotongxue.online\/cases\/\?page=2<\/loc>/);
  assert.match(sitemap.body, /<loc>https:\/\/www.xiaoshuotongxue.online\/cases\/sample-0\/<\/loc>/);
  assert.doesNotMatch(sitemap.body, /\/cases\/sample-1\/|category=|lastmod|attacker/);
});

test('preview is noindex for all pages, disallows crawling and has empty sitemap', () => {
  for (const path of ['/', '/cases/', '/cases/sample-0/', '/unknown']) {
    const result = render(path, [entry()], { preview: true });
    assert.equal(result.headers['x-robots-tag'], 'noindex, follow');
    assert.match(result.body, /name="robots" content="noindex, follow"/);
  }
  assert.match(render('/robots.txt', [], { preview: true }).body, /Disallow: \/\n/);
  assert.doesNotMatch(render('/sitemap.xml', [entry()], { preview: true }).body, /<url>/);
});

test('unknown pages return real 404; static/API routes remain owned by adapters', () => {
  for (const path of ['/missing', '/missing.html', '/cases/unknown/', '/cases/a/b/', '/cases/%ZZ/', '/cases/unknown.jpg']) {
    const result = render(path);
    assert.equal(result.status, 404, path);
    assert.equal(result.headers['x-robots-tag'], 'noindex, follow');
  }
  for (const path of ['/api/content', '/api/asset?u=a', '/assets/missing.jpg', '/static/app.js', '/script.js', '/styles.css', '/admin.html', '/ocr-tool.html', '/favicon.ico']) assert.equal(render(path), null, path);
  assert.equal(render('/cases/', []).status, 200);
  assert.equal(render('/index.html').status, 200);
  assert.throws(() => renderRoute({ url: '/', content: {} }), /homeHtml/);
});

test('homepage hero uses current public content even without JavaScript', () => {
  const { body } = render('/', [], { content: { cases: [], heroImages: [
    { src: '/api/media?token=public-image&size=large', alt: 'Current "hero"' },
    { src: 'assets/current-second.jpg', alt: 'Second' },
  ] } });
  assert.match(body, /class="hero-showcase-image hero-showcase-main" src="\/api\/media\?token=public-image&amp;size=large" alt="Current &quot;hero&quot;"/);
  assert.match(body, /class="hero-showcase-image hero-showcase-side" src="\/assets\/current-second.jpg" alt="Second"/);
  assert.match(body, /src="\/assets\/hero\/homepage-card-03.jpg"/);
});

test('legacy descriptions never appear in cards, detail, bootstrap or schema', () => {
  const forbidden = {
    title: 'OLD_TITLE_SENTINEL', description: 'OLD_DESCRIPTION_SENTINEL',
    background: 'OLD_BACKGROUND_SENTINEL', challenge: 'OLD_CHALLENGE_SENTINEL',
    approach: 'OLD_APPROACH_SENTINEL', researchArea: 'OLD_AREA_SENTINEL',
    deliverables: ['OLD_DELIVERY_SENTINEL'], alt: 'OLD_ALT_SENTINEL',
  };
  const item = entry(0, forbidden);
  for (const path of ['/', '/cases/', '/cases/sample-0/', '/sitemap.xml']) {
    const { body, status } = render(path, [item]);
    assert.equal(status, 200);
    for (const value of Object.values(forbidden).flat()) assert.ok(!body.includes(value), `${path}: ${value}`);
  }
  const home = render('/', [item]).body;
  const initial = JSON.parse(home.match(/id="site-content">([\s\S]*?)<\/script>/)[1]);
  for (const key of Object.keys(forbidden).filter(key => key !== 'alt')) assert.equal(initial.cases[0][key], undefined, key);
  assert.equal(initial.cases[0].alt, 'Institution 0 · Journal · 2025');
  assert.deepEqual(Object.keys(initial.cases[0]).sort(), ['alt', 'caseKey', 'categories', 'detailReviewed', 'journal', 'largeSrc', 'school', 'thumbSrc', 'year']);
  const listing = render('/cases/', [item]).body;
  assert.match(listing, /Institution 0 · Journal · 2025 · 查看案例/);
  assert.equal(scripts(listing)[0].mainEntity.itemListElement[0].name, 'Institution 0 · Journal · 2025');
  assert.doesNotMatch(listing, /<em>/);
});

test('minimal reviewed cases need no title, long copy or year, and explicit year is supported', () => {
  const minimal = entry(0, { journal: 'Provided journal' });
  assert.equal(render('/cases/sample-0/', [minimal]).status, 200);
  assert.doesNotMatch(render('/cases/sample-0/', [minimal]).body, /<dt>年份<\/dt>/);
  assert.match(render('/cases/', [minimal]).body, /href="\/cases\/sample-0\/"/);
  assert.match(render('/sitemap.xml', [minimal]).body, /<loc>[^<]*\/cases\/sample-0\//);
  const withYear = entry(0, { journal: 'Provided journal', year: 2024 });
  assert.match(render('/cases/sample-0/', [withYear]).body, /<dt>年份<\/dt><dd>2024<\/dd>/);
  assert.match(render('/cases/', [withYear]).body, /<span>2024<\/span>/);
  assert.match(render('/cases/sample-0/', [withYear]).body, /content="Institution 0 · 2024 · Provided journal"/);
});

test('year extraction separates combined journal facts and respects explicit year', () => {
  for (const journal of ['Journal · 2023', '2023 | Journal', 'Journal / 2023', 'Journal - 2023']) {
    const { body, status } = render('/cases/sample-0/', [entry(0, { journal })]);
    assert.equal(status, 200);
    assert.match(body, /<dt>年份<\/dt><dd>2023<\/dd>/);
    assert.match(body, /<dt>期刊<\/dt><dd>Journal<\/dd>/);
    assert.equal(scripts(body)[0]['@graph'][0].description, 'Institution 0 · 2023 · Journal');
  }
  const explicit = render('/cases/sample-0/', [entry(0, { journal: 'Journal · 2023', year: '2024' })]).body;
  assert.match(explicit, /<dt>年份<\/dt><dd>2024<\/dd>/);
  assert.match(explicit, /<dt>期刊<\/dt><dd>Journal<\/dd>/);
  const unknown = render('/cases/sample-0/', [entry(0, { journal: 'Journal 12023' })]).body;
  assert.doesNotMatch(unknown, /<dt>年份<\/dt>/);
});
