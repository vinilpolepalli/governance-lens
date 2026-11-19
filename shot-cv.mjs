import { chromium } from 'playwright';
const b = await chromium.launch();
const d = await b.newPage({ viewport: { width: 1280, height: 900 } });
await d.goto('http://127.0.0.1:8951/', { waitUntil: 'networkidle' });
await d.screenshot({ path: '/tmp/cv-d.png', fullPage: true });
const m = await b.newPage({ viewport: { width: 390, height: 844 } });
await m.goto('http://127.0.0.1:8951/', { waitUntil: 'networkidle' });
await m.screenshot({ path: '/tmp/cv-m.png' });
await b.close(); console.log('done');
