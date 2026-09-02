// Clicks through the built app in a real browser and reports every console
// error. Vitest runs in jsdom and therefore misses exactly the things a real
// browser does do — hence this.
//
//   npm run build && node smoke.mjs [--shots]
//
// Not part of CI: that saves fetching a hundred-megabyte browser on every build.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const SHOTS = process.argv.includes('--shots');
const PAGE = readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8');

const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(PAGE);
}).listen(4321);

// PLAYWRIGHT_CHROMIUM lets you point at a browser that is already there, so you
// do not have to put another hundred megabytes next to it.
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
);
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shot = (name) => (SHOTS ? page.screenshot({ path: `/tmp/pay-${name}.png`, fullPage: true }) : null);

await page.goto('http://localhost:4321/');
await page.getByRole('button', { name: /zonder account/i }).first().click();

// The vault stays shut until you set a passphrase. That doubles as a check on
// the heaviest computation in the app: PBKDF2 with 310,000 rounds, in a real
// browser.
await page.getByLabel('Wachtwoordzin').fill('zes wilde ganzen boven de dijk');
await page.getByLabel('Nog een keer').fill('zes wilde ganzen boven de dijk');
await shot('unlock');
await page.getByRole('button', { name: 'Instellen' }).click();
await page.waitForTimeout(1200);

await page.getByRole('button', { name: /Meer/ }).click();
await page.getByRole('button', { name: /voorbeeldhuishouden/i }).click();
await page.waitForTimeout(400);

for (const tab of ['Overzicht', 'Lasten', 'Verrekenen', 'Mensen']) {
  await page.getByRole('button', { name: new RegExp(tab) }).click();
  await page.waitForTimeout(200);
  await shot(tab.toLowerCase());
}

// Open an expense and close it again.
await page.getByRole('button', { name: /Lasten/ }).click();
await page.getByText('Streamingdienst').first().click();
await page.waitForTimeout(200);
await shot('expense');
await page.getByRole('button', { name: 'Sluiten' }).click();

// And the screen you actually start on: filling in a blank expense.
await page.getByRole('button', { name: 'Nieuwe post' }).click();
await page.getByPlaceholder(/Energie, internet/).fill('Krant');
await page.getByPlaceholder('0,00').fill('12,50');
await page.waitForTimeout(150);
await shot('new');

// The sheet has to fit the space you can actually see. On iOS the keyboard
// does not shrink the viewport dvh is measured against, so a sheet sized in dvh
// keeps its full height and everything below the fold — the save button
// included — ends up behind the keyboard, unreachable. Fake that here.
const KEYBOARD = 340;
await page.evaluate((keyboard) => {
  const vv = window.visualViewport;
  Object.defineProperty(vv, 'height', { value: window.innerHeight - keyboard, configurable: true });
  vv.dispatchEvent(new Event('resize'));
}, KEYBOARD);
await page.waitForTimeout(150);
const reachable = await page.evaluate((keyboard) => {
  const visible = window.innerHeight - keyboard;
  const body = document.querySelector('.sheet-body');
  body.scrollTop = body.scrollHeight;
  const save = [...document.querySelectorAll('.sheet button')].find((b) => b.textContent.trim() === 'Bewaren');
  return {
    bottom: Math.round(document.querySelector('.sheet').getBoundingClientRect().bottom),
    visible,
    saveBottom: save ? Math.round(save.getBoundingClientRect().bottom) : null,
  };
}, KEYBOARD);
if (reachable.bottom > reachable.visible + 1) {
  errors.push(`sheet runs to ${reachable.bottom} with only ${reachable.visible} visible`);
}
if (reachable.saveBottom === null || reachable.saveBottom > reachable.visible + 1) {
  errors.push(`"Bewaren" not reachable with the keyboard up (${reachable.saveBottom})`);
}

// Whatever is left in the browser should be unreadable.
const stored = await page.evaluate(() => localStorage.getItem('pay:store') || '');
for (const word of ['Energie', 'Internet', 'Partner', 'Krant']) {
  if (stored.includes(word)) errors.push(`"${word}" is readable in localStorage`);
}

await browser.close();
server.close();

if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('Clicked through without errors.');
