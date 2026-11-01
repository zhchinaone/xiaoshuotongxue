const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const base = process.env.TEST_URL || 'http://localhost:3107';
  fs.mkdirSync('backups/seo-checks', { recursive: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, javaScriptEnabled: false });
    for (const route of ['/', '/cases/']) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      assert.ok(await page.locator('.case-card').count() > 0);
      assert.ok(await page.locator('link[rel=canonical]').count());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `backups/seo-checks/${viewport.width}-${route === '/' ? 'home' : 'cases'}.png`, fullPage: true });
    }
    assert.equal((await page.goto(base + '/cases/does-not-exist/')).status(), 404);
    await page.close();
  }
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('.case-preview').first().click();
  await page.waitForSelector('.lightbox.is-open');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('Desktop/mobile no-JS, canonical, 404 and lightbox checks passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
