import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', r => r.fulfill({ status: 503, body: '{}' }));
  await page.addInitScript(() => localStorage.setItem('royal-concerns-settings-v1', JSON.stringify({ readAloud: false, aiChat: false, master: 0, music: 0, sfx: 0, voice: 0 })));
  await page.goto(`${process.env.GUMMY_TEST_URL || 'http://127.0.0.1:5202'}/?q=low`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { useGame } = await import('/src/game/store.ts');
    useGame.getState().newGame({ title: 'King', model: 'ruler-a', name: '' });
    useGame.getState().closeMorning(); useGame.getState().startEvening();
    window.walkGame = useGame;
    const { _roots, addAfterEffect } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
    window.walkScene = () => _roots.get(document.querySelector('canvas')).store.getState().scene;
    window.walkSample = () => {
      const scene = window.walkScene(), motion = scene.getObjectByName('WalkingGummyMotion'), dust = scene.getObjectByName('KingFootstepPuffs');
      return { y: motion.position.y, roll: motion.rotation.z, scale: motion.scale.y, dust: dust.visible, count: dust.count };
    };
    window.walkFrames = [];
    addAfterEffect(() => { if (window.walkScene().getObjectByName('WalkingGummyMotion')) window.walkFrames.push(window.walkSample()); });
  });
  await page.waitForFunction(() => !!window.walkScene().getObjectByName('WalkingGummyMotion'));
  const samples = [];
  for (const key of ['d', 'a', 'd']) {
    await page.keyboard.down(key);
    for (let i = 0; i < 4; i++) { await page.waitForTimeout(300); samples.push(await page.evaluate(() => window.walkSample())); }
    await page.keyboard.up(key);
  }
  samples.push(...await page.evaluate(() => window.walkFrames));
  assert.ok(samples.some(s => s.y > .01), 'walking bounce');
  assert.ok(samples.some(s => Math.abs(s.roll) > .005), 'walking wobble');
  assert.ok(samples.some(s => Math.abs(s.scale - 1) > .005), 'jelly squash');
  assert.ok(samples.some(s => s.dust), 'subtle walking puffs');
  assert.ok(samples.every(s => s.count === 12), 'bounded particle pool');
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => { const s = window.walkSample(); return s.y < .005 && Math.abs(s.scale - 1) < .005 && !s.dust; }, null, { timeout: 15000 });
  const idle = await page.evaluate(() => window.walkSample());
  assert.ok(idle.y < .005 && Math.abs(idle.scale - 1) < .005 && !idle.dust, 'settles and particles expire after stopping');
  await page.evaluate(() => window.walkGame.setState(s => ({ settings: { ...s.settings, reduceMotion: true } })));
  await page.keyboard.down('a');
  await page.waitForFunction(() => { const s = window.walkSample(); return s.y === 0 && s.scale === 1 && s.roll === 0 && !s.dust; }, null, { timeout: 15000 });
  const reduced = await page.evaluate(() => window.walkSample());
  await page.keyboard.up('a');
  assert.equal(reduced.y, 0); assert.equal(reduced.scale, 1); assert.equal(reduced.roll, 0); assert.equal(reduced.dust, false);
  assert.deepEqual(errors, []);
  console.log('PASS: lateral walking bounce, wobble, squash, capped dust pool, settling, reduced motion, no browser errors');
} finally { await browser.close(); }
