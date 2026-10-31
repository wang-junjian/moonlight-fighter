import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { ArticulatedCharacter } from "./articulated-character";
import type { CharacterId, Fighter } from "./types";

const loader = new GLTFLoader();
const cache = new Map<CharacterId, Promise<GLTF>>();

function removeDisplayBase(scene: THREE.Group): void {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const position = geometry.getAttribute("position");
    const index = geometry.index;
    if (!position || !index) return;
    const kept: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
      if (Math.max(position.getY(a), position.getY(b), position.getY(c)) > -0.494) kept.push(a, b, c);
    }
    geometry.setIndex(kept);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  });
}

function loadModel(id: CharacterId): Promise<GLTF> {
  let pending = cache.get(id);
  if (!pending) {
    pending = loader.loadAsync(`./models/${id}.glb`).then((gltf) => {
      if (id === "yena") removeDisplayBase(gltf.scene);
      return gltf;
    });
    cache.set(id, pending);
  }
  return pending;
}

export class DetailedCharacter {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();
  private materials: THREE.MeshStandardMaterial[] = [];
  private articulated: ArticulatedCharacter[] = [];
  private model?: THREE.Group;
  private disposed = false;
  private loaded = false;

  constructor(private id: CharacterId) {
    this.root.add(this.pivot);
    this.root.visible = false;
    void loadModel(id).then((gltf) => {
      if (this.disposed) return;
      const model = gltf.scene.clone(true);
      const meshes: THREE.Mesh[] = [];
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const source = object.material;
        const cloned = Array.isArray(source) ? source.map((item) => item.clone()) : source.clone();
        object.material = cloned;
        meshes.push(object);
        for (const material of Array.isArray(cloned) ? cloned : [cloned]) {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.envMapIntensity = 0.65;
            this.materials.push(material);
          }
        }
      });
      this.articulated = meshes.map((mesh) => new ArticulatedCharacter(mesh));
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = (id === "seorin" ? 2.18 : 2.12) / Math.max(0.001, size.y);
      model.scale.setScalar(scale);
      model.position.y = -bounds.min.y * scale;
      model.rotation.y = Math.PI / 2;
      this.pivot.add(model); this.model = model;
      this.loaded = true;
      this.root.visible = true;
      this.root.userData.detailedReady = true;
    }).catch((error) => {
      console.warn(`高精角色模型加载失败，使用程序化备用模型：${id}`, error);
    });
  }

  get ready(): boolean { return this.loaded; }
  private target = new THREE.Group();

  update(f: Fighter, time: number, dt: number, cinematic: number): void {
    if (!this.loaded) return;
    if (this.model) {
      const forward = this.id === "seorin" ? -Math.PI / 2 : Math.PI / 2;
      const target = forward + (f.facing === 1 ? -0.52 : 0.52);
      this.model.rotation.y = THREE.MathUtils.damp(this.model.rotation.y, target, 16, dt);
    }
    const p = this.target;
    p.position.set(0, 0, 0);
    p.rotation.set(0, 0, 0);
    p.scale.set(1, 1, 1);
    const idle = Math.sin(time * 2.4 + (this.id === "yena" ? 1.2 : 0));
    p.position.y = idle * 0.012;

    if (f.pose === "walk") {
      const phase = time * (7.5 + Math.abs(f.vx));
      p.position.y = Math.abs(Math.sin(phase)) * 0.035;
      p.rotation.z = -Math.sign(f.vx || f.facing) * 0.035;
    } else if (f.pose === "crouch" || (f.pose === "block" && f.crouching)) {
      p.scale.y = 0.86; p.scale.x = 1.025;
    } else if (f.pose === "jump") {
      p.rotation.z = -0.08;
    } else if (f.pose === "block") {
      p.position.x = -0.04;
    } else if (f.pose === "hit") {
      p.position.x = -0.1;
    } else if (f.pose === "down" || f.pose === "ko") {
      p.rotation.z = -Math.PI * 0.47; p.position.y = 0.18;
    } else if (f.pose === "win") {
      p.rotation.y = Math.sin(time * 0.9) * 0.12;
      p.position.y = Math.sin(time * 2) * 0.018;
    }

    if (f.pose === "attack" && f.attack) {
      const a = f.attack;
      const total = a.startup + a.active + a.recovery;
      const t = Math.min(1, f.attackElapsed / total);
      const strike = Math.sin(Math.min(1, f.attackElapsed / (a.startup + a.active * 0.55)) * Math.PI * 0.72);
      const recover = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1;
      const s = Math.max(0, strike) * recover;
      p.position.x = a.kind === "special" ? 0.2 * s : 0.1 * s;
      p.rotation.y = a.kind === "super" ? Math.sin(t * Math.PI * 2) * 0.24 : -0.1 * s;
      if (a.kind === "special" && f.attackVariant === 1) p.position.y = 0.14 * s;
    }
    if (cinematic > 0) p.rotation.y += Math.sin(cinematic * Math.PI) * 0.16;

    const blend = 1 - Math.exp(-dt * 18);
    this.pivot.position.lerp(p.position, blend);
    this.pivot.scale.lerp(p.scale, blend);
    this.pivot.rotation.x = THREE.MathUtils.damp(this.pivot.rotation.x, p.rotation.x, 18, dt);
    this.pivot.rotation.y = THREE.MathUtils.damp(this.pivot.rotation.y, p.rotation.y, 18, dt);
    this.pivot.rotation.z = THREE.MathUtils.damp(this.pivot.rotation.z, p.rotation.z, 18, dt);
    for (const articulated of this.articulated) articulated.update(f, this.id, time, dt);

    const flash = f.flash > 0;
    for (const material of this.materials) {
      material.emissive.setHex(flash ? 0xffffff : 0x000000);
      material.emissiveIntensity = flash ? 0.65 : 0;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.root.traverse((object) => { if (object instanceof THREE.SkinnedMesh) object.geometry.dispose(); });
    this.materials.forEach((material) => material.dispose());
    this.materials = []; this.articulated = [];
    this.root.clear();
  }
}
