// Dev-only: http://localhost:PORT/chargallery.html?anim=walk&ids=tilly,marlo&speed=1&cam=wide
import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { Character } from "../scenes/common.tsx";
import { CHARACTERS, RULER_MODELS } from "../game/content/characters.ts";

const q = new URLSearchParams(location.search);
const anim = q.get("anim") ?? "idle";
const speed = Number(q.get("speed") ?? 1);
const rulers = RULER_MODELS.map((r) => ({ id: r.id, model: `/models/chars/${r.id}.glb`, aid: undefined as string | undefined, scale: 1 }));
const cast = Object.values(CHARACTERS).filter((c) => c.id !== "advisor").map((c) => ({ id: c.id, model: c.model, aid: c.aid, scale: c.scale ?? 1 }));
const all = [...rulers, ...cast];
const ids = q.get("ids")?.split(",");
const list = ids ? all.filter((c) => ids.includes(c.id)) : all;
const cols = Number(q.get("cols") ?? Math.min(8, list.length));
const sp = 0.95;
const crown = q.get("crown") === "1";
const rot = Number(q.get("rot") ?? 0);
const zoom = Number(q.get("zoom") ?? 1);

function App() {
  const rows = Math.ceil(list.length / cols);
  const w = cols * sp, h = rows * 1.1;
  return (
    <Canvas shadows camera={{ position: [(cols - 1) * sp / 2, 0.8 - (rows - 1) * 0.55, (Math.max(w / 1.7, h) * 1.9 + 1) / zoom], fov: 30 }} gl={{ antialias: true }} onCreated={({ camera }) => camera.lookAt((cols - 1) * sp / 2, 0.8 - (rows - 1) * 0.55, 0)}>
      <color attach="background" args={["#cfe6f5"]} />
      <hemisphereLight args={["#ffffff", "#c9b08a", 1.2]} />
      <directionalLight position={[3, 6, 5]} intensity={2.2} castShadow shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-mapSize={[2048, 2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={8} shadow-camera-bottom={-8} />
      <Suspense fallback={null}>
        {list.map((c, i) => (
          <Character key={c.id} url={c.model} aid={c.aid} anim={anim} speed={speed} crown={crown && c.id.startsWith("ruler")}
            rotationY={rot} position={[(i % cols) * sp, -Math.floor(i / cols) * 1.1, 0]} scale={2 * c.scale} />
        ))}
      </Suspense>
    </Canvas>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
