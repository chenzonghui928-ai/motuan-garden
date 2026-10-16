// 场景/渲染·进屋（玩具屋式）：点房子 → 镜头推近 → 屋顶/上半截像盖子一样抬起并略向后倾，露出程序化的室内。
// 做法：进屋时把这栋房子（town 的模板房子或 props 的旧物建筑）换成“剖面模型”——同一套零件按“盖子 / 屋体 / 前墙”切成几份，
//   切口用着色器精确裁掉（蛋壳是锯齿裂口），切开的边沿补一圈有厚度的“壳沿”，屋体内壁换成内墙颜色（木板/奶白），不露空心；
//   高的靴子屋另外把朝镜头的前墙沉到地下，露出两层。
// 室内全部是人类小物件改造的家具（顶针凳、纽扣桌、瓶盖碗、线轴边桌、火柴盒床 + 茶包被子、邮票画、玻璃罐、软木塞、铅笔头柴火、花盆、编织地毯），
//   按用途配不同房间；家具合并成 3 个网格（哑光 / 金属 / 发光），只在进屋时构建，离开时释放。
// 屋里的居民按模拟真实摆放：在家吃饭的围坐桌边、睡觉的躺在床上、店主站柜台、客人坐小桌；刚进门的从门口走进来。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rimU, wxShader, lampShader, LAMPU, ctex, PI, TAU, clamp, lerp, smooth, ENV, LOW } from '../lib/core.js';
import { KIND_SCALE } from '../lib/houses.js';
import { makeAnimState } from '../lib/characters.js';

const ISC = 0.8;            // 屋里的居民缩小一点（玩具屋比例）
const OPEN_T = 0.75;        // 盖子抬起用时（秒）
const _M = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _V = new THREE.Vector3(), _S = new THREE.Vector3(), _C = new THREE.Color(), _N = new THREE.Matrix3();
const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _D = new THREE.Vector3(), _U = new THREE.Vector3(), _W = new THREE.Vector3();

// ---------------------------------------------------------------- 每种造型怎么切（数值是造型库里未缩放的单位，用时乘 KIND_SCALE）
// cut 盖子切口高度（中心处），slope 前低后高（让镜头看得到地板），zig/teeth 蛋壳裂口锯齿，rLid 只有这个半径以内的才算盖子（壶嘴、把手留在屋体上），
// floor 地板高度，panel 前墙（z > pz、y > py、z < pzMax 的部分）进屋时沉下去，loft 二楼楼板高度，c 地板中心，inner 内墙色，rim 壳沿色，plank 内墙画木板缝
const CUTK = {
  egg: { cut: 4.5, slope: 0.32, zig: 0.34, teeth: 9, rLid: 4.3, floor: 1.0, inner: '#f3e2c2', rim: '#fbf1dc', plank: 0 },
  tea: { cut: 3.55, slope: 0.16, rLid: 4.62, floor: 0.45, inner: '#d4a26a', rim: '#f5ecd6', plank: 1 },
  fish: { cut: 2.55, slope: 0.08, rLid: 6.2, floor: 0.5, inner: '#cdd5de', rim: '#e9eef3', plank: 0, byNormal: 1 },
  boot: { cut: 9.3, slope: 0, rLid: 9, panel: { pz: 1.15, py: 1.1, pzMax: 3.05 }, floor: 1.05, loft: 5.4, c: [-0.9, 0], cL: [1.8, 0], inner: '#d1a46e', rim: '#7d4524', plank: 1 },
  rboot: { cut: 9.6, slope: 0, rLid: 9, panel: { pz: 1.0, py: 1.2, pzMax: 3.2 }, floor: 1.15, loft: 5.6, c: [-0.9, 0], cL: [1.6, 0], inner: '#d1a46e', rim: '#b52a20', plank: 1 },
  cup: { lift: 0.8, back: 1.6, cut: 2.15, slope: 0, rLid: 6.5, floor: 0.45, inner: '#fbf6ec', rim: '#ffffff', plank: 0 }, // 茶杯：从把手下面切，奶泡顶 + 上半个杯身 + 把手一起抬起
  honey: { cut: 3.5, slope: 0.14, rLid: 3.7, floor: 0.38, inner: '#dcae66', rim: '#f6c66a', plank: 1 },
  mush: { lift: 1.5, back: 2.2, cut: 2.25, slope: 0.3, rLid: 3.6, floor: 0.12, inner: '#efe2c8', rim: '#f6ead2', plank: 0 },
  leaf: { lift: 1.3, back: 1.8, cut: 0.62, slope: 0, rLid: 3.4, floor: 0.27, inner: '#7cb562', rim: '#4a9e3c', plank: 0 },
  pine: { back: 1.5, cut: 2.55, slope: 0.1, rLid: 2.7, floor: 0.12, inner: '#b07e50', rim: '#7a4a2a', plank: 1 },
};

// ---------------------------------------------------------------- 室内用贴图：一张 4×2 的图集（白 / 顶针麻点 / 郁金香邮票 / 雏菊邮票 / 茶包拼布 / 编织地毯 / 书脊 / 火柴盒标签）+ 地板
let ATL = null, FLOOR_TX = null;
const CELLK = { white: 0, dimple: 1, stampT: 2, stampD: 3, quilt: 4, rug: 5, books: 6, label: 7 };
function atlas() {
  if (ATL) return ATL;
  ATL = ctex(1024, 512, (g) => {
    const cell = (i, fn) => { g.save(); g.translate((i % 4) * 256, Math.floor(i / 4) * 256); g.beginPath(); g.rect(0, 0, 256, 256); g.clip(); fn(); g.restore(); };
    cell(0, () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); });
    cell(1, () => { const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, '#b9c0c8'); gr.addColorStop(0.35, '#eef1f4'); gr.addColorStop(0.6, '#d5dae0'); gr.addColorStop(1, '#aeb6bf'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 12; r++) for (let c = 0; c < 13; c++) { const x = c * 20 + (r % 2) * 10 + 4, y = r * 18 + 34; if (y > 236) continue; g.fillStyle = 'rgba(70,78,90,.55)'; g.beginPath(); g.arc(x, y, 4.6, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(x + 1.4, y + 1.4, 1.6, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(80,88,100,.35)'; g.fillRect(0, 0, 256, 16); g.fillRect(0, 240, 256, 16); });
    const stamp = (bg, art) => { g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#fffaf0'; g.fillRect(14, 14, 228, 228); g.fillStyle = '#e9dcc0'; for (let k = 0; k <= 12; k++) { const t = 14 + k * 19; for (const [x, y] of [[t, 14], [t, 242], [14, t], [242, t]]) { g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); } }
      g.fillStyle = bg; g.fillRect(34, 34, 188, 188); g.strokeStyle = 'rgba(120,80,40,.35)'; g.lineWidth = 3; g.strokeRect(34, 34, 188, 188); art(); };
    cell(2, () => stamp('#f6dccd', () => { g.strokeStyle = '#4f8f3e'; g.lineWidth = 8; g.beginPath(); g.moveTo(128, 200); g.quadraticCurveTo(122, 150, 128, 112); g.stroke(); g.fillStyle = '#5fa14c';
      g.beginPath(); g.ellipse(102, 168, 30, 11, -0.7, 0, TAU); g.fill(); g.beginPath(); g.ellipse(152, 160, 30, 11, 0.7, 0, TAU); g.fill();
      g.fillStyle = '#d9473b'; g.beginPath(); g.moveTo(98, 78); g.lineTo(112, 96); g.lineTo(128, 74); g.lineTo(144, 96); g.lineTo(158, 78); g.quadraticCurveTo(162, 124, 128, 124); g.quadraticCurveTo(94, 124, 98, 78); g.fill(); }));
    cell(3, () => stamp('#cfe4ee', () => { g.strokeStyle = '#4f8f3e'; g.lineWidth = 7; g.beginPath(); g.moveTo(128, 205); g.lineTo(128, 128); g.stroke(); g.fillStyle = '#5fa14c'; g.beginPath(); g.ellipse(150, 175, 26, 10, 0.6, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; g.beginPath(); g.ellipse(128 + Math.cos(a) * 30, 104 + Math.sin(a) * 30, 18, 8, a, 0, TAU); g.fill(); } g.fillStyle = '#f2b632'; g.beginPath(); g.arc(128, 104, 15, 0, TAU); g.fill(); }));
    cell(4, () => { const cols = ['#a9cf9b', '#f4c9c2', '#f6ecd6', '#cfe0b4']; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = cols[(r * 3 + c) % 4]; g.fillRect(c * 64, r * 64, 64, 64);
        g.fillStyle = 'rgba(80,120,60,.45)'; g.beginPath(); g.ellipse(c * 64 + 32, r * 64 + 32, 14, 6, 0.7, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(120,90,60,.55)'; g.lineWidth = 2; g.setLineDash([6, 5]); for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, k * 64); g.lineTo(256, k * 64); g.stroke(); } g.setLineDash([]); });
    cell(5, () => { g.fillStyle = '#efe1c0'; g.fillRect(0, 0, 256, 256); const cols = ['#6f9e58', '#efe1c0', '#c96f43', '#e9c46a', '#6f9e58', '#f3e6c8', '#8fb86a', '#d98a52'];
      for (let k = 0; k < 8; k++) { const r = 124 - k * 15; g.strokeStyle = cols[k]; g.lineWidth = 14; g.beginPath(); g.arc(128, 128, r, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(60,40,20,.18)'; g.lineWidth = 2; for (let a = 0; a < TAU; a += 0.16) { g.beginPath(); g.moveTo(128 + Math.cos(a) * (r - 6), 128 + Math.sin(a) * (r - 6)); g.lineTo(128 + Math.cos(a + 0.08) * (r + 6), 128 + Math.sin(a + 0.08) * (r + 6)); g.stroke(); } } });
    cell(6, () => { const cols = ['#c4463a', '#3e6fae', '#e2b23c', '#5e9b55', '#8a5a9e', '#e07b39', '#f3ead6', '#2f7f7a']; let x = 0, k = 0; while (x < 256) { const w = 14 + ((k * 7) % 17); g.fillStyle = cols[k % cols.length]; g.fillRect(x, 0, w, 256);
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 28, w, 6); g.fillRect(x, 222, w, 6); g.fillStyle = 'rgba(255,240,200,.5)'; g.fillRect(x + 3, 110, w - 6, 18); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + w - 2, 0, 2, 256); x += w; k++; } });
    cell(7, () => { g.fillStyle = '#d8433a'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#fbefd6'; g.lineWidth = 10; g.strokeRect(16, 16, 224, 224); g.fillStyle = '#fbefd6'; g.beginPath(); g.arc(128, 128, 62, 0, TAU); g.fill();
      g.fillStyle = '#f29b2e'; g.beginPath(); g.moveTo(128, 82); g.quadraticCurveTo(168, 128, 140, 168); g.quadraticCurveTo(128, 178, 116, 168); g.quadraticCurveTo(88, 128, 128, 82); g.fill(); g.fillStyle = '#ffd96a'; g.beginPath(); g.ellipse(128, 148, 12, 20, 0, 0, TAU); g.fill(); });
  });
  ATL.wrapS = ATL.wrapT = THREE.ClampToEdgeWrapping; ATL.needsUpdate = true;
  return ATL;
}
function floorTex() {
  if (FLOOR_TX) return FLOOR_TX;
  FLOOR_TX = ctex(256, 256, (g, w, h) => { const cols = ['#c98f55', '#bd8249', '#d39a5e', '#c48a50']; for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; g.fillRect(i * 64, 0, 64, h);
      for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(110,62,25,${0.08 + (k % 3) * 0.05})`; g.lineWidth = 1 + (k % 2); g.beginPath(); const x = i * 64 + 6 + (k * 37) % 52; g.moveTo(x, 0); g.bezierCurveTo(x + 4, h * 0.3, x - 4, h * 0.7, x + 2, h); g.stroke(); }
      g.fillStyle = 'rgba(70,35,12,.55)'; g.fillRect(i * 64, 0, 3, h); g.fillRect(i * 64, (i % 2) * 128 + 60, 64, 3); } });
  return FLOOR_TX;
}

// ---------------------------------------------------------------- 室内材质（全局复用：哑光 / 金属 / 发光 / 地板）
let FM = null;
function intMat(m, key) { m.onBeforeCompile = (sh) => { sh.uniforms.uRim = rimU; lampShader(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim;').replace('#include <opaque_fragment>', 'outgoingLight += uRim * 0.6 * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);\n#include <opaque_fragment>'); }; m.customProgramCacheKey = () => 'int' + key; return m; }
function furnMats() {
  if (FM) return FM;
  FM = { matte: intMat(new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas(), roughness: 0.78 }), 'm'),
    metal: intMat(new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas(), roughness: 0.32, metalness: 0.65, envMap: ENV, envMapIntensity: 1.1 }), 'x'),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    floor: intMat(new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.82 }), 'f') };
  return FM;
}

// ---------------------------------------------------------------- 家具零件：P() 把一个基础几何体摆好、上色、映射到图集格子
const WHITE_UV = [0.125, 0.75];
function P(geo, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, cell = -1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(_M.compose(_V.set(x, y, z), _Q.setFromEuler(_E.set(rx, ry, rz, 'XYZ')), _S.set(sx, sy, sz)));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count; const c = new Float32Array(n * 3); _C.set(col); for (let i = 0; i < n; i++) { c[i * 3] = _C.r; c[i * 3 + 1] = _C.g; c[i * 3 + 2] = _C.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const uv = new Float32Array(n * 2); const src = g.attributes.uv;
  if (cell >= 0 && src) { const u0 = (cell % 4) * 0.25, v0 = 1 - (Math.floor(cell / 4) + 1) * 0.5; for (let i = 0; i < n; i++) { uv[i * 2] = u0 + 0.25 * (0.02 + 0.96 * clamp(src.getX(i), 0, 1)); uv[i * 2 + 1] = v0 + 0.5 * (0.02 + 0.96 * clamp(src.getY(i), 0, 1)); } }
  else for (let i = 0; i < n; i++) { uv[i * 2] = WHITE_UV[0]; uv[i * 2 + 1] = WHITE_UV[1]; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const cyl = (a, b, h, n = 14, open = false) => new THREE.CylinderGeometry(a, b, h, n, 1, open);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const tor = (r, t, rs = 6, ts = 20) => new THREE.TorusGeometry(r, t, rs, ts);
const circ = (r, n = 24) => new THREE.CircleGeometry(r, n);
const lath = (pts, n = 14) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), n);
const crimp = (r, h, n = 20, k = 0.07) => { const g = cyl(r, r, h, n * 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z); if (rr < r * 0.5) continue; const a = Math.atan2(z, x); const s = 1 + k * (Math.round(a / TAU * n * 2) % 2 ? 1 : -0.3); p.setX(i, x * s); p.setZ(i, z * s); } g.computeVertexNormals(); return g; };
// 一件家具 = 三份几何（哑光 m / 金属 s / 发光 g）+ 居民站位；xf() 把整件摆到房间里
class Bag {
  constructor() { this.m = []; this.s = []; this.g = []; this.spots = []; }
  xf(x, y, z, yaw, s = 1) { _M2.compose(_V.set(x, y, z), _Q.setFromEuler(_E.set(0, yaw, 0, 'XYZ')), _S.set(s, s, s)); for (const L of [this.m, this.s, this.g]) for (const g of L) g.applyMatrix4(_M2);
    const c = Math.cos(yaw), sn = Math.sin(yaw); for (const p of this.spots) { const lx = p.x * s, lz = p.z * s; p.x = x + lx * c + lz * sn; p.z = z - lx * sn + lz * c; p.y = y + p.y * s; p.yaw += yaw; if (p.face) { const fx = p.face[0] * s, fz = p.face[1] * s; p.face = [x + fx * c + fz * sn, z - fx * sn + fz * c]; } } return this; }
  add(o) { this.m.push(...o.m); this.s.push(...o.s); this.g.push(...o.g); this.spots.push(...o.spots); return this; }
}
const WOOD = '#c98f55', WOOD_D = '#8a5a32', CORK = '#c9a06a', CARD = '#e8d6b0', STICK = '#ead0a0', CREAM = '#fbf3e2';
const F = {
  thimble(h = 0.34, r = 0.19) { const b = new Bag(); b.s.push(P(lath([[0, 0], [r, 0], [r * 0.96, h * 0.5], [r * 0.88, h], [0.01, h]], 16), '#ffffff', 0, 0, 0, 0, 0, 0, 1, 1, 1, CELLK.dimple), P(tor(r, 0.022, 5, 18), '#c5ccd4', 0, 0.02, 0, PI / 2)); b.top = h; return b; },
  buttonTable(r = 0.5, col = '#d8443a') { const b = new Bag(); const h = 0.44;
    b.m.push(P(cyl(r * 0.42, r * 0.5, h, 14), CORK, 0, h / 2, 0), P(cyl(r, r, 0.08, 26), col, 0, h + 0.04, 0), P(tor(r * 0.86, 0.03, 5, 26), col, 0, h + 0.08, 0, PI / 2));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.m.push(P(circ(r * 0.1, 12), '#5a1a14', sx * r * 0.2, h + 0.083, sz * r * 0.2, -PI / 2));
    b.top = h + 0.08; return b; },
  capBowl(col = '#3a7fc1', food = '#ecd29a') { const b = new Bag(); b.s.push(P(crimp(0.13, 0.06, 12, 0.1), col, 0, 0.03, 0)); b.m.push(P(sph(0.105, 10, 6), food, 0, 0.06, 0, 0, 0, 0, 1, 0.38, 1)); return b; },
  cup(col = '#fbf6ee', tea = '#b5702e') { const b = new Bag(); b.m.push(P(lath([[0, 0], [0.06, 0], [0.075, 0.1], [0.07, 0.11], [0.01, 0.11]], 12), col), P(circ(0.065, 12), tea, 0, 0.1, 0, -PI / 2), P(tor(0.035, 0.012, 4, 10), col, 0.08, 0.06, 0)); return b; },
  teapot(col = '#5cc0b5') { const b = new Bag(); b.m.push(P(sph(0.15, 14, 10), col, 0, 0.13, 0, 0, 0, 0, 1, 0.85, 1), P(cyl(0.03, 0.045, 0.16, 6), col, 0.17, 0.16, 0, 0, 0, -0.9), P(sph(0.035, 8, 6), '#fbf3e2', 0, 0.27, 0), P(tor(0.06, 0.016, 4, 10, PI), col, -0.15, 0.14, 0, 0, 0, PI / 2)); return b; },
  spool(h = 0.55, r = 0.3, thread = '#d9574a') { const b = new Bag(); b.m.push(P(cyl(r, r, 0.05, 16), WOOD, 0, 0.025, 0), P(cyl(r, r, 0.05, 16), WOOD, 0, h - 0.025, 0), P(cyl(r * 0.74, r * 0.74, h - 0.1, 16), thread, 0, h / 2, 0), P(cyl(r * 0.3, r * 0.3, 0.012, 10), WOOD_D, 0, h + 0.002, 0)); b.top = h; return b; },
  cork(h = 0.3, r = 0.15) { const b = new Bag(); b.m.push(P(cyl(r * 0.92, r, h, 12), CORK, 0, h / 2, 0), P(circ(r * 0.92, 12), '#b58a55', 0, h + 0.002, 0, -PI / 2)); b.top = h; return b; },
  // 火柴盒床：红标签外壳 + 抽屉床 + 床垫 + 茶包被子（带小标签）+ 枕头；床头在 -x，人平躺在床垫上
  bed(L = 1.45, W = 0.72) { const b = new Bag(); const y0 = 0.22;
    b.m.push(P(box(L, y0, W), '#ffffff', 0, y0 / 2, 0, 0, 0, 0, 1, 1, 1, CELLK.label), P(box(L - 0.04, 0.04, W - 0.04), CARD, 0, y0 + 0.02, 0));
    for (const s of [-1, 1]) { b.m.push(P(box(L, 0.16, 0.035), CARD, 0, y0 + 0.08, s * (W / 2 - 0.018)), P(box(0.035, 0.2, W), CARD, s * (L / 2 - 0.018), y0 + 0.1, 0)); }
    b.m.push(P(box(L - 0.1, 0.1, W - 0.1), '#fbf6ec', 0, y0 + 0.09, 0), P(sph(0.2, 12, 8), '#ffffff', -L / 2 + 0.22, y0 + 0.17, 0, 0, 0, 0, 1, 0.45, 1.3));
    b.m.push(P(box(L * 0.6, 0.06, W - 0.03), '#ffffff', L * 0.18, y0 + 0.17, 0, 0, 0, 0, 1, 1, 1, CELLK.quilt), P(cyl(0.004, 0.004, 0.2, 3), '#f3ead6', L * 0.3, y0 + 0.08, W / 2 + 0.02), P(box(0.09, 0.11, 0.008), '#fbf3e2', L * 0.3, y0 - 0.03, W / 2 + 0.03));
    b.spots.push({ k: 'bed', x: L / 2 - 0.12, y: y0 + 0.13, z: 0, yaw: PI / 2 }); b.top = y0 + 0.2; return b; },
  stamp(w = 0.42, h = 0.5, cell = CELLK.stampT) { const b = new Bag(); b.m.push(P(box(w, h, 0.025), '#ffffff', 0, 0, 0, 0, 0, 0, 1, 1, 1, cell)); return b; },
  jar(h = 0.38, r = 0.12, fill = '#c98a3a') { const b = new Bag(); b.m.push(P(cyl(r, r, h, 12), fill, 0, h / 2, 0), P(cyl(r * 0.8, r * 0.8, 0.08, 10), CORK, 0, h + 0.04, 0), P(box(0.02, h * 0.7, 0.01), '#ffffff', -r * 0.5, h * 0.5, r * 0.86)); b.s.push(P(tor(r * 0.98, 0.018, 4, 14), '#dfe7ea', 0, h - 0.02, 0, PI / 2)); b.top = h + 0.08; return b; },
  pencils() { const b = new Bag(); b.s.push(P(crimp(0.3, 0.08, 14, 0.08), '#3a7fc1', 0, 0.04, 0)); const cols = ['#f2c23a', '#d9473b', '#5fa14c', '#3e6fae', '#f2c23a'];
    cols.forEach((c, i) => { const x = -0.18 + i * 0.09, z = (i % 2) * 0.06 - 0.03, yy = 0.11 + (i % 2) * 0.04; b.m.push(P(cyl(0.04, 0.04, 0.36, 6), c, x, yy, z, PI / 2, 0, 0), P(new THREE.ConeGeometry(0.04, 0.09, 6), '#e8c48a', x, yy, z + 0.22, PI / 2, 0, 0)); });
    b.g.push(P(sph(0.07, 8, 6), '#ffb347', 0, 0.16, 0.05, 0, 0, 0, 1.6, 0.8, 0.9)); return b; },
  pot(s = 1, fc = '#ff6f91') { const b = new Bag(); b.m.push(P(cyl(0.12 * s, 0.09 * s, 0.18 * s, 10), '#d0764a', 0, 0.09 * s, 0), P(sph(0.13 * s, 8, 6), '#4f9f3a', 0, 0.22 * s, 0, 0, 0, 0, 1, 0.8, 1));
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; b.m.push(P(sph(0.045 * s, 6, 4), i % 2 ? fc : '#ffffff', Math.cos(a) * 0.08 * s, 0.3 * s, Math.sin(a) * 0.08 * s)); } b.top = 0.32 * s; return b; },
  rug(r = 0.9) { const b = new Bag(); b.m.push(P(circ(r, 28), '#ffffff', 0, 0.012, 0, -PI / 2, 0, 0, 1, 1, 1, CELLK.rug)); return b; },
  candle() { const b = new Bag(); b.s.push(P(crimp(0.07, 0.03, 10, 0.1), '#e2b23c', 0, 0.015, 0)); b.m.push(P(cyl(0.025, 0.028, 0.12, 8), '#fbf3e2', 0, 0.09, 0)); b.g.push(P(sph(0.028, 8, 6), '#ffcf6a', 0, 0.175, 0, 0, 0, 0, 1, 1.6, 1)); return b; },
  // 立灯：线轴底座 + 铅笔灯杆 + 倒扣的顶针灯罩 + 暖光灯泡
  lamp(h = 1.25) { const b = new Bag(); b.m.push(P(cyl(0.16, 0.16, 0.05, 12), WOOD, 0, 0.025, 0), P(cyl(0.1, 0.1, 0.08, 10), '#e2b23c', 0, 0.09, 0), P(cyl(0.025, 0.025, h, 6), '#f2c23a', 0, h / 2, 0));
    b.s.push(P(lath([[0.01, 0], [0.12, 0], [0.16, -0.12], [0.18, -0.2]], 12), '#ffffff', 0, h + 0.1, 0, 0, 0, 0, 1, 1, 1, CELLK.dimple)); b.g.push(P(sph(0.07, 10, 8), '#ffd27a', 0, h - 0.06, 0)); b.light = [0, h - 0.06, 0]; return b; },
  // 柜子：火柴盒抽屉柜，上面摆玻璃罐
  cabinet(w = 0.7, h = 0.8, d = 0.38) { const b = new Bag(); b.m.push(P(box(w, h, d), CARD, 0, h / 2, 0));
    for (let k = 0; k < 3; k++) { const y = 0.16 + k * (h - 0.12) / 3; b.m.push(P(box(w - 0.08, (h - 0.2) / 3 - 0.03, 0.02), '#ffffff', 0, y + 0.06, d / 2 + 0.005, 0, 0, 0, 1, 1, 1, CELLK.label), P(sph(0.025, 6, 4), '#e2b23c', 0, y + 0.06, d / 2 + 0.03)); }
    b.add(F.jar(0.26, 0.09, '#d8435a').xf(-w * 0.22, h, 0, 0)).add(F.jar(0.3, 0.1, '#e9b44c').xf(w * 0.2, h, -0.02, 0)); b.top = h + 0.3; return b; },
  // 冰棍棍搁架：四根立柱 + 几层板，层板上摆东西（fill: 'cups' | 'jars' | 'bread' | 'caps' | 'towels'）
  shelf(w = 0.9, h = 1.3, d = 0.32, levels = 3, fill = 'jars') { const b = new Bag();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.m.push(P(box(0.05, h, 0.05), STICK, sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03)));
    for (let k = 0; k < levels; k++) { const y = 0.12 + k * (h - 0.12) / levels; b.m.push(P(box(w, 0.035, d), STICK, 0, y, 0));
      const n = Math.max(2, Math.round(w / 0.24)); for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * w / n; const cols = ['#d8433a', '#3a7fc1', '#e2b23c', '#5fa14c', '#f3ead6'];
        if (fill === 'cups') b.add(F.cup(i % 2 ? '#fbf6ee' : '#f4c9c2').xf(x, y + 0.02, 0, 0));
        else if (fill === 'bread') b.m.push(P(sph(0.1, 10, 6), i % 2 ? '#d9964a' : '#c47a34', x, y + 0.07, 0, 0, 0, 0, 1.3, 0.75, 0.9));
        else if (fill === 'caps') { for (let s = 0; s < 3; s++) b.s.push(P(crimp(0.08, 0.035, 10, 0.1), cols[(i + s + k) % 5], x, y + 0.035 + s * 0.04, 0)); }
        else if (fill === 'towels') b.m.push(P(box(0.18, 0.08, d * 0.8), ['#f4c9c2', '#cfe4ee', '#fbf3e2'][(i + k) % 3], x, y + 0.06, 0));
        else b.add(F.jar(0.2 + (i % 2) * 0.06, 0.07, ['#c98a3a', '#d8435a', '#e9b44c', '#7aa85a'][(i + k) % 4]).xf(x, y + 0.02, 0, 0)); } }
    b.m.push(P(box(w, 0.035, d), STICK, 0, h, 0)); b.top = h; return b; },
  bookshelf(w = 0.9, h = 1.35, d = 0.3) { const b = new Bag(); b.m.push(P(box(0.05, h, d), WOOD, -w / 2, h / 2, 0), P(box(0.05, h, d), WOOD, w / 2, h / 2, 0), P(box(w, 0.04, d), WOOD, 0, h, 0), P(box(w, 0.04, d), WOOD, 0, 0.04, 0), P(box(w, h, 0.02), WOOD_D, 0, h / 2, -d / 2));
    for (let k = 0; k < 3; k++) { const y = 0.06 + k * (h - 0.06) / 3; b.m.push(P(box(w, 0.03, d), WOOD, 0, y, 0), P(box(w - 0.08, (h - 0.06) / 3 - 0.08, d - 0.08), '#ffffff', 0, y + ((h - 0.06) / 3 - 0.08) / 2 + 0.02, 0.02, 0, 0, 0, 1, 1, 1, CELLK.books)); } b.top = h; return b; },
  // 柜台：火柴盒当台身、木板台面；本地原点在“柜台 + 后面站人的地方”中间，柜台在前（+z），店主站在后面
  counter(w = 1.4, h = 0.62, d = 0.46) { const b = new Bag(); const o = 0.36; b.m.push(P(box(w, h, d), CARD, 0, h / 2, o), P(box(w * 0.86, h * 0.66, 0.012), '#ffffff', 0, h * 0.48, o + d / 2 + 0.006, 0, 0, 0, 1, 1, 1, CELLK.label), P(box(w + 0.08, 0.05, d + 0.08), WOOD, 0, h + 0.025, o));
    b.top = h + 0.05; b.off = o; b.spots.push({ k: 'counter', x: 0, y: 0, z: -0.3, yaw: 0 }); return b; },
  stove() { const b = new Bag(); b.s.push(P(cyl(0.34, 0.34, 0.58, 16), '#9aa4ae', 0, 0.29, 0), P(cyl(0.36, 0.36, 0.04, 16), '#7d8790', 0, 0.58, 0), P(cyl(0.05, 0.05, 1.3, 8), '#7d8790', 0.18, 1.2, -0.16), P(cyl(0.2, 0.17, 0.2, 12), '#5d646c', -0.06, 0.7, 0.04));
    b.m.push(P(box(0.34, 0.24, 0.05), '#2c1c12', 0, 0.2, 0.32)); b.g.push(P(sph(0.1, 8, 6), '#ff9a3c', 0, 0.16, 0.3, 0, 0, 0, 1.4, 0.8, 0.5), P(sph(0.06, 8, 6), '#ffd23f', 0.04, 0.2, 0.32)); b.light = [0, 0.3, 0.4]; b.top = 0.8; return b; },
  oven() { const b = new Bag(); b.s.push(P(box(0.9, 0.7, 0.55), '#c9d0d9', 0, 0.35, 0)); b.m.push(P(box(0.6, 0.32, 0.03), '#3a2a1a', 0, 0.36, 0.28), P(box(0.12, 0.05, 0.05), '#2c1c12', 0.32, 0.62, 0.28)); b.g.push(P(box(0.52, 0.24, 0.02), '#ffb347', 0, 0.36, 0.29));
    b.m.push(P(sph(0.09, 8, 6), '#d9964a', -0.12, 0.76, 0, 0, 0, 0, 1.4, 0.7, 0.9), P(sph(0.09, 8, 6), '#c47a34', 0.14, 0.76, 0.04, 0, 0, 0, 1.4, 0.7, 0.9)); b.light = [0, 0.4, 0.4]; b.top = 0.85; return b; },
  tub(r = 0.95) { const b = new Bag(); b.s.push(P(crimp(r, 0.36, 22, 0.05), '#e8f0f2', 0, 0.18, 0)); b.m.push(P(circ(r * 0.92, 26), '#6fc3e6', 0, 0.3, 0, -PI / 2));
    for (let i = 0; i < 7; i++) { const a = i * 2.4, rr = r * (0.3 + (i % 3) * 0.2); b.m.push(P(sph(0.05 + (i % 2) * 0.03, 8, 6), '#ffffff', Math.cos(a) * rr, 0.32, Math.sin(a) * rr)); }
    for (let i = 0; i < 4; i++) { const a = PI + (i - 1.5) * 0.7; b.spots.push({ k: 'tub', x: Math.sin(a) * r * 0.55, y: 0.02, z: Math.cos(a) * r * 0.55, yaw: a + PI }); } return b; },
  sofa(w = 1.25, d = 0.55) { const b = new Bag(); b.m.push(P(box(w, 0.3, d), '#ffffff', 0, 0.15, 0, 0, 0, 0, 1, 1, 1, CELLK.label), P(box(w - 0.12, 0.1, d - 0.08), '#e7685a', 0, 0.35, 0.03), P(box(w, 0.42, 0.12), CARD, 0, 0.45, -d / 2 + 0.06));
    for (const s of [-1, 1]) b.m.push(P(box(0.12, 0.38, d), CARD, s * (w / 2 - 0.06), 0.32, 0)); b.m.push(P(box(0.3, 0.22, 0.08), '#fbf3e2', -w * 0.25, 0.5, -d / 2 + 0.15, -0.2, 0, 0)); b.spots.push({ k: 'seat', x: -w * 0.18, y: 0.38, z: 0.05, yaw: 0 }, { k: 'seat', x: w * 0.2, y: 0.38, z: 0.05, yaw: 0 }); b.top = 0.66; return b; },
  pigeon(w = 1.0, h = 1.1, d = 0.3) { const b = new Bag(); const nx = 4, ny = 4; for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x = -w / 2 + (i + 0.5) * w / nx, y = (j + 0.5) * h / ny;
      b.m.push(P(box(w / nx - 0.02, h / ny - 0.02, d), (i + j) % 2 ? '#d8433a' : '#3e6fae', x, y, 0)); if ((i * 3 + j) % 3) b.m.push(P(box(w / nx * 0.6, h / ny * 0.5, 0.02), '#fbf6ec', x, y + 0.02, d / 2 + 0.015, -0.2, 0, 0)); } b.top = h; return b; },
  ladder(h = 2) { const b = new Bag(); for (const s of [-1, 1]) b.m.push(P(box(0.05, h, 0.05), STICK, s * 0.2, h / 2, 0)); for (let y = 0.25; y < h; y += 0.3) b.m.push(P(box(0.4, 0.04, 0.05), STICK, 0, y, 0)); return b; },
  // 长条桌（冰棍棍拼的桌面架在两个线轴上）
  longTable(w = 1.5, d = 0.55) { const b = new Bag(); b.add(F.spool(0.42, 0.18, '#3e6fae').xf(-w * 0.32, 0, 0, 0)).add(F.spool(0.42, 0.18, '#3e6fae').xf(w * 0.32, 0, 0, 0)); for (let k = 0; k < 5; k++) b.m.push(P(box(w, 0.04, d / 5 - 0.01), STICK, 0, 0.44, -d / 2 + (k + 0.5) * d / 5)); b.top = 0.46; return b; },
  crate(s = 0.45) { const b = new Bag(); b.m.push(P(box(s * 1.2, s * 0.8, s), '#ffffff', 0, s * 0.4, 0, 0, 0, 0, 1, 1, 1, CELLK.label), P(box(s * 1.0, s * 0.7, s * 0.8), CARD, 0.05, s * 1.15, 0, 0, 0.3, 0)); b.top = s * 1.5; return b; },
};
// 桌子 + 一圈凳子（凳子位置就是座位），每个座位前摆一个瓶盖碗或茶杯
function tableSet(n, kind = 'button', ware = 'bowl', tr = 0.48) {
  const b = new Bag(); const t = kind === 'spool' ? F.spool(0.5, tr * 0.8, '#d9574a') : F.buttonTable(tr, ['#d8443a', '#3a7fc1', '#e2b23c'][n % 3]); b.add(t); const top = t.top; const cols = ['#3a7fc1', '#5fa14c', '#e2b23c', '#d8433a'];
  const tr2 = kind === 'spool' ? tr * 0.8 : tr;
  for (let i = 0; i < n; i++) { const a = PI + 0.5 + i / n * TAU; const sr = tr2 + 0.36; const sx = Math.sin(a) * sr, sz = Math.cos(a) * sr;
    const st = F.thimble(); b.add(st.xf(sx, 0, sz, 0)); b.spots.push({ k: 'seat', x: sx, y: st.top - 0.1, z: sz, yaw: a + PI, face: [0, 0] });
    const wr = tr2 * 0.62; const w = ware === 'cup' ? F.cup(i % 2 ? '#fbf6ee' : '#f4c9c2') : F.capBowl(cols[i % 4]); b.add(w.xf(Math.sin(a) * wr, top, Math.cos(a) * wr, a)); }
  if (ware === 'cup') b.add(F.teapot().xf(0, top, 0, 0.4)); else b.add(F.candle().xf(0, top, 0, 0));
  b.r = tr2 + 0.55; return b;
}

// ---------------------------------------------------------------- 切开：区域判断（和着色器里的一模一样）
function regionOf(c, x, y, z) {
  const qx = x - c.cx, qz = z - c.cz; const f = Math.atan2(qx, qz) * c.teeth / TAU; const tri = Math.abs(f - Math.floor(f) - 0.5) * 4 - 1;
  const yc = c.cut - c.slope * qz + c.zig * tri;
  if (y > yc && qx * qx + qz * qz < c.rLid * c.rLid && !(c.keepZ && qz > c.keepZ && Math.abs(qx) < c.keepX)) return 1;
  if (c.panel && qz > c.pz && qz < c.pzMax && y > c.py) return 2;
  if (c.keepZ && qz > c.keepZ && Math.abs(qx) < c.keepX) return 0;
  return 0;
}
const CUT_HEAD = `uniform vec4 uCutA; uniform vec4 uCutB; uniform vec4 uCutC; uniform vec4 uCutD; uniform vec3 uInner; uniform float uPiece; varying vec3 vCutP; varying float vCutIn;
float jkCutR(vec3 p){ vec2 q = p.xz - uCutC.xy; float f = atan(q.x, q.y) * uCutA.z / 6.2831853; float tri = abs(fract(f) - 0.5) * 4.0 - 1.0;
  float yc = uCutA.x - uCutA.w * q.y + uCutA.y * tri; bool keep = uCutD.x > 0.0 && q.y > uCutD.x && abs(q.x) < uCutD.y; if (p.y > yc && dot(q, q) < uCutB.x * uCutB.x && !keep) return 1.0;
  if (uCutB.y > 0.5 && q.y > uCutB.z && q.y < uCutC.z && p.y > uCutB.w) return 2.0; return 0.0; }`;
// 剖面材质：复制原材质，加上切口裁剪、内墙色、暖灯；同一栋房子所有材质共用一组 uniform
function cutMat(src, vc, piece, U) {
  let m; const basic = src && src.isMeshBasicMaterial;
  if (vc) { const p = (src || '').split ? src.split('|') : ['vc', '0.8', 'false']; m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: +p[1] || 0.8, flatShading: p[2] === 'true' }); }
  else { m = src.clone(); }
  m.side = THREE.DoubleSide; const opaque = !m.transparent;
  const pu = { value: piece };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U); sh.uniforms.uPiece = pu;
    if (!basic) { sh.uniforms.uRim = rimU; wxShader(sh); lampShader(sh); }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aIn; varying vec3 vCutP; varying float vCutIn;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCutP = transformed; vCutIn = aIn;');
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CUT_HEAD + (basic ? '' : '\nuniform vec3 uRim;'))
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (abs(jkCutR(vCutP) - uPiece) > 0.5) discard;');
    if (opaque) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
if (!gl_FrontFacing || vCutIn > 0.5) { vec2 q = vCutP.xz - uCutC.xy; float pl = 1.0;
  if (uCutC.w > 0.5) { float f = fract(atan(q.x, q.y) * 7.0 + 0.5); pl = 1.0 - 0.2 * (1.0 - smoothstep(0.0, 0.05, min(f, 1.0 - f))); }
  diffuseColor.rgb = uInner * pl * (0.82 + 0.18 * smoothstep(0.0, 1.6, vCutP.y - uCutB.w * 0.0)); }`);
    if (!basic) fs = fs.replace('#include <opaque_fragment>', 'outgoingLight += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);\n#include <opaque_fragment>');
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'cut' + (basic ? 'b' : '') + (opaque ? 'o' : 't');
  if (src && src.emissive && !vc) m.userData.src = src;
  return m;
}

// 一个零件（非索引几何，本地坐标）按区域分成几份：每个三角形放进它碰到的区域（跨界的两边都放，着色器再精确裁）；跨界处记下切口线段（做壳沿）
function splitPart(part, c, byNormal, segs) {
  const g = part.geo; const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ca = g.attributes.color; const n = pa.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  if (part.m) { _N.getNormalMatrix(part.m); for (let i = 0; i < n; i++) { _V.fromBufferAttribute(pa, i).applyMatrix4(part.m); P[i * 3] = _V.x; P[i * 3 + 1] = _V.y; P[i * 3 + 2] = _V.z; if (na) { _V.fromBufferAttribute(na, i).applyMatrix3(_N).normalize(); N[i * 3] = _V.x; N[i * 3 + 1] = _V.y; N[i * 3 + 2] = _V.z; } } }
  else { P.set(pa.array.subarray(0, n * 3)); if (na) N.set(na.array.subarray(0, n * 3)); }
  const reg = new Uint8Array(n); for (let i = 0; i < n; i++) reg[i] = regionOf(c, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
  const lists = [[], [], []]; const nt = Math.floor(n / 3);
  for (let t = 0; t < nt; t++) {
    const a = reg[t * 3], b = reg[t * 3 + 1], d = reg[t * 3 + 2]; lists[a].push(t); if (b !== a) lists[b].push(t); if (d !== a && d !== b) lists[d].push(t);
    if (segs && (a !== b || b !== d)) { // 切口线段：在跨区的边上二分找到交点
      const pts = []; for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) { const vi = t * 3 + i, vj = t * 3 + j; if (reg[vi] === reg[vj]) continue; let lo = 0, hi = 1; const r0 = reg[vi];
        for (let k = 0; k < 9; k++) { const mid = (lo + hi) / 2; const x = lerp(P[vi * 3], P[vj * 3], mid), y = lerp(P[vi * 3 + 1], P[vj * 3 + 1], mid), z = lerp(P[vi * 3 + 2], P[vj * 3 + 2], mid); if (regionOf(c, x, y, z) === r0) lo = mid; else hi = mid; }
        const f = (lo + hi) / 2; pts.push(lerp(P[vi * 3], P[vj * 3], f), lerp(P[vi * 3 + 1], P[vj * 3 + 1], f), lerp(P[vi * 3 + 2], P[vj * 3 + 2], f)); }
      if (pts.length >= 6) { segs.push(pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]); if (pts.length >= 9) segs.push(pts[3], pts[4], pts[5], pts[6], pts[7], pts[8]); }
    }
  }
  const out = [];
  for (let piece = 0; piece < 3; piece++) {
    const L = lists[piece]; if (!L.length) { out.push(null); continue; }
    const m = L.length * 3; const pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), uv = ua ? new Float32Array(m * 2) : null, col = ca ? new Float32Array(m * 3) : null, inn = new Float32Array(m);
    let o = 0;
    for (const t of L) {
      let inward = 0;
      if (byNormal) { const i0 = t * 3; const cx = (P[i0 * 3] + P[i0 * 3 + 3] + P[i0 * 3 + 6]) / 3 - c.cx, cz = (P[i0 * 3 + 2] + P[i0 * 3 + 5] + P[i0 * 3 + 8]) / 3 - c.cz; const nx = N[i0 * 3] + N[i0 * 3 + 3] + N[i0 * 3 + 6], ny = N[i0 * 3 + 1] + N[i0 * 3 + 4] + N[i0 * 3 + 7], nz = N[i0 * 3 + 2] + N[i0 * 3 + 5] + N[i0 * 3 + 8];
        const l = Math.hypot(nx, ny, nz) || 1, lc = Math.hypot(cx, cz) || 1; if (Math.abs(ny / l) < 0.7 && -(nx * cx + nz * cz) / (l * lc) > 0.35) inward = 1; }
      for (let k = 0; k < 3; k++) { const v = t * 3 + k; pos[o * 3] = P[v * 3]; pos[o * 3 + 1] = P[v * 3 + 1]; pos[o * 3 + 2] = P[v * 3 + 2]; nor[o * 3] = N[v * 3]; nor[o * 3 + 1] = N[v * 3 + 1]; nor[o * 3 + 2] = N[v * 3 + 2];
        if (uv) { uv[o * 2] = ua.getX(v); uv[o * 2 + 1] = ua.getY(v); } if (col) { col[o * 3] = ca.getX(v); col[o * 3 + 1] = ca.getY(v); col[o * 3 + 2] = ca.getZ(v); } inn[o] = inward; o++; }
    }
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.BufferAttribute(pos, 3)); ng.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (col) ng.setAttribute('color', new THREE.BufferAttribute(col, 3)); ng.setAttribute('aIn', new THREE.BufferAttribute(inn, 1)); ng.computeBoundingSphere();
    out.push(ng);
  }
  return out;
}
// 壳沿：把切口线段做成一圈细圆管（四棱），看上去像蛋壳/陶瓷/橡胶的厚度
function beadGeo(segs, t) {
  const ns = segs.length / 6; const pos = new Float32Array(ns * 24 * 3), nor = new Float32Array(ns * 24 * 3); let o = 0;
  const ring = (cx, cy, cz, k) => { const a = k / 4 * TAU + PI / 4; const cs = Math.cos(a), sn = Math.sin(a); return [cx + (_U.x * cs + _W.x * sn) * t, cy + (_U.y * cs + _W.y * sn) * t, cz + (_U.z * cs + _W.z * sn) * t, _U.x * cs + _W.x * sn, _U.y * cs + _W.y * sn, _U.z * cs + _W.z * sn]; };
  for (let s = 0; s < ns; s++) {
    _A.set(segs[s * 6], segs[s * 6 + 1], segs[s * 6 + 2]); _B.set(segs[s * 6 + 3], segs[s * 6 + 4], segs[s * 6 + 5]); _D.subVectors(_B, _A); const L = _D.length(); if (L < 1e-4) continue; _D.divideScalar(L);
    _A.addScaledVector(_D, -t * 0.6); _B.addScaledVector(_D, t * 0.6);
    _U.set(0, 1, 0); if (Math.abs(_D.y) > 0.9) _U.set(1, 0, 0); _W.crossVectors(_D, _U).normalize(); _U.crossVectors(_W, _D).normalize();
    for (let k = 0; k < 4; k++) { const a0 = ring(_A.x, _A.y, _A.z, k), a1 = ring(_A.x, _A.y, _A.z, k + 1), b0 = ring(_B.x, _B.y, _B.z, k), b1 = ring(_B.x, _B.y, _B.z, k + 1);
      for (const v of [a0, b0, b1, a0, b1, a1]) { pos[o * 3] = v[0]; pos[o * 3 + 1] = v[1]; pos[o * 3 + 2] = v[2]; nor[o * 3] = v[3]; nor[o * 3 + 1] = v[4]; nor[o * 3 + 2] = v[5]; o++; } }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, o * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, o * 3), 3)); g.computeBoundingSphere(); return g;
}
// 水平切一刀：所有三角形和 y = h 的交点（xz），用来量地板/楼板的形状和墙离中心有多远
function sliceY(parts, h, pts) {
  for (const p of parts) { const a = p.P; const n = a.length / 3; for (let t = 0; t + 2 < n; t += 3) { const y0 = a[t * 3 + 1] - h, y1 = a[t * 3 + 4] - h, y2 = a[t * 3 + 7] - h; if ((y0 > 0) === (y1 > 0) && (y1 > 0) === (y2 > 0)) continue;
    for (const [i, j, yi, yj] of [[0, 1, y0, y1], [1, 2, y1, y2], [2, 0, y2, y0]]) { if ((yi > 0) === (yj > 0)) continue; const f = yi / (yi - yj); const vi = (t + i) * 3, vj = (t + j) * 3; pts.push(lerp(a[vi], a[vj], f), lerp(a[vi + 2], a[vj + 2], f)); } } }
  return pts;
}
const NB = 48;
// 每个方向上墙离中心多远（取最近的墙面；忽略门洞这类伸进屋里很深的东西）
function radialBins(pts, cx, cz) {
  const B = new Float32Array(NB).fill(Infinity), all = [];
  for (let i = 0; i < pts.length; i += 2) { const dx = pts[i] - cx, dz = pts[i + 1] - cz; const r = Math.hypot(dx, dz); if (r < 0.05) continue; all.push([r, Math.floor((Math.atan2(dx, dz) + PI) / TAU * NB) % NB]); }
  const mins = new Float32Array(NB).fill(Infinity); for (const [r, b] of all) if (r < mins[b]) mins[b] = r;
  const fin = [...mins].filter(isFinite).sort((a, b) => a - b); const med = fin.length ? fin[Math.floor(fin.length / 2)] : 1;
  for (const [r, b] of all) if (r > med * 0.72 && r < B[b]) B[b] = r;
  for (let k = 0; k < NB; k++) if (!isFinite(B[k])) { let l = 1; while (l < NB && !isFinite(B[(k - l + NB) % NB]) && !isFinite(B[(k + l) % NB])) l++; const a = B[(k - l + NB) % NB], b = B[(k + l) % NB]; B[k] = isFinite(a) && isFinite(b) ? Math.min(a, b) : isFinite(a) ? a : isFinite(b) ? b : med; }
  return B;
}
const binAt = (B, th) => { const f = ((th + PI) / TAU * NB - 0.5 + NB) % NB; const i = Math.floor(f), k = f - i; return lerp(B[i % NB], B[(i + 1) % NB], k); };
function polyGeo(B, cx, cz, y, k, holes = []) {
  const s = new THREE.Shape(); for (let i = 0; i < NB; i++) { const th = (i + 0.5) / NB * TAU - PI; const r = B[i] * k; const x = cx + Math.sin(th) * r, z = cz + Math.cos(th) * r; if (i) s.lineTo(x, -z); else s.moveTo(x, -z); }
  for (const h of holes) { const p = new THREE.Path(); p.moveTo(h[0] - h[2], -(h[1] - h[3])); p.lineTo(h[0] - h[2], -(h[1] + h[3])); p.lineTo(h[0] + h[2], -(h[1] + h[3])); p.lineTo(h[0] + h[2], -(h[1] - h[3])); s.holes.push(p); }
  const g = new THREE.ShapeGeometry(s, 2); g.rotateX(-PI / 2); g.translate(0, y, 0);
  const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.55, p.getZ(i) * 0.55); return g;
}

// ---------------------------------------------------------------- 房间布置：中间一组 + 沿墙一圈（从背后往两边排，正对镜头的前方留空）
class Room {
  constructor(B, Bt, cx, cz, y0, h) { this.B = B; this.Bt = Bt; this.cx = cx; this.cz = cz; this.y0 = y0; this.h = h; this.rc = PI; this.lc = -PI; this.first = true; this.side = 0; this.clear = 0.95; this.bag = new Bag(); this.used = []; }
  R(th, tall = false) { return binAt(tall ? this.Bt : this.B, th); }
  get Ravg() { let s = 0; for (const v of this.B) s += v; return s / NB; }
  // 沿墙摆一件：w 宽、d 深；返回 null 表示放不下
  wall(item, w, d, tall = true) {
    const R0 = this.R(PI, tall); let th;
    const span = (r) => (w + 0.08) / Math.max(0.5, r);
    if (this.first) { const a = span(R0 - d / 2); th = PI; this.rc = PI - a / 2; this.lc = -PI + a / 2; this.first = false; }
    else { const right = this.side++ % 2 === 0; const Rg = this.R(right ? this.rc - 0.3 : this.lc + 0.3, tall); const a = span(Rg - d / 2);
      if (right) { th = this.rc - a / 2; if (th - a / 2 < this.clear) { if (this.lc + a < -this.clear) { th = this.lc + a / 2; this.lc += a; } else return null; } else this.rc -= a; }
      else { th = this.lc + a / 2; if (th + a / 2 > -this.clear) { if (this.rc - a > this.clear) { th = this.rc - a / 2; this.rc -= a; } else return null; } else this.lc += a; } }
    const Rw = Math.min(this.R(th, tall), this.R(th - 0.12, tall), this.R(th + 0.12, tall)); const r = Rw - d / 2 - (w * w) / (8 * Rw) - 0.05; if (r < 0.3) return null;
    const x = this.cx + Math.sin(th) * r, z = this.cz + Math.cos(th) * r; this.bag.add(item.xf(x, this.y0, z, th + PI)); this.used.push([x, z, Math.max(w, d) / 2]); return { x, z, th, r };
  }
  // 挂在墙上（邮票画）
  hang(item, th, y) { const r = Math.min(this.R(th, true), binAt(this.Bt, th)) - 0.04; this.bag.add(item.xf(this.cx + Math.sin(th) * r, this.y0 + y, this.cz + Math.cos(th) * r, th + PI)); }
  at(item, x, z, yaw = 0) { this.bag.add(item.xf(this.cx + x, this.y0, this.cz + z, yaw)); this.used.push([this.cx + x, this.cz + z, item.r || 0.4]); return item; }
  // 空地上的站位（离家具远一点）
  stands(n) { const out = []; for (let k = 0; k < 40 && out.length < n; k++) { const th = (k * 2.399) % TAU - PI, rr = this.Ravg * (0.25 + (k % 5) * 0.12); const x = this.cx + Math.sin(th) * rr, z = this.cz + Math.cos(th) * rr;
    if (this.used.some(u => Math.hypot(u[0] - x, u[1] - z) < u[2] + 0.35) || out.some(o => Math.hypot(o.x - x, o.z - z) < 0.6)) continue; out.push({ k: 'stand', x, y: this.y0, z, yaw: Math.atan2(this.cx - x, this.cz - z) + (k % 3 - 1) * 0.6 }); } return out; }
}
// 各用途的房间：家（餐桌、床、储物）、茶馆、食堂、面包房、澡堂、图书角、邮局、储物间
function furnish(room, type, o) {
  const R = room.Ravg; const fwd = R * 0.16; const big = R > 1.9;
  const lamp = () => room.wall(F.lamp(Math.min(1.25, room.h - 0.35)), 0.36, 0.36);
  if (type === 'home' || type === 'loft' || type === 'living') {
    if (type !== 'loft') { const n = clamp(o.seats || 3, 2, big ? 4 : 3); room.at(F.rug(Math.min(1.05, R * 0.46)), 0, fwd * 0.6); room.at(tableSet(n, 'button', 'bowl', big ? 0.5 : 0.42), 0, fwd); }
    const beds = type === 'living' ? 0 : clamp(Math.min(o.beds || 2, R > 2.6 ? 3 : R > 1.9 ? 2 : 1), 1, 3);
    for (let i = 0; i < beds; i++) if (!room.wall(F.bed(), 1.47, 0.76)) break;
    if (type === 'loft') { room.wall(F.spool(0.42, 0.18, '#e2b23c').add(F.pot(0.9).xf(0, 0.42, 0, 0)), 0.4, 0.4); room.hang(F.stamp(0.38, 0.46, CELLK.stampD), PI - 0.5, 1.0); return; }
    if (type === 'living') { room.wall(F.sofa(), 1.25, 0.6); room.wall(F.bookshelf(0.75, 1.1), 0.8, 0.32); }
    room.wall(F.cabinet(), 0.7, 0.4); lamp();
    room.wall(F.spool(0.5, 0.26, '#5fa14c').add(F.pot(1, '#ffd23f').xf(0.04, 0.5, 0, 0)).add(F.cup().xf(-0.14, 0.5, 0.08, 0)), 0.55, 0.55);
    room.wall(F.shelf(0.5, 0.75, 0.26, 2, 'jars'), 0.5, 0.3); room.wall(F.pencils(), 0.62, 0.62); room.wall(F.cork(0.3, 0.16).add(F.pot(0.8, '#ff9a3c').xf(0, 0.3, 0, 0)), 0.34, 0.34);
    room.hang(F.stamp(0.5, 0.6, CELLK.stampT), PI + 0.45, 1.25); room.hang(F.stamp(0.42, 0.52, CELLK.stampD), PI - 0.5, 1.35);
    return;
  }
  if (type === 'tea' || type === 'food' || type === 'bakery' || type === 'post') {
    const ct = room.wall(type === 'post' ? F.counter(1.2, 0.6, 0.42) : F.counter(Math.min(1.5, R * 0.75), 0.6, 0.44), Math.min(1.5, R * 0.75), 1.3);
    const topY = 0.65;
    if (ct && type === 'tea') { const c = Math.cos(ct.th + PI), s = Math.sin(ct.th + PI), o = 0.36; const put = (it, lx) => room.bag.add(it.xf(ct.x + lx * c + o * s, room.y0 + topY, ct.z - lx * s + o * c, ct.th + PI)); put(F.teapot(), -0.35); put(F.cup(), 0.1); put(F.cup('#f4c9c2'), 0.32); }
    if (type === 'tea') { room.wall(F.shelf(0.85, 1.25, 0.3, 3, 'cups'), 0.85, 0.32); room.wall(F.shelf(0.7, 1.0, 0.3, 2, 'caps'), 0.7, 0.32); }
    if (type === 'food') { room.wall(F.stove(), 0.75, 0.75); room.wall(F.shelf(0.8, 1.2, 0.3, 3, 'caps'), 0.8, 0.32); room.wall(F.pencils(), 0.62, 0.62); }
    if (type === 'bakery') { room.wall(F.oven(), 0.95, 0.6); room.wall(F.shelf(0.85, 1.2, 0.32, 3, 'bread'), 0.85, 0.34); }
    if (type === 'post') { room.wall(F.pigeon(), 1.0, 0.32); room.hang(F.stamp(0.34, 0.42, CELLK.stampD), PI + 0.45, 1.2); room.hang(F.stamp(0.34, 0.42, CELLK.stampT), PI + 0.75, 1.0); }
    lamp(); room.hang(F.stamp(0.36, 0.44, CELLK.stampT), PI - 0.5, 1.25);
    // 客人的小桌：左右各一张（4 个座位，对应模拟里店的 4 个座位）
    const tx = R * 0.42, tz = fwd + R * 0.1;
    if (type === 'food' && big) room.at(longSet(), 0, tz);
    else for (const s of [-1, 1]) room.at(tableSet(2, 'spool', type === 'tea' ? 'cup' : 'bowl', 0.34), s * tx, tz, s * 0.4);
    room.wall(F.pot(1.3, '#ff6f91'), 0.4, 0.4);
    return;
  }
  if (type === 'bath') { room.at(F.tub(Math.min(1.0, R * 0.48)), 0, fwd * 0.8); room.wall(F.shelf(0.8, 1.0, 0.3, 2, 'towels'), 0.8, 0.32); room.wall(F.counter(0.9, 0.55, 0.36), 0.9, 1.2); room.wall(F.cork(0.28, 0.14), 0.3, 0.3); room.wall(F.jar(0.3, 0.1, '#cfe4ee'), 0.25, 0.25); lamp(); room.hang(F.stamp(0.36, 0.44, CELLK.stampD), PI - 0.5, 1.2); return; }
  if (type === 'school') { room.wall(F.bookshelf(), 0.9, 0.32); room.wall(F.bookshelf(0.8, 1.2), 0.8, 0.32); room.wall(F.bookshelf(0.7, 1.0), 0.7, 0.32); room.at(F.rug(Math.min(1.0, R * 0.45)), 0, fwd); room.at(tableSet(3, 'spool', 'cup', 0.38), 0, fwd); lamp(); room.hang(F.stamp(0.36, 0.44, CELLK.stampT), PI - 0.6, 1.3); return; }
  // shed：储物间
  room.wall(F.shelf(0.9, 1.3, 0.32, 3, 'jars'), 0.9, 0.34); room.wall(F.crate(), 0.6, 0.5); room.wall(F.crate(0.4), 0.5, 0.45); room.wall(F.shelf(0.7, 1.0, 0.3, 2, 'caps'), 0.7, 0.32); room.wall(F.pencils(), 0.62, 0.62); room.wall(F.spool(0.5, 0.25, '#3e6fae'), 0.5, 0.5); lamp();
  room.at(F.rug(Math.min(0.8, R * 0.4)), 0, fwd);
}
function longSet() { const b = new Bag(); b.add(F.longTable(1.4, 0.55)); const cols = ['#3a7fc1', '#5fa14c', '#e2b23c', '#d8433a'];
  for (let i = 0; i < 4; i++) { const x = (i % 2 ? 0.35 : -0.35), z = i < 2 ? -0.5 : 0.5; const st = F.thimble(); b.add(st.xf(x, 0, z, 0)); b.spots.push({ k: 'seat', x, y: st.top - 0.1, z, yaw: z < 0 ? 0 : PI, face: [x, 0] }); b.add(F.capBowl(cols[i]).xf(x, 0.46, z * 0.45, 0)); }
  b.add(F.candle().xf(0, 0.46, 0, 0)); b.r = 1.0; return b; }
function roomTypeOf(lot) {
  if (!lot) return 'home';
  if (lot.use === 'shop') return lot.shop === 'tea' ? 'tea' : lot.shop === 'bath' ? 'bath' : lot.shop === 'bakery' ? 'bakery' : 'food';
  if (lot.use === 'fac') return lot.fac === 'school' ? 'school' : lot.fac === 'post' ? 'post' : lot.fac === 'shed' ? 'shed' : lot.fac === 'stage' ? 'school' : 'shed';
  if (lot.use === 'shed') return 'shed';
  return 'home';
}
export const ROOM_NAME = { home: '家', tea: '茶馆', food: '小食堂', bakery: '面包房', bath: '澡堂', school: '图书角', post: '邮局', shed: '储物间' };
// 哪些建筑能进：住所、店、共享小屋、储物棚，以及图书角/邮局/舞台这类有屋子的设施
export function canEnter(lot) { if (!lot || !lot.done || lot.stage !== 'done' || lot.up || lot.moving) return false; if (['home', 'shop', 'shared', 'shed'].includes(lot.use)) return true; return lot.use === 'fac' && ['school', 'post', 'shed', 'stage'].includes(lot.fac); }

// ---------------------------------------------------------------- 进屋
export class Interior {
  constructor(scene) { this.scene = scene; this.active = false; this.state = null; this.u = 0; this.chars = new Map(); this.hide = new Set(); this.who = []; this.whoKey = ''; }
  get busy() { return !!this.state; }
  // 进屋：src 来自 town.cutParts / props.cutParts；lot 是模拟里的地块（结构信息）
  enter(src, lot, overlay) {
    if (this.state) return false; const t0 = performance.now();
    const base = src.base; const K = CUTK[base]; const s = K ? KIND_SCALE[base] : 1; const h = src.h, rr = src.r;
    const c = K ? { cut: K.cut * s, slope: K.slope, zig: (K.zig || 0) * s, teeth: K.teeth || 1, rLid: K.rLid * s, cx: (K.c ? K.c[0] : 0) * s, cz: (K.c ? K.c[1] : 0) * s, floor: K.floor * s,
      panel: !!K.panel, pz: K.panel ? K.panel.pz * s : 0, py: K.panel ? K.panel.py * s : 0, pzMax: K.panel ? K.panel.pzMax * s : 0, loft: K.loft ? K.loft * s : 0, cL: K.cL ? [K.cL[0] * s, K.cL[1] * s] : null, inner: K.inner, rim: K.rim, plank: K.plank, byNormal: K.byNormal, keepZ: K.keep ? K.keep[0] * s : 0, keepX: K.keep ? K.keep[1] * s : 0 }
      : { cut: h * 0.62, slope: 0, zig: 0, teeth: 1, rLid: rr * 1.2, cx: 0, cz: 0, floor: -1, panel: false, pz: 0, py: 0, pzMax: 0, loft: 0, cL: null, inner: '#d9b07a', rim: '#efe0c4', plank: 1 };
    this.c = c; this.src = src; this.lot = lot; this.type = roomTypeOf(lot); this.base = base;
    const U = this.U = { uCutA: { value: new THREE.Vector4(c.cut, c.zig, c.teeth, c.slope) }, uCutB: { value: new THREE.Vector4(c.rLid, c.panel ? 1 : 0, c.pz, c.py) }, uCutC: { value: new THREE.Vector4(c.cx, c.cz, c.pzMax, c.plank ? 1 : 0) }, uInner: { value: new THREE.Color(c.inner) }, uCutD: { value: new THREE.Vector4(c.keepZ || 0, c.keepX || 0, 0, 0) } };
    const root = this.root = new THREE.Group(); root.position.set(src.x, src.y || 0, src.z); root.rotation.y = src.yaw; this.scene.add(root);
    const lid = this.lid = new THREE.Group(); root.add(lid); const panel = this.panel = new THREE.Group(); root.add(panel);
    this.geos = []; this.mats = []; const segs = []; const matCache = new Map();
    const allParts = [...src.parts, ...((overlay && overlay.parts) || [])];
    const sliceParts = [];
    for (const part of allParts) {
      const skip = part.layer === 'glass' || part.layer === 'glow';
      const pieces = splitPart(part, c, c.byNormal, skip || (src.tmpl && part.vc) ? null : segs); // 壳沿只沿着主体（贴图材质）做，窗框、草秆这些小零件不加
      if (!skip) { const P = new Float32Array(part.geo.attributes.position.count * 3); const pa = part.geo.attributes.position; for (let i = 0; i < pa.count; i++) { _V.fromBufferAttribute(pa, i); if (part.m) _V.applyMatrix4(part.m); P[i * 3] = _V.x; P[i * 3 + 1] = _V.y; P[i * 3 + 2] = _V.z; } sliceParts.push({ P }); }
      pieces.forEach((g, piece) => { if (!g) return; const key = (part.vc ? part.key : (part.src ? part.src.uuid : 'x')) + '#' + piece;
        let m = matCache.get(key); if (!m) { m = cutMat(part.vc ? part.key : part.src, part.vc, piece, U); matCache.set(key, m); this.mats.push(m); }
        const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = false; (piece === 1 ? lid : piece === 2 ? panel : root).add(mesh); this.geos.push(g); });
    }
    // 壳沿：屋体和盖子各一份
    const bt = clamp(rr * (c.panel ? 0.03 : 0.022), 0.05, 0.13); const bg = beadGeo(segs, bt); this.geos.push(bg);
    const bm = new THREE.MeshStandardMaterial({ color: c.rim, roughness: 0.55 }); intMat(bm, 'b'); this.mats.push(bm);
    // 屋体上的壳沿：只留属于屋体那一侧（盖子抬起后两边都看得见）
    root.add(new THREE.Mesh(bg, bm)); lid.add(new THREE.Mesh(bg, bm)); if (c.panel) panel.add(new THREE.Mesh(bg, bm));
    // 地板（和二楼楼板）：按切开的墙量出形状
    const FMt = furnMats(); const mk = (g, m, parent = root) => { const me = new THREE.Mesh(g, m); me.receiveShadow = true; me.castShadow = !LOW && m !== FMt.floor; parent.add(me); this.geos.push(g); return me; };
    const ring = (y, cx, cz) => radialBins(sliceY(sliceParts, y, []), cx, cz);
    if (c.floor < 0) { // 旧物建筑：从下往上找到“墙身”开始的高度当地板（底座、鞋底这类比墙宽的不算）
      const avg = (B) => B.reduce((a, b) => a + b, 0) / NB; const ref = avg(ring(h * 0.42, 0, 0)); c.floor = h * 0.04;
      for (let y = h * 0.03; y < h * 0.36; y += h * 0.03) { if (avg(ring(y, 0, 0)) <= ref * 1.06) { c.floor = y + 0.02; break; } } }
    const ceil = c.cut - Math.abs(c.slope) * rr * 0.6 - Math.abs(c.zig);
    const floors = [];
    if (c.loft) {
      const cL = c.cL || [c.cx, c.cz];
      const B1 = ring(c.floor + 0.04, c.cx, c.cz), B1t = minBins([B1, ring(c.floor + 0.8, c.cx, c.cz), ring(c.loft - 0.2, c.cx, c.cz)]);
      const B2 = ring(c.loft + 0.06, cL[0], cL[1]), B2t = minBins([B2, ring(Math.min(ceil, c.loft + 1.2), cL[0], cL[1])]);
      const hole = [cL[0] + binAt(B2, PI / 2) * 0.45, cL[1] + 0.15, 0.3, 0.26];
      mk(polyGeo(B1, c.cx, c.cz, c.floor, 0.985), FMt.floor); const lg = polyGeo(B2, cL[0], cL[1], c.loft, 0.985, [hole]); mk(lg, FMt.floor);
      const edge = polyGeo(B2, cL[0], cL[1], c.loft - 0.1, 0.985, [hole]); mk(edge, FMt.floor);
      floors.push(new Room(B1, B1t, c.cx, c.cz, c.floor, c.loft - c.floor), new Room(B2, B2t, cL[0], cL[1], c.loft, ceil - c.loft));
      this.ladder = { x: hole[0], z: hole[1] + 0.1, y0: c.floor, y1: c.loft };
      const lad = F.ladder(c.loft - c.floor + 0.35); lad.xf(hole[0], c.floor, hole[1] - 0.05, 0); floors[0].bag.add(lad); floors[0].used.push([hole[0], hole[1], 0.4]);
    } else {
      const B = ring(c.floor + 0.04, c.cx, c.cz), Bt = minBins([B, ring(c.floor + 0.7, c.cx, c.cz), ring(c.floor + 1.4, c.cx, c.cz), ring(Math.max(c.floor + 0.2, ceil - 0.15), c.cx, c.cz)]);
      mk(polyGeo(B, c.cx, c.cz, c.floor, 0.985), FMt.floor); floors.push(new Room(B, Bt, c.cx, c.cz, c.floor, ceil - c.floor));
      this.ladder = null;
    }
    const beds = (lot && lot.cap) || 3;
    if (floors.length === 2) { furnish(floors[0], this.type === 'home' ? 'living' : this.type, { seats: 3, beds: 0 }); furnish(floors[1], this.type === 'home' ? 'loft' : 'shed', { beds: Math.min(2, beds) }); }
    else furnish(floors[0], this.type, { seats: Math.max(2, Math.min(4, beds)), beds });
    const all = new Bag(); for (const f of floors) all.add(f.bag);
    const merge = (L, m) => { if (!L.length) return; const g = mergeGeometries(L, false); for (const x of L) x.dispose(); mk(g, m); };
    merge(all.m, FMt.matte); merge(all.s, FMt.metal); merge(all.g, FMt.glow);
    this.floors = floors;
    // 居民站位
    this.spots = { seat: [], bed: [], counter: [], tub: [], stand: [] };
    for (const p of all.spots) (this.spots[p.k] || (this.spots[p.k] = [])).push(p);
    for (const f of floors) this.spots.stand.push(...f.stands(6));
    for (const k in this.spots) for (const p of this.spots[k]) p.used = 0;
    // 暖灯：房间正中偏上
    const f0 = floors[floors.length - 1]; this.lampL = new THREE.Vector3(floors[0].cx, (floors[0].y0 + Math.min(ceil, floors[0].y0 + 2.2)) * 0.5 + 0.4, floors[0].cz + floors[0].Ravg * 0.1); this.lampR = Math.max(4.5, f0.Ravg * 2.6 + (c.loft ? 2.5 : 0));
    // 门口（屋里那一侧）
    const dth = Math.atan2((src.door[0] || 0) - floors[0].cx, (src.door[1] || 1) - floors[0].cz); const dr = floors[0].R(dth) * 0.78;
    this.doorIn = { x: floors[0].cx + Math.sin(dth) * dr, z: floors[0].cz + Math.cos(dth) * dr, y: floors[0].y0 };
    // 盖子转轴：后沿
    this.pivot = new THREE.Vector3(c.cx, c.cut + c.slope * rr, c.cz - rr * 0.85);
    const Bc = ring(Math.max(c.floor + 0.3, ceil - 0.12), floors[0].cx, floors[0].cz); this.shellR = Math.max(...floors.map(f => f.Ravg), [...Bc].reduce((a, b) => a + b, 0) / NB) * 1.1; this.lidLift = Math.max(0.8, (h - c.cut) * 0.34 + this.shellR * 0.16) * (K && K.lift || 1); this.lidBack = this.lidLift * 0.7 * (K && K.back || 1); this.panelDrop = c.panel ? (h - c.py) + 0.5 : 0;
    this.emis = this.mats.filter(m => m.userData.src);
    this.state = 'opening'; this.u = 0; this.wait = 0; this.active = true; this.lotId = lot ? lot.id : -1; this.chars.clear(); this.assign = new Map(); this.firstInfo = true; this.behind = 0; this.away = [0, -1]; this.who = []; this.whoKey = '';
    this.tris = 0; root.traverse(o => { if (o.isMesh) this.tris += (o.geometry.attributes.position.count / 3) * (o.parent === lid && o.geometry === bg ? 1 : 1); });
    this.buildMs = performance.now() - t0; this.applyLid(0);
    return true;
  }
  close(onDone) { if (!this.state || this.state === 'closing') return; this.state = 'closing'; this.onDone = onDone; }
  dispose() {
    if (this.root) { this.scene.remove(this.root); this.root = null; }
    for (const g of this.geos || []) g.dispose(); for (const m of this.mats || []) m.dispose(); this.geos = []; this.mats = [];
    this.chars.clear(); this.hide.clear(); this.active = false; this.state = null; LAMPU.uLampC.value.setRGB(0, 0, 0); LAMPU.uLampP.value.set(0, -999, 0);
  }
  ease(u) { return u < 0 ? 0 : u > 1 ? 1 : 1 - Math.pow(1 - u, 3); }
  applyLid(e) {
    const p = this.pivot, tilt = -0.3 * e; _M.makeTranslation(p.x, p.y, p.z).multiply(_M2.makeRotationX(tilt)).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
    // 镜头绕到侧面/背后时：盖子往远离镜头的一侧挪、再抬高一点，不挡视线（behind 0 = 正面，1 = 正背面）
    const b = this.behind || 0, ax = this.away ? this.away[0] : 0, az = this.away ? this.away[1] : -1, far = this.lidBack * 1.5 + this.shellR * 0.5 * b;
    const hx = lerp(0, ax * far, Math.min(1, b * 2.2)), hz = lerp(-this.lidBack, az * far, Math.min(1, b * 2.2)), up = this.lidLift + b * (this.shellR * 0.9 + this.lidLift * 0.6);
    this.lid.matrixAutoUpdate = false; this.lid.matrix.copy(_M); this.lid.matrix.premultiply(_M2.makeTranslation(hx * e, up * e, hz * e)); this.lid.matrixWorldNeedsUpdate = true;
    this.panel.position.set(0, -this.panelDrop * e, this.panelDrop * 0.08 * e); this.panel.visible = e < 0.995;
  }
  // 镜头：从门这一侧斜上方看进去，整栋房子（含抬起的盖子）放进屏幕上方 3/4（下面留给头像条）
  view(camera) {
    const c = this.c, src = this.src; const yaw = src.yaw; const pol = c.panel ? 1.1 : !src.tmpl ? 0.72 : (src.h > 6.5 ? 0.98 : this.shellR < 2.4 ? 0.74 : 0.86); const azi = yaw + (CUTK[this.base] && CUTK[this.base].azi || (c.panel ? 0.42 : 0.18));
    const top = c.cut + this.lidLift + (src.h - c.cut) * 0.75; const r = c.panel ? Math.max(this.shellR * 1.25, src.r * 1.02) : this.shellR;
    const loc = [[r, 0, 0], [-r, 0, 0], [0, 0, r], [0, 0, -r], [0, top, -r * 0.4], [r * 0.7, top * 0.8, 0], [-r * 0.7, top * 0.8, 0], [0, c.floor, r]];
    const W = loc.map(([x, y, z]) => new THREE.Vector3(src.x + x * Math.cos(yaw) + z * Math.sin(yaw), (src.y || 0) + y, src.z - x * Math.sin(yaw) + z * Math.cos(yaw)));
    const fc = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.5, 2000); let tx = src.x, tz = src.z, ty = (src.y || 0) + (c.floor + c.cut) * 0.45; let d = 20;
    for (let it = 0; it < 3; it++) {
      const place = (dd) => { fc.position.set(tx + Math.sin(pol) * Math.sin(azi) * dd, ty + Math.cos(pol) * dd, tz + Math.sin(pol) * Math.cos(azi) * dd); fc.lookAt(tx, ty, tz); fc.updateMatrixWorld(); };
      const bounds = () => { let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (const p of W) { _V.copy(p).project(fc); x0 = Math.min(x0, _V.x); x1 = Math.max(x1, _V.x); y0 = Math.min(y0, _V.y); y1 = Math.max(y1, _V.y); } return { x0, x1, y0, y1 }; };
      let lo = 2, hi = 200; for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; place(mid); const b = bounds(); if (b.x0 > -0.94 && b.x1 < 0.94 && b.y0 > -0.52 && b.y1 < 0.8) hi = mid; else lo = mid; }
      d = hi; place(d); const b = bounds(); const ox = (b.x0 + b.x1) / 2, oy = (b.y0 + b.y1) / 2 - 0.14;
      const halfH = d * Math.tan(camera.fov * PI / 360), halfW = halfH * camera.aspect; _V.set(1, 0, 0).applyQuaternion(fc.quaternion); _U.set(0, 1, 0).applyQuaternion(fc.quaternion);
      tx += _V.x * ox * halfW * 0.9 + _U.x * oy * halfH * 0.9; ty += _U.y * oy * halfH * 0.9; tz += _V.z * ox * halfW * 0.9 + _U.z * oy * halfH * 0.9;
    }
    return { pos: new THREE.Vector3(tx + Math.sin(pol) * Math.sin(azi) * d, ty + Math.cos(pol) * d, tz + Math.sin(pol) * Math.cos(azi) * d), target: new THREE.Vector3(tx, ty, tz) };
  }
  // 屏幕上这栋房子大概在哪（点空白处出屋用）
  screenHit(camera, sx, sy) { if (!this.src) return false; const s = this.src; _V.set(s.x, (s.y || 0) + (this.c.floor + this.c.cut) * 0.5, s.z).project(camera); const cx = (_V.x * 0.5 + 0.5) * innerWidth, cy = (-_V.y * 0.5 + 0.5) * innerHeight;
    _A.set(s.x + s.r, (s.y || 0) + (this.c.floor + this.c.cut) * 0.5, s.z).project(camera); const rr = Math.max(60, Math.hypot((_A.x - _V.x) * 0.5 * innerWidth, (_A.y - _V.y) * 0.5 * innerHeight) * 1.25); return Math.hypot(sx - cx, sy - cy) < rr; }
  // ---------------------------------------------------------------- 每帧：盖子动画、暖灯、屋里的居民
  update(dt, t, info, nightK) {
    if (!this.state) return;
    if (this.state === 'opening') { if ((this.wait = (this.wait || 0) + dt) < 0.32) dt = 0; this.u = Math.min(1, this.u + dt / OPEN_T); if (this.u >= 1) this.state = 'open'; }
    else if (this.state === 'closing') { this.u = Math.max(0, this.u - dt / (OPEN_T * 0.85)); if (this.u <= 0) { const cb = this.onDone; this.dispose(); if (cb) cb(); return; } }
    if (this.camera) { // 镜头在房子本地坐标里的方位（门朝 +z）：算盖子该往哪边让
      this.root.updateMatrixWorld(); _V.copy(this.camera.position).applyMatrix4(_M.copy(this.root.matrixWorld).invert()); const L = Math.hypot(_V.x, _V.z) || 1;
      const k = Math.min(1, dt * 4); const tb = clamp((-_V.z / L + 0.15) / 1.15, 0, 1); this.behind = (this.behind || 0) + (tb - (this.behind || 0)) * k;
      const w = this.away || (this.away = [0, -1]); w[0] += (-_V.x / L - w[0]) * k; w[1] += (-_V.z / L - w[1]) * k; const wl = Math.hypot(w[0], w[1]) || 1; w[0] /= wl; w[1] /= wl; }
    const e = this.state === 'closing' ? 1 - Math.pow(1 - this.u, 2) : this.easeBack(this.u); this.applyLid(e);
    for (const m of this.emis) { const s = m.userData.src; m.emissiveIntensity = s.emissiveIntensity; }
    // 暖灯：白天淡淡的，夜里明显
    this.root.updateMatrixWorld(); LAMPU.uLampP.value.copy(this.lampL).applyMatrix4(this.root.matrixWorld); LAMPU.uLampR.value = this.lampR;
    const k = (0.32 + 1.5 * nightK) * clamp(this.u * 1.6, 0, 1); LAMPU.uLampC.value.setRGB(1.0 * k, 0.72 * k, 0.4 * k);
    this.updateChars(dt, t, info);
  }
  easeBack(u) { if (u >= 1) return 1; const x = u - 1; return 1 + 2.2 * x * x * x + 1.2 * x * x; }
  // 此刻在这栋房子里的人：模拟 info 里 in === 这块地
  present(info) { if (!info || this.lotId < 0) return []; return info.res.filter(r => r.in === this.lotId && !r.away); }
  poseOf(r) { const j = r.job; if (j === 'sleep' || j === 'nap') return 'bed'; if (j === 'eat' || j === 'shop') return this.type === 'bath' ? 'tub' : 'seat'; if (j === 'tend') return 'counter'; if (j === 'wander') return 'seat'; return 'stand'; }
  takeSpot(kind, id) {
    const order = { bed: ['bed', 'stand'], seat: ['seat', 'tub', 'stand'], tub: ['tub', 'seat', 'stand'], counter: ['counter', 'stand'], stand: ['stand', 'seat'] }[kind] || ['stand'];
    for (const k of order) { const L = this.spots[k] || []; const p = L.find(p => !p.used); if (p) { p.used = id; return { p, kind: k, want: kind }; } }
    return { p: this.spots.stand[0] || { k: 'stand', x: this.doorIn.x, y: this.doorIn.y, z: this.doorIn.z, yaw: 0 }, kind: 'stand', want: kind };
  }
  pathTo(c, p) { // 走到位置；二楼要先走到梯子脚下再爬上去
    const L = []; const up = this.ladder && p.y > this.ladder.y0 + 0.8, onUp = this.ladder && c.ly > this.ladder.y0 + 0.8;
    if (this.ladder && up !== onUp) { const a = this.ladder; if (onUp) { L.push({ x: a.x, y: a.y1, z: a.z - 0.55 }, { x: a.x, y: a.y1, z: a.z + 0.05 }, { x: a.x, y: a.y0, z: a.z + 0.3 }); } else { L.push({ x: a.x, y: a.y0, z: a.z + 0.3 }, { x: a.x, y: a.y1, z: a.z + 0.05 }, { x: a.x, y: a.y1, z: a.z - 0.55 }); } }
    L.push({ x: p.x, y: p.k === 'bed' || p.k === 'seat' || p.k === 'tub' ? (up ? this.ladder.y1 : (this.floors[0].y0)) : p.y, z: p.z, last: true }); return L;
  }
  updateChars(dt, t, info) {
    const pres = this.present(info); const ids = new Set(pres.map(r => r.id));
    // 新来的 / 换了动作的：分配位置
    for (const r of pres) {
      const want = this.poseOf(r); let a = this.assign.get(r.id);
      if (a && a.want !== want) { a.p.used = 0; a = null; }
      if (!a) { a = this.takeSpot(want, r.id); this.assign.set(r.id, a);
        let c = this.chars.get(r.id);
        if (!c) { c = makeAnimState(r.id, r.sp); c.fade = 0; this.chars.set(r.id, c);
          if (this.firstInfo || this.state === 'opening') { c.lx = a.p.x; c.ly = a.p.y; c.lz = a.p.z; c.lyaw = a.p.yaw; c.path = []; c.fade = 1; }
          else { c.lx = this.doorIn.x; c.ly = this.doorIn.y; c.lz = this.doorIn.z; c.lyaw = Math.atan2(this.floors[0].cx - c.lx, this.floors[0].cz - c.lz); c.path = this.pathTo(c, a.p); } }
        else c.path = this.pathTo(c, a.p);
        c.leaving = false; }
      const c = this.chars.get(r.id); c.want = a.kind; c.spot = a.p; c.rjob = r.job;
    }
    // 离开的：走回门口，淡出
    for (const [id, c] of this.chars) if (!ids.has(id) && !c.leaving) { const a = this.assign.get(id); if (a) a.p.used = 0; this.assign.delete(id); c.leaving = true; c.path = this.pathTo(c, { k: 'stand', x: this.doorIn.x, y: this.doorIn.y, z: this.doorIn.z }); }
    this.firstInfo = false;
    // 移动 + 姿势
    const X = this.src.x, Z = this.src.z, Y = this.src.y || 0, yaw = this.src.yaw, cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (const [id, c] of this.chars) {
      let moving = 0;
      if (c.path.length) { const q = c.path[0]; const dx = q.x - c.lx, dy = q.y - c.ly, dz = q.z - c.lz; const L = Math.hypot(dx, dy, dz); const climb = Math.abs(dy) > Math.hypot(dx, dz) * 1.5;
        const sp = (climb ? 0.9 : 1.15) * dt; if (L <= sp) { c.lx = q.x; c.ly = q.y; c.lz = q.z; c.path.shift(); } else { c.lx += dx / L * sp; c.ly += dy / L * sp; c.lz += dz / L * sp; moving = 1; if (!climb && Math.hypot(dx, dz) > 0.02) c.lyaw = lerpAng(c.lyaw, Math.atan2(dx, dz), Math.min(1, dt * 8)); } }
      c.pitch = c.pitch || 0;
      if (!c.path.length && !c.leaving && c.spot) { const p = c.spot; const k = Math.min(1, dt * 6);
        c.ly += (p.y - c.ly) * k; c.lx += (p.x - c.lx) * k; c.lz += (p.z - c.lz) * k;
        if (c.want === 'bed') { c.lyaw = lerpAng(c.lyaw, p.yaw, k); c.pitch += (-PI / 2 - c.pitch) * k; c.act = 6; }
        else { const fy = p.face ? Math.atan2(p.face[0] - c.lx, p.face[1] - c.lz) : p.yaw; c.lyaw = lerpAng(c.lyaw, fy + (c.want === 'stand' ? Math.sin(t * 0.3 + id) * 0.5 : 0), k * 0.6); c.pitch += (0 - c.pitch) * k;
          c.act = (c.rjob === 'eat' || c.rjob === 'shop') ? 5 : (c.rjob === 'sleep' || c.rjob === 'nap') ? 6 : 0; }
      } else { c.pitch += (0 - c.pitch) * Math.min(1, dt * 6); c.act = moving ? 1 : 0; }
      c.flags = c.act === 5 ? 4 : 0; c.spd = moving ? 1.6 : 0;
      if (c.leaving && !c.path.length) { c.fade -= dt * 2.5; if (c.fade <= 0) { this.chars.delete(id); continue; } } else c.fade = Math.min(1, c.fade + dt * 3);
      c.vis = ISC * c.fade * clamp(this.u * 2 - 0.4, 0, 1); c.hidden = false;
      c.x = X + c.lx * cy + c.lz * sy; c.z = Z - c.lx * sy + c.lz * cy; c.y = Y + c.ly; c.yaw = c.lyaw + yaw;
      if (c.want === 'bed' && !c.path.length && !c.leaving) { c.y += 0.18 * ISC; } // 平躺时身子的厚度
    }
    this.hide = ids;
    const key = pres.map(r => r.id).join(','); if (key !== this.whoKey) { this.whoKey = key; this.who = pres.map(r => ({ id: r.id, name: r.name, sp: r.sp, doing: r.doing })); this.whoDirty = true; }
  }
}
function minBins(list) { const B = new Float32Array(NB); for (let i = 0; i < NB; i++) B[i] = Math.min(...list.map(b => b[i])); return B; }
const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
// 预热：开局空闲时把剖面/家具材质的着色器先编译好，第一次进屋不卡
export function warmInterior(renderer, camera, scene, sampleMats) {
  const S = new THREE.Scene(); const g = new THREE.BoxGeometry(0.01, 0.01, 0.01); const aIn = new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1); g.setAttribute('aIn', aIn);
  const gc = g.clone(); gc.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  const U = { uCutA: { value: new THREE.Vector4() }, uCutB: { value: new THREE.Vector4() }, uCutC: { value: new THREE.Vector4() }, uCutD: { value: new THREE.Vector4() }, uInner: { value: new THREE.Color() } };
  const mats = []; const FMt = furnMats();
  for (const m of [FMt.matte, FMt.metal, FMt.glow, FMt.floor]) S.add(Object.assign(new THREE.Mesh(gc, m), { receiveShadow: true }));
  for (const [src, vc] of sampleMats) for (const piece of [0, 1]) { const m = cutMat(src, vc, piece, U); mats.push(m); const me = new THREE.Mesh(vc ? gc : g, m); me.receiveShadow = true; S.add(me); }
  const bm = intMat(new THREE.MeshStandardMaterial({ color: '#ffffff' }), 'b'); mats.push(bm); S.add(new THREE.Mesh(g, bm));
  S.position.set(0, -500, 0);
  const done = () => { for (const m of mats) m.dispose(); g.dispose(); gc.dispose(); };
  try { if (renderer.compileAsync) return renderer.compileAsync(S, camera, scene).then(done, done); renderer.compile(S, camera, scene); } catch (e) { console.warn('warm', e); }
  done(); return Promise.resolve();
}
