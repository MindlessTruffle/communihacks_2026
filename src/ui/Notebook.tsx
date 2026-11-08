import { useEffect, useRef, useState } from 'react';
import { useDialog } from '../platform/a11y.tsx';
import { useNotebook, reflectionFor, refreshNotebook, recordPractice } from '../game/notebook.ts';
import { improvements, type Practice, type LearningNote } from '../game/learning.ts';
import { speak, stopVoice } from '../audio/audio.ts';
import './notebook.css';

export function MiscButton() {
  return <button className="misc-button" aria-label="Misc. Open my notebook" onClick={() => { if (document.pointerLockElement) document.exitPointerLock(); useNotebook.getState().show(true); }}>▤<span>Misc.</span></button>;
}

function NoteCard({ note }: { note: LearningNote }) {
  return <article className="notebook-note"><p>{note.text}</p><strong>Next: {note.tip}</strong><button onClick={() => speak(null, `${note.text} Next: ${note.tip}`)} aria-label={`Read aloud: ${note.text}`}>Read aloud</button></article>;
}
function Question({ quiz, runId }: { quiz: Practice; runId: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null, correct = picked === quiz.answer;
  return <article className="notebook-question"><h3>{quiz.question}</h3>
    <div>{quiz.choices.map((choice, index) => <button key={index} aria-pressed={picked === index} onClick={() => { setPicked(index); recordPractice(runId, quiz.id, index === quiz.answer); }}>{choice}</button>)}</div>
    {answered && <p role="status">{correct ? 'Yes. You got it!' : 'That is okay. Try again.'} {quiz.explanation}</p>}
  </article>;
}
export function Notebook() {
  useEffect(() => { stopVoice(); }, []);
  const root = useRef<HTMLDivElement>(null);
  const runs = useNotebook(s => s.runs), busy = useNotebook(s => s.busy), message = useNotebook(s => s.message), storageError = useNotebook(s => s.storageError);
  const [page, setPage] = useState<'home' | 'runs'>('home'), [chosen, setChosen] = useState<string | null>(null);
  const [tab, setTab] = useState<'good' | 'practice' | 'log' | 'tests'>('good');
  const run = runs.find(r => r.id === chosen) ?? runs[0];
  const close = () => useNotebook.getState().show(false);
  useDialog(root, { onEscape: close, initial: '[data-notebook-close]' });
  useEffect(() => { if (run) void refreshNotebook(run.id); }, [run?.id]);
  const reflection = run ? reflectionFor(run) : null;
  const better = improvements(runs);
  const practiceWins = runs.flatMap(r => Object.values(r.answers ?? {})).filter(a => !a.firstCorrect && a.correct).length;
  const openRun = (id: string) => { setChosen(id); setPage('runs'); setTab('good'); };
  return <div className="notebook-backdrop">
    <div ref={root} className="notebook" role="dialog" aria-modal="true" aria-labelledby="notebook-title">
      <header><h1 id="notebook-title">My notebook</h1><button data-notebook-close onClick={close}>Close</button></header>
      <nav aria-label="Notebook pages"><button aria-pressed={page === 'home'} onClick={() => setPage('home')}>My progress</button><button aria-pressed={page === 'runs'} onClick={() => setPage('runs')}>My runs</button></nav>
      <main>
        {storageError && <p role="alert">Your browser could not save these notes. Keep this page open.</p>}
        {page === 'home' ? <>
          <h2>Things I am improving</h2>
          {better.length ? better.map(item => <article className="notebook-note" key={item.text}><h3>{item.text}</h3><p>{item.detail}</p></article>) : <p>Keep playing. We will show what gets easier.</p>}
          {practiceWins > 0 && <p>You tried again and found {practiceWins} practice answers.</p>}
          {run && <><h2>My latest run</h2><p>Day {run.day} · {run.ended ? 'Finished' : 'Still playing'}</p><button className="notebook-primary" onClick={() => openRun(run.id)}>Open my notes</button></>}
          {!run && <p>Start a run. Your choices will appear here.</p>}
          <p className="notebook-small">Notes stay in this browser. Each run has its own pages.</p>
        </> : <>
          <label className="notebook-run-label">Choose a run<select aria-label="Choose a run" value={run?.id ?? ''} onChange={e => { setChosen(e.target.value); setTab('good'); }}>{runs.map((r, index) => <option key={r.id} value={r.id}>Run {runs.length - index} · Day {r.day}{r.ended ? ' · Finished' : ''}</option>)}</select></label>
          {run && reflection ? <>
            <nav aria-label="Run notebook sections">{([['good', 'Did well'], ['practice', 'Try next'], ['tests', 'Practice'], ['log', 'Day log']] as const).map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
            {tab === 'good' && <><h2>Things I did well</h2>{reflection.good.length ? reflection.good.map((note, i) => <NoteCard key={i} note={note} />) : <p>Keep trying. Your next choices can go here.</p>}</>}
            {tab === 'practice' && <><h2>One small thing to try</h2>{reflection.practice.length ? reflection.practice.map((note, i) => <NoteCard key={i} note={note} />) : <p>No practice notes yet. Keep exploring.</p>}</>}
            {tab === 'tests' && <><h2>Try a quick question</h2><p>Take your time. You can try again.</p>{reflection.tests.map(quiz => <Question key={`${run.id}:${quiz.id}`} quiz={quiz} runId={run.id} />)}{!reflection.tests.length && <p>Your questions will appear after a few choices.</p>}</>}
            {tab === 'log' && <><h2>My day log</h2>{run.events.slice().reverse().map(event => <article className="notebook-note" key={event.id}><span className="notebook-small">Day {event.day} · {event.kind === 'good' ? 'Did well' : event.kind === 'practice' ? 'Try next' : 'What I did'}</span><p>{event.text}</p><strong>{event.tip}</strong></article>)}{!run.events.length && <p>Your choices will appear here.</p>}</>}
            <p className="notebook-small" role="status">{busy === run.id ? 'Making your notes…' : message || 'Your saved notes are ready.'}</p>
            <button disabled={!!busy} onClick={() => refreshNotebook(run.id)}>Update my notes</button>
          </> : <p>Start a run to fill your notebook.</p>}
        </>}
      </main>
      <footer>Small steps count. You can always practise again.</footer>
    </div>
  </div>;
}
