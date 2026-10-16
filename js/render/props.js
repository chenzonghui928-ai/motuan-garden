// 场景/渲染·Lenia 的旧物：没有房子模板的旧物（饼干盒、毛线球、纽扣、玩具车……）、组合惊喜、桥、花园里的花、放置模式的悬浮旧物和地面绿/红提示
// 全部程序化建模：每种造型按材质分几层（普通 / 金属 / 玻璃 / 发光），每层一个 InstancedMesh（顶点色 × 共用花纹贴图 × 实例色）
// 花纹（饼干盒的小花、线轴的彩绘、火柴盒标签、吐司机的番茄……）画在一张程序生成的 canvas 贴图集里，每件旧物一格；配色对照 assets/ui/item-*.png
// 改造：门和台阶（进度 30%）→ 窗和灯（62%）→ 按用途的装饰（烟囱、遮阳棚、秋千架、水井顶……，95%）；改造中略发灰
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M, PI, TAU, clamp, lerp, ctex } from '../lib/core.js';
import { groundH } from '../lib/environment.js';
import { WORLD_R } from '../shared/layout.js';
import { ITEMS, COMBOS, SEEDS, TEMPLATE_KINDS, ITEM_K, signName } from '../shared/items.js';

const _cw = new THREE.Color('#5a5048'); // 未完工的窗灯：不亮
const _m3 = new THREE.Matrix4(), _m4 = new THREE.Matrix4();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color(), _c2 = new THREE.Color();
// ---------------------------------------------------------------- 花纹贴图集：每件旧物一格 256×256，最后一格纯白（没有花纹的零件都指向它）
const CELL = 256, ACOLS = 8, AROWS = 4, AW = CELL * ACOLS, AH = CELL * AROWS;
const CELLS = ['cookietin', 'yarn', 'toycar', 'spool', 'pencil', 'matchbox', 'thimble', 'oldbook', 'kettle', 'flowerpot', 'toaster', 'reno', 'umbrella', 'kite', 'strawhat', 'knit', 'hotbottle'];
const WU = (AW - CELL / 2) / AW, WV = (CELL / 2) / AH;
const cellOf = (k) => { const i = CELLS.indexOf(k); return [(i % ACOLS) * CELL, Math.floor(i / ACOLS) * CELL]; };
let _cell = null, _uv = null, _layer = 'main';
const inCell = (k, fn) => (...a) => { const o = _cell; _cell = cellOf(k); try { return fn(...a); } finally { _cell = o; } };
const U = (rect, fn) => { const o = _uv; _uv = rect; try { return fn(); } finally { _uv = o; } };      // rect = 本格内 [x, y, w, h]
const Ly = (layer, fn) => { const o = _layer; _layer = layer; try { return fn(); } finally { _layer = o; } }; // main / metal / glass / glow
// ---------------------------------------------------------------- 几何小工具（都带顶点色、贴图坐标和材质层）
function tint(g, col) {
  g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(col); const n = g.attributes.position.count;
  const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  const uv = new Float32Array(n * 2); const src = g.attributes.uv;
  if (_uv && _cell && src) { const [x0, y0, w0, h0] = _uv, ox = _cell[0], oy = _cell[1]; const x = x0 + 3, y = y0 + 3, w = w0 - 6, h = h0 - 6; /* 内缩 3 像素，防止贴图缩小时串到隔壁格 */ for (let i = 0; i < n; i++) { uv[i * 2] = (ox + x + clamp(src.getX(i), 0, 1) * w) / AW; uv[i * 2 + 1] = 1 - (oy + y + (1 - clamp(src.getY(i), 0, 1)) * h) / AH; } }
  else for (let i = 0; i < n; i++) { uv[i * 2] = WU; uv[i * 2 + 1] = WV; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.userData.layer = _layer; return g;
}
function mergeOne(list) { const g = new THREE.BufferGeometry(); for (const [k, n] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2]]) { const arrs = list.map(x => x.attributes[k].array); const tot = arrs.reduce((a, b) => a + b.length, 0); const out = new Float32Array(tot); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } g.setAttribute(k, new THREE.BufferAttribute(out, n)); } g.computeBoundingSphere(); return g; }
function mergeL(list) { const by = {}; for (const g of list.flat(9)) (by[g.userData.layer || 'main'] ||= []).push(g); const out = {}; for (const L in by) out[L] = mergeOne(by[L]); return out; }
const T = (geo, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { const g = geo.clone(); g.applyMatrix4(_m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz))); return tint(g, col); };
const cyl = (a, b, h, n = 20, open = false) => new THREE.CylinderGeometry(a, b, h, n, 1, open);
const sph = (r, w = 18, h = 12, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const rbox = (x, y, z, r = 0.06, s = 3) => new RoundedBoxGeometry(x, y, z, s, Math.min(r, x / 2 - 1e-3, y / 2 - 1e-3, z / 2 - 1e-3));
const tor = (r, t, a = TAU, n = 28, rs = 8) => new THREE.TorusGeometry(r, t, rs, n, a);
const cone = (r, h, n = 16) => new THREE.ConeGeometry(r, h, n);
const lathe = (pts, n = 40) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), n);
const disc = (r, n = 40) => new THREE.CircleGeometry(r, n).rotateX(-PI / 2); // 朝上的圆片（贴图上方朝 -z）
const plane = (w, h) => new THREE.PlaneGeometry(w, h);                       // 朝 +z 的贴花片
const tube = (pts, r, n = 24, rs = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))), n, r, rs, false);
const xf = (list, x = 0, y = 0, z = 0, ry = 0, s = 1) => list.flat(9).map(g => { const c = g.clone(); c.applyMatrix4(_m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(s, s, s))); c.userData.layer = g.userData.layer; return c; });
const xfr = (list, x, y, z, rx, ry, rz, s = 1) => list.flat(9).map(g => { const c = g.clone(); c.applyMatrix4(_m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(s, s, s))); c.userData.layer = g.userData.layer; return c; });
// 把朝 +z 的零件贴到半径 r 的圆柱面上（角度 a，0 = 正前方）
const onRing = (list, a, r, y) => xf(list, Math.sin(a) * r, y, Math.cos(a) * r, a);
// 按顶点位置重新上色（贝壳的粉白渐变、南瓜的深浅沟）
const paint = (g, f) => { const p = g.attributes.position, c = g.attributes.color; for (let i = 0; i < p.count; i++) { _c.set(f(p.getX(i), p.getY(i), p.getZ(i))); c.setXYZ(i, _c.r, _c.g, _c.b); } return g; };
// 参数曲面：fn(u, v) → [x, y, z]，u、v 都是 0～1（贴图坐标也是 u、v）
function surf(fn, nu, nv) { const pos = [], uv = [], idx = []; for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const q = fn(i / nu, j / nv); pos.push(q[0], q[1], q[2]); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g; }

// ---------------------------------------------------------------- 花纹（每格 256×256 的本地坐标）
// 在柱面上画圆形图案时横向要压扁：kx = 贴图横向像素/单位 ÷ 纵向像素/单位
function blob(g, x, y, kx, fn) { g.save(); g.translate(x, y); g.scale(kx, 1); fn(); g.restore(); }
function daisy(g, r, petal = '#fffaf0', mid = '#f2c23a', n = 8) { g.fillStyle = petal; for (let i = 0; i < n; i++) { const a = i / n * TAU; g.beginPath(); g.ellipse(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.42, r * 0.2, a, 0, TAU); g.fill(); } g.fillStyle = mid; g.beginPath(); g.arc(0, 0, r * 0.3, 0, TAU); g.fill(); }
function leafS(g, a, l, col = '#5f9a4c') { g.fillStyle = col; g.beginPath(); g.ellipse(Math.cos(a) * l * 0.5, Math.sin(a) * l * 0.5, l * 0.5, l * 0.2, a, 0, TAU); g.fill(); }
function noise(g, x, y, w, h, n, col, r0 = 0.6, r1 = 1.8) { g.fillStyle = col; for (let i = 0; i < n; i++) { g.beginPath(); g.arc(x + Math.random() * w, y + Math.random() * h, r0 + Math.random() * (r1 - r0), 0, TAU); g.fill(); } }
const TEX = {
  cookietin(g) { // 侧面 [0,0,256,96]、盒盖侧 [0,96,256,32]、盒盖顶 [0,128,128,128]
    g.fillStyle = '#2f63b5'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#e0bd62'; g.fillRect(0, 0, 256, 6); g.fillRect(0, 90, 256, 6); g.fillStyle = '#f3e6c4'; g.fillRect(0, 9, 256, 2); g.fillRect(0, 85, 256, 2);
    for (let i = 0; i < 10; i++) { const x = 12.8 + i * 25.6, y = 48 + (i % 2 ? 6 : -6); blob(g, x, y, 0.34, () => { leafS(g, 0.5, 30); leafS(g, PI - 0.5, 28); leafS(g, PI / 2 + 0.3, 22); daisy(g, 17); g.save(); g.translate(26, -20); daisy(g, 8, '#dfe9ff', '#f2c23a', 6); g.restore(); }); }
    g.fillStyle = '#2f63b5'; g.fillRect(0, 96, 256, 32); g.fillStyle = '#e0bd62'; g.fillRect(0, 96, 256, 3); g.fillRect(0, 110, 256, 3); g.fillRect(0, 125, 256, 3);
    g.fillStyle = '#2f63b5'; g.fillRect(0, 128, 128, 128); g.strokeStyle = '#e0bd62'; g.lineWidth = 4; g.beginPath(); g.arc(64, 192, 58, 0, TAU); g.stroke(); g.lineWidth = 1.5; g.beginPath(); g.arc(64, 192, 52, 0, TAU); g.stroke();
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; g.save(); g.translate(64 + Math.cos(a) * 36, 192 + Math.sin(a) * 36); leafS(g, a + 1.2, 13); daisy(g, 8.5); g.restore(); }
    g.save(); g.translate(64, 192); daisy(g, 15, '#fffaf0', '#f2c23a', 10); g.restore();
  },
  yarn(g) { // 球面 [0,0,256,128]
    g.fillStyle = '#d63f35'; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 70; i++) { const y = Math.random() * 128; g.strokeStyle = i % 3 ? 'rgba(255,140,120,.55)' : 'rgba(140,25,20,.5)'; g.lineWidth = 1.6 + Math.random() * 1.6; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + (Math.random() - 0.5) * 30, 170, y + (Math.random() - 0.5) * 30, 256, y); g.stroke(); }
  },
  toycar(g) { // 车身 [0,0,128,128]、车头格栅 [128,0,128,128]
    g.fillStyle = '#d8352c'; g.fillRect(0, 0, 128, 128); noise(g, 0, 0, 128, 128, 6, 'rgba(245,225,200,.7)', 0.8, 1.6); noise(g, 0, 0, 128, 128, 14, 'rgba(150,30,20,.12)', 6, 14);
    g.fillStyle = '#efe2c2'; g.fillRect(128, 0, 128, 128); g.fillStyle = '#7a5a3a'; for (let i = 0; i < 7; i++) g.fillRect(140 + i * 15.5, 18, 7, 92); g.strokeStyle = '#c9a46a'; g.lineWidth = 8; g.strokeRect(132, 4, 120, 120);
  },
  spool(g) { // 线轴端面彩绘 [0,0,128,128]、蓝线 [128,0,128,128]
    g.fillStyle = '#dcae6c'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(150,100,50,.35)'; g.lineWidth = 1.5; for (let r = 20; r < 64; r += 6) { g.beginPath(); g.arc(64, 64, r, 0, TAU); g.stroke(); }
    g.strokeStyle = '#5f9a4c'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 42, 0, TAU); g.stroke();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.save(); g.translate(64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42); if (i % 2) { leafS(g, a + 1.4, 16); leafS(g, a - 1.7, 14); } else daisy(g, 10, '#d9443a', '#f2c23a', 5); g.restore(); }
    g.fillStyle = '#6a4424'; g.beginPath(); g.arc(64, 64, 15, 0, TAU); g.fill(); g.fillStyle = '#c99a5e'; g.beginPath(); g.arc(64, 64, 19, 0, TAU); g.arc(64, 64, 15, 0, TAU, true); g.fill();
    g.fillStyle = '#3b6fc6'; g.fillRect(128, 0, 128, 128); for (let y = 0; y < 128; y += 2.5) { g.fillStyle = (y / 2.5) % 2 ? 'rgba(20,40,110,.35)' : 'rgba(150,190,255,.35)'; g.fillRect(128, y, 128, 1.2); }
  },
  pencil(g) { // 六棱笔杆 [0,0,256,64]（横向绕一圈 = 六个面）
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#f4c33f' : '#fbd65a'; g.fillRect(i * 256 / 6, 0, 256 / 6, 64); g.fillStyle = 'rgba(150,90,10,.35)'; g.fillRect(i * 256 / 6, 0, 2, 64); }
    g.fillStyle = '#2f6b3a'; g.font = 'bold 12px sans-serif'; g.save(); g.translate(256 / 12 * 3, 32); g.rotate(PI / 2); g.textAlign = 'center'; g.fillText('HB  LENIA', 0, 4); g.restore();
  },
  matchbox(g) { // 盒顶标签 [0,0,256,160]、侧面擦皮 [0,160,128,64]、抽屉 [128,160,128,64]
    g.fillStyle = '#c8413a'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#f6ead0'; g.beginPath(); g.roundRect(26, 22, 204, 116, 22); g.fill(); g.strokeStyle = '#e0bd62'; g.lineWidth = 3; g.beginPath(); g.roundRect(18, 14, 220, 132, 26); g.stroke();
    for (const [x, y, a] of [[34, 30, 0.6], [222, 30, 2.5], [34, 130, -0.6], [222, 130, -2.5]]) { g.save(); g.translate(x, y); leafS(g, a, 22, '#4f8f3e'); leafS(g, a + 0.7, 16, '#6aa84f'); g.fillStyle = '#e9564b'; g.beginPath(); g.arc(Math.cos(a) * 6, Math.sin(a) * 6, 6, 0, TAU); g.fill(); g.restore(); }
    g.save(); g.translate(128, 80); g.fillStyle = '#b5532c'; g.fillRect(-4, -6, 8, 46); g.fillStyle = '#d9443a'; g.beginPath(); g.ellipse(0, -14, 10, 13, 0, 0, TAU); g.fill(); g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(0, -48); g.quadraticCurveTo(18, -30, 0, -26); g.quadraticCurveTo(-18, -30, 0, -48); g.fill(); g.restore();
    g.fillStyle = '#6e4a32'; g.fillRect(0, 160, 128, 64); noise(g, 0, 160, 128, 64, 260, 'rgba(30,15,5,.4)', 0.5, 1.4);
    g.fillStyle = '#efe0bf'; g.fillRect(128, 160, 128, 64); g.fillStyle = 'rgba(160,120,70,.25)'; for (let x = 128; x < 256; x += 9) g.fillRect(x, 160, 1, 64);
  },
  thimble(g) { // 车床面 [0,0,256,256]：纵向按轮廓点序号，下面一圈红色小花带，上面是顶针小坑
    g.fillStyle = '#d9b263'; g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 15; row++) for (let i = 0; i < 26; i++) { const x = i * 9.85 + (row % 2 ? 4.9 : 0), y = 6 + row * 10.5; g.fillStyle = 'rgba(110,80,30,.55)'; g.beginPath(); g.ellipse(x, y, 2.2, 3.4, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,240,190,.5)'; g.beginPath(); g.ellipse(x - 0.8, y - 1.2, 0.9, 1.2, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#2e6b3c'; g.fillRect(0, 176, 256, 46); g.fillStyle = '#f3e3b0'; g.fillRect(0, 174, 256, 3); g.fillRect(0, 221, 256, 3);
    for (let i = 0; i < 9; i++) blob(g, 14 + i * 28.4, 199, 0.32, () => { leafS(g, 0.2, 26, '#8cc06a'); leafS(g, PI - 0.2, 26, '#8cc06a'); daisy(g, 15, '#e0453c', '#f6d36b', 6); });
  },
  oldbook(g) { // 封面 [0,0,128,128]、书页 [128,0,128,64]、书脊 [128,64,128,64]
    g.fillStyle = '#4f7f46'; g.fillRect(0, 0, 128, 128); noise(g, 0, 0, 128, 128, 300, 'rgba(30,60,25,.25)', 0.4, 1.2); g.strokeStyle = '#d9b75c'; g.lineWidth = 2.5; g.strokeRect(10, 10, 108, 108); g.lineWidth = 1; g.strokeRect(15, 15, 98, 98);
    g.save(); g.translate(64, 60); g.fillStyle = '#d9b75c'; leafS(g, -PI / 2 + 0.4, 34, '#d9b75c'); leafS(g, -PI / 2 - 0.4, 30, '#d9b75c'); g.fillRect(-1, -4, 2, 30); g.restore(); g.fillStyle = '#d9b75c'; g.fillRect(36, 96, 56, 4);
    g.fillStyle = '#f4ead2'; g.fillRect(128, 0, 128, 64); for (let y = 2; y < 64; y += 2.2) { g.fillStyle = 'rgba(150,120,80,.3)'; g.fillRect(128, y, 128, 0.8); }
    g.fillStyle = '#3f6c38'; g.fillRect(128, 64, 128, 64); g.fillStyle = '#d9b75c'; for (const x of [140, 150, 230, 240]) g.fillRect(x, 64, 3, 64);
  },
  kettle(g) { // 壶身 [0,0,256,128]（下沿深蓝一圈、磕掉漆的白点）、壶盖 [0,128,128,128]
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#3a73c9'); gr.addColorStop(0.75, '#2b5fb2'); gr.addColorStop(1, '#1f3f7a'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#1b2f5c'; g.fillRect(0, 112, 256, 16);
    for (const [x, y, r] of [[40, 60, 5], [150, 40, 7], [205, 82, 4], [90, 95, 3.5], [230, 30, 3]]) { g.fillStyle = '#f2efe6'; g.beginPath(); g.ellipse(x, y, r * 0.5, r, 0.3, 0, TAU); g.fill(); g.fillStyle = '#3a3a3a'; g.beginPath(); g.ellipse(x, y, r * 0.22, r * 0.45, 0.3, 0, TAU); g.fill(); }
    g.fillStyle = '#2f66bd'; g.fillRect(0, 128, 128, 128); g.fillStyle = '#1b2f5c'; g.fillRect(0, 128, 128, 10);
  },
  flowerpot(g) { // 车床面 [0,0,256,128]：最上面几行是盆内壁（深色），盆沿有白霜和青苔
    g.fillStyle = '#c8693e'; g.fillRect(0, 0, 256, 128); noise(g, 0, 0, 256, 128, 120, 'rgba(150,70,30,.25)', 2, 7); noise(g, 0, 0, 256, 128, 80, 'rgba(240,170,120,.25)', 1, 4);
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(245,240,225,.45)'; g.beginPath(); g.ellipse(Math.random() * 256, 40 + Math.random() * 70, 6 + Math.random() * 12, 3 + Math.random() * 6, 0, 0, TAU); g.fill(); }
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(95,140,70,.5)'; g.beginPath(); g.arc(Math.random() * 256, 26 + Math.random() * 18, 1.5 + Math.random() * 3.5, 0, TAU); g.fill(); }
    g.fillStyle = '#6a3a22'; g.fillRect(0, 0, 256, 22);
  },
  toaster(g) { // 侧面贴花 [0,0,256,192]：奶油色、番茄藤、底下一条绿边
    g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, 256, 192); g.fillStyle = '#5f8f48'; g.fillRect(0, 166, 256, 26); g.fillStyle = '#e8dcbc'; g.fillRect(0, 160, 256, 6);
    g.strokeStyle = '#4f8a3c'; g.lineWidth = 4; g.beginPath(); g.moveTo(10, 110); g.bezierCurveTo(70, 40, 150, 150, 246, 70); g.stroke();
    for (const [x, y, a] of [[40, 80, -0.8], [96, 98, 0.9], [150, 96, -0.6], [205, 80, 0.7], [70, 120, 2.4], [180, 120, 2.2]]) { g.save(); g.translate(x, y); leafS(g, a, 30, '#5f9a4c'); g.restore(); }
    for (const [x, y, r] of [[70, 92, 17], [118, 112, 20], [176, 104, 16], [92, 132, 12], [214, 92, 12]]) { g.fillStyle = '#e0392f'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.16, -0.6, 0, TAU); g.fill(); g.fillStyle = '#3f7a34'; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU - PI / 2; g.beginPath(); g.ellipse(x + Math.cos(a) * 4, y - r + 3 + Math.sin(a) * 3, 4.5, 1.8, a, 0, TAU); g.fill(); } }
    g.fillStyle = '#5f9a4c'; g.fillRect(0, 0, 256, 6);
  },
  umbrella(g) { // 伞面 [0,0,256,128]：红白相间的 16 瓣纸伞（横向绕一圈 16 条），带一点纸纤维和折痕
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f5e8cc' : '#e4584a'; g.fillRect(i * 16, 0, 16, 128); g.fillStyle = 'rgba(120,50,30,.22)'; g.fillRect(i * 16, 0, 1.5, 128); }
    noise(g, 0, 0, 256, 128, 500, 'rgba(255,255,255,.18)', 0.4, 1.3); noise(g, 0, 0, 256, 128, 300, 'rgba(120,60,30,.12)', 0.4, 1.2);
  },
  kite(g) { // 燕子风筝 [0,0,256,256]：贴图坐标就是风筝外形（0～1）
    g.fillStyle = '#2f63b5'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#f6ead0'; g.beginPath(); g.ellipse(128, 150, 34, 70, 0, 0, TAU); g.fill();
    g.fillStyle = '#e0453c'; for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(128, 105 + k * 26, 20, 7, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#ffd23f'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 70, 120, 34, 14, s * 0.35, 0, TAU); g.fill(); g.fillStyle = '#e0453c'; g.beginPath(); g.arc(128 + s * 70, 120, 8, 0, TAU); g.fill(); g.fillStyle = '#ffd23f'; }
    g.fillStyle = '#1b1b1b'; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 14, 62, 6, 0, TAU); g.fill(); } g.fillStyle = '#ffffff'; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 14 + 2, 60, 2, 0, TAU); g.fill(); }
    g.strokeStyle = '#1d3d78'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 30); g.lineTo(128, 240); g.stroke();
  },
  strawhat(g) { // 草帽 [0,0,256,128]：一圈圈编草
    g.fillStyle = '#ecc983'; g.fillRect(0, 0, 256, 128);
    for (let y = 0; y < 128; y += 8) { g.fillStyle = 'rgba(140,95,40,.6)'; g.fillRect(0, y, 256, 2); g.fillStyle = 'rgba(255,244,200,.55)'; g.fillRect(0, y + 2, 256, 2); for (let x = (y / 8) % 2 ? 0 : 5; x < 256; x += 10) { g.fillStyle = 'rgba(170,120,50,.5)'; g.fillRect(x, y + 4, 4, 4); } }
    noise(g, 0, 0, 256, 128, 120, 'rgba(150,100,40,.18)', 0.5, 1.5);
  },
  knit(g) { // 毛线：手套 [0,0,128,256] 红底白雪花；毛线帽 [128,0,128,256] 绿白条纹
    const vrow = (x0, w, y, col) => { g.fillStyle = col; for (let x = x0; x < x0 + w; x += 8) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y + 7); g.lineTo(x + 8, y); g.lineTo(x + 8, y + 3); g.lineTo(x + 4, y + 10); g.lineTo(x, y + 3); g.fill(); } };
    g.fillStyle = '#c8322b'; g.fillRect(0, 0, 128, 256); for (let y = 0; y < 256; y += 8) vrow(0, 128, y, 'rgba(255,120,110,.35)');
    g.fillStyle = '#f6efe2'; g.fillRect(0, 100, 128, 40); for (let y = 100; y < 140; y += 8) vrow(0, 128, y, 'rgba(200,190,170,.4)');
    g.strokeStyle = '#c8322b'; g.lineWidth = 3; for (const x of [32, 96]) { g.beginPath(); for (let k = 0; k < 3; k++) { const a = k * PI / 3; g.moveTo(x - Math.cos(a) * 13, 120 - Math.sin(a) * 13); g.lineTo(x + Math.cos(a) * 13, 120 + Math.sin(a) * 13); } g.stroke(); }
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4efe4' : '#3f8a4a'; g.fillRect(128, i * 32, 128, 32); for (let y = i * 32; y < i * 32 + 32; y += 8) vrow(128, 128, y, i % 2 ? 'rgba(200,190,170,.4)' : 'rgba(120,200,120,.35)'); }
  },
  hotbottle(g) { // 暖水袋毛衣 [0,0,256,128]：红绿格子；橡胶 [0,128,128,128]：红色细横纹
    g.fillStyle = '#c63b32'; g.fillRect(0, 0, 256, 128);
    for (let x = 0; x < 256; x += 32) { g.fillStyle = 'rgba(40,90,50,.55)'; g.fillRect(x + 10, 0, 12, 128); g.fillStyle = 'rgba(255,230,160,.6)'; g.fillRect(x + 27, 0, 2, 128); }
    for (let y = 0; y < 128; y += 32) { g.fillStyle = 'rgba(40,90,50,.45)'; g.fillRect(0, y + 10, 256, 12); g.fillStyle = 'rgba(255,230,160,.55)'; g.fillRect(0, y + 27, 256, 2); }
    g.fillStyle = '#d6402f'; g.fillRect(0, 128, 128, 128); for (let y = 128; y < 256; y += 6) { g.fillStyle = 'rgba(120,20,15,.35)'; g.fillRect(0, y, 128, 2); }
  },
  reno(g) { // 改造用：条纹遮阳棚 [0,0,128,64]、木门 [128,0,64,96]
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff4e2' : '#d9473b'; g.fillRect(i * 16, 0, 16, 64); }
    g.fillStyle = '#b0703c'; g.fillRect(128, 0, 64, 96); for (let x = 128; x < 192; x += 13) { g.fillStyle = 'rgba(90,50,20,.45)'; g.fillRect(x, 0, 2, 96); } noise(g, 128, 0, 64, 96, 50, 'rgba(90,50,20,.2)', 1, 3);
  },
};
let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  ATLAS = ctex(AW, AH, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, AW, AH); for (const k of CELLS) { const [x, y] = cellOf(k); g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, CELL, CELL); g.clip(); TEX[k](g); g.restore(); } });
  ATLAS.wrapS = ATLAS.wrapT = THREE.ClampToEdgeWrapping; ATLAS.needsUpdate = true; return ATLAS;
}

// ---------------------------------------------------------------- 改造零件（单位尺寸，朝 +z，底在 y=0）
const WOOD_D = '#6b4426', WOOD = '#b0703c', WARM = '#ffe39a';
const doorP = inCell('reno', (s = 0.4, col) => { const w = s * 0.62, rr = w / 2, hb = s - rr; const L = [
  T(box(w + 0.06 * s * 2.5, hb, 0.05), WOOD_D, 0, hb / 2, -0.02), T(cyl(rr + 0.06 * s * 1.25, rr + 0.06 * s * 1.25, 0.05, 20), WOOD_D, 0, hb, -0.02, PI / 2),
  ...U([128, 0, 64, 96], () => [T(box(w, hb, 0.04), col || '#ffffff', 0, hb / 2, 0.01)]), T(cyl(rr, rr, 0.04, 20), col || WOOD, 0, hb, 0.01, PI / 2),
  T(sph(s * 0.035, 8, 6), '#e2bf62', w * 0.3, hb * 0.55, 0.05), T(cyl(w * 0.2, w * 0.2, 0.02, 14), WARM, 0, hb + rr * 0.15, 0.035, PI / 2), T(tor(w * 0.2, s * 0.012, TAU, 16, 4), WOOD_D, 0, hb + rr * 0.15, 0.045),
  T(box(w * 1.6, s * 0.06, s * 0.32), '#d9c9a8', 0, s * 0.03, s * 0.18), T(box(w * 1.2, s * 0.05, s * 0.24), '#cbb894', 0, s * 0.025, s * 0.44)]; return L; });
const stepsP = (w, y, d = 0.12) => { const n = Math.max(1, Math.ceil(y / 0.07)); const L = []; for (let i = 0; i < n; i++) { const h = y * (n - i) / n; L.push(T(box(w, h, d), i % 2 ? '#c9a070' : '#b98d5c', 0, h / 2, i * d + d / 2)); } return L; };
const winP = (s = 0.14, box_ = true) => [T(tor(s, s * 0.17, TAU, 22, 6), WOOD_D, 0, 0, 0.01), T(cyl(s, s, 0.02, 20), WARM, 0, 0, 0, PI / 2), T(box(s * 2, s * 0.12, 0.03), WOOD_D, 0, 0, 0.02), T(box(s * 0.12, s * 2, 0.03), WOOD_D, 0, 0, 0.02),
  ...(box_ ? [T(box(s * 1.7, s * 0.25, s * 0.5), '#c8693e', 0, -s * 1.2, s * 0.2), ...[0, 1, 2, 3].map(k => T(sph(s * 0.16, 8, 6), ['#ff6f91', '#ffd23f', '#ffffff', '#ff9a3c'][k], -s * 0.6 + k * s * 0.4, -s * 1.0, s * 0.22)), T(sph(s * 0.5, 8, 6), '#5fa14c', 0, -s * 1.05, s * 0.18, 0, 0, 0, 1.6, 0.4, 0.5)] : [])];
const lanternP = (s = 0.12) => [T(box(s * 0.12, s * 0.12, s * 0.6), '#3a2a1a', 0, s * 0.55, -s * 0.3), T(cyl(s * 0.05, s * 0.32, s * 0.22, 4), '#3a2a1a', 0, s * 0.42, 0, 0, PI / 4), ...Ly('glow', () => [T(box(s * 0.32, s * 0.4, s * 0.32), '#ffd27a', 0, 0.12 * s, 0)]), T(box(s * 0.38, s * 0.06, s * 0.38), '#3a2a1a', 0, -0.1 * s, 0)];
const potP = (s = 0.14, fc = '#ff6f91') => [T(cyl(s * 0.5, s * 0.36, s * 0.7, 12), '#c8693e', 0, s * 0.35, 0), T(tor(s * 0.48, s * 0.07, TAU, 14, 4), '#d47a4c', 0, s * 0.7, 0, PI / 2), T(sph(s * 0.5, 10, 8), '#4f9f3a', 0, s * 0.9, 0, 0, 0, 0, 1, 0.75, 1), ...[0, 1, 2, 3, 4].map(k => T(sph(s * 0.13, 8, 6), fc, Math.cos(k * 1.26) * s * 0.34, s * 1.15, Math.sin(k * 1.26) * s * 0.34))];
const chimP = (h = 0.4, r = 0.07) => Ly('metal', () => [T(cyl(r, r, h, 10), '#7a7672', 0, h / 2, 0), T(cyl(r * 1.6, r * 1.15, h * 0.18, 10), '#6d6a68', 0, h, 0)]);
const awnP = inCell('reno', (w = 0.6, d = 0.25) => [...U([0, 0, 128, 64], () => [T(box(w, 0.015, d), '#ffffff', 0, 0, d / 2, 0.45)]), ...Array.from({ length: Math.round(w / 0.06) }, (_, i) => T(sph(0.032, 8, 4, 0, TAU, 0, PI / 2), i % 2 ? '#fff4e2' : '#d9473b', -w / 2 + 0.03 + i * 0.06, -Math.sin(0.45) * d - 0.005, Math.cos(0.45) * d, PI)), T(cyl(0.008, 0.008, 0.2, 4), WOOD_D, -w / 2, -0.1, d * 0.85), T(cyl(0.008, 0.008, 0.2, 4), WOOD_D, w / 2, -0.1, d * 0.85)]);
const stoolP = (s = 0.12, col = '#e8433a') => [T(cyl(s * 0.18, s * 0.24, s * 0.7, 8), '#f3e6c8', 0, s * 0.35, 0), T(sph(s * 0.5, 12, 6, 0, TAU, 0, PI / 2), col, 0, s * 0.68, 0, 0, 0, 0, 1, 0.55, 1), ...[0, 1, 2].map(k => T(sph(s * 0.08, 6, 4), '#ffffff', Math.cos(k * 2.1) * s * 0.28, s * 0.86, Math.sin(k * 2.1) * s * 0.28))];
const crateP = (s = 0.2) => [T(rbox(s, s * 0.8, s, s * 0.05, 2), '#c99a5e', 0, s * 0.4, 0), ...[-1, 1].map(k => T(box(s * 1.02, s * 0.08, s * 1.02), '#9a6a3a', 0, s * 0.4 + k * s * 0.22, 0))];
const sackP = (s = 0.18) => [T(sph(s * 0.5, 10, 8), '#d9c08a', 0, s * 0.42, 0, 0, 0, 0, 1, 0.95, 0.9), T(cyl(s * 0.12, s * 0.2, s * 0.25, 8), '#d9c08a', 0, s * 0.86, 0), T(tor(s * 0.15, s * 0.03, TAU, 10, 4), '#9a7a4a', 0, s * 0.8, 0, PI / 2)];
const postsRoofP = (w, h, d, roof = '#c8613a') => [...[-1, 1].map(k => T(cyl(0.03, 0.035, h, 6), WOOD_D, k * w / 2, h / 2, 0)), T(box(w + 0.1, 0.04, 0.04), WOOD_D, 0, h, 0), ...[-1, 1].map(k => T(box(w + 0.2, 0.025, d * 0.62), roof, 0, h + d * 0.18, k * d * 0.24, k * 0.65))];

// ---------------------------------------------------------------- 旧物原样（单位尺寸：占地半径约 1，门朝 +z）——形状、配色对照 assets/ui/item-*.png
const PARTS = {
  cookietin: inCell('cookietin', () => [ // 蓝色铁皮饼干盒：侧面白色雏菊、金边，盒盖一圈花环
    ...U([0, 0, 256, 96], () => [T(cyl(1, 1, 0.8, 48, true), '#ffffff', 0, 0.44)]), T(disc(0.99, 40), '#2f63b5', 0, 0.05),
    ...U([0, 96, 256, 32], () => [T(cyl(1.045, 1.045, 0.2, 48, true), '#ffffff', 0, 0.94)]), ...U([0, 128, 128, 128], () => [T(disc(1.045, 48), '#ffffff', 0, 1.04)]),
    ...Ly('metal', () => [T(tor(1.0, 0.035, TAU, 48, 6), '#e2bf62', 0, 0.05, 0, PI / 2), T(tor(1.045, 0.03, TAU, 48, 6), '#e2bf62', 0, 0.845, 0, PI / 2), T(tor(1.04, 0.03, TAU, 48, 6), '#e2bf62', 0, 1.04, 0, PI / 2)])]),
  yarn: inCell('yarn', () => [ // 红毛线球：绕着的线一圈圈，线头拖在地上
    ...U([0, 0, 256, 128], () => [T(sph(0.9, 28, 18), '#ffffff', 0, 0.9)]),
    ...[[0, 0.2, 0], [0.9, 0.5, 0.3], [1.7, -0.4, 0.8], [2.4, 0.9, -0.5], [0.4, 1.4, 1.2], [2.9, 0.2, 1.6], [1.2, 2.2, 0.4], [2.0, 1.1, 2.6]].map(([a, b, c], k) => T(tor(0.885, 0.035, TAU, 44, 5), k % 2 ? '#c53a30' : '#e85a4e', 0, 0.9, 0, a, b, c)),
    T(tube([[0.62, 0.45, 0.55], [0.95, 0.06, 0.8], [1.35, 0.04, 0.6], [1.5, 0.04, 0.15], [1.25, 0.04, -0.15], [1.05, 0.04, 0.1]], 0.045, 30, 5), '#d9443a')]),
  button: () => [ // 大红纽扣：鼓起的边、凹下去的中间、四个孔里穿着米色线
    T(lathe([[0.001, 0.12], [0.55, 0.12], [0.78, 0.17], [0.9, 0.27], [0.99, 0.24], [1.0, 0.12], [0.97, 0.02], [0.001, 0.0]].reverse(), 48), '#d23b33'),
    T(tor(0.9, 0.05, TAU, 48, 6), '#e86258', 0, 0.27, 0, PI / 2),
    ...[[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].flatMap(([x, z]) => [T(cyl(0.12, 0.12, 0.03, 14), '#5e1a16', x, 0.125, z), T(tor(0.12, 0.025, TAU, 14, 4), '#b02c25', x, 0.13, z, PI / 2)]),
    T(box(0.62, 0.035, 0.05), '#f1e3c2', 0, 0.15, 0, 0, PI / 4), T(box(0.62, 0.035, 0.05), '#f1e3c2', 0, 0.155, 0, 0, -PI / 4)],
  toycar: inCell('toycar', () => [ // 红色小汽车（敞篷）：木轮黑胎、奶油色格栅、棕色座椅，车身横着，侧面朝 +z
    ...U([0, 0, 128, 128], () => [T(rbox(1.9, 0.5, 1.0, 0.16), '#ffffff', 0, 0.52, 0), T(rbox(0.85, 0.3, 0.98, 0.12), '#ffffff', 0.5, 0.86, 0), T(rbox(0.5, 0.32, 0.96, 0.12), '#ffffff', -0.72, 0.84, 0)]),
    T(rbox(0.5, 0.06, 0.72, 0.03), '#5a3a24', -0.18, 0.8, 0), T(rbox(0.16, 0.42, 0.72, 0.07), '#7a4a2a', -0.42, 0.98, 0, 0, 0, 0.2), T(rbox(0.36, 0.1, 0.72, 0.04), '#8a5530', -0.2, 0.83, 0),
    T(tor(0.13, 0.025, TAU, 16, 4), '#2b2624', 0.12, 1.08, 0, 0, PI / 2, -0.5), T(cyl(0.02, 0.02, 0.25, 5), '#2b2624', 0.2, 0.96, 0, 0, 0, -0.5),
    ...U([128, 0, 128, 128], () => [T(plane(0.62, 0.36), '#ffffff', 0.951, 0.56, 0, 0, PI / 2)]),
    ...Ly('metal', () => [...[-0.32, 0.32].map(z => T(sph(0.09, 12, 8), '#f4f1e6', 0.94, 0.8, z)), T(rbox(0.12, 0.08, 1.04, 0.03), '#d9d9d9', 1.0, 0.32, 0), T(rbox(0.1, 0.08, 1.04, 0.03), '#d9d9d9', -0.98, 0.32, 0)]),
    ...[[-0.6, 0.5], [0.6, 0.5], [-0.6, -0.5], [0.6, -0.5]].flatMap(([x, z]) => [T(tor(0.22, 0.09, TAU, 22, 8), '#2b2624', x, 0.31, z), T(cyl(0.17, 0.17, 0.12, 18), '#c9965a', x, 0.31, z, PI / 2), T(cyl(0.06, 0.06, 0.16, 10), '#7a4a2a', x, 0.31, z, PI / 2)])]),
  spool: inCell('spool', () => [ // 木线轴：端面画着红花绿叶，缠着蓝线，线头垂到地上
    T(cyl(0.95, 0.95, 0.16, 32, true), '#c99a5e', 0, 0.08), T(cyl(0.95, 0.95, 0.16, 32, true), '#c99a5e', 0, 1.42),
    ...U([0, 0, 128, 128], () => [T(disc(0.95, 32), '#ffffff', 0, 1.5), T(disc(0.95, 32), '#ffffff', 0, 0.161)]), T(disc(0.95, 32), '#b88a50', 0, 1.339, 0, PI),
    ...U([128, 0, 128, 128], () => [T(lathe([[0.6, 0.16], [0.66, 0.3], [0.68, 0.75], [0.66, 1.2], [0.6, 1.34]], 36), '#ffffff')]),
    T(tor(0.96, 0.025, TAU, 36, 4), '#a8783e', 0, 0.16, 0, PI / 2), T(tor(0.96, 0.025, TAU, 36, 4), '#a8783e', 0, 1.34, 0, PI / 2),
    T(tube([[0.66, 0.9, 0.2], [0.85, 0.7, 0.55], [0.9, 0.3, 0.75], [1.05, 0.03, 0.95], [1.35, 0.03, 0.8]], 0.025, 24, 4), '#3b6fc6')]),
  pencil: inCell('pencil', () => [ // 黄色六棱铅笔：木头笔尖、石墨芯、银色金属箍、粉橡皮；横躺着，笔尖朝 +x
    ...U([0, 0, 256, 64], () => [T(cyl(0.26, 0.26, 1.5, 6, true), '#ffffff', -0.1, 0.25, 0, 0, 0, PI / 2)]),
    T(cone(0.26, 0.44, 6), '#efcfa0', 0.87, 0.25, 0, 0, 0, -PI / 2), T(cone(0.085, 0.14, 6), '#3a3a3a', 1.03, 0.25, 0, 0, 0, -PI / 2),
    ...Ly('metal', () => [T(cyl(0.275, 0.275, 0.2, 14), '#cfd2d6', -0.95, 0.25, 0, 0, 0, PI / 2), ...[-0.89, -0.95, -1.01].map(x => T(tor(0.275, 0.018, TAU, 16, 4), '#a9adb3', x, 0.25, 0, 0, PI / 2, 0))]),
    T(cyl(0.255, 0.255, 0.16, 14), '#f29aa8', -1.13, 0.25, 0, 0, 0, PI / 2), T(sph(0.255, 14, 8, 0, TAU, 0, PI / 2), '#f29aa8', -1.21, 0.25, 0, 0, 0, PI / 2, 1, 0.35, 1)]),
  rubberduck: () => [ // 小黄鸭：翘尾巴、小翅膀、橙色扁嘴、黑眼睛带小高光
    T(sph(0.85, 26, 16), '#ffd23f', 0, 0.6, -0.08, 0, 0, 0, 1, 0.68, 1.15), T(sph(0.55, 18, 12), '#ffd23f', 0, 0.62, 0.42, 0, 0, 0, 1, 0.8, 1),
    T(cone(0.32, 0.6, 14), '#ffc928', 0, 0.98, -0.95, -1.0, 0, 0), ...[-1, 1].map(k => T(sph(0.36, 14, 10), '#ffdf6a', k * 0.72, 0.72, -0.1, 0.3, 0, k * 0.35, 0.35, 0.75, 1.0)),
    T(sph(0.47, 22, 14), '#ffd23f', 0, 1.36, 0.42), T(sph(0.08, 8, 6), '#ffc928', 0, 1.82, 0.36, 0.4, 0, 0, 1, 2.2, 0.6),
    T(sph(0.2, 14, 8), '#f08a24', 0, 1.3, 0.9, 0, 0, 0, 1.1, 0.32, 1.25), T(sph(0.18, 14, 8), '#e2751a', 0, 1.22, 0.86, 0, 0, 0, 1.0, 0.25, 1.1),
    ...[-1, 1].flatMap(k => [T(sph(0.075, 10, 8), '#2a2320', k * 0.2, 1.46, 0.8), T(sph(0.025, 6, 4), '#ffffff', k * 0.2 + 0.02, 1.49, 0.865), T(sph(0.09, 8, 6), '#ffb07a', k * 0.3, 1.3, 0.72, 0, 0, 0, 1, 0.6, 0.4)])],
  matchbox: inCell('matchbox', () => [ // 火柴盒：外壳顶上红底米色标签、两侧棕色擦皮，抽屉往前拉开一截
    ...U([0, 0, 256, 160], () => [T(box(1.7, 0.04, 1.2), '#ffffff', 0, 0.6, 0, 0, PI / 2)]), T(box(1.2, 0.04, 1.7), '#e9d3a6', 0, 0.02, 0),
    ...U([0, 160, 128, 64], () => [-1, 1].map(k => T(box(0.04, 0.6, 1.7), '#ffffff', k * 0.58, 0.31, 0))),
    ...U([128, 160, 128, 64], () => [T(box(1.08, 0.5, 0.04), '#ffffff', 0, 0.28, 1.27), T(box(1.08, 0.04, 0.6), '#ffffff', 0, 0.06, 1.0), ...[-1, 1].map(k => T(box(0.04, 0.5, 0.6), '#ffffff', k * 0.52, 0.28, 1.0))]),
    T(box(1.0, 0.03, 0.55), '#d7c094', 0, 0.09, 1.0), T(box(0.14, 0.03, 0.02), '#b08a5a', 0, 0.44, 1.3)]),
  thimble: inCell('thimble', () => [ // 黄铜顶针：满身小坑，下沿一圈绿底红花
    ...Ly('metal', () => U([0, 0, 256, 256], () => [T(lathe([[0.8, 0.0], [0.82, 0.08], [0.8, 0.2], [0.78, 0.34], [0.74, 0.62], [0.7, 0.9], [0.64, 1.14], [0.52, 1.3], [0.3, 1.38], [0.001, 1.4]], 40), '#ffffff')])),
    ...Ly('metal', () => [T(tor(0.8, 0.045, TAU, 40, 6), '#c9a24e', 0, 0.02, 0, PI / 2), T(disc(0.79, 32), '#7a5e2a', 0, 0.01, 0, PI)])]),
  glassjar: () => [ // 空玻璃罐：方圆肩、厚底、瓶口螺纹（和图标一样没有盖子）
    ...Ly('glass', () => [T(lathe([[0.001, 0.0], [0.7, 0.0], [0.8, 0.07], [0.83, 0.3], [0.83, 1.12], [0.76, 1.34], [0.52, 1.46], [0.5, 1.62], [0.53, 1.66], [0.53, 1.74], [0.48, 1.76]], 40), '#dff4f0'), T(cyl(0.72, 0.74, 0.12, 32), '#c4e8e2', 0, 0.06), ...[1.6, 1.68].map(y => T(tor(0.52, 0.02, TAU, 32, 4), '#d4efea', 0, y, 0, PI / 2))]),
  ],
  oldbook: inCell('oldbook', () => [ // 绿色布面精装童话书：烫金框、书页、红丝带书签
    ...U([0, 0, 128, 128], () => [T(rbox(1.62, 0.06, 1.26, 0.025), '#ffffff', 0.02, 0.42, 0), T(rbox(1.62, 0.06, 1.26, 0.025), '#ffffff', 0.02, 0.03, 0)]),
    ...U([128, 0, 128, 64], () => [T(box(1.5, 0.33, 1.16), '#ffffff', 0.06, 0.225, 0)]),
    ...U([128, 64, 128, 64], () => [T(new THREE.CylinderGeometry(0.22, 0.22, 1.26, 16, 1, true, 0, PI), '#ffffff', -0.77, 0.225, 0, PI / 2, 0, PI / 2)]),
    T(box(0.08, 0.012, 0.5), '#d23b33', 0.4, 0.46, 0.75, 0, 0.25, 0), T(box(0.08, 0.3, 0.012), '#d23b33', 0.45, 0.3, 1.0, 0, 0.25, 0)]),
  kettle: inCell('kettle', () => [ // 蓝色搪瓷水壶：深蓝下沿、磕掉漆的白点、木头提手、壶嘴朝 +x
    ...U([0, 0, 256, 128], () => [T(lathe([[0.86, 0.0], [0.97, 0.06], [1.0, 0.22], [1.0, 0.56], [0.94, 0.8], [0.76, 0.98], [0.52, 1.06]], 44), '#ffffff')]), T(disc(0.86, 32), '#1b2f5c', 0, 0.002, 0, PI),
    ...U([0, 128, 128, 128], () => [T(lathe([[0.54, 1.04], [0.56, 1.1], [0.42, 1.24], [0.2, 1.3], [0.001, 1.31]], 32), '#ffffff')]), T(sph(0.11, 12, 8), '#9a6a3a', 0, 1.36, 0), T(cyl(0.035, 0.05, 0.1, 8), '#1b2f5c', 0, 1.3, 0),
    T(tube([[0.82, 0.38, 0], [1.08, 0.55, 0], [1.25, 0.86, 0], [1.42, 1.02, 0]], 0.13, 16, 10), '#2f66bd'), T(tor(0.08, 0.025, TAU, 12, 4), '#1b2f5c', 1.43, 1.03, 0, 0, PI / 2, -0.7),
    ...Ly('metal', () => [T(tube([[-0.6, 0.98, 0], [-0.58, 1.3, 0], [-0.45, 1.56, 0], [-0.25, 1.64, 0], [0.25, 1.64, 0], [0.45, 1.56, 0], [0.58, 1.3, 0], [0.6, 0.98, 0]], 0.025, 30, 5), '#8d9096'), ...[-1, 1].map(k => T(sph(0.05, 8, 6), '#6d7076', k * 0.6, 0.97, 0))]),
    T(cyl(0.075, 0.075, 0.5, 12), '#9a6a3a', 0, 1.65, 0, 0, 0, PI / 2)]),
  flowerpot: inCell('flowerpot', () => [ // 陶土花盆：盆沿一圈、白霜、青苔；空的（改成花坛才种花）
    ...U([0, 0, 256, 128], () => [T(lathe([[0.62, 0.0], [0.66, 0.04], [0.84, 0.8], [0.84, 0.84], [0.98, 0.86], [1.0, 0.9], [1.0, 1.06], [0.96, 1.1], [0.86, 1.08], [0.82, 0.98], [0.64, 0.24], [0.001, 0.24]], 40), '#ffffff')]),
    T(disc(0.62, 32), '#8a4a2a', 0, 0.001, 0, PI), T(cyl(0.08, 0.08, 0.02, 10), '#3a2010', 0, 0.25)]),
  toaster: inCell('toaster', () => [ // 奶油色吐司机：两侧番茄藤贴花、绿色底座、两个面包槽、侧面黄铜拨杆
    T(rbox(1.7, 1.15, 1.0, 0.2, 4), '#f4ecd8', 0, 0.72, 0), ...U([0, 0, 256, 192], () => [-1, 1].map(k => T(plane(1.36, 1.0), '#ffffff', 0, 0.7, k * 0.503, 0, k > 0 ? 0 : PI, 0))),
    T(rbox(1.86, 0.18, 1.12, 0.06), '#5f8f48', 0, 0.12, 0), ...[[-0.75, -0.42], [0.75, -0.42], [-0.75, 0.42], [0.75, 0.42]].map(([x, z]) => T(cyl(0.07, 0.08, 0.06, 10), '#3f6a30', x, 0.02, z)),
    ...[-0.24, 0.24].map(z => T(rbox(1.1, 0.04, 0.16, 0.02), '#3a2a1a', 0, 1.3, z)), ...Ly('metal', () => [...[-0.24, 0.24].map(z => T(tor(0.1, 0.02, TAU, 4, 4), '#d4d6da', 0, 1.3, z, PI / 2, 0, 0, 5.8, 1, 1)), T(rbox(0.12, 0.42, 0.1, 0.03), '#d1ac58', 0.88, 0.75, 0.2), T(sph(0.08, 10, 8), '#d1ac58', 0.97, 0.98, 0.2, 0, 0, 0, 1.3, 0.8, 1), T(rbox(0.06, 0.6, 0.06, 0.02), '#9aa0a8', 0.86, 0.72, 0.2)])]),
  // 组合里用到的简易版大件
  _teapot: () => [T(sph(1, 24, 16), '#3fb7b0', 0, 0.9, 0, 0, 0, 0, 1, 0.85, 1), T(cyl(0.5, 0.6, 0.25, 20), '#3fb7b0', 0, 1.7), T(sph(0.15, 10, 8), '#e2bf62', 0, 1.9), T(cyl(0.12, 0.22, 1.0, 10), '#3fb7b0', 0, 1.05, 1.05, -1.0), T(tor(0.5, 0.09, PI * 1.2, 16), '#3fb7b0', 0, 1.0, -0.95, 0, PI / 2, -0.3), ...[0, 1, 2, 3, 4].map(k => T(sph(0.1, 8, 6), '#ffffff', Math.sin(k * 1.3) * 0.98, 0.9 + (k % 2) * 0.2, Math.cos(k * 1.3) * 0.98))],
  _boot: () => [T(rbox(1.1, 1.9, 1.0, 0.3), '#d63a2d', 0, 1.0, -0.35), T(rbox(1.12, 0.78, 1.9, 0.32), '#d63a2d', 0, 0.42, 0.15), T(rbox(1.18, 0.2, 1.98, 0.08), '#4a2f20', 0, 0.1, 0.15), T(box(1.16, 0.22, 0.06), '#5d8f48', 0, 1.62, 0.16), T(cyl(0.5, 0.5, 0.06, 16), '#f6ecd6', 0, 1.96, -0.35)],
  _cup: () => [T(cyl(1, 0.75, 1.2, 28), '#fbf6ee', 0, 0.6), T(tor(0.4, 0.08, PI * 1.3, 16), '#fbf6ee', 1.05, 0.65, 0, 0, 0, -1.8), T(cyl(0.92, 0.92, 0.05, 28), '#9fd8e6', 0, 1.1), T(tor(1.0, 0.04, TAU, 40), '#d6b25c', 0, 1.18, 0, PI / 2), ...[0, 1, 2, 3, 4, 5].map(k => T(sph(0.12, 8, 6), '#f2a3b6', Math.sin(k * 1.05) * 0.9, 0.7, Math.cos(k * 1.05) * 0.9))],
};
// ---------------------------------------------------------------- 季节限定旧物（形状、配色写在注释里，Codex 补画图标时对照）
const along = (geo, col, p, dir, sx = 1, sy = sx, sz = sx) => { const g = geo.clone(); _q.setFromUnitVectors(_v.set(0, 1, 0), new THREE.Vector3(...dir).normalize()); g.applyMatrix4(_m.compose(new THREE.Vector3(...p), _q, _s.set(sx, sy, sz))); return tint(g, col); };
Object.assign(PARTS, {
  umbrella: inCell('umbrella', () => { // 鸡尾酒小纸伞：红白条的纸伞面撑开，十六根伞骨伸出伞沿一小截，细竹签当伞柄、下端削尖，伞顶一个小木帽
    const G16 = 16; const prof = (v) => ({ rr: 1.05 * Math.pow(v, 0.92), y: 1.72 - 0.5 * Math.pow(v, 1.35) });
    const can = (inner) => surf((u, v) => { const a = (inner ? u : 1 - u) * TAU; const ge = 0.5 + 0.5 * Math.cos(a * G16); const p = prof(v); const rr = p.rr * (1 + 0.028 * v * (1 - ge)); const y = p.y - 0.035 * v * (1 - ge) - (inner ? 0.025 : 0); return [Math.cos(a) * rr, y, Math.sin(a) * rr]; }, 96, 10);
    return [...U([0, 0, 256, 128], () => [T(can(false), '#ffffff'), T(can(true), '#ffffff')]),
      ...Array.from({ length: G16 }, (_, k) => { const a = (k + 0.5) / G16 * TAU; const p = prof(1); return T(cyl(0.012, 0.012, 0.2, 5), '#e6c58a', Math.cos(a) * (p.rr + 0.04), p.y - 0.07, Math.sin(a) * (p.rr + 0.04), Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }),
      ...Array.from({ length: 8 }, (_, k) => { const a = k / 8 * TAU + 0.2; const p = prof(0.58); return T(tube([[0, 1.3, 0], [Math.cos(a) * p.rr * 0.55, 1.36, Math.sin(a) * p.rr * 0.55], [Math.cos(a) * p.rr, p.y - 0.05, Math.sin(a) * p.rr]], 0.012, 10, 4), '#e6c58a'); }),
      T(cyl(0.032, 0.032, 1.95, 8), '#e9d0a0', 0, 0.9, 0), T(cone(0.032, 0.14, 8), '#e9d0a0', 0, -0.06, 0, PI), T(cyl(0.075, 0.075, 0.1, 10), '#e6c28a', 0, 1.3, 0), T(cyl(0.065, 0.065, 0.14, 10), '#e0b97a', 0, 1.78, 0), T(sph(0.065, 10, 8), '#e0b97a', 0, 1.86, 0)];
  }),
  kite: inCell('kite', () => { // 燕子风筝：蓝身子、米色肚子、黄翅膀红点；斜靠着一根小木棍，尾巴拖着三个蝴蝶结，旁边一卷风筝线
    const sh = new THREE.Shape([[0.5, 0.97], [0.62, 0.86], [0.66, 0.66], [0.82, 0.6], [1.0, 0.66], [0.94, 0.52], [0.66, 0.44], [0.6, 0.25], [0.66, 0.03], [0.5, 0.18], [0.34, 0.03], [0.4, 0.25], [0.34, 0.44], [0.06, 0.52], [0.0, 0.66], [0.18, 0.6], [0.34, 0.66], [0.38, 0.86]].map(([x, y]) => new THREE.Vector2(x, y)));
    const g0 = new THREE.ShapeGeometry(sh, 6); g0.translate(-0.5, -0.03, 0); const back = g0.clone(); back.scale(-1, 1, 1); back.translate(0, 0, -0.012);
    const L = -1.0, S = 1.9; const tip = (x, y) => [x * S, y * S * Math.cos(L) + 0.06, y * S * Math.sin(L) + 0.25];
    return [...U([0, 0, 256, 256], () => [T(g0, '#ffffff', 0, 0.06, 0.25, L, 0, 0, S)]), T(back, '#2a58a3', 0, 0.06, 0.25, L, 0, 0, S),
      T(tube([tip(0, 0.0), tip(0, 0.5), tip(0, 0.93)], 0.018, 6, 4), '#c99a5e'), T(tube([tip(-0.42, 0.6), tip(0, 0.66), tip(0.42, 0.6)], 0.016, 8, 4), '#c99a5e'),
      T(cyl(0.025, 0.03, 0.95, 5), '#8a5530', 0, 0.45, -0.55, 0.55, 0, 0),
      T(tube([[0, 0.05, 0.3], [0.35, 0.03, 0.62], [0.05, 0.03, 0.95], [0.4, 0.03, 1.25]], 0.012, 20, 3), '#f1e7d2'),
      ...[[0.3, 0.6, '#e0453c'], [0.08, 0.93, '#ffd23f'], [0.33, 1.2, '#5fa1d9']].flatMap(([x, z, c]) => [T(cone(0.07, 0.13, 6), c, x - 0.07, 0.05, z, 0, 0, PI / 2), T(cone(0.07, 0.13, 6), c, x + 0.07, 0.05, z, 0, 0, -PI / 2), T(sph(0.03, 6, 4), c, x, 0.05, z)]),
      T(cyl(0.16, 0.16, 0.2, 14), '#c99a5e', 0.85, 0.1, 0.35, PI / 2, 0, 0), T(cyl(0.12, 0.12, 0.22, 14), '#f1e7d2', 0.85, 0.1, 0.35, PI / 2, 0, 0), T(tube([[0.82, 0.18, 0.3], [0.5, 0.6, 0.0], [0.05, 0.98, -0.3]], 0.008, 12, 3), '#f1e7d2')];
  }),
  trowel: () => { // 小花铲：铁铲头斜插进一小堆土里，绿漆木柄，柄尾有个挂绳的小环
    const blade = (back) => surf((u, v) => { const w = 0.27 * (1 - Math.pow(v, 1.8)) + 0.02; const x = (u - 0.5) * 2 * w; return [back ? -x : x, -v * 0.62, -0.09 * (1 - Math.pow((u - 0.5) * 2, 2)) * (1 - v * 0.6) - (back ? 0.008 : 0)]; }, 10, 10);
    const tool = [...Ly('metal', () => [T(blade(false), '#b9bec4'), T(blade(true), '#9ea4ab'), T(cyl(0.03, 0.04, 0.22, 8), '#9ea4ab', 0, 0.11, -0.03)]),
      T(cyl(0.075, 0.065, 0.62, 12), '#3f8a4a', 0, 0.53, -0.03), T(sph(0.075, 12, 8), '#3f8a4a', 0, 0.84, -0.03), T(cyl(0.08, 0.08, 0.06, 12), '#e2bf62', 0, 0.24, -0.03), T(tor(0.06, 0.015, TAU, 12, 4), '#5a4030', 0, 0.94, -0.03, 0, PI / 2, 0)];
    return [T(sph(0.55, 16, 8, 0, TAU, 0, PI / 2), '#7a5434', 0, 0, 0, 0, 0, 0, 1, 0.45, 1), ...[0, 1, 2, 3].map(k => T(sph(0.09, 6, 4), '#6a4628', Math.cos(k * 1.7) * 0.45, 0.04, Math.sin(k * 1.7) * 0.45)), ...xfr(tool, 0.05, 0.42, 0.05, 0.45, 0.3, 0.25, 1.35)];
  },
  strawhat: inCell('strawhat', () => { // 草帽：宽帽檐微微下垂，红丝带在帽身绕一圈，后面打个蝴蝶结
    const top = [[0.001, 0.78], [0.22, 0.79], [0.4, 0.75], [0.47, 0.6], [0.5, 0.36], [0.54, 0.29], [0.78, 0.22], [0.98, 0.13], [1.03, 0.08]];
    return [...U([0, 0, 256, 128], () => [T(lathe(top, 48), '#ffffff')]), T(lathe(top.slice().reverse().map(([x, y]) => [x * 0.985, y - 0.025]), 48), '#c9a05c'),
      T(cyl(0.505, 0.51, 0.11, 40, true), '#6aa8a0', 0, 0.38, 0), ...[-1, 1].map(k => T(sph(0.11, 10, 8), '#6aa8a0', k * 0.13, 0.4, -0.52, 0, 0, 0, 1.2, 0.7, 0.45)), T(sph(0.05, 8, 6), '#4f8d85', 0, 0.4, -0.53),
      ...[-1, 1].map(k => T(box(0.07, 0.3, 0.02), '#6aa8a0', k * 0.07, 0.26, -0.56, 0.15, 0, k * 0.25))];
  }),
  popsicle: () => { // 冰棍棍：一把扁扁的小木棍摊成扇形，一头还留着橘子色和草莓色的印子，一根橡皮筋
    const L = []; const cols = ['#f39a3d', '#f07a8a', '#f39a3d', '#8fd0e6', '#f07a8a'];
    for (let k = 0; k < 5; k++) { const a = -0.55 + k * 0.27, y = 0.02 + k * 0.035; const g = [T(rbox(0.22, 0.032, 1.5, 0.1, 3), '#ecd29c', 0, 0, 0.5), T(rbox(0.225, 0.035, 0.45, 0.1, 3), cols[k], 0, 0.002, 1.0)]; L.push(...xf(g, -0.2, y, -0.55, a)); }
    L.push(...xf([T(rbox(0.22, 0.032, 1.5, 0.1, 3), '#e2c48a', 0, 0, 0), T(rbox(0.225, 0.035, 0.4, 0.1, 3), '#f39a3d', 0, 0.002, 0.55)], 0.55, 0.2, 0.2, 1.25));
    L.push(T(tor(0.13, 0.025, TAU, 14, 4), '#d9443a', -0.2, 0.12, -0.4, PI / 2, 0, 0, 1, 1, 0.6));
    return L;
  },
  shell: () => { // 扇贝壳：放射状的棱、边缘是一圈小波浪，外面淡粉、靠近壳顶发白；壳顶两只小耳朵
    const F = (u, v, lo) => { const th = (u - 0.5) * 2.6, r = v; const rib = 0.045 * r * Math.abs(Math.sin(th * 8)); const y = 0.55 * r * Math.pow(1 - r, 0.55) + 0.03 + rib - (lo ? 0.02 : 0); const rr = r * (1 + 0.035 * Math.abs(Math.sin(th * 8))) * 1.25; return [Math.sin(lo ? -th : th) * rr, y, Math.cos(th) * rr - 0.6]; };
    const top = paint(T(surf((u, v) => F(u, v, false), 40, 14), '#ffffff'), (x, y, z) => { const r = Math.hypot(x, z + 0.6) / 1.25; return _c.set('#fff3ec').lerp(new THREE.Color('#f2a7a0'), Math.min(1, r * 1.15)).getHex(); });
    return [top, T(surf((u, v) => F(u, v, true), 40, 10), '#f6e6dc'), ...[-1, 1].map(k => T(rbox(0.22, 0.06, 0.18, 0.03), '#f4d9cf', k * 0.17, 0.06, -0.62, 0, k * 0.4, 0))];
  },
  rake: () => { // 玩具小耙子：绿漆木柄（尾部鼓成一个小握把）斜躺在地上，绿漆铁皮耙头钉着两颗铆钉，六根弯弯的竹耙齿尖朝下碰着地
    const headS = new THREE.Shape([new THREE.Vector2(0, -0.075), new THREE.Vector2(0.3, -0.46), new THREE.Vector2(0.3, 0.46), new THREE.Vector2(0, 0.075)]); const head = new THREE.ExtrudeGeometry(headS, { depth: 0.07, bevelEnabled: false });
    const L = [T(tube([[0.5, 0.25, 0], [-0.5, 0.38, 0], [-1.35, 0.5, 0]], 0.075, 20, 6), '#d8b56a'), T(tube([[-0.95, 0.45, 0], [-1.4, 0.52, 0]], 0.115, 12, 8), '#6f9a52'), T(sph(0.115, 10, 8), '#6f9a52', -1.4, 0.52, 0), T(sph(0.12, 10, 8), '#6f9a52', -0.95, 0.45, 0),
      T(tube([[0.42, 0.26, 0], [0.62, 0.25, 0]], 0.09, 8, 8), '#6f9a52'), T(head, '#7ea65c', 0.55, 0.2, 0, -PI / 2, 0, 0), ...[-0.09, 0.09].map(z => T(sph(0.03, 6, 4), '#6a5a48', 0.76, 0.3, z * 2.2))];
    for (let k = 0; k < 6; k++) { const z = (k - 2.5) * 0.17; L.push(T(tube([[0.82, 0.24, z * 0.9], [1.06, 0.2, z * 1.1], [1.3, 0.1, z * 1.25], [1.42, 0.03, z * 1.3]], 0.04, 14, 5), '#e2bf72'), T(tor(0.042, 0.01, TAU, 8, 3), '#b8923e', 1.08, 0.2, z * 1.1, 0, PI / 2, 0)); }
    return L;
  },
  pumpkin: () => { // 大南瓜：十条圆圆的棱、顶上凹进去，弯弯的南瓜蒂，一根卷卷的藤和一片大叶子
    const g = new THREE.SphereGeometry(1, 56, 30); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x); const k = 0.5 + 0.5 * Math.cos(a * 10); const rr = 0.9 + 0.1 * Math.sqrt(k); let yy = y * 0.72; const h = Math.hypot(x, z); if (y > 0) yy -= 0.16 * Math.exp(-h * h / 0.06); if (y < 0) yy += 0.1 * Math.exp(-h * h / 0.05); p.setXYZ(i, x * rr, yy + 0.72, z * rr); }
    g.computeVertexNormals();
    const body = paint(T(g, '#ffffff'), (x, y, z) => { const a = Math.atan2(z, x); const k = 0.5 + 0.5 * Math.cos(a * 10); return _c.set('#c9561a').lerp(new THREE.Color('#f39032'), Math.pow(k, 0.7)).lerp(new THREE.Color('#d06a20'), Math.max(0, (y - 1.2) * 1.5)).getHex(); });
    const vine = []; for (let i = 0; i <= 24; i++) { const t = i / 24; vine.push([0.12 + Math.cos(t * 9) * 0.12 + t * 0.55, 1.25 + Math.sin(t * 9) * 0.1 - t * 0.35, Math.sin(t * 9) * 0.12 + t * 0.25]); }
    return [body, T(tube([[0, 1.18, 0], [0.02, 1.38, 0.02], [0.12, 1.52, 0.06], [0.24, 1.55, 0.1]], 0.085, 10, 8), '#6b5a2a'), T(sph(0.09, 8, 6), '#5a4a22', 0.25, 1.55, 0.1),
      T(tube(vine, 0.022, 40, 4), '#5f9a3c'), T(sph(0.42, 14, 8), '#4f9a3a', -0.45, 1.3, -0.25, 0.35, 0.6, 0.2, 1, 0.1, 0.75), T(cyl(0.01, 0.01, 0.6, 3), '#3d7a2c', -0.45, 1.33, -0.25, PI / 2 - 0.35, 0.6, 0)];
  },
  chestnut: () => { // 栗子壳：毛刺刺的壳裂开成碗，里面躺着三颗亮棕色的栗子（屁股是米白的）
    const L = [T(new THREE.SphereGeometry(0.62, 22, 12, 0, TAU, PI * 0.4, PI * 0.6), '#9a8a46', 0, 0.62, 0), T(new THREE.SphereGeometry(0.62, 22, 12, 0, TAU, PI * 0.4, PI * 0.6), '#d9c48e', 0, 0.62, 0, 0, 0, 0, -0.95, 0.95, 0.95)];
    for (let k = 0; k < 70; k++) { const a = k * 2.399, t = 0.42 + (k % 7) / 7 * 0.56; const th = t * PI; const d = [Math.sin(th) * Math.cos(a), Math.cos(th), Math.sin(th) * Math.sin(a)]; L.push(along(cone(0.028, 0.24, 4), k % 2 ? '#b8a45a' : '#8f7f3e', [d[0] * 0.66, 0.62 + d[1] * 0.66, d[2] * 0.66], d)); }
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.3; const x = Math.cos(a) * 0.24, z = Math.sin(a) * 0.24; L.push(T(sph(0.26, 16, 10), '#7a3f1e', x, 0.72, z, 0.2, -a, 0, 1.05, 0.82, 0.78), T(sph(0.17, 10, 6), '#ead7ad', x * 0.55, 0.62, z * 0.55, 0, -a, 0, 1, 0.4, 0.9), T(cone(0.04, 0.12, 6), '#c9b07a', x * 1.5, 0.9, z * 1.5, 0, 0, 0)); }
    return L;
  },
  mittens: inCell('knit', () => { // 毛线手套：一对红手套，手背织着白雪花，白色罗纹袖口，中间一根毛线连着
    const one = (side) => [...U([0, 0, 128, 256], () => [T(rbox(0.62, 0.2, 0.85, 0.09, 3), '#ffffff', 0, 0.1, 0)]), T(sph(0.31, 16, 10), '#c8322b', 0, 0.1, 0.42, 0, 0, 0, 1, 0.33, 0.62),
      T(sph(0.15, 12, 8), '#c8322b', side * 0.33, 0.1, 0.12, 0, side * 0.5, 0, 1, 0.55, 1.6), T(rbox(0.68, 0.24, 0.32, 0.08, 3), '#f4ede0', 0, 0.12, -0.55), ...[-0.24, -0.08, 0.08, 0.24].map(x => T(box(0.03, 0.245, 0.3), '#ddd2bd', x, 0.12, -0.55))];
    return [...xf(one(-1), -0.38, 0, -0.05, 0.25), ...xf(one(1), 0.42, 0.06, 0.12, -0.45), T(tube([[-0.5, 0.15, -0.6], [-0.1, 0.05, -0.95], [0.3, 0.06, -0.6], [0.6, 0.2, -0.3]], 0.025, 16, 4), '#c8322b')];
  }),
  beanie: inCell('knit', () => { // 毛线帽：绿白条纹，翻边是绿色罗纹，顶上一个毛茸茸的白绒球
    const pom = new THREE.IcosahedronGeometry(0.3, 3); const pp = pom.attributes.position; for (let i = 0; i < pp.count; i++) { const k = 1 + 0.12 * Math.sin(pp.getX(i) * 40 + pp.getY(i) * 31) * Math.cos(pp.getZ(i) * 37); pp.setXYZ(i, pp.getX(i) * k, pp.getY(i) * k, pp.getZ(i) * k); } pom.computeVertexNormals();
    return [...U([128, 0, 128, 256], () => [T(lathe([[0.84, 0.3], [0.82, 0.48], [0.74, 0.7], [0.58, 0.9], [0.32, 1.03], [0.001, 1.06]], 40), '#ffffff')]),
      T(lathe([[0.86, 0.0], [0.9, 0.06], [0.92, 0.2], [0.88, 0.33], [0.82, 0.34]], 40), '#3f8a4a'), ...Array.from({ length: 24 }, (_, k) => onRing([T(box(0.035, 0.3, 0.02), '#2f6f3a')], k / 24 * TAU, 0.915, 0.02)).flat(), T(pom, '#f4efe4', 0, 1.24, 0)];
  }),
  hotbottle: inCell('hotbottle', () => { // 暖水袋：扁扁的红橡胶袋，套着红绿格子小毛衣，袋口是一圈罗纹，上面拧着深红色塞子
    return [...U([0, 0, 256, 128], () => [T(rbox(1.0, 0.34, 1.35, 0.15, 4), '#ffffff', 0, 0.17, -0.12)]), T(rbox(0.86, 0.36, 0.18, 0.08, 3), '#f2e6c8', 0, 0.18, 0.56), ...[-0.3, -0.1, 0.1, 0.3].map(x => T(box(0.03, 0.365, 0.17), '#dccfae', x, 0.18, 0.56)),
      ...U([0, 128, 128, 128], () => [T(cyl(0.18, 0.24, 0.3, 16), '#ffffff', 0, 0.18, 0.8, PI / 2, 0, 0)]), T(cyl(0.2, 0.2, 0.12, 16), '#8a1f1a', 0, 0.18, 1.0, PI / 2, 0, 0), T(box(0.24, 0.07, 0.06), '#8a1f1a', 0, 0.18, 1.08),
      T(rbox(0.18, 0.02, 0.24, 0.02), '#f6ead0', 0.38, 0.35, -0.3, 0, 0.3, 0)];
  }),
  jinglebell: () => { // 圣诞铃铛：金色的圆铃铛，下面一道开口，顶上小环系着红丝带蝴蝶结和两片冬青叶、三颗红果
    const L = [...Ly('metal', () => [T(sph(0.55, 30, 20), '#e3b64c', 0, 0.56, 0), T(tor(0.11, 0.035, TAU, 14, 6), '#d6a63c', 0, 1.14, 0), T(cyl(0.6, 0.6, 0.05, 30), '#c99a34', 0, 0.56, 0, 0, 0, 0, 0.93, 1, 0.93)]),
      T(tor(0.553, 0.026, PI * 0.62, 20, 4), '#4a3210', 0, 0.56, 0, 0, PI / 2, PI * 1.19), ...[-1, 1].map(k => T(sph(0.06, 8, 6), '#3a2608', 0, 0.56 - Math.cos(0.95) * 0.53, k * Math.sin(0.95) * 0.53 * 0.98))];
    L.push(...[-1, 1].map(k => T(sph(0.16, 12, 8), '#d63a32', k * 0.17, 1.2, 0.05, 0, 0, k * 0.4, 1.2, 0.55, 0.5)), T(sph(0.07, 8, 6), '#b82c26', 0, 1.2, 0.08), ...[-1, 1].map(k => T(box(0.08, 0.32, 0.02), '#d63a32', k * 0.09, 1.02, 0.12, 0.2, 0, k * 0.3)));
    L.push(...[-1, 1].map(k => T(sph(0.3, 12, 6), '#2f6b3a', k * 0.3, 1.1, -0.12, 0.25, k * 0.5, k * 0.45, 1, 0.08, 0.42)), ...[0, 1, 2].map(k => T(sph(0.06, 8, 6), '#e0322b', -0.06 + k * 0.06, 1.24 + (k % 2) * 0.04, -0.06)));
    return L;
  },
});
const ITEM_MODEL = (k) => PARTS[k]();
// ---------------------------------------------------------------- 改造后：r1 门和台阶、r2 窗和灯、r3 按用途的装饰（键 = 设施/店种/用途，any = 通用）
const RENO = {
  cookietin: { r1: () => [...doorP(0.42), ...stepsP(0.3, 0.001)], r2: () => [...onRing(winP(0.13), -0.75, 1.0, 0.5), ...onRing(winP(0.13), 0.75, 1.0, 0.5), ...onRing(lanternP(0.14), 0.32, 1.02, 0.55)],
    r3: { bakery: () => [...xf(chimP(0.45, 0.07), -0.35, 1.04, -0.3), ...xf(awnP(0.55, 0.26), 0, 0.5, 1.02), ...xf(crateP(0.18), 0.62, 0, 0.95), ...xf(potP(0.14, '#ffd23f'), -0.55, 0, 1.0)],
      stage: () => [T(cyl(0.85, 0.85, 0.02, 32), '#c99a5e', 0, 1.06), ...[0, 1, 2, 3, 4, 5, 6, 7].map(k => T(box(0.12, 0.16, 0.01), ['#d9473b', '#ffd23f', '#5fa1d9', '#7cb85a'][k % 4], Math.sin(k / 8 * TAU) * 1.06, 0.76, Math.cos(k / 8 * TAU) * 1.06, 0, k / 8 * TAU, 0)), T(tube([[-1.0, 0.9, 0.3], [0, 0.78, 1.08], [1.0, 0.9, 0.3]], 0.01), '#f1e7d2')],
      any: () => [...xf(chimP(0.45, 0.07), -0.35, 1.04, -0.3), ...xf(crateP(0.2), 0.62, 0, 0.95), ...xf(sackP(0.2), -0.6, 0, 0.98)] } },
  toaster: { r1: () => [...xf(doorP(0.5), 0, 0.2, 0.505), ...xf(stepsP(0.36, 0.2), 0, 0, 0.5)], r2: () => [...xf(winP(0.13), -0.5, 0.82, 0.51), ...xf(winP(0.13), 0.5, 0.82, 0.51), ...xf(lanternP(0.13), 0.3, 0.85, 0.53)],
    r3: { bakery: () => [...[-0.24, 0.24].map(z => T(rbox(0.85, 0.42, 0.13, 0.07), '#e0a55a', 0, 1.42, z)), ...[-0.24, 0.24].map(z => T(rbox(0.78, 0.1, 0.135, 0.04), '#b06a30', 0, 1.6, z)), ...xf(awnP(0.7, 0.28), 0, 0.98, 0.52), ...xf(potP(0.14, '#ff6f91'), -0.7, 0, 0.75)], any: () => [...xf(crateP(0.2), 0.75, 0, 0.8), ...xf(sackP(0.2), -0.75, 0, 0.8), ...xf(chimP(0.4, 0.06), -0.5, 1.28, -0.2)] } },
  kettle: { r1: () => [...doorP(0.42), ...stepsP(0.3, 0.001)], r2: () => [...onRing(winP(0.12), -0.8, 1.0, 0.45), ...onRing(winP(0.12), 0.8, 1.0, 0.45), ...onRing(lanternP(0.13), 0.35, 1.02, 0.5)],
    r3: { bath: () => [...[0, 1, 2, 3].map(k => Ly('glow', () => T(sph(0.1 + k * 0.03, 10, 8), '#ffffff', 1.45 + k * 0.08, 1.15 + k * 0.2, Math.sin(k) * 0.08))), ...[-0.5, 0.5].map(x => T(cyl(0.025, 0.025, 0.55, 6), WOOD_D, x - 0.9, 0.27, 0.9)), T(cyl(0.012, 0.012, 1.0, 4), '#f1e7d2', -0.9, 0.52, 0.9, 0, 0, PI / 2), T(box(0.24, 0.3, 0.01), '#8fc6e8', -1.1, 0.38, 0.9), T(box(0.2, 0.26, 0.01), '#ff9aa8', -0.75, 0.4, 0.9)],
      well: () => [...[0, 1, 2, 3, 4, 5].map(k => T(box(0.3, 0.025, 0.04), '#b98d5c', -1.02, 0.12 + k * 0.17, 0.0, 0, 0, 0)), ...[-1, 1].map(k => T(box(0.03, 1.05, 0.03), WOOD_D, -1.02, 0.52, k * 0.14)), ...xf([T(cyl(0.1, 0.08, 0.16, 10), '#9aa0a8'), T(tor(0.08, 0.01, PI, 10, 3), '#5a5a5a', 0, 0.09, 0)], 0.75, 0, 0.85)],
      any: () => [...xf(potP(0.15, '#ffd23f'), -0.6, 0, 0.95), ...xf(stoolP(0.2), 0.75, 0, 0.9)] } },
  matchbox: { r1: () => [T(box(0.5, 0.025, 0.55), '#c9a070', 0, 0.05, 1.5, 0.2, 0, 0), ...xf(doorP(0.36), 0, 0.08, 1.29)], r2: () => [...xf(winP(0.1), 0.6, 0.32, 0, PI / 2), ...xf(winP(0.1), -0.6, 0.32, 0.3, -PI / 2), ...xf(lanternP(0.1), 0.6, 0.45, 0.62, PI / 2)],
    r3: { post: () => [T(cyl(0.025, 0.025, 0.5, 6), WOOD_D, 0.75, 0.25, 1.1), T(rbox(0.22, 0.16, 0.28, 0.05), '#d9473b', 0.75, 0.56, 1.1), T(box(0.18, 0.02, 0.02), '#3a2a1a', 0.75, 0.6, 1.25), ...xf(sackP(0.22), -0.85, 0, 0.9), T(box(0.24, 0.16, 0.01), '#fbf3de', 0, 0.68, 0.3, -PI / 2.4)],
      any: () => [...xf(crateP(0.22), 0.85, 0, 0.9), ...xf(sackP(0.22), -0.85, 0, 0.9), ...xf(potP(0.14), -0.75, 0, -0.6)] } },
  yarn: { r3: { play: () => [...[-1, 1].flatMap(k => [T(cyl(0.04, 0.045, 1.9, 6), WOOD_D, 1.25, 0.95, 0.55 + k * 0.4, 0, 0, 0.12), T(cyl(0.04, 0.045, 1.9, 6), WOOD_D, 0.95, 0.95, 0.55 + k * 0.4, 0, 0, -0.12)]), T(cyl(0.04, 0.04, 1.0, 6), WOOD_D, 1.1, 1.86, 0.55, PI / 2, 0, 0), ...[-0.15, 0.15].map(z => T(cyl(0.012, 0.012, 1.25, 4), '#d9443a', 1.1, 1.22, 0.55 + z)), T(rbox(0.3, 0.04, 0.42, 0.015), '#c99a5e', 1.1, 0.6, 0.55)],
    any: () => [...[0, 1, 2, 3].map(k => T(sph(0.07, 8, 6), ['#ff6f91', '#ffd23f', '#ffffff', '#ff9a3c'][k], Math.cos(k * 1.6) * 1.1, 0.06, Math.sin(k * 1.6) * 1.1))] } },
  button: { r3: { table: () => [...[0, 1, 2, 3].flatMap(k => xf(stoolP(0.32, ['#e8433a', '#ffd23f', '#5fa1d9', '#7cb85a'][k]), Math.cos(k * PI / 2 + 0.4) * 1.3, 0, Math.sin(k * PI / 2 + 0.4) * 1.3)), T(cyl(0.12, 0.09, 0.14, 12), '#fbf6ee', 0.25, 0.25, -0.2), T(cyl(0.2, 0.2, 0.02, 16), '#fbf6ee', -0.2, 0.2, 0.2), T(sph(0.12, 10, 6, 0, TAU, 0, PI / 2), '#e0a55a', -0.2, 0.21, 0.2)],
    any: () => [...[0, 1, 2].map(k => T(cyl(0.16, 0.18, 0.04, 8), '#e2d2b0', 1.2 + k * 0.4, 0.02, -0.4 + k * 0.4))] } },
  toycar: { r3: { train: () => [T(rbox(1.3, 0.06, 0.3, 0.02), '#b98d5c', 0, 0.03, 0.85), ...xf(crateP(0.26), -0.15, 0.8, 0), ...xf(sackP(0.22), 0.25, 0.75, 0.05), ...xf(crateP(0.2), 0.75, 0, 0.9), ...xf(crateP(0.16), 0.75, 0.16, 0.9)],
    play: () => [T(rbox(0.36, 0.04, 1.2, 0.015), '#ff9a3c', 0.2, 0.5, 1.02, -0.62, 0, 0), ...[-1, 1].map(k => T(box(0.03, 0.08, 1.2), '#e8433a', 0.2 + k * 0.18, 0.54, 1.02, -0.62, 0, 0))], any: () => [] } },
  spool: { r3: { well: () => [...postsRoofP(1.7, 1.95, 0.8), T(cyl(0.03, 0.03, 1.8, 6), '#8a5530', 0, 1.7, 0, 0, 0, PI / 2), T(cyl(0.012, 0.012, 0.5, 4), '#d9b77a', 0.2, 1.45, 0), ...xf([T(cyl(0.12, 0.1, 0.18, 10), '#9a6a3a'), T(tor(0.1, 0.012, PI, 10, 3), '#5a5a5a', 0, 0.09, 0)], 0.2, 1.1, 0), T(box(0.08, 0.3, 0.04), WOOD_D, 0.95, 1.6, 0)],
    table: () => [...[0, 1, 2].flatMap(k => xf(stoolP(0.32, ['#e8433a', '#ffd23f', '#7cb85a'][k]), Math.cos(k * 2.1 + 0.5) * 1.35, 0, Math.sin(k * 2.1 + 0.5) * 1.35)), T(cyl(0.11, 0.08, 0.13, 12), '#fbf6ee', 0.2, 1.57, 0.2)], any: () => [] } },
  pencil: { r3: { flag: () => [T(cyl(0.025, 0.03, 1.6, 6), WOOD_D, 1.4, 0.8, 0.5), T(box(0.02, 0.32, 0.5), '#f39a3d', 1.4, 1.43, 0.75), T(tube([[-1.2, 0.5, 0], [0.1, 0.95, 0.25], [1.4, 1.5, 0.5]], 0.01), '#f1e7d2'), ...[0, 1, 2, 3, 4].map(k => T(cone(0.07, 0.14, 3), ['#d9473b', '#ffd23f', '#5fa1d9', '#7cb85a', '#ff9aa8'][k], -0.9 + k * 0.5, 0.6 + k * 0.17 - Math.sin(k / 4 * PI) * 0.08, 0.05 + k * 0.1, PI, 0, 0))], any: () => [] } },
  rubberduck: { r3: { dock: () => [T(rbox(0.7, 0.06, 1.6, 0.02), '#b98d5c', 1.15, 0.12, 0.3), ...[0.6, 1.7].flatMap(x => [-0.4, 1.0].map(z => T(cyl(0.05, 0.05, 0.4, 6), WOOD_D, x, 0.12, z))), T(tor(0.12, 0.025, TAU, 14, 4), '#d9b77a', 1.5, 0.2, 1.0, PI / 2)],
    play: () => [T(rbox(0.36, 0.04, 1.3, 0.015), '#5fa1d9', 0, 0.62, -1.3, 0.62, 0, 0), ...[-1, 1].map(k => T(box(0.03, 0.08, 1.3), '#ffffff', k * 0.18, 0.66, -1.3, 0.62, 0, 0)), ...[0, 1, 2, 3].map(k => T(box(0.36, 0.03, 0.04), WOOD_D, 0, 0.25 + k * 0.28, -0.85 + k * 0.02))], any: () => [] } },
  thimble: { r3: { bell: () => [...postsRoofP(1.9, 1.85, 0.7, '#d9473b'), T(cyl(0.012, 0.012, 0.35, 4), '#d9b77a', 0.6, 1.66, 0), ...xf([T(cyl(0.1, 0.16, 0.18, 12), '#d9b263'), T(sph(0.04, 6, 4), '#7a5e2a', 0, -0.1, 0)], 0.6, 1.4, 0)], any: () => [] } },
  glassjar: { r3: { lamp: () => [...[0, 1, 2, 3, 4, 5].map(k => Ly('glow', () => T(sph(0.07, 8, 6), '#fff48a', Math.sin(k * 2.1) * 0.4, 0.4 + k * 0.17, Math.cos(k * 2.1) * 0.35))), T(cyl(0.012, 0.012, 0.7, 4), '#d9443a', 0, 2.1, 0), T(cyl(0.05, 0.06, 2.5, 6), WOOD_D, -1.1, 1.25, 0), T(cyl(0.04, 0.04, 1.2, 6), WOOD_D, -0.5, 2.45, 0, 0, 0, PI / 2)],
    garden: () => [T(cyl(0.7, 0.7, 0.15, 24), '#6a4a30', 0, 0.2), ...[0, 1, 2, 3, 4].flatMap(k => [T(cyl(0.02, 0.02, 0.4 + k * 0.08, 4), '#4f9f3a', Math.sin(k * 1.3) * 0.35, 0.45 + k * 0.04, Math.cos(k * 1.3) * 0.3), T(sph(0.09, 8, 6), ['#ff6f91', '#ffd23f', '#ffffff', '#c77dff', '#ff9a3c'][k], Math.sin(k * 1.3) * 0.35, 0.68 + k * 0.08, Math.cos(k * 1.3) * 0.3)])], any: () => [T(cyl(0.7, 0.7, 0.1, 24), '#5fa14c', 0, 0.16), ...[0, 1, 2].map(k => T(sph(0.12, 8, 6), '#c9c2b4', Math.sin(k * 2) * 0.35, 0.24, Math.cos(k * 2) * 0.3))] } },
  oldbook: { r3: { school: () => [...[0, 1, 2].map(k => T(rbox(0.5, 0.1, 0.36, 0.02), ['#c8613a', '#5fa1d9', '#e0c35a'][k], 1.2, 0.05 + k * 0.1, 0.4, 0, k * 0.3, 0)), T(rbox(0.9, 0.06, 0.25, 0.02), '#b98d5c', 0, 0.3, 1.0), ...[-0.38, 0.38].map(x => T(box(0.05, 0.3, 0.2), WOOD_D, x, 0.15, 1.0)), ...xf(lanternP(0.16), -0.9, 0.95, 0.4), T(cyl(0.03, 0.03, 1.0, 6), WOOD_D, -0.9, 0.5, 0.38)], any: () => [...[-0.6, 0.6].map(x => T(cyl(0.04, 0.04, 1.1, 6), WOOD_D, x, 0.55 + 0.45, 0)), T(box(1.6, 0.05, 1.0), '#c8613a', 0, 1.62, 0, 0, 0, 0)] } },
  flowerpot: { r3: { garden: () => [T(disc(0.85, 24), '#5a3a22', 0, 1.0), ...[0, 1, 2, 3, 4, 5, 6].flatMap(k => { const a = k / 7 * TAU, r = k ? 0.48 : 0, h = 1.35 + (k % 3) * 0.12; return [T(cyl(0.025, 0.03, h - 1.0, 5), '#4f9f3a', Math.cos(a) * r, (h + 1.0) / 2, Math.sin(a) * r), T(sph(0.14, 10, 8), '#5fb04a', Math.cos(a) * r * 0.9 + 0.1, 1.15, Math.sin(a) * r * 0.9, 0, a, 0, 1.3, 0.4, 0.7), ...xf([T(sph(0.12, 8, 5), ['#ff6f91', '#ffd23f', '#ffffff', '#ff9a3c', '#c77dff'][k % 5], 0, 0, 0, 0, 0, 0, 1.4, 0.5, 1.4), T(sph(0.06, 8, 6), '#f2c23a', 0, 0.04, 0)], Math.cos(a) * r, h, Math.sin(a) * r)]; })],
    deco: () => [T(disc(0.85, 24), '#5a3a22', 0, 1.0), T(sph(0.6, 14, 10), '#4f9f3a', 0, 1.25, 0, 0, 0, 0, 1, 0.7, 1), ...[0, 1, 2, 3, 4].map(k => T(sph(0.12, 8, 6), ['#ff6f91', '#ffd23f', '#ffffff', '#ff9a3c', '#c77dff'][k], Math.cos(k * 1.26) * 0.42, 1.55, Math.sin(k * 1.26) * 0.42))], any: () => [] } },
};
Object.assign(RENO, {
  umbrella: { r3: { table: () => [...[0, 1, 2, 3].flatMap(k => xf(stoolP(0.3, ['#e8433a', '#ffd23f', '#5fa1d9', '#7cb85a'][k]), Math.cos(k * PI / 2 + 0.6) * 0.75, 0, Math.sin(k * PI / 2 + 0.6) * 0.75)), T(cyl(0.3, 0.3, 0.04, 16), '#c99a5e', 0, 0.55, 0), T(cyl(0.04, 0.04, 0.55, 6), WOOD_D, 0.0, 0.27, 0.0)],
    tea: () => [...[0, 1, 2].flatMap(k => xf(stoolP(0.3, ['#e8433a', '#ffd23f', '#7cb85a'][k]), Math.cos(k * 2.1 + 0.5) * 0.8, 0, Math.sin(k * 2.1 + 0.5) * 0.8)), T(cyl(0.11, 0.08, 0.13, 12), '#fbf6ee', 0.3, 0.07, 0.3), ...xf(lanternP(0.16), 0.0, 0.85, 0.95)], any: () => [] } },
  kite: { r3: { flag: () => [T(cyl(0.03, 0.035, 2.2, 6), WOOD_D, 0.9, 1.1, -0.5), T(box(0.3, 0.04, 0.3), '#c99a5e', 0.9, 1.6, -0.5), ...[-1, 1].map(k => T(box(0.02, 0.18, 0.3), WOOD_D, 0.9 + k * 0.15, 1.7, -0.5)), T(tube([[0.9, 2.2, -0.5], [0.4, 1.8, -0.2], [0.05, 1.0, -0.3]], 0.008, 12, 3), '#f1e7d2')], any: () => [] } },
  pumpkin: { r1: () => [...xf(doorP(0.46), 0, 0.03, 0.88), ...xf(stepsP(0.3, 0.03), 0, 0, 0.9)], r2: () => [...onRing(winP(0.12), -0.7, 0.93, 0.75), ...onRing(winP(0.12), 0.7, 0.93, 0.75), ...onRing(lanternP(0.13), 0.35, 0.96, 0.8)],
    r3: { lamp: () => [...Ly('glow', () => [...[-1, 1].map(k => T(cone(0.13, 0.16, 3), '#ffcf5a', k * 0.3, 0.92, 0.82, -PI / 2 + 0.25, 0, 0)), T(box(0.5, 0.09, 0.08), '#ffcf5a', 0, 0.55, 0.85, -0.3, 0, 0), ...[-0.15, 0.0, 0.15].map(x => T(box(0.07, 0.07, 0.07), '#ffcf5a', x, 0.62, 0.84, -0.3, 0, 0))]), T(cyl(0.04, 0.05, 1.5, 6), WOOD_D, 1.0, 0.75, 0.35), T(cyl(0.015, 0.015, 0.3, 4), '#3a2a1a', 1.0, 1.4, 0.55, 0.9, 0, 0)],
      food: () => [...xf(awnP(0.6, 0.26), 0, 0.62, 0.92), ...xf(crateP(0.18), 0.75, 0, 0.8), ...xf(sackP(0.2), -0.7, 0, 0.8)], any: () => [...xf(chimP(0.3, 0.06), 0.3, 1.25, -0.2), ...xf(potP(0.14, '#ffd23f'), -0.7, 0, 0.8)] } },
  jinglebell: { r3: { bell: () => [...postsRoofP(1.6, 1.9, 0.7, '#3f8a4a'), T(cyl(0.012, 0.012, 0.35, 4), '#d63a32', 0, 1.7, 0)], any: () => [] } },
  shell: { r3: { bell: () => [...postsRoofP(1.7, 1.7, 0.6, '#f2a7a0'), ...[-0.5, -0.17, 0.17, 0.5].flatMap(x => [T(cyl(0.006, 0.006, 0.5, 3), '#f1e7d2', x, 1.45, 0), T(sph(0.07, 8, 5), '#f7d6d0', x, 1.18, 0, 0, 0, 0, 1, 0.4, 1)])], bath: () => [...[0, 1, 2].map(k => Ly('glow', () => T(sph(0.08 + k * 0.03, 10, 8), '#ffffff', Math.sin(k) * 0.2, 0.6 + k * 0.2, -0.2))), ...xf(stoolP(0.2), 0.9, 0, 0.6)], any: () => [] } },
  strawhat: { r3: { table: () => [...[0, 1, 2, 3].flatMap(k => xf(stoolP(0.26, ['#e8433a', '#ffd23f', '#5fa1d9', '#7cb85a'][k]), Math.cos(k * PI / 2 + 0.6) * 1.15, 0, Math.sin(k * PI / 2 + 0.6) * 1.15))], any: () => [...xf(potP(0.14, '#ff6f91'), -0.75, 0, 0.75)] } },
});
// ---------------------------------------------------------------- 天气和节日：盖在淋雨旧物上的大叶子、雪人、节日布置（世界尺寸）
const LEAF_COVER = () => { const top = new THREE.SphereGeometry(1, 22, 10, 0, TAU, 0, PI * 0.42); return [T(top, '#4f9f3a', 0, -0.62, 0, 0, 0, 0, 1, 0.55, 1.35), T(top, '#6db255', 0, -0.635, 0, 0, 0, 0, -0.99, 0.55, 1.33),
  T(tube([[0, -0.07, -1.0], [0, 0.03, 0], [0, -0.07, 1.0]], 0.025, 12, 4), '#3d7a2c'), ...[-0.5, 0, 0.5].flatMap(z => [-1, 1].map(k => T(box(0.6, 0.015, 0.02), '#3d7a2c', k * 0.3, -0.02 - Math.abs(z) * 0.05, z, 0, k * 0.5, -k * 0.08))), T(tube([[0, -0.07, 1.0], [0.05, -0.05, 1.25], [0.15, 0.05, 1.35]], 0.03, 6, 4), '#3d7a2c')]; };
const SNOW = '#f7faff';
const SNOWMAN = (k) => { const L = [T(sph(0.58, 22, 14), SNOW, 0, 0.5, 0, 0, 0, 0, 1, 0.9, 1), T(sph(0.42, 20, 12), SNOW, 0, 1.2, 0), T(sph(0.31, 18, 12), SNOW, 0, 1.74, 0),
  ...[-1, 1].map(s => T(sph(0.045, 8, 6), '#2a2320', s * 0.1, 1.8, 0.27)), T(cone(0.055, 0.3, 8), '#f08a24', 0, 1.74, 0.42, PI / 2, 0, 0), ...[1.32, 1.12].map(y => T(sph(0.05, 8, 6), '#3a2a1a', 0, y, 0.4))];
  if (k === 1) L.push(T(sph(0.27, 14, 8, 0, TAU, 0, PI / 2), '#4f9f3a', 0, 1.97, 0, 0.15, 0, 0, 1.25, 0.55, 1.25), T(cyl(0.02, 0.02, 0.15, 4), '#3d7a2c', 0, 2.12, 0));
  if (k === 2 || k === 0) for (const s of [-1, 1]) L.push(T(tube([[s * 0.36, 1.25, 0], [s * 0.7, 1.45 + (k === 2 && s > 0 ? 0.25 : 0), 0.05], [s * 0.95, 1.6 + (k === 2 && s > 0 ? 0.45 : 0), 0.1]], 0.025, 8, 4), '#6b4426'), T(cyl(0.012, 0.012, 0.18, 3), '#6b4426', s * 0.85, 1.62 + (k === 2 && s > 0 ? 0.4 : 0), 0.08, 0, 0, s * 0.8));
  if (k === 3) L.push(T(tor(0.33, 0.07, TAU, 20, 6), '#d9443a', 0, 1.5, 0, PI / 2, 0, 0, 1, 1, 0.8), T(box(0.12, 0.42, 0.06), '#d9443a', 0.18, 1.3, 0.3, 0.2, 0, 0.2), ...[-2, -1, 0, 1, 2].map(i => T(sph(0.025, 6, 4), '#c0392b', i * 0.05, 1.66 - Math.abs(i) * 0.012 + 0.02, 0.29)));
  return L; };
const FEST = {
  huazhao: () => [T(cyl(0.07, 0.09, 2.6, 8), '#b27242', 0, 1.3, 0), T(tor(0.35, 0.08, TAU, 20, 6), '#4f9f3a', 0, 2.55, 0, PI / 2), ...Array.from({ length: 8 }, (_, k) => T(sph(0.09, 8, 6), ['#ff6f91', '#ffd23f', '#ffffff', '#c77dff'][k % 4], Math.cos(k / 8 * TAU) * 0.35, 2.62, Math.sin(k / 8 * TAU) * 0.35)),
    ...[0, 1, 2, 3].map(k => T(tube([[0, 2.5, 0], [Math.cos(k * PI / 2 + 0.4) * 0.6, 1.4, Math.sin(k * PI / 2 + 0.4) * 0.6], [Math.cos(k * PI / 2 + 0.4) * 1.0, 0.05, Math.sin(k * PI / 2 + 0.4) * 1.0]], 0.02, 12, 3), ['#ff8fb1', '#ffd23f', '#7fb8ec', '#ffffff'][k])),
    ...Array.from({ length: 6 }, (_, k) => T(cone(0.12, 0.22, 3), ['#d9473b', '#ffd23f', '#5fa1d9', '#7cb85a', '#ff9aa8', '#ffffff'][k], Math.cos(0.4) * (0.18 + k * 0.13), 2.25 - k * 0.19, Math.sin(0.4) * (0.18 + k * 0.13), PI, 0, 0)), T(cyl(0.3, 0.36, 0.14, 12), '#bfb3a2', 0, 0.07, 0)],
  firefly: () => [T(cyl(0.06, 0.08, 2.4, 8), '#8a5530', 0, 1.2, 0), T(box(1.5, 0.08, 0.08), '#8a5530', 0, 2.3, 0), ...[-0.6, 0, 0.6].flatMap((x, k) => [T(cyl(0.008, 0.008, 0.3, 3), '#3a2a1a', x, 2.15, 0),
    ...Ly('glow', () => [T(lathe([[0.02, 0], [0.16, 0.04], [0.21, 0.18], [0.16, 0.34], [0.02, 0.38]], 14), ['#ff8a5a', '#ffd06a', '#ff6f7a'][k], x, 1.62 + (k % 2) * 0.1, 0)]), T(cyl(0.08, 0.08, 0.04, 10), '#3a2a1a', x, 2.0 + (k % 2) * 0.1, 0), T(cyl(0.08, 0.08, 0.04, 10), '#3a2a1a', x, 1.62 + (k % 2) * 0.1, 0)]), T(cyl(0.25, 0.3, 0.12, 10), '#bfb3a2', 0, 0.06, 0)],
  harvest: () => [...xf(PARTS.pumpkin(), 0, 0, 0, 0.4, 0.42), ...Ly('glow', () => [...[-1, 1].map(k => T(cone(0.06, 0.07, 3), '#ffcf5a', k * 0.12, 0.42, 0.37, -PI / 2 + 0.2, 0, 0)), T(box(0.2, 0.04, 0.03), '#ffcf5a', 0, 0.26, 0.4, -0.3, 0, 0)]),
    ...Array.from({ length: 12 }, (_, k) => { const a = k / 12 * TAU; return [T(cyl(0.012, 0.016, 1.3, 4), '#e2b84a', 0.8 + Math.cos(a) * 0.08, 0.65, Math.sin(a) * 0.08, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12), T(sph(0.05, 6, 4), '#d9a63a', 0.8 + Math.cos(a) * 0.16, 1.32, Math.sin(a) * 0.16, 0, 0, 0, 1, 2.6, 1)]; }).flat(), T(tor(0.11, 0.03, TAU, 12, 4), '#d9443a', 0.8, 0.6, 0, PI / 2)],
  snowlamp: () => [T(sph(0.45, 16, 10), SNOW, 0, 0.25, 0, 0, 0, 0, 1, 0.55, 1), T(cyl(0.3, 0.34, 0.5, 16), SNOW, 0, 0.72, 0), T(sph(0.36, 16, 8, 0, TAU, 0, PI / 2), SNOW, 0, 0.95, 0, 0, 0, 0, 1, 0.6, 1), T(sph(0.1, 8, 6), SNOW, 0, 1.2, 0),
    ...Ly('glow', () => [T(box(0.22, 0.26, 0.04), '#ffd27a', 0, 0.74, 0.31), T(box(0.04, 0.26, 0.22), '#ffd27a', 0.31, 0.74, 0), T(box(0.04, 0.26, 0.22), '#ffd27a', -0.31, 0.74, 0), T(box(0.22, 0.26, 0.04), '#ffd27a', 0, 0.74, -0.31)])],
};
// 两根节日柱子之间的彩旗绳 / 灯笼串 / 雪灯串（长约 7.7，两端挂在柱子顶上）
const BUNTING = (id) => { const L = [], W = 3.85, Y = id === 'snowlamp' ? 1.9 : 3.9, sag = 0.8; const cols = { huazhao: ['#ff8fb1', '#ffd23f', '#7fb8ec', '#ffffff', '#c77dff'], firefly: ['#ff8a5a', '#ffd06a', '#ff6f7a'], harvest: ['#e8862e', '#f2b33d', '#c9452b', '#8a5530'], snowlamp: ['#fff4c8'] }[id];
  const yAt = (x) => Y - sag * (1 - (x / W) ** 2); const pts = []; for (let i = 0; i <= 16; i++) { const x = -W + i / 16 * 2 * W; pts.push([0, yAt(x), x]); } L.push(T(tube(pts, 0.025, 32, 4), '#d9c49a'));
  for (let i = 1; i < 12; i++) { const z = -W + i / 12 * 2 * W, y = yAt(z), c = cols[i % cols.length];
    if (id === 'firefly' || id === 'snowlamp') L.push(...Ly('glow', () => [T(sph(id === 'snowlamp' ? 0.1 : 0.16, 10, 8), c, 0, y - 0.22, z, 0, 0, 0, 1, 1.25, 1)]), T(cyl(0.006, 0.006, 0.12, 3), '#3a2a1a', 0, y - 0.06, z));
    else L.push(T(cone(0.2, 0.42, 3), c, 0, y - 0.24, z, PI, 0, 0, 1, 1, 0.25)); }
  return L; };
const COMBO_MODEL = {
  cozytea: () => [...PARTS._teapot(), ...[0.55, 0.85, 1.15].map((y, k) => T(tor(0.95 - Math.abs(y - 0.9) * 0.5, 0.08, TAU, 32), k % 2 ? '#d9443a' : '#f2e3c8', 0, y, 0, PI / 2)), ...xf(PARTS.yarn(), 1.1, 0, 0.6, 0, 0.35)],
  bootpost: () => [...PARTS._boot(), T(cyl(0.34, 0.34, 0.1, 20), '#c8423a', 0, 1.2, 0.17, PI / 2), ...[[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]].map(([x, y]) => T(cyl(0.035, 0.035, 0.04, 8), '#6e1f1a', x, 1.2 + y, 0.23, PI / 2)), T(box(0.5, 0.35, 0.08), '#e8433a', 0.65, 1.2, 0.2), T(cyl(0.04, 0.04, 1.2, 6), '#8a5530', 0.65, 0.6, 0.2)],
  musicbox: () => [...PARTS.cookietin(), ...xf(PARTS.spool(), 0, 1.06, 0, 0, 0.4), T(cyl(0.05, 0.05, 0.9, 6), '#8a5a2e', 0.6, 1.5, 0, 0, 0, PI / 2), T(sph(0.12, 8, 6), '#d9443a', 1.05, 1.5, 0), ...[0, 1, 2].map(k => T(box(0.14, 0.3, 0.04), '#3a2a1a', Math.sin(k) * 0.3 - 0.4, 1.7 + k * 0.25, 0.3)), ...doorP(0.4)],
  teabath: () => [...PARTS._cup(), ...xf(PARTS.kettle(), 1.2, 0, -0.6, -0.6, 0.45), ...[0, 1, 2].map(k => T(sph(0.18, 8, 6), '#ffffff', Math.sin(k * 2) * 0.4, 1.4 + k * 0.3, Math.cos(k * 2) * 0.3))],
  firefly: () => [T(cyl(0.08, 0.1, 2.6, 8), '#8a5530', -0.6, 1.3, 0), T(cyl(0.06, 0.06, 1.0, 6), '#8a5530', -0.15, 2.55, 0, 0, 0, PI / 2), T(cyl(0.02, 0.02, 0.5, 4), '#d9443a', 0.3, 2.3, 0), ...xf(PARTS.glassjar(), 0.3, 1.1, 0, 0, 0.55), ...[0, 1, 2, 3].map(k => Ly('glow', () => T(sph(0.05, 8, 6), '#fff48a', 0.3 + Math.sin(k * 2) * 0.2, 1.35 + k * 0.12, Math.cos(k * 2) * 0.18))), ...xf(PARTS.yarn(), -0.6, 0, 0.6, 0, 0.3)],
  train: () => [...xf(PARTS.toycar(), 0, 0, 0.55, 0, 0.7), ...xf(PARTS.matchbox(), 0, 0.1, -0.9, PI / 2, 0.55), T(cyl(0.12, 0.12, 0.3, 8), '#555', 0.3, 0.12, -0.9, 0, 0, PI / 2), T(cyl(0.12, 0.12, 0.3, 8), '#555', -0.3, 0.12, -0.9, 0, 0, PI / 2)],
  thimblegarden: () => [...xf(PARTS.flowerpot(), -0.3, 0, 0, 0, 0.75), ...xf(RENO.flowerpot.r3.garden(), -0.3, 0, 0, 0, 0.75), ...xf(PARTS.thimble(), 0.65, 0, 0.3, 0, 0.4), ...[0, 1, 2, 3, 4].map(k => T(sph(0.12, 8, 6), ['#ff6f91', '#ffd23f', '#ffffff', '#c77dff', '#ff9a3c'][k], Math.cos(k * 1.3) * 0.9, 0.2, Math.sin(k * 1.3) * 0.9))],
  library: () => [T(rbox(0.3, 1.6, 1.2, 0.04), '#4f7f46', -0.75, 0.8, 0), T(rbox(0.3, 1.4, 1.1, 0.04), '#c8613a', 0.75, 0.7, 0), T(box(0.26, 1.5, 1.15), '#f4ead2', -0.75, 0.8, 0.03), ...xfr(PARTS.pencil(), 0, 1.45, 0, 0, PI / 2, 0, 0.8), T(box(1.3, 0.08, 1.0), '#e6c35a', 0, 0.04, 0), ...xf(doorP(0.6), 0, 0.08, 0.3)],
  duckboat: () => [...xf(PARTS.rubberduck(), 0, 0, 0.55, 0, 0.6), ...xf(PARTS._boot(), 0, 0, -0.65, 0, 0.5), T(cyl(0.02, 0.02, 0.8, 4), '#d9b77a', 0, 0.6, 0, PI / 2)],
};
// 有房子模板的组合：模板照常画，这里只叠加组合多出来的东西（单位 = 模板占地半径；门朝 +z）
const OVERLAY = {
  cozytea: () => [T(sph(0.32, 20, 10, 0, TAU, 0, PI / 2), '#d9443a', 0, 0.98, 0), ...[0, 1, 2].map(k => T(tor(0.3 - k * 0.07, 0.03, TAU, 24), k % 2 ? '#f2e3c8' : '#b83229', 0, 1.0 + k * 0.08, 0, PI / 2)), T(sph(0.07, 10, 8), '#f2e3c8', 0, 1.32, 0),
    ...xf(PARTS.yarn(), -0.95, 0, 0.45, 0, 0.3), T(cyl(0.012, 0.012, 0.9, 4), '#d9443a', -0.55, 0.3, 0.55, 0, 0, 1.1)],
  bootpost: () => [T(cyl(0.26, 0.26, 0.07, 22), '#c8423a', 0.0, 1.05, 0.5, PI / 2), T(tor(0.22, 0.03, TAU, 22), '#e05a50', 0.0, 1.05, 0.54), ...[[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]].map(([x, y]) => T(cyl(0.025, 0.025, 0.03, 8), '#6e1f1a', x, 1.05 + y, 0.55, PI / 2)),
    T(cyl(0.03, 0.03, 0.55, 6), '#8a5530', 0.85, 0.27, 0.6), T(box(0.24, 0.16, 0.3), '#d9473b', 0.85, 0.6, 0.6), T(box(0.2, 0.03, 0.04), '#3a2a1a', 0.85, 0.62, 0.76)],
  teabath: () => [...xf(PARTS.kettle(), 1.0, 0, -0.45, -0.7, 0.42), T(cyl(0.03, 0.03, 0.5, 6), '#c9c9c9', 0.75, 0.5, -0.25, 0, 0, 1.0), ...[0, 1, 2, 3].map(k => T(sph(0.12 + k * 0.03, 10, 8), '#ffffff', Math.sin(k * 1.7) * 0.25, 0.75 + k * 0.22, Math.cos(k * 1.7) * 0.2))],
};
// ---------------------------------------------------------------- 第二批 12 对组合：小零件
// xe：整体摆放一组零件（位置 / 三轴转角 / 缩放，缩放可以是三个数）
const xe = (list, p = [0, 0, 0], rot = [0, 0, 0], s = 1) => { const [sx, sy, sz] = Array.isArray(s) ? s : [s, s, s]; return list.flat(9).map(g => { const c = g.clone(); c.applyMatrix4(_m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(sx, sy, sz))); c.userData.layer = g.userData.layer; return c; }); };
const KITE_PTS = [[0.5, 0.97], [0.62, 0.86], [0.66, 0.66], [0.82, 0.6], [1.0, 0.66], [0.94, 0.52], [0.66, 0.44], [0.6, 0.25], [0.66, 0.03], [0.5, 0.18], [0.34, 0.03], [0.4, 0.25], [0.34, 0.44], [0.06, 0.52], [0.0, 0.66], [0.18, 0.6], [0.34, 0.66], [0.38, 0.86]];
const bloom = (x, y, z, col, s = 1) => [...Array.from({ length: 5 }, (_, k) => T(sph(0.07 * s, 8, 6), col, x + Math.cos(k * 1.256) * 0.075 * s, y, z + Math.sin(k * 1.256) * 0.075 * s, 0, 0, 0, 1, 0.6, 1)), T(sph(0.05 * s, 8, 6), '#f2c23a', x, y + 0.02 * s, z)];
const bowP = (x, y, z, col) => [T(cone(0.07, 0.13, 6), col, x - 0.07, y, z, 0, 0, PI / 2), T(cone(0.07, 0.13, 6), col, x + 0.07, y, z, 0, 0, -PI / 2), T(sph(0.03, 6, 4), col, x, y, z)];
// 单个毛线手套（照 PARTS.mittens 的画法）：趴着，手指朝 +z，袖口在 -z
const mitten1 = inCell('knit', (side) => [...U([0, 0, 128, 256], () => [T(rbox(0.62, 0.2, 0.85, 0.09, 3), '#ffffff', 0, 0.1, 0)]), T(sph(0.31, 16, 10), '#c8322b', 0, 0.1, 0.42, 0, 0, 0, 1, 0.33, 0.62),
  T(sph(0.15, 12, 8), '#c8322b', side * 0.33, 0.1, 0.12, 0, side * 0.5, 0, 1, 0.55, 1.6), T(rbox(0.68, 0.24, 0.32, 0.08, 3), '#f4ede0', 0, 0.12, -0.55), ...[-0.24, -0.08, 0.08, 0.24].map(x => T(box(0.03, 0.245, 0.3), '#ddd2bd', x, 0.12, -0.55))]);
const beeP = (x, y, z, k = 1) => [T(sph(0.07 * k, 8, 6), '#ffd23f', x, y, z, 0, 0, 0, 1, 0.85, 1.35), T(sph(0.072 * k, 8, 6), '#3a2a1a', x, y, z + 0.03 * k, 0, 0, 0, 1, 0.86, 0.3), ...[-1, 1].map(s => T(sph(0.06 * k, 8, 6), '#f4fbff', x + s * 0.06 * k, y + 0.07 * k, z - 0.01, 0, 0, s * 0.5, 1, 0.25, 0.7))];
// 单独的玩具小耙子（南瓜储藏室用）：长柄躺在 x 方向，耙头朝 +x
const rake1 = () => PARTS.rake();
// 简易蜂蜜罐（对照 item-honeyjar：琥珀色玻璃罐、里面是蜂蜜、米色粗布盖口、麻绳、小纸签）
const HONEY = () => [...Ly('glass', () => [T(lathe([[0.001, 0.0], [0.66, 0.0], [0.74, 0.08], [0.76, 0.22], [0.76, 1.0], [0.68, 1.16], [0.54, 1.24], [0.52, 1.3], [0.001, 1.3]], 28), '#f6c25a')]),
  T(lathe([[0.001, 0.04], [0.68, 0.04], [0.72, 0.2], [0.72, 0.95], [0.001, 0.95]], 28), '#e99a2c'), T(sph(0.6, 16, 8, 0, TAU, 0, PI / 2), '#f7efd8', 0, 1.2, 0, 0, 0, 0, 1, 0.45, 1),
  T(tor(0.64, 0.07, TAU, 28, 6), '#f7efd8', 0, 1.18, 0, PI / 2), T(tor(0.55, 0.03, TAU, 24, 4), '#c9a46a', 0, 1.14, 0, PI / 2), T(box(0.42, 0.5, 0.03), '#fbf3dc', 0.42, 0.82, 0.62, 0.1, 0.4, 0.15)];
// 简易大蛋壳（对照 item-eggshell：奶白蛋壳，上半截破口，画着粉、蓝两道彩带）
const EGG = () => { const pts = []; for (let i = 0; i <= 28; i++) { const t = 0.03 + (2.2 - 0.03) * i / 28; pts.push([Math.sin(t) * (1 + 0.13 * Math.cos(t)), 1.2 * (1 - Math.cos(t))]); }
  const col = (x, y) => y > 0.52 && y < 0.66 ? '#f2a3b6' : y > 0.9 && y < 1.0 ? '#9fd0e6' : y > 1.3 && y < 1.4 ? '#f2a3b6' : '#fff1dc';
  return [paint(T(lathe(pts, 40), '#ffffff'), (x, y) => col(x, y)), ...Array.from({ length: 11 }, (_, k) => { const a = k / 11 * TAU; return T(cone(0.13, 0.3 + (k % 2) * 0.2, 4), '#fff1dc', Math.cos(a) * 0.72, 1.9 + (k % 2) * 0.05, Math.sin(a) * 0.72, 0, a, 0); })]; };

// ---------------------------------------------------------------- 第二批 12 对组合：造型（单位 ≈ 占地半径 1；门朝 +z）
Object.assign(COMBO_MODEL, {
  // 吐司饼干烘焙坊：吐司机坐在饼干盒盖上，两片吐司从槽里弹出来
  toastbake: () => { const L = [...PARTS.cookietin(), ...xe(PARTS.toaster(), [0, 1.06, -0.12], [0, 0, 0], 0.68)];
    for (const z of [-0.24, 0.24]) { const zz = -0.12 + z * 0.68; L.push(T(rbox(0.54, 0.62, 0.09, 0.035, 3), '#b86f2e', 0, 1.06 + 1.3 * 0.68 + 0.14, zz), T(rbox(0.46, 0.54, 0.1, 0.035, 3), '#efc272', 0, 1.06 + 1.3 * 0.68 + 0.15, zz)); }
    return L; },
  // 蜂蜜茶摊（图鉴 / 悬浮用的简化造型；地上画的是杯子房 + 叠加件 OVERLAY.honeytea）
  honeytea: () => [...PARTS._cup(), ...xe(HONEY(), [1.7, 0, 0.55], [0, 0.4, 0], 0.85),
    T(cyl(0.03, 0.03, 0.95, 6), '#c48a52', 0.3, 1.62, 0.1, 0, 0, 0.55), T(sph(0.15, 10, 8), '#c48a52', -0.07, 1.2, 0.1, 0, 0, 0, 1, 0.8, 1), ...[0, 1, 2].map(k => T(tor(0.13, 0.02, TAU, 10, 3), '#9a6a3a', -0.07, 1.14 + k * 0.05, 0.1, PI / 2)),
    T(tube([[0.05, 1.2, 0.93], [0.07, 1.0, 1.0], [0.07, 0.78, 1.0]], 0.05, 10, 6), '#f3a51b'), T(sph(0.08, 8, 6), '#f3a51b', 0.07, 0.72, 1.0, 0, 0, 0, 1, 1.3, 1),
    ...beeP(0.6, 1.75, 0.55), ...beeP(1.0, 2.0, 0.3, 0.8)],
  // 毛线蛋壳摇篮（简化造型）：蛋壳立在小摇篮底座上，口上围一圈红毛线，旁边一个毛线球
  yarncradle: () => { const arc = (x) => xe([T(tor(2.0, 0.07, PI * 0.46, 24, 6), '#b0703c')], [x, 2.0, 0], [0, PI / 2, -PI / 2 - PI * 0.23]);
    return [...arc(-0.6), ...arc(0.6), T(rbox(1.5, 0.09, 1.3, 0.03), '#b0703c', 0, 0.3, 0), ...xe(EGG(), [0, 0.32, 0]),
      ...[0, 1, 2, 3].map(k => T(tor(0.76, 0.1, TAU, 30, 8), k % 2 ? '#f2e3c8' : '#d9443a', 0, 2.2 + k * 0.1, 0, PI / 2, 0, 0, 1, 1, 0.8)),
      ...xf(PARTS.yarn(), 1.5, 0, 0.55, 0.4, 0.62)]; },
  // 罐头辘轳井：敞口的鱼罐头当井口（里面是水），线轴当辘轳架在两根柱子上，蓝线吊着小水桶
  tinwell: () => { const L = [T(rbox(2.1, 0.8, 1.3, 0.16, 4), '#2f63b5', 0, 0.4, 0), T(rbox(1.9, 0.03, 1.1, 0.02), '#7fc7e4', 0, 0.8, 0),
      ...Ly('metal', () => [T(rbox(2.14, 0.07, 0.1, 0.02), '#d4d6da', 0, 0.82, 0.62), T(rbox(2.14, 0.07, 0.1, 0.02), '#d4d6da', 0, 0.82, -0.62), T(rbox(0.1, 0.07, 1.3, 0.02), '#d4d6da', 1.02, 0.82, 0), T(rbox(0.1, 0.07, 1.3, 0.02), '#d4d6da', -1.02, 0.82, 0),
        T(cyl(0.1, 0.1, 1.9, 14), '#d4d6da', 0, 0.95, -0.66, 0, 0, PI / 2), T(rbox(1.9, 0.03, 0.34, 0.01), '#e4e6ea', 0, 0.88, -0.5, 0.25, 0, 0)]),
      T(box(2.0, 0.05, 0.02), '#f3e6c4', 0, 0.2, 0.655), T(box(2.0, 0.04, 0.02), '#f3e6c4', 0, 0.62, 0.655),
      ...Array.from({ length: 10 }, (_, k) => T(sph(0.095, 8, 5, 0, TAU, 0, PI / 2), '#f3e6c4', -0.9 + k * 0.2, 0.17, 0.655, PI / 2, 0, 0)),
      T(sph(0.4, 12, 8), '#f6ead0', -0.1, 0.42, 0.66, 0, 0, 0, 1, 0.42, 0.04), T(cone(0.17, 0.3, 3), '#f6ead0', 0.4, 0.42, 0.66, 0, 0, -PI / 2, 1, 1, 0.1), T(sph(0.035, 6, 4), '#1b2f5c', -0.3, 0.46, 0.68),
      ...[-1, 1].map(k => T(cyl(0.06, 0.07, 1.4, 8), '#8a5530', k * 1.0, 1.5, -0.1)), ...xf(postsRoofP(2.0, 2.1, 0.8, '#c8613a'), 0, 0, -0.1),
      T(cyl(0.035, 0.035, 2.2, 8), '#8a5530', 0, 1.75, -0.1, 0, 0, PI / 2), ...xe(PARTS.spool(), [0.4, 1.75, -0.1], [0, 0, PI / 2], 0.55),
      T(box(0.05, 0.42, 0.05), WOOD_D, 1.15, 1.55, -0.1), T(cyl(0.035, 0.035, 0.3, 6), '#c99a5e', 1.15, 1.34, 0.04, PI / 2, 0, 0),
      T(cyl(0.012, 0.012, 0.42, 4), '#3b6fc6', 0, 1.2, -0.1), ...Ly('metal', () => [T(cyl(0.15, 0.115, 0.18, 10), '#9aa0a8', 0, 0.96, -0.1), T(tor(0.13, 0.014, PI, 10, 3), '#5a5a5a', 0, 1.05, -0.1)])];
    for (const [x, z] of [[1.25, 0.7], [1.45, 0.35], [-1.3, 0.8]]) L.push(T(sph(0.16, 8, 6), '#e9e5da', x, 0.1, z, 0, 0, 0, 1, 0.7, 1));
    return L; },
  // 玻璃罐温室：玻璃罐倒扣在花盆上，罐里长着花
  glasshouse: () => { const s = 0.8, J = 0.95, yj = 0.86 * s; const L = [...xe(PARTS.flowerpot(), [0, 0, 0], [0, 0, 0], s), T(cyl(0.78 * s, 0.74 * s, 0.06, 24), '#6a4a30', 0, 0.8 * s, 0),
      ...xe(PARTS.glassjar(), [0, yj + 1.76 * J * 0.8, 0], [PI, 0, 0], J * 0.8)];
    const stem = (pts, col, r = 0.022) => T(tube(pts.map(p => [p[0], p[1] * s, p[2]]), r, 14, 4), col);
    L.push(stem([[0, 0.8, 0], [0.0, 1.5, 0], [0.05, 2.15, 0.02]], '#4f9f3a'), stem([[0.1, 0.8, 0.05], [0.3, 1.6, 0.1], [0.4, 2.0, 0.1]], '#4f9f3a'), stem([[-0.1, 0.8, -0.05], [-0.25, 1.5, -0.1], [-0.38, 1.9, -0.05]], '#4f9f3a'));
    for (const [x, y, z, c, k] of [[0.05, 2.2, 0.02, '#ff6f91', 1.3], [0.4, 2.05, 0.1, '#ffd23f', 1.1], [-0.38, 1.95, -0.05, '#ffffff', 1.1]]) L.push(...bloom(x, y * s, z, c, k * 1.1));
    L.push(...[[0.2, 1.3, 0.1], [-0.2, 1.2, -0.1], [0.28, 1.75, 0.1], [-0.3, 1.7, -0.08]].map(([x, y, z], k) => T(sph(0.17, 8, 6), '#5fb04a', x, y * s, z, 0, k, 0.4 * (k % 2 ? 1 : -1), 1.4, 0.35, 0.8)));
    L.push(...[0, 1, 2, 3, 4].map(k => T(sph(0.11, 8, 6), ['#ff6f91', '#ffd23f', '#ffffff', '#c77dff', '#ff9a3c'][k], Math.cos(k * 1.3 + 0.6) * 1.25, 0.1, Math.sin(k * 1.3 + 0.6) * 1.1)), T(cyl(0.02, 0.02, 0.5, 4), '#a8683a', 1.0, 0.25, 0.8), T(box(0.3, 0.2, 0.02), '#f2e3c8', 1.0, 0.56, 0.82));
    return L; },
  // 雨伞茶座：撑开的格子伞当遮阳棚，大茶杯当圆桌（杯口盖上圆桌面，摆着小茶具），四周几张小凳
  umbrellatea: () => { const L = [T(cyl(1.5, 1.5, 0.06, 36), '#c99a5e', 0, 0.03, 0), ...xe(PARTS._cup(), [0, 0, 0], [0, 0, 0], 0.75), T(cyl(0.8, 0.8, 0.06, 32), '#f6efe0', 0, 0.94, 0), ...Ly('metal', () => [T(tor(0.8, 0.03, TAU, 36, 6), '#d6b25c', 0, 0.97, 0, PI / 2)]),
      ...xf(PARTS._cup(), 0.32, 0.97, 0.28, 0.5, 0.13), ...xf(PARTS._cup(), -0.28, 0.97, 0.36, -0.7, 0.13), ...xf(PARTS._teapot(), -0.22, 0.97, -0.32, 0.4, 0.1), T(cyl(0.1, 0.1, 0.09, 10), '#f2a3b6', 0.28, 1.01, -0.28),
      ...xe(PARTS.umbrella(), [0, 0.35, 0], [0, 0.3, 0], 1.45)];
    for (let k = 0; k < 4; k++) { const a = 0.9 + k * PI / 2; L.push(...xf(stoolP(0.5, ['#e8433a', '#ffd23f', '#5fa1d9', '#7cb85a'][k]), Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15)); }
    return L; },
  // 风筝旗杆：长铅笔笔尖朝上当旗杆，风筝系在顶上飞着，尾巴上三个蝴蝶结，脚边一卷线
  kiteflag: () => { const sh = new THREE.Shape(KITE_PTS.map(([x, y]) => new THREE.Vector2(x, y))); const g0 = new THREE.ShapeGeometry(sh, 6); g0.translate(-0.5, -0.03, 0); const back = g0.clone(); back.scale(-1, 1, 1); back.translate(0, 0, -0.012);
    const kite = inCell('kite', () => U([0, 0, 256, 256], () => [T(g0, '#ffffff', -0.25, 2.3, 0.1, 0, -0.15, 0.32, 1.5)]))();
    return [...xe(PARTS.pencil(), [0.19, 0.98, 0], [0, 0, PI / 2], 0.75), T(sph(0.6, 12, 6, 0, TAU, 0, PI / 2), '#7aa84a', 0, 0, 0, 0, 0, 0, 1, 0.32, 1), ...[0, 1, 2].map(k => T(sph(0.14, 8, 6), '#c9c2b4', Math.cos(k * 2.2 + 1) * 0.65, 0.08, Math.sin(k * 2.2 + 1) * 0.6)),
      ...kite, T(back, '#2a58a3', -0.25, 2.3, 0.1, 0, -0.15, 0.32, 1.5),
      T(tube([[0, 1.85, 0], [-0.1, 2.15, 0.04], [-0.3, 2.75, 0.04]], 0.012, 14, 3), '#f1e7d2'), T(sph(0.045, 6, 4), '#d9443a', 0, 1.85, 0),
      T(tube([[-0.25, 2.3, 0.1], [-0.05, 2.0, 0.2], [0.25, 1.85, 0.3], [0.55, 1.6, 0.3], [0.62, 1.25, 0.3]], 0.012, 20, 3), '#f1e7d2'), ...bowP(-0.03, 2.0, 0.2, '#e0453c'), ...bowP(0.3, 1.8, 0.3, '#ffd23f'), ...bowP(0.6, 1.4, 0.3, '#5fa1d9'),
      ...xf(PARTS.spool(), 0.85, 0, 0.5, 0.6, 0.2)]; },
  // 草帽贝壳小屋：圆圆的米色小屋，大草帽当屋顶，屋顶前立着一枚粉色大贝壳，墙脚一圈小贝壳
  strawhome: () => { const L = [T(cyl(0.85, 0.9, 0.78, 36), '#f5dfb0', 0, 0.39, 0), T(cyl(0.92, 0.95, 0.1, 36), '#d8c49a', 0, 0.05, 0), ...xe(PARTS.strawhat(), [0, 0.7, 0], [0, 0, 0], 1.2),
      ...xe(PARTS.shell(), [0, 1.12, 0.74], [PI / 2 - 0.3, PI, 0], 0.3)];
    for (let k = 0; k < 9; k++) { const a = PI * 0.25 + k / 8 * PI * 1.5 + 0.2; if (Math.abs(a - PI / 2) < 0.32) continue; L.push(...xe(PARTS.shell(), [Math.sin(a) * 1.0, 0.04, Math.cos(a) * 1.0], [0, a + PI, 0], 0.1 + (k % 3) * 0.02)); }
    return L; },
  // 冰棍跷跷板：冰棍棍拼成的长木板，架在立起来的大纽扣上，两头是小纽扣座位和扶手
  popseesaw: () => { const R = 0.6, cols = ['#f39a3d', '#f07a8a', '#8fd0e6', '#ffd23f']; const P = [];
    for (let i = 0; i < 4; i++) for (const j of [-1, 1]) { const z = (i - 1.5) * 0.21; P.push(T(rbox(1.5, 0.05, 0.2, 0.1, 3), '#ecd29c', j * 0.75, 0, z), T(rbox(0.42, 0.054, 0.2, 0.1, 3), cols[(i + (j > 0 ? 2 : 0)) % 4], j * 1.27, 0.002, z)); }
    for (const j of [-1, 1]) { P.push(...xe(PARTS.button(), [j * 1.22, 0.03, 0], [0, 0, 0], 0.26), T(cyl(0.03, 0.03, 0.55, 6), '#c99a5e', j * 0.8, 0.3, 0), T(cyl(0.025, 0.025, 0.42, 6), '#c99a5e', j * 0.8, 0.58, 0, PI / 2, 0, 0)); }
    return [...xe(PARTS.button(), [0, R, -0.08], [PI / 2, 0, 0], [R, R, R * 1.7]), ...xe(P, [0, 2 * R + 0.04, 0], [0, 0, 0.2]),
      T(rbox(1.0, 0.16, 0.5, 0.05, 3), '#c99a5e', 0, 0.08, -0.02), ...[-1, 1].map(k => T(rbox(0.16, 0.34, 0.5, 0.05, 3), '#b0703c', k * 0.4, 0.2, -0.02, 0, 0, k * 0.25)),
      ...[0, 1, 2].map(k => T(rbox(0.2, 0.03, 0.8, 0.1, 3), ['#f39a3d', '#8fd0e6', '#f07a8a'][k], 0.7 + k * 0.2, 0.02 + k * 0.001, 0.95 - k * 0.12, 0, 0.5 + k * 0.7, 0))]; },
  // 南瓜储藏室：南瓜身上开了扇小木门，门上搭条纹遮阳棚，落叶耙靠在旁边，门前堆着木箱和干草
  pumpkinstore: () => [...PARTS.pumpkin(), ...xf(doorP(0.5), 0, 0.2, 0.9), ...xf(awnP(0.62, 0.26), 0, 0.82, 0.88), ...xe(rake1(), [1.75, 0.02, 0.35], [0, -PI / 2 + 0.25, PI / 2 + 0.3], 1.0),
    ...xf(crateP(0.34), -1.05, 0, 0.85), ...xf(sackP(0.3), -0.7, 0, 1.15), ...[0, 1, 2, 3].map(k => T(sph(0.16, 8, 6), '#e2c27a', 0.9 + k * 0.1, 0.06 + (k % 2) * 0.07, 1.0 - k * 0.12, 0, k, 0, 1.3, 0.55, 0.9))],
  // 铃铛靴子钟楼：红雨靴立着当塔身，靴口上搭个小木亭，亭里挂金铃铛
  bellboot: () => xe([...PARTS._boot(), T(tor(0.58, 0.07, TAU, 24, 6), '#2f6b3a', 0, 1.9, -0.35, PI / 2, 0, 0), ...[0, 1, 2, 3, 4, 5].map(k => T(sph(0.06, 6, 4), '#e0322b', Math.sin(k * 1.1) * 0.58, 1.95, -0.35 + Math.cos(k * 1.1) * 0.58)),
    ...xf(postsRoofP(1.0, 3.65, 0.8, '#c8423a'), 0, 0, -0.35), T(box(1.0, 0.05, 0.05), WOOD_D, 0, 2.2, -0.35),
    T(sph(0.5, 12, 6, 0, TAU, 0, PI / 2), '#f7faff', 0, 3.98, -0.35, 0, 0, 0, 1.3, 0.3, 0.9), ...xe(PARTS.jinglebell(), [0, 2.95, -0.35], [0, 0, 0], 0.5),
    T(tube([[0, 2.75, -0.1], [0.04, 2.5, 0.25], [0.04, 2.3, 0.5]], 0.018, 14, 4), '#d63a32'), ...bowP(0.04, 2.25, 0.5, '#d63a32')], [0, 0, 0], [0, 0, 0], 0.85),
  // 手套暖暖屋：红格子毛衣暖水袋当屋子（红塞子当烟囱），两只毛线手套立在门两边，中间一根红毛线挂成拱
  mittenhome: () => { const L = [...inCell('hotbottle', () => [...U([0, 0, 256, 128], () => [T(rbox(1.7, 1.2, 1.15, 0.3, 4), '#ffffff', 0, 0.6, 0)]),
        T(cyl(0.36, 0.4, 0.3, 16), '#f2e6c8', -0.1, 1.33, -0.1), ...Array.from({ length: 12 }, (_, k) => T(box(0.03, 0.31, 0.03), '#dccfae', -0.1 + Math.cos(k / 12 * TAU) * 0.385, 1.33, -0.1 + Math.sin(k / 12 * TAU) * 0.385)),
        T(cyl(0.26, 0.26, 0.22, 16), '#8a1f1a', -0.1, 1.58, -0.1), T(cyl(0.3, 0.3, 0.07, 16), '#a8281f', -0.1, 1.5, -0.1), T(sph(0.22, 10, 6, 0, TAU, 0, PI / 2), '#a8281f', -0.1, 1.67, -0.1, 0, 0, 0, 1, 0.5, 1),
        T(rbox(0.3, 0.02, 0.4, 0.02), '#f6ead0', 0.62, 0.9, 0.6, 0, 0, 0.1)])(),
      T(sph(0.62, 14, 6, 0, TAU, 0, PI / 2), '#f7faff', 0.3, 1.18, 0.0, 0, 0, 0, 1.2, 0.2, 0.9)];
    for (const k of [-1, 1]) L.push(...xe(mitten1(-k), [k * 0.86, 0.62, 0.72], [-PI / 2, 0, PI], [0.85, 1.25, 0.85]));
    L.push(T(tube([[-0.86, 1.2, 0.72], [-0.5, 1.34, 0.8], [0, 1.34, 0.84], [0.5, 1.34, 0.8], [0.86, 1.2, 0.72]], 0.03, 24, 5), '#c8322b'), ...[-0.3, 0.3].map(x => T(sph(0.07, 8, 6), '#f6efe2', x, 1.3, 0.84)));
    return L; },
});
// 有房子模板的组合：叠加件
Object.assign(OVERLAY, {
  honeytea: () => [...xe(HONEY(), [1.2, 0, 0.55], [0, 0.5, 0], 0.5), T(cyl(0.022, 0.022, 0.6, 6), '#c48a52', 0.18, 1.12, 0.1, 0, 0, 0.55), T(sph(0.1, 10, 8), '#c48a52', -0.04, 0.88, 0.1, 0, 0, 0, 1, 0.8, 1),
    T(tube([[0.0, 0.95, 0.9], [0.0, 0.8, 0.96], [0.0, 0.6, 0.97]], 0.04, 10, 6), '#f3a51b'), T(sph(0.065, 8, 6), '#f3a51b', 0.0, 0.55, 0.97, 0, 0, 0, 1, 1.3, 1), ...beeP(0.62, 1.05, 0.5, 0.8), ...beeP(1.0, 1.3, 0.3, 0.65)],
  yarncradle: () => [...[0, 1, 2].map(k => T(tor(0.46, 0.055, TAU, 26, 6), k % 2 ? '#f2e3c8' : '#d9443a', 0, 0.9 + k * 0.07, 0, PI / 2)), ...xf(PARTS.yarn(), 0.85, 0, 0.7, 0.4, 0.32)],
});
// 第二批组合里有门的房子 / 店：按改造进度出现的门、窗、装饰（键 = combo_ + id）
Object.assign(RENO, {
  combo_toastbake: { r1: () => [...xf(doorP(0.5), 0, 0, 0.99), ...xf(stepsP(0.34, 0.001), 0, 0, 0.99)], r2: () => RENO.cookietin.r2(),
    r3: { bakery: () => [...xf(awnP(0.62, 0.28), 0, 0.58, 1.02), ...xf(crateP(0.2), 0.66, 0, 0.95), ...xf(potP(0.14, '#ffd23f'), -0.6, 0, 1.0), T(cyl(0.16, 0.12, 0.14, 10), '#b98d5c', -0.95, 0.07, 0.5), ...[0, 1, 2].map(k => T(cyl(0.05, 0.05, 0.5, 6), '#d99a4a', -0.95 + (k - 1) * 0.08, 0.3, 0.5, 0.3, 0, (k - 1) * 0.3))], any: () => [] } },
  combo_strawhome: { r1: () => [...xf(doorP(0.46), 0, 0, 0.87), ...xf(stepsP(0.34, 0.001), 0, 0, 0.87)], r2: () => [...onRing(winP(0.12), -1.0, 0.88, 0.4), ...onRing(winP(0.12), 1.0, 0.88, 0.4), ...onRing(lanternP(0.13), 0.38, 0.9, 0.5)],
    r3: { home: () => [...xf(potP(0.14, '#ff6f91'), -0.55, 0, 1.05), ...xf(potP(0.14, '#ffd23f'), 0.55, 0, 1.05)], any: () => [] } },
  combo_mittenhome: { r1: () => [...xf(doorP(0.5), 0, 0, 0.58), ...xf(stepsP(0.34, 0.001), 0, 0, 0.58)], r2: () => [...xf(winP(0.12), 0.865, 0.78, 0.0, PI / 2), ...xf(winP(0.12), -0.865, 0.78, 0.0, -PI / 2), ...xf(lanternP(0.13), 0.3, 0.9, 0.62)],
    r3: { home: () => [...xf(potP(0.14, '#ff6f91'), -0.3, 0, 1.15)], any: () => [] } },
});
const BRIDGE_MODEL = {
  pencil: () => [...xfr(PARTS.pencil(), 0, 0.5, 0, 0, -PI / 2, 0, 6.2), T(box(1.5, 0.12, 11), '#c98a4e', 0, 1.36, 0), ...[-1, 1].flatMap(sd => [-4.5, -1.5, 1.5, 4.5].map(z => T(cyl(0.06, 0.06, 0.7, 6), '#8a5530', sd * 0.7, 1.7, z))), ...[-1, 1].map(sd => T(cyl(0.04, 0.04, 9.4, 6), '#d9b77a', sd * 0.7, 2.0, 0, PI / 2))],
  oldbook: () => { const L = []; for (let i = 0; i < 10; i++) { const a = (i / 9 - 0.5) * 1.6; const z = Math.sin(a) * 6.4, y = Math.cos(a) * 2.2 - 0.4; L.push(T(box(2.4, 0.18, 1.32), i % 2 ? '#f4ead2' : '#efe3c4', 0, y, z, -a * 0.55)); } L.push(T(box(2.5, 0.1, 13.4), '#4f7f46', 0, -0.2, 0), T(box(0.12, 0.02, 3.0), '#d23b33', 0.9, 2.0, 0, 0, 0, 0.1)); return L; },
};
// 通用附件：组合等没有专门改造零件的旧物用（门、窗）；招牌、小旗所有设施都用
const ADDON = {
  door: () => doorP(0.8),
  window: () => winP(0.2, false),
  sign: () => [T(cyl(0.05, 0.06, 1.02, 6), '#8a5530', 0, 0.51, 0), T(box(0.9, 0.42, 0.08), '#f2e3c8', 0, 1.25, 0.05), T(box(0.98, 0.5, 0.05), '#a8683a', 0, 1.25, 0.0), T(sph(0.08, 8, 6), '#7cb85a', -0.25, 1.25, 0.1), T(sph(0.08, 8, 6), '#e8433a', 0.25, 1.25, 0.1)],
  flag: () => [T(cyl(0.03, 0.03, 1.2, 6), '#6b4a2a', 0, 0.6, 0), T(box(0.02, 0.32, 0.5), '#f39a3d', 0, 1.02, 0.26)],
};

export class Props {
  constructor(scene) {
    this.scene = scene; this.lots = new Map(); this.proj = new Map(); this.sets = {}; this.flowers = []; this.flowerDirty = true;
    const map = atlas();
    this.lmat = { main: M('#ffffff', { vc: true, r: 0.62, map }), metal: M('#ffffff', { vc: true, r: 0.32, m: 0.55, map }), glass: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.4, roughness: 0.06, metalness: 0.1, depthWrite: false }), glow: new THREE.MeshBasicMaterial({ vertexColors: true }) };
    this.lmat.plain = M('#ffffff', { vc: true, r: 0.62, map, wx: 0 });
    this.mat = this.lmat.main; this.layersOf = {};
    // 一个造型按材质层拆成几个 InstancedMesh（key#main / key#metal / key#glass / key#glow），put(key) 一次写所有层
    const mk = (key, parts, cap, nowx = false) => { const L = mergeL(parts); this.geos[key] = L; this.layersOf[key] = [];
      for (const layer in L) { const im = new THREE.InstancedMesh(L[layer], this.lmat[nowx && layer === 'main' ? 'plain' : layer], cap); im.count = 0; im.frustumCulled = false; im.castShadow = layer !== 'glass' && layer !== 'glow'; im.receiveShadow = layer !== 'glow'; if (layer === 'glass') im.renderOrder = 1;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.setColorAt(0, _c.set('#ffffff')); scene.add(im); this.sets[key + '#' + layer] = { im, n: 0, cap }; this.layersOf[key].push(key + '#' + layer); } };
    this.geos = {};
    for (const k of Object.keys(PARTS)) if (!k.startsWith('_') && ITEM_K[k]) mk(k, ITEM_MODEL(k), 10);
    for (const k in RENO) { const R = RENO[k]; if (R.r1) mk(k + '|r1', R.r1(), 10); if (R.r2) mk(k + '|r2', R.r2(), 10); for (const u in R.r3 || {}) { const p = R.r3[u](); if (p.length) mk(k + '|r3|' + u, p, 10); } }
    for (const c of COMBOS) mk('combo_' + c.id, COMBO_MODEL[c.id](), 4);
    for (const k in BRIDGE_MODEL) mk('bridge_' + k, BRIDGE_MODEL[k](), 2);
    for (const k in OVERLAY) mk('ov_' + k, OVERLAY[k](), 4);
    for (const k in ADDON) mk('add_' + k, ADDON[k](), 48);
    mk('add_leaf', LEAF_COVER(), 24); for (let k = 0; k < 4; k++) mk('snowman_' + k, SNOWMAN(k), 6, true); for (const k in FEST) { mk('fest_' + k, FEST[k](), 8, true); mk('fbunt_' + k, BUNTING(k), 8, true); }
    // 花：茎叶 + 花瓣 + 花心（实例色区分花种）
    const stem = ([T(cyl(0.035, 0.045, 1, 5), '#4f9f3a', 0, 0.5), T(sph(0.16, 6, 4), '#5fb04a', 0.12, 0.35, 0, 0, 0, 0.6, 1, 0.3, 0.6), T(sph(0.14, 6, 4), '#5fb04a', -0.1, 0.55, 0.03, 0, 0, -0.6, 1, 0.3, 0.6)]);
    const petal = (Array.from({ length: 6 }, (_, k) => T(sph(0.13, 8, 5), '#ffffff', Math.cos(k / 6 * TAU) * 0.15, 0, Math.sin(k / 6 * TAU) * 0.15, 0, 0, 0, 1, 0.35, 1)));
    const mid = ([T(sph(0.09, 8, 6), '#ffffff', 0, 0.02, 0)]);
    const mound = ([T(sph(0.32, 10, 5, 0, TAU, 0, PI / 2), '#7a5434', 0, 0, 0, 0, 0, 0, 1, 0.35, 1)]);
    mk('f_stem', stem, 64); mk('f_petal', petal, 64); mk('f_mid', mid, 64); mk('f_mound', mound, 64);
    this.sets['f_stem#main'].im.castShadow = false; this.sets['f_mound#main'].im.castShadow = false;
    // 放置模式：悬浮旧物（非模板旧物用这里的模型）、地面绿/红圈、落地尘土
    this.ghostMat = M('#ffffff', { vc: true, r: 0.6, emissive: '#fff4e0', ei: 0.12, map });
    this.ghost = new THREE.Group(); this.ghost.visible = false; scene.add(this.ghost);
    const ringT = ctex(256, 256, (c) => { c.clearRect(0, 0, 256, 256); const g = c.createRadialGradient(128, 128, 30, 128, 128, 128); g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(0.78, 'rgba(255,255,255,0.32)'); g.addColorStop(0.86, 'rgba(255,255,255,0.95)'); g.addColorStop(0.93, 'rgba(255,255,255,0.0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 7; c.setLineDash([16, 12]); c.beginPath(); c.arc(128, 128, 104, 0, TAU); c.stroke(); });
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: ringT, transparent: true, depthWrite: false, color: '#7ed957', polygonOffset: true, polygonOffsetFactor: -4 }));
    this.marker.visible = false; this.marker.renderOrder = 2; scene.add(this.marker);
    const shT = ctex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(30,40,20,0.5)'); g.addColorStop(1, 'rgba(30,40,20,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: shT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); this.shadow.visible = false; scene.add(this.shadow);
    const dustT = ctex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,248,230,0.9)'); g.addColorStop(1, 'rgba(255,248,230,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
    this.dust = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: dustT, transparent: true, depthWrite: false }), 24); this.dust.count = 0; this.dust.frustumCulled = false; scene.add(this.dust);
    this.puffs = [];
  }
  has(rk) { return !!this.layersOf[rk]; }
  // ---------------------------------------------------------------- 木牌上的字：每块牌一张小网格（正反两面），同一句话共用一张 canvas 贴图
  signTex(text) {
    const C = this._signTex || (this._signTex = new Map()); if (C.has(text)) return C.get(text);
    const tex = ctex(256, 112, (c) => { c.clearRect(0, 0, 256, 112); let fs = 64; c.font = `900 ${fs}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif`; while (c.measureText(text).width > 232 && fs > 30) { fs -= 4; c.font = `900 ${fs}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif`; }
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 8; c.strokeStyle = 'rgba(255,248,232,0.9)'; c.strokeText(text, 128, 60); c.fillStyle = text === '施工中' ? '#b5442e' : '#4a2c14'; c.fillText(text, 128, 60); });
    tex.anisotropy = 4; const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.FrontSide });
    C.set(text, mat); return mat;
  }
  signLabel(d, text, r) {
    if (!text) return; const L = this._labels || (this._labels = new Map()); let e = L.get(d.id);
    if (!e) { const g = this._signGeo || (this._signGeo = new THREE.PlaneGeometry(0.86, 0.38)); e = { a: new THREE.Mesh(g), b: new THREE.Mesh(g), text: null }; for (const m of [e.a, e.b]) { m.matrixAutoUpdate = false; m.frustumCulled = false; this.scene.add(m); } L.set(d.id, e); }
    if (e.text !== text) { e.text = text; e.a.material = e.b.material = this.signTex(text); }
    // 和 put('add_sign', -r-0.5, 0, r*0.55, yaw 0.4) 同一个摆法：牌面在牌子本地 (0, 1.25, 0.095)，背面转半圈
    _m3.compose(_v.set(-r - 0.5, 0, r * 0.55), _q.setFromEuler(_e.set(0, 0.4, 0)), _s.set(1, 1, 1)).premultiply(_m);
    e.a.matrix.copy(_m3).multiply(_m4.makeTranslation(0, 1.25, 0.096)); e.b.matrix.copy(_m3).multiply(_m4.makeRotationY(PI)).multiply(_m4.makeTranslation(0, 1.25, 0.026));
    e.a.visible = e.b.visible = true; e.seen = true;
  }
  signsEnd() { const L = this._labels; if (!L) return; for (const [id, e] of L) { if (!e.seen) { if (!this.lots.has(id)) { this.scene.remove(e.a, e.b); L.delete(id); } else e.a.visible = e.b.visible = false; } e.seen = false; } }
  // 某个造型的一组网格（放置模式的悬浮旧物、界面小图都用它）
  groupOf(key, ghost = false) { const L = this.geos[key]; if (!L) return null; const g = new THREE.Group(); for (const layer in L) { const m = new THREE.Mesh(L[layer], ghost && layer === 'main' ? this.ghostMat : this.lmat[layer]); m.castShadow = layer === 'main' || layer === 'metal'; g.add(m); } return g; }
  modelKey(l) { if (l.use === 'bridge') return 'bridge_' + l.kind; return l.kind; }
  setStruct(st) {
    const seen = new Set();
    this.overlays = st.lots.filter(l => l.combo && OVERLAY[l.combo] && TEMPLATE_KINDS.has(l.kind)).map(l => ({ id: l.id, key: 'ov_' + l.combo, x: l.x, z: l.z, rot: l.rot, r: l.r, done: l.done }));
    for (const l of st.lots) {
      if (TEMPLATE_KINDS.has(l.kind)) continue; const key = this.modelKey(l); if (!this.layersOf[key]) continue;
      seen.add(l.id); let d = this.lots.get(l.id);
      if (!d) { d = { id: l.id, x: l.x, z: l.z, yaw: l.rot, fall: l.stage === 'landed' && this.justDropped(l) ? 1 : 0 }; this.lots.set(l.id, d); }
      Object.assign(d, { key, name: l.name, item: l.item, combo: l.combo, kind: l.kind, lx: l.x, lz: l.z, rot: l.rot, r: l.r, done: l.done, stage: l.stage, use: l.use, fac: l.fac, shop: l.shop, damp: l.damp || 0, old: l.old || 0, cover: l.cover || 0, carry: l.carry || 0, pond: l.pond || 0 });
    }
    for (const id of [...this.lots.keys()]) if (!seen.has(id)) this.lots.delete(id);
    this.flowers = st.flowers || []; this.flowerDirty = true;
    this.snowmen = st.snowmen || []; this.fest = st.fest || null;
  }
  justDropped(l) { const p = this.pendingDrop; return p && Math.hypot(p.x - l.x, p.z - l.z) < 0.5 && performance.now() - p.t < 4000; }
  setProjects(list) { this.proj.clear(); for (const p of list) this.proj.set(p.lot, p); }
  // ---------------------------------------------------------------- 放置模式
  setGhost(g) { // { item, kind, x, z, yaw, h, ok, r, show }
    if (!g) { this.ghost.visible = false; this.marker.visible = false; this.shadow.visible = false; return; }
    const tmpl = TEMPLATE_KINDS.has(g.kind);
    if (!tmpl && this.ghostKey !== g.kind && this.geos[g.kind]) { this.ghostKey = g.kind; this.ghost.clear(); this.ghost.add(this.groupOf(g.kind, true)); }
    this.ghost.visible = !tmpl && g.show !== false && !!this.geos[g.kind]; const s = g.r; const y = (g.x * g.x + g.z * g.z > (WORLD_R + 4) ** 2 ? groundH(g.x, g.z) : 0);
    this.ghost.position.set(g.x, y + g.h, g.z); this.ghost.rotation.set(Math.sin(g.t * 1.6) * 0.04, g.yaw, Math.sin(g.t * 1.3) * 0.05); this.ghost.scale.setScalar(s);
    this.marker.visible = g.marker !== false; this.marker.position.set(g.x, y + 0.06, g.z); const fb = g.foot; const ms = fb ? Math.max(-fb[0], fb[1], -fb[2], fb[3]) + 0.5 : g.r * 1.25 + 0.6; this.marker.scale.set(ms, 1, ms); // 圈的大小 = 真实占地（含改造后可能的样子）
    this.marker.material.color.set(g.ok ? '#8ee86a' : '#ff6b5a'); this.marker.material.opacity = 0.75 + Math.sin(g.t * 4) * 0.2;
    const hill = y > 0.05; this.marker.material.depthTest = this.shadow.material.depthTest = !hill; // 花园外圈的草坪有起伏：平的圈别被坡埋住一半
    this.shadow.visible = g.h > 0.1; this.shadow.position.set(g.x, y + 0.05, g.z); const ss = g.r * (1.0 + 0.6 / (1 + g.h * 0.2)); this.shadow.scale.set(ss, 1, ss); this.shadow.material.opacity = clamp(1.2 - g.h * 0.08, 0.25, 0.9);
  }
  puff(x, z, r) { for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; this.puffs.push({ x, z, a, r, t: 0 }); } }
  // ---------------------------------------------------------------- 每帧
  update(dt, t, camera) {
    for (const k in this.sets) this.sets[k].n = 0;
    const put = (key, x, y, z, yaw, sx, sy = sx, sz = sx, col = null, pre = null) => { const Ls = this.layersOf[key]; if (!Ls) return; _q.setFromEuler(_e.set(0, yaw, 0)); _m2.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)); if (pre) _m2.premultiply(pre); const cc = col || _c.set('#ffffff');
      for (const sk of Ls) { const S = this.sets[sk]; if (S.n >= S.cap) continue; S.im.setMatrixAt(S.n, _m2); S.im.setColorAt(S.n, this._wip && sk.endsWith('#glow') ? _cw : cc); S.n++; } };
    for (const d of this.lots.values()) {
      this._wip = false; if (d.id === this.hideId) continue; // 正在进屋：换成剖面模型（render/interior.js）
      const p = this.proj.get(d.id); let tx = d.lx, tz = d.lz, tyaw = d.rot, dusty = 0, moving = 0, prog = d.done ? 1 : 0;
      if (p && (p.stage === 'gather' || p.stage === 'haul')) { tx = p.x; tz = p.z; tyaw = p.yaw; moving = p.moving; dusty = 0; }
      else if (p && p.stage === 'renovate') { prog = p.prog; dusty = 1 - prog; }
      const ch = d.carry && this.chars ? this.chars.get(d.carry) : null; // 下雨天被居民抱着去屋檐下：画在它头顶上，缩小一点
      if (ch) { tx = ch.x; tz = ch.z; }
      const k = Math.min(1, dt * (ch ? 12 : 5)); const jump = Math.hypot(tx - d.x, tz - d.z) > 30;
      d.x = jump ? tx : lerp(d.x, tx, k); d.z = jump ? tz : lerp(d.z, tz, k); d.yaw += Math.atan2(Math.sin(tyaw - d.yaw), Math.cos(tyaw - d.yaw)) * (jump ? 1 : k);
      let y = Math.hypot(d.x, d.z) > WORLD_R + 4 ? groundH(d.x, d.z) : 0;
      if (ch) { put(d.key, d.x, (ch.y || 0) + 1.2, d.z, ch.yaw || 0, d.r * 0.3, d.r * 0.3, d.r * 0.3); continue; }
      if (d.fac === 'boat' || (d.pond && d.stage === 'landed')) { y += 0.06 + Math.sin(t * 1.3 + d.id) * 0.05; }
      if (d.fall > 0) { d.fall = Math.max(0, d.fall - dt * 1.6); const f = d.fall; y += f * f * 9; if (f === 0) this.puff(d.x, d.z, d.r); }
      if (moving) y += Math.abs(Math.sin(t * 4.4 + d.id)) * 0.05;
      const bridge = d.use === 'bridge'; const s = bridge ? 1 : d.r; const wip = !d.done && d.stage !== 'landed' && !bridge; const tintV = (1 - dusty * 0.28) * (1 - d.damp * 0.22) * (wip ? 0.82 : 1); this._wip = wip && d.stage === 'renovate'; /* 改造中略灰暗；窗灯不亮（见 put 的发光层） */ _c.setRGB(tintV, tintV * 0.97, tintV * (0.93 + d.damp * 0.05)); if (d.old) _c.multiply(_c2.setRGB(0.72, 0.66, 0.56)); // 受潮发暗、淋旧了发黄发灰
      if (d.cover === 1 && !d.done) put('add_leaf', d.x, y + d.r * 0.95, d.z, d.yaw + 0.6, d.r * 1.2, d.r * 1.2, d.r * 1.2);
      const yb = bridge && !(p && (p.stage === 'gather' || p.stage === 'haul')) ? 0 : y;
      if (bridge && p && (p.stage === 'gather' || p.stage === 'haul')) put(d.kind, d.x, y, d.z, d.yaw, 2.2, 2.2, 2.2, _c);
      else put(d.key, d.x, yb, d.z, d.yaw, s, s, s, _c);
      if (bridge || d.stage === 'landed' || d.stage === 'haul') continue;
      // 改造：门和台阶 → 窗和灯 → 按用途的装饰；再加招牌/小旗（按改造进度出现）
      const deco = d.use === 'deco' || d.use === 'mat'; const house = d.use === 'home' || d.use === 'shop';
      const r3k = [d.kind + '|r3|' + (d.fac || d.shop || d.use), d.kind + '|r3|any'].find(k => this.layersOf[k]);
      if (deco) { if (r3k && r3k.endsWith('|deco')) put(r3k, d.x, y, d.z, d.yaw, s, s, s, _c); continue; }
      if (house && prog > 0.3) put(this.layersOf[d.kind + '|r1'] ? d.kind + '|r1' : null, d.x, y, d.z, d.yaw, s, s, s, _c);
      if (house && prog > 0.62) put(this.layersOf[d.kind + '|r2'] ? d.kind + '|r2' : null, d.x, y, d.z, d.yaw, s, s, s, _c);
      if (prog > 0.95 && r3k && !r3k.endsWith('|deco')) put(r3k, d.x, y, d.z, d.yaw, s, s, s, _c);
      _m.compose(_v.set(d.x, y, d.z), _q.setFromEuler(_e.set(0, d.yaw, 0)), _s.set(1, 1, 1));
      const H = (ITEM_K[d.kind] || { h: 2 }).h; const r = d.r;
      if (house && prog > 0.3 && !this.layersOf[d.kind + '|r1']) put('add_door', 0, 0, r * 0.98, 0, Math.max(0.9, r * 0.38), Math.max(0.9, r * 0.38), 1, null, _m);
      if (house && prog > 0.62 && !this.layersOf[d.kind + '|r2']) put('add_window', r * 0.42, H * 0.42, r * 0.93, 0, Math.max(0.8, r * 0.3), Math.max(0.8, r * 0.3), 1, null, _m);
      const wipSign = !d.done && d.stage === 'renovate' && prog > 0.05; if (wipSign) { put('add_sign', -r - 0.5, 0, r * 0.55, 0.4, 1, 1, 1, null, _m); this.signLabel(d, '施工中', r); }
      if (d.done) { put('add_sign', -r - 0.5, 0, r * 0.55, 0.4, 1, 1, 1, null, _m); this.signLabel(d, signName(d), r); if (d.use === 'fac') put('add_flag', 0, Math.max(H, 1.2) * Math.min(1, r / 2.2) * 0.95, 0, Math.sin(t * 2 + d.id) * 0.4, 1, 1, 1, null, _m); }
    }
    this._wip = false; this.signsEnd();
    // 雪人、节日布置（广场四周 8 个位置，按布置进度一件件出现）
    for (const sm of this.snowmen || []) put('snowman_' + (sm[4] % 4), sm[1], 0, sm[2], sm[3], 1, 1, 1);
    if (this.fest && this.layersOf['fest_' + this.fest.id]) { const id = this.fest.id, n = Math.round(this.fest.prog * 8), R = 12.2, S = 1.6; for (let i = 0; i < n; i++) { const a = PI / 4 + Math.floor(i / 2) * PI / 2 + (i % 2 ? 0.32 : -0.32); put('fest_' + id, Math.cos(a) * R, 0, Math.sin(a) * R, -a + PI / 2, S, S, S); if (i % 2) { const m = a - 0.32; put('fbunt_' + id, Math.cos(m) * R * 0.995, 0, Math.sin(m) * R * 0.995, -m, 1, 1, 1); } } }
    for (const o of this.overlays || []) { if (o.id === this.hideId) continue; const p = this.proj.get(o.id); const prog = o.done ? 1 : p && p.stage === 'renovate' ? p.prog : 0; if (prog < 0.15) continue; const sc = o.r * Math.min(1, 0.6 + prog * 0.4); put(o.key, o.x, 0, o.z, o.rot, sc, sc, sc); }
    // 花
    for (const f of this.flowers) {
      const [, x, z, kind, stg] = f; const S = SEEDS[kind] || SEEDS.daisy; const sw = Math.sin(t * 1.6 + x * 0.7 + z) * 0.06;
      put('f_mound', x, 0.01, z, 0, 1, 1, 1);
      if (stg >= 1) { const h = stg === 1 ? 0.45 : stg === 2 ? 0.8 : 1.05; _q.setFromEuler(_e.set(sw, x, sw * 0.6)); _m2.compose(_v.set(x, 0, z), _q, _s.set(1, h, 1)); const St = this.sets['f_stem#main']; if (St.n < St.cap) { St.im.setMatrixAt(St.n, _m2); St.im.setColorAt(St.n, _c.set('#ffffff')); St.n++; }
        if (stg >= 2) { const bs = stg === 2 ? 0.45 : kind === 'sunflower' ? 1.5 : 1.1; const bx = x + Math.sin(sw) * h, bz = z; put('f_petal', bx, h + 0.02, bz, x, bs, bs, bs, _c.set(stg === 2 ? '#9ccf6a' : S.col)); if (stg === 3) put('f_mid', bx, h + 0.05, bz, 0, bs, bs, bs, _c.set(S.mid)); } }
    }
    for (const k in this.sets) { const S = this.sets[k]; S.im.count = S.n; S.im.visible = S.n > 0; if (S.n) { S.im.instanceMatrix.needsUpdate = true; if (S.im.instanceColor) S.im.instanceColor.needsUpdate = true; } } // 空的层不用每帧重传
    // 落地尘土
    let nd = 0; this.puffs = this.puffs.filter(p => (p.t += dt) < 0.9);
    for (const p of this.puffs) { if (nd >= 24) break; const u = p.t / 0.9; const rr = p.r * (0.9 + u * 0.9); _q.copy(camera.quaternion); const sc = (0.9 + u * 1.4) * (1 - u * 0.5); _m2.compose(_v.set(p.x + Math.cos(p.a) * rr, 0.3 + u * 0.6, p.z + Math.sin(p.a) * rr), _q, _s.set(sc, sc, sc)); this.dust.setMatrixAt(nd++, _m2); }
    this.dust.count = nd; this.dust.instanceMatrix.needsUpdate = true; this.dust.material.opacity = 1;
  }
  // 进屋用：这件旧物建筑（或模板房子上的组合外套）的所有零件，坐标是本地坐标（和 update() 里画的一样）
  cutParts(id) {
    const parts = []; const addKey = (key, m) => { const L = this.geos[key]; if (!L) return; for (const layer in L) parts.push({ geo: L[layer], layer, src: this.lmat[layer], key: 'props#' + layer, m }); };
    const S = (s) => new THREE.Matrix4().makeScale(s, s, s);
    const o = (this.overlays || []).find(o => o.id === id); if (o) { addKey(o.key, S(o.r)); return { parts }; }
    const d = this.lots.get(id); if (!d || !d.done || d.stage !== 'done' || d.use === 'bridge') return null;
    const s = d.r; addKey(d.key, S(s));
    const house = d.use === 'home' || d.use === 'shop'; const r3k = [d.kind + '|r3|' + (d.fac || d.shop || d.use), d.kind + '|r3|any'].find(k => this.layersOf[k]);
    const r1 = this.geos[d.kind + '|r1']; const mid = r1 && Object.values(r1).some(g => { g.computeBoundingSphere(); const c = g.boundingSphere.center; return Math.hypot(c.x, c.z) < 0.35; }); // 有的旧物门是摆在中间藏在壳里的：进屋时不要它（不然会立在屋子中间）
    if (house && this.layersOf[d.kind + '|r1'] && !mid) addKey(d.kind + '|r1', S(s)); if (house && this.layersOf[d.kind + '|r2']) addKey(d.kind + '|r2', S(s));
    if (r3k && !r3k.endsWith('|deco')) addKey(r3k, S(s));
    const H = (ITEM_K[d.kind] || { h: 2 }).h, r = d.r; const C = (x, y, z, yaw, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(sx, sy, sz));
    if (house && !this.layersOf[d.kind + '|r1']) addKey('add_door', C(0, 0, r * 0.98, 0, Math.max(0.9, r * 0.38), Math.max(0.9, r * 0.38), 1));
    if (house && !this.layersOf[d.kind + '|r2']) addKey('add_window', C(r * 0.42, H * 0.42, r * 0.93, 0, Math.max(0.8, r * 0.3), Math.max(0.8, r * 0.3), 1));
    return { parts, base: d.kind, rk: d.kind, x: d.x, z: d.z, yaw: d.yaw, y: Math.hypot(d.x, d.z) > WORLD_R + 4 ? groundH(d.x, d.z) : 0, r: d.r, h: H, door: [0, r * 0.98], doorY: 0, tmpl: false, use: d.use };
  }
  extentPoints(P) { for (const d of this.lots.values()) if (d.stage !== 'far') P.push([d.lx, 0, d.lz]); }
}
