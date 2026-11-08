import { create } from 'zustand';
import type { RunState } from './types.ts';
import { decisionEvents, savedReflection, practiceSeeds, type LearningEvent, type Reflection, type RunNotes } from './learning.ts';

const KEY = 'royal-concerns-notebook-v1';
function load(): RunNotes[] { try { const data = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(data) ? data.filter(r => typeof r.id === 'string' && Array.isArray(r.events) && Array.isArray(r.chats)) : []; } catch { return []; } }
export const runId = (run: RunState) => run.runId ?? `legacy-${run.seed}`;
export const useNotebook = create<{ open: boolean; runs: RunNotes[]; busy: string | null; message: string; storageError: boolean; show(open: boolean): void }>((set) => ({
  open: false, runs: load(), busy: null, message: '', storageError: false, show: open => set({ open }),
}));
function write(runs: RunNotes[]) {
  let storageError = false;
  try { localStorage.setItem(KEY, JSON.stringify(runs)); } catch { storageError = true; }
  useNotebook.setState({ runs, storageError });
}
export function rememberRun(run: RunState, ended = run.lost) {
  const runs = [...useNotebook.getState().runs], id = runId(run), index = runs.findIndex(r => r.id === id);
  const old = runs[index];
  const events = new Map((old?.events ?? []).map(e => [e.id, e]));
  decisionEvents(run).forEach(e => events.set(e.id, e));
  for (const day of run.days) if (day.marketStars !== undefined && !events.has(`market:${day.day}`)) events.set(`market:${day.day}`, { id: `market:${day.day}`, day: day.day, kind: 'note', concept: 'budgeting', text: `You earned ${day.marketStars} shopping stars.`, tip: 'Check your list and your coins before buying.' });
  const record: RunNotes = { ...old, id, started: old?.started ?? new Date().toISOString(), day: run.day, ended: !!old?.ended || ended, events: [...events.values()], chats: old?.chats ?? [] };
  if (index >= 0) runs[index] = record; else runs.unshift(record);
  write(runs);
  return record;
}
export function rememberEvent(run: RunState, event: LearningEvent) {
  const record = rememberRun(run);
  const events = [...record.events.filter(e => e.id !== event.id), event];
  write(useNotebook.getState().runs.map(r => r.id === record.id ? { ...r, events } : r));
}
export function rememberChat(run: RunState, npc: string, lines: { who: string; text: string }[]) {
  const record = rememberRun(run);
  if (!lines.length) return;
  const chats = [...record.chats.filter(c => !(c.day === run.day && c.npc === npc)), { day: run.day, npc, lines: lines.slice(-10) }];
  const event: LearningEvent = { id: `chat:${run.day}:${npc}`, day: run.day, kind: 'note', concept: 'kindness', text: 'You talked with a citizen.', tip: 'Listen. Ask how you can help.' };
  write(useNotebook.getState().runs.map(r => r.id === record.id ? { ...r, chats, events: [...r.events.filter(e => e.id !== event.id), event] } : r));
}
const pending = new Map<string, Promise<void>>();
export function refreshNotebook(id: string): Promise<void> {
  if (pending.has(id)) return pending.get(id)!;
  const record = useNotebook.getState().runs.find(r => r.id === id);
  if (!record || !record.events.length) return Promise.resolve();
  const payload = { events: record.events.slice(-100), chats: record.chats.slice(-4), tests: practiceSeeds(record.events) };
  const fingerprint = JSON.stringify(payload);
  if (record.fingerprint === fingerprint && record.source === 'gemini') return Promise.resolve();
  const task = (async () => {
    useNotebook.setState({ busy: id, message: 'Making your notes…' });
    try {
      const response = await fetch('/api/notebook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: fingerprint, signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (!data.reflection || data.source !== 'gemini') throw new Error('unavailable');
      const reflection = data.reflection as Reflection;
      // The server validates the schema and evidence. Keep a local shape guard too.
      if (!Array.isArray(reflection.good) || !Array.isArray(reflection.practice) || !Array.isArray(reflection.tests) || typeof reflection.memory !== 'string') throw new Error('invalid');
      write(useNotebook.getState().runs.map(r => r.id === id ? { ...r, reflection, fingerprint, source: 'gemini' } : r));
      useNotebook.setState({ message: 'Your notes are ready.' });
    } catch {
      useNotebook.setState({ message: 'Your saved notes are ready.' });
    } finally { useNotebook.setState({ busy: null }); pending.delete(id); }
  })();
  pending.set(id, task);
  return task;
}
export function reflectionFor(run: RunNotes) {
  // Do not hide new events behind an older AI summary.
  const fresh = JSON.stringify({ events: run.events.slice(-100), chats: run.chats.slice(-4), tests: practiceSeeds(run.events) }) === run.fingerprint;
  return fresh && run.reflection ? run.reflection : savedReflection(run);
}
export function learningMemory(run: RunState) {
  const record = useNotebook.getState().runs.find(r => r.id === runId(run));
  return record ? reflectionFor(record).memory.slice(0, 700) : '';
}
export function recordPractice(id: string, question: string, correct: boolean) {
  write(useNotebook.getState().runs.map(r => {
    if (r.id !== id) return r;
    const old = r.answers?.[question];
    return { ...r, answers: { ...r.answers, [question]: { firstCorrect: old?.firstCorrect ?? correct, correct, attempts: (old?.attempts ?? 0) + 1 } } };
  }));
}
