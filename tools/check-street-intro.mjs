import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', r => r.fulfill({ status: 503, body: '{}' }));
await page.addInitScript(() => localStorage.setItem('royal-concerns-settings-v1', JSON.stringify({ readAloud: false, aiChat: false, master: 0, music: 0, sfx: 0, voice: 0 })));
async function game(action, ...args) { return page.evaluate(async ({ action, args }) => (await import('/src/game/store.ts')).useGame.getState()[action](...args), { action, args }); }
try {
  await fs.mkdir('test-results', { recursive: true });
  await page.goto('http://127.0.0.1:5208/?q=low', { waitUntil: 'networkidle', timeout: 120000 });
  await game('newGame', { title: 'Ruler', model: 'ruler-a', name: '' }); await game('closeMorning'); await game('startEvening');
  await page.locator('.street-movement-intro.visible').waitFor();
  assert.equal(await page.locator('.movement-keycaps kbd').count(), 4);
  assert.equal(await page.locator('.street-walk-hint').count(), 0, 'no duplicate small hint');
  await page.keyboard.press('n');
  assert.equal(await page.locator('.street-movement-intro.visible').count(), 1, 'non-movement key does not dismiss');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/street-movement-intro.png', animations: 'disabled' });
  await page.keyboard.down('w');
  await page.locator('.street-movement-intro.fading').waitFor({ state: 'attached' });
  const duration = await page.locator('.street-movement-intro').evaluate(el => getComputedStyle(el).transitionDuration);
  assert.equal(duration, '0.4s', 'uses opacity fade');
  await page.keyboard.up('w');
  await page.locator('.street-movement-intro').waitFor({ state: 'detached' });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.street-movement-intro').count(), 0, 'does not reappear after stopping');
  await game('sleep'); await game('closeMorning'); await game('startEvening');
  await page.locator('.street-movement-intro.visible').waitFor();
  await page.keyboard.press('ArrowRight');
  await page.locator('.street-movement-intro').waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  console.log('PASS: large street intro, four keys, no duplicate hint, movement-key-only dismissal, fade, no reappearance after stopping, returns next day, arrow keys, no page errors');
} finally { await browser.close(); }
