import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(resolve(root, '.env'));
const keys = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_BITABLE_APP_TOKEN', 'FEISHU_HERO_TABLE_NAME', 'FEISHU_WORKS_TABLE_NAME'];
const values = Object.fromEntries(keys.map(key => [key, process.env[key] || '']));
for (const key of keys.slice(0, 3)) if (!values[key]) throw new Error(`Missing local configuration: ${key}`);
values.FEISHU_HERO_TABLE_NAME ||= '首页主视觉';
values.FEISHU_WORKS_TABLE_NAME ||= '作品库';
console.log('Target: Cloudflare Pages xiaoshuotongxue / preview only');
console.log(`Configuration keys: ${keys.join(', ')}`);
if (!process.argv.includes('--apply')) {
  console.log('Dry run: no credentials transmitted. Use --apply after Wrangler authorization.');
} else {
  const cli = process.env.WRANGLER_CLI_PATH;
  if (!cli) throw new Error('WRANGLER_CLI_PATH must point to the official installed Wrangler CLI');
  const child = spawn(process.execPath, [cli, 'pages', 'secret', 'bulk', '--project-name', 'xiaoshuotongxue', '--env', 'preview'], {
    cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['pipe', 'inherit', 'inherit'],
  });
  child.stdin.end(JSON.stringify(values));
  child.on('error', () => { console.error('Unable to start Wrangler'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
