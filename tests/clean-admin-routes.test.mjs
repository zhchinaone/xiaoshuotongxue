import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRoute } from '../seo/render.mjs';
import { onRequest } from '../functions/_middleware.js';

test('clean and legacy tool URLs remain static and noindex after Pages redirects', async () => {
  for (const path of ['/admin', '/admin/', '/admin.html', '/ocr-tool', '/ocr-tool.html']) {
    const url = new URL(path, 'https://example.test');
    assert.equal(renderRoute({ url }), null);
    const response = await onRequest({ request: new Request(url), env: {}, next: async () => new Response('<html>Admin</html>') });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  }
});
