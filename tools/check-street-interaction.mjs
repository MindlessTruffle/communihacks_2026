import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"agents-not-configured"}' }));
await page.addInitScript(() => localStorage.setItem('royal-concerns-settings-v1', JSON.stringify({ readAloud: false, aiChat: false, master: 0, music: 0, sfx: 0, voice: 0 })));
const state = () => page.evaluate(async () => {
  const { useGame } = await import('/src/game/store.ts');
  const { useStreet } = await import('/src/scenes/StreetScene.tsx');
  return { near: useStreet.getState().nearNpc, convo: useGame.getState().convo, done: useGame.getState().street.done, t: useStreet.getState().t };
});
try {
  await fs.mkdir('test-results', { recursive: true });
  await page.goto('http://127.0.0.1:5202/?q=low', { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(async () => {
    const { useGame } = await import('/src/game/store.ts');
    useGame.getState().newGame({ title: 'King', model: 'ruler-a', name: '' });
    useGame.getState().closeMorning();
    useGame.getState().startEvening();
  });
  await page.locator('.street-movement-intro.visible').waitFor();
  await page.keyboard.press('ArrowRight');
  await page.locator('.street-movement-intro').waitFor({ state: 'detached' });
  await page.locator('.street-walk-hint').waitFor();
  await page.evaluate(async () => {
    window.streetTest = (await import('/src/scenes/StreetScene.tsx')).useStreet;
    window.gameTest = (await import('/src/game/store.ts')).useGame;
  });
  await page.waitForTimeout(2000);
  const box = await page.locator('.street-walk-hint').boundingBox();
  console.log('Movement hint bounds:', box);
  await page.screenshot({ path: 'test-results/street-hint.png' });
  assert.ok(box.x > 900 && box.width < 350 && box.height < 65, 'compact corner movement hint');
  await page.keyboard.press('e');
  assert.equal((await state()).convo, null, 'E out of range must do nothing');
  for (let index = 0; index < 3; index++) {
    await page.keyboard.down('w');
    await page.waitForTimeout(1500);
    console.log('Walking:', await state(), await page.evaluate(async () => ({ move: (await import('/src/platform/device.ts')).move, active: document.activeElement?.outerHTML.slice(0, 120), modal: document.querySelector('[data-modal]')?.className })));
    await page.waitForFunction(() => window.streetTest.getState().nearNpc !== null, null, { timeout: 60000 });
    await page.keyboard.up('w');
    const before = await state();
    assert.equal(before.convo, null, 'proximity must not auto-open dialogue');
    await page.screenshot({ path: `test-results/street-proximity-${index}.png` });
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.gameTest.getState().convo !== null);
    console.log('After E:', await state(), 'errors:', errors);
    assert.equal((await state()).convo?.npc, before.near);
    await page.evaluate(async () => (await import('/src/game/store.ts')).useGame.getState().closeConvo());
    await page.waitForTimeout(4000);
    assert.ok((await state()).done.includes(before.near));
    const visible = await page.evaluate(async id => {
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const scene = _roots.get(document.querySelector('canvas')).store.getState().scene;
      let visible = null;
      scene.traverse(object => { if (object.userData.citizen === id) visible = object.visible; });
      return visible;
    }, before.near);
    assert.equal(visible, false, 'completed citizen fades away');
    await page.keyboard.press('e');
    assert.equal((await state()).convo, null, 'cannot reopen finished conversation');
    console.log(`Citizen ${index + 1}: E interaction and departure passed`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: proximity, explicit E, all three departures, compact hint, no browser errors');
} catch (error) { console.log('Failure state:', await state()); await page.screenshot({ path: 'test-results/street-failure.png' }); throw error; }
finally { await browser.close(); }
