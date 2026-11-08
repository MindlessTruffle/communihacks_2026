import { useEffect, useState } from 'react';

export const GUMMY_PALETTE = [
  ['Rose', '#dc5470'], ['Ocean', '#46a8d0'], ['Mint', '#6fc9a1'],
  ['Lavender', '#ac8bd5'], ['Peach', '#eea45b'], ['Sunshine', '#e8d36b'],
] as const;

function wheelColor(hue: number, saturation: number, light: number) {
  const a = saturation * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function GummyColors({ color, onChange }: { color: string; onChange(color: string): void }) {
  const [hue, setHue] = useState(0), [sat, setSat] = useState(.8), [light, setLight] = useState(.6);
  useEffect(() => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min, l = (max + min) / 2;
    const h = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    setHue((h * 60 + 360) % 360); setSat(delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))); setLight(l);
  }, [color]);
  const pick = (h: number, s: number, l = light) => { setHue(h); setSat(s); setLight(l); onChange(wheelColor(h, s, l)); };
  const pointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    pick((Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360, Math.min(1, Math.hypot(x, y)));
  };
  return <fieldset className="gummy-colors">
    <legend>Your gummy colour</legend>
    <div className="color-controls">
      <div className="color-swatches" role="group" aria-label="Preset colours">
        {GUMMY_PALETTE.map(([name, value]) => <button type="button" key={name} aria-label={name} aria-pressed={color.toLowerCase() === value.toLowerCase()} style={{ background: value }} onClick={() => onChange(value)} />)}
      </div>
      <div className="color-wheel" role="slider" tabIndex={0} aria-label="Colour wheel hue" aria-valuemin={0} aria-valuemax={359} aria-valuenow={Math.round(hue) % 360} aria-valuetext={`${Math.round(hue)} degrees, ${color}`}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pointer(e); }}
        onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pointer(e); }}
        onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); pick((hue + (e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0) + 360) % 360, Math.max(0, Math.min(1, sat + (e.key === 'ArrowUp' ? .05 : e.key === 'ArrowDown' ? -.05 : 0)))); } }}>
        <i style={{ left: `${50 + Math.sin(hue * Math.PI / 180) * sat * 46}%`, top: `${50 - Math.cos(hue * Math.PI / 180) * sat * 46}%`, background: color }} />
      </div>
      <label className="color-brightness">Brightness<input type="range" min="0" max="100" value={Math.round(light * 100)} onChange={e => pick(hue, sat, Number(e.target.value) / 100)} /></label>
      <label className="custom-color">Custom<input aria-label="Custom gummy colour" type="color" value={color} onChange={e => onChange(e.target.value)} /></label>
    </div>
  </fieldset>;
}
