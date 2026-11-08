import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
let gemini = false, calls = 0;
await page.route('**/api/**', async route => {
  if (route.request().url().endsWith('/api/notebook') && gemini) {
    const payload = route.request().postDataJSON(); calls++;
    const notes = kind => payload.events.filter(e => e.kind === kind).slice(-2).map(e => ({ text: e.text, tip: e.tip, evidenceIds: [e.id] }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ source: 'gemini', reflection: { good: notes('good'), practice: notes('practice'), memory: 'Check your list before buying.', tests: payload.tests } }) });
  } else await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"test-offline"}' });
});
await page.addInitScript(() => localStorage.setItem('royal-concerns-settings-v1', JSON.stringify({ readAloud: false, aiChat: false, master: 0, music: 0, sfx: 0, voice: 0 })));
async function state() { return page.evaluate(async () => ({ game: (await import('/src/game/store.ts')).useGame.getState(), notebook: (await import('/src/game/notebook.ts')).useNotebook.getState() })); }
try {
  await fs.mkdir('test-results', { recursive: true });
  await page.goto('http://127.0.0.1:5206/?q=low', { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByRole('button', { name: 'Misc. Open my notebook', exact: true }).click();
  await page.getByRole('heading', { name: 'My notebook', exact: true }).waitFor();
  await page.getByText('Start a run. Your choices will appear here.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.title-gear').click();
  await page.getByRole('button', { name: 'Misc. · My notebook', exact: true }).click();
  await page.getByRole('heading', { name: 'My notebook', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(async () => {
    const { useGame } = await import('/src/game/store.ts');
    const { CARD_BY_ID } = await import('/src/game/content/cards.ts');
    useGame.getState().newGame({ title: 'Ruler', model: 'ruler-a', name: '' });
    useGame.getState().closeMorning();
    const card = Object.values(CARD_BY_ID).find(c => c.lesson?.concept === 'needs-wants' && c.lesson.good !== 'either' && !c.cost);
    for (let index = 0; index < 4; index++) {
      useGame.setState(s => ({ run: { ...s.run, queue: [card.id] }, courtStep: 'ask' }));
      useGame.getState().decide(index < 2 ? card.lesson.good === 'yes' ? 'no' : 'yes' : card.lesson.good);
    }
  });
  await page.getByRole('button', { name: 'Misc. Open my notebook', exact: true }).click();
  await page.getByText(/You are improving at/).waitFor();
  const beforeStep = (await state()).game.courtStep;
  await page.keyboard.press('n'); assert.equal((await state()).game.courtStep, beforeStep);
  await page.screenshot({ path: 'test-results/notebook-progress.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Open my notes', exact: true }).click();
  await page.getByRole('button', { name: 'Try next', exact: true }).click();
  assert.ok(await page.locator('.notebook-note').count() > 0);
  const size = await page.locator('.notebook-note p').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  assert.ok(size >= 24, 'large learning descriptions');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  const question = page.locator('.notebook-question').first();
  const firstQuiz = (await state()).notebook.runs[0];
  const quiz = await page.evaluate(async id => {
    const { reflectionFor, useNotebook } = await import('/src/game/notebook.ts');
    return reflectionFor(useNotebook.getState().runs.find(r => r.id === id)).tests[0];
  }, firstQuiz.id);
  await question.getByRole('button', { name: quiz.choices[1 - quiz.answer], exact: true }).click();
  await question.getByText(/That is okay. Try again./).waitFor();
  await question.getByRole('button', { name: quiz.choices[quiz.answer], exact: true }).click();
  await question.getByText(/Yes. You got it!/).waitFor();
  assert.equal((await state()).notebook.runs[0].answers[quiz.id].attempts, 2);
  await page.screenshot({ path: 'test-results/notebook-practice.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Day log', exact: true }).click();
  assert.equal(await page.locator('.notebook-note').count(), 4, 'no duplicate events');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await state()).notebook.runs.length, 1);
  await page.evaluate(async () => { const { useGame } = await import('/src/game/store.ts'); useGame.getState().continueGame(); useGame.getState().newGame({ title: 'Ruler', model: 'ruler-a', name: '' }); useGame.getState().closeMorning(); });
  assert.equal((await state()).notebook.runs.length, 2);
  assert.equal((await state()).notebook.runs[1].ended, true);
  gemini = true;
  await page.getByRole('button', { name: 'Misc. Open my notebook', exact: true }).click();
  await page.getByRole('button', { name: 'My runs', exact: true }).click();
  const older = (await state()).notebook.runs[1].id;
  await page.getByLabel('Choose a run', { exact: true }).selectOption(older);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('royal-concerns-notebook-v1')).some(r => r.source === 'gemini'));
  assert.ok(calls >= 1);
  const memory = await page.evaluate(async id => { const { useNotebook, learningMemory } = await import('/src/game/notebook.ts'); const record = useNotebook.getState().runs.find(r => r.id === id); return learningMemory({ runId: record.id }); }, older);
  assert.equal(memory, 'Check your list before buying.');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(async () => (await import('/src/game/store.ts')).useGame.getState().openConvo({ npc: 'advisor', agent: 'advisor_evening', mode: 'advisor' }));
  await page.locator('.chip').first().click();
  await page.getByRole('button', { name: 'Misc. Open my notebook', exact: true }).click();
  await page.getByRole('heading', { name: 'My notebook', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'End and continue', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('royal-concerns-notebook-v1'))[0].chats.some(c => c.lines.some(l => l.who === 'me')));
  await page.getByRole('button', { name: 'Misc. Open my notebook', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const box = await page.locator('.notebook').boundingBox();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
  await page.screenshot({ path: 'test-results/notebook-narrow.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.notebook').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: always accessible, real choice history, evidence-based improvements, large text, retries, persistence, separate run archive, Gemini response, advisor memory, narrow layout, Escape, offline fallback, no page errors');
} catch (error) { await page.screenshot({ path: 'test-results/notebook-failure.png' }); console.log('Page errors:', errors); throw error; }
finally { await browser.close(); }
