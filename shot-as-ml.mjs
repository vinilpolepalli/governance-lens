import { chromium } from 'playwright';
const b = await chromium.launch();
const m = await b.newPage({ viewport: { width: 390, height: 844 } });
await m.goto('https://ops-desk-vinilpolepallis-projects.vercel.app', { waitUntil: 'networkidle' });
await m.screenshot({ path: '/tmp/asl-m.png' });
await b.close(); console.log('done');
