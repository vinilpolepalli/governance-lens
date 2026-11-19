import { chromium } from 'playwright';
const b = await chromium.launch();
const d = await b.newPage({ viewport: { width: 1280, height: 900 } });
await d.goto('http://127.0.0.1:8921/', { waitUntil: 'networkidle' });
await d.screenshot({ path: '/tmp/fl4-d.png' });
try { await d.click('a:has-text("Patient A")', { timeout: 5000 }); await d.waitForTimeout(400); } catch(e) { console.log('click-skip', e.message.slice(0,80)); }
await d.screenshot({ path: '/tmp/fl4-d-selected.png' });
await b.close(); console.log('done');
