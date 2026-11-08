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
  await page.goto(`${process.env.GUMMY_TEST_URL || 'http://127.0.0.1:5210'}/?q=low`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(async () => {
    const { useGame } = await import('/src/game/store.ts'); window.badgeGame = useGame;
    useGame.getState().newGame({ title: 'Ruler', model: 'ruler-a', name: '' });
    useGame.getState().closeMorning();
    useGame.setState(s => ({ run: { ...s.run, queue: ['kid_question'] }, courtStep: 'ask' }));
  });
  await page.locator('.thought .btn.yes').waitFor();
  for (const [width, height] of [[1280, 800], [2048, 1085]]) {
    await page.setViewportSize({ width, height });
    for (const [input, scale] of [['mouse', 1], ['', 1], ['mouse', 1.3]]) {
      await page.evaluate(scale => window.badgeGame.getState().setSettings({ textScale: scale }), scale);
      await page.evaluate(input => { document.documentElement.dataset.input = input; window.dispatchEvent(new Event('rc-device')); }, input);
      await page.waitForFunction(() => document.querySelectorAll('.thought .decision-key img').length === 2 && [...document.querySelectorAll('.thought .decision-key img')].every(img => img.complete && img.naturalWidth));
      const badges = await page.locator('.thought .decision-key').evaluateAll(elements => elements.map(el => {
        const img = el.querySelector('img'), bounds = el.getBoundingClientRect(), label = el.querySelector('b');
        const range = document.createRange(); range.selectNodeContents(label);
        const text = range.getBoundingClientRect(), font = parseFloat(getComputedStyle(label).fontSize);
        const choiceLabel = el.closest('.choice').querySelector('.lbl').getBoundingClientRect();
        return { src: img.getAttribute('src'), text: el.textContent, width: bounds.width, height: bounds.height, font, fits: text.left >= bounds.left - 1 && text.right <= bounds.right + 1 && text.top >= bounds.top - 1 && text.bottom <= bounds.bottom + 1, avoidsLabel: text.bottom <= choiceLabel.top + 1 };
      }));
      assert.deepEqual(badges.map(b => b.src), ['/ui/icons/keysmall.png', '/ui/icons/keysmall.png']);
      assert.deepEqual(badges.map(b => b.text), ['Y', 'N']);
      assert.ok(badges.every(b => b.fits && b.avoidsLabel && Math.abs(b.width - b.height) < 1), JSON.stringify(badges));
      assert.ok(badges.every(b => Math.abs(b.font - 16 * scale) < .5), 'badge letter uses its own readable size, not the large button font');
    }
    await page.screenshot({ path: `test-results/decision-badges-${width}.png`, animations: 'disabled' });
  }
  await page.evaluate(() => { document.documentElement.dataset.input = 'gamepad'; window.dispatchEvent(new Event('rc-device')); });
  await page.locator('.thought .glyph.pad').first().waitFor();
  assert.deepEqual(await page.locator('.thought .glyph.pad img').evaluateAll(images => images.map(i => i.getAttribute('src'))), ['/ui/icons/pad_x.png', '/ui/icons/pad_b.png']);
  await page.evaluate(() => { document.documentElement.dataset.input = 'touch'; window.dispatchEvent(new Event('rc-device')); });
  await page.waitForFunction(() => document.querySelectorAll('.thought .glyph').length === 0);
  await page.keyboard.press('n');
  assert.equal(await page.evaluate(() => window.badgeGame.getState().outcome.choice), 'no');
  await page.evaluate(async () => { const { CARD_BY_ID } = await import('/src/game/content/cards.ts'); const card = Object.values(CARD_BY_ID).find(c => !c.cost && !c.orItem); window.badgeGame.setState(s => ({ run: { ...s.run, queue: [card.id] }, courtStep: 'ask' })); });
  await page.locator('.thought .btn.yes').waitFor(); await page.keyboard.press('y');
  assert.equal(await page.evaluate(() => window.badgeGame.getState().outcome.choice), 'yes');
  assert.deepEqual(errors, []);
  console.log('PASS: project key-badge images, actual Y/N text bounds, no label overlap, normal/large text, PC sizes, initial input fallback, controller X/B, touch, actual Y/N actions, no page errors');
} finally { await browser.close(); }
