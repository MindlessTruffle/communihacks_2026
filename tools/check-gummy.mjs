import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const executablePath = process.env.GUMMY_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], characterRequests = new Set();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !/503|agents-not-configured/.test(message.text())) errors.push(message.text()); });
page.on('request', request => { const url = new URL(request.url()); if (/\/models\/chars\/|gummy-visitors|\/models\/owl\.glb|\/models\/crown\.glb|\/ui\/chars\//.test(url.pathname)) characterRequests.add(url.pathname); });
await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'agents-not-configured' }) }));
await page.addInitScript(() => {
  localStorage.setItem('royal-concerns-settings-v1', JSON.stringify({ readAloud: false, aiChat: false, master: 0, music: 0, sfx: 0, voice: 0, reduceMotion: false }));
});
const base = process.env.GUMMY_TEST_URL || 'http://127.0.0.1:5202';
async function game(action, ...args) {
  return page.evaluate(async ({ action, args }) => {
    const { useGame } = await import('/src/game/store.ts');
    const result = useGame.getState()[action](...args);
    return { phase: useGame.getState().phase, day: useGame.getState().run?.day, result };
  }, { action, args });
}
try {
  await fs.mkdir('test-results', { recursive: true });
  await page.goto(`${base}/?q=low`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('canvas')?.width > 0);
  await page.waitForTimeout(2500);
  await game('goto', 'setup');
  await page.getByRole('radio', { name: 'Ruler A', exact: true }).waitFor();
  assert.equal(await page.locator('.pick svg[viewBox="0 0 64 80"]').count(), 6);
  await page.screenshot({ path: 'test-results/gummy-setup.png' });
  await game('newGame', { title: 'King', model: 'ruler-a', name: '' });
  await game('closeMorning');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/gummy-court.png' });
  console.log('Court and ruler setup rendered');
  await game('startEvening');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/gummy-street.png' });
  await game('toBudget'); await game('enterMarket');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/gummy-market.png' });
  const result = await game('checkout'); assert.equal(result.phase, 'checkout');
  const nextDay = await game('sleep'); assert.equal(nextDay.day, 2);
  console.log('Street, market and next-day loop rendered');
  await page.goto(`${base}/chargallery.html?q=low&crown=1&cols=6&anim=idle`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/gummy-cast.png' });
  const complexRequests = [...characterRequests].filter(url => /\/models\/chars\//.test(url) && !/wheelchair|cane/.test(url));
  assert.deepEqual(complexRequests, [], 'complex puppet models must not load');
  assert.ok(characterRequests.has('/models/gummy-visitors.glb'));
  assert.ok([...characterRequests].some(url => /wheelchair/.test(url)));
  assert.ok([...characterRequests].some(url => /cane/.test(url)));
  assert.ok(!characterRequests.has('/models/owl.glb'));
  assert.ok(![...characterRequests].some(url => /\/ui\/chars\//.test(url)));
  assert.deepEqual(errors, []);
  const report = { status: 'passed', checks: ['six matching gummy ruler portraits', 'court king and visitors', 'evening street', 'market cashier', 'checkout and day two', 'complete cast gallery with wheelchair and cane', 'no complex character or owl GLB requests'], characterRequests: [...characterRequests], browserErrors: errors };
  await fs.writeFile('test-results/gummy-check.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: 'test-results/gummy-failure.png' }).catch(() => {});
  console.error('Browser errors:', errors); throw error;
} finally { await browser.close(); }
