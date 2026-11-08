import { useGame } from '../game/store.ts';
import { UNLOCKS } from '../game/content/economy.ts';

export function UnlockProgress() {
  const run = useGame(s => s.run)!;
  const next = UNLOCKS.filter(u => u.day > run.day).slice(0, 3);
  const unlocked = UNLOCKS.filter(u => u.day <= run.day);
  return <section className="unlock-progress" aria-label="Progress towards new features">
    <h3>Day {run.day} complete → Day {run.day + 1}</h3>
    {next.map(u => <div className="unlock-track" key={u.id}>
      <div><strong>{u.name}</strong><span>{u.day === run.day + 1 ? 'Opens tomorrow!' : `Opens day ${u.day}`}</span></div>
      <progress aria-label={`${u.name}: day ${run.day} of ${u.day}`} max={u.day} value={run.day} />
      <small>{run.day} / {u.day} days · {u.realLife}</small>
    </div>)}
    {unlocked.length > 0 && <p className="small">Already open: {unlocked.map(u => u.name).join(' · ')}</p>}
    {!next.length && <p>All kingdom features unlocked!</p>}
  </section>;
}
