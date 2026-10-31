import * as THREE from "three";
import { DetailedCharacter } from "./detailed-character";
import type { CharacterId, Fighter } from "./types";

interface Parts {
  visual: THREE.Group; hips: THREE.Group; torso: THREE.Group; head: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; foreL: THREE.Group; foreR: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; kneeL: THREE.Group; kneeR: THREE.Group;
  ponytail?: THREE.Group; skirt?: THREE.Group;
}

const sphere = new THREE.SphereGeometry(1, 24, 18);
const capsule = new THREE.CapsuleGeometry(0.5, 1, 6, 12);
const box = new THREE.BoxGeometry(1, 1, 1);

function mat(color: number, roughness = 0.55, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function mesh(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, scale: [number, number, number], pos: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(...scale); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function joint(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
}
function limb(parent: THREE.Group, material: THREE.Material, radius: number, length: number): void {
  mesh(capsule, material, parent, [radius, length, radius], [0, -length * 0.72, 0]);
}
function latheBody(parent: THREE.Object3D, material: THREE.Material, profile: Array<[number, number]>): THREE.Mesh {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 28);
  return mesh(geo, material, parent, [1, 1, 1], [0, 0, 0]);
}

export class CharacterRig {
  readonly root = new THREE.Group();
  private parts: Parts;
  private materials: THREE.MeshStandardMaterial[] = [];
  private id: CharacterId;
  private walkPhase = 0;
  private baseScale: number;
  private detailed: DetailedCharacter;

  constructor(id: CharacterId) {
    this.id = id;
    this.baseScale = id === "seorin" ? 1.035 : 0.985;
    const skin = this.own(mat(id === "seorin" ? 0xf2c6b4 : 0xe8ae91, 0.48));
    const skinShade = this.own(mat(id === "seorin" ? 0xdca38f : 0xcf8d72, 0.58));
    const dark = this.own(mat(id === "seorin" ? 0x111326 : 0x24101a, 0.3, 0.35));
    const accent = this.own(mat(id === "seorin" ? 0x79dfff : 0xff385f, 0.28, 0.25));
    accent.emissive.setHex(id === "seorin" ? 0x071d28 : 0x2b030c);
    const cloth = this.own(mat(id === "seorin" ? 0x15182b : 0xb51f3e, 0.42, 0.08));
    const hair = this.own(mat(id === "seorin" ? 0x11101c : 0x6b3525, 0.32));
    const eye = this.own(mat(0x171019, 0.25));
    const lip = this.own(mat(id === "seorin" ? 0x8e2748 : 0xc54c55, 0.35));
    const gold = this.own(mat(0xe7bd79, 0.22, 0.75));

    const visual = new THREE.Group(); this.root.add(visual); visual.scale.setScalar(this.baseScale);
    const hips = joint(visual, 0, 0.96, 0);
    const torso = joint(hips, 0, 0.03, 0);
    const head = joint(torso, 0, 0.93, 0);
    const armL = joint(torso, 0, 0.66, 0.31);
    const armR = joint(torso, 0, 0.66, -0.31);
    const legL = joint(hips, 0, -0.02, 0.145);
    const legR = joint(hips, 0, -0.02, -0.145);
    const foreL = joint(armL, 0, -0.43, 0);
    const foreR = joint(armR, 0, -0.43, 0);
    const kneeL = joint(legL, 0, -0.48, 0);
    const kneeR = joint(legR, 0, -0.48, 0);

    // Torso is built in shaped sections so the silhouette remains readable during extreme poses.
    latheBody(torso, skin, [[0.19, 0.03], [0.22, 0.16], [0.19, 0.32], [0.27, 0.52], [0.29, 0.64], [0.16, 0.76]]);
    const top = latheBody(torso, cloth, [[0.255, 0.42], [0.292, 0.54], [0.285, 0.65], [0.18, 0.73]]);
    top.scale.z = 0.88;
    mesh(sphere, skin, torso, [0.25, 0.14, 0.31], [0.025, 0.61, 0]);
    mesh(sphere, cloth, torso, [0.275, 0.12, 0.325], [0.035, 0.59, 0]);
    mesh(box, accent, torso, [0.026, 0.28, 0.02], [0.245, 0.55, 0]);
    mesh(sphere, skinShade, hips, [0.22, 0.19, 0.31], [0, 0.02, 0]);
    mesh(sphere, dark, hips, [0.242, 0.16, 0.332], [0.012, -0.005, 0]);
    mesh(box, accent, hips, [0.04, 0.035, 0.65], [0, 0.095, 0]);

    // Head, facial planes and makeup face local +X.
    mesh(capsule, skin, torso, [0.11, 0.12, 0.11], [0, 0.8, 0]);
    mesh(sphere, skin, head, [0.19, 0.245, 0.18], [0, 0, 0]);
    mesh(sphere, hair, head, [0.197, 0.19, 0.188], [-0.035, 0.11, 0]);
    mesh(sphere, hair, head, [0.11, 0.25, 0.19], [-0.13, -0.04, 0]);
    for (const side of [-1, 1]) {
      mesh(sphere, eye, head, [0.014, 0.022, 0.041], [0.174, 0.035, side * 0.068]);
      mesh(sphere, accent, head, [0.015, 0.009, 0.018], [0.185, 0.04, side * 0.068]);
      mesh(box, hair, head, [0.012, 0.012, 0.065], [0.17, 0.087, side * 0.065]);
    }
    mesh(sphere, skinShade, head, [0.035, 0.046, 0.028], [0.185, -0.012, 0]);
    mesh(sphere, lip, head, [0.017, 0.018, 0.052], [0.174, -0.088, 0]);
    mesh(sphere, gold, head, [0.022, 0.05, 0.022], [0, -0.055, 0.19]);

    limb(armL, skin, 0.15, 0.37); limb(armR, skin, 0.15, 0.37);
    limb(foreL, skin, 0.125, 0.34); limb(foreR, skin, 0.125, 0.34);
    mesh(sphere, dark, foreL, [0.13, 0.16, 0.13], [0, -0.41, 0]);
    mesh(sphere, dark, foreR, [0.13, 0.16, 0.13], [0, -0.41, 0]);
    limb(legL, id === "seorin" ? dark : skin, 0.20, 0.42); limb(legR, id === "seorin" ? dark : skin, 0.20, 0.42);
    limb(kneeL, dark, 0.155, 0.40); limb(kneeR, id === "seorin" ? dark : skin, 0.155, id === "seorin" ? 0.40 : 0.25);
    mesh(sphere, dark, kneeL, [0.25, 0.105, 0.17], [0.09, -0.47, 0]);
    mesh(sphere, dark, kneeR, [0.25, 0.105, 0.17], [0.09, -0.47, 0]);
    mesh(box, accent, kneeL, [0.03, 0.28, 0.02], [0.13, -0.25, 0.11]);
    mesh(box, accent, kneeR, [0.03, 0.28, 0.02], [0.13, -0.25, -0.11]);

    let ponytail: THREE.Group | undefined;
    let skirt: THREE.Group | undefined;
    if (id === "seorin") {
      // Long sculpted hair and an asymmetric skort keep the kicking silhouette clean.
      for (const z of [-0.13, 0, 0.13]) mesh(capsule, hair, head, [0.105, 0.45, 0.105], [-0.16, -0.36, z]);
      skirt = joint(hips, 0, -0.02, 0);
      const panel = mesh(box, cloth, skirt, [0.035, 0.43, 0.35], [-0.06, -0.22, 0.18]);
      panel.rotation.z = -0.15;
      const panel2 = mesh(box, cloth, skirt, [0.035, 0.34, 0.31], [-0.08, -0.18, -0.2]);
      panel2.rotation.z = 0.12;
      mesh(box, accent, skirt, [0.04, 0.03, 0.37], [-0.05, -0.43, 0.18]);
      const cape = mesh(box, cloth, torso, [0.055, 0.55, 0.7], [-0.21, 0.46, 0]); cape.rotation.z = -0.1;
    } else {
      ponytail = joint(head, -0.15, 0.17, 0);
      mesh(sphere, gold, ponytail, [0.09, 0.07, 0.09], [0, 0, 0]);
      const tail = mesh(capsule, hair, ponytail, [0.16, 0.46, 0.16], [-0.18, -0.18, 0]); tail.rotation.z = -0.7;
      const jacket = mesh(box, cloth, torso, [0.12, 0.25, 0.72], [-0.13, 0.57, 0]); jacket.rotation.z = -0.06;
      mesh(box, gold, torso, [0.13, 0.035, 0.73], [-0.13, 0.42, 0]);
      for (const z of [-0.34, 0.34]) mesh(box, gold, hips, [0.04, 0.17, 0.055], [0.02, -0.08, z]);
    }
    this.parts = { visual, hips, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR, ponytail, skirt };
    this.detailed = new DetailedCharacter(id); this.root.add(this.detailed.root);
    this.root.userData.characterId = id;
  }

  private own<T extends THREE.MeshStandardMaterial>(m: T): T { this.materials.push(m); return m; }

  update(f: Fighter, time: number, dt: number, cinematic = 0): void {
    const p = this.parts;
    this.root.position.set(f.x, f.y, 0);
    const facingRotation = f.facing === 1 ? 0 : Math.PI;
    const turn = THREE.MathUtils.euclideanModulo(facingRotation - this.root.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
    this.root.rotation.y += turn * (1 - Math.exp(-dt * 20));
    p.visual.position.y = 0;
    p.visual.rotation.set(0, 0, 0);
    p.hips.rotation.set(0, 0, 0); p.torso.rotation.set(0, 0, 0); p.head.rotation.set(0, 0, 0);
    for (const g of [p.armL, p.armR, p.foreL, p.foreR, p.legL, p.legR, p.kneeL, p.kneeR]) g.rotation.set(0, 0, 0);
    const idle = Math.sin(time * 2.4 + (this.id === "yena" ? 1.2 : 0));
    p.torso.position.y = 0.03 + idle * 0.012;
    p.head.rotation.z = idle * 0.025;
    p.armL.rotation.x = 0.2; p.armR.rotation.x = -0.2;
    p.armL.rotation.z = 0.18 + idle * 0.035; p.armR.rotation.z = -0.05 - idle * 0.025;
    p.foreL.rotation.z = 1.2; p.foreR.rotation.z = 1.1;
    p.legL.rotation.z = 0.08; p.legR.rotation.z = -0.12;
    p.kneeL.rotation.z = -0.12; p.kneeR.rotation.z = -0.16;
    if (this.id === "yena") { p.hips.rotation.y = idle * 0.025; p.torso.rotation.z = -0.04; }
    else { p.head.rotation.y = -0.08; p.torso.rotation.z = 0.025; }
    this.walkPhase += Math.abs(f.vx) * dt * 4.2;

    if (f.pose === "walk") {
      const s = Math.sin(this.walkPhase) * 0.55;
      p.legL.rotation.z = s; p.legR.rotation.z = -s;
      p.kneeL.rotation.z = Math.max(0, -s) * 0.65; p.kneeR.rotation.z = Math.max(0, s) * 0.65;
      p.armL.rotation.z = -s * 0.5; p.armR.rotation.z = s * 0.5;
      p.hips.position.y = 0.96 + Math.abs(Math.sin(this.walkPhase)) * 0.035;
    } else p.hips.position.y = 0.96;

    if (f.pose === "crouch" || f.pose === "block" && f.crouching) {
      p.hips.position.y = 0.68; p.legL.rotation.z = 0.65; p.legR.rotation.z = -0.35;
      p.kneeL.rotation.z = -1.05; p.kneeR.rotation.z = -0.85; p.torso.rotation.z = -0.16;
    }
    if (f.pose === "jump") {
      p.legL.rotation.z = 0.48; p.legR.rotation.z = -0.3; p.kneeL.rotation.z = -0.85; p.kneeR.rotation.z = -0.65;
      p.armL.rotation.z = -0.65; p.armR.rotation.z = 0.35;
    }
    if (f.pose === "block") {
      p.armL.rotation.z = 1.15; p.armR.rotation.z = 1.0; p.armL.rotation.x = 0.35; p.armR.rotation.x = -0.35;
      p.foreL.rotation.z = 1.1; p.foreR.rotation.z = 1.1; p.torso.rotation.z = -0.12;
    }
    if (f.pose === "hit") {
      p.torso.rotation.z = -0.35; p.head.rotation.z = -0.25; p.armL.rotation.z = -0.7; p.armR.rotation.z = 0.45;
    }
    if (f.pose === "down" || f.pose === "ko") {
      p.visual.rotation.z = -Math.PI * 0.47; p.visual.position.y = 0.2;
      p.legL.rotation.z = 0.25; p.legR.rotation.z = -0.2; p.armL.rotation.z = -0.8;
    }
    if (f.pose === "win") {
      p.armR.rotation.z = 2.5; p.foreR.rotation.z = -0.45; p.head.rotation.z = 0.12;
      p.torso.rotation.y = Math.sin(time * 0.8) * 0.08;
    }
    if (f.pose === "attack" && f.attack) this.attackPose(f);

    if (p.ponytail) { p.ponytail.rotation.z = -0.2 + Math.sin(time * 4) * 0.08 - f.vx * 0.025; p.ponytail.rotation.x = Math.sin(time * 2.7) * 0.1; }
    if (p.skirt) p.skirt.rotation.z = -f.vx * 0.018 + Math.sin(time * 3.2) * 0.018;
    if (cinematic > 0) p.head.rotation.y = Math.sin(cinematic * Math.PI) * 0.15;
    p.visual.visible = !this.detailed.ready;
    this.detailed.update(f, time, dt, cinematic);

    const flash = f.flash > 0 ? 1 : 0;
    for (const m of this.materials) { m.emissiveIntensity = flash ? 0.8 : (m === this.materials[3] ? 1 : 0); if (flash) m.emissive.setHex(0xffffff); }
    if (!flash) {
      this.materials.forEach((m, i) => { if (i !== 3) m.emissive.setHex(0x000000); });
      this.materials[3].emissive.setHex(this.id === "seorin" ? 0x071d28 : 0x2b030c);
    }
  }

  private attackPose(f: Fighter): void {
    const p = this.parts;
    const a = f.attack!;
    const total = a.startup + a.active + a.recovery;
    const t = Math.min(1, f.attackElapsed / total);
    const strike = Math.sin(Math.min(1, f.attackElapsed / (a.startup + a.active * 0.55)) * Math.PI * 0.72);
    const recover = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    const s = Math.max(0, strike) * recover;
    if (a.kind === "light") {
      p.armR.rotation.z = 1.58 * s; p.foreR.rotation.z = -0.12 * s; p.torso.rotation.z = 0.14 * s;
    } else if (a.kind === "heavy") {
      if (this.id === "seorin") { p.legR.rotation.z = 1.62 * s; p.kneeR.rotation.z = -0.18; p.torso.rotation.z = -0.32 * s; }
      else { p.armR.rotation.z = 1.75 * s; p.foreR.rotation.z = -0.4 * s; p.torso.rotation.z = 0.38 * s; p.armL.rotation.z = 0.7; }
    } else if (a.kind === "special") {
      if (f.attackVariant === 1) { p.legR.rotation.z = 2.15 * s; p.torso.rotation.z = -0.55 * s; p.armL.rotation.z = -0.8; }
      else if (f.attackVariant === 2) { p.armL.rotation.z = 1.6 * s; p.armR.rotation.z = 1.6 * s; p.torso.rotation.z = 0.28 * s; }
      else { p.legL.rotation.z = 1.35 * s; p.legR.rotation.z = 0.75 * s; p.kneeR.rotation.z = -1.1; p.visual.rotation.z = -0.28 * s; }
    } else if (a.kind === "air") {
      p.legR.rotation.z = 1.35; p.kneeR.rotation.z = -0.4; p.armL.rotation.z = -0.65; p.torso.rotation.z = -0.18;
    } else if (a.kind === "throw") {
      p.armL.rotation.z = 1.35 * s; p.armR.rotation.z = 1.35 * s; p.foreL.rotation.z = -0.35; p.foreR.rotation.z = -0.35;
    } else if (a.kind === "super") {
      p.armL.rotation.z = 1.3 * s; p.armR.rotation.z = 1.8 * s; p.legR.rotation.z = 1.45 * s; p.torso.rotation.z = Math.sin(t * Math.PI * 6) * 0.2;
    }
  }

  get usingDetailedModel(): boolean { return this.detailed.ready; }
  setCinematicScale(scale: number): void { this.parts.visual.scale.setScalar(this.baseScale * scale); this.detailed.root.scale.setScalar(scale); }
  dispose(): void { this.materials.forEach((m) => m.dispose()); this.detailed.dispose(); }
}

export function characterName(id: CharacterId): string { return id === "seorin" ? "尹世琳" : "姜艺娜"; }
export function characterTitle(id: CharacterId): string { return id === "seorin" ? "霜月之踵" : "赤红节拍"; }
