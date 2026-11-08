// Picks the character renderer from Options → Display → "Character style".
// Gummy (default, src/characters/gummy) and mid-poly puppets (src/characters/midpoly) share one scene-facing API.
import type { ReactNode } from "react";
import { useGame } from "../game/store.ts";
import { GummyCharacter, GummyAdvisor } from "./gummy/GummyCharacter.tsx";
import { MidpolyCharacter, MidpolyOwl } from "./midpoly/MidpolyCharacter.tsx";

type Vec3 = [number, number, number];
export interface CharacterProps {
  url: string; anim?: string; position?: Vec3; rotationY?: number; scale?: number; aid?: string; crown?: boolean; speed?: number;
  children?: ReactNode; onOneShotEnd?: () => void;
  /** gummy: walking squash/hop */
  locomotion?: boolean;
  /** mid-poly: right arm held out; gummy: object held in front of the body */
  carry?: boolean; handChildren?: ReactNode;
}

const useStyle = () => useGame((s) => s.settings.characterStyle ?? "gummy");

export function Character(props: CharacterProps) {
  const style = useStyle();
  const { locomotion, carry, handChildren, children, ...rest } = props;
  if (style === "midpoly") return <MidpolyCharacter {...rest} carry={carry} handChildren={handChildren}>{children}</MidpolyCharacter>;
  return (
    <GummyCharacter {...rest} locomotion={locomotion}>
      {children}
      {carry && handChildren ? <group position={[0.28, 0.42, 0.32]}>{handChildren}</group> : null}
    </GummyCharacter>
  );
}

export function Owl(props: { position?: Vec3; rotationY?: number; scale?: number; talking?: boolean; happy?: boolean }) {
  const style = useStyle();
  return style === "midpoly" ? <MidpolyOwl {...props} /> : <GummyAdvisor {...props} />;
}
