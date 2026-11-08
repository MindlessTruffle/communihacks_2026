import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useGame } from '../../game/store.ts';
import { assembleCharacter, type BlinkFrame } from './assembly.ts';
import { manifest } from './appearance.ts';
import { GUMMY_URL, gummyAppearance, gummyId } from './profiles.ts';

type Vec3 = [number, number, number];
export type GummyCharacterProps = {
  url: string; anim?: string; position?: Vec3; rotationY?: number; scale?: number;
  aid?: string; crown?: boolean; speed?: number; children?: ReactNode; onOneShotEnd?: () => void;
  locomotion?: boolean;
};
const ONE_SHOT: Record<string, number> = {
  'emote-yes': 1.15, 'emote-no': 1.15, 'pick-up': 1.25,
  'interact-right': 1.7, 'interact-left': 1.7, jump: .75, die: 1.3,
};

function MobilityAid({ url, moving }: { url: string; moving: boolean }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => {
    const object = scene.clone(true);
    object.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; } });
    return object;
  }, [scene]);
  const wheels = useMemo(() => [clone.getObjectByName('wheel_l'), clone.getObjectByName('wheel_r')].filter(Boolean) as THREE.Object3D[], [clone]);
  useFrame((_, delta) => { if (moving) for (const wheel of wheels) wheel.rotation.x += Math.min(delta, .1) * 16; });
  return <group scale={.44} position={url.includes('cane') ? [-.12, 0, .06] : undefined}><primitive object={clone} dispose={null} /></group>;
}

/** Same scene-facing API as the puppet renderer, with one shared lightweight GLB. */
export function GummyCharacter({ anim = 'idle', position, rotationY = 0, scale = 1, crown = false, speed = 1, locomotion = false, children, onOneShotEnd, ...props }: GummyCharacterProps) {
  let url = props.url, aid = props.aid;
  if (import.meta.env.DEV && !crown && gummyId(url) !== 'advisor') {
    const forced = new URLSearchParams(location.search).get('forceVisitor');
    if (forced && /^[a-z-]+$/.test(forced)) { url = `/models/chars/${forced}.glb`; aid = forced === 'maya' ? '/models/chars/wheelchair-power.glb' : forced === 'rosa' ? '/models/chars/cane.glb' : undefined; }
  }
  const library = useGLTF(GUMMY_URL);
  const customColor = useGame(s => !crown ? null : s.phase === 'setup' || s.phase === 'title' ? s.previewColor : s.run?.rulerColor);
  const appearance = gummyAppearance(url, crown), key = JSON.stringify(appearance);
  const character = useMemo(() => {
    const assembled = assembleCharacter(library.scene, JSON.parse(key));
    const bodyMaterial = customColor ? (assembled.body.material as THREE.MeshStandardMaterial).clone() : null;
    if (bodyMaterial) { bodyMaterial.color.set(customColor!); assembled.body.material = bodyMaterial; }
    const dispose = assembled.dispose;
    assembled.dispose = () => { bodyMaterial?.dispose(); dispose(); };
    assembled.root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = false; } });
    assembled.root.name = `Gummy:${gummyId(url)}`;
    return assembled;
  }, [library.scene, key, url, customColor]);
  const motion = useRef<THREE.Group>(null!);
  const wheel = !!aid?.includes('wheelchair');
  const moving = anim === 'walk' || anim === 'wheelchair-move-forward';
  const bodyHeight = manifest.bodies[appearance.body].height;
  // Preserve the existing scene scale: the old standing figures were .4 units tall.
  const normalization = (wheel ? .3 : .4) / bodyHeight;
  const state = useRef({ t: 0, lift: 0, width: 1, height: 1, fired: false, blinkIn: 1.5 + Math.random() * 2, blinkT: -1, frame: 0 as BlinkFrame });
  const callback = useRef(onOneShotEnd); callback.current = onOneShotEnd;
  useEffect(() => { state.current.t = 0; state.current.fired = false; }, [anim, character]);
  useEffect(() => () => character.dispose(), [character]);

  useFrame((_, rawDelta) => {
    const group = motion.current; if (!group) return;
    const delta = Math.min(rawDelta, .1), stateNow = state.current;
    const reduced = useGame.getState().settings.reduceMotion;
    stateNow.t += delta * speed;
    const t = stateNow.t, duration = ONE_SHOT[anim];
    if (duration && t >= duration && !stateNow.fired) { stateNow.fired = true; callback.current?.(); }
    const envelope = duration && !stateNow.fired ? Math.sin(Math.min(1, t / duration) * Math.PI) : 0;
    const hop = !reduced && moving && !wheel ? Math.abs(Math.sin(t * 7.5)) : 0;
    const breathe = reduced ? 0 : Math.sin(t * 2) * .006;
    group.position.y = (wheel ? .11 : 0) + hop * .025 + (anim === 'jump' ? envelope * .08 : 0);
    group.scale.set(1 + hop * .025, 1 - hop * .035 + breathe, 1 + hop * .025);
    group.rotation.set(0, 0, 0);
    if (locomotion && !wheel) {
      const lively = moving && !reduced;
      const settle = 1 - Math.exp(-18 * delta);
      // The court figures keep their small reactions; the walking ruler feels like jelly.
      group.position.y = THREE.MathUtils.lerp(stateNow.lift ?? 0, hop * .065, settle);
      stateNow.lift = group.position.y;
      const wide = lively ? 1 + (1 - hop) * .04 - hop * .018 : 1;
      const tall = lively ? 1 - (1 - hop) * .055 + hop * .035 : 1;
      stateNow.width = THREE.MathUtils.lerp(stateNow.width ?? 1, wide, settle);
      stateNow.height = THREE.MathUtils.lerp(stateNow.height ?? 1, tall, settle);
      group.scale.set(stateNow.width, stateNow.height, stateNow.width);
      group.rotation.z = lively ? Math.sin(t * 7.5) * .045 : 0;
      group.rotation.x = lively ? Math.sin(t * 15) * .02 : 0;
      if (reduced) { group.position.y = 0; group.scale.setScalar(1); stateNow.lift = 0; stateNow.width = stateNow.height = 1; }
    }
    if (!reduced) {
      if (anim === 'emote-no') group.rotation.y = Math.sin(t * 15) * envelope * .12;
      else if (anim === 'emote-yes') { group.rotation.x = Math.sin(t * 12) * envelope * .065; group.position.y += envelope * .012; }
      else if (anim.startsWith('interact')) group.rotation.z = Math.sin(t * 4) * .035;
      else if (!moving && anim !== 'sit') group.rotation.z = Math.sin(t * 1.3) * .012;
    }
    stateNow.blinkIn -= delta;
    if (stateNow.blinkIn <= 0) { stateNow.blinkT = 0; stateNow.blinkIn = 2.5 + Math.random() * 3; }
    let frame: BlinkFrame = 0;
    if (stateNow.blinkT >= 0) {
      stateNow.blinkT += delta;
      frame = stateNow.blinkT < .035 ? 1 : stateNow.blinkT < .1 ? 2 : stateNow.blinkT < .15 ? 1 : 0;
      if (stateNow.blinkT >= .15) stateNow.blinkT = -1;
    }
    if (frame !== stateNow.frame) { character.setEyes(appearance.eyes, frame); stateNow.frame = frame; }
  });
  return <group position={position} rotation={[0, rotationY, 0]} scale={scale} userData={{ gummyCharacter: gummyId(url) }}>
    <group ref={motion} name={locomotion ? 'WalkingGummyMotion' : 'GummyMotion'}><group scale={normalization}><primitive object={character.root} dispose={null} /></group></group>
    {aid && <MobilityAid url={aid} moving={moving} />}
    {children}
  </group>;
}

/** Gummy interpretation of Sage Ollie; keeps the advisor's existing scene API. */
export function GummyAdvisor({ position, rotationY = 0, scale = 1, talking = false, happy = false }: {
  position?: Vec3; rotationY?: number; scale?: number; talking?: boolean; happy?: boolean;
}) {
  const group = useRef<THREE.Group>(null!);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!group.current) return;
    group.current.getWorldPosition(worldPosition);
    const cameraYaw = Math.atan2(camera.position.x - worldPosition.x, camera.position.z - worldPosition.z);
    const difference = Math.atan2(Math.sin(rotationY - cameraYaw), Math.cos(rotationY - cameraYaw));
    group.current.rotation.y = cameraYaw + Math.max(-.4, Math.min(.4, difference));
  });
  return <group ref={group} position={position}>
    <GummyCharacter url="/models/owl.glb" scale={scale * 2.1} anim={happy ? 'emote-yes' : talking ? 'interact-right' : 'idle'} />
  </group>;
}
