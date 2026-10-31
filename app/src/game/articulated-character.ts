import * as THREE from "three";
import type { CharacterId, Fighter } from "./types";

type BoneName = "root" | "hips" | "spine" | "head" | "armL" | "foreL" | "armR" | "foreR" | "legL" | "kneeL" | "legR" | "kneeR";

const BONE_NAMES: BoneName[] = ["root", "hips", "spine", "head", "armL", "foreL", "armR", "foreR", "legL", "kneeL", "legR", "kneeR"];
const smooth = (from: number, to: number, value: number) => THREE.MathUtils.smoothstep(value, from, to);

export class ArticulatedCharacter {
  readonly bones = new Map<BoneName, THREE.Bone>();
  private targets = new Map<BoneName, THREE.Euler>();
  private targetQuaternion = new THREE.Quaternion();

  constructor(source: THREE.Mesh) {
    const geometry = source.geometry.clone();
    const position = geometry.getAttribute("position");
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const size = bounds.getSize(new THREE.Vector3());
    const halfWidth = Math.max(0.001, size.x * 0.5);
    const at = (x: number, height: number) => new THREE.Vector3(x * halfWidth, bounds.min.y + size.y * height, 0);
    const absolute = new Map<BoneName, THREE.Vector3>();
    const makeBone = (name: BoneName, parent: BoneName | undefined, point: THREE.Vector3) => {
      const bone = new THREE.Bone(); bone.name = name;
      absolute.set(name, point);
      bone.position.copy(parent ? point.clone().sub(absolute.get(parent)!) : point);
      this.bones.set(name, bone); this.targets.set(name, new THREE.Euler());
      if (parent) this.bones.get(parent)!.add(bone);
      return bone;
    };

    makeBone("root", undefined, at(0, 0));
    makeBone("hips", "root", at(0, 0.43));
    makeBone("spine", "hips", at(0, 0.65));
    makeBone("head", "spine", at(0, 0.82));
    for (const [side, sign] of [["L", -1], ["R", 1]] as const) {
      makeBone(`arm${side}`, "spine", at(sign * 0.4, 0.72));
      makeBone(`fore${side}`, `arm${side}`, at(sign * 0.65, 0.57));
      makeBone(`leg${side}`, "hips", at(sign * 0.24, 0.42));
      makeBone(`knee${side}`, `leg${side}`, at(sign * 0.25, 0.23));
    }

    const indices = new Uint16Array(position.count * 4);
    const weights = new Float32Array(position.count * 4);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) / halfWidth;
      const y = (position.getY(i) - bounds.min.y) / Math.max(0.001, size.y);
      const influences = new Map<BoneName, number>();
      const add = (name: BoneName, weight: number) => { if (weight > 0.0001) influences.set(name, (influences.get(name) || 0) + weight); };
      const side: "L" | "R" = x < 0 ? "L" : "R";
      const spineBlend = smooth(0.47, 0.68, y);
      const headBlend = smooth(0.75, 0.87, y);
      add("hips", 1 - spineBlend); add("spine", spineBlend * (1 - headBlend)); add("head", spineBlend * headBlend);

      if (y < 0.53) {
        const legWeight = (1 - smooth(0.4, 0.53, y)) * smooth(0.04, 0.3, Math.abs(x));
        const lowerBlend = 1 - smooth(0.2, 0.31, y);
        for (const name of [...influences.keys()]) influences.set(name, influences.get(name)! * (1 - legWeight));
        add(`leg${side}`, legWeight * (1 - lowerBlend)); add(`knee${side}`, legWeight * lowerBlend);
      }
      const armWeight = smooth(0.43, 0.82, Math.abs(x)) * smooth(0.4, 0.49, y) * (1 - smooth(0.75, 0.85, y));
      if (armWeight > 0) {
        const lowerBlend = 1 - smooth(0.55, 0.64, y);
        for (const name of [...influences.keys()]) influences.set(name, influences.get(name)! * (1 - armWeight));
        add(`arm${side}`, armWeight * (1 - lowerBlend)); add(`fore${side}`, armWeight * lowerBlend);
      }

      const strongest = [...influences.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = strongest.reduce((sum, entry) => sum + entry[1], 0) || 1;
      strongest.forEach(([name, weight], slot) => {
        indices[i * 4 + slot] = BONE_NAMES.indexOf(name);
        weights[i * 4 + slot] = weight / total;
      });
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));

    const skinned = new THREE.SkinnedMesh(geometry, source.material);
    skinned.name = `${source.name}-articulated`;
    skinned.position.copy(source.position); skinned.quaternion.copy(source.quaternion); skinned.scale.copy(source.scale);
    skinned.castShadow = source.castShadow; skinned.receiveShadow = source.receiveShadow; skinned.frustumCulled = false;
    source.parent?.add(skinned); source.removeFromParent();
    skinned.add(this.bones.get("root")!); skinned.updateMatrixWorld(true);
    skinned.bind(new THREE.Skeleton(BONE_NAMES.map((name) => this.bones.get(name)!)), skinned.matrixWorld);
  }

  update(f: Fighter, id: CharacterId, time: number, dt: number): void {
    for (const target of this.targets.values()) target.set(0, 0, 0);
    const idle = Math.sin(time * 2.4 + (id === "yena" ? 1.2 : 0));
    this.set("hips", 0, 0, idle * 0.018);
    this.set("spine", idle * 0.018, 0, id === "yena" ? -0.035 : 0.025);
    this.set("head", 0, idle * 0.035, idle * 0.025);
    this.set("armL", -0.12, 0, -0.08); this.set("armR", 0.12, 0, 0.08);
    this.set("foreL", -0.28, 0, 0); this.set("foreR", -0.28, 0, 0);

    if (f.pose === "walk") {
      const phase = time * (7.5 + Math.abs(f.vx)); const swing = Math.sin(phase);
      this.set("legL", swing * 0.68, 0, 0); this.set("legR", -swing * 0.68, 0, 0);
      this.set("kneeL", Math.max(0, -swing) * 0.85, 0, 0); this.set("kneeR", Math.max(0, swing) * 0.85, 0, 0);
      this.set("armL", -swing * 0.5, 0, -0.08); this.set("armR", swing * 0.5, 0, 0.08);
      this.set("spine", 0.08, 0, -Math.sign(f.vx || f.facing) * 0.05);
    } else if (f.pose === "crouch" || (f.pose === "block" && f.crouching)) {
      this.set("legL", -0.55, 0, -0.18); this.set("legR", -0.55, 0, 0.18);
      this.set("kneeL", 1.05, 0, 0); this.set("kneeR", 1.05, 0, 0); this.set("spine", 0.22, 0, 0);
    } else if (f.pose === "jump") {
      this.set("legL", -0.35, 0, -0.1); this.set("legR", 0.42, 0, 0.1);
      this.set("kneeL", 0.65, 0, 0); this.set("kneeR", 0.85, 0, 0);
      this.set("armL", 0.45, 0, -0.35); this.set("armR", -0.4, 0, 0.35);
    }

    if (f.pose === "block") {
      this.set("armL", -1.0, 0, -0.32); this.set("armR", -1.0, 0, 0.32);
      this.set("foreL", -1.0, 0, 0); this.set("foreR", -1.0, 0, 0); this.set("spine", 0.12, 0, 0);
    } else if (f.pose === "hit") {
      this.set("spine", -0.3, 0, 0.24); this.set("head", -0.2, 0, 0.2);
      this.set("armL", 0.65, 0, -0.35); this.set("armR", -0.4, 0, 0.45);
    } else if (f.pose === "win") {
      this.set("armR", -2.25, 0, 0.25); this.set("foreR", -0.55, 0, 0); this.set("head", 0, Math.sin(time) * 0.12, 0.08);
    }

    if (f.pose === "attack" && f.attack) {
      const a = f.attack;
      const total = a.startup + a.active + a.recovery;
      const t = Math.min(1, f.attackElapsed / total);
      const anticipation = smooth(0, Math.max(0.001, a.startup), f.attackElapsed);
      const strike = Math.sin(Math.min(1, f.attackElapsed / (a.startup + a.active * 0.55)) * Math.PI * 0.72);
      const recover = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1;
      const s = Math.max(0, strike) * recover;
      this.set("spine", -0.12 * anticipation, -0.18 * s, -0.1 * s);
      if (a.kind === "light") {
        this.set("armR", -1.5 * s, 0, 0.12); this.set("foreR", -0.25 * s, 0, 0);
      } else if (a.kind === "heavy") {
        if (id === "seorin") { this.set("legR", -1.55 * s, 0, 0.08); this.set("kneeR", 0.35 * s, 0, 0); this.set("spine", 0.32 * s, 0, -0.2 * s); }
        else { this.set("armR", -1.7 * s, 0, 0.18); this.set("foreR", -0.45 * s, 0, 0); this.set("armL", -0.65 * s, 0, -0.2); }
      } else if (a.kind === "special") {
        if (f.attackVariant === 1) { this.set("legR", -1.8 * s, 0, 0); this.set("kneeR", 0.4 * s, 0, 0); this.set("spine", 0.4 * s, 0, -0.3 * s); }
        else { this.set("armL", -1.35 * s, 0, -0.2); this.set("armR", -1.55 * s, 0, 0.2); this.set("spine", 0.2 * s, 0.35 * s, 0); }
      } else if (a.kind === "air") {
        this.set("legR", -1.35, 0, 0); this.set("kneeR", 0.45, 0, 0); this.set("armL", 0.5, 0, -0.4);
      } else if (a.kind === "throw") {
        this.set("armL", -1.35 * s, 0, -0.2); this.set("armR", -1.35 * s, 0, 0.2); this.set("foreL", -0.55 * s, 0, 0); this.set("foreR", -0.55 * s, 0, 0);
      } else if (a.kind === "super") {
        const chain = Math.sin(t * Math.PI * 6);
        this.set("armL", -1.5 * Math.max(0, chain), 0, -0.25); this.set("armR", -1.6 * Math.max(0, -chain), 0, 0.25);
        this.set("legR", -1.25 * s, 0, 0); this.set("spine", 0.2 * s, chain * 0.25, -0.2 * s);
      }
    }

    const blend = 1 - Math.exp(-dt * 20);
    for (const name of BONE_NAMES) {
      this.targetQuaternion.setFromEuler(this.targets.get(name)!);
      this.bones.get(name)!.quaternion.slerp(this.targetQuaternion, blend);
    }
  }

  private set(name: BoneName, x: number, y: number, z: number): void { this.targets.get(name)!.set(x, y, z); }
}
