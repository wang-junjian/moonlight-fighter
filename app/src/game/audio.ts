export type SfxId = "light" | "heavy" | "block" | "special" | "super" | "jump" | "ko" | "ui" | "round";

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer = 0;
  private beat = 0;
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem("velvet.muted") === "1"; } catch { this.muted = false; }
    window.addEventListener("pointerdown", this.unlock); window.addEventListener("keydown", this.unlock);
  }
  private unlock = (): void => { this.ensure(); };
  private ensure(): AudioContext {
    if (!this.ctx) { this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.38; this.master.connect(this.ctx.destination); }
    if (this.ctx.state === "suspended") void this.ctx.resume(); return this.ctx;
  }
  toggleMute(): boolean { this.muted = !this.muted; try { localStorage.setItem("velvet.muted", this.muted ? "1" : "0"); } catch { /* session only */ } if (this.master) this.master.gain.value = this.muted ? 0 : 0.38; return this.muted; }

  private tone(f0: number, f1: number, duration: number, gain: number, type: OscillatorType = "sine"): void {
    if (this.muted) return; const c = this.ensure(); if (!this.master) return; const t = c.currentTime;
    const o = c.createOscillator(); const g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + duration);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + duration); o.connect(g).connect(this.master); o.start(t); o.stop(t + duration);
  }
  private noise(duration: number, gain: number): void {
    if (this.muted) return; const c = this.ensure(); if (!this.master) return; const length = Math.ceil(c.sampleRate * duration); const b = c.createBuffer(1, length, c.sampleRate); const d = b.getChannelData(0);
    let seed = 731; for (let i = 0; i < length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 1073741823.5 - 1) * (1 - i / length); }
    const s = c.createBufferSource(); const g = c.createGain(); const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900; g.gain.value = gain; s.buffer = b; s.connect(f).connect(g).connect(this.master); s.start();
  }
  sfx(id: SfxId): void {
    if (id === "light") { this.noise(0.07, 0.2); this.tone(150, 70, 0.09, 0.18, "square"); }
    else if (id === "heavy") { this.noise(0.13, 0.32); this.tone(110, 38, 0.16, 0.28, "sawtooth"); }
    else if (id === "block") this.tone(540, 160, 0.1, 0.16, "square");
    else if (id === "special") { this.tone(260, 880, 0.22, 0.18, "sawtooth"); this.noise(0.16, 0.2); }
    else if (id === "super") { this.tone(80, 640, 0.65, 0.25, "sawtooth"); setTimeout(() => this.noise(0.35, 0.35), 240); }
    else if (id === "jump") this.tone(180, 300, 0.08, 0.08, "triangle");
    else if (id === "ko") { this.tone(150, 32, 0.8, 0.3, "sawtooth"); this.noise(0.45, 0.3); }
    else if (id === "round") { this.tone(440, 880, 0.24, 0.15); setTimeout(() => this.tone(660, 990, 0.25, 0.13), 130); }
    else this.tone(440, 580, 0.06, 0.1);
  }
  startMusic(): void {
    if (this.timer) return; this.ensure();
    this.timer = window.setInterval(() => {
      if (this.muted || !this.ctx) return; const notes = [55, 55, 65.4, 49]; this.tone(notes[this.beat % 4], notes[this.beat % 4] * 0.8, 0.22, 0.045, "triangle");
      if (this.beat % 2 === 0) this.noise(0.035, 0.025); this.beat++;
    }, 300);
  }
  dispose(): void { window.removeEventListener("pointerdown", this.unlock); window.removeEventListener("keydown", this.unlock); if (this.timer) clearInterval(this.timer); this.timer = 0; if (this.ctx && this.ctx.state !== "closed") void this.ctx.close(); this.ctx = null; }
}
