const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
async function main() {
  const base = process.env.TEST_URL || 'http://localhost:3107';
  const proxy = base.startsWith('https:') ? process.env.HTTPS_PROXY : '';
  const browser = await chromium.launch({ headless: true, ...(proxy ? { proxy: { server: proxy } } : {}), ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
  fs.mkdirSync('backups/seo-checks', { recursive: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, javaScriptEnabled: false });
    for (const route of ['/', '/cases/']) {
      const response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
      assert.equal(response.status(), 200);
      assert.ok(await page.locator('.case-card').count() > 0);
      assert.ok(await page.locator('link[rel=canonical]').count());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('.case-card').first().scrollIntoViewIfNeeded();
      let loaded = false;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        loaded = await page.locator('.case-card img').first().evaluate(image => image.complete && image.naturalWidth > 0);
        if (loaded) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      assert.ok(loaded, 'First artwork must decode successfully');
      await page.screenshot({ path: `backups/seo-checks/${viewport.width}-${route === '/' ? 'home' : 'cases'}.png`, fullPage: true });
    }
    assert.equal((await page.goto(base + '/cases/does-not-exist/')).status(), 404);
    await page.close();
  }
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('.case-preview').first().click();
  await page.waitForSelector('.lightbox.is-open');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log('Desktop/mobile no-JS, canonical, 404 and lightbox checks passed.');
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
