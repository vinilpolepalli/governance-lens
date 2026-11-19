import { chromium } from 'playwright';
const b = await chromium.launch();
const d = await b.newPage({ viewport: { width: 1280, height: 900 } });
await d.goto('https://service-flow-vinilpolepallis-projects.vercel.app', { waitUntil: 'networkidle' });
await d.getByText('Omar Siddiqui').first().click();
await d.waitForTimeout(400);
await d.screenshot({ path: '/tmp/bel-d-detail.png' });
await b.close(); console.log('done');
