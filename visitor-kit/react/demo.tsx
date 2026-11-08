import { Suspense, useMemo, useState, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { GummyCharacter } from './GummyCharacter.tsx';
import { generateCharacter, type Appearance } from './appearance.ts';
import type { BlinkFrame } from './assembly.ts';
function Visitors({ visitors, frame }: { visitors: Appearance[]; frame: BlinkFrame }) {
  const { size, camera } = useThree();
  const narrow = size.width < 700;
  useLayoutEffect(() => {
    if (!('zoom' in camera)) return;
    camera.position.fromArray(narrow ? [2, 10, 17] : [3, 5, 16]);
    camera.lookAt(0, 1.1, 0); camera.zoom = size.width / (narrow ? 6.6 : 15.5); camera.updateProjectionMatrix();
  }, [size.width, narrow, camera]);
  return <>{visitors.map((appearance, i) => <GummyCharacter key={i} appearance={appearance} blinkFrame={frame}
    position={narrow ? [((i % 2) - .5) * 2.2, 0, (Math.floor(i / 2) - 1) * 3.2] : [(i - 2.5) * 2, 0, 0]} />)}</>;
}
function Demo() {
  const [seed, setSeed] = useState(1), [frame, setFrame] = useState<BlinkFrame>(0);
  const visitors = useMemo(() => Array.from({ length: 6 }, (_, i) => generateCharacter(`court-${seed}-${i}`)), [seed]);
  return <main style={{ width: '100vw', height: '100dvh', background: '#172435', color: '#fff', fontFamily: 'system-ui', display: 'flex', flexDirection: 'column' }}>
    <header style={{ padding: '16px 24px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>Gummy visitors</strong>
      <button onClick={() => setSeed(s => s + 1)} style={button}>Shuffle visitors</button>
      <button onClick={() => setFrame(f => ((f + 1) % 3) as BlinkFrame)} style={button}>Eyes: {['open', 'half closed', 'closed'][frame]}</button>
      <span style={{ fontSize: 13, color: '#c1d1df' }}>Two bodies · three sizes · interchangeable cosmetics</span>
    </header>
    <section style={{ flex: 1, minHeight: 0 }}>
      <Canvas shadows={false} dpr={[1, 1.5]} orthographic camera={{ position: [3, 5, 16], zoom: 65, near: .1, far: 100 }} onCreated={({ camera }) => camera.lookAt(0, 1.1, 0)}>
        <color attach="background" args={['#172435']} /><ambientLight intensity={1.4} />
        <directionalLight position={[-5, 8, 7]} intensity={3} /><directionalLight position={[6, 4, -3]} intensity={2} />
        <Suspense fallback={null}>
          <Visitors visitors={visitors} frame={frame} />
        </Suspense>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.015, 0]}><planeGeometry args={[100, 100]} /><meshStandardMaterial color="#263a4b" roughness={.85} /></mesh>
      </Canvas>
    </section>
    <footer style={{ padding: '12px 24px', fontSize: 13, color: '#c1d1df' }}>Seed {seed}. Blinking frames are ready; automatic timing is intentionally left for later.</footer>
  </main>;
}
const button = { padding: '10px 16px', borderRadius: 8, border: '1px solid #637b90', background: '#29455b', color: '#fff', cursor: 'pointer', minHeight: 44 };
createRoot(document.getElementById('root')!).render(<Demo />);
