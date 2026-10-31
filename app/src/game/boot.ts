import { VelvetFight } from "./game";

declare global {
  interface Window {
    __gameProbe?: () => { x: number; y: number; z: number };
    __GAME_READY__?: boolean;
    __velvetDebug?: () => Record<string, unknown>;
    __velvetWin?: () => void;
    __velvetMeter?: () => void;
  }
}

let session: { game: VelvetFight; resize: () => void } | null = null;

export function startGame(canvas: HTMLCanvasElement): void {
  stopGame();
  const uiRoot = document.getElementById("ui-overlay");
  if (!uiRoot) return;
  const game = new VelvetFight(canvas, uiRoot);
  const resize = () => game.resize();
  window.addEventListener("resize", resize);
  session = { game, resize };
  window.__gameProbe = () => { const d = game.debug() as { p1: { x: number; y: number } }; return { x: d.p1.x, y: d.p1.y, z: 0 }; };
  window.__velvetDebug = () => game.debug();
  window.__velvetWin = () => game.debugWin();
  window.__velvetMeter = () => game.debugMeter();
  window.__GAME_READY__ = false;
  game.start();
}

export function stopGame(): void {
  if (!session) return;
  window.removeEventListener("resize", session.resize); session.game.dispose(); session = null;
  delete window.__gameProbe; delete window.__velvetDebug; delete window.__velvetWin; delete window.__velvetMeter;
  window.__GAME_READY__ = false;
}
