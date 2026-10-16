// 造型库·小人世界的植物：蒲公英、三叶草丛、狗尾草丛（1 世界单位 = 2.2 厘米，真实尺寸登记在 shared/scale.js 的 ENV_CM）
// 取代原来的“树”：对 3.5 厘米的小动物来说，25 厘米的蒲公英就是一棵高大的“树”。
// 季节全靠材质：茎叶 / 草穗 用 fol 材质（春嫩绿、夏深绿、秋黄橙、冬枯褐，由 main.js 统一调色）；
//   黄花 = SEASONAL.bloom（只在春天开）；白色绒球 = SEASONAL.puff（夏天结球、秋天被风吹散、冬天只剩光秆）；
//   三叶草的白花 = SEASONAL.cl（春夏开）。
import * as THREE from 'three';
import { LOW, PI, TAU, R, RI, reseed, M, G, add, mergeStatic, taperTube, mergeList } from './core.js';

const segs = (n) => (LOW ? Math.max(3, Math.round(n * 0.6)) : n);
// 材质（共用，季节由 main.js 改 uniform / 透明度）
const matLeaf = () => M('#2ea62b', { r: 0.8, ds: true, fol: 1, rim: 0.2 });
const matStem = () => M('#4a9c30', { r: 0.8, fol: 1, rim: 0.25 });
const matYellow = () => M('#ffd22e', { r: 0.55, bloom: 1 });
const matYellow2 = () => M('#ffbf1f', { r: 0.6, bloom: 1 });
const matPuff = () => M('#fbfaf3', { r: 0.95, puff: 1 });
const matClvW = () => M('#fffaf0', { r: 0.7, cl: 1 });
const matGrassBlade = () => M('#3f9f2c', { r: 0.75, ds: true, fol: 1, rim: 0.25 });
const matSeedHead = () => M('#b9c46a', { r: 0.9, fol: 1 });

// 一片带锯齿的蒲公英叶：沿 +x 躺着，先抬起再下垂，宽度两头窄中间宽，边缘一齿一齿
function leafGeo(len, wid) {
  return G(`dleaf${len},${wid}`, () => {
    const N = 9; const pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N; const w = wid * (0.28 + 0.72 * Math.pow(Math.sin(Math.min(1, t * 1.05 + 0.04) * PI), 0.7)) * (i % 2 ? 1 : 0.62) * (i === N ? 0.1 : 1);
      const x = t * len, y = len * 0.2 * Math.sin(t * 2.5) - len * 0.04 * t;
      pos.push(x, y, -w, x, y, w);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  });
}
// 一片细长的草叶（狗尾草的叶）：沿 +y 立着，向外弯，尖尖的
function bladeGeo(h, w, bend) {
  return G(`blade${h},${w},${bend}`, () => {
    const N = 7; const pos = [], idx = [];
    for (let i = 0; i <= N; i++) { const t = i / N; const ww = w * (1 - Math.pow(t, 1.4)) + 0.01; pos.push(-ww, t * h, bend * t * t * h, ww, t * h, bend * t * t * h); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  });
}
const fib = (i, n) => { const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996; return [Math.cos(a) * r, y, Math.sin(a) * r]; };

// ---- 蒲公英的“头”：黄花（春）、白绒球（夏秋）、光秃的花托（一年四季）；以花托中心为原点，朝 +y
function dandelionHead(g, s = 1, low = false) {
  const my = matYellow(), my2 = matYellow2(), mp = matPuff(), ms = matStem();
  // 黄花：两圈细长花瓣向外向上翻，中间一团鼓鼓的花心
  const petal = G('dpetal', () => new THREE.SphereGeometry(0.5, 5, 4).scale(0.34, 0.95, 0.1).translate(0, 0.46, 0));
  const n1 = low ? 12 : segs(26), n2 = low ? 8 : segs(18);
  for (let i = 0; i < n1; i++) { const a = i / n1 * TAU; add(g, petal, my, 0, 0, 0, 0, -a, 1.25 + (i % 2) * 0.1, s, s, s); }
  for (let i = 0; i < n2; i++) { const a = (i + 0.5) / n2 * TAU; add(g, petal, my2, 0, 0.1 * s, 0, 0, -a, 0.85, s * 0.8, s * 0.75, s * 0.8); }
  add(g, G('dcore', () => new THREE.SphereGeometry(0.34, 8, 5)), my2, 0, 0.12 * s, 0, 0, 0, 0, s, 0.55 * s, s);
  // 花托下面一圈绿色小苞片（四季都在）
  const bract = G('dbract', () => new THREE.ConeGeometry(0.1, 0.5, 4).translate(0, 0.25, 0));
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; add(g, bract, ms, 0, -0.18 * s, 0, 0, -a, 2.5, s, s, s); }
  add(g, G('dreceptacle', () => new THREE.SphereGeometry(0.2, 8, 6)), ms, 0, 0.04 * s, 0, 0, 0, 0, s, 0.8 * s, s);
  // 白绒球：中间一个小实心球 + 一圈圈放射状的细绒毛，毛尖一点白（夏天结球，秋天吹散）
  const N = low ? 26 : segs(60); const spoke = G('dspoke', () => new THREE.CylinderGeometry(0.012, 0.016, 1, 3).translate(0, 0.5, 0));
  const tip = G('dtip', () => new THREE.SphereGeometry(0.15, 4, 3));
  add(g, G('dpuffcore', () => new THREE.SphereGeometry(0.75, 8, 6)), mp, 0, 0.2 * s, 0, 0, 0, 0, s, s, s);
  for (let i = 0; i < N; i++) {
    const d = fib(i, N); const len = 1.25 * s; const up = Math.acos(Math.max(-1, Math.min(1, d[1]))); const yaw = Math.atan2(d[0], d[2]);
    const m = add(g, spoke, mp, 0, 0.2 * s, 0, 0, 0, 0, 1, len, 1); m.rotation.order = 'YXZ'; m.rotation.set(up, yaw, 0);
    // 毛尖
    if (!low) add(g, tip, mp, d[0] * (len + 0.04 * s), 0.2 * s + d[1] * (len + 0.04 * s), d[2] * (len + 0.04 * s), 0, 0, 0, s, s, s);
  }
}

// ---- 一整株蒲公英：贴地一圈锯齿叶 + 1～3 根细花葶（各顶着一个头）。h = 主花葶高度（世界单位）
export function dandelionPlant(parent, x, y, z, h = 11, o = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = o.yaw ?? R(0, TAU); parent.add(g);
  const ml = matLeaf(), ms = matStem();
  const nl = o.low ? 6 : segs(o.leaves ?? 8); const L = h * 0.42;
  for (let i = 0; i < nl; i++) { const a = i / nl * TAU + R(-0.15, 0.15); const len = L * R(0.75, 1.1); add(g, leafGeo(+len.toFixed(2), +(len * 0.2).toFixed(2)), ml, 0, 0.12, 0, 0, a, 0.12 + R(0, 0.12)); }
  const nst = o.stalks ?? RI(1, 3);
  for (let k = 0; k < nst; k++) {
    const hh = h * (k ? R(0.55, 0.85) : 1); const a = R(0, TAU), lean = (k ? R(1.2, 2.6) : R(0.3, 1.0)); const dx = Math.cos(a) * lean, dz = Math.sin(a) * lean;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(dx * 0.25, hh * 0.45, dz * 0.25), new THREE.Vector3(dx * 0.8, hh * 0.85, dz * 0.8), new THREE.Vector3(dx, hh, dz)]);
    add(g, taperTube(c, o.low ? 5 : segs(10), 0.085, 0.05, o.low ? 4 : segs(6)), ms);
    const head = new THREE.Group(); head.position.set(dx, hh, dz); head.rotation.set(R(-0.25, 0.25), R(0, TAU), R(-0.25, 0.25)); g.add(head);
    dandelionHead(head, (k ? 0.8 : 1) * (o.low ? 1.3 : 1.75), !!o.low);
  }
  mergeStatic(g); return g;
}

// ---- 三叶草丛：几根细叶柄，每根顶着三片心形小叶（带一道浅色 V 纹），有的顶上还开一朵白色小圆花
const heartGeo = () => G('clvheart', () => {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(0.35, 0.05, 0.9, 0.3, 0.9, 0.75); s.bezierCurveTo(0.9, 1.1, 0.45, 1.15, 0.0, 0.85); s.bezierCurveTo(-0.45, 1.15, -0.9, 1.1, -0.9, 0.75); s.bezierCurveTo(-0.9, 0.3, -0.35, 0.05, 0, 0);
  const g = new THREE.ShapeGeometry(s, 5); g.rotateX(-PI / 2); return g; // 躺平，尖朝 +z... 绕 y 转
});
export function cloverClump(parent, x, y, z, h = 4.5, o = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = o.yaw ?? R(0, TAU); parent.add(g);
  const ml = M('#2c9230', { r: 0.7, ds: true, fol: 1, rim: 0.25 }), ml2 = M('#3aa636', { r: 0.7, ds: true, fol: 1, rim: 0.25 }), ms = matStem(), mw = matClvW();
  const n = o.n ?? RI(12, 17); const sc = h / 4.5;
  for (let i = 0; i < n; i++) {
    const a = R(0, TAU), rr = R(0.2, 2.4) * sc; const px = Math.cos(a) * rr, pz = Math.sin(a) * rr; const hh = h * R(0.55, 1.0);
    const lean = R(-0.5, 0.5) * sc;
    add(g, taperTube(new THREE.CatmullRomCurve3([new THREE.Vector3(px, 0, pz), new THREE.Vector3(px + lean * 0.4, hh * 0.5, pz), new THREE.Vector3(px + lean, hh, pz + lean * 0.4)]), 5, 0.085 * sc, 0.06 * sc, 4), ms);
    const flower = rng01() < (o.flower ?? 0.34);
    if (flower) { const hx = px + lean, hz = pz + lean * 0.4; const base = hh * 1.12; add(g, new THREE.SphereGeometry(0.62 * sc, 8, 6), mw, hx, base + 0.4 * sc, hz, 0, 0, 0, 1, 0.9, 1); for (let k = 0; k < 8; k++) { const b = k / 8 * TAU; add(g, G('clvfl', () => new THREE.SphereGeometry(0.2, 4, 3)), mw, hx + Math.cos(b) * 0.55 * sc, base + 0.5 * sc + (k % 2) * 0.2 * sc, hz + Math.sin(b) * 0.55 * sc, 0, 0, 0, sc, sc, sc); } }
    else for (let k = 0; k < 3; k++) { const b = k / 3 * TAU + a; const lx = px + lean, lz = pz + lean * 0.4; add(g, heartGeo(), (k + i) % 2 ? ml : ml2, lx, hh + 0.02, lz, -0.25, b, 0, 0.78 * sc, 0.78 * sc, 0.78 * sc); }
  }
  mergeStatic(g); return g;
}
const rng01 = () => R(0, 1);

// ---- 狗尾草丛：几根细长微弯的茎，几片窄叶，顶上一根毛茸茸的圆柱穗（春夏青绿、秋天金黄、冬天枯褐）。h = 最高一根的高度
export function foxtailClump(parent, x, y, z, h = 12, o = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = o.yaw ?? R(0, TAU); parent.add(g);
  const mb = matGrassBlade(), ms = matStem(), mh = matSeedHead();
  const n = o.n ?? RI(3, 5); const sc = h / 12;
  for (let i = 0; i < n; i++) {
    const a = R(0, TAU), rr = R(0.1, 1.2) * sc; const px = Math.cos(a) * rr, pz = Math.sin(a) * rr; const hh = h * (i ? R(0.6, 0.92) : 1); const la = R(0, TAU), lean = R(0.8, 2.2) * sc;
    const dx = Math.cos(la) * lean, dz = Math.sin(la) * lean;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(px, 0, pz), new THREE.Vector3(px + dx * 0.15, hh * 0.5, pz + dz * 0.15), new THREE.Vector3(px + dx * 0.55, hh * 0.9, pz + dz * 0.55), new THREE.Vector3(px + dx, hh, pz + dz)]);
    add(g, taperTube(c, segs(9), 0.11 * sc, 0.06 * sc, segs(5)), ms);
    // 穗：圆柱 + 一圈圈小刺毛
    const ex = px + dx, ez = pz + dz; const L = 3.0 * sc; const head = new THREE.Group(); head.position.set(ex, hh, ez); head.rotation.set(Math.sin(la) * 0.35, 0, -Math.cos(la) * 0.35); g.add(head);
    add(head, new THREE.CapsuleGeometry(0.5 * sc, L, 3, 8), mh, 0, L * 0.5, 0);
    const bris = G('foxbristle', () => new THREE.ConeGeometry(0.035, 0.7, 3).translate(0, 0.35, 0));
    const nb = segs(30); for (let k = 0; k < nb; k++) { const b = k * 2.39996, t = (k + 0.5) / nb; const m = add(head, bris, mh, Math.cos(b) * 0.3 * sc, 0.1 * sc + t * L, Math.sin(b) * 0.3 * sc, 0, 0, 0, sc, sc, sc); m.rotation.set(Math.sin(b) * 1.1, 0, -Math.cos(b) * 1.1); }
    // 叶：茎上贴着两片窄长的叶，向外弯
    for (let k = 0; k < 2; k++) { const lh = hh * R(0.35, 0.55); const t = R(0.1, 0.4); add(g, bladeGeo(+(hh * R(0.55, 0.8)).toFixed(1), +(0.32 * sc).toFixed(2), 0.5), mb, px + dx * t * 0.3, 0.1, pz + dz * t * 0.3, 0, R(0, TAU), 0); }
  }
  mergeStatic(g); return g;
}

// ---- 量尺寸用：在一个临时场景里各造一株，返回 { L, H }（世界单位，水平最长边 / 高）——tools/scalecheck.mjs 用
export const ENV_PROBES = ['dandelion', 'clover', 'foxtail'];
export function envProbe(k) {
  const s = new THREE.Group(); const b = new THREE.Box3();
  const old = reseed(7); // 固定随机，量得稳定
  try { if (k === 'dandelion') dandelionPlant(s, 0, 0, 0, 11, { stalks: 1 }); else if (k === 'clover') cloverClump(s, 0, 0, 0, 4.5, { n: 7 }); else foxtailClump(s, 0, 0, 0, 12, { n: 4 }); } finally { reseed(old); }
  s.updateMatrixWorld(true); b.setFromObject(s); const z = b.getSize(new THREE.Vector3());
  return { L: Math.max(z.x, z.z), H: b.max.y };
}

// ---- 地上撒的蒲公英小苗（批量绘制用）：返回三块几何体 { body 茎叶, bloom 黄花, puff 绒球 }，原点在株脚，高约 h
export function dandelionInstGeos(h = 7) {
  const holder = new THREE.Group(); const old = reseed(11);
  try { dandelionPlant(holder, 0, 0, 0, h, { stalks: 1, leaves: 6, low: true, yaw: 0 }); } finally { reseed(old); }
  holder.updateMatrixWorld(true); const out = { body: [], bloom: [], puff: [] }; const my = matYellow(), my2 = matYellow2(), mp = matPuff();
  holder.traverse(o => { if (!o.isMesh) return; const g = o.geometry.clone().applyMatrix4(o.matrixWorld); (o.material === my || o.material === my2 ? out.bloom : o.material === mp ? out.puff : out.body).push(g); });
  return { body: mergeList(out.body), bloom: mergeList(out.bloom), puff: mergeList(out.puff) };
}
export const dandelionMats = () => ({ body: matLeaf(), bloom: matYellow(), puff: matPuff() });
