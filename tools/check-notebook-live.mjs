import { loadEnv } from '../server/api.mjs';
import { interpretNotebook } from '../server/notebook.mjs';
loadEnv();
const payload = { events: [
  { id: 'example-good', day: 1, kind: 'good', concept: 'budgeting', text: 'You stayed inside your shopping budget.', tip: 'Check your coins before you buy.' },
  { id: 'example-practice', day: 1, kind: 'practice', concept: 'needs-wants', text: 'You bought a shiny sale item.', tip: 'Buy what is on your list first.' },
], chats: [], tests: [{ id: 'list', question: 'Your list says bread. What should you buy first?', choices: ['A shiny toy', 'Bread'], answer: 1, explanation: 'Buy what is on your list first.' }] };
const result = await interpretNotebook(payload, async (url, options) => {
  const response = await fetch(url, options);
  console.log('OpenRouter status:', response.status);
  return response;
});
if (!result) { console.log('Live service did not return validated notes; saved-note fallback remains available.'); process.exitCode = 1; }
else console.log(JSON.stringify({ source: result.source, model: result.model, good: result.reflection.good.length, practice: result.reflection.practice.length, tests: result.reflection.tests.length }));
