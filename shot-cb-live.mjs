import { chromium } from 'playwright';
const b = await chromium.launch();
const d = await b.newPage({ viewport: { width: 1280, height: 900 } });
await d.goto('https://care-budget-vinilpolepallis-projects.vercel.app', { waitUntil: 'networkidle' });
await d.screenshot({ path: '/tmp/cbl-d.png', fullPage: true });
const m = await b.newPage({ viewport: { width: 390, height: 844 } });
await m.goto('https://care-budget-vinilpolepallis-projects.vercel.app', { waitUntil: 'networkidle' });
await m.screenshot({ path: '/tmp/cbl-m.png' });
await b.close(); console.log('done');
