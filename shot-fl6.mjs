import { chromium } from 'playwright';
const b = await chromium.launch();
const d = await b.newPage({ viewport: { width: 1280, height: 900 } });
await d.goto('http://127.0.0.1:8925/', { waitUntil: 'networkidle' });
const links = await d.locator('td a').count();
console.log('links', links);
if (links) { await d.locator('td a').first().click(); await d.waitForTimeout(400); }
await d.screenshot({ path: '/tmp/fl6-d-selected.png' });
await d.getByText('Practice admin', { exact: true }).click().catch(e => console.log('role-skip'));
await d.waitForTimeout(400);
await d.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await d.waitForTimeout(300);
await d.screenshot({ path: '/tmp/fl6-d-audit.png' });
await b.close(); console.log('done');
