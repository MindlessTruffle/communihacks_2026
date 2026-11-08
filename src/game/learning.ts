import type { RunState } from './types.ts';
import { CARD_BY_ID } from './content/cards.ts';

export type LearningEvent = { id: string; day: number; kind: 'good' | 'practice' | 'note'; concept: string; text: string; tip: string };
export type LearningNote = { text: string; tip: string; evidenceIds: string[] };
export type Practice = { id: string; question: string; choices: string[]; answer: number; explanation: string };
export type Reflection = { good: LearningNote[]; practice: LearningNote[]; memory: string; tests: Practice[] };
export type RunNotes = { id: string; started: string; day: number; ended: boolean; events: LearningEvent[]; chats: { day: number; npc: string; lines: { who: string; text: string }[] }[]; reflection?: Reflection; fingerprint?: string; source?: 'gemini' | 'saved'; answers?: Record<string, { firstCorrect: boolean; correct: boolean; attempts: number }> };

export const TOPICS: Record<string, [string, string]> = {
  'needs-wants': ['buying what you need', 'Buy what is on your list first.'],
  budgeting: ['staying in your budget', 'Check your coins before you buy.'],
  bills: ['planning for bills', 'Keep coins for your next bill.'],
  scams: ['spotting fake prizes', 'Ask someone you trust before paying for a prize.'],
  phishing: ['keeping your PIN safe', 'Keep your PIN secret.'],
  privacy: ['keeping private details safe', 'Ask someone you trust before sharing private details.'],
  kindness: ['being kind', 'Listen. Ask how you can help.'],
  'compare-prices': ['comparing prices', 'Look at two prices before choosing.'],
  'saving-goal': ['saving for a goal', 'Put a few coins aside for your goal.'],
  'emergency-fund': ['saving for surprises', 'Keep a few coins for a surprise cost.'],
  impulse: ['taking time before buying', 'Pause. Check if you need it.'],
  subscriptions: ['checking repeat costs', 'Check what you will pay each week.'],
  'high-interest': ['checking borrowing costs', 'Check how much you must pay back.'],
  planning: ['planning ahead', 'Check what you need for tomorrow.'],
  honesty: ['being honest', 'Say what happened. Ask for help.'],
};
export const topic = (concept: string) => TOPICS[concept] ?? ['making a careful choice', 'Pause. Think about your next choice.'];

export function decisionEvents(run: RunState): LearningEvent[] {
  return run.log.map((entry, index) => {
    const card = CARD_BY_ID[entry.card], concept = entry.concept ?? 'planning';
    const label = card ? (entry.choice === 'yes' ? card.yesLabel ?? 'Yes' : card.noLabel ?? 'No') : entry.choice;
    const [words, tip] = topic(concept);
    return { id: `court:${index}`, day: entry.day, kind: entry.wise === true ? 'good' : entry.wise === false ? 'practice' : 'note', concept,
      text: entry.wise === true ? `You made a careful choice about ${words}.` : entry.wise === false ? `You can practise ${words}.` : `You chose: ${label}.`, tip };
  });
}

const QUIZZES: Practice[] = [
  { id: 'budget', question: 'You have 5 coins. Food costs 4. Can you buy it?', choices: ['Yes. I have enough.', 'No. I need more.'], answer: 0, explanation: '4 is less than 5. You have enough.' },
  { id: 'list', question: 'Your list says bread. What should you buy first?', choices: ['A shiny toy', 'Bread'], answer: 1, explanation: 'Buy what is on your list first.' },
  { id: 'scam', question: 'A stranger asks for coins to claim a prize. What now?', choices: ['Pay right away', 'Stop. Ask someone I trust.'], answer: 1, explanation: 'Ask someone you trust before paying for a prize.' },
  { id: 'kind', question: 'A friend looks upset. What could you say?', choices: ['Would you like some help?', 'Go away.'], answer: 0, explanation: 'Listening and offering help can be kind.' },
  { id: 'save', question: 'You want something later. What can help?', choices: ['Save a few coins', 'Spend every coin now'], answer: 0, explanation: 'Saving a little can help you reach your goal.' },
];
export function practiceSeeds(events: LearningEvent[]): Practice[] {
  const concepts = events.filter(e => e.kind === 'practice').map(e => e.concept);
  const ids = concepts.map(c => c === 'scams' || c === 'phishing' ? 'scam' : c === 'kindness' ? 'kind' : c.includes('saving') ? 'save' : c === 'needs-wants' || c === 'impulse' ? 'list' : 'budget');
  return [...new Set([...ids, 'budget', 'list'])].slice(0, 2).map(id => ({ ...QUIZZES.find(q => q.id === id)! }));
}
export function savedReflection(run: RunNotes): Reflection {
  const notes = (kind: LearningEvent['kind']) => run.events.filter(e => e.kind === kind).slice(-3).reverse().map(e => ({ text: e.text, tip: e.tip, evidenceIds: [e.id] }));
  const good = notes('good'), practice = notes('practice');
  const memory = [good[0]?.text, practice[0]?.tip, run.events.filter(e => e.kind === 'note').at(-1)?.text].filter(Boolean).join(' ');
  return { good, practice, memory, tests: run.events.length ? practiceSeeds(run.events) : [] };
}

/** Only compare scored, observed choices. Unknown choices are never counted wrong. */
export function improvements(runs: RunNotes[]): { text: string; detail: string }[] {
  const results: { text: string; detail: string }[] = [];
  for (const [concept, [words]] of Object.entries(TOPICS)) {
    const scored = runs.slice().reverse().flatMap(r => r.events).filter(e => e.concept === concept && e.kind !== 'note');
    if (scored.length < 4) continue;
    const middle = Math.floor(scored.length / 2), before = scored.slice(0, middle), after = scored.slice(middle);
    const a = before.filter(e => e.kind === 'good').length, b = after.filter(e => e.kind === 'good').length;
    if (b / after.length > a / before.length) results.push({ text: `You are improving at ${words}.`, detail: `Before: ${a} of ${before.length} careful choices. Now: ${b} of ${after.length}.` });
  }
  return results;
}
export function cleanChat(text: string) {
  return text.replace(/sk-[A-Za-z0-9_-]+/g, '[key removed]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]').slice(0, 320);
}
