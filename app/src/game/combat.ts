import { ARENA } from "./config";
import { neutralInput } from "./input";
import type { AttackKind, AttackSpec, CharacterId, Difficulty, Fighter, InputFrame } from "./types";

export interface CombatEvents {
  onHit: (x: number, y: number, color: number, heavy: boolean) => void;
  onBlock: (x: number, y: number) => void;
  onSound: (id: "light" | "heavy" | "block" | "special" | "super" | "jump" | "ko") => void;
  onSuper: (f: Fighter) => void;
  onKO: (loser: 1 | 2) => void;
}

const BASE = {
  light: { startup: 0.08, active: 0.09, recovery: 0.13, damage: 5, range: 0.95, hitstun: 0.22, knockback: 1.2, launch: 0, meter: 7, lunge: 0.15, cancelStart: 0.1, cancelEnd: 0.28 },
  heavy: { startup: 0.18, active: 0.12, recovery: 0.25, damage: 10, range: 1.2, hitstun: 0.36, knockback: 2.8, launch: 1.5, meter: 10, lunge: 0.25, cancelStart: 0.22, cancelEnd: 0.43 },
  special: { startup: 0.22, active: 0.18, recovery: 0.34, damage: 14, range: 1.55, hitstun: 0.5, knockback: 4.3, launch: 3.6, meter: 12, lunge: 1.0, cancelStart: 0.27, cancelEnd: 0.46 },
  air: { startup: 0.09, active: 0.22, recovery: 0.16, damage: 8, range: 1.05, hitstun: 0.32, knockback: 2, launch: 1, meter: 9, lunge: 0.2, cancelStart: 1, cancelEnd: 1 },
  throw: { startup: 0.12, active: 0.08, recovery: 0.38, damage: 12, range: 0.7, hitstun: 0.7, knockback: 5, launch: 4.2, meter: 12, lunge: 0, cancelStart: 1, cancelEnd: 1 },
  super: { startup: 0.34, active: 0.42, recovery: 0.55, damage: 28, range: 2.2, hitstun: 0.95, knockback: 6.5, launch: 5.2, meter: 0, lunge: 1.8, cancelStart: 1, cancelEnd: 1 },
} as const;

const NAMES: Record<CharacterId, Record<AttackKind, string>> = {
  seorin: { light: "霜刃", heavy: "月轮踢", special: "冰华回翔", air: "燕返", throw: "月蚀投", super: "月影十六连" },
  yena: { light: "节拍刺拳", heavy: "赤红重击", special: "燃星滑步", air: "热焰下击", throw: "心跳背摔", super: "赤红节拍" },
};

export function makeFighter(id: CharacterId, x: number, facing: 1 | -1): Fighter {
  return {
    id, name: id === "seorin" ? "尹世琳" : "姜艺娜", x, y: 0, vx: 0, vy: 0, facing,
    hp: 100, meter: 0, wins: 0, pose: "idle", stateTime: 0, attack: null, attackElapsed: 0,
    attackConnected: false, attackVariant: 0, bufferedAttack: null, bufferedAttackTime: 0, bufferedVariant: 0,
    hitstun: 0, blockstun: 0, invulnerable: 0,
    combo: 0, comboTimer: 0, crouching: false, blocking: false, flash: 0, aiClock: 0,
    aiChoice: "idle", aiGuard: 0, dashTime: 0, dashDir: 0, lastDamage: 0,
  };
}

function attackFor(f: Fighter, kind: AttackKind, variant: number): AttackSpec {
  const b = BASE[kind];
  const speed = f.id === "yena" ? 0.9 : 1;
  const range = f.id === "seorin" && (kind === "heavy" || kind === "special") ? 1.16 : 1;
  const damage = f.id === "yena" && kind === "light" ? 0.85 : 1;
  const label = kind === "special" ? (variant === 1 ? (f.id === "seorin" ? "升月踢" : "烈焰升拳") : variant === 2 ? (f.id === "seorin" ? "霜地步" : "红潮突袭") : NAMES[f.id][kind]) : NAMES[f.id][kind];
  return {
    kind, label, startup: b.startup * speed, active: b.active, recovery: b.recovery,
    damage: Math.round(b.damage * damage * (variant === 1 ? 1.08 : 1)), range: b.range * range * (variant === 2 ? 1.15 : 1),
    minY: kind === "air" ? -0.2 : 0, maxY: kind === "special" && variant === 1 ? 3.4 : 2.35,
    hitstun: b.hitstun, knockback: b.knockback, launch: b.launch + (variant === 1 ? 2.3 : 0), meter: b.meter,
    lunge: b.lunge * (variant === 2 ? 1.8 : 1), cancelStart: b.cancelStart, cancelEnd: b.cancelEnd,
    color: f.id === "seorin" ? 0x69e7ff : 0xff4f70,
  };
}

export class CombatWorld {
  p1 = makeFighter("seorin", -1.8, 1);
  p2 = makeFighter("yena", 1.8, -1);
  timer: number = ARENA.roundTime;
  hitstop = 0;
  koSent = false;
  private aiDelay = 1.2;
  private aiInput = neutralInput();

  constructor(private events: CombatEvents) {}

  setup(id1: CharacterId, id2: CharacterId): void {
    const w1 = this.p1.wins, w2 = this.p2.wins;
    this.p1 = makeFighter(id1, -1.8, 1); this.p2 = makeFighter(id2, 1.8, -1);
    this.p1.wins = w1; this.p2.wins = w2;
    this.timer = ARENA.roundTime; this.koSent = false; this.hitstop = 0; this.aiDelay = 1.2;
  }

  update(dt: number, in1: InputFrame, in2: InputFrame, difficulty: Difficulty, aiEnabled: boolean): void {
    if (this.hitstop > 0) {
      this.captureAttack(this.p1, in1); this.captureAttack(this.p2, in2);
      this.hitstop -= dt; return;
    }
    this.timer = Math.max(0, this.timer - dt);
    this.aiDelay = Math.max(0, this.aiDelay - dt);
    const p2input = aiEnabled && this.aiDelay <= 0 ? this.thinkAI(dt, difficulty) : in2;
    this.updateFighter(this.p1, this.p2, in1, dt);
    this.updateFighter(this.p2, this.p1, p2input, dt);
    this.separate();
    this.checkStrike(this.p1, this.p2); this.checkStrike(this.p2, this.p1);
    if (!this.koSent && (this.p1.hp <= 0 || this.p2.hp <= 0 || this.timer <= 0)) {
      this.koSent = true;
      let loser: 1 | 2;
      if (this.p1.hp === this.p2.hp) loser = this.p1.lastDamage >= this.p2.lastDamage ? 2 : 1;
      else loser = this.p1.hp < this.p2.hp ? 1 : 2;
      const dead = loser === 1 ? this.p1 : this.p2; dead.hp = Math.max(0, dead.hp); dead.pose = "ko"; dead.attack = null;
      this.events.onKO(loser); this.events.onSound("ko");
    }
  }

  private updateFighter(f: Fighter, foe: Fighter, input: InputFrame, dt: number): void {
    f.stateTime += dt; f.flash = Math.max(0, f.flash - dt); f.invulnerable = Math.max(0, f.invulnerable - dt);
    f.comboTimer = Math.max(0, f.comboTimer - dt); if (f.comboTimer <= 0) f.combo = 0;
    f.dashTime = Math.max(0, f.dashTime - dt); f.bufferedAttackTime = Math.max(0, f.bufferedAttackTime - dt);
    f.blockstun = Math.max(0, f.blockstun - dt); f.hitstun = Math.max(0, f.hitstun - dt);
    this.captureAttack(f, input);
    f.crouching = false; f.blocking = false;
    if (f.pose === "ko") { this.physics(f, dt); return; }
    if (f.pose === "down") {
      this.physics(f, dt);
      if (f.y <= 0 && f.stateTime > 0.75) { f.pose = "idle"; f.invulnerable = 0.35; }
      return;
    }
    if (f.hitstun > 0) { f.pose = "hit"; f.vx *= Math.pow(0.03, dt); this.physics(f, dt); return; }
    if (f.blockstun > 0) { f.pose = "block"; f.blocking = true; f.vx *= Math.pow(0.08, dt); this.physics(f, dt); return; }

    if (f.attack) {
      f.attackElapsed += dt; f.pose = "attack";
      const a = f.attack;
      const activeStart = a.startup, activeEnd = a.startup + a.active;
      if (f.attackElapsed >= activeStart && f.attackElapsed <= activeEnd) f.vx = f.facing * a.lunge * 2.1;
      else f.vx *= Math.pow(0.015, dt);
      if (f.attackConnected && f.attackElapsed >= a.cancelStart && f.attackElapsed <= a.cancelEnd && this.startBufferedAttack(f, true)) {
        this.physics(f, dt); return;
      }
      if (f.attackElapsed >= a.startup + a.active + a.recovery) {
        f.attack = null; f.stateTime = 0;
        if (!this.startBufferedAttack(f)) f.pose = f.y > 0 ? "jump" : "idle";
      }
      this.physics(f, dt); return;
    }

    if (f.y <= 0) {
      const away = foe.x > f.x ? input.left : input.right;
      f.blocking = away && !input.light && !input.heavy && !input.special;
      f.crouching = input.down;
      if (input.dashLeft || input.dashRight) { f.dashTime = 0.16; f.dashDir = input.dashLeft ? -1 : 1; f.pose = "walk"; f.vx = f.dashDir * 8.2; }
      else if (this.startBufferedAttack(f)) { f.dashTime = 0; }
      else if (f.dashTime > 0) { f.pose = "walk"; f.vx = f.dashDir * 8.2; }
      else if (input.up) { f.vy = ARENA.jump; f.pose = "jump"; f.vx = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 3.4; this.events.onSound("jump"); }
      else if (f.blocking) { f.pose = "block"; f.vx = 0; }
      else {
        const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const speed = f.id === "yena" ? 3.45 : 3.05;
        f.vx = dir * speed * (input.down ? 0 : 1);
        f.pose = dir === 0 ? (input.down ? "crouch" : "idle") : "walk";
      }
    } else {
      f.pose = "jump";
      if (f.bufferedAttack && ["light", "heavy", "special"].includes(f.bufferedAttack)) {
        f.bufferedAttack = "air"; f.bufferedVariant = 0; this.startBufferedAttack(f);
      }
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0); f.vx += dir * dt * 12; f.vx = Math.max(-4.2, Math.min(4.2, f.vx));
    }
    if (f.pose !== "attack" && f.hitstun <= 0) f.facing = foe.x >= f.x ? 1 : -1;
    this.physics(f, dt);
  }

  private captureAttack(f: Fighter, input: InputFrame): void {
    const kind: AttackKind | null = input.super && f.meter >= 100 ? "super" : input.throw ? "throw" : input.special ? "special" : input.heavy ? "heavy" : input.light ? "light" : null;
    if (!kind) return;
    f.bufferedAttack = kind; f.bufferedAttackTime = 0.2;
    f.bufferedVariant = kind === "special" ? (input.up ? 1 : input.down || input.right || input.left ? 2 : 0) : 0;
  }

  private startBufferedAttack(f: Fighter, cancel = false): boolean {
    const kind = f.bufferedAttack;
    if (!kind || f.bufferedAttackTime <= 0) return false;
    if (cancel && (kind === "light" || kind === "throw" || kind === "air" || kind === "heavy" && f.attack?.kind !== "light")) return false;
    f.bufferedAttack = null; f.bufferedAttackTime = 0;
    this.startAttack(f, kind, f.bufferedVariant);
    return true;
  }

  private startAttack(f: Fighter, kind: AttackKind, variant: number): void {
    if (kind === "super") { if (f.meter < 100) return; f.meter = 0; }
    f.attack = attackFor(f, kind, variant); f.attackElapsed = 0; f.attackConnected = false; f.attackVariant = variant;
    f.pose = "attack"; f.stateTime = 0; f.blocking = false;
    if (kind === "super") { this.events.onSuper(f); this.events.onSound("super"); }
    else if (kind === "special") this.events.onSound("special");
  }

  private physics(f: Fighter, dt: number): void {
    if (f.y > 0 || f.vy > 0) f.vy -= ARENA.gravity * dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.y <= 0) {
      const wasAir = f.y < 0 || f.vy < 0; f.y = 0; f.vy = 0;
      if (wasAir && f.pose === "hit") { f.pose = "down"; f.stateTime = 0; f.hitstun = 0; }
      else if (wasAir && f.pose === "jump") { f.pose = "idle"; f.vx *= 0.65; }
    }
    f.x = Math.max(ARENA.minX, Math.min(ARENA.maxX, f.x));
    if (f.pose !== "walk" && f.pose !== "jump" && f.pose !== "attack") f.vx *= Math.pow(0.02, dt);
  }

  private separate(): void {
    const a = this.p1, b = this.p2; const d = b.x - a.x; const min = 0.58;
    if (Math.abs(d) < min && a.y < 1.1 && b.y < 1.1) { const push = (min - Math.abs(d)) * 0.5; const sign = d >= 0 ? 1 : -1; a.x -= push * sign; b.x += push * sign; }
  }

  private checkStrike(a: Fighter, d: Fighter): void {
    const atk = a.attack;
    if (!atk || a.attackConnected || d.invulnerable > 0 || d.pose === "ko") return;
    if (a.attackElapsed < atk.startup || a.attackElapsed > atk.startup + atk.active) return;
    const forward = (d.x - a.x) * a.facing;
    const vertical = d.y + 1.05 - (a.y + 1.05);
    if (forward < 0.05 || forward > atk.range || vertical < atk.minY - 0.8 || vertical > atk.maxY - 1.1) return;
    a.attackConnected = true;
    const hitX = a.x + a.facing * Math.min(atk.range * 0.72, Math.abs(d.x - a.x) * 0.8);
    const hitY = Math.max(0.8, d.y + (d.crouching ? 0.75 : 1.25));
    if (d.blocking && atk.kind !== "throw") {
      const chip = atk.kind === "super" ? 3 : atk.damage > 10 ? 1 : 0;
      d.hp = Math.max(1, d.hp - chip); d.blockstun = atk.hitstun * 0.65; d.vx = a.facing * atk.knockback * 0.55;
      d.meter = Math.min(100, d.meter + 5); a.meter = Math.min(100, a.meter + 3);
      this.events.onBlock(hitX, hitY); this.events.onSound("block"); this.hitstop = 0.035; return;
    }
    const scale = Math.max(0.48, 1 - a.combo * 0.075);
    const damage = Math.max(1, Math.round(atk.damage * scale));
    d.hp = Math.max(0, d.hp - damage); d.lastDamage = damage; d.flash = 0.09;
    d.hitstun = atk.hitstun; d.pose = "hit"; d.attack = null; d.vx = a.facing * atk.knockback; d.vy = Math.max(d.vy, atk.launch);
    a.combo = a.comboTimer > 0 ? a.combo + 1 : 1; a.comboTimer = 1.15;
    a.meter = Math.min(100, a.meter + atk.meter); d.meter = Math.min(100, d.meter + atk.meter * 0.65);
    this.hitstop = atk.kind === "super" ? 0.14 : atk.damage >= 12 ? 0.085 : 0.045;
    this.events.onHit(hitX, hitY, atk.color, atk.damage >= 10); this.events.onSound(atk.damage >= 10 ? "heavy" : "light");
  }

  private thinkAI(dt: number, difficulty: Difficulty): InputFrame {
    const f = this.p2, foe = this.p1, out = this.aiInput;
    Object.assign(out, neutralInput());
    f.aiClock -= dt; f.aiGuard = Math.max(0, f.aiGuard - dt);
    const dist = Math.abs(foe.x - f.x); const dir = foe.x > f.x ? "right" : "left"; const away = foe.x > f.x ? "left" : "right";
    const reaction = difficulty === "easy" ? 0.34 : difficulty === "normal" ? 0.19 : 0.1;
    if (f.aiClock <= 0) {
      f.aiClock = reaction + ((f.stateTime * 17) % 0.12);
      const incoming = foe.attack && dist < foe.attack.range + 0.4;
      const roll = ((f.stateTime * 113 + f.hp * 7 + this.timer * 3) % 100) / 100;
      if (incoming && roll < (difficulty === "hard" ? 0.8 : difficulty === "normal" ? 0.55 : 0.25)) { f.aiChoice = "guard"; f.aiGuard = 0.35; }
      else if (f.meter >= 100 && dist < 2.1 && roll > 0.35) f.aiChoice = "super";
      else if (dist > 3.2) f.aiChoice = roll > 0.82 ? "jump" : "approach";
      else if (dist > 1.35) f.aiChoice = roll > 0.6 ? "special" : "approach";
      else f.aiChoice = roll < 0.18 ? "guard" : roll < 0.42 ? "light" : roll < 0.66 ? "heavy" : roll < 0.82 ? "special" : "throw";
      if (difficulty === "easy" && roll < 0.25) f.aiChoice = "idle";
    }
    if (f.aiGuard > 0 || f.aiChoice === "guard") out[away] = true;
    else if (f.aiChoice === "approach") out[dir] = true;
    else if (f.aiChoice === "jump") { out[dir] = true; out.up = true; f.aiChoice = "idle"; }
    else if (f.aiChoice === "light" || f.aiChoice === "heavy" || f.aiChoice === "special" || f.aiChoice === "throw" || f.aiChoice === "super") {
      out[f.aiChoice] = true; if (f.aiChoice === "special" && dist > 1.5) out[dir] = true; f.aiChoice = "idle";
    }
    return out;
  }
}
