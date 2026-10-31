import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { AudioSystem } from "./audio";
import { CharacterRig } from "./characters";
import { CombatWorld } from "./combat";
import { QUALITY, STORAGE_KEY } from "./config";
import { Effects } from "./effects";
import { GameLoop } from "./engine";
import { Input, neutralInput } from "./input";
import { Stage } from "./stage";
import { GameUI } from "./ui";
import type { CharacterId, Difficulty, Fighter, GameMode, Phase, Snapshot } from "./types";

export class VelvetFight {
  private renderer: THREE.WebGLRenderer;
  private environment: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 180);
  private stage: Stage;
  private effects: Effects;
  private input = new Input();
  private audio = new AudioSystem();
  private ui: GameUI;
  private loop: GameLoop;
  private rig1: CharacterRig;
  private rig2: CharacterRig;
  private combat: CombatWorld;
  private phase: Phase = "title";
  private beforePause: Phase = "fight";
  private mode: GameMode = "ai";
  private difficulty: Difficulty = "normal";
  private quality: "high" | "low" = "high";
  private round = 1;
  private phaseTime = 0;
  private message = "";
  private submessage = "";
  private winner: 0 | 1 | 2 = 0;
  private cinematic = 0;
  private cinematicFighter = 1;
  private time = 0;
  private pickTurn: 1 | 2 = 1;
  private fps = 60;
  private lowFpsTime = 0;
  private cameraTarget = new THREE.Vector3();
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.pixelRatioHigh));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.environment.texture; this.scene.environmentIntensity = 0.65; pmrem.dispose();
    this.stage = new Stage(this.scene); this.effects = new Effects(this.scene);
    this.rig1 = new CharacterRig("seorin"); this.rig2 = new CharacterRig("yena"); this.scene.add(this.rig1.root, this.rig2.root);
    this.scene.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];
      materials.forEach((item) => { if (item instanceof THREE.MeshBasicMaterial) item.name = `${object.type}:${item.map ? "mapped" : "plain"}:${item.vertexColors ? "vertex-color" : "auto-color"}`; });
    });
    this.combat = new CombatWorld({
      onHit: (x, y, color, heavy) => this.effects.burst(x, y, color, heavy ? 1.35 : 0.85),
      onBlock: (x, y) => this.effects.burst(x, y, 0xa8c7ff, 0.65),
      onSound: (id) => this.audio.sfx(id),
      onSuper: (f) => this.onSuper(f),
      onKO: (loser) => this.onKO(loser),
    });
    this.ui = new GameUI(uiRoot, {
      quick: (mode) => this.startMatch(mode), select: () => this.openSelect(),
      pick: (id) => this.pick(id), mode: (mode) => { this.mode = mode; this.audio.sfx("ui"); },
      difficulty: (d) => { this.difficulty = d; this.audio.sfx("ui"); }, fight: () => this.startMatch(this.mode),
      resume: () => this.resume(), restart: () => this.restart(), home: () => this.home(),
      mute: () => this.audio.toggleMute(), quality: () => this.toggleQuality(),
    });
    this.loop = new GameLoop({ update: (dt) => this.update(dt), render: () => this.render() });
    this.restoreSettings(); this.resize(); this.syncRigs(); this.audio.startMusic();
  }

  start(): void { this.loop.start(); }
  private restoreSettings(): void {
    try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); if (["easy", "normal", "hard"].includes(s.difficulty)) this.difficulty = s.difficulty; if (s.quality === "low" || s.quality === "high") this.quality = s.quality; } catch { /* defaults */ }
    this.applyQuality();
  }
  private saveSettings(): void { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ difficulty: this.difficulty, quality: this.quality })); } catch { /* session only */ } }

  private startMatch(mode: GameMode): void {
    this.mode = mode; this.round = 1; this.winner = 0; this.combat.p1.wins = 0; this.combat.p2.wins = 0;
    this.combat.setup(this.combat.p1.id, this.combat.p2.id); this.phase = "intro"; this.phaseTime = 0;
    this.message = "ROUND 1"; this.submessage = "READY"; this.syncRigs(); this.audio.sfx("round"); this.audio.startMusic();
  }
  private openSelect(): void {
    this.phase = "select"; this.pickTurn = 1; this.phaseTime = 0; this.message = "";
    this.combat.p1.x = -1.65; this.combat.p2.x = 1.65; this.combat.p1.y = this.combat.p2.y = 0;
    this.combat.p1.pose = "idle"; this.combat.p2.pose = "idle"; this.combat.p1.attack = this.combat.p2.attack = null;
    this.combat.p1.facing = 1; this.combat.p2.facing = -1; this.audio.sfx("ui");
  }
  private pick(id: CharacterId): void {
    if (this.pickTurn === 1) { this.combat.p1.id = id; this.combat.p1.name = id === "seorin" ? "尹世琳" : "姜艺娜"; this.pickTurn = 2; }
    else { this.combat.p2.id = id; this.combat.p2.name = id === "seorin" ? "尹世琳" : "姜艺娜"; this.pickTurn = 1; }
    this.syncRigs(); this.audio.sfx("ui");
  }
  private restart(): void { this.startMatch(this.mode); }
  private home(): void { this.phase = "title"; this.phaseTime = 0; this.message = ""; this.winner = 0; this.audio.sfx("ui"); }
  private pause(): void { if (!["fight", "intro", "roundOver"].includes(this.phase)) return; this.beforePause = this.phase; this.phase = "paused"; this.audio.sfx("ui"); }
  private resume(): void { if (this.phase === "paused") { this.phase = this.beforePause; this.audio.sfx("ui"); } }
  private toggleQuality(): void { this.quality = this.quality === "high" ? "low" : "high"; this.applyQuality(); this.saveSettings(); this.audio.sfx("ui"); }
  private applyQuality(): void { this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality === "high" ? QUALITY.pixelRatioHigh : QUALITY.pixelRatioLow)); this.stage.setQuality(this.quality === "high"); this.resize(); }

  private syncRigs(): void {
    if (this.rig1.root.userData.characterId !== this.combat.p1.id) { this.scene.remove(this.rig1.root); this.rig1.dispose(); this.rig1 = new CharacterRig(this.combat.p1.id); this.scene.add(this.rig1.root); }
    if (this.rig2.root.userData.characterId !== this.combat.p2.id) { this.scene.remove(this.rig2.root); this.rig2.dispose(); this.rig2 = new CharacterRig(this.combat.p2.id); this.scene.add(this.rig2.root); }
  }

  private onSuper(f: Fighter): void {
    this.cinematic = 1.05; this.cinematicFighter = f === this.combat.p1 ? 1 : 2;
    this.effects.superAura(f.x, f.id === "seorin" ? 0x69e7ff : 0xff4f70);
    this.ui.triggerSuper(f.name, f.attack?.label || "超必杀", f.id === "seorin" ? "#69e7ff" : "#ff4f70");
  }
  private onKO(loser: 1 | 2): void {
    if (this.phase !== "fight") return;
    const winner = loser === 1 ? 2 : 1; const wf = winner === 1 ? this.combat.p1 : this.combat.p2; wf.wins++;
    this.winner = winner; this.phase = "roundOver"; this.phaseTime = 0; this.message = "K.O."; this.submessage = `${wf.name} 拿下本回合`;
    wf.pose = "win"; wf.attack = null;
  }

  private update(dt: number): void {
    this.time += dt; this.phaseTime += dt; this.stage.update(dt, this.time); this.effects.update(dt);
    if (this.input.consume("KeyM")) this.audio.toggleMute();
    if (this.input.consume("Escape")) { if (this.phase === "paused") this.resume(); else this.pause(); }
    if (this.input.consume("Space") || this.input.consume("Enter")) {
      if (this.phase === "title") this.startMatch("ai"); else if (this.phase === "select") this.startMatch(this.mode); else if (this.phase === "matchOver") this.restart(); else if (this.phase === "paused") this.resume();
    }
    if (this.phase === "paused") { this.input.clearPressed(); return; }
    if (this.cinematic > 0) { this.cinematic = Math.max(0, this.cinematic - dt); this.input.clearPressed(); return; }

    if (this.phase === "intro") {
      this.combat.p1.pose = "idle"; this.combat.p2.pose = "idle";
      if (this.phaseTime > 1.05 && this.phaseTime < 1.12) { this.message = "FIGHT"; this.submessage = "全力以赴"; this.audio.sfx("round"); }
      if (this.phaseTime >= 1.85) { this.phase = "fight"; this.phaseTime = 0; this.message = ""; }
    } else if (this.phase === "fight") {
      const in1 = this.input.frame(1); const in2 = this.mode === "versus" ? this.input.frame(2) : neutralInput();
      this.combat.update(dt, in1, in2, this.difficulty, this.mode === "ai");
    } else if (this.phase === "roundOver" && this.phaseTime > 2.8) {
      const wf = this.winner === 1 ? this.combat.p1 : this.combat.p2;
      if (wf.wins >= 2) { this.phase = "matchOver"; this.phaseTime = 0; this.message = ""; }
      else { this.round++; this.combat.setup(this.combat.p1.id, this.combat.p2.id); this.phase = "intro"; this.phaseTime = 0; this.message = `ROUND ${this.round}`; this.submessage = "READY"; this.winner = 0; this.audio.sfx("round"); }
    } else if (this.phase === "title") {
      this.combat.p1.pose = "idle"; this.combat.p2.pose = "idle"; this.combat.p1.x = 0.55; this.combat.p2.x = 2.55; this.combat.p1.y = this.combat.p2.y = 0;
      this.combat.p1.facing = 1; this.combat.p2.facing = -1;
    }
    this.input.clearPressed();
  }

  private render(): void {
    const p1 = this.combat.p1, p2 = this.combat.p2;
    const showRigs = this.phase !== "title" && this.phase !== "select";
    this.rig1.root.visible = showRigs; this.rig2.root.visible = showRigs;
    this.rig1.update(p1, this.time, 1 / 60, this.cinematic); this.rig2.update(p2, this.time + 0.7, 1 / 60, this.cinematic);
    const mid = (p1.x + p2.x) * 0.5; const dist = Math.abs(p1.x - p2.x);
    let cx = mid * 0.42, cy = 1.95, cz = 6.05 + Math.max(0, dist - 3) * 0.42;
    let tx = mid, ty = 1.08;
    if (this.phase === "title") { cx = 1.55; cy = 2.15; cz = 7.4; tx = 1.55; ty = 1.12; }
    else if (this.phase === "select") { cx = 0; cy = 2.1; cz = 7.25; tx = 0; ty = 1.12; }
    else if (this.phase === "intro") { cx = mid; cy = 1.85; cz = 5.55; tx = mid; ty = 1.15; }
    else if (this.cinematic > 0) {
      const f = this.cinematicFighter === 1 ? p1 : p2; const t = 1 - this.cinematic / 1.05;
      cx = f.x + f.facing * (0.5 + Math.sin(t * Math.PI) * 0.35); cy = 1.65; cz = 3.25 + this.cinematic * 0.65; tx = f.x; ty = 1.35;
    } else if (this.phase === "matchOver" || this.phase === "roundOver") {
      const f = this.winner === 2 ? p2 : p1; cx = f.x + f.facing * 0.35; cy = 1.9; cz = 5.1; tx = f.x; ty = 1.25;
    }
    if (this.camera.aspect < 1 && this.cinematic <= 0 && !["title", "select", "matchOver", "roundOver"].includes(this.phase)) {
      cx = mid; cz *= 1.35;
      const visibleWidth = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * cz * this.camera.aspect;
      const requiredWidth = Math.max(5.6, dist + 2);
      if (visibleWidth < requiredWidth) cz *= requiredWidth / visibleWidth;
    }
    const shake = this.effects.shake; cx += Math.sin(this.time * 91) * shake; cy += Math.cos(this.time * 73) * shake * 0.55;
    this.camera.position.set(cx, cy, cz); this.cameraTarget.set(tx, ty, 0); this.camera.lookAt(this.cameraTarget);
    this.renderer.render(this.scene, this.camera);
    this.ui.update(this.snapshot());
    const instant = 1000 / Math.max(1, performance.now() - (this.lastRender || performance.now() - 16.7)); this.lastRender = performance.now(); this.fps += (instant - this.fps) * 0.03;
    if (this.fps < 42) this.lowFpsTime += 1 / 60; else this.lowFpsTime = Math.max(0, this.lowFpsTime - 1 / 30);
    if (this.lowFpsTime > 3 && this.quality === "high") { this.quality = "low"; this.applyQuality(); this.lowFpsTime = 0; }
    window.__GAME_READY__ = true;
  }
  private lastRender = 0;

  private snapshot(): Snapshot {
    return { phase: this.phase, timer: this.combat.timer, round: this.round, message: this.message, submessage: this.submessage,
      p1: this.combat.p1, p2: this.combat.p2, mode: this.mode, difficulty: this.difficulty, muted: this.audio.muted, quality: this.quality, winner: this.winner };
  }

  resize(): void { const w = window.innerWidth, h = window.innerHeight; this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h, false); }

  debug(): Record<string, unknown> {
    return { phase: this.phase, mode: this.mode, models: [this.rig1.usingDetailedModel, this.rig2.usingDetailedModel], round: this.round, timer: this.combat.timer, p1: { x: this.combat.p1.x, y: this.combat.p1.y, hp: this.combat.p1.hp, meter: this.combat.p1.meter, combo: this.combat.p1.combo, attack: this.combat.p1.attack?.kind || null, buffered: this.combat.p1.bufferedAttack }, p2: { x: this.combat.p2.x, y: this.combat.p2.y, hp: this.combat.p2.hp, meter: this.combat.p2.meter, attack: this.combat.p2.attack?.kind || null }, fps: this.fps, calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }
  debugWin(): void { if (this.phase === "fight") { this.combat.p2.hp = 0; this.onKO(2); } }
  debugMeter(): void { this.combat.p1.meter = 100; this.combat.p2.meter = 100; }

  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.loop.stop(); this.input.dispose(); this.audio.dispose();
    this.rig1.dispose(); this.rig2.dispose(); this.environment.dispose(); this.renderer.dispose();
  }
}
