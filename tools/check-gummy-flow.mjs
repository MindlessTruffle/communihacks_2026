import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"agents-not-configured"}' }));
await page.addInitScript(() => localStorage.setItem('royal-concerns-settings-v1', JSON.stringify({ readAloud: false, aiChat: false, master: 0, music: 0, sfx: 0, voice: 0 })));
const base = process.env.GUMMY_TEST_URL || 'http://127.0.0.1:5205';
async function game(action, ...args) { return page.evaluate(async ({ action, args }) => { const { useGame } = await import('/src/game/store.ts'); return useGame.getState()[action](...args); }, { action, args }); }
async function sceneSample() { return page.evaluate(() => {
  const scene = window.flowRoot().scene;
  let sky;
  scene.traverse(o => { if (o.material?.uniforms?.top) sky = o.material.uniforms.top.value.getHexString(); });
  const body = scene.getObjectByName('Gummy:ruler-a')?.getObjectByName('Body');
  return { sky, fog: scene.fog?.color.getHexString(), color: body?.material.color.getHexString(), shopkeeper: !!scene.getObjectByName('MarketShopkeeper'), yaw: window.flowRoot().camera.rotation.y };
}); }
try {
  await fs.mkdir('test-results', { recursive: true });
  await page.goto(`${base}/?q=low`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(async () => {
    const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    window.flowRoot = () => _roots.get(document.querySelector('canvas')).store.getState();
  });
  await game('goto', 'setup');
  await page.getByRole('button', { name: 'Mint', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Mint', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('slider', { name: 'Colour wheel hue', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  const wheelColor = await page.getByLabel('Custom gummy colour', { exact: true }).inputValue();
  assert.notEqual(wheelColor, '#6fc9a1');
  await page.getByLabel('Custom gummy colour', { exact: true }).fill('#37c7b4');
  await page.screenshot({ path: 'test-results/custom-color.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Begin', exact: false }).click();
  for (let i = 0; i < 20; i++) {
    if (await page.evaluate(async () => (await import('/src/game/store.ts')).useGame.getState().phase === 'morning')) break;
    await page.locator('.center').evaluate(el => el.click());
  }
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('royal-concerns-save-v1')));
  assert.equal(saved.run.rulerColor, '#37c7b4');
  await game('closeMorning'); await game('setCourtStep', 'ask');
  await page.locator('.speech .chat-decisions .choice-price').waitFor();
  assert.equal(await page.locator('.speech .btn.yes').count(), 1);
  assert.equal(await page.locator('.speech .btn.no').count(), 1);
  assert.equal(await page.locator('.thought').count(), 0);
  await page.waitForTimeout(1500);
  assert.equal((await sceneSample()).color, '37c7b4');
  await page.screenshot({ path: 'test-results/chat-choices.png' });
  await page.locator('.speech .btn.no').click();
  console.log('PASS: palette, wheel, custom colour save and material; court choices inside chat');

  await game('startEvening');
  await page.evaluate(async () => { const { useGame } = await import('/src/game/store.ts'); useGame.setState(s => ({ street: { ...s.street, done: [...s.street.npcs] } })); window.flowStreet = (await import('/src/scenes/StreetScene.tsx')).useStreet; });
  await page.waitForFunction(() => !!window.flowRoot().scene.getObjectByName('WalkingGummyMotion'));
  const evening = await sceneSample();
  await page.keyboard.down('w');
  // Exercise the normal frame callbacks without issuing hundreds of software-GPU
  // renders. This advances the same movement, lighting, fog and sky code paths.
  await page.evaluate(() => {
    const root = window.flowRoot();
    for (let frame = 0; frame < 240; frame++) for (const sub of [...root.internal.subscribers]) sub.ref.current(root, .1);
  });
  await page.waitForFunction(() => window.flowStreet.getState().atGate, null, { timeout: 15000 });
  await page.keyboard.up('w');
  await page.waitForTimeout(1000);
  const night = await sceneSample();
  assert.notEqual(evening.sky, night.sky);
  assert.equal(night.sky, '171b50'); assert.equal(night.fog, '2f2766');
  await page.screenshot({ path: 'test-results/street-night.png' });
  console.log('PASS: street reaches night at market gate');

  await game('toBudget');
  await page.getByRole('button', { name: /Enter the Night Market/ }).click();
  await page.waitForFunction(() => !!window.flowRoot().scene.getObjectByName('MarketShopkeeper'));
  await page.evaluate(async () => { window.flowMarket = (await import('/src/scenes/MarketScene.tsx')).useMarket; });
  const locked = await page.evaluate(() => document.pointerLockElement === document.querySelector('canvas'));
  assert.equal(locked, true, 'mouse locks on market entry');
  const before = await sceneSample(); await page.mouse.move(670, 410); await page.waitForTimeout(300);
  assert.notEqual((await sceneSample()).yaw, before.yaw, 'look responds without holding a button');
  await page.locator('.market-walk-hint').waitFor();
  const background = await page.locator('.market-walk-hint').evaluate(el => getComputedStyle(el).backgroundColor);
  assert.match(background, /rgba/);
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.flowMarket.getState().hasMoved);
  await page.keyboard.up('w');
  assert.equal(await page.locator('.market-walk-hint').count(), 0);
  await page.evaluate(() => {
    const camera = window.flowRoot().camera;
    camera.position.set(0, 1.55, -20);
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: camera.rotation.y / .0025, movementY: (camera.rotation.x + .12) / .0025 }));
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/market-pointer-lock.png', animations: 'disabled' });
  await page.evaluate(() => { document.exitPointerLock(); window.flowMarket.getState().set({ selected: 'bread' }); });
  await page.getByRole('button', { name: 'Put in basket', exact: false }).waitFor();
  assert.equal(await page.evaluate(() => document.pointerLockElement), null);
  await page.getByRole('button', { name: /Leave it/ }).click();
  console.log('PASS: pointer lock, no-drag look, movement hides translucent hint, shopkeeper, unlock for item UI');

  await page.evaluate(async () => { const { useGame } = await import('/src/game/store.ts'); useGame.setState(s => ({ run: { ...s.run, day: 4 } })); });
  await game('checkout');
  await page.getByRole('region', { name: 'Progress towards new features' }).waitFor();
  assert.equal(await page.locator('.unlock-track progress').count(), 3);
  await page.getByText('Opens tomorrow!', { exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/unlock-progress.png', animations: 'disabled' });
  const checkoutBox = await page.locator('.checkout-card').boundingBox();
  assert.ok(checkoutBox.y >= 0 && checkoutBox.y + checkoutBox.height <= 800, 'checkout fits viewport with captions');
  const nextButton = await page.getByRole('button', { name: /Start day 5/ }).boundingBox();
  assert.ok(nextButton.y >= checkoutBox.y && nextButton.y + nextButton.height <= checkoutBox.y + checkoutBox.height, 'next-day button stays visible without scrolling');
  await page.getByRole('button', { name: /Start day 5/ }).click();
  assert.equal(await page.evaluate(async () => (await import('/src/game/store.ts')).useGame.getState().run.day), 5);
  assert.equal(await page.evaluate(async () => (await import('/src/game/store.ts')).useGame.getState().run.rulerColor), '#37c7b4');
  assert.deepEqual(errors, []);
  console.log('PASS: day-unlock progress, next-day transition, colour persists, no browser errors');
} catch (error) { await page.screenshot({ path: 'test-results/gummy-flow-failure.png' }); console.log('Browser errors:', errors); throw error; }
finally { await browser.close(); }
