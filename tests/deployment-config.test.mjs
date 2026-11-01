import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPublicContent } from '../functions/_shared/content.js';
import { onRequestGet } from '../functions/api/content.js';

test('deployed environments never silently publish sample artwork without Feishu', async () => {
  for (const env of [{ CF_PAGES_BRANCH: 'main' }, { CF_PAGES_BRANCH: 'codex/seo-cases' }, { CF_PAGES: '1' }]) {
    const request = new Request('https://example.test/api/content');
    await assert.rejects(loadPublicContent(env, request), /configuration missing/);
    const response = await onRequestGet({ env, request });
    assert.equal(response.status, 503);
    const data = await response.json();
    assert.equal(data.ok, false);
    assert.equal(data.content, undefined);
  }
});

test('offline local development can still use the bundled fixtures', async () => {
  const content = await loadPublicContent({}, new Request('http://localhost/'));
  assert.ok(Array.isArray(content.cases));
});
