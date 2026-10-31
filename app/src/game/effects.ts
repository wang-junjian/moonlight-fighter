import * as THREE from "three";

interface Particle { alive: boolean; life: number; max: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; color: number; }

export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  private mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();
  private rings: THREE.Mesh[] = [];
  shake = 0;
  flash = 0;

  constructor(scene: THREE.Scene) {
    const count = 96;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.055, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) { this.particles.push({ alive: false, life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, color: 0xffffff }); this.dummy.scale.setScalar(0); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix); }
    scene.add(this.group); this.group.add(this.mesh);
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.47, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      ring.visible = false; ring.userData.life = 0; this.rings.push(ring); this.group.add(ring);
    }
  }

  burst(x: number, y: number, color: number, power = 1): void {
    let made = 0;
    for (let i = 0; i < this.particles.length && made < 14; i++) {
      const p = this.particles[i]; if (p.alive) continue;
      const angle = (made / 14) * Math.PI * 2 + power * 0.37;
      p.alive = true; p.life = p.max = 0.22 + (made % 4) * 0.035; p.x = x; p.y = y; p.z = 0.25;
      p.vx = Math.cos(angle) * (2.5 + (made % 3)) * power; p.vy = Math.sin(angle) * (2.5 + (made % 3)) * power + 1.2; p.vz = ((made % 5) - 2) * 0.35;
      p.size = 0.65 + (made % 3) * 0.35; p.color = color; made++;
    }
    this.shake = Math.max(this.shake, 0.07 * power);
    const ring = this.rings.find((r) => !r.visible);
    if (ring) { ring.visible = true; ring.userData.life = 0.26; ring.position.set(x, y, 0.3); ring.scale.setScalar(0.4); (ring.material as THREE.MeshBasicMaterial).color.setHex(color); }
  }

  superAura(x: number, color: number): void { this.burst(x, 1.2, color, 1.8); this.flash = 0.18; this.shake = 0.16; }

  update(dt: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.alive) {
        p.life -= dt; if (p.life <= 0) p.alive = false;
        else { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 9 * dt; }
      }
      this.dummy.position.set(p.x, p.y, p.z); this.dummy.scale.setScalar(p.alive ? p.size * Math.max(0, p.life / p.max) : 0); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.tmpColor.setHex(p.color); this.mesh.setColorAt(i, this.tmpColor);
    }
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    for (const ring of this.rings) {
      if (!ring.visible) continue;
      ring.userData.life -= dt; const life = ring.userData.life as number;
      if (life <= 0) { ring.visible = false; continue; }
      ring.scale.multiplyScalar(1 + dt * 11); (ring.material as THREE.MeshBasicMaterial).opacity = Math.min(1, life * 5);
    }
    this.shake = Math.max(0, this.shake - dt * 0.7); this.flash = Math.max(0, this.flash - dt);
  }
}
