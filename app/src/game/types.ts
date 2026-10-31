export type CharacterId = "seorin" | "yena";
export type GameMode = "ai" | "versus";
export type Difficulty = "easy" | "normal" | "hard";
export type Phase = "title" | "select" | "intro" | "fight" | "roundOver" | "matchOver" | "paused";
export type FighterPose = "idle" | "walk" | "jump" | "crouch" | "attack" | "hit" | "block" | "down" | "ko" | "win";
export type AttackKind = "light" | "heavy" | "special" | "air" | "throw" | "super";

export interface AttackSpec {
  kind: AttackKind;
  label: string;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  range: number;
  minY: number;
  maxY: number;
  hitstun: number;
  knockback: number;
  launch: number;
  meter: number;
  lunge: number;
  cancelStart: number;
  cancelEnd: number;
  color: number;
}

export interface Fighter {
  id: CharacterId;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  meter: number;
  wins: number;
  pose: FighterPose;
  stateTime: number;
  attack: AttackSpec | null;
  attackElapsed: number;
  attackConnected: boolean;
  attackVariant: number;
  bufferedAttack: AttackKind | null;
  bufferedAttackTime: number;
  bufferedVariant: number;
  hitstun: number;
  blockstun: number;
  invulnerable: number;
  combo: number;
  comboTimer: number;
  crouching: boolean;
  blocking: boolean;
  flash: number;
  aiClock: number;
  aiChoice: string;
  aiGuard: number;
  dashTime: number;
  dashDir: number;
  lastDamage: number;
}

export interface InputFrame {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
  throw: boolean;
  super: boolean;
  dashLeft: boolean;
  dashRight: boolean;
}

export interface Snapshot {
  phase: Phase;
  timer: number;
  round: number;
  message: string;
  submessage: string;
  p1: Fighter;
  p2: Fighter;
  mode: GameMode;
  difficulty: Difficulty;
  muted: boolean;
  quality: "high" | "low";
  winner: 0 | 1 | 2;
}
