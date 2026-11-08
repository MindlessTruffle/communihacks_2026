import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useLoader, type ThreeElements } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assembleCharacter, type BlinkFrame } from './assembly.ts';
import { resolveAppearance, type AppearanceInput } from './appearance.ts';
export type GummyCharacterProps = Omit<ThreeElements['group'], 'children' | 'dispose'> & {
  appearance: AppearanceInput;
  blinkFrame?: BlinkFrame;
  assetUrl?: string;
};
export function GummyCharacter({ appearance, blinkFrame = 0, assetUrl = '/gummy_visitors.glb', ...props }: GummyCharacterProps) {
  const library = useLoader(GLTFLoader, assetUrl);
  const key = JSON.stringify(resolveAppearance(appearance));
  const character = useMemo(() => assembleCharacter(library.scene, JSON.parse(key)), [library.scene, key]);
  useLayoutEffect(() => character.setEyes(character.appearance.eyes, blinkFrame), [character, blinkFrame]);
  useEffect(() => () => character.dispose(), [character]);
  return <group {...props} dispose={null}><primitive object={character.root} dispose={null} /></group>;
}
