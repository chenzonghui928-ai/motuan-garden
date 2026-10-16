// 吃的看得见：① 居民吃饭/拿着吃的时，手里是对应食物的小模型（莓果、菜、鱼、面包，样子和 assets/food 里的图标一致）；
// ② 面包房/小食堂的炉子在烤面包时，屋顶上冒一缕白色的轻烟（只在烤的时候冒，不是火灾）。
// 数据来自模拟快照：居民的 flags 高位记着手里是哪种食物（flags >> 8：1 莓果、2 菜、3 鱼、4 面包），snap.bake 是正在烤的店的编号。
import * as THREE from 'three';
import { handWorld, headTopY } from '../lib/characters.js';

const PI = Math.PI;
const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const M = { red: mat('#d9343a'), leaf: mat('#5a9a3a'), orange: mat('#e8892e'), white: mat('#f1efe0'), fish: mat('#8fb4d0'), fishB: mat('#e9f0f4'), fin: mat('#6f98b8'), crust: mat('#d9a04a'), crumb: mat('#f4dca0'), cut: mat('#b87a30') };
// 四种食物的小模型，单位是“居民身高 h 的一小部分”，放进手里时再整体乘 h
function protoBerry() { const g = new THREE.Group(); const b = new THREE.SphereGeometry(0.06, 8, 6); for (const [x, y, z] of [[-0.05, 0, 0], [0.05, 0, 0.01], [0, 0.06, -0.01]]) { const m = new THREE.Mesh(b, M.red); m.position.set(x, y, z); g.add(m); } const l = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 5), M.leaf); l.position.set(0, 0.13, 0); l.rotation.z = 0.3; g.add(l); return g; }
function protoVeg() { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), M.orange); c.rotation.z = PI / 2; g.add(c); const l = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 5), M.leaf); l.rotation.z = -PI / 2; l.position.set(-0.15, 0.02, 0); g.add(l); const r = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M.white); r.position.set(0.02, 0.07, 0.04); r.scale.y = 1.2; g.add(r); return g; }
function protoFish() { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 7), M.fish); b.scale.set(1.9, 0.62, 0.7); g.add(b); const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 4), M.fin); t.rotation.z = PI / 2; t.position.set(-0.22, 0, 0); g.add(t); const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 5), M.fishB); s.scale.set(1.6, 0.3, 0.55); s.position.set(0.0, -0.04, 0); g.add(s); return g; }
function protoBread() { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 7), M.crust); b.scale.set(1.35, 0.85, 0.95); g.add(b); for (const x of [-0.05, 0.03]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.13), M.cut); c.position.set(x, 0.082, 0); c.rotation.y = 0.5; g.add(c); } const k = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), M.crumb); k.position.set(0.12, 0.02, 0.02); k.scale.set(1, 0.7, 1); g.add(k); return g; }
const PROTO = [protoBerry, protoVeg, protoFish, protoBread];

export class FoodFX {
  constructor(scene) {
    this.scene = scene; this.root = new THREE.Group(); scene.add(this.root);
    this.pool = PROTO.map((f) => { const a = []; for (let i = 0; i < 10; i++) { const g = f(); g.visible = false; this.root.add(g); a.push(g); } return a; });
    this.puffGeo = new THREE.SphereGeometry(1, 8, 6); this.puffs = []; this.emit = new Map();
    for (let i = 0; i < 28; i++) { const m = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({ color: '#d8d2c8', transparent: true, opacity: 0, depthWrite: false, depthTest: false })); m.renderOrder = 20; m.visible = false; m.userData = { life: 0, max: 1, h: 1, vx: 0 }; this.root.add(m); this.puffs.push(m); }
  }
  update(dt, t, chars, snap, struct, lotHR) {
    // 手里的食物
    const used = [0, 0, 0, 0];
    for (const c of chars.values()) {
      const fi = ((c.flags | 0) >> 8) & 7; if (!fi || fi > 4 || c.hidden || c.vis < 0.3) continue;
      const k = fi - 1, n = used[k]++; const m = this.pool[k][n]; if (!m) continue;
      const h = headTopY(c) - c.y; handWorld(c, m.position); m.position.y = c.y + h * 0.52 + Math.sin(t * 7 + c.id) * h * 0.018; // 轻轻咬着晃
      m.position.x += Math.sin(c.yaw) * h * 0.06; m.position.z += Math.cos(c.yaw) * h * 0.06;
      m.rotation.set(0, c.yaw + PI / 2 + (k === 3 ? 0.4 : 0), k === 2 ? Math.sin(t * 5 + c.id) * 0.12 : 0); m.scale.setScalar(h * (k === 0 ? 1.0 : 0.72)); m.visible = true;
    }
    for (let k = 0; k < 4; k++) for (let i = used[k]; i < this.pool[k].length; i++) this.pool[k][i].visible = false;
    // 烤面包的轻烟
    const baking = snap && snap.bake && snap.bake.length ? snap.bake : null;
    if (baking && struct) for (const id of baking) {
      const l = struct.lots.find(x => x.id === id); if (!l) continue; let e = this.emit.get(id) || 0; e -= dt;
      if (e <= 0) { e = 0.55 + Math.random() * 0.25; const p = this.puffs.find(q => !q.visible); if (p) { const [H, r] = lotHR(l); p.userData = { life: 0, max: 3.8, h: Math.max(H, r * 1.6), vx: (Math.random() - 0.5) * 0.12 * H }; p.position.set(l.x + Math.sin(l.rot) * r * 0.1 + (Math.random() - 0.5) * 0.1 * H, H * 1.0, l.z + Math.cos(l.rot) * r * 0.1); p.visible = true; } }
      this.emit.set(id, e);
    }
    for (const p of this.puffs) {
      if (!p.visible) continue; const u = p.userData; u.life += dt; const f = u.life / u.max; if (f >= 1) { p.visible = false; p.material.opacity = 0; continue; }
      p.position.y += dt * u.h * 0.2; p.position.x += dt * u.vx; p.scale.setScalar(u.h * (0.13 + f * 0.15)); p.material.opacity = (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85) * 0.9;
    }
  }
}
