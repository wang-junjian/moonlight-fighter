import type { InputFrame } from "./types";

const GAME_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "KeyK", "KeyL", "KeyU", "KeyI", "ShiftLeft", "ShiftRight",
  "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "Numpad0", "Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5",
  "Space", "Escape", "KeyM", "Enter",
]);

export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private lastTap = new Map<string, number>();
  private listeners: Array<() => void> = [];

  constructor() {
    const down = (e: KeyboardEvent) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!this.held.has(e.code)) {
        this.pressed.add(e.code);
        if (["KeyA", "KeyD", "ArrowLeft", "ArrowRight"].includes(e.code)) {
          const now = performance.now(); const last = this.lastTap.get(e.code) || 0;
          if (now - last < 280) this.pressed.add(`Dash:${e.code}`);
          this.lastTap.set(e.code, now);
        }
      }
      this.held.add(e.code);
    };
    const up = (e: KeyboardEvent) => { this.held.delete(e.code); };
    const clear = () => { this.held.clear(); this.pressed.clear(); };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    this.listeners.push(() => window.removeEventListener("keydown", down));
    this.listeners.push(() => window.removeEventListener("keyup", up));
    this.listeners.push(() => window.removeEventListener("blur", clear));
    this.listeners.push(() => document.removeEventListener("visibilitychange", clear));
  }

  isDown(code: string): boolean { return this.held.has(code); }
  consume(code: string): boolean { const v = this.pressed.has(code); this.pressed.delete(code); return v; }
  clearPressed(): void { this.pressed.clear(); }

  frame(player: 1 | 2): InputFrame {
    const p = player === 1;
    const left = this.isDown(p ? "KeyA" : "ArrowLeft");
    const right = this.isDown(p ? "KeyD" : "ArrowRight");
    const dash = p ? this.consume("ShiftLeft") || this.consume("ShiftRight") : this.consume("Numpad0");
    return {
      left,
      right,
      up: this.isDown(p ? "KeyW" : "ArrowUp"),
      down: this.isDown(p ? "KeyS" : "ArrowDown"),
      light: this.consume(p ? "KeyJ" : "Numpad1"),
      heavy: this.consume(p ? "KeyK" : "Numpad2"),
      special: this.consume(p ? "KeyL" : "Numpad3"),
      throw: this.consume(p ? "KeyU" : "Numpad4"),
      super: this.consume(p ? "KeyI" : "Numpad5"),
      dashLeft: this.consume(p ? "Dash:KeyA" : "Dash:ArrowLeft") || dash && left && !right,
      dashRight: this.consume(p ? "Dash:KeyD" : "Dash:ArrowRight") || dash && right && !left,
    };
  }

  dispose(): void { this.listeners.forEach((off) => off()); this.listeners = []; this.held.clear(); this.pressed.clear(); }
}

export function neutralInput(): InputFrame {
  return { left: false, right: false, up: false, down: false, light: false, heavy: false, special: false, throw: false, super: false, dashLeft: false, dashRight: false };
}
