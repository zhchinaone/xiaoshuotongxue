# SEO case pages

## Version checkpoints

- Pre-SEO baseline: `5238e6f` on `main`.
- Develop and validate on `codex/seo-cases` before merging to `main`.
- DNS, the forwarding Worker and the `work` subdomain are unchanged.

## Content workflow

Manage cases in Feishu or `/admin.html`. Public cases show artwork, school and journal/year only. To publish a detail page, provide the school, journal/year and an image, then check the review field after confirming facts and publication rights. Titles and search summaries are generated from these facts; long descriptions are not required or published. Existing descriptive fields are preserved for compatibility but hidden in the editor. Never change a published case key.

New Feishu fields: 案例键, 案例标题, 研究领域, 研究背景, 表达难点, 绘图思路, 交付内容, 详情已审核, 缩略图原图标识. Exact schema names are defined in `functions/_shared/site.js`.

The public snapshot expires after five minutes. Admin saves invalidate the current process snapshot; other edge instances refresh at expiry. No long-lived HTML cache is added. Content-read failure returns 503 rather than a different set of default artworks.

Preview deployments are read-only: POST /api/content returns 403, so review cannot accidentally modify the production Feishu tables. Make content edits in Feishu or the existing production admin instead.

New uploads retain their original large file and generate WebP thumbnails. A thumbnail is used with a large attachment only when its recorded source token matches that attachment. Replacing a large file directly in Feishu therefore uses the new original until a matching thumbnail is uploaded. No existing thumbnail is silently certified as matching.

## Migration and tests

`node scripts/migrate-seo.mjs` backs up Feishu tables to ignored `backups/` and prints a dry run. `--apply` adds missing fields and persists missing case keys without changing review status. Keep the backup outside the public site.

Run `node --test seo/render.test.mjs tests/*.test.mjs`, `npm run build:pages`, and Wrangler Pages Functions compilation. The browser check is `node scripts/check-seo-browser.cjs`; set `TEST_URL`, `PLAYWRIGHT_PATH` and optionally `CHROME_PATH` for the local environment. Screenshots stay in ignored `backups/seo-checks/`.

## Release checks

Preview branches must return noindex and a disallowing robots file. Check HTML without JavaScript, pagination, image loading, canonical URLs, XML sitemap, and true 404/503 statuses. Production canonical URLs always use `https://www.xiaoshuotongxue.online`; do not redirect the upstream pages.dev host back through the forwarding Worker.

Before production promotion, check the Cloudflare account's Functions quota in the dashboard. No paid plan is automatically enabled. Submit `/sitemap.xml` only after the owner verifies the site in webmaster platforms; submission and ranking are not guaranteed by deployment.

Rollback code using the previous Cloudflare deployment or a Git revert, not a destructive reset. Added Feishu fields and stable keys are additive and can remain when rolling back code. Restore content from backup only if a separate data correction is needed.
