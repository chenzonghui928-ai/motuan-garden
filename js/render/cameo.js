// Lenia 的身影（只露局部，按官方形象和 lenia-model.js 的 LENIA_H 尺度）：
//   legs  白天：腰以下站在花园边的草丛里（官方牛仔裤卷边 + 白袜 + 小白鞋），腰部藏在一丛高高的观赏草里；
//   water 白天：一只大喷壶从画面外伸进来，倾斜着给花园边的花浇水（不画手臂）；
//   window 夜里：Lenia 家窗户的暖光落在草地上，光里是她趴在窗边的长卷发剪影。
// 偶尔出现几十秒（由 main.js 安排），小动物会抬头看、冒统一气泡；身影本身可以点（main.js 用 hit() 判断），点了 Lenia 说话、偶尔送东西。
// 模型第一次出现时才建（省开局时间）；不出现时整组隐藏，不占绘制。
import * as THREE from 'three';
import { ctex, PI, TAU, clamp, lerp, smooth, M as M0, bake, tint, mergeList } from '../lib/core.js';
import { groundH, makeTuftGeo, OUTER_TREES } from '../lib/environment.js';
import { streamDist, GATES } from '../shared/layout.js';
import { createLenia, leniaMaterials, LENIA_H } from '../lib/lenia-model.js';

const gy = (x, z) => groundH(x, z);
const CALF = 0.2 * LENIA_H; // 看得见的腿（膝盖往上慢慢淡掉）

// 花园边的花圃：低矮蓬松的叶丛 + 小雏菊、粉紫小花、几簇草（和小镇花草同一套画法，按人类尺度放大）。常驻在花园外圈，Lenia 偶尔站在花圃后面
const BED_N = 4;
function bedGeo(seed) {
  let a = seed * 9301 + 49297; const rnd = () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; const RR = (x, y) => x + (y - x) * rnd();
  const parts = []; const col = new THREE.Color();
  for (let i = 0; i < 9; i++) { // 叶丛：几个压扁的圆球挤在一起，前低后高
    const ang = RR(0, TAU), r = RR(0.3, 2.2); const x = Math.cos(ang) * r * 1.3, z = Math.sin(ang) * r * 0.75 + 0.4; const sz = RR(0.7, 1.15) * (1 - r * 0.12);
    col.setHSL(RR(0.25, 0.31), RR(0.42, 0.58), RR(0.3, 0.42)); parts.push(tint(bake(new THREE.IcosahedronGeometry(1, 2), [x, sz * 0.42, z], [0, RR(0, TAU), 0], [sz * 1.2, sz * 0.78, sz]), col.getStyle()));
  }
  for (let i = 0; i < 6; i++) { const ang = RR(0, TAU), r = RR(1.4, 2.8); parts.push(bake(makeTuftGeo(7), [Math.cos(ang) * r * 1.3, 0, Math.sin(ang) * r * 0.8], [0, RR(0, TAU), 0], [2.4, RR(1.6, 2.3), 2.4])); }
  const petals = new THREE.Shape(); for (let i = 0; i <= 20; i++) { const q = i / 20 * TAU; const r = 0.13 + 0.09 * Math.pow(Math.abs(Math.cos(q * 5)), 0.6); const x = Math.cos(q) * r, y = Math.sin(q) * r; i ? petals.lineTo(x, y) : petals.moveTo(x, y); }
  const pg = new THREE.ShapeGeometry(petals);
  for (let i = 0; i < 16; i++) { // 小花：白雏菊、粉的、淡紫的，开在叶丛上
    const ang = RR(0, TAU), r = RR(0.2, 2.4); const x = Math.cos(ang) * r * 1.3, z = Math.sin(ang) * r * 0.75 + 0.3; const h = RR(0.95, 1.55) * (1 - r * 0.1); const k = RR(1.7, 2.3);
    const pc = ['#ffffff', '#ffffff', '#ffb3c8', '#d9c2ff', '#fff2a8'][Math.floor(rnd() * 5)];
    parts.push(tint(new THREE.CylinderGeometry(0.03, 0.04, h, 4).translate(x, h / 2, z), '#4f9a3c'));
    parts.push(tint(bake(pg, [x, h, z], [-PI / 2 + RR(0.1, 0.5), RR(0, TAU), 0], [k, k, k]), pc));
    parts.push(tint(bake(new THREE.SphereGeometry(0.075, 8, 6), [x, h + 0.03, z], [0, 0, 0], [k, k * 0.6, k]), pc === '#fff2a8' ? '#f2a33a' : '#ffcf3a'));
  }
  return mergeList(parts, true);
}
// 腿：只露小腿以下（官方牛仔裤宽裤腿 + 明显的卷边 + 白袜），往上慢慢淡掉——像镜头只拍到花圃边的一截，不会露出“切口”
const FADE = { uFade0: { value: 0 }, uFade1: { value: 1 } }; // 世界高度：裤腿从膝盖上一点往上慢慢淡掉（每帧按脚下地面高度设）
function fadeDenim(M) {
  const m = M.denim.clone(); m.transparent = false; m.alphaHash = true; // 抖动透明：照样写深度，淡掉的地方不会透出裤管里面的接缝
  m.onBeforeCompile = (sh) => { M.denim.onBeforeCompile(sh); Object.assign(sh.uniforms, FADE);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vFy;').replace('#include <project_vertex>', '#include <project_vertex>\nvFy = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFy; uniform float uFade0, uFade1;').replace('#include <alphatest_fragment>', 'diffuseColor.a *= 1.0 - smoothstep(uFade0, uFade1, vFy);\n#include <alphatest_fragment>'); };
  m.customProgramCacheKey = () => 'leniaFadeDenim'; return m;
}
function buildLegs() {
  const L = createLenia(); L.setPose('idle', true); L.update(0, 0);
  L.rig.J.chest.visible = false; // 上身（开衫、手、头）整个不画
  const M = leniaMaterials(); const fm = fadeDenim(M);
  const cuffMat = new THREE.MeshStandardMaterial({ color: '#a7c0e2', roughness: 0.9, bumpMap: M.denim.bumpMap, bumpScale: 0.6 }); // 卷边翻出来的是牛仔布的反面，颜色浅一点
  L.group.traverse(o => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
    if (/^pelvis\|/.test(o.name)) { o.visible = false; o.castShadow = false; } // 腰：不画（大腿往上淡掉）
    else if (/\|denim/.test(o.name)) { o.material = fm; o.castShadow = /^kn/.test(o.name); } });
  for (const [s, Lk] of [[1, 'L'], [-1, 'R']]) { // 卷边：一圈厚厚的翻边 + 两道褶
    const kn = L.rig.J['kn' + Lk]; const ry = (y) => y - 0.215; const x = 0;
    const band = new THREE.Mesh(new THREE.LatheGeometry([[0.0715, 0.0], [0.079, 0.006], [0.081, 0.022], [0.079, 0.04], [0.071, 0.045]].map(([r, y]) => new THREE.Vector2(r, y)), 22), cuffMat); band.position.set(x, ry(0.045), 0); kn.add(band); // 一圈鼓鼓的翻边
    for (const [y, tilt] of [[0.11, 0.12], [0.135, -0.09]]) { const f = new THREE.Mesh(new THREE.TorusGeometry(0.0695, 0.005, 5, 20, PI * 1.1), fm); f.rotation.set(PI / 2, 0, s * 0.6 + tilt); f.position.set(x, ry(y), 0.004); kn.add(f); } // 布料褶
    for (const m of kn.children) if (m.isMesh && m.material === cuffMat) { m.castShadow = true; m.receiveShadow = true; }
  }
  const root = new THREE.Group(); root.add(L.group); root.visible = false; return { root, L };
}
function buildBeds(scene) {
  const mat = M0('#ffffff', { vc: true, r: 0.85, rim: 0.35, sway: 0.05, ds: true }); const beds = [];
  let k = 0; for (let i = 0; i < 64 && beds.length < BED_N; i++) { const a = 0.35 + i * 1.618 * 1.3, r = 63.5; const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (streamDist(x, z) < 12 || GATES.some(g => Math.hypot(g[0] - x, g[1] - z) < 15) || beds.some(b => Math.hypot(b.x - x, b.z - z) < 40)) continue;
    const m = new THREE.Mesh(bedGeo(++k * 7 + 3), mat); m.position.set(x, gy(x, z) - 0.05, z); m.rotation.y = -a - PI / 2; m.castShadow = true; m.receiveShadow = true; scene.add(m);
    beds.push({ x, z, a, m }); OUTER_TREES.push([x, z, 1.45]); } // 放旧物时也避开花圃
  return beds;
}
// 喷壶（自身单位建模，buildWater 里整体缩放到人类尺度：比花丛高一截）
function buildCan() {
  const M = leniaMaterials(); const g = new THREE.Group(); const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
  add(new THREE.CylinderGeometry(1.55, 1.75, 2.6, 26), M.can, 0, 1.3, 0);
  add(new THREE.SphereGeometry(1.55, 24, 10, 0, TAU, 0, PI / 2), M.can, 0, 2.6, 0).scale.set(1, 0.4, 1);
  add(new THREE.TorusGeometry(1.25, 0.16, 8, 24, PI), M.canDark, 0, 2.75, 0, 0, PI / 2, 0); // 提手（横跨壶顶）
  const sp = new THREE.Group(); sp.position.set(0, 0.6, 1.4); sp.rotation.x = 0.9; g.add(sp);
  const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 3.4, 12), M.can); s1.position.y = 1.7; s1.castShadow = true; sp.add(s1);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.22, 0.45, 14), M.canDark); rose.position.y = 3.5; sp.add(rose);
  const tip = new THREE.Object3D(); tip.position.y = 3.8; sp.add(tip);
  return { g, tip, top: 2.75 + 1.25 };
}
const CAN_K = 1.05; // 喷壶整体缩放：壶身约 3 个单位高，比花丛（约 2.6）高一截
function buildWater() {
  const root = new THREE.Group();
  const can = buildCan(); can.g.position.y = -1.5; // 以壶身中部为转轴倾斜
  const rig = new THREE.Group(); rig.rotation.order = 'YXZ'; rig.scale.setScalar(CAN_K); rig.add(can.g); root.add(rig);
  // 被浇水的几朵花（Lenia 家花园里的花，按人类尺度）
  const bed = new THREE.Group(); root.add(bed);
  const stem = new THREE.MeshStandardMaterial({ color: '#4f8f3e', roughness: 0.8 }); const pet = ['#ff8fb0', '#ffd23f', '#ffffff'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })), mid = new THREE.MeshStandardMaterial({ color: '#f2a33a', roughness: 0.6 });
  const add = (p, geo, m, x, y, z, sx = 1, sy = sx, sz = sx) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; p.add(o); return o; };
  [[0, 0, 2.6, 0], [1.7, 1.1, 2.0, 1], [-1.5, 1.3, 2.3, 2], [0.8, -1.6, 1.8, 1], [-1.9, -0.9, 2.1, 0]].forEach(([x, z, h, c]) => {
    add(bed, new THREE.CylinderGeometry(0.11, 0.14, h, 6), stem, x, h / 2, z);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; add(bed, new THREE.SphereGeometry(0.42, 10, 6), pet[c], x + Math.cos(a) * 0.5, h + 0.05, z + Math.sin(a) * 0.5, 1, 0.35, 1); }
    add(bed, new THREE.SphereGeometry(0.3, 10, 8), mid, x, h + 0.12, z, 1, 0.6, 1);
  });
  const N = 60; const pos = new Float32Array(N * 3); const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const drops = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#d8efff', size: 0.32, map: ctex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15); gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }, [1, 1], false), transparent: true, depthWrite: false }));
  drops.frustumCulled = false; const P = Array.from({ length: N }, () => ({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0 }));
  root.visible = false; drops.visible = false; return { root, rig, can, bed, drops, P, pos };
}
function girl(g, cx, cy, s, tilt = 0) { // 剪影：官方形象的中分长卷发（披到肩下、发梢一卷一卷）、圆脸，趴在窗台上手托着下巴
  g.save(); g.translate(cx, cy); g.rotate(tilt); g.scale(s, s);
  g.beginPath(); g.ellipse(0, -2, 20, 22, 0, 0, TAU); g.fill(); // 头
  g.beginPath(); g.moveTo(-21, -6); // 长卷发：两侧垂到肩下，边缘一串小弧（卷）
  for (let k = 0; k <= 6; k++) { const y = -6 + k * 9; g.quadraticCurveTo(-31 - (k % 2) * 4, y + 4, -26 - (k % 2) * 3, y + 9); }
  g.lineTo(26, 48); for (let k = 6; k >= 0; k--) { const y = -6 + k * 9; g.quadraticCurveTo(31 + (k % 2) * 4, y + 4, 21, y); }
  g.closePath(); g.fill();
  g.beginPath(); g.ellipse(0, 52, 42, 22, 0, PI, TAU); g.lineTo(42, 84); g.lineTo(-42, 84); g.fill(); // 肩膀（开衫）
  g.beginPath(); g.ellipse(-24, 36, 9, 18, 0.5, 0, TAU); g.fill(); // 托着下巴的手
  g.restore();
}
function windowTex(tilt) {
  return ctex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // 窗光：远处（靠房子一侧，画布上方）窄、近处宽的梯形，边缘柔和（blur 不支持的浏览器就是硬边）
    g.filter = 'blur(7px)'; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(70, 24); g.lineTo(186, 24); g.lineTo(234, 232); g.lineTo(22, 232); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.strokeStyle = '#000';
    g.filter = 'blur(2.5px)'; g.lineWidth = 10; g.beginPath(); g.moveTo(128, 18); g.lineTo(128, 240); g.moveTo(40, 112); g.lineTo(216, 112); g.stroke(); // 窗棂
    g.filter = 'blur(3px)'; girl(g, 128, 120, 1.35, tilt + PI); // 头朝窗外（画面远处）
    g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  }, [1, 1], false);
}
function shadowTex() {
  return ctex(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,1)';
    g.save(); g.translate(64, 40); g.scale(1, 1.25);
    g.beginPath(); g.ellipse(0, 0, 16, 18, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(-16, 0); g.quadraticCurveTo(-26, 22, -20, 40); g.lineTo(20, 40); g.quadraticCurveTo(26, 22, 16, 0); g.fill(); // 头 + 长卷发
    g.beginPath(); g.moveTo(-26, 34); g.quadraticCurveTo(0, 22, 26, 34); g.lineTo(30, 150); g.lineTo(-30, 150); g.fill(); // 身子（连衣裙）
    g.beginPath(); g.moveTo(26, 36); g.lineTo(44, 4); g.lineTo(52, 8); g.lineTo(32, 46); g.fill(); // 举起来挥手的胳膊
    g.fillRect(-18, 148, 12, 34); g.fillRect(6, 148, 12, 34);
    g.restore();
    const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.15, 'rgba(0,0,0,0)'); gr.addColorStop(0.3, 'rgba(0,0,0,1)'); // 脚那头（靠花园边）淡出
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
  }, [1, 1], false);
}
function buildWindow() {
  const tA = windowTex(0), tB = windowTex(-0.16), tS = shadowTex();
  const mat = new THREE.MeshBasicMaterial({ color: '#ffcf7a', map: tA, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, fog: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2), mat); m.renderOrder = 2; m.visible = false;
  return { root: m, mat, tA, tB, tS };
}
// 身影开关：老板 2026-10-16 定下“只露局部、按官方形象”，重做后打开
export const LENIA_CAMEO = true;
export class Cameo {
  constructor(scene, props) {
    this.scene = scene; this.props = props; this.win = buildWindow(); scene.add(this.win.root); this.beds = buildBeds(scene);
    this.legs = null; this.water = null; this.kind = null; this.t = 0; this.dur = 0; this.focus = { x: 0, z: 0 }; this.hitP = new THREE.Vector3(); this.seen = 0;
  }
  ensure(kind) {
    if (kind === 'legs' && !this.legs) { this.legs = buildLegs(); this.scene.add(this.legs.root); }
    if (kind === 'water' && !this.water) { this.water = buildWater(); this.scene.add(this.water.root, this.water.drops); }
  }
  get active() { return !!this.kind; }
  // kind: legs / water / window；az：放在哪个方位（通常是镜头对面的花园边，正好在画面里）
  start(kind, az, { night = 0, dur = 0 } = {}) {
    if (kind === 'boots') kind = 'legs';
    this.stop(); this.ensure(kind); this.kind = kind; this.t = 0; this.night = night; this.dur = dur || (kind === 'window' ? 48 : kind === 'water' ? 42 : 40);
    const r = kind === 'window' ? 60 : kind === 'water' ? 57 : 61; let a = az;
    const bad = (q) => streamDist(Math.cos(q) * r, Math.sin(q) * r) < 9 || GATES.some(g => Math.hypot(g[0] - Math.cos(q) * r, g[1] - Math.sin(q) * r) < 13);
    for (let k = 0; k < 40 && bad(a); k++) a += 0.12; // 别正好踩在溪里、挡住村口
    const x = Math.cos(a) * r, z = Math.sin(a) * r; this.a = a; this.x = x; this.z = z; this.focus = { x: Math.cos(a) * (r - 8), z: Math.sin(a) * (r - 8) };
    if (kind === 'legs') { // 站到离这个方位最近的花圃后面（往花园外一步），脸朝小镇
      let B = this.beds[0]; for (const b of this.beds) if (Math.abs(Math.atan2(Math.sin(b.a - az), Math.cos(b.a - az))) < Math.abs(Math.atan2(Math.sin(B.a - az), Math.cos(B.a - az)))) B = b;
      this.a = B.a; const tx = -Math.sin(B.a), tz = Math.cos(B.a); this.x = B.x + Math.cos(B.a) * 0.9 + tx * 2.7; this.z = B.z + Math.sin(B.a) * 0.9 + tz * 2.7; // 站在花圃旁边，脚边就是花 this.focus = { x: Math.cos(B.a) * 55, z: Math.sin(B.a) * 55 };
      const R = this.legs.root; R.position.set(this.x, gy(this.x, this.z) - 0.05, this.z); R.rotation.y = -B.a - PI / 2; R.visible = true; this.hitP.set(this.x, gy(this.x, this.z) + CALF * 0.6, this.z); return { x: this.x, z: this.z }; }
    if (kind === 'water') { const W = this.water; W.base = null; W.root.position.set(x, gy(x, z), z); W.root.rotation.y = -a + PI / 2; W.root.visible = true; W.drops.visible = true; for (const p of W.P) p.y = -999; this.hitP.set(x, gy(x, z) + 3, z); }
    if (kind === 'window') { const W = this.win; const S = night > 0.45 ? 1 : 0; W.night = S; let hy = gy(x, z); for (let k = 0; k < 9; k++) { const q = a + (k % 3 - 1) * 0.2, rr = r + (Math.floor(k / 3) - 1) * 12; hy = Math.max(hy, gy(Math.cos(q) * rr, Math.sin(q) * rr)); } W.root.position.set(x, hy + 0.2, z); W.root.rotation.y = PI / 2 - a; W.mat.map = S ? W.tA : W.tS; W.mat.blending = S ? THREE.AdditiveBlending : THREE.NormalBlending; W.mat.color.set(S ? '#ffb45e' : '#1d2a14'); W.mat.needsUpdate = true;
      if (S) W.root.scale.set(34, 1, 30); else W.root.scale.set(16, 1, 34); W.root.visible = true; this.hitP.set(x, hy + 0.3, z); }
    return { x, z };
  }
  stop() { this.kind = null; if (this.legs) this.legs.root.visible = false; if (this.water) { this.water.root.visible = false; this.water.drops.visible = false; } this.win.root.visible = false; }
  // 屏幕上点中了身影没有（main.js 投影后判断用）
  hit(camera, sx, sy, W, H) {
    if (!this.kind || this.t < 1 || this.t > this.dur - 2) return false; _v.copy(this.hitP).project(camera); if (_v.z > 1) return false;
    const px = (_v.x * 0.5 + 0.5) * W, py = (-_v.y * 0.5 + 0.5) * H; const dist = camera.position.distanceTo(this.hitP); const rad = Math.max(40, (this.kind === 'window' ? 14 : 6) / dist * H / (2 * Math.tan(camera.fov * PI / 360)));
    return Math.hypot(px - sx, py - sy) < rad;
  }
  update(dt, time) {
    if (!this.kind) return; this.t += dt; const t = this.t, D = this.dur; const inn = smooth(0, 3, t), out = smooth(D - 3.5, D, t);
    if (this.kind === 'legs') { // 从花园外走到花圃后面（往小镇方向挪几步），站一会儿、换个重心，最后走开
      const Lg = this.legs; const step = (1 - inn) * 9 + out * 9; const R = Lg.root; const dirx = Math.cos(this.a), dirz = Math.sin(this.a);
      const px = this.x + dirx * step, pz = this.z + dirz * step; const g0 = gy(px, pz); R.position.set(px, g0 - 0.05, pz); FADE.uFade0.value = g0 + 0.26 * LENIA_H; FADE.uFade1.value = g0 + 0.42 * LENIA_H;
      Lg.L.setPose(inn < 0.98 || out > 0.02 ? 'walk' : 'idle'); Lg.L.update(dt, time);
      if (Lg.L.pose === 'idle') { const J = Lg.L.rig.J; J.hipL.rotation.z += 0.07; J.hipR.rotation.z -= 0.07; J.anL.rotation.z -= 0.07; J.anR.rotation.z += 0.07; } // 站得稍微开一点，两条腿分得清
      if (t > D) this.stop();
    } else if (this.kind === 'water') {
      const W = this.water; const g0 = gy(this.x, this.z);
      if (!W.base) W.base = new THREE.Vector3(-5, 7, 0);
      const off = 1 - inn + out; W.rig.position.set(W.base.x - off * 16, W.base.y + off * 14 + Math.sin(time * 1.1) * 0.12, W.base.z); // 喷壶从花园外上方伸进来，浇完收回去
      const pour = smooth(3.5, 5.5, t) * (1 - smooth(D - 6, D - 4, t)); W.rig.rotation.set(pour * 0.95 + Math.sin(time * 1.3) * 0.04 * pour, PI / 2, Math.sin(time * 0.9) * 0.03);
      W.root.updateMatrixWorld(true); const rp = W.can.tip.getWorldPosition(_v); const dir = _d.set(0, 1, 0).transformDirection(W.can.tip.matrixWorld);
      let n = 0; for (const p of W.P) {
        if (p.y < g0) { if (pour > 0.6 && Math.random() < dt * 12) { p.x = rp.x + (Math.random() - 0.5) * 0.2; p.y = rp.y; p.z = rp.z + (Math.random() - 0.5) * 0.2; const sp = 2.5 + Math.random(); p.vx = dir.x * sp + (Math.random() - 0.5) * 0.5; p.vy = dir.y * sp; p.vz = dir.z * sp + (Math.random() - 0.5) * 0.5; } }
        else { p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
        W.pos[n++] = p.x; W.pos[n++] = p.y; W.pos[n++] = p.z;
      }
      W.drops.geometry.attributes.position.needsUpdate = true;
      // 让壶嘴慢慢对准花丛正上方（离花顶一点点），水珠刚好落在花上
      _a.set(this.x, g0 + 3.4, this.z); W.root.worldToLocal(_a); _b.copy(rp); W.root.worldToLocal(_b); _a.sub(_b); W.base.addScaledVector(_a, Math.min(1, dt * 4));
      this.hitP.set(rp.x, rp.y, rp.z);
      if (t > D) this.stop();
    } else if (this.kind === 'window') {
      const W = this.win; const op = smooth(0, 4, t) * (1 - out); W.mat.opacity = op * (W.night ? 0.95 : 0.34);
      if (W.night) W.mat.map = (Math.sin(t * 0.5) > 0.55) ? W.tB : W.tA; // 偶尔歪一下头
      else W.root.rotation.y = PI / 2 - this.a + Math.sin(t * 0.8) * 0.03;
      if (t > D) this.stop();
    }
  }
}
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
