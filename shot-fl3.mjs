import { chromium } from 'playwright';
const b = await chromium.launch();
const d = await b.newPage({ viewport: { width: 1280, height: 900 } });
await d.goto('http://127.0.0.1:8917/', { waitUntil: 'networkidle' });
await d.click('a:has-text("Patient A")');
await d.waitForTimeout(400);
await d.screenshot({ path: '/tmp/fl3-d-selected.png' });
await b.close(); console.log('done');
