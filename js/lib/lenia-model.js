// Lenia 与鸡块：照茉团官方形象（docs/art/lenia-official/、_handoff/images/lenia-official/05-model-turnaround.png）用代码建的 3D 模型。
// 只做模型、姿势和预览（tools/lenia-preview.html），还没接入游戏。
// 做法：关节是普通 Object3D 层级（不用 GPU 蒙皮），同一关节同一材质的部件合并成一个网格；姿势 = 关节目标角度，每帧平滑逼近，所以切换姿势自然过渡。
// 建模单位：Lenia 站立身高 = 1（H），最后整体放大到 LENIA_H；鸡块身高 = 1，放大到 NUGGET_H。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch } from './core.js';

// ---------------------------------------------------------------- 尺度（世界单位）
export const RESIDENT_H = 1.6;              // 居民平均身高：characters.js 各物种 top 1.08～1.78 × CS 1.12，取常见值
export const LENIA_H = RESIDENT_H * 7;      // Lenia 站立高度 ≈ 居民的 7 倍
export const NUGGET_H = LENIA_H * 0.25;     // 鸡块高约 Lenia 的 1/4
export const LENIA_POSES = ['idle', 'walk', 'read', 'water', 'carry', 'wave'];
export const NUGGET_POSES = ['idle', 'hop', 'hold', 'lean'];

const PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- 程序化贴图
function canvasTex(w, h, draw, { rep = [1, 1], srgb = true } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function prng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// 粗针织：一列列 V 形针脚（颜色图 + 凹凸图同一套形状）；列与列之间有一道凹槽
function drawKnit(g, w, h, bump, rib = false) {
  const rnd = prng(rib ? 77 : 41); const cols = rib ? 8 : 6, rows = rib ? 10 : 8; const cw = w / cols, rh = h / rows;
  g.fillStyle = bump ? '#1a1a1a' : '#bfa98a'; g.fillRect(0, 0, w, h);
  g.lineCap = 'round';
  for (let c = 0; c < cols; c++) for (let r = -1; r <= rows; r++) {
    const cx = c * cw + cw / 2, cy = r * rh;
    for (const s of [-1, 1]) {
      const x0 = cx + s * cw * 0.36, y0 = cy + rh * 0.05, x1 = cx + s * cw * 0.05, y1 = cy + rh * 1.0;
      const v = 0.93 + rnd() * 0.09; const base = [243 * v, 234 * v, 216 * v].map(x => Math.min(255, x | 0));
      for (let k = 0; k < 3; k++) { // 三层描边做出圆鼓的针脚
        const lw = cw * (0.36 - k * 0.11);
        g.strokeStyle = bump ? ['#6a6a6a', '#b8b8b8', '#ffffff'][k] : `rgb(${base.map(x => x - (2 - k) * 20 | 0)})`;
        g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0 + k * 0.5); g.lineTo(x1, y1 - k * 0.5); g.stroke();
      }
    }
  }
  if (!bump) for (let i = 0; i < 260; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(150,120,90,0.25)' : 'rgba(255,250,240,0.35)'; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
}
function drawDenim(g, w, h, bump) {
  const rnd = prng(9); g.fillStyle = bump ? '#808080' : '#7097c9'; g.fillRect(0, 0, w, h);
  for (let i = -h; i < w; i += 3) { g.strokeStyle = bump ? (i % 6 ? '#a0a0a0' : '#606060') : (i % 6 ? 'rgba(160,190,225,0.35)' : 'rgba(40,70,120,0.25)'); g.lineWidth = 1.4; g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
  if (!bump) for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(220,235,250,0.18)' : 'rgba(30,55,100,0.15)'; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 6, 1); }
}

// ---------------------------------------------------------------- 共享材质（所有 Lenia / 鸡块 / 玩家手共用）
let _MAT = null;
const HAIR_SWAY = { uSwayT: { value: 0 }, uSwayK: { value: 1 } };
function std(color, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.8, metalness: 0, map: o.map || null, bumpMap: o.bump || null, bumpScale: o.bs ?? 1, side: o.ds ? THREE.DoubleSide : THREE.FrontSide, transparent: !!o.tr, depthWrite: o.tr ? false : true });
  if (o.em) { m.emissive = new THREE.Color(o.em); m.emissiveIntensity = o.ei ?? 1; }
  patch(m, { rim: o.rim ?? 0.8, wx: 0 });
  return m;
}
export function leniaMaterials() {
  if (_MAT) return _MAT;
  const knitMap = canvasTex(256, 256, (g, w, h) => drawKnit(g, w, h, false)), knitBump = canvasTex(256, 256, (g, w, h) => drawKnit(g, w, h, true), { srgb: false });
  const ribMap = canvasTex(256, 256, (g, w, h) => drawKnit(g, w, h, false, true)), ribBump = canvasTex(256, 256, (g, w, h) => drawKnit(g, w, h, true, true), { srgb: false });
  const denMap = canvasTex(256, 256, (g, w, h) => drawDenim(g, w, h, false)), denBump = canvasTex(256, 256, (g, w, h) => drawDenim(g, w, h, true), { srgb: false });
  const M = {
    skin: std('#f9dcc8', { r: 0.72, rim: 0.55, em: '#5a2410', ei: 0.05 }),
    hair: std('#4b2d20', { r: 0.48, rim: 0.3, ds: true }),
    hairDark: std('#3a2218', { r: 0.7, rim: 0.2, ds: true }),
    knit: std('#ffffff', { map: knitMap, bump: knitBump, bs: 1.4, r: 0.95, rim: 0.9, ds: true }),
    rib: std('#fbf5ea', { map: ribMap, bump: ribBump, bs: 2.2, r: 0.95, rim: 0.9 }),
    tee: std('#f7f4ee', { r: 0.85, rim: 0.6 }),
    denim: std('#ffffff', { map: denMap, bump: denBump, bs: 0.8, r: 0.9, rim: 0.7, ds: true }),
    sock: std('#f6f4f0', { r: 0.9, rim: 0.7 }),
    button: std('#a88a6c', { r: 0.5, rim: 0.4 }),
    bookCover: std('#c8573f', { r: 0.7 }), bookPage: std('#f7efdc', { r: 0.9 }),
    can: std('#5f90c4', { r: 0.35, rim: 0.6 }), canDark: std('#3f6d9e', { r: 0.4 }),
    water: std('#bfe3ff', { r: 0.1, tr: true, em: '#8cc8ff', ei: 0.25 }),
    box: std('#c99a62', { r: 0.95 }), boxTape: std('#e3c590', { r: 0.6 }),
    wood: std('#b88350', { r: 0.85 }),
    nugget: std('#f3e5cf', { r: 0.62, rim: 0.45, em: '#40200c', ei: 0.04 }),
    nuggetFace: std('#3a2117', { r: 0.28, rim: 0.1 }),
    seed: std('#8a5a33', { r: 0.6 }),
  };
  M.water.opacity = 0.6;
  // 头发：尖端随时间轻摆（aSw = 发束上的位置 0 根 → 1 梢、相位）
  const hp = M.hair.onBeforeCompile;
  for (const hm of [M.hair, M.hairDark]) {
    const prev = hm.onBeforeCompile;
    hm.onBeforeCompile = (sh, r) => {
      prev(sh, r); Object.assign(sh.uniforms, HAIR_SWAY);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aSw; uniform float uSwayT, uSwayK;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float w = aSw.x * aSw.x * uSwayK; transformed.x += w * 0.010 * sin(uSwayT * 1.5 + aSw.y); transformed.z += w * 0.007 * sin(uSwayT * 1.1 + aSw.y * 1.7); }`);
    };
    hm.customProgramCacheKey = () => 'leniaHair' + (hm === M.hair ? 'a' : 'b');
  }
  void hp;
  _MAT = M; return M;
}

// ---------------------------------------------------------------- 几何工具
const _mx = new THREE.Matrix4(), _qq = new THREE.Quaternion();
function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  _mx.compose(new THREE.Vector3(...p), _qq.setFromEuler(new THREE.Euler(r[0], r[1], r[2], r[3] || 'XYZ')), new THREE.Vector3(...s)); g.applyMatrix4(_mx);
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aSw'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
function withSw(g, w = 0, ph = 0) { if (!g.attributes.aSw) { const n = g.attributes.position.count; const a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = w; a[i * 2 + 1] = ph; } g.setAttribute('aSw', new THREE.BufferAttribute(a, 2)); } return g; }
const sph = (w = 20, h = 14) => new THREE.SphereGeometry(1, w, h);
// 光滑剖面：控制点 [r, y] → n 段
function prof(ctrl, n = 20) { const c = new THREE.SplineCurve(ctrl.map(p => new THREE.Vector2(p[0], p[1]))); return c.getSpacedPoints(n).map(v => new THREE.Vector2(Math.max(v.x, 0.0005), v.y)); }
function lathe(ctrl, { n = 12, seg = 24, tz = 1, x = 0, z = 0, uvk = [4, 14] } = {}) { const g = new THREE.LatheGeometry(prof(ctrl, n), seg); { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * uvk[0], u.getY(i) * uvk[1]); } g.scale(1, 1, tz); g.translate(x, 0, z); return g; }
// 前面开口的旋转体（开衫）：gap(y) 是前开口的半角
function latheOpen(ctrl, gap, { n = 28, seg = 40, tz = 1 } = {}) {
  const pts = prof(ctrl, n); const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) { const { x: r, y } = pts[i]; const g0 = gap(y); for (let j = 0; j <= seg; j++) { const a = g0 + (TAU - 2 * g0) * j / seg; pos.push(r * Math.sin(a), y, r * Math.cos(a) * tz); uv.push(a / TAU * 14, y * 22); } }
  for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function tubeAlong(pts, r, segs = 40, radial = 8, closed = false, uk = 0) { const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), closed), segs, r, radial, closed); if (uk) { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * uk, u.getY(i) * 0.5); } return g; }
// 扁截面发束：path 是中心线点，宽/厚随 t 变化，截面"宽"方向沿头的切向
function lockTube(pts, wFn, thFn, ph, segs = 28, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const pos = [], sw = [], idx = []; const T = new THREE.Vector3(), O = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; curve.getPointAt(t, C); curve.getTangentAt(t, T);
    B.set(C.z, 0, -C.x); if (B.lengthSq() < 1e-6) B.set(1, 0, 0); B.normalize(); B.addScaledVector(T, -B.dot(T)).normalize();
    O.crossVectors(T, B).normalize(); const w = wFn(t), th = thFn(t);
    for (let j = 0; j <= radial; j++) { const a = j / radial * TAU; const cw = Math.cos(a), sw2 = Math.sin(a); pos.push(C.x + B.x * w * cw + O.x * th * sw2, C.y + B.y * w * cw + O.y * th * sw2, C.z + B.z * w * cw + O.z * th * sw2); sw.push(t, ph); }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aSw', new THREE.Float32BufferAttribute(sw, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const _sp = new THREE.Vector3();
const triCount = (root) => { let n = 0; root.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; };

// 关节搭建器：部件用"模型坐标（站立、单位 H）"给出，自动换算到所属关节的局部坐标；同关节同材质合并
class Rig {
  constructor() { this.root = new THREE.Group(); this.J = {}; this.rest = {}; this.buckets = new Map(); this.tagged = {}; }
  joint(name, parent, p) { const o = new THREE.Group(); o.name = name; const pp = parent ? this.rest[parent] : [0, 0, 0]; o.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]); (parent ? this.J[parent] : this.root).add(o); this.J[name] = o; this.rest[name] = p; return o; }
  add(joint, mat, geo, tag = '') { const r = this.rest[joint]; const g = xf(geo, [-r[0], -r[1], -r[2]]); if (mat === 'hair' || mat === 'hairDark') withSw(g); const k = joint + '|' + mat + '|' + tag; if (!this.buckets.has(k)) this.buckets.set(k, []); this.buckets.get(k).push(g); }
  finish(M) {
    for (const [k, list] of this.buckets) {
      const [joint, mat, tag] = k.split('|');
      if (mat === 'hair' || mat === 'hairDark') list.forEach(g => withSw(g));
      const m = new THREE.Mesh(mergeGeometries(list, false), M[mat]); m.castShadow = mat !== 'water'; m.receiveShadow = true; m.name = k;
      this.J[joint].add(m); if (tag) (this.tagged[tag] ||= []).push(m);
    }
    this.buckets.clear();
  }
}

// ---------------------------------------------------------------- 脸（贴在头上的一块球面贴片，画布绘制，换表情时重画）
const HEAD = { c: [0, 0.765, 0], r: [0.163, 0.152, 0.152] };
const FACE = { W: 1.9, t0: 1.12, t1: 2.6 };
function faceXY(x, y, S) { // 模型坐标（脸前表面上的点）→ 画布像素与局部缩放
  const ct = clamp((y - HEAD.c[1]) / HEAD.r[1], -0.999, 0.999); const th = Math.acos(ct), st = Math.sin(th);
  const d = Math.asin(clamp(x / (HEAD.r[0] * st), -0.999, 0.999));
  return { X: (d + FACE.W / 2) / FACE.W * S, Y: (th - FACE.t0) / (FACE.t1 - FACE.t0) * S, kx: S / (FACE.W * HEAD.r[0] * st * Math.cos(d)), ky: S / ((FACE.t1 - FACE.t0) * HEAD.r[1] * st) };
}
function drawFace(g, S, ex) {
  g.clearRect(0, 0, S, S);
  const at = (x, y, fn) => { const q = faceXY(x, y, S); g.save(); g.translate(q.X, q.Y); g.scale(q.kx, q.ky); fn(); g.restore(); };
  // 红晕
  for (const s of [-1, 1]) at(s * 0.097, 0.682, () => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 0.032); gr.addColorStop(0, 'rgba(244,140,140,0.55)'); gr.addColorStop(1, 'rgba(244,140,140,0)');
    g.fillStyle = gr; g.save(); g.scale(1, 0.55); g.beginPath(); g.arc(0, 0, 0.032, 0, TAU); g.fill(); g.restore();
    g.strokeStyle = 'rgba(226,120,120,0.35)'; g.lineWidth = 0.0018; g.lineCap = 'round'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 0.009 - 0.003, 0.005); g.lineTo(i * 0.009 + 0.003, -0.005); g.stroke(); }
  });
  // 粗眉：内端粗、外端略收
  for (const s of [-1, 1]) at(s * 0.066, 0.787, () => {
    g.fillStyle = '#4a2b1c'; g.beginPath();
    const P = (x, y) => [s * x, -y];
    g.moveTo(...P(-0.036, 0.004)); g.quadraticCurveTo(...P(0.0, 0.013), ...P(0.038, 0.002)); g.quadraticCurveTo(...P(0.043, -0.004), ...P(0.036, -0.005));
    g.quadraticCurveTo(...P(0.0, 0.003), ...P(-0.035, -0.007)); g.quadraticCurveTo(...P(-0.042, -0.002), ...P(-0.036, 0.004)); g.fill();
  });
  // 眼睛
  for (const s of [-1, 1]) at(s * 0.064, 0.722, () => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (ex.eyes === 'open') {
      const gr = g.createLinearGradient(0, -0.027, 0, 0.027); gr.addColorStop(0, '#24120a'); gr.addColorStop(0.55, '#4e2a18'); gr.addColorStop(1, '#9a6640');
      g.scale(1.12, 1.12);
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0.0015, 0.0205, 0.0255, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(20,8,4,0.85)'; g.beginPath(); g.ellipse(0, -0.002, 0.0105, 0.0135, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-0.0075, -0.0105, 0.0072, 0, TAU); g.fill();
      g.beginPath(); g.arc(0.008, 0.0105, 0.0034, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(0.0105, -0.004, 0.0022, 0, TAU); g.fill();
      // 上睫毛线：盖住虹膜上缘，外眼角上翘一个小尾巴
      g.strokeStyle = '#26130b'; g.lineWidth = 0.0058; g.beginPath(); g.moveTo(-s * 0.0255, -0.004); g.quadraticCurveTo(-s * 0.012, -0.034, s * 0.012, -0.031); g.quadraticCurveTo(s * 0.024, -0.026, s * 0.03, -0.016); g.stroke();
      g.lineWidth = 0.004; g.beginPath(); g.moveTo(s * 0.027, -0.02); g.lineTo(s * 0.038, -0.027); g.stroke();
      g.lineWidth = 0.003; g.beginPath(); g.moveTo(s * 0.029, -0.013); g.lineTo(s * 0.037, -0.015); g.stroke();
      g.strokeStyle = 'rgba(150,100,80,0.55)'; g.lineWidth = 0.0022; g.beginPath(); g.moveTo(-s * 0.012, 0.0285); g.quadraticCurveTo(0, 0.031, s * 0.014, 0.027); g.stroke();
    } else if (ex.eyes === 'happy') { // 笑眯眼：向上拱的弧线 + 外眼角小翘
      g.strokeStyle = '#2a160d'; g.lineWidth = 0.0062; g.beginPath(); g.moveTo(-s * 0.022, 0.006); g.quadraticCurveTo(0, -0.02, s * 0.022, 0.006); g.stroke();
      g.lineWidth = 0.0038; g.beginPath(); g.moveTo(s * 0.021, 0.004); g.lineTo(s * 0.031, -0.002); g.stroke();
    } else { // 眨眼：向下弯的线
      g.strokeStyle = '#2a160d'; g.lineWidth = 0.0055; g.beginPath(); g.moveTo(-s * 0.023, 0.0); g.quadraticCurveTo(0, 0.012, s * 0.024, -0.001); g.stroke();
      g.lineWidth = 0.0035; g.beginPath(); g.moveTo(s * 0.023, -0.001); g.lineTo(s * 0.032, -0.007); g.stroke();
    }
  });
  // 嘴
  at(0, 0.652, () => {
    g.lineCap = 'round';
    if (ex.mouth === 'open') {
      g.fillStyle = '#7d2f2b'; g.beginPath(); g.moveTo(-0.019, -0.004); g.quadraticCurveTo(0, 0.0, 0.019, -0.004); g.quadraticCurveTo(0.016, 0.022, 0, 0.023); g.quadraticCurveTo(-0.016, 0.022, -0.019, -0.004); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(-0.016, -0.002); g.quadraticCurveTo(0, 0.002, 0.016, -0.002); g.lineTo(0.014, 0.004); g.quadraticCurveTo(0, 0.007, -0.014, 0.004); g.fill();
      g.fillStyle = '#e98c86'; g.beginPath(); g.ellipse(0, 0.017, 0.010, 0.005, 0, 0, TAU); g.fill();
    } else {
      g.strokeStyle = '#8c4a3c'; g.lineWidth = 0.0032; g.beginPath(); g.moveTo(-0.013, -0.002); g.quadraticCurveTo(0, 0.008, 0.013, -0.002); g.stroke();
    }
  });
  // 鼻子下一点点暖色阴影
  at(0, 0.688, () => { const gr = g.createRadialGradient(0, 0.004, 0, 0, 0.004, 0.012); gr.addColorStop(0, 'rgba(225,150,125,0.35)'); gr.addColorStop(1, 'rgba(225,150,125,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0.004, 0.012, 0, TAU); g.fill(); });
}

// ---------------------------------------------------------------- Lenia 的造型
const ARM_X = 0.142, SH_Y = 0.548, EL_Y = 0.432, WR_Y = 0.322, HIP_X = 0.066, HIP_Y = 0.40, KN_Y = 0.215, AN_Y = 0.035;
const L1 = HIP_Y - KN_Y, L2 = KN_Y - AN_Y; const HEAD_K = 1.09;
// 头发包络半径（从中轴量起）：头部随发帽椭球，下面垂直落下并慢慢蓬开
function hairEnv(y, a = 0) { const back = smooth(0.0, -0.9, Math.cos(a)) * smooth(0.72, 0.56, y); return hairEnv0(y) * (1 - 0.28 * back); }
function hairEnv0(y) { if (y > 0.765) { const k = (y - 0.775) / 0.2; return 0.183 * Math.sqrt(Math.max(0.02, 1 - k * k)) + 0.006; } return 0.188 + (0.765 - y) * 0.2; }

function hairSkirt(a0, N) {
  const nu = 62, nv = 28; const pos = [], sw = [], idx = [];
  for (let i = 0; i <= nv; i++) {
    const v = i / nv;
    for (let j = 0; j <= nu; j++) {
      const a = lerp(a0, TAU - a0, j / nu);
      const lobe = 0.5 + 0.5 * Math.cos(N * (a - PI));
      const yEnd = 0.385 + 0.06 * smooth(-1, 0.4, Math.cos(a)) - 0.04 * lobe * lobe;
      const y0 = lerp(0.9, yEnd, Math.pow(v, 1.15)); const wv = smooth(0.2, 0.55, v);
      const aw = a + 0.06 * wv * Math.sin(2.0 * TAU * v + a * 3.0);
      const l2 = 0.5 + 0.5 * Math.cos(N * (aw - PI)); const ft = smooth(0.78, 1, v) ** 2;
      const edge = smooth(a0, a0 + 0.35, a) * smooth(TAU - a0, TAU - a0 - 0.35, a); // 两侧开口边缘收薄、贴近
      const R = hairEnv(y0, aw) + 0.002 + (0.03 * Math.pow(l2, 0.7) - 0.012) * smooth(0.02, 0.2, v) + 0.02 * wv * Math.sin(2.1 * TAU * v + aw * 2.2) + 0.045 * ft * (0.4 + 0.6 * l2) - 0.012 * (1 - edge);
      pos.push(Math.sin(aw) * R, y0 + 0.022 * ft * l2, Math.cos(aw) * R); sw.push(v, a * 2.3);
    }
  }
  for (let i = 0; i < nv; i++) for (let j = 0; j < nu; j++) { const a = i * (nu + 1) + j, b = a + nu + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aSw', new THREE.Float32BufferAttribute(sw, 2)); g.setIndex(idx); g.computeVertexNormals();
  // 保证法线朝外
  const k = Math.floor(nv / 2) * (nu + 1) + Math.floor(nu / 2); const n = g.attributes.normal, p = g.attributes.position;
  if (n.getX(k) * p.getX(k) + n.getZ(k) * p.getZ(k) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
function buildHair(rig) {
  // 发帽：比头大一圈的椭球；前面"脸窗"里的顶点收进头里，中分沟、两侧蓬起、从发旋放射的大沟槽
  const cap = sph(50, 36); const p = cap.attributes.position; const d = new THREE.Vector3();
  const p0 = new THREE.Vector3(0, 0.78, 0.62).normalize(), e1 = new THREE.Vector3(1, 0, 0), e2 = new THREE.Vector3().crossVectors(p0, e1);
  const CC = [0, 0.772, -0.008], CR = [0.181, 0.198, 0.178];
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    const hz = Math.sqrt(Math.max(1e-4, 1 - d.y * d.y)); const xn = d.x / hz;            // 水平方向的左右比例
    const hl = 0.5 - 0.62 * Math.abs(xn);                                                // 发际线（d.y）：中分处最高，向两侧下降
    const m1 = hl - d.y, m2 = (0.84 - Math.abs(xn)) * 0.9; const m = (m1 + m2 - Math.sqrt((m1 - m2) ** 2 + 0.004)) / 2; // 平滑的 min
    const win = smooth(-0.07, 0.1, m) * smooth(0.0, 0.3, d.z);
    let r = 1 - win * 0.32;
    const top = smooth(0.25, 0.75, d.y) * smooth(-0.5, 0.3, d.z);
    r -= 0.045 * Math.exp(-((d.x / 0.055) ** 2)) * top;                                 // 中分沟
    r += 0.05 * Math.exp(-(((Math.abs(xn) - 0.3) / 0.2) ** 2)) * smooth(0.05, 0.55, d.y) * smooth(-0.1, 0.5, d.z); // 中分两侧的蓬松
    const v = d.clone().addScaledVector(p0, -d.dot(p0)); const ang = Math.atan2(v.dot(e2), v.dot(e1));
    r += 0.011 * Math.cos(ang * 13) * smooth(0.12, 0.45, v.length()) * (1 - win);      // 从中分放射下来的粗发槽
    p.setXYZ(i, CC[0] + d.x * CR[0] * r, CC[1] + d.y * CR[1] * r, CC[2] + d.z * CR[2] * r);
  }
  cap.computeVertexNormals(); rig.add('head', 'hair', cap);
  { const pts = []; for (let i = 0; i <= 40; i++) { const xn = lerp(-0.86, 0.86, i / 40); const yy = 0.5 - 0.62 * Math.abs(xn) + 0.012; const hz = Math.sqrt(1 - yy * yy); const dx = xn * hz, dz = Math.sqrt(Math.max(0, 1 - dx * dx - yy * yy)); const r = 0.9 - 0.03 * Math.exp(-((xn / 0.08) ** 2)); pts.push([CC[0] + dx * CR[0] * r, CC[1] + yy * CR[1] * r, CC[2] + dz * CR[2] * r]); }
    rig.add('head', 'hair', tubeAlong(pts, 0.006, 50, 6)); }
  // 背部发片：一整片连续的厚发片绕过两侧和后背（开口在脸前），竖向粗发槽 + S 形波浪，下缘按发束垂成圆尖、发梢外翻
  rig.add('head', 'hair', hairSkirt(1.5, 13));
  // 包脸的前发束：从发帽两侧落到肩前，S 形，发梢收细外翻
  for (const s of [-1, 1]) for (const [a, yE, hw, out, ph, amp] of [[1.45, 0.43, 0.047, 0.006, 0.3, 0.02], [1.72, 0.405, 0.05, 0.016, 1.9, 0.022]]) {
    const pts = []; const A = s * a;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14; const y0 = lerp(0.8, yE, t); const ramp = smooth(0.12, 0.5, t); const ft = smooth(0.8, 1, t) ** 2;
      let R = hairEnv(y0, A) - 0.02 * (1 - smooth(0, 0.25, t)) + out * smooth(0.1, 0.4, t) + amp * 1.1 * ramp * Math.cos(2.1 * TAU * t + ph) + 0.045 * ft;
      const lat = s * amp * ramp * Math.sin(2.1 * TAU * t + ph); const y = y0 + 0.02 * ft;
      pts.push(new THREE.Vector3(Math.sin(A) * R + Math.cos(A) * lat, y, Math.cos(A) * R - Math.sin(A) * lat));
    }
    rig.add('head', 'hair', lockTube(pts, t => hw * (0.7 + 0.3 * smooth(0, 0.3, t)) * (1 - 0.88 * smooth(0.74, 1, t)), t => 0.022 * (1 - 0.55 * smooth(0.75, 1, t)) + 0.004, ph * 1.7 + s, 26, 8));
  }
}

function buildHand(rig, j, s, open) {
  const tag = open ? 'handOpen' : 'handGrip'; const x = s * ARM_X; const wy = WR_Y;
  // 手掌：扁椭球，掌心朝身体（-s·x 方向）
  rig.add(j, 'skin', xf(sph(12, 9), [x, wy - 0.034, 0.002], [0, 0, 0], [0.019, 0.036, 0.029]), tag);
  if (open) {
    for (let k = 0; k < 4; k++) { const z = (k - 1.5) * 0.011, len = [0.02, 0.024, 0.023, 0.017][k]; rig.add(j, 'skin', xf(new THREE.CapsuleGeometry(0.0088, len, 2, 7), [x - s * 0.001, wy - 0.068 - len * 0.45, z], [(k - 1.5) * -0.05, 0, s * 0.12], [0.85, 1, 1]), tag); }
    rig.add(j, 'skin', xf(new THREE.CapsuleGeometry(0.0085, 0.02, 2, 7), [x - s * 0.006, wy - 0.045, 0.03], [0.75, 0, 0]), tag);
  } else {
    rig.add(j, 'skin', xf(new THREE.CapsuleGeometry(0.0135, 0.04, 3, 9), [x - s * 0.012, wy - 0.066, 0.0], [PI / 2, 0, 0]), tag); // 握起的四指
    rig.add(j, 'skin', xf(new THREE.CapsuleGeometry(0.0085, 0.018, 2, 7), [x - s * 0.016, wy - 0.045, 0.026], [0.5, 0, s * 0.4]), tag);
  }
}

function buildLeniaRig(M) {
  const rig = new Rig();
  rig.joint('pelvis', null, [0, HIP_Y, 0]);
  rig.joint('chest', 'pelvis', [0, HIP_Y + 0.02, 0]);
  rig.joint('head', 'chest', [0, 0.585, 0]);
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    rig.joint('sh' + L, 'chest', [s * ARM_X, SH_Y, 0]); rig.joint('el' + L, 'sh' + L, [s * ARM_X, EL_Y, 0]); rig.joint('wr' + L, 'el' + L, [s * ARM_X, WR_Y, 0]);
    rig.joint('hip' + L, 'pelvis', [s * HIP_X, HIP_Y, 0]); rig.joint('kn' + L, 'hip' + L, [s * HIP_X, KN_Y, 0]); rig.joint('an' + L, 'kn' + L, [s * HIP_X, AN_Y, 0]);
  }
  // 头：圆脸（下半略宽成婴儿肥）、耳朵、小鼻子、脸部贴片
  const skull = sph(30, 22); { const p = skull.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const ch = 1 + 0.06 * smooth(0.3, -0.5, y) * (1 - smooth(-0.6, -1, y)); p.setXYZ(i, x * ch, y, z * (z > 0 ? 0.97 : 1)); } skull.computeVertexNormals(); }
  rig.add('head', 'skin', xf(skull, HEAD.c, [0, 0, 0], HEAD.r));
  for (const s of [-1, 1]) rig.add('head', 'skin', xf(sph(10, 8), [s * 0.162, 0.728, -0.004], [0, 0, 0], [0.018, 0.028, 0.017]));
  rig.add('head', 'skin', xf(sph(10, 8), [0, 0.694, 0.133], [0, 0, 0], [0.0065, 0.0045, 0.0035]));
  rig.add('head', 'skin', xf(new THREE.CylinderGeometry(0.034, 0.036, 0.1, 14, 1, true), [0, 0.6, -0.004]));
  buildHair(rig);
  // 身体：白 T（只在开衫开口里看见）、米色粗针织开衫（前开口、罗纹门襟/下摆/袖口、木扣）
  rig.add('chest', 'tee', lathe([[0.004, 0.33], [0.095, 0.34], [0.112, 0.42], [0.117, 0.48], [0.11, 0.535], [0.085, 0.565], [0.045, 0.588], [0.035, 0.592]], { tz: 0.72, seg: 28 }));
  rig.add('chest', 'tee', xf(new THREE.TorusGeometry(0.046, 0.0065, 6, 24), [0, 0.583, 0.004], [PI / 2 - 0.12, 0, 0], [1, 0.75, 1]));
  const gap = (y) => y > 0.41 ? lerp(0.1, 0.75, smooth(0.41, 0.585, y)) : 0.075;
  const CARD = [[0.152, 0.296], [0.153, 0.32], [0.147, 0.37], [0.14, 0.43], [0.135, 0.49], [0.132, 0.525], [0.12, 0.552], [0.095, 0.572], [0.06, 0.585]], CTZ = 0.78;
  rig.add('chest', 'knit', latheOpen(CARD, gap, { tz: CTZ }));
  const cardR = (y) => { const pr = prof(CARD, 40); for (let i = 1; i < pr.length; i++) if (pr[i].y >= y) return lerp(pr[i - 1].x, pr[i].x, (y - pr[i - 1].y) / (pr[i].y - pr[i - 1].y || 1)); return 0.06; };
  // 门襟 + 领口罗纹（一条连续粗边：左襟往上 → 绕过后颈 → 右襟往下）
  const band = [];
  for (let i = 0; i <= 12; i++) { const y = lerp(0.30, 0.58, i / 12); const r = cardR(y) + 0.006, a = gap(y) + 0.02; band.push([r * Math.sin(a), y, r * Math.cos(a) * CTZ + 0.004]); }
  for (let i = 1; i < 10; i++) { const a = lerp(0.85, TAU - 0.85, i / 10); band.push([0.068 * Math.sin(a), 0.588 + 0.006 * Math.cos(a), 0.06 * Math.cos(a)]); }
  for (let i = 12; i >= 0; i--) { const y = lerp(0.30, 0.58, i / 12); const r = cardR(y) + 0.006, a = -(gap(y) + 0.02); band.push([r * Math.sin(a), y, r * Math.cos(a) * CTZ + 0.004]); }
  rig.add('chest', 'rib', xf(tubeAlong(band, 0.011, 70, 7, false, 60), [0, 0, 0], [0, 0, 0], [1, 1, 1]));
  const hem = []; for (let i = 0; i <= 30; i++) { const a = lerp(0.1, TAU - 0.1, i / 30); hem.push([0.157 * Math.sin(a), 0.302, 0.157 * Math.cos(a) * CTZ]); }
  rig.add('chest', 'rib', tubeAlong(hem, 0.016, 44, 7, false, 50));
  for (const y of [0.335, 0.385]) { const r = cardR(y) + 0.02, a = 0.09; rig.add('chest', 'button', xf(new THREE.CylinderGeometry(0.0115, 0.0115, 0.007, 14), [r * Math.sin(a) * 1.0, y, r * Math.cos(a) * CTZ], [PI / 2, 0, 0])); }
  for (const y of [0.44, 0.49]) { const a = gap(y) + 0.05, r = cardR(y) + 0.018; rig.add('chest', 'button', xf(new THREE.CylinderGeometry(0.0115, 0.0115, 0.007, 14), [r * Math.sin(a), y, r * Math.cos(a) * CTZ], [PI / 2, a, 0, 'YXZ'])); }
  // 牛仔裤：臀部 + 两条宽直筒裤腿（膝部分段）+ 卷边裤脚；白袜
  rig.add('pelvis', 'denim', lathe([[0.004, 0.335], [0.07, 0.342], [0.118, 0.37], [0.13, 0.405], [0.128, 0.45]], { tz: 0.8, seg: 28 }));
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R', x = s * HIP_X;
    rig.add('hip' + L, 'denim', lathe([[0.004, 0.43], [0.05, 0.428], [0.068, 0.405], [0.07, 0.31], [0.067, 0.22], [0.05, 0.19], [0.004, 0.183]], { x, seg: 22 }));
    rig.add('kn' + L, 'denim', xf(sph(16, 10), [x, KN_Y, 0.002], [0, 0, 0], [0.061, 0.055, 0.061]));
    rig.add('kn' + L, 'denim', lathe([[0.004, 0.248], [0.05, 0.24], [0.066, 0.215], [0.067, 0.15], [0.069, 0.08], [0.07, 0.05]], { x, seg: 22 }));
    rig.add('kn' + L, 'denim', xf(new THREE.TorusGeometry(0.07, 0.0125, 6, 18), [x, 0.052, 0], [PI / 2, 0, 0]));
    rig.add('kn' + L, 'denim', xf(new THREE.TorusGeometry(0.069, 0.011, 6, 18), [x, 0.07, 0], [PI / 2, 0, 0]));
    rig.add('an' + L, 'sock', lathe([[0.034, 0.1], [0.036, 0.05], [0.037, 0.03]], { x, seg: 14 }));
    const foot = sph(14, 8); { const p = foot.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.55) p.setY(i, -0.55 - (p.getY(i) + 0.55) * 0.15); foot.computeVertexNormals(); }
    rig.add('an' + L, 'sock', xf(foot, [x + s * 0.004, 0.0275, 0.028], [0, 0, 0], [0.043, 0.05, 0.072]));
    // 袖子：落肩的蓬袖 + 前臂 + 罗纹袖口
    rig.add('sh' + L, 'knit', lathe([[0.002, 0.592], [0.036, 0.588], [0.054, 0.57], [0.06, 0.545], [0.059, 0.5], [0.056, 0.45], [0.052, 0.415]], { x: s * ARM_X, seg: 22 }));
    rig.add('el' + L, 'knit', lathe([[0.046, 0.46], [0.055, 0.43], [0.056, 0.39], [0.052, 0.355], [0.047, 0.34]], { x: s * ARM_X, seg: 22 }));
    rig.add('el' + L, 'rib', lathe([[0.043, 0.348], [0.046, 0.335], [0.045, 0.312], [0.04, 0.304], [0.026, 0.302]], { x: s * ARM_X, seg: 20 }));
    buildHand(rig, 'wr' + L, s, true); buildHand(rig, 'wr' + L, s, false);
  }
  // 道具：书（挂在胸前）、喷壶（右手）、纸箱（胸前）
  const bk = [0, 0.455, 0.2];
  for (const s of [-1, 1]) {
    const half = (g, y) => { const q = xf(g, [s * 0.043, y, 0], [0, 0, s * 0.16]); q.applyMatrix4(new THREE.Matrix4().makeRotationX(-0.75)); q.translate(...bk); return q; };
    rig.add('chest', 'bookCover', half(new THREE.BoxGeometry(0.085, 0.005, 0.115), 0), 'book');
    rig.add('chest', 'bookPage', half(new THREE.BoxGeometry(0.078, 0.012, 0.106), 0.008), 'book');
  }
  const cx = -ARM_X - 0.005, cy = WR_Y - 0.11;
  rig.add('wrR', 'can', xf(lathe([[0.004, 0.0], [0.05, 0.002], [0.052, 0.04], [0.05, 0.075], [0.03, 0.082], [0.004, 0.084]], { seg: 22 }), [cx, cy - 0.04, 0.04]), 'can');
  rig.add('wrR', 'can', xf(tubeAlong([[cx, cy - 0.025, 0.085], [cx, cy - 0.005, 0.13], [cx, cy + 0.01, 0.165]], 0.009, 12, 8)), 'can');
  rig.add('wrR', 'canDark', xf(new THREE.CylinderGeometry(0.02, 0.01, 0.022, 14), [cx, cy + 0.016, 0.172], [1.1, 0, 0]), 'can');
  rig.add('wrR', 'canDark', xf(new THREE.TorusGeometry(0.04, 0.0065, 6, 20, PI), [cx, cy + 0.035, 0.03], [0, PI / 2, 0]), 'can');
  rig.add('chest', 'box', xf(new THREE.BoxGeometry(0.24, 0.15, 0.17), [0, 0.42, 0.205]), 'box');
  rig.add('chest', 'boxTape', xf(new THREE.BoxGeometry(0.245, 0.004, 0.04), [0, 0.497, 0.205]), 'box');
  for (const s of [-1, 1]) rig.add('chest', 'box', xf(new THREE.BoxGeometry(0.11, 0.004, 0.17), [s * 0.1, 0.51, 0.205], [0, 0, s * 0.35]), 'box');
  rig.finish(M);
  // 喷壶的水流：每帧从壶嘴连到地面（世界向下），壶嘴位置用一个标记点
  rig.spout = new THREE.Object3D(); rig.spout.position.set(cx - rig.rest.wrR[0], cy + 0.03 - rig.rest.wrR[1], 0.185 - rig.rest.wrR[2]); rig.J.wrR.add(rig.spout);
  const sg = new THREE.CylinderGeometry(0.006, 0.016, 1, 10, 1, true); sg.translate(0, -0.5, 0);
  rig.stream = new THREE.Mesh(sg, M.water); rig.stream.castShadow = false; rig.root.add(rig.stream);
  rig.J.head.scale.setScalar(HEAD_K); // Q 版大头：整颗头（含头发）放大
  return rig;
}

// 腿的两骨 IK（矢状面）：返回 [髋 rx, 膝 rx, 踝 rx]，脚保持水平
function legIK(hipY, hipZ, ankY, ankZ) {
  const dy = ankY - hipY, dz = ankZ - hipZ; const d = clamp(Math.hypot(dy, dz), 0.05, L1 + L2 - 1e-4);
  const phi = Math.atan2(dz, -dy); const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const K = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1)); const a = phi + A, b = PI - K;
  return [-a, b, a - b];
}
// 手臂两骨 IK（在胸口坐标里）：让手的握点到 target；pole 是手肘大致朝向。返回肩、肘的 Euler
const _ik = { D: new THREE.Vector3(), P: new THREE.Vector3(), U: new THREE.Vector3(), F: new THREE.Vector3(), X: new THREE.Vector3(), Z: new THREE.Vector3(), Y: new THREE.Vector3(), m: new THREE.Matrix4(), e: new THREE.Euler() };
function armIK(s, target, c, pole = [0.5, -1, -0.25]) {
  const { D, P, U, F, X, Y, Z, m, e } = _ik; const a = SH_Y - EL_Y;
  D.set(target[0] - s * ARM_X, target[1] - SH_Y, target[2]); const d = clamp(D.length(), 0.03, a + c - 1e-4); D.normalize();
  const th = Math.acos(clamp((a * a + d * d - c * c) / (2 * a * d), -1, 1)); const b = PI - Math.acos(clamp((a * a + c * c - d * d) / (2 * a * c), -1, 1));
  P.set(s * pole[0], pole[1], pole[2]).normalize(); P.addScaledVector(D, -P.dot(D)).normalize();
  U.copy(D).multiplyScalar(Math.cos(th)).addScaledVector(P, Math.sin(th)).normalize();
  F.copy(D).multiplyScalar(d).addScaledVector(U, -a).normalize();
  Y.copy(U).negate(); Z.copy(F).addScaledVector(U, -F.dot(U)).normalize(); X.crossVectors(Y, Z);
  m.makeBasis(X, Y, Z); e.setFromRotationMatrix(m, 'XYZ');
  return { sh: [e.x, e.y, e.z], el: [-b, 0, 0] };
}
const JN = ['chest', 'head', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR'];
function leniaTarget(name, t) {
  const j = Object.fromEntries(JN.map(n => [n, [0, 0, 0]])); const o = { py: HIP_Y, pz: 0, j, eyes: 'open', mouth: 'smile', hand: { L: 'open', R: 'open' }, prop: { book: 0, can: 0, box: 0 } };
  const br = Math.sin(t * 1.7);
  j.chest[0] = 0.015 * br; j.head = [0.025 * Math.sin(t * 0.5), 0.07 * Math.sin(t * 0.31), 0.035 * Math.sin(t * 0.43)];
  j.shL = [0.02 * br, 0, 0.13 + 0.01 * br]; j.shR = [0.02 * br, 0, -0.13 - 0.01 * br]; j.elL = [-0.12, 0, 0]; j.elR = [-0.12, 0, 0];
  const walk = (ph, armK = 1) => {
    const swing = 0.4; for (const [L, p] of [['L', ph], ['R', ph + PI]]) { const a = Math.sin(p) * swing; const kb = 0.06 + 0.7 * Math.max(0, Math.cos(p)) * Math.max(0, Math.sin(p) + 0.4); j['hip' + L] = [-a, 0, 0]; j['kn' + L] = [kb, 0, 0]; j['an' + L] = [a - kb * 0.6, 0, 0]; }
    o.py = HIP_Y - (L1 + L2) * (1 - Math.cos(Math.sin(ph) * swing)) + 0.01 * Math.abs(Math.cos(ph)) - 0.004;
    j.chest = [0.05, 0.08 * Math.sin(ph), 0.025 * Math.sin(ph)]; j.head = [0.0, -0.06 * Math.sin(ph), -0.02 * Math.sin(ph)];
    if (armK) { j.shL = [0.38 * Math.sin(ph), 0, 0.16]; j.shR = [-0.38 * Math.sin(ph), 0, -0.16]; j.elL = [-0.3, 0, 0]; j.elR = [-0.3, 0, 0]; }
  };
  if (name === 'walk') walk(t * 5.2);
  else if (name === 'wave') {
    o.eyes = 'happy'; o.mouth = 'open'; const w = Math.sin(t * 7.5);
    j.shR = [-0.45, 0, -0.95]; j.elR = [0, 0, -1.55 - 0.28 * w]; j.wrR = [0, -1.3, 0.08 * w]; j.head = [0.0, -0.08, -0.1 + 0.02 * br]; j.chest = [0.0, -0.05, -0.04];
  } else if (name === 'read') {
    o.py = 0.228; o.hand = { L: 'grip', R: 'grip' }; o.prop.book = 1;
    for (const L of ['L', 'R']) j['hip' + L] = 0, j['kn' + L] = 0;
    const [h, k, a] = legIK(0.228, 0, AN_Y, 0.2); j.hipL = [h, 0, 0.05]; j.hipR = [h, 0, -0.05]; j.knL = [k, 0, 0]; j.knR = [k, 0, 0]; j.anL = [a, 0, 0]; j.anR = [a, 0, 0];
    j.chest = [0.12 + 0.012 * br, 0, 0]; j.head = [0.38 + 0.02 * Math.sin(t * 0.4), 0.05 * Math.sin(t * 0.23), 0.06];
    for (const [L, s] of [['L', 1], ['R', -1]]) { const r = armIK(s, [s * 0.088, 0.455, 0.2], 0.17); j['sh' + L] = r.sh; j['el' + L] = r.el; j['wr' + L] = [0, s * 0.3, 0]; }
  } else if (name === 'water') {
    o.py = 0.2; o.pz = -0.04; o.hand = { L: 'open', R: 'grip' }; o.prop.can = 1;
    const ik = (az) => legIK(0.2, -0.04, AN_Y, az); const [h1, k1, a1] = ik(0.13), [h2, k2, a2] = ik(0.03);
    j.hipL = [h1, 0, 0.12]; j.knL = [k1, 0, 0]; j.anL = [a1, 0, -0.12]; j.hipR = [h2, 0, -0.22]; j.knR = [k2, 0, 0]; j.anR = [a2, 0, 0.22];
    j.chest = [0.32 + 0.01 * br, -0.12, 0]; j.head = [0.22, -0.05, 0.05];
    j.shR = [-1.2 + 0.05 * Math.sin(t * 1.3), 0, -0.12]; j.elR = [-0.3, 0, 0]; j.wrR = [1.55 + 0.08 * Math.sin(t * 1.3), 0, 0];
    j.shL = [-0.55, 0, 0.32]; j.elL = [-0.95, 0, 0];
  } else if (name === 'carry') {
    walk(t * 4.6, 0); o.hand = { L: 'open', R: 'open' }; o.prop.box = 1;
    j.chest[0] = -0.04; j.head = [-0.06, 0.04 * Math.sin(t * 2.3), 0];
    for (const [L, s] of [['L', 1], ['R', -1]]) { const r = armIK(s, [s * 0.14, 0.4, 0.2], 0.145, [0.9, -0.6, -0.2]); j['sh' + L] = r.sh; j['el' + L] = r.el; j['wr' + L] = [0, 0, 0]; }
  }
  return o;
}

export function createLenia() {
  const M = leniaMaterials(); const rig = buildLeniaRig(M);
  const group = new THREE.Group(); group.name = 'Lenia'; rig.root.scale.setScalar(LENIA_H); group.add(rig.root);
  // 脸：一块贴在头前面的球面贴片（与头同形，稍大一点）
  const S = 512; const cv = document.createElement('canvas'); cv.width = cv.height = S; const fctx = cv.getContext('2d');
  const ftex = new THREE.CanvasTexture(cv); ftex.colorSpace = THREE.SRGBColorSpace; ftex.anisotropy = 8;
  const fmat = new THREE.MeshStandardMaterial({ map: ftex, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const fg = new THREE.SphereGeometry(1, 26, 20, PI / 2 - FACE.W / 2, FACE.W, FACE.t0, FACE.t1 - FACE.t0);
  { const p = fg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const ch = 1 + 0.06 * smooth(0.3, -0.5, y) * (1 - smooth(-0.6, -1, y)); p.setXYZ(i, x * ch, y, z * (z > 0 ? 0.97 : 1)); } }
  fg.scale(HEAD.r[0] * 1.004, HEAD.r[1] * 1.004, HEAD.r[2] * 1.004); fg.translate(HEAD.c[0], HEAD.c[1] - 0.585, HEAD.c[2]); fg.computeVertexNormals();
  const face = new THREE.Mesh(fg, fmat); face.renderOrder = 2; rig.J.head.add(face);
  let exKey = ''; const setFace = (ex) => { const k = ex.eyes + ex.mouth; if (k === exKey) return; exKey = k; drawFace(fctx, S, ex); ftex.needsUpdate = true; };
  // 当前姿态（平滑逼近目标）
  const cur = { py: HIP_Y, pz: 0, j: Object.fromEntries(JN.map(n => [n, [0, 0, 0]])), prop: { book: 0, can: 0, box: 0 }, hand: { L: 1, R: 1 } };
  const L = { pose: 'idle', blink: 2.5, t: 0, first: true, tris: 0 };
  const apply = () => {
    rig.J.pelvis.position.set(0, cur.py, cur.pz);
    for (const n of JN) { const r = cur.j[n]; rig.J[n].rotation.set(r[0], r[1], r[2]); }
    for (const k of ['book', 'can', 'box']) for (const m of rig.tagged[k]) { m.visible = cur.prop[k] > 0.02; }
    rig.stream.visible = cur.prop.can > 0.9;
    if (rig.stream.visible) { rig.root.updateMatrixWorld(true); rig.spout.getWorldPosition(_sp); rig.root.worldToLocal(_sp); rig.stream.position.copy(_sp); rig.stream.scale.set(1, Math.max(0.01, _sp.y), 1); rig.stream.rotation.set(0.12, 0, 0); }
    for (const s of ['L', 'R']) { const open = cur.hand[s] > 0.5; for (const m of rig.tagged.handOpen) if (m.parent === rig.J['wr' + s]) m.visible = open; for (const m of rig.tagged.handGrip) if (m.parent === rig.J['wr' + s]) m.visible = !open; }
  };
  const api = {
    group, rig, materials: M, height: LENIA_H,
    get pose() { return L.pose; },
    setPose(name, instant = false) { if (!LENIA_POSES.includes(name)) throw new Error('未知姿势 ' + name); L.pose = name; if (instant) L.first = true; },
    update(dt, t = L.t + dt) {
      L.t = t; HAIR_SWAY.uSwayT.value = t;
      const tg = leniaTarget(L.pose, t); const k = L.first ? 1 : 1 - Math.exp(-dt * 7);
      cur.py = lerp(cur.py, tg.py, k); cur.pz = lerp(cur.pz, tg.pz, k);
      for (const n of JN) for (let i = 0; i < 3; i++) cur.j[n][i] = lerp(cur.j[n][i], tg.j[n][i], k);
      for (const p of ['book', 'can', 'box']) cur.prop[p] = lerp(cur.prop[p], tg.prop[p], L.first ? 1 : 1 - Math.exp(-dt * 10));
      for (const s of ['L', 'R']) cur.hand[s] = lerp(cur.hand[s], tg.hand[s] === 'open' ? 1 : 0, L.first ? 1 : 1 - Math.exp(-dt * 10));
      L.first = false;
      // 眨眼（笑眯眼时不眨）
      L.blink -= dt; if (L.blink < -0.13) L.blink = 2 + Math.random() * 3.5;
      setFace({ eyes: tg.eyes === 'open' && L.blink < 0 ? 'blink' : tg.eyes, mouth: tg.mouth });
      apply();
    },
  };
  api.update(0, 0); L.tris = triCount(group); api.tris = L.tris;
  return api;
}

// 坐凳（看书姿势用；造型同一比例，返回世界尺度）
export function createStool() {
  const M = leniaMaterials(); const g = new THREE.Group(); const k = LENIA_H;
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * k, 0.1 * k, 0.025 * k, 28), M.wood); seat.position.y = 0.152 * k; g.add(seat);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.3; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.011 * k, 0.013 * k, 0.15 * k, 10), M.wood); leg.position.set(Math.sin(a) * 0.065 * k, 0.07 * k, Math.cos(a) * 0.065 * k); leg.rotation.set(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12); g.add(leg); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); return g;
}

// ---------------------------------------------------------------- 鸡块
export function createNugget() {
  const M = leniaMaterials();
  // 软团子：顶点偏向左上、底部宽而平
  const g = sph(32, 22); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = (y + 1) / 2; const wk = 1 + 0.16 * (1 - h) - 0.12 * h * h;
    if (y < -0.5) y = -0.5 + (y + 0.5) * 0.18;
    x = x * 0.78 * wk - 0.24 * h * h * (1 - 0.3 * Math.abs(x)) ; z = z * 0.6 * wk;
    p.setXYZ(i, x, y * 0.74, z);
  }
  g.computeVertexNormals(); g.computeBoundingBox();
  { const b = g.boundingBox; const H = b.max.y - b.min.y; g.translate(-(b.max.x + b.min.x) / 2, -b.min.y, 0); g.scale(1 / H, 1 / H, 1 / H); }
  g.computeBoundingBox();
  const group = new THREE.Group(); group.name = 'Nugget';
  const root = new THREE.Group(); root.scale.setScalar(NUGGET_H); group.add(root);
  const body = new THREE.Group(); root.add(body);
  const bm = new THREE.Mesh(g, M.nugget); bm.castShadow = bm.receiveShadow = true; body.add(bm);
  // 脸：射线找表面，贴两颗深棕椭圆眼 + 小微笑
  const rc = new THREE.Raycaster(); const tmp = new THREE.Mesh(g, M.nugget); tmp.updateMatrixWorld();
  const surf = (x, y) => { rc.set(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1)); const h = rc.intersectObject(tmp)[0]; return h ? { p: h.point, n: h.face.normal.clone() } : { p: new THREE.Vector3(x, y, 0.4), n: new THREE.Vector3(0, 0, 1) }; };
  const q = new THREE.Quaternion(); const eyes = [];
  for (const s of [-1, 1]) {
    const S = surf(s * 0.24, 0.6); const e = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), M.nuggetFace);
    e.position.copy(S.p).addScaledVector(S.n, -0.006); q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), S.n); e.quaternion.copy(q); e.scale.set(0.05, 0.075, 0.025); body.add(e); eyes.push(e);
  }
  const ms = surf(0, 0.5); const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 6, 16, PI * 0.8), M.nuggetFace);
  mouth.position.copy(ms.p).addScaledVector(ms.n, -0.002); mouth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ms.n); mouth.rotateZ(PI + PI * 0.1); mouth.scale.set(1, 0.7, 1); body.add(mouth);
  for (const a of [0, PI * 0.8]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), M.nuggetFace); cap.position.set(Math.cos(a) * 0.055, Math.sin(a) * 0.055, 0); mouth.add(cap); } // 嘴角圆头
  // 小圆手（捧东西时才出现）+ 一颗种子
  const hands = new THREE.Group(); body.add(hands);
  for (const s of [-1, 1]) { const S = surf(s * 0.16, 0.26); const hm = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), M.nugget); hm.position.copy(S.p).add(new THREE.Vector3(0, 0, 0.03)); hm.scale.set(1, 0.85, 0.9); hm.castShadow = true; hands.add(hm); }
  const seed = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), M.seed); const S0 = surf(0, 0.3); seed.position.copy(S0.p).add(new THREE.Vector3(0, 0.03, 0.07)); seed.scale.set(0.8, 1.1, 0.8); seed.castShadow = true; hands.add(seed);
  const cur = { y: 0, sy: 1, sx: 1, rz: 0, rx: 0, hand: 0, eye: 1 }; const N = { pose: 'idle', blink: 3, first: true };
  const api = {
    group, height: NUGGET_H, get pose() { return N.pose; },
    setPose(name, instant = false) { if (!NUGGET_POSES.includes(name)) throw new Error('未知姿势 ' + name); N.pose = name; if (instant) N.first = true; },
    update(dt, t) {
      const tg = { y: 0, sy: 1, sx: 1, rz: 0, rx: 0, hand: 0, eye: 1 };
      if (N.pose === 'idle') { const b = Math.sin(t * 2.6); tg.sy = 1 + 0.035 * b; tg.sx = 1 - 0.02 * b; tg.y = 0.01 * Math.max(0, Math.sin(t * 1.3 - 1)) ** 8; }
      else if (N.pose === 'hop') { const ph = (t * 1.6) % 1; const air = ph < 0.62 ? Math.sin(ph / 0.62 * PI) : 0; const land = ph >= 0.62 ? Math.sin((ph - 0.62) / 0.38 * PI) : 0; tg.y = air * 0.55; tg.sy = 1 + 0.12 * air - 0.2 * land; tg.sx = 1 - 0.06 * air + 0.12 * land; tg.rx = -0.12 * air; }
      else if (N.pose === 'hold') { tg.hand = 1; tg.rx = -0.12; tg.sy = 1 + 0.02 * Math.sin(t * 3); }
      else if (N.pose === 'lean') { tg.rz = 0.28; tg.sy = 0.93; tg.sx = 1.04; tg.eye = 0.15 + 0.85 * (Math.sin(t * 0.4) > 0.6 ? 1 : 0); }
      N.blink -= dt; if (N.blink < -0.12) N.blink = 2 + Math.random() * 3;
      const k = N.first ? 1 : 1 - Math.exp(-dt * (N.pose === 'hop' ? 30 : 8)); N.first = false;
      for (const key of Object.keys(cur)) cur[key] = lerp(cur[key], tg[key], k);
      body.position.y = cur.y; body.scale.set(cur.sx, cur.sy, cur.sx); body.rotation.set(cur.rx, 0, cur.rz);
      hands.visible = cur.hand > 0.05; hands.scale.setScalar(Math.max(cur.hand, 0.001));
      const ey = (N.blink < 0 ? 0.12 : 1) * cur.eye; for (const e of eyes) e.scale.y = 0.075 * Math.max(ey, 0.1);
    },
  };
  api.update(0, 0); api.tris = triCount(group);
  return api;
}

// 便捷：setPose(模型, 姿势名)
export function setPose(model, name, instant = false) { model.setPose(name, instant); }
