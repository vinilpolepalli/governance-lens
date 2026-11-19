import { chromium } from 'playwright';
const b = await chromium.launch();
const d = await b.newPage({ viewport: { width: 1280, height: 900 } });
await d.goto('http://127.0.0.1:8941/', { waitUntil: 'networkidle' });
await d.screenshot({ path: '/tmp/mg-d.png', fullPage: true });
await b.close(); console.log('done');
