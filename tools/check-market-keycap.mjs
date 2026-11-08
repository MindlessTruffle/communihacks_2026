import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', r => r.fulfill({ status: 503, body: '{}' }));
await page.addInitScript(() => localStorage.setItem('royal-concerns-settings-v1', JSON.stringify({ readAloud: false, aiChat: false, master: 0, music: 0, sfx: 0, voice: 0 })));
try {
  await fs.mkdir('test-results', { recursive: true });
  await page.goto('http://127.0.0.1:5209/?q=low', { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(async () => {
    const { useGame } = await import('/src/game/store.ts');
    useGame.getState().newGame({ title: 'Ruler', model: 'ruler-a', name: '' });
    useGame.getState().closeMorning(); useGame.getState().toBudget(); useGame.getState().enterMarket();
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    window.keycapRoot = () => _roots.get(document.querySelector('canvas')).store.getState();
    window.keycapGame = useGame;
  });
  await page.waitForFunction(() => !!window.keycapRoot().scene.getObjectByName('MarketShopkeeper'));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.keycapRoot().camera.position.set(0, 1.55, -21));
  const pay = page.getByRole('button', { name: /Pay at the counter/ });
  await pay.waitFor();
  for (const [width, height] of [[1280, 800], [2048, 1085]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { document.documentElement.dataset.input = 'mouse'; window.dispatchEvent(new Event('rc-device')); });
    const cap = pay.locator('kbd.keyboard-wide');
    await cap.waitFor(); assert.equal(await cap.textContent(), 'Space');
    const dimensions = await cap.evaluate(el => {
      const key = el.getBoundingClientRect(), parent = el.closest('button').getBoundingClientRect();
      return { width: key.width, height: key.height, fitsText: el.scrollWidth <= el.clientWidth, inside: key.left >= parent.left && key.right <= parent.right && key.top >= parent.top && key.bottom <= parent.bottom };
    });
    assert.ok(dimensions.width > dimensions.height * 1.7, 'Space key has wide proportions');
    assert.ok(dimensions.fitsText && dimensions.inside, 'label fits inside keycap and prompt');
    assert.equal(await cap.locator('img').count(), 0, 'not vulnerable to button icon-image rules');
    await page.screenshot({ path: `test-results/market-space-${width}.png`, animations: 'disabled' });
  }
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.keycapGame.getState().phase === 'checkout');
  assert.deepEqual(errors, []);
  console.log('PASS: readable wide Space keycap, no clipping at both PC sizes, Space activates checkout, no page errors');
} finally { await browser.close(); }
