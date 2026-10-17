// 花园外圈的植物丛（蒲公英 / 三叶草 / 狗尾草）的画面：布局来自 shared/flora.js（和模拟一模一样），状态来自模拟快照的 fl：
//   [id, 状态, 进度]，不在表里的就是完好。完好 = 整丛；clearing = 小动物在砍，抖一抖、越砍越歪；倒下 = 往一边倒、飘出绒毛小粒子、消失；
//   cleared = 一块平地（什么都不画）；regrow = 小苗，按进度慢慢长大。设计图出来以后再对照调整（_handoff/images/clear/）。
import * as THREE from 'three';
import { reseed, TAU, clamp, smooth } from '../lib/core.js';
import { groundH } from '../lib/environment.js';
import { dandelionPlant, cloverClump, foxtailClump } from '../lib/plants.js';
import { floraLayout, ST, FLORA } from '../shared/flora.js';

const FALL_T = 1.5;       // 倒下要花多久（秒）
const MAX_P = 160;        // 粒子上限
export class FloraView {
  constructor(scene) {
    this.scene = scene; this.views = new Map(); this.ready = false; this.parts = [];
    for (const p of floraLayout()) {
      const root = new THREE.Group(); root.position.set(p.x, groundH(p.x, p.z), p.z); root.rotation.y = p.id * 2.1; scene.add(root);
      const tilt = new THREE.Group(); root.add(tilt);
      const old = reseed(p.id * 977 + 13);
      try { if (p.kind === 'dandelion') dandelionPlant(tilt, 0, 0, 0, p.size, { yaw: p.yaw }); else if (p.kind === 'clover') cloverClump(tilt, 0, 0, 0, p.size, { yaw: p.yaw }); else foxtailClump(tilt, 0, 0, 0, p.size, { yaw: p.yaw }); } finally { reseed(old); }
      // 小苗阶段是独立的低矮形态（不是把成熟植株缩小）：蒲公英只有一圈叶、三叶草几片小叶、狗尾草几根草芽
      const sd = new THREE.Group(); root.add(sd); sd.visible = false; const old2 = reseed(p.id * 331 + 5);
      try { if (p.kind === 'dandelion') dandelionPlant(sd, 0, 0, 0, p.size * 0.42, { yaw: p.yaw, stalks: 0, leaves: 7 }); else if (p.kind === 'clover') cloverClump(sd, 0, 0, 0, p.size * 0.5, { yaw: p.yaw, n: 6, flower: 0 }); else foxtailClump(sd, 0, 0, 0, p.size * 0.4, { yaw: p.yaw, n: 3 }); } finally { reseed(old2); }
      // 清掉以后留下的一块平地：泥土圈 + 一圈小石子（设计图 03 第 5 格、04）
      const patch = new THREE.Group(); patch.position.set(p.x, groundH(p.x, p.z) + 0.04, p.z); patch.visible = false; scene.add(patch); const rr = FLORA[p.kind].rad * 1.05;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(rr, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8c6a43', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })); disc.scale.set(1, 1, 0.86); disc.receiveShadow = true; patch.add(disc);
      const pm = new THREE.MeshStandardMaterial({ color: '#b9aa94', roughness: 0.95 }); const pg = new THREE.SphereGeometry(0.2, 6, 4);
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + p.id; const m = new THREE.Mesh(pg, pm); m.position.set(Math.cos(a) * rr * 1.02, 0.05, Math.sin(a) * rr * 0.88); m.scale.set(1 + (k % 3) * 0.3, 0.55, 1 + (k % 2) * 0.3); patch.add(m); }
      root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      this.views.set(p.id, { p, root, tilt, sd, patch, st: 0, v: 0, fall: -1, scale: 1, shown: 1 });
    }
    // 绒毛 / 草屑粒子
    const geo = new THREE.BufferGeometry(); this.pos = new Float32Array(MAX_P * 3); this.col = new Float32Array(MAX_P * 3); geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d'); const g = c.createRadialGradient(16, 16, 1, 16, 16, 15); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32);
    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.1, map: new THREE.CanvasTexture(cv), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending }));
    this.pts.frustumCulled = false; this.pts.renderOrder = 5; scene.add(this.pts); this.geo = geo;
  }
  burst(v) { // 倒下时飘出的小粒子：蒲公英是白色绒毛，其他是黄绿草屑
    const dand = v.p.kind === 'dandelion'; const n = dand ? 34 : 18; const x = v.root.position.x, y = v.root.position.y, z = v.root.position.z;
    for (let i = 0; i < n && this.parts.length < MAX_P; i++) {
      const a = Math.random() * TAU, r = Math.random() * FLORA[v.p.kind].rad * 0.7;
      this.parts.push({ x: x + Math.cos(a) * r, y: y + v.p.size * (0.4 + Math.random() * 0.6), z: z + Math.sin(a) * r, vx: Math.cos(a) * (0.4 + Math.random() * 0.8) + 0.5, vy: (dand ? 1.2 : 0.7) + Math.random() * 1.4, vz: Math.sin(a) * (0.4 + Math.random() * 0.8) + 0.2, life: 0, max: dand ? 3 + Math.random() * 2 : 1.6 + Math.random(), c: dand ? [1, 1, 0.96] : [0.62 + Math.random() * 0.2, 0.78, 0.3] });
    }
  }
  // fl：快照里的 [[id, 状态, 进度], ...]；第一次收到时直接摆好，不演倒下的动画
  update(dt, t, fl) {
    const map = new Map(); if (fl) for (const q of fl) map.set(q[0], q);
    for (const v of this.views.values()) {
      const q = map.get(v.p.id); const st = q ? q[1] : ST.ok, val = q ? q[2] : 0;
      if (this.ready && v.st === ST.clearing && st === ST.cleared) { v.fall = 0; this.burst(v); }
      if (!this.ready && st === ST.cleared) v.fall = FALL_T + 1;
      v.st = st; v.v = val;
      let sc = 1, vis = true, lean = 0, shake = 0;
      if (v.fall >= 0 && st === ST.cleared) { // 倒下：往一边倒、塌下去、消失
        v.fall += dt; const k = clamp(v.fall / FALL_T, 0, 1); lean = smooth(0, 1, k) * 1.45; sc = 1 - smooth(0.55, 1, k) * 0.97; vis = v.fall < FALL_T + 0.05;
      } else if (st === ST.cleared) { vis = false; v.fall = -1; }
      else if (st === ST.clearing) { v.fall = -1;
        if (this.ready && val > 0.005 && (v.chipT = (v.chipT || 0) - dt) <= 0 && this.parts.length < MAX_P - 6) { v.chipT = 0.35 + Math.random() * 0.2; const x = v.root.position.x, y = v.root.position.y, z = v.root.position.z; for (let k = 0; k < 3; k++) this.parts.push({ x: x + (Math.random() - 0.5) * 1.2, y: y + 0.8 + Math.random() * 1.2, z: z + (Math.random() - 0.5) * 1.2, vx: (Math.random() - 0.5) * 2.2, vy: 1.4 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 2.2, life: 0, max: 0.7 + Math.random() * 0.4, c: k ? [0.78, 0.9, 0.45] : [0.9, 0.78, 0.5] }); }
        shake = Math.sin(t * 16 + v.p.id) * (0.012 + val * 0.03); lean = shake + Math.max(0, val - 0.75) * 0.5; sc = 1 - val * 0.06; }
      else if (st === ST.regrow) { v.fall = -1; sc = 1; }
      else { v.fall = -1; }
      // 小苗 → 长大：前半段是小苗形态，后半段换成成熟形态（交叉一小段）
      const seedling = st === ST.regrow && val < 0.5, grown = !(st === ST.regrow) || val >= 0.4;
      v.sd.visible = vis && seedling; if (seedling) v.sd.scale.setScalar(0.55 + 0.9 * smooth(0, 0.5, val));
      const gs = st === ST.regrow ? (grown ? 0.4 + 0.6 * smooth(0.4, 1, val) : 0.001) : 1; v.tilt.scale.setScalar(gs);
      v.tilt.visible = grown; v.root.visible = vis; v.tilt.rotation.set(0, 0, lean); v.root.scale.set(sc, sc * (st === ST.clearing ? 1 - val * 0.04 : 1), sc);
      v.patch.visible = st === ST.cleared || (st === ST.regrow && val < 0.9) || (v.fall >= 0 && v.fall > FALL_T * 0.5);
    }
    this.ready = true;
    // 粒子
    const P = this.parts; let n = 0;
    for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; q.life += dt; if (q.life > q.max) { P.splice(i, 1); continue; } q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vx += (0.6 - q.vx) * dt * 0.6; q.vy += (0.25 - q.vy) * dt * 0.8; }
    for (const q of P) { const f = 1 - q.life / q.max; this.pos[n * 3] = q.x; this.pos[n * 3 + 1] = q.y; this.pos[n * 3 + 2] = q.z; this.col[n * 3] = q.c[0] * f + 0.0; this.col[n * 3 + 1] = q.c[1] * f; this.col[n * 3 + 2] = q.c[2] * f; n++; }
    this.geo.setDrawRange(0, n); this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}
