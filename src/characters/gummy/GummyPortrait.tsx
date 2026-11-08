import { manifest } from './appearance.ts';
import { gummyAppearance } from './profiles.ts';

/** Small code-native portrait matching the selected blob's colour and body. */
export function GummyPortrait({ id, color }: { id: string; color?: string }) {
  const appearance = gummyAppearance(id, true);
  const chubby = appearance.body === 'chubby';
  return <svg viewBox="0 0 64 80" aria-hidden="true" style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
    <ellipse cx="32" cy="73" rx="20" ry="3" fill="#332743" opacity=".12" />
    <path d={chubby ? 'M21 28Q20 20 32 20Q44 20 43 28C43 40 54 48 53 61Q52 73 32 73Q12 73 11 61C10 48 21 40 21 28Z' : 'M21 28Q20 20 32 20Q44 20 43 28L47 60Q48 73 32 73Q16 73 17 60Z'} fill={color || manifest.colors[appearance.color]} />
    <ellipse cx="25" cy="39" rx="2" ry="4" fill="#322a39" /><ellipse cx="38" cy="39" rx="2" ry="4" fill="#322a39" />
    <path d="M19 24L16 11L25 16L32 7L39 16L48 11L45 24Z" fill="#f1cb69" stroke="#b38c36" strokeWidth="1.1" strokeLinejoin="round" />
    <path d="M22 30Q23 26 27 27" stroke="#fff" strokeWidth="2.2" opacity=".3" fill="none" strokeLinecap="round" />
  </svg>;
}
