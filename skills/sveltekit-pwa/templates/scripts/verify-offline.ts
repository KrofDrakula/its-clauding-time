// Proves that the production build works offline. Start the server first:
//
//   pnpm build && node server.js        (port 3000)
//   node scripts/verify-offline.ts [url]
//
// It loads the app in headless Chromium, waits for the service worker to take
// control, goes offline, reloads and checks that the page still renders.
// `localhost` counts as a secure origin; a plain-HTTP host name does not.
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3000/';
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(url);
await page.evaluate(() => navigator.serviceWorker.ready);
// The worker claims the page after install; wait until it controls it.
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
const caches = await page.evaluate(() => globalThis.caches.keys());
console.log('caches:', caches.join(', '));

await context.setOffline(true);
const response = await page.reload();
const body = await page.locator('body').innerText();
await browser.close();

if (!response?.ok() || body.trim() === '') {
  console.error(`FAIL: offline reload gave status ${response?.status()} and an empty body`);
  process.exit(1);
}
console.log(`PASS: offline reload gave status ${response.status()} and rendered ${body.length} characters`);
