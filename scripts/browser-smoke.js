// Optional integration check. Supply an installed Playwright module path and
// a Chromium executable path; neither is a dependency of the extension.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const [modulePath, executablePath] = process.argv.slice(2);
if (!modulePath || !executablePath) throw new Error('Usage: node scripts/browser-smoke.js <playwright/index.mjs> <chromium executable>');
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const profile = await mkdtemp(join(tmpdir(), 'browser-tracker-smoke-'));
const extension = resolve('.');
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Tracker fixture</title><h1>Focused test website</h1><button onclick="document.documentElement.requestFullscreen()">Fullscreen</button>');
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, executablePath,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.bringToFront();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Fullscreen' }).click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForTimeout(300);
  await worker.evaluate(() => chrome.action.openPopup());
  await page.waitForTimeout(1200);
  const duringPopup = await worker.evaluate(async () => (await chrome.storage.local.get('tracker')).tracker);
  assert.equal(duringPopup.active?.domain, '127.0.0.1', 'opening action popup should retain the active site');
  await page.bringToFront();
  await page.goto(`chrome-extension://${id}/src/ui/dashboard.html`);
  await page.getByRole('button', { name: 'Pause tracking' }).waitFor();
  assert.equal(await page.locator('#error').isVisible(), false);
  const snapshot = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'snapshot' }));
  assert.equal(snapshot.ok, true);
  const entries = Object.values(snapshot.state.days).flatMap(day => Object.values(day));
  assert.ok(entries.some(site => site.totalMs > 0), 'focused website should accumulate time');
  assert.ok(entries.some(site => site.fullscreenMs > 0), 'DOM fullscreen should accumulate time');
  await page.getByRole('button', { name: 'Pause tracking' }).click();
  await page.getByRole('button', { name: 'Resume tracking' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Resume tracking' }).waitFor();
  assert.equal(await page.locator('#clear, #profile-form, #confirm').count(), 0);
  await page.screenshot({ path: join(profile, 'dashboard.png'), fullPage: true });
  assert.ok(await page.locator('#sites .site').count() > 0);
  await page.goto(`chrome-extension://${id}/src/ui/popup.html`);
  await page.getByRole('button', { name: 'Resume tracking' }).waitFor();
  assert.equal(await page.locator('#error').isVisible(), false);
  await page.setViewportSize({ width: 440, height: 720 });
  await page.screenshot({ path: join(profile, 'popup.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`Browser smoke passed: focused time, fullscreen, tracking after action.openPopup, dashboard, persisted pause, removed controls. Screenshots: ${profile}`);
} finally {
  await context?.close();
  server.close();
}
