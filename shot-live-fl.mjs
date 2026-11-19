import { chromium } from 'playwright';
const b = await chromium.launch();
const d = await b.newPage({ viewport: { width: 1280, height: 900 } });
await d.goto('https://access-studio.vercel.app/', { waitUntil: 'networkidle' });
await d.screenshot({ path: '/tmp/live-fl-d.png' });
await b.close(); console.log('done');
