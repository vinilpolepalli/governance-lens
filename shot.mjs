import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const base = 'http://127.0.0.1:8901';
for (const [path, name] of [['/', 'v2-home'], ['/company/tsla', 'v2-tsla'], ['/compare', 'v2-compare']]) {
  await p.goto(base + path, { waitUntil: 'networkidle' });
  await p.screenshot({ path: '/tmp/gl-' + name + '.png', fullPage: false });
}
await b.close();
console.log('done');
