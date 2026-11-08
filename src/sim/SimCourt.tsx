// Multiplayer simulation, section 2 (3D): the real throne room, a row of ten gummy players, and the visitor.
import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Character, Cloud, Owl, Sky } from "../scenes/common.tsx";
import { COURT, Floor, WallExtension, CoinPile } from "../scenes/CourtScene.tsx";
import { KingdomDiorama } from "../scenes/Kingdom.tsx";
import { Lighting, PostFX } from "../scenes/look.tsx";
import { Prop, setGlow } from "../scenes/env.tsx";
import { Flame, WindowShafts } from "../scenes/fx.tsx";
import { Vfx3D } from "../fx/Vfx3D.tsx";
import { CHARACTERS } from "../game/content/characters.ts";
import { useGame } from "../game/store.ts";
import { vfx } from "../fx/vfx.ts";
import { T, VISITS, VISIT_START, VISIT_LEN, VERDICT_AT, LEAVE_AT } from "./simData.ts";
import { SimCrowd, SceneReady, type PoseFn } from "./simActors.tsx";
import { simClock, simCam, useSim } from "./simStore.ts";

const CHAR = 5;
const PS = 2.8;
const STAND_X = 4.4; // visitor spot (the real court uses 2.9; moved right so the row of players never hides them) // player scale (gummy = 0.4 m per unit)
const ROW_X0 = -6.6, ROW_DX = 1.0;
const rowPos = (i: number) => ({ x: ROW_X0 + i * ROW_DX, z: i % 2 ? 7.7 : 8.6 });

const easeOut = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

/** Players: stand in a staggered row, tap their vote (emote + ✓/✗ pop), cheer when their side wins. */
const courtPose: PoseFn = (i, t) => {
  const { x, z } = rowPos(i);
  const k = Math.floor((t - VISIT_START) / VISIT_LEN);
  let anim = "idle", icon: { name: string; k: number } | null = null, y = 0;
  if (k >= 0 && k < VISITS.length) {
    const v = VISITS[k], vt = t - VISIT_START - k * VISIT_LEN;
    const dt = vt - v.at[i];
    const fl = v.flips.find((f) => f[0] === i);
    if (fl && vt >= fl[1] && vt < v.at[i]) { // first tap was the other answer; hesitates, then changes their mind
      const d0 = vt - fl[1], other = v.votes[i] === "yes" ? "no" : "yes";
      if (d0 < 1.0) { anim = other === "yes" ? "emote-yes" : "emote-no"; icon = { name: other === "yes" ? "check" : "cross", k: d0 / 1.0 }; }
    }
    if (dt >= 0 && dt < 1.15) { anim = v.votes[i] === "yes" ? "emote-yes" : "emote-no"; }
    if (dt >= 0 && dt < 1.0) icon = { name: v.votes[i] === "yes" ? "check" : "cross", k: dt / 1.0 };
    const w = vt - VERDICT_AT;
    if (w >= 0 && w < 0.7 && v.votes[i] === v.choice) y = Math.abs(Math.sin((w / 0.7) * Math.PI * 2)) * 0.22 * (1 - w / 0.7);
  }
  const bob = Math.sin(t * 2.1 + i * 1.7) * 0.012;
  return { x, z, y: y + bob, rot: -x * 0.035 + (i % 2 ? 0.1 : -0.1), anim, speed: 1, icon };
};

function Visitor({ k }: { k: number }) {
  const v = VISITS[k], ch = CHARACTERS[v.who];
  const g = useRef<THREE.Group>(null!);
  const state = useRef({ anim: "walk" });
  const wheel = !!ch.aid?.includes("wheelchair");
  const [anim, setAnim] = useAnimState(wheel ? "wheelchair-move-forward" : "walk");
  useFrame(() => {
    const vt = simClock.t - VISIT_START - k * VISIT_LEN, grp = g.current;
    if (!grp) return;
    let x = STAND_X, rot = -1.15, a: string;
    if (vt < 0.75) { x = STAND_X + (1 - easeOut(vt / 0.75)) * 6.8; rot = -Math.PI / 2; a = wheel ? "wheelchair-move-forward" : "walk"; }
    else if (vt >= LEAVE_AT) { x = STAND_X + (vt - LEAVE_AT) * 7.5; rot = Math.PI / 2; a = wheel ? "wheelchair-move-forward" : "walk"; }
    else if (vt >= VERDICT_AT) a = v.choice === "yes" ? (wheel ? "wheelchair-look-left" : "emote-yes") : (wheel ? "wheelchair-look-right" : "emote-no");
    else a = wheel ? "wheelchair-sit" : "idle";
    grp.position.set(x, 0, COURT.visitorZ);
    grp.rotation.y = THREE.MathUtils.lerp(grp.rotation.y, rot, 0.25);
    grp.visible = vt > -0.05 && x < STAND_X + 14;
    if (a !== state.current.anim) { state.current.anim = a; setAnim(a); }
  });
  useEffect(() => { vfx.burst("dust", { x: STAND_X, y: 0.1, z: COURT.visitorZ }, { n: 5, scale: 1.6 }); }, []);
  return (
    <group ref={g} position={[STAND_X + 7, 0, COURT.visitorZ]} visible={false}>
      {v.who === "advisor" ? <Owl scale={CHAR * 0.92} /> : <Character url={ch.model} aid={ch.aid} anim={anim} scale={CHAR * (ch.scale ?? 1)} />}
    </group>
  );
}

function useAnimState(initial: string): [string, (a: string) => void] { return useState(initial); }

function CourtCamera() {
  const { camera, size } = useThree();
  const reduce = useGame((s) => s.settings.reduceMotion);
  const look = useRef(new THREE.Vector3(-1.5, 1.5, 0));
  useEffect(() => { const c = camera as THREE.PerspectiveCamera; c.clearViewOffset(); c.fov = 30; c.near = 0.5; c.far = 1800; c.updateProjectionMatrix(); }, [camera]);
  useFrame(({ clock }) => {
    const c = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const t = simClock.t, e = clock.elapsedTime;
    // wider on narrow windows: dolly so the row of players always fits
    const dist = aspect >= 1.7 ? 23 : 23 + (1.7 - aspect) * 7;
    const drift = reduce ? 0 : Math.sin(e * 0.4) * 0.45;
    const push = reduce ? 0 : Math.min(1, t / T.court) * 1.3;
    // punch toward the visitor on each verdict
    const k = Math.floor((t - VISIT_START) / VISIT_LEN);
    const vt = t - VISIT_START - k * VISIT_LEN;
    const punch = !reduce && k >= 0 && k < VISITS.length ? Math.max(0, Math.sin(Math.min(1, Math.max(0, (vt - VERDICT_AT) / 0.9)) * Math.PI)) : 0;
    c.position.set(-1.2 + drift + punch * 1.2, 4.8 - punch * 0.2, dist - push - punch * 0.9);
    look.current.lerp(new THREE.Vector3(-1.2 + punch * 1.4, 0.9, 2.5), 0.15);
    c.lookAt(look.current);
    if (aspect < 1.7) c.setViewOffset(size.width, size.height, 0, 0, size.width, size.height);
    simCam.x = c.position.x; simCam.y = c.position.y; simCam.z = c.position.z;
  });
  return null;
}

/** Confetti / hearts over the visitor on a good verdict, a soft puff on a "no". */
function CourtFx() {
  const done = useRef(-1);
  useFrame(() => {
    const t = simClock.t, k = Math.floor((t - VISIT_START) / VISIT_LEN), vt = t - VISIT_START - k * VISIT_LEN;
    if (k < 0 || k >= VISITS.length || vt < VERDICT_AT || done.current === k) return;
    done.current = k;
    const v = VISITS[k];
    const head = { x: STAND_X, y: 1.6, z: COURT.visitorZ };
    const good = v.delta.happiness + v.delta.people + v.delta.gold >= 0;
    if (v.choice === "yes" && good) {
      vfx.burst("confetti", head, { scale: 2.2, n: 34, size: 1.55 });
      vfx.burst("sparkle", head, { scale: 2.2, n: 8, size: 1.4 });
      if (v.delta.happiness > 0) vfx.burst("hearts", { ...head, y: head.y + 0.4 }, { scale: 2, n: 5, size: 1.55 });
    } else if (v.choice === "no" && v.delta.happiness >= 0) {
      vfx.burst("stars", head, { scale: 1.6, n: 8, size: 1.3 });
    } else vfx.burst("dust", head, { scale: 1.6, n: 6 });
    // the class cheers: a little confetti over the row on a win
    if (good) vfx.burst("confetti", { x: -1, y: 2.4, z: 8 }, { scale: 3.2, n: 24, size: 1.3 });
  });
  useEffect(() => { done.current = -1; }, []);
  return null;
}

export function SimCourtScene() {
  const visit = useSim((s) => s.visit);
  const gold = useSim((s) => s.gold);
  const people = useSim((s) => s.people);
  useEffect(() => { setGlow(0.9); }, []);
  return (
    <>
      <SceneReady />
      <CourtCamera />
      <Vfx3D />
      <CourtFx />
      <Sky top="#a7cfe9" bottom="#e8f0f4" />
      <Lighting preset="day" target={[-2, 0, 3]} shadow={{ size: 22, top: 22, bottom: -22, far: 90 }} sun={{ pos: [-9, 11, -21.6], color: "#ffd9a0", intensity: 7.5 }} />
      <directionalLight position={[-10, 7, 18]} intensity={0.8} color="#ece4ee" />
      {[2.9, 9.5].map((x) => <pointLight key={x} position={[x, 4.2, 0.4]} intensity={2.2} distance={6} decay={2} color="#ffb05a" />)}
      <PostFX preset="day" />
      <Prop name="court_wall" position={[0, 0, COURT.wallZ]} />
      <WallExtension z={COURT.wallZ} />
      <Prop name="court_trim" position={[0, 0, COURT.wallZ]} />
      {[2.9, 9.5].map((x) => <Prop key={x} name="sconce" position={[x, 4.4, COURT.wallZ + 0.1]} scale={1.5} cast={false} />)}
      {[2.9, 9.5].map((x) => <Flame key={x} position={[x, 4.95, COURT.wallZ + 1.0]} size={1.15} />)}
      <Prop name="banner_hang" position={[-7.7, 4.2, COURT.wallZ + 0.22]} scale={1.3} cast={false} />
      <WindowShafts xs={[-0.4, 6.2, 12.8]} wallZ={COURT.wallZ} night={false} />
      <KingdomDiorama people={people} night={false} />
      <Cloud position={[-30, 40, -150]} scale={7} />
      <Cloud position={[50, 52, -170]} scale={8} speed={0.1} />
      <Floor />
      <group position={COURT.throne}>
        <Prop name="throne_dais" />
        <group position={[-0.3, 0, 0]} rotation={[0, -0.6, 0]}>
          <Prop name="throne_chair" />
          <group position={[0.2, 1.95, 0]} rotation={[0, 1.2, 0]}>
            <Character url="/kenney/mini-characters/ruler-b.glb" anim="sit" scale={CHAR * 1.12} crown />
          </group>
        </group>
      </group>
      <group position={[COURT.owl[0], COURT.owl[1], COURT.owl[2]]}>
        <Prop name="perch" scale={[1, 1.4, 1]} />
        <Owl position={[0, 2.7, 0.02]} scale={1.5} rotationY={0.7} />
      </group>
      <CoinPile gold={gold} />
      {[visit - 1, visit].filter((k) => k >= 0 && k < VISITS.length).map((k) => <Visitor key={k} k={k} />)}
      <SimCrowd pose={courtPose} scale={PS} headY={0.46} />
    </>
  );
}
