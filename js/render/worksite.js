// 场景/渲染·施工现场：改造中的房子周围搭铅笔杆 + 冰棍棍的脚手架、一圈绳子围栏和一面小三角旗、旁边一小堆材料（按已到位的材料数显示），
// 头顶一个缓慢上下浮动的小牌子：在干活时是锤子和扳手，缺料停工时变成“？”加上缺的材料小图标。全部实例化，只画改造中的房子。
import * as THREE from 'three';
import { M, PI, TAU, clamp, ctex } from '../lib/core.js';
import { artUrl } from '../ui-art.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const STICK = ['#ead0a0', '#e2c48e', '#f0dbb0', '#dcbc84'], PENCIL = ['#f2c23a', '#3e6fae', '#5fa14c', '#d9473b'];
export const MAT_FILE = { cap: 'bottlecap', grass: 'hay' }; // 材料小图标的文件名（assets/ui/mat-*.png）
// 带顶点色的小零件
function tint(g, col) { g = g.index ? g.toNonIndexed() : g; _c.set(col); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; }
const T = (g, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { g.applyMatrix4(_m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz))); return tint(g, col); };
function merge(list) { const g = new THREE.BufferGeometry(); for (const [k, n] of [['position', 3], ['normal', 3], ['color', 3]]) { const arrs = list.map(x => x.attributes[k].array); const out = new Float32Array(arrs.reduce((a, b) => a + b.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } g.setAttribute(k, new THREE.BufferAttribute(out, n)); } g.computeBoundingSphere(); return g; }
const cyl = (a, b, h, n = 8) => new THREE.CylinderGeometry(a, b, h, n);
// 材料小模型（大小按小动物比例，约半个身子高）
const MAT_MODEL = {
  twig: () => [0, 1, 2].map(k => T(cyl(0.05, 0.06, 0.9, 6), ['#8a5a32', '#a06a3a', '#7a4a2a'][k], (k - 1) * 0.1, 0.07 + (k % 2) * 0.08, 0, PI / 2, 0, (k - 1) * 0.15)).concat([T(new THREE.TorusGeometry(0.11, 0.025, 4, 10), '#d9b77a', 0, 0.1, 0, 0, PI / 2, 0)]),
  stone: () => [T(new THREE.DodecahedronGeometry(0.22, 0), '#a9a39a', 0, 0.14, 0, 0.3, 0.5, 0, 1, 0.7, 1), T(new THREE.DodecahedronGeometry(0.14, 0), '#bdb6aa', 0.22, 0.09, 0.1, 0.7, 0.2, 0, 1, 0.7, 1)],
  grass: () => [T(cyl(0.18, 0.2, 0.5, 9), '#e2c25a', 0, 0.25, 0, 0, 0, 0.0), T(new THREE.ConeGeometry(0.2, 0.18, 9), '#ecd27a', 0, 0.58, 0), T(cyl(0.205, 0.205, 0.06, 9), '#b0703a', 0, 0.28, 0)],
  button: () => [T(cyl(0.26, 0.26, 0.08, 18), '#d8443a', 0, 0.04, 0), T(new THREE.TorusGeometry(0.21, 0.025, 4, 18), '#b8342c', 0, 0.085, 0, PI / 2), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => T(cyl(0.03, 0.03, 0.02, 6), '#5a1a14', a * 0.06, 0.085, b * 0.06))],
  cap: () => { const g = cyl(0.2, 0.2, 0.1, 24); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); if (r < 0.1) continue; const k = 1 + 0.08 * (Math.round(Math.atan2(z, x) / TAU * 24) % 2 ? 1 : -0.3); p.setX(i, x * k); p.setZ(i, z * k); } g.computeVertexNormals(); return [T(g, '#3a7fc1', 0, 0.05, 0), T(cyl(0.15, 0.15, 0.01, 18), '#f3ead6', 0, 0.105, 0)]; },
  thread: () => [T(cyl(0.18, 0.18, 0.05, 12), '#c98f55', 0, 0.025, 0), T(cyl(0.18, 0.18, 0.05, 12), '#c98f55', 0, 0.37, 0), T(cyl(0.14, 0.14, 0.3, 12), '#d9574a', 0, 0.2, 0)],
  nail: () => [0, 1].flatMap(k => [T(cyl(0.025, 0.012, 0.5, 6), '#9aa4ae', (k - 0.5) * 0.18, 0.04, k * 0.1, PI / 2, 0, k * 0.6), T(cyl(0.06, 0.06, 0.02, 8), '#7d8790', (k - 0.5) * 0.18 + Math.sin(k * 0.6) * -0.25, 0.04, k * 0.1 - Math.cos(k * 0.6) * 0.25 + 0.25, PI / 2, 0, k * 0.6)]),
};
// 头顶小牌子：圆搪瓷牌 + 锤子扳手；或“？”+ 缺的材料图标
const IMG = {}; function img(k) { const f = 'mat-' + (MAT_FILE[k] || k); if (IMG[f] !== undefined) return IMG[f]; const u = artUrl(f); if (!u) return null; const im = new Image(); IMG[f] = null; im.onload = () => { IMG[f] = im; for (const t of Object.values(TEXC)) t.dispose(); for (const k2 in TEXC) delete TEXC[k2]; }; im.src = u; return null; }
const MAT_DOT = { twig: '#8a5a32', stone: '#a9a39a', grass: '#e2c25a', button: '#d8443a', cap: '#3a7fc1', thread: '#d9574a', nail: '#9aa4ae' };
const TEXC = {};
function badge(g, cx, cy, r, stall) {
  g.fillStyle = 'rgba(60,30,10,.28)'; g.beginPath(); g.arc(cx, cy + 6, r, 0, TAU); g.fill();
  g.fillStyle = stall ? '#f6dcc8' : '#fbf1da'; g.strokeStyle = stall ? '#c8432f' : '#8a5530'; g.lineWidth = 9; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r - 10, PI * 1.1, PI * 1.55); g.stroke();
}
function iconTex(miss) {
  const key = miss.length ? 'stall:' + miss.join(',') : 'work'; if (TEXC[key]) return TEXC[key];
  const n = miss.length, W = n ? 128 + n * 104 : 128, H = 128;
  const tx = ctex(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    if (!n) { badge(g, 64, 60, 52, false);
      g.save(); g.translate(64, 60); g.rotate(-0.7); g.fillStyle = '#9a5c2c'; g.fillRect(-6, -10, 12, 46); g.fillStyle = '#7d8790'; g.fillRect(-20, -26, 40, 16); g.fillStyle = '#5d646c'; g.fillRect(14, -26, 8, 16); g.restore();
      g.save(); g.translate(64, 60); g.rotate(0.7); g.fillStyle = '#9aa4ae'; g.fillRect(-5, -14, 10, 44); g.beginPath(); g.arc(0, -20, 13, 0, TAU); g.fill(); g.fillStyle = '#fbf1da'; g.fillRect(-5, -36, 10, 16); g.restore();
    } else {
      g.fillStyle = 'rgba(60,30,10,.25)'; rr(g, 8, 18, W - 16, 100, 46); g.fill(); g.fillStyle = '#fff3e4'; g.strokeStyle = '#c8432f'; g.lineWidth = 8; rr(g, 8, 10, W - 16, 100, 46); g.fill(); g.stroke();
      g.fillStyle = '#c8432f'; g.font = '900 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('？', 64, 64);
      miss.forEach((k, i) => { const x = 128 + i * 104 + 46, y = 60; const im = img(k); if (im) g.drawImage(im, x - 44, y - 44, 88, 88); else { g.fillStyle = MAT_DOT[k] || '#999'; g.beginPath(); g.arc(x, y, 30, 0, TAU); g.fill(); } });
    }
  });
  tx.colorSpace = THREE.SRGBColorSpace; TEXC[key] = tx; return tx;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export class Worksite {
  constructor(scene) {
    this.scene = scene;
    const mk = (geo, mat, cap, shadow = true) => { const im = new THREE.InstancedMesh(geo, mat, cap); im.count = 0; im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); return { im, n: 0, cap }; };
    const vc = M('#ffffff', { vc: true, r: 0.82 });
    this.stick = mk(new THREE.BoxGeometry(1, 1, 1), M('#ffffff', { r: 0.85 }), 1400);                 // 冰棍棍：本地 y 为长度方向，x 为宽、z 为厚
    // 铅笔杆：六棱笔身（实例色）+ 削好的木头尖 + 笔芯；本地 y 从 0 到 1
    this.pencil = mk(cyl(0.5, 0.5, 1, 6).translate(0, 0.5, 0), M('#ffffff', { r: 0.6 }), 200);
    this.tip = mk(merge([T(new THREE.ConeGeometry(0.5, 0.9, 6), '#e8c48a', 0, 0.45), T(new THREE.ConeGeometry(0.17, 0.3, 6), '#3a3a3a', 0, 0.75)]), vc, 200);
    this.rope = mk(cyl(0.5, 0.5, 1, 5, 1).translate(0, 0.5, 0), M('#d9b77a', { r: 0.95 }), 600, false);
    const fs = new THREE.BufferGeometry(); fs.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.42, 0, 0.72, -0.21, 0], 3)); fs.computeVertexNormals();
    this.flag = mk(fs, M('#d9473b', { r: 0.7, ds: true }), 16, false);
    this.mats = {}; for (const k in MAT_MODEL) this.mats[k] = mk(merge(MAT_MODEL[k]()), vc, 40);
    this.sprites = []; this.sites = [];
  }
  // sites: [{ id, x, z, yaw, r, h, y, prog, miss, pile }]
  update(dt, t, sites) {
    for (const k of ['stick', 'pencil', 'tip', 'rope', 'flag']) this[k].n = 0; for (const k in this.mats) this.mats[k].n = 0;
    let ns = 0;
    for (const S of sites) {
      const R = S.r * 0.86 + 0.35, H = clamp(S.h * 0.78, 1.6, 7.5), y0 = S.y || 0; _m.compose(_v.set(S.x, y0, S.z), _q.setFromEuler(_e.set(0, S.yaw, 0)), _s.set(1, 1, 1));
      const L = (x, y, z) => _v.set(x, y, z).applyMatrix4(_m).clone();
      // 脚手架：前面（门这一侧 +z）留空，其余一圈立铅笔杆，杆间横绑冰棍棍，隔一格斜撑一根
      const nb = clamp(Math.round(TAU * R / 2.3), 6, 14), gap = 0.62; const poles = [];
      for (let i = 0; i < nb; i++) { const a = i / nb * TAU; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < gap) continue; poles.push([a, Math.sin(a) * R, Math.cos(a) * R, H * (0.92 + 0.08 * Math.sin(i * 2.7 + S.id))]); }
      for (let i = 0; i < poles.length; i++) { const [a, px, pz, ph] = poles[i]; this.pole(L(px, 0, pz), ph, PENCIL[(i + S.id) % 4]); }
      const lv = Math.max(2, Math.round(H / 1.15));
      for (let i = 0; i + 1 < poles.length; i++) { const A = poles[i], B = poles[i + 1]; if (Math.abs(Math.atan2(Math.sin(B[0] - A[0]), Math.cos(B[0] - A[0]))) > TAU / nb * 1.5) continue;
        for (let k = 1; k <= lv; k++) { const yy = Math.min(A[3], B[3]) * k / (lv + 0.3); this.bar(L(A[1] * 1.04, yy, A[2] * 1.04), L(B[1] * 1.04, yy, B[2] * 1.04), STICK[(i + k) % 4]); }
        if ((i + S.id) % 2 === 0) this.bar(L(A[1] * 1.07, 0.25, A[2] * 1.07), L(B[1] * 1.07, Math.min(A[3], B[3]) * 0.82, B[2] * 1.07), STICK[(i + 3) % 4]);
        // 中间一层走板：两根并排的宽冰棍棍
        const ym = Math.min(A[3], B[3]) * Math.round(lv / 2) / (lv + 0.3); for (const o of [0.82, 0.92]) this.bar(L(A[1] * o, ym + 0.04, A[2] * o), L(B[1] * o, ym + 0.04, B[2] * o), STICK[(i + 1) % 4], 0.26, 0.05, true); }
      // 梯子（靠在第一根杆子旁）
      if (poles.length) { const [a, px, pz] = poles[0]; const ox = Math.cos(a) * 0.35, oz = -Math.sin(a) * 0.35, k2 = 1.22, top = H * 0.7; for (const sd of [-1, 1]) this.bar(L(px * k2 + ox * sd, 0, pz * k2 + oz * sd), L(px * 1.08 + ox * sd, top, pz * 1.08 + oz * sd), '#c98f55', 0.09, 0.07);
        for (let yy = 0.35; yy < top; yy += 0.42) { const f = yy / top, kk = k2 + (1.08 - k2) * f; this.bar(L(px * kk - ox, yy, pz * kk - oz), L(px * kk + ox, yy, pz * kk + oz), '#e2c48e', 0.08, 0.06); } }
      // 绳子围栏：一圈小木桩，桩顶之间拉绳（中间下垂），前面留个口；一根高一点的桩上挂小三角旗
      const RF = R + 0.95, nf = clamp(Math.round(TAU * RF / 1.7), 8, 22), fg = 0.32; const fp = [];
      for (let i = 0; i < nf; i++) { const a = i / nf * TAU + PI / nf; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < fg) continue; fp.push([a, Math.sin(a) * RF, Math.cos(a) * RF]); }
      fp.forEach(([a, x, z], i) => { const tall = i === Math.floor(fp.length * 0.62); const ph = tall ? 1.75 : 0.62; this.post(L(x, 0, z), ph);
        if (tall) { _m2.compose(L(x, ph - 0.02, z), _q.setFromEuler(_e.set(0, S.yaw + a + PI / 2 + Math.sin(t * 2.1 + S.id) * 0.35, 0)), _s.set(1, 1, 1)); this.put(this.flag, _m2); } });
      for (let i = 0; i + 1 < fp.length; i++) { const A = fp[i], B = fp[i + 1]; if (Math.abs(Math.atan2(Math.sin(B[0] - A[0]), Math.cos(B[0] - A[0]))) > TAU / nf * 1.5) continue; const mx = (A[1] + B[1]) / 2, mz = (A[2] + B[2]) / 2;
        this.cord(L(A[1], 0.55, A[2]), L(mx, 0.44, mz)); this.cord(L(mx, 0.44, mz), L(B[1], 0.55, B[2])); }
      // 材料堆：门右前方，按已到位的件数一件件摆
      let idx = 0; const bx = R * 0.5 + 0.5, bz = R * 0.8 + 0.55;
      for (const [k, n] of S.pile || []) for (let j = 0; j < n && idx < 9; j++, idx++) { const M2 = this.mats[k]; if (!M2) continue; const ring = idx < 5 ? 0 : 1; const a = idx * 2.39; const rr2 = ring ? 0.35 : 0.25 + idx * 0.18;
        _m2.compose(L(bx + Math.cos(a) * rr2, ring * 0.3, bz + Math.sin(a) * rr2), _q.setFromEuler(_e.set(0, S.yaw + idx * 1.7, 0)), _s.set(1.5, 1.5, 1.5)); this.put(M2, _m2); }
      // 头顶小牌子
      let sp = this.sprites[ns]; if (!sp) { sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false })); sp.renderOrder = 3; this.scene.add(sp); this.sprites[ns] = sp; }
      const miss = S.miss || []; const tex = iconTex(miss); if (sp.material.map !== tex) { sp.material.map = tex; sp.material.needsUpdate = true; }
      const sc = 1.25 + clamp(S.r * 0.12, 0, 0.6); const asp = tex.image ? tex.image.width / tex.image.height : 1; sp.scale.set(sc * asp, sc, 1);
      sp.position.set(S.x, y0 + S.h + 1.1 + sc * 0.5 + Math.sin(t * 1.4 + S.id) * 0.22, S.z); sp.visible = true; ns++;
    }
    for (let i = ns; i < this.sprites.length; i++) this.sprites[i].visible = false;
    for (const D of [this.stick, this.pencil, this.tip, this.rope, this.flag, ...Object.values(this.mats)]) { D.im.count = D.n; D.im.visible = D.n > 0; if (D.n) { D.im.instanceMatrix.needsUpdate = true; if (D.im.instanceColor) D.im.instanceColor.needsUpdate = true; } }
    this.count = sites.length;
  }
  put(D, m, col) { if (D.n >= D.cap) return; D.im.setMatrixAt(D.n, m); if (col) D.im.setColorAt(D.n, _c.set(col)); D.n++; }
  pole(p, h, col) { _m2.compose(p, _q.identity(), _s.set(0.15, h, 0.15)); this.put(this.pencil, _m2, col); _m2.compose(_v.copy(p).setY(p.y + h), _q.identity(), _s.set(0.15, 0.3, 0.15)); this.put(this.tip, _m2); }
  post(p, h) { _m2.compose(p, _q.identity(), _s.set(0.11, h, 0.11)); this.put(this.pencil, _m2, '#b27242'); }
  // 一根扁棍：从 a 到 b，宽面朝上（flat）或朝外
  bar(a, b, col, w = 0.13, th = 0.04, flat = false) {
    _Y.subVectors(b, a); const len = _Y.length(); if (len < 1e-3) return; _Y.divideScalar(len);
    _X.copy(_up).addScaledVector(_Y, -_up.dot(_Y)); if (_X.lengthSq() < 1e-4) _X.set(1, 0, 0); _X.normalize(); _Z.crossVectors(_X, _Y);
    if (flat) { const t2 = _X.clone(); _X.copy(_Z); _Z.copy(t2).negate(); }
    _m2.makeBasis(_X, _Y, _Z); _q.setFromRotationMatrix(_m2); _m2.compose(_v.addVectors(a, b).multiplyScalar(0.5), _q, _s.set(w, len + 0.12, th)); this.put(this.stick, _m2, col);
  }
  cord(a, b) { _Y.subVectors(b, a); const len = _Y.length(); _q.setFromUnitVectors(_up, _Y.divideScalar(len)); _m2.compose(a, _q, _s.set(0.045, len, 0.045)); this.put(this.rope, _m2); }
}
