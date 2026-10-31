import * as THREE from "three";
import { QUALITY } from "./config";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function signTexture(text: string, sub: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 256;
  const c = canvas.getContext("2d")!;
  c.clearRect(0, 0, 768, 256); c.textAlign = "center"; c.shadowColor = color; c.shadowBlur = 28;
  c.strokeStyle = color; c.lineWidth = 3; c.strokeRect(20, 20, 728, 216);
  c.fillStyle = color; c.font = "700 82px sans-serif"; c.fillText(text, 384, 130);
  c.shadowBlur = 10; c.font = "500 26px sans-serif"; c.fillText(sub, 384, 190);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

export class Stage {
  readonly group = new THREE.Group();
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private rainCount = QUALITY.rainHigh;
  private neon: THREE.MeshBasicMaterial[] = [];
  private skyline: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    scene.background = new THREE.Color(0x080b18);
    scene.fog = new THREE.FogExp2(0x10152b, 0.026);
    const hemi = new THREE.HemisphereLight(0x8fa9ff, 0x27152c, 1.55); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffd5c0, 2.35); key.position.set(-3, 8, 6); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 7; key.shadow.camera.bottom = -2;
    key.shadow.normalBias = 0.035; scene.add(key);
    const rim = new THREE.DirectionalLight(0x4aaaff, 2.6); rim.position.set(4, 4, -4); scene.add(rim);
    const pink = new THREE.PointLight(0xff367f, 38, 14, 2); pink.position.set(-5, 3, -1); scene.add(pink);
    const cyan = new THREE.PointLight(0x31cfff, 32, 13, 2); cyan.position.set(5, 2.5, -2); scene.add(cyan);
    const front = new THREE.DirectionalLight(0xe6efff, 0.8); front.position.set(0, 4, 7); scene.add(front);

    const floorMat = new THREE.MeshPhysicalMaterial({ color: 0x151a2a, roughness: 0.2, metalness: 0.68, clearcoat: 0.7, clearcoatRoughness: 0.18 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.group.add(floor);
    const stageEdge = new THREE.Mesh(new THREE.BoxGeometry(15, 0.32, 5.8), new THREE.MeshStandardMaterial({ color: 0x111522, metalness: 0.7, roughness: 0.35 }));
    stageEdge.position.set(0, -0.19, 0); this.group.add(stageEdge);
    for (const z of [-2.7, 2.7]) {
      const stripMat = new THREE.MeshBasicMaterial({ color: z < 0 ? 0x35cfff : 0xff316f, toneMapped: false }); this.neon.push(stripMat);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(14, 0.018, 0.035), stripMat); strip.position.set(0, 0.015, z); this.group.add(strip);
    }
    // Inlaid floor guides and reflections establish depth without obscuring the fighters.
    const gridMat = new THREE.MeshBasicMaterial({ color: 0x334361, transparent: true, opacity: 0.34 });
    for (let i = -7; i <= 7; i++) { const line = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.008, 5.3), gridMat); line.position.set(i, 0.012, 0); this.group.add(line); }
    for (let i = -3; i <= 3; i++) { const line = new THREE.Mesh(new THREE.BoxGeometry(14, 0.008, 0.012), gridMat); line.position.set(0, 0.012, i * 0.75); this.group.add(line); }

    const rand = rng(94021);
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x11182a, roughness: 0.82, metalness: 0.25 });
    this.skyline = new THREE.InstancedMesh(buildingGeo, buildingMat, 72);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 72; i++) {
      const band = i < 40 ? 0 : 1; const x = (rand() - 0.5) * (band ? 90 : 48); const h = 3 + rand() * (band ? 19 : 11);
      dummy.position.set(x, h * 0.5 - 1.5, -9 - band * 17 - rand() * 8); dummy.scale.set(1.4 + rand() * 3.8, h, 2 + rand() * 3); dummy.updateMatrix(); this.skyline.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(this.skyline);
    const windowGeo = new THREE.PlaneGeometry(0.11, 0.17);
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x8db8d8, transparent: true, opacity: 0.55, toneMapped: false });
    const windows = new THREE.InstancedMesh(windowGeo, windowMat, 360);
    for (let i = 0; i < 360; i++) {
      dummy.position.set((rand() - 0.5) * 48, rand() * 10 + 0.5, -7.8 - rand() * 8); dummy.scale.set(0.7 + rand(), 0.7 + rand(), 1); dummy.updateMatrix(); windows.setMatrixAt(i, dummy.matrix);
      windows.setColorAt(i, new THREE.Color(rand() > 0.72 ? 0xffb578 : 0x6aa4d8));
    }
    this.group.add(windows);

    const railMat = new THREE.MeshPhysicalMaterial({ color: 0x668ca8, transparent: true, opacity: 0.2, roughness: 0.12, metalness: 0.3, side: THREE.DoubleSide });
    const rail = new THREE.Mesh(new THREE.PlaneGeometry(15, 1.05), railMat); rail.position.set(0, 0.55, -3.05); this.group.add(rail);
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(15, 0.055, 0.055), new THREE.MeshStandardMaterial({ color: 0x7a9aad, metalness: 0.9, roughness: 0.2 })); railTop.position.set(0, 1.08, -3.05); this.group.add(railTop);
    for (let x = -7; x <= 7; x += 1.75) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.1, 0.045), railTop.material); post.position.set(x, 0.55, -3.05); this.group.add(post); }

    this.makeSign("VELVET", "SEOUL · FIGHT CLUB", "#ff4f8b", -5.8, 3.4, -4.4, 3.8);
    this.makeSign("绯 夜", "MIDNIGHT ARENA", "#62dfff", 5.6, 4.5, -6.2, 3.3);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1.25, 32, 24), new THREE.MeshBasicMaterial({ color: 0xa8bfff, transparent: true, opacity: 0.7, toneMapped: false })); moon.position.set(7, 11, -32); this.group.add(moon);

    this.rainPos = new Float32Array(this.rainCount * 6);
    for (let i = 0; i < this.rainCount; i++) this.resetDrop(i, rand, true);
    const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9ccfff, transparent: true, opacity: 0.22, depthWrite: false }));
    this.group.add(this.rain); scene.add(this.group);
  }

  private makeSign(text: string, sub: string, color: string, x: number, y: number, z: number, width: number): void {
    const material = new THREE.MeshBasicMaterial({ map: signTexture(text, sub, color), transparent: true, depthWrite: false, toneMapped: false }); this.neon.push(material);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 3), material); sign.position.set(x, y, z); this.group.add(sign);
  }

  private resetDrop(i: number, rand: () => number, initial = false): void {
    const o = i * 6; const x = (rand() - 0.5) * 26; const y = initial ? rand() * 13 : 10 + rand() * 3; const z = (rand() - 0.5) * 13;
    this.rainPos[o] = x; this.rainPos[o + 1] = y; this.rainPos[o + 2] = z;
    this.rainPos[o + 3] = x - 0.07; this.rainPos[o + 4] = y - 0.35; this.rainPos[o + 5] = z;
  }

  update(dt: number, time: number): void {
    const rand = rng(((time * 60) | 0) + 817);
    for (let i = 0; i < this.rainCount; i++) {
      const o = i * 6; this.rainPos[o + 1] -= dt * 10; this.rainPos[o + 4] -= dt * 10;
      this.rainPos[o] -= dt * 1.2; this.rainPos[o + 3] -= dt * 1.2;
      if (this.rainPos[o + 1] < 0) this.resetDrop(i, rand);
    }
    (this.rain.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this.neon.forEach((m, i) => { m.opacity = 0.86 + Math.sin(time * (1.7 + i * 0.13) + i) * 0.1; });
  }

  setQuality(high: boolean): void {
    const count = high ? QUALITY.rainHigh : QUALITY.rainLow;
    this.rain.geometry.setDrawRange(0, count * 2);
  }
}
