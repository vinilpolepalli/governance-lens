import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
for (const [path, name] of [['/', 'm-home'], ['/company/tsla', 'm-tsla']]) {
  await p.goto('http://127.0.0.1:8901' + path, { waitUntil: 'networkidle' });
  await p.screenshot({ path: '/tmp/gl-' + name + '.png' });
}
await b.close(); console.log('done');
