// Klikt de gebouwde app door in een echte browser en meldt elke fout in de
// console. Vitest draait in jsdom en mist daardoor precies de dingen die een
// echte browser wél doet — vandaar deze.
//
//   npm run build && node smoke.mjs [--shots]
//
// Draait niet mee in CI: dat scheelt bij elke build een browser van honderd MB.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const SHOTS = process.argv.includes('--shots');
const PAGINA = readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8');

const server = createServer((_verzoek, antwoord) => {
  antwoord.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  antwoord.end(PAGINA);
}).listen(4321);

// PLAYWRIGHT_CHROMIUM laat je een browser aanwijzen die er al staat, zodat je
// er niet nog eens honderd megabyte naast hoeft te zetten.
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
);
const pagina = await browser.newPage({ viewport: { width: 420, height: 900 } });

const fouten = [];
pagina.on('pageerror', (e) => fouten.push(String(e)));
pagina.on('console', (m) => m.type() === 'error' && fouten.push(m.text()));

const kiek = (naam) => (SHOTS ? pagina.screenshot({ path: `/tmp/pay-${naam}.png`, fullPage: true }) : null);

await pagina.goto('http://localhost:4321/');
await pagina.getByRole('button', { name: /zonder account/i }).first().click();

await pagina.getByRole('button', { name: /Meer/ }).click();
await pagina.getByRole('button', { name: /voorbeeldhuishouden/i }).click();
await pagina.waitForTimeout(300);

for (const tab of ['Overzicht', 'Lasten', 'Verrekenen', 'Mensen']) {
  await pagina.getByRole('button', { name: new RegExp(tab) }).click();
  await pagina.waitForTimeout(200);
  await kiek(tab.toLowerCase());
}

// Een post openen en weer sluiten.
await pagina.getByRole('button', { name: /Lasten/ }).click();
await pagina.getByText('Streamingdienst').first().click();
await pagina.waitForTimeout(200);
await kiek('post');
await pagina.getByRole('button', { name: 'Sluiten' }).click();

// En het scherm waar je in het echt begint: een lege post invullen.
await pagina.getByRole('button', { name: 'Nieuwe post' }).click();
await pagina.getByPlaceholder(/Energie, internet/).fill('Krant');
await pagina.getByPlaceholder('0,00').fill('12,50');
await pagina.waitForTimeout(150);
await kiek('nieuw');

await browser.close();
server.close();

if (fouten.length) {
  console.error('Fouten in de console:\n' + fouten.join('\n'));
  process.exit(1);
}
console.log('Doorgeklikt zonder fouten.');
