// DEV-ONLY cinematic camera + time-scale hook for trailer capture. Enabled by `?cine=1`; fully inert otherwise (and tree-shaken from prod
// because App.tsx only imports it behind import.meta.env.DEV). Never touches game state.
//
// window.__cine = {
//   mode: "off" | "abs" | "rel",
//   // abs: pos / target / fov are used as-is. rel: offsets from the game's own camera, which keeps looking at a point `focus` m ahead.
//   pos: [x,y,z], target: [x,y,z], fov: number,
//   off: [right, up, forward], focus: number, lift: number (aim point offset along the camera's up axis),
//   timeScale: number,   // scales useFrame delta + clock.elapsedTime (slow-mo for r3f-driven animation)
// }
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";

interface Cine { mode: "off" | "abs" | "rel"; pos: [number, number, number]; target: [number, number, number]; fov: number; off: [number, number, number]; focus: number; lift: number; roll: number; timeScale: number }
const w = window as unknown as { __cine?: Cine };
const on = typeof window !== "undefined" && new URLSearchParams(location.search).get("cine") === "1";
if (on) w.__cine = { mode: "off", pos: [0, 2, 8], target: [0, 1, 0], fov: 30, off: [0, 0, 0], focus: 6, lift: 0, roll: 0, timeScale: 1 };

const _savedP = new THREE.Vector3(), _savedQ = new THREE.Quaternion();
let _saved = false, _savedFov = 30;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3();

export function CineCam() {
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    if (!on) return;
    const orig = clock.getDelta.bind(clock);
    clock.getDelta = () => { const d = orig(); const s = w.__cine?.timeScale ?? 1; if (s !== 1) clock.elapsedTime -= d * (1 - s); return d * s; };
    return () => { clock.getDelta = orig; };
  }, [clock]);
  // priority 0.5: after the scene's own camera rigs (0), before the postprocessing composer renders (1)
  useFrame(({ camera }) => {
    const c = w.__cine;
    if (!on || !c || c.mode === "off") return;
    const cam = camera as THREE.PerspectiveCamera;
    _savedP.copy(cam.position); _savedQ.copy(cam.quaternion); _savedFov = cam.fov; _saved = true; // restored after render so the scene's own rig never sees our offset
    if (c.mode === "abs") {
      if (cam.view?.enabled) cam.clearViewOffset(); // the court rig frames with a view offset; absolute shots want none
      cam.position.set(...c.pos);
      cam.lookAt(_t.set(...c.target));
    } else {
      cam.getWorldDirection(_f);
      _r.crossVectors(_f, cam.up).normalize();
      _u.crossVectors(_r, _f).normalize();
      _t.copy(cam.position).addScaledVector(_f, c.focus).addScaledVector(_u, c.lift);
      cam.position.addScaledVector(_r, c.off[0]).addScaledVector(_u, c.off[1]).addScaledVector(_f, c.off[2]);
      cam.lookAt(_t);
    }
    if (c.roll) cam.rotateZ(c.roll);
    if (cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }, 0.5);
  useFrame(({ camera }) => {
    if (!_saved) return;
    _saved = false;
    camera.position.copy(_savedP); camera.quaternion.copy(_savedQ);
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.fov !== _savedFov) { cam.fov = _savedFov; cam.updateProjectionMatrix(); }
  }, 2);
  return null;
}
