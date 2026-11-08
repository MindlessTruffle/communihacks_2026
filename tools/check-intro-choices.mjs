import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', r => r.fulfill({ status: 503, body: '{}' }));
await page.addInitScript(() => localStorage.setItem('royal-concerns-settings-v1', JSON.stringify({ readAloud: false, aiChat: false, reduceMotion: false, master: 0, music: 0, sfx: 0, voice: 0 })));
async function game(action, ...args) { return page.evaluate(async ({ action, args }) => (await import('/src/game/store.ts')).useGame.getState()[action](...args), { action, args }); }
async function trackClouds() { await page.evaluate(() => {
  const root = document.querySelector('.tt-root'); window.cloudFrames = [];
  const observer = new MutationObserver(() => window.cloudFrames.push({ back: parseFloat(root.style.getPropertyValue('--cloud-back') || '0'), front: parseFloat(root.style.getPropertyValue('--cloud-front') || '0'), veil: Number(root.style.getPropertyValue('--veil') || 0) }));
  observer.observe(root, { attributes: true, attributeFilter: ['style'] });
}); }
try {
  await fs.mkdir('test-results', { recursive: true });
  await page.goto('http://127.0.0.1:5207/?q=low', { waitUntil: 'networkidle', timeout: 120000 });
  await trackClouds();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.locator('.ruler-setup').waitFor({ timeout: 30000 });
  const frames = await page.evaluate(() => window.cloudFrames);
  assert.ok(frames.length > 5, 'transition is animated over multiple frames');
  assert.ok(frames.some(f => f.front > 0 && f.front < 100), 'clouds move down through intermediate positions');
  assert.ok(frames.every((f, i) => i === 0 || f.front >= frames[i - 1].front), 'cloud movement never reverses');
  assert.ok(Math.max(...frames.map(f => f.veil)) > .5, 'cloud pass covers the middle of the descent');
  assert.ok(frames.at(-1).veil < .02, 'veil fades out before setup appears');
  await game('goto', 'title'); await game('setSettings', { reduceMotion: true });
  await page.locator('.tt-root.reduced').waitFor(); await trackClouds();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.locator('.ruler-setup').waitFor();
  assert.ok((await page.evaluate(() => window.cloudFrames)).every(f => f.front === 0), 'reduced motion has no sliding clouds');
  await game('goto', 'title'); await game('setSettings', { reduceMotion: false });
  await page.getByRole('button', { name: 'Start', exact: true }).click(); await page.keyboard.press('Escape');
  await page.locator('.ruler-setup').waitFor();
  assert.equal(await page.locator('.pause').count(), 0, 'Escape skips the transition instead of opening pause');
  console.log('PASS: downward clouds, progressive animation, veil reveals court, reduced motion, Escape skip');

  await game('newGame', { title: 'Ruler', model: 'ruler-a', name: '' }); await game('closeMorning'); await game('setCourtStep', 'ask');
  await page.locator('.chat-decisions').waitFor();
  for (const [width, height] of [[1280, 800], [2048, 1085]]) {
    await page.setViewportSize({ width, height });
    for (const input of ['mouse', 'gamepad']) {
      await page.evaluate(input => { document.documentElement.dataset.input = input; window.dispatchEvent(new Event('rc-device')); }, input);
      await page.waitForTimeout(250);
      const bounds = await page.locator('.chat-decisions .btn').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect(), icon = button.querySelector(':scope > .ico-img').getBoundingClientRect();
        const badge = button.querySelector('.glyph').getBoundingClientRect();
        return { centreX: icon.x + icon.width / 2 - rect.x - rect.width / 2, centreY: icon.y + icon.height / 2 - rect.y - rect.height / 2, top: rect.top, badgeWidth: badge.width, badgeHeight: badge.height };
      }));
      assert.equal(bounds.length, 2);
      for (const b of bounds) { assert.ok(Math.abs(b.centreX) < 1 && Math.abs(b.centreY) < 1, 'mark centred inside button'); assert.ok(b.badgeWidth <= 24 && b.badgeHeight <= 24, 'small independent key badge'); }
      assert.ok(Math.abs(bounds[0].top - bounds[1].top) < 1, 'buttons align in a row');
    }
    await page.screenshot({ path: `test-results/choice-alignment-${width}.png`, animations: 'disabled' });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: centred marks, aligned buttons, keyboard and gamepad badges, both window sizes, no browser errors');
} finally { await browser.close(); }
