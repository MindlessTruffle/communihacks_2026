import { manifest } from './appearance.ts';
import { gummyAppearance } from './profiles.ts';

/** Small code-native portrait matching the selected blob's colour and body.
 *  `crown` (default true, the ruler picker) draws the royal crown; pass `crown={false}` to draw the profile's own hat, glasses and face instead
 *  (used by the multiplayer simulation stickers). */
export function GummyPortrait({ id, color, crown = true }: { id: string; color?: string; crown?: boolean }) {
  const appearance = gummyAppearance(id, crown);
  const chubby = appearance.body === 'chubby';
  const { head, eyewear, face } = appearance;
  return <svg viewBox="0 0 64 80" aria-hidden="true" style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
    <ellipse cx="32" cy="73" rx="20" ry="3" fill="#332743" opacity=".12" />
    <path d={chubby ? 'M21 28Q20 20 32 20Q44 20 43 28C43 40 54 48 53 61Q52 73 32 73Q12 73 11 61C10 48 21 40 21 28Z' : 'M21 28Q20 20 32 20Q44 20 43 28L47 60Q48 73 32 73Q16 73 17 60Z'} fill={color || manifest.colors[appearance.color]} />
    <ellipse cx="25" cy="39" rx="2" ry="4" fill="#322a39" /><ellipse cx="38" cy="39" rx="2" ry="4" fill="#322a39" />
    {head === 'crown' && <path d="M19 24L16 11L25 16L32 7L39 16L48 11L45 24Z" fill="#f1cb69" stroke="#b38c36" strokeWidth="1.1" strokeLinejoin="round" />}
    {head === 'cap' && <g><path d="M20 27Q20 14 32 14Q44 14 44 27Z" fill="#e0533d" stroke="#8c2c1f" strokeWidth="1.1" strokeLinejoin="round" /><path d="M40 26L53 28Q53 31 41 30Z" fill="#c4402c" stroke="#8c2c1f" strokeWidth="1.1" strokeLinejoin="round" /></g>}
    {head === 'beret' && <g><ellipse cx="30" cy="20" rx="15" ry="7" fill="#4f6fd6" stroke="#2a3c86" strokeWidth="1.1" /><circle cx="30" cy="12.5" r="2" fill="#2a3c86" /></g>}
    {head === 'wizard' && <g><path d="M17 26Q32 22 47 26L35 3Q33 0 31 3Z" fill="#6d4cc4" stroke="#3e2780" strokeWidth="1.1" strokeLinejoin="round" /><circle cx="32" cy="15" r="2" fill="#ffe08a" /></g>}
    {head === 'tuft' && <path d="M32 21Q26 12 30 6Q33 12 36 5Q39 13 32 21Z" fill="#5a3a22" stroke="#2f1d10" strokeWidth="1" strokeLinejoin="round" />}
    {eyewear === 'round' && <g fill="none" stroke="#3a2c46" strokeWidth="1.6"><circle cx="25" cy="39" r="5" /><circle cx="38" cy="39" r="5" /><path d="M30 39H33" /></g>}
    {eyewear === 'square' && <g fill="none" stroke="#3a2c46" strokeWidth="1.6"><rect x="19.5" y="34.5" width="11" height="9" rx="2" /><rect x="32.5" y="34.5" width="11" height="9" rx="2" /><path d="M30.5 39H32.5" /></g>}
    {eyewear === 'monocle' && <g fill="none" stroke="#b38c36" strokeWidth="1.6"><circle cx="38" cy="39" r="5.2" /><path d="M42 43Q45 50 42 54" /></g>}
    {face === 'moustache' && <path d="M24 47Q28 44 32 47Q36 44 40 47Q36 51 32 48Q28 51 24 47Z" fill="#4a2f1c" />}
    {face === 'freckles' && <g fill="#a85a3a" opacity=".7"><circle cx="22" cy="45" r=".9" /><circle cx="25" cy="47" r=".9" /><circle cx="39" cy="47" r=".9" /><circle cx="42" cy="45" r=".9" /></g>}
    {!crown && face !== 'moustache' && <path d="M27 46Q32 51 37 46" stroke="#322a39" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
    <path d="M22 30Q23 26 27 27" stroke="#fff" strokeWidth="2.2" opacity=".3" fill="none" strokeLinecap="round" />
  </svg>;
}
