import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route('**/api/**', r => r.fulfill({ status: 503, body: '{}' }));
  await page.addInitScript(() => localStorage.setItem('royal-concerns-settings-v1', JSON.stringify({ readAloud: false, aiChat: false, master: 0, music: 0, sfx: 0, voice: 0 })));
  await page.goto('http://127.0.0.1:5202/?q=low', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { useGame } = await import('/src/game/store.ts');
    useGame.getState().newGame({ title: 'King', model: 'ruler-a', name: '' });
    useGame.getState().closeMorning(); useGame.getState().startEvening();
  });
  await page.locator('.street-movement-intro.visible').waitFor();
  await page.keyboard.press('ArrowRight');
  await page.locator('.street-movement-intro').waitFor({ state: 'detached' });
  await page.locator('.street-walk-hint').waitFor();
  await fs.mkdir('test-results', { recursive: true });
  for (const [width, height] of [[1280, 800], [847, 1347], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    await page.waitForFunction(() => {
      const h = document.querySelector('.street-walk-hint').getBoundingClientRect();
      return ['.stats', '.phase-dots'].every(selector => {
        const p = document.querySelector(selector).getBoundingClientRect();
        return h.right <= p.left || h.left >= p.right || h.bottom <= p.top || h.top >= p.bottom;
      });
    }, null, { timeout: 15000 });
    const hint = await page.locator('.street-walk-hint').boundingBox();
    const stats = await page.locator('.stats').boundingBox();
    const phase = await page.locator('.phase-dots').boundingBox();
    console.log({ width, hint, stats, phase, style: await page.locator('.street-walk-hint').getAttribute('style') });
    const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    assert.ok(!overlaps(hint, stats), `${width}x${height}: hint overlaps resources`);
    assert.ok(!overlaps(hint, phase), `${width}x${height}: hint overlaps day panel`);
    assert.ok(hint.x >= 0 && hint.x + hint.width <= width && hint.y >= 0 && hint.y + hint.height <= height);
    assert.ok(hint.height < 60, 'hint stays compact');
    await page.screenshot({ path: `test-results/hud-${width}x${height}.png` });
    console.log(`PASS ${width}x${height}: no resource/day overlap; hint ${Math.round(hint.width)}x${Math.round(hint.height)}`);
  }
} finally { await browser.close(); }
