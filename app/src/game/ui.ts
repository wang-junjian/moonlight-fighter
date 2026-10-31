import { characterName, characterTitle } from "./characters";
import type { CharacterId, Difficulty, GameMode, Phase, Snapshot } from "./types";

export interface UIActions {
  quick: (mode: GameMode) => void;
  select: () => void;
  pick: (id: CharacterId) => void;
  mode: (mode: GameMode) => void;
  difficulty: (d: Difficulty) => void;
  fight: () => void;
  resume: () => void;
  restart: () => void;
  home: () => void;
  mute: () => void;
  quality: () => void;
}

const icon = (path: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const ICONS = {
  sound: icon("M4 9v6h4l5 4V5L8 9H4m12 3a4 4 0 0 0-2-3.46v6.92A4 4 0 0 0 16 12m-2-7.74v2.06a7 7 0 0 1 0 11.36v2.06a9 9 0 0 0 0-15.48"),
  bolt: icon("m13 2-9 12h7l-1 8 9-12h-7l1-8Z"),
  arrow: icon("M5 12h14m-6-6 6 6-6 6"),
};

export class GameUI {
  private lastScreen = "";
  private combo1 = -1; private combo2 = -1;

  constructor(private root: HTMLElement, private actions: UIActions) {
    root.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!target) return;
      const a = target.dataset.action; const v = target.dataset.value;
      if (a === "quick") actions.quick((v || "ai") as GameMode);
      else if (a === "select") actions.select();
      else if (a === "pick") actions.pick(v as CharacterId);
      else if (a === "mode") actions.mode(v as GameMode);
      else if (a === "difficulty") actions.difficulty(v as Difficulty);
      else if (a === "fight") actions.fight();
      else if (a === "resume") actions.resume();
      else if (a === "restart") actions.restart();
      else if (a === "home") actions.home();
      else if (a === "mute") actions.mute();
      else if (a === "quality") actions.quality();
    });
  }

  private settings(s: Snapshot): string {
    return `<div class="settings"><button class="icon-button" data-action="quality" aria-label="切换画质">${ICONS.bolt}<span>${s.quality === "high" ? "高画质" : "流畅"}</span></button><button class="icon-button" data-action="mute" aria-label="切换声音">${ICONS.sound}<span>${s.muted ? "已静音" : "声音开"}</span></button></div>`;
  }

  update(s: Snapshot): void {
    this.root.querySelectorAll("[data-action='mute'] span").forEach((el) => { el.textContent = s.muted ? "已静音" : "声音开"; });
    this.root.querySelectorAll("[data-action='quality'] span").forEach((el) => { el.textContent = s.quality === "high" ? "高画质" : "流畅"; });
    const screen = s.phase === "paused" ? "paused" : s.phase === "title" ? "title" : s.phase === "select" ? "select" : s.phase === "matchOver" ? "result" : "hud";
    if (screen !== this.lastScreen) { this.lastScreen = screen; this.renderScreen(screen, s); }
    if (screen === "hud" || screen === "paused" || screen === "result") this.updateHud(s);
    if (screen === "select") this.refreshSelect(s);
  }

  private renderScreen(screen: string, s: Snapshot): void {
    if (screen === "title") {
      this.root.innerHTML = `${this.settings(s)}<section class="title-screen">
        <div class="title-copy"><div class="eyebrow"><span></span> ORIGINAL 3D FIGHTING GAME</div>
        <h1><span>绯夜</span>对决</h1><div class="title-en">VELVET <b>FIGHT</b></div>
        <p>雨夜之上，针锋相对。<br>简易必杀，进阶连段，一局定心。</p>
        <div class="title-actions"><button class="primary" data-action="quick" data-value="ai">单人快速对战 ${ICONS.arrow}</button><button data-action="select">角色选择</button><button data-action="quick" data-value="versus">本地双人</button></div>
        <div class="title-meta"><span>1 ON 1</span><i></i><span>BEST OF 3</span><i></i><span>60 SEC</span></div></div>
        <div class="title-portraits" aria-hidden="true"><img class="title-portrait seorin" src="./characters/seorin.png" alt=""><img class="title-portrait yena" src="./characters/yena.png" alt=""></div>
        <div class="title-side"><div class="vertical-text">BEAUTY <b>×</b> IMPACT</div><div class="control-hint"><kbd>SPACE</kbd> 快速开始　<kbd>M</kbd> 静音</div></div>
      </section><div class="version-tag">ORIGINAL CHARACTERS · 3D REAL-TIME</div>`;
    } else if (screen === "select") {
      this.root.innerHTML = `${this.settings(s)}<section class="select-screen"><header><div><span class="eyebrow">CHOOSE YOUR FIGHTER</span><h2>选择你的格斗家</h2></div><div class="select-mode"><button data-action="mode" data-value="ai" class="${s.mode === "ai" ? "active" : ""}">单人对 AI</button><button data-action="mode" data-value="versus" class="${s.mode === "versus" ? "active" : ""}">本地双人</button></div></header>
      <div class="fighter-cards">${this.card("seorin", s)}${this.card("yena", s)}</div>
      <div class="select-footer"><div class="difficulty"><span>AI 难度</span>${(["easy", "normal", "hard"] as Difficulty[]).map((d) => `<button data-action="difficulty" data-value="${d}" class="${s.difficulty === d ? "active" : ""}">${d === "easy" ? "简单" : d === "normal" ? "标准" : "困难"}</button>`).join("")}</div><button class="primary fight-button" data-action="fight">进入对决 ${ICONS.arrow}</button></div>
      <div class="select-tip">点击角色卡切换双方阵容 · 两名角色均可由任意玩家选择</div></section>`;
    } else {
      this.root.innerHTML = `${this.hud(s)}${screen === "paused" ? `<section class="modal"><div class="modal-card"><span class="eyebrow">FIGHT INTERRUPTED</span><h2>对决暂停</h2><p>稍作喘息，节奏还在。</p><button class="primary" data-action="resume">继续战斗</button><button data-action="restart">重新开始</button><button data-action="home">返回标题</button><div class="modal-settings">${this.settings(s)}</div></div></section>` : ""}${screen === "result" ? `<section class="modal result-modal"><div class="modal-card"><span class="eyebrow">MATCH COMPLETE</span><h2 id="result-title">胜利</h2><p id="result-sub"></p><button class="primary" data-action="restart">再战一场</button><button data-action="select">更换角色</button><button data-action="home">返回标题</button></div></section>` : ""}`;
    }
  }

  private card(id: CharacterId, s: Snapshot): string {
    const selected = s.p1.id === id || s.p2.id === id;
    return `<button class="fighter-card ${id} ${selected ? "selected" : ""}" data-action="pick" data-value="${id}"><img class="card-portrait" src="./characters/${id}.png" alt="" aria-hidden="true"><div class="card-number">0${id === "seorin" ? 1 : 2}</div><div class="card-glow"></div><div class="card-copy"><span>${characterTitle(id)}</span><h3>${characterName(id)}</h3><p>${id === "seorin" ? "长距踢技 · 对空反击" : "滑步突进 · 近身连段"}</p><div class="stats"><label>速度<i><b style="width:${id === "seorin" ? 72 : 91}%"></b></i></label><label>范围<i><b style="width:${id === "seorin" ? 92 : 65}%"></b></i></label><label>爆发<i><b style="width:${id === "seorin" ? 78 : 88}%"></b></i></label></div></div><div class="pick-badges"><span class="badge p1 ${s.p1.id === id ? "show" : ""}">P1</span><span class="badge p2 ${s.p2.id === id ? "show" : ""}">P2</span></div></button>`;
  }

  private hud(s: Snapshot): string {
    return `<section class="hud"><div class="top-hud"><div class="fighter-hud left"><div class="name-row"><b>${s.p1.name}</b><span>P1 · ${characterTitle(s.p1.id)}</span></div><div class="health"><i id="hp1"></i><em id="chip1"></em></div><div class="meter"><i id="meter1"></i><span id="meter-label1">ENERGY</span></div><div class="wins" id="wins1"></div></div>
    <div class="round-hud"><span id="round-label">ROUND 1</span><b id="timer">60</b><div id="message" class="fight-message"></div></div>
    <div class="fighter-hud right"><div class="name-row"><b>${s.p2.name}</b><span>${s.mode === "ai" ? "CPU" : "P2"} · ${characterTitle(s.p2.id)}</span></div><div class="health"><i id="hp2"></i><em id="chip2"></em></div><div class="meter"><i id="meter2"></i><span id="meter-label2">ENERGY</span></div><div class="wins" id="wins2"></div></div></div>
    <div id="announcement" class="announcement"></div><div id="combo1" class="combo left"></div><div id="combo2" class="combo right"></div>
    <div class="bottom-hud"><div class="controls-mini"><span><kbd>WASD</kbd> 移动 / 跳跃</span><span><kbd>SHIFT</kbd> + 方向冲刺</span><span><kbd>J</kbd> 轻击</span><span><kbd>K</kbd> 重击</span><span><kbd>L</kbd> 必杀</span><span><kbd>U</kbd> 投技</span><span><kbd>I</kbd> 超必杀</span></div><div class="pause-hint"><kbd>ESC</kbd> 暂停</div></div><div id="super-flash" class="super-flash"></div></section>`;
  }

  private refreshSelect(s: Snapshot): void {
    this.root.querySelectorAll<HTMLElement>(".fighter-card").forEach((el) => {
      const id = el.dataset.value as CharacterId; el.classList.toggle("selected", s.p1.id === id || s.p2.id === id);
      const b1 = el.querySelector(".badge.p1"), b2 = el.querySelector(".badge.p2"); b1?.classList.toggle("show", s.p1.id === id); b2?.classList.toggle("show", s.p2.id === id);
    });
    this.root.querySelectorAll("[data-action='mode']").forEach((el) => el.classList.toggle("active", (el as HTMLElement).dataset.value === s.mode));
    this.root.querySelectorAll("[data-action='difficulty']").forEach((el) => el.classList.toggle("active", (el as HTMLElement).dataset.value === s.difficulty));
  }

  private updateHud(s: Snapshot): void {
    const setWidth = (id: string, value: number) => { const e = document.getElementById(id); if (e) e.style.width = `${Math.max(0, value)}%`; };
    setWidth("hp1", s.p1.hp); setWidth("hp2", s.p2.hp); setWidth("meter1", s.p1.meter); setWidth("meter2", s.p2.meter);
    const timer = document.getElementById("timer"); if (timer) timer.textContent = String(Math.ceil(s.timer)).padStart(2, "0");
    const round = document.getElementById("round-label"); if (round) round.textContent = `ROUND ${s.round}`;
    const announce = document.getElementById("announcement"); if (announce) { announce.innerHTML = s.message ? `<b>${s.message}</b><span>${s.submessage}</span>` : ""; announce.classList.toggle("show", !!s.message); }
    for (const n of [1, 2] as const) {
      const f = n === 1 ? s.p1 : s.p2; const wins = document.getElementById(`wins${n}`); if (wins) wins.innerHTML = `<i class="${f.wins > 0 ? "won" : ""}"></i><i class="${f.wins > 1 ? "won" : ""}"></i>`;
      const ml = document.getElementById(`meter-label${n}`); if (ml) ml.textContent = f.meter >= 100 ? "MAX · 超必杀就绪" : `ENERGY ${Math.floor(f.meter)}%`;
      const combo = document.getElementById(`combo${n}`); const old = n === 1 ? this.combo1 : this.combo2;
      if (combo && old !== f.combo) { combo.innerHTML = f.combo >= 2 ? `<b>${f.combo}</b><span>HITS</span><em>COMBO</em>` : ""; combo.classList.toggle("show", f.combo >= 2); if (n === 1) this.combo1 = f.combo; else this.combo2 = f.combo; }
    }
    if (s.phase === "matchOver") {
      const title = document.getElementById("result-title"), sub = document.getElementById("result-sub");
      if (title) title.textContent = s.winner === 0 ? "势均力敌" : `${s.winner === 1 ? s.p1.name : s.p2.name} · 胜利`;
      if (sub) sub.textContent = s.winner === 0 ? "雨夜还未落幕，再来一场。" : s.winner === 1 ? (s.p1.id === "seorin" ? "“就只有这样吗？”" : "“这一拍，属于我。”") : (s.p2.id === "seorin" ? "“就只有这样吗？”" : "“这一拍，属于我。”");
    }
  }

  triggerSuper(name: string, move: string, color: string): void {
    const el = document.getElementById("super-flash"); if (!el) return;
    el.innerHTML = `<div><span>${name}</span><b>${move}</b><em>SUPER FINISH</em></div>`; el.style.setProperty("--super-color", color); el.classList.remove("play"); void el.offsetWidth; el.classList.add("play");
  }
}
