// 造型库·住所：六种“人类遗落物件”住所 + 两种自然材料小屋（摘自 prototype-3d/main.js 并重组）
// 每个部件带“改造阶段”标签：0 = 原始物件（拖运时的样子），1 = 门/台阶，2 = 窗/灯，3 = 烟囱/屋顶/花盆等装饰
// buildTemplate(kind) 把整栋房子烘焙成按材质分桶的合并几何体，供实例化渲染（同造型多栋房子共享几何体）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHOP_TABLES } from '../shared/layout.js';
import { GEO, DETAIL, reseed, R, RI, pick, PI, TAU, clamp, lerp, M, MAT, TX, ctex, G, sphereG, boxG, cylG, torusG, add, lathe, archShape, circleShape, bake, norm, mergeList, tint, taperTube, wallGeometry, roundRectPts, STAGE, withStage } from './core.js';

export const makeDoor = (...a) => withStage(1, () => _makeDoor(...a));
function _makeDoor(w, h, o = {}) {
  const g = new THREE.Group();
  const round = !!o.round;
  const outer = round ? circleShape(w / 2 + 0.24, w / 2) : archShape(w + 0.48, h + 0.24);
  const holeS = round ? circleShape(w / 2, w / 2) : archShape(w, h);
  outer.holes.push(new THREE.Path(holeS.getPoints(Math.max(8, Math.round(28 * DETAIL.v)))));
  const depth = o.depth ?? 0.7;
  const fg = GEO.extrude(outer, { depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 24 });
  fg.translate(0, 0, -depth + 0.12);
  add(g, fg, o.frameMat || MAT.woodDark);
  add(g, GEO.shape(holeS, 24), MAT.dark, 0, 0, -0.14);
  const pivot = new THREE.Group(); pivot.position.set(-w / 2, 0, 0); pivot.userData.dyn = true; pivot.userData.door = true; g.add(pivot);
  const leafS = round ? circleShape(w / 2 - 0.03, w / 2) : archShape(w - 0.06, h - 0.03);
  const lg = GEO.extrude(leafS, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 24 });
  lg.translate(w / 2, 0, -0.05);
  add(pivot, lg, MAT.door);
  add(pivot, sphereG(0.085, 10, 8), M('#e8b64a', { r: 0.4 }), w * 0.84, round ? w * 0.48 : h * 0.43, 0.1);
  if (!o.noWin) {
    add(pivot, GEO.circle(round ? w * 0.17 : 0.21, 18), MAT.window, w / 2, round ? w * 0.68 : h * 0.72, 0.085);
    add(pivot, torusG(round ? w * 0.17 : 0.21, 0.035, 6, 18), MAT.woodDark, w / 2, round ? w * 0.68 : h * 0.72, 0.085);
  }
  // iron hinges
  for (const hy of [0.35, round ? w * 0.6 : h * 0.55]) add(pivot, boxG(0.42, 0.07, 0.03), MAT.dark, 0.25, hy, 0.09);
  return { group: g, pivot, angle: 0 };
}
export const makeRoundWindow = (...a) => withStage(2, () => _makeRoundWindow(...a));
function _makeRoundWindow(r = 0.5, o = {}) {
  const g = new THREE.Group();
  add(g, torusG(r, r * 0.2, 8, 24), o.frameMat || MAT.woodDark);
  add(g, GEO.circle(r, 22), MAT.window, 0, 0, -0.03);
  add(g, boxG(r * 2, 0.06, 0.06), o.frameMat || MAT.woodDark, 0, 0, 0.02);
  add(g, boxG(0.06, r * 2, 0.06), o.frameMat || MAT.woodDark, 0, 0, 0.02);
  if (!o.noSill) add(g, boxG(r * 1.5, 0.12, 0.3), MAT.woodMid, 0, -r - 0.1, 0.1);
  if (o.flowers) { add(g, boxG(r * 1.4, 0.24, 0.28), MAT.terracotta, 0, -r - 0.27, 0.2); for (let i = 0; i < 4; i++) add(g, sphereG(0.11, 8, 6), M(pick(['#ff6f91', '#ffd23f', '#ffffff', '#ff9a3c'])), -r * 0.55 + i * r * 0.37, -r - 0.08, 0.22); }
  return g;
}
export const makeLantern = (...a) => withStage(2, () => _makeLantern(...a));
function _makeLantern(parent, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
  add(g, cylG(0.05, 0.05, 0.25, 6), MAT.dark, 0, 0.1, 0);
  add(g, cylG(0.04, 0.3, 0.2, 4), MAT.dark, 0, -0.12, 0, 0, PI / 4);
  add(g, boxG(0.34, 0.42, 0.34), MAT.lantern, 0, -0.43, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, boxG(0.04, 0.44, 0.04), MAT.dark, sx * 0.17, -0.43, sz * 0.17);
  add(g, boxG(0.4, 0.06, 0.4), MAT.dark, 0, -0.66, 0);
  return g;
}
export const makePot = (...a) => withStage(3, () => _makePot(...a));
function _makePot(parent, x, y, z, s = 1, flowerCol) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
  add(g, cylG(0.32, 0.22, 0.45, 12), MAT.terracotta, 0, 0.22, 0);
  add(g, torusG(0.31, 0.05, 6, 16), MAT.terracotta, 0, 0.44, 0, PI / 2);
  add(g, sphereG(0.32, 10, 8), MAT.leaf, 0, 0.6, 0, 0, 0, 0, 1, 0.75, 1);
  const fc = flowerCol || pick(['#ff6f91', '#ffd23f', '#ff8a3d', '#c77dff', '#ffffff']);
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + R(0, 1); add(g, sphereG(0.09, 8, 6), M(fc, { r: 0.6 }), Math.cos(a) * 0.22, 0.75 + R(0, 0.1), Math.sin(a) * 0.22); }
  return g;
}
export const makeSteps = (...a) => withStage(1, () => _makeSteps(...a));
function _makeSteps(parent, x, z, w, n, stepH, stepD, mat, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
  for (let i = 0; i < n; i++) { add(g, boxG(w, stepH * (n - i), stepD), mat, 0, stepH * (n - i) / 2, -i * stepD); }
  return g;
}
export const makeCarrot = (...a) => withStage(3, () => _makeCarrot(...a));
function _makeCarrot(parent, x, y, z, s = 1, rx = 0, rz = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, 0, rz); g.scale.setScalar(s); parent.add(g);
  add(g, cylG(0.16, 0.02, 0.7, 10), MAT.orange, 0, -0.35, 0, PI, 0, 0);
  for (let i = 0; i < 3; i++) add(g, cylG(0.005, 0.06, 0.45, 5), MAT.green, (i - 1) * 0.06, 0.22, 0, 0, 0, (i - 1) * 0.35);
  return g;
}
function makeFence(parent, ax, az, bx, bz, h = 0.9, mat = MAT.woodMid) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 1.1)), ang = Math.atan2(bz - az, bx - ax);
  for (let i = 0; i <= n; i++) { const t = i / n; add(parent, boxG(0.16, h, 0.16), mat, lerp(ax, bx, t), h / 2, lerp(az, bz, t)); add(parent, sphereG(0.1, 8, 6), mat, lerp(ax, bx, t), h + 0.02, lerp(az, bz, t)); }
  for (const y of [h * 0.45, h * 0.85]) add(parent, boxG(len, 0.1, 0.08), mat, (ax + bx) / 2, y, (az + bz) / 2, 0, -ang, 0);
}
function onSurface(group, obj, angle, y, rAt, out = 0.12) {
  const r = rAt(y) + out; obj.position.set(Math.sin(angle) * r, y, Math.cos(angle) * r); obj.rotation.y = angle; group.add(obj); return obj;
}

function buildEgg() {
  const g = new THREE.Group(); const info = { kind: 'egg' }; STAGE.v = 0;
  const EH = 8.6, ER = 3.6, y0 = -0.6;
  const rAt = (y) => { const k = clamp((y - y0) / EH, 0, 1); const t = Math.acos(1 - 2 * k); return ER * Math.sin(t) * (1 + 0.13 * Math.cos(t)); };
  const pts = []; const tCut = 2.2;
  for (let i = 0; i <= 30; i++) { const t = 0.02 + (tCut - 0.02) * i / 30; pts.push([ER * Math.sin(t) * (1 + 0.13 * Math.cos(t)), y0 + EH * (1 - Math.cos(t)) / 2]); }
  const shellMat = M('#fff6e6', { map: TX.shell, r: 0.62, ds: true });
  add(g, lathe(pts, 48), shellMat);
  const yCut = pts[pts.length - 1][1], rCut = pts[pts.length - 1][0];
  // jagged broken crown
  const crown = GEO.cyl(rCut * 0.93, rCut, 1.4, 22, 1, true);
  const cp = crown.attributes.position;
  for (let i = 0; i <= 22; i++) { const h = i % 2 ? R(0.1, 0.5) : R(-0.75, -0.45); cp.setY(i, cp.getY(i) + h); const s = 1 + (i % 2 ? 0.05 : 0); cp.setX(i, cp.getX(i) * s); cp.setZ(i, cp.getZ(i) * s); }
  crown.computeVertexNormals();
  add(g, crown, shellMat, 0, yCut + 0.6, 0);
  STAGE.v = 3; // straw nest roof
  const strawMat = M('#ffffff', { map: TX.straw, r: 0.95 });
  add(g, torusG(rCut * 0.98, 0.62, 10, 36), strawMat, 0, yCut + 0.25, 0, PI / 2, 0, 0, 1, 1, 0.75);
  add(g, sphereG(rCut * 0.95, 28, 12), strawMat, 0, yCut + 0.15, 0, 0, 0, 0, 1, 0.42, 1);
  const stickMat = M('#e9bb64', { r: 0.9 });
  for (let i = 0; i < 46; i++) { const a = R(0, TAU), rr = rCut * R(0.7, 1.15); add(g, cylG(0.035, 0.035, R(0.9, 1.6), 4), i % 3 ? stickMat : strawMat, Math.cos(a) * rr, yCut + R(0.2, 0.8), Math.sin(a) * rr, R(-1.2, 1.2), a, R(1.0, 2.0)); }
  // little flowers on straw
  for (let i = 0; i < 6; i++) { const a = R(0, TAU); add(g, sphereG(0.13, 8, 6), M(pick(['#ffffff', '#ffd23f', '#ff8fb1'])), Math.cos(a) * rCut * 0.95, yCut + 0.75, Math.sin(a) * rCut * 0.95); }
  STAGE.v = 3; // mushroom chimney
  const chimX = 1.0, chimZ = -0.8, chimY = yCut + 0.7;
  add(g, cylG(0.32, 0.38, 1.6, 12), M('#efe2c8'), chimX, chimY + 0.6, chimZ);
  add(g, sphereG(0.75, 16, 8), M('#b4683a', { r: 0.8 }), chimX, chimY + 1.45, chimZ, 0, 0, 0, 1, 0.5, 1);
  info.smoke = [chimX, chimY + 1.9, chimZ];
  STAGE.v = 1; // deck + steps
  const deckH = 0.45; let rDoor = 0; for (let y = deckH; y <= deckH + 2.4; y += 0.1) rDoor = Math.max(rDoor, rAt(y)); rDoor -= 0.12;
  add(g, boxG(4.6, deckH, 2.6), MAT.wood, 0, deckH / 2, rDoor + 0.9);
  for (let i = 0; i < 5; i++) add(g, boxG(0.06, 0.02, 2.6), MAT.woodDark, -1.84 + i * 0.92, deckH + 0.005, rDoor + 0.9);
  makeSteps(g, 0, rDoor + 2.55, 1.6, 2, deckH / 2, 0.5, MAT.wood).rotation.y = PI;
  for (const sx of [-1, 1]) {
    add(g, cylG(0.14, 0.16, 1.4, 8), MAT.woodDark, sx * 2.2, deckH + 0.5, rDoor + 2.1);
    add(g, sphereG(0.17, 8, 6), MAT.woodDark, sx * 2.2, deckH + 1.22, rDoor + 2.1);
    add(g, boxG(0.12, 0.12, 1.8), MAT.woodMid, sx * 2.2, deckH + 0.95, rDoor + 1.2);
    add(g, cylG(0.12, 0.12, 0.9, 6), MAT.woodDark, sx * 2.2, deckH + 0.3, rDoor + 0.3);
    add(g, cylG(0.2, 0.25, deckH + 0.1, 8), MAT.rock, sx * 2.0, 0.2, rDoor + 2.1);
  }
  makePot(g, -1.6, deckH, rDoor + 1.6, 0.9, '#ffd23f');
  makePot(g, 1.6, deckH, rDoor + 1.6, 0.9, '#ff6f91');
  makePot(g, -2.6, 0, rDoor + 3.2, 0.8);
  // door
  const d = makeDoor(1.45, 2.35, { depth: 1.5 }); d.group.position.set(0, deckH, rDoor + 0.08); g.add(d.group);
  STAGE.v = 2; // lantern bracket by door
  add(g, boxG(0.12, 0.12, 0.8), MAT.dark, 1.15, deckH + 2.6, rDoor - 0.1);
  makeLantern(g, 1.15, deckH + 2.55, rDoor + 0.3, 0.9);
  STAGE.v = 2; // windows
  onSurface(g, makeRoundWindow(0.55, { flowers: true }), -0.75, 3.3, rAt, 0.12);
  onSurface(g, makeRoundWindow(0.48), 0.8, 4.3, rAt, 0.12);
  onSurface(g, makeRoundWindow(0.42), PI * 0.62, 2.6, rAt, 0.12);
  STAGE.v = 1; // base stones
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + R(-0.1, 0.1); const rr = rAt(0.1) + 0.15; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - PI / 2) < 0.45) continue; add(g, new THREE.IcosahedronGeometry(R(0.3, 0.5), 0), MAT.rock, Math.cos(a) * rr, 0.1, Math.sin(a) * rr, R(0, 3), R(0, 3), 0, 1, 0.6, 1); }
  info.door = [0, rDoor + 0.7]; info.doorY = deckH; STAGE.v = 0;
  return { g, info };
}

// ---------------------------------------------------------------- TEAPOT HOUSE
function buildTeapot() {
  const g = new THREE.Group(); const info = { kind: 'tea' }; STAGE.v = 0;
  const prof = [[0.01, 0], [2.9, 0], [3.6, 0.3], [4.2, 1.1], [4.45, 2.1], [4.35, 3.1], [3.85, 4.0], [3.15, 4.6], [2.75, 4.85]];
  const curve = new THREE.SplineCurve(prof.map(p => new THREE.Vector2(p[0], p[1])));
  const pp = curve.getPoints(40).map(v => [v.x, v.y]);
  const rAt = (y) => { for (let i = 1; i < pp.length; i++) if (pp[i][1] >= y) { const a = pp[i - 1], b = pp[i]; return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1] || 1)); } return 2.7; };
  const teal = M('#ffffff', { map: TX.teapot, r: 0.45, rim: 1.2 });
  const tealDark = M('#3a9e95', { r: 0.5 });
  const cream = M('#fff1d2', { r: 0.5 });
  add(g, lathe(pp, 56), teal);
  add(g, torusG(3.0, 0.22, 8, 48), cream, 0, 0.14, 0, PI / 2);
  add(g, torusG(2.78, 0.18, 8, 48), cream, 0, 4.85, 0, PI / 2);
  add(g, lathe([[2.8, 4.85], [2.75, 5.15], [2.25, 5.65], [1.3, 5.98], [0.01, 6.05]], 48), tealDark);
  add(g, sphereG(0.42, 16, 12), cream, 0, 6.2, 0);
  STAGE.v = 3; // chimney on the lid (knob chimney)
  add(g, cylG(0.38, 0.45, 1.5, 10), M('#c46a4a', { r: 0.9 }), 1.0, 6.4, -0.7);
  add(g, cylG(0.5, 0.5, 0.22, 10), M('#a2553a'), 1.0, 7.18, -0.7);
  info.smoke = [1.0, 7.4, -0.7];
  STAGE.v = 3; // flowers on lid
  for (let i = 0; i < 7; i++) { const a = R(0, TAU); add(g, sphereG(0.16, 8, 6), M(pick(['#ffffff', '#ffd23f', '#ff9ab8'])), Math.cos(a) * 1.9, 5.75, Math.sin(a) * 1.9); add(g, sphereG(0.2, 8, 6), MAT.leaf, Math.cos(a + 0.2) * 2.1, 5.62, Math.sin(a + 0.2) * 2.1); }
  STAGE.v = 0; // handle
  add(g, torusG(1.75, 0.42, 12, 32, PI * 1.25), teal, 4.15, 2.6, 0, 0, 0, -PI * 0.625);
  STAGE.v = 0; // spout
  const sc = new THREE.CatmullRomCurve3([new THREE.Vector3(-3.6, 1.5, 0), new THREE.Vector3(-5.0, 2.0, 0), new THREE.Vector3(-5.9, 3.3, 0), new THREE.Vector3(-6.5, 4.9, 0)]);
  add(g, taperTube(sc, 28, 1.0, 0.42), teal);
  add(g, torusG(0.44, 0.1, 8, 20), cream, -6.5, 4.92, 0, PI / 2 - 0.35, 0, 0.3);
  STAGE.v = 1; // door with bunny ears
  const rD = rAt(1.3);
  const d = makeDoor(1.5, 2.45); d.group.position.set(0, 0.32, rD + 0.12); g.add(d.group);
  for (const sx of [-1, 1]) {
    add(g, sphereG(1, 16, 12), cream, sx * 0.62, 3.35, rAt(3.3) + 0.0, -0.35, 0, -sx * 0.28, 0.32, 0.85, 0.16);
    add(g, sphereG(1, 16, 12), M('#ffb6c6', { r: 0.6 }), sx * 0.62, 3.3, rAt(3.3) + 0.12, -0.35, 0, -sx * 0.28, 0.18, 0.62, 0.08);
  }
  STAGE.v = 1; // stone steps
  add(g, cylG(1.1, 1.2, 0.32, 10), MAT.rock, 0, 0.16, rD + 0.9, 0, 0, 0, 1, 1, 0.65);
  add(g, cylG(0.8, 0.9, 0.2, 10), MAT.rock, 0.2, 0.1, rD + 2.1, 0, 0.4, 0, 1, 1, 0.7);
  STAGE.v = 2; // windows
  onSurface(g, makeRoundWindow(0.52, { frameMat: cream }), -0.78, 2.4, rAt, 0.12);
  onSurface(g, makeRoundWindow(0.52, { frameMat: cream, flowers: true }), 0.78, 2.4, rAt, 0.12);
  STAGE.v = 3; // carrots + basket
  makeCarrot(g, 1.45, 0.75, rD + 0.7, 1.4, 0.2, -0.4);
  makeCarrot(g, 1.85, 0.6, rD + 0.9, 1.2, 0.1, 0.3);
  makeCarrot(g, -1.5, 0.6, rD + 0.8, 1.2, -0.1, 0.35);
  add(g, cylG(0.55, 0.42, 0.5, 14), M('#ffffff', { map: TX.weave }), -2.4, 0.25, rD + 1.0);
  for (let i = 0; i < 4; i++) makeCarrot(g, -2.4 + R(-0.25, 0.25), 0.75, rD + 1.0 + R(-0.2, 0.2), 0.9, R(-0.4, 0.4), R(-0.4, 0.4));
  STAGE.v = 3; // little bushes around base
  for (let i = 0; i < 12; i++) { const a = PI * 0.5 + (i < 6 ? -1 : 1) * (0.55 + (i % 6) * 0.32); const rr = 4.4; add(g, sphereG(R(0.45, 0.7), 10, 8), i % 2 ? MAT.leaf : MAT.green, Math.sin(a) * rr, 0.3, Math.cos(a) * rr, 0, 0, 0, 1, 0.7, 1); if (i % 2) add(g, sphereG(0.13, 8, 6), M(pick(['#ffffff', '#ffd23f', '#ff8fb1'])), Math.sin(a) * (rr + 0.4), 0.65, Math.cos(a) * (rr + 0.4)); }
  makeLantern(g, -1.2, 3.1, rAt(3.0) + 0.25, 0.85);
  add(g, boxG(0.1, 0.1, 0.6), MAT.dark, -1.2, 3.15, rAt(3.0));
  info.door = [0, rD + 0.7]; info.doorY = 0.32; STAGE.v = 0;
  return { g, info };
}

// ---------------------------------------------------------------- FISH CAN HOUSE
function buildFishcan() {
  const g = new THREE.Group(); const info = { kind: 'fish' }; STAGE.v = 0;
  const W = 9.4, D = 5.6, HT = 3.7, CR = 1.8;
  const pts = roundRectPts(W, D, CR, 10);
  const blue = M('#ffffff', { map: TX.fishcan, r: 0.5, m: 0.15 });
  add(g, wallGeometry(pts, 0.05, HT), blue);
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));
  const top = GEO.shape(shape, 8); top.rotateX(-PI / 2);
  add(g, top, MAT.silver, 0, HT, 0);
  const loop = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], 0, p[1])), true);
  for (const [y, r] of [[0.12, 0.16], [HT, 0.2], [HT * 0.5, 0.06]]) add(g, GEO.tube(loop, 120, r, 8, true), MAT.silver, 0, y, 0);
  // concentric press lines on lid
  const inner = new THREE.CatmullRomCurve3(roundRectPts(W - 1.4, D - 1.4, CR - 0.6, 8).map(p => new THREE.Vector3(p[0], 0, p[1])), true);
  add(g, GEO.tube(inner, 90, 0.07, 6, true), MAT.silver, 0, HT + 0.02, 0);
  // rolled-back lid (curl) along back
  const curl = new THREE.Group(); curl.position.set(0, HT + 0.9, -D / 2 + 0.95); g.add(curl);
  add(curl, cylG(0.9, 0.9, W - 1.4, 28), MAT.silver, 0, 0, 0, 0, 0, PI / 2);
  for (const sx of [-1, 1]) { add(curl, torusG(0.62, 0.1, 8, 24), MAT.silver, sx * (W / 2 - 0.68), 0, 0, 0, PI / 2); add(curl, torusG(0.32, 0.08, 8, 20), MAT.silver, sx * (W / 2 - 0.66), 0, 0, 0, PI / 2); }
  // peeled sheet going from curl into the can
  const sheet = new THREE.PlaneGeometry(W - 1.4, 1.6, 1, 8); const sp = sheet.attributes.position;
  for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); const t = (y + 0.8) / 1.6; sp.setZ(i, Math.sin(t * PI) * 0.25); }
  sheet.computeVertexNormals();
  add(g, sheet, M('#dde2e8', { m: 0.95, r: 0.3, ds: true }), 0, HT + 0.45, -D / 2 + 1.75, -1.1, 0, 0);
  // ring pull
  add(g, torusG(0.5, 0.1, 8, 24), MAT.silver, 2.6, HT + 0.12, 1.1, -PI / 2 + 0.12);
  add(g, boxG(0.5, 0.08, 0.7), MAT.silver, 2.6, HT + 0.1, 1.75);
  STAGE.v = 3; // yarn ball
  add(g, sphereG(1.05, 24, 18), M('#ffffff', { map: TX.yarn, r: 0.95 }), -2.4, HT + 1.0, 0.3);
  const yc = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.5, HT + 0.6, 1.0), new THREE.Vector3(-1.0, HT + 0.1, 2.4), new THREE.Vector3(-0.9, HT - 0.6, D / 2 + 0.25), new THREE.Vector3(-0.6, HT - 1.6, D / 2 + 0.2)]);
  add(g, GEO.tube(yc, 20, 0.05, 5), M('#ff7aa8'));
  STAGE.v = 3; // weathervane
  add(g, cylG(0.06, 0.06, 2.2, 6), MAT.dark, 3.0, HT + 2.6, -D / 2 + 0.95);
  add(g, boxG(0.9, 0.05, 0.05), MAT.dark, 3.0, HT + 2.6, -D / 2 + 0.95);
  add(g, boxG(0.05, 0.05, 0.9), MAT.dark, 3.0, HT + 2.6, -D / 2 + 0.95);
  const vane = new THREE.Group(); vane.position.set(3.0, HT + 3.75, -D / 2 + 0.95); vane.userData.dyn = true; vane.userData.spin = true; g.add(vane);
  const fs = new THREE.Shape(); fs.moveTo(-0.9, 0); fs.quadraticCurveTo(-0.2, 0.55, 0.5, 0.12); fs.lineTo(1.0, 0.42); fs.lineTo(0.9, 0); fs.lineTo(1.0, -0.42); fs.lineTo(0.5, -0.12); fs.quadraticCurveTo(-0.2, -0.55, -0.9, 0);
  const fg = GEO.extrude(fs, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }); fg.translate(0, 0, -0.06);
  add(vane, fg, M('#2f6fd0', { r: 0.4, m: 0.3 }), 0.1, 0, 0);
  add(vane, sphereG(0.06, 8, 6), MAT.white, -0.5, 0.1, 0.1);
  STAGE.v = 1; // door + porch
  const d = makeDoor(1.45, 2.4); d.group.position.set(-0.9, 0.42, D / 2 + 0.18); g.add(d.group);
  add(g, boxG(5.6, 0.42, 1.9), MAT.wood, -0.9, 0.21, D / 2 + 1.0);
  for (let i = 0; i < 6; i++) add(g, boxG(0.05, 0.02, 1.9), MAT.woodDark, -3.4 + i * 1.0, 0.425, D / 2 + 1.0);
  makeSteps(g, -0.9, D / 2 + 2.3, 1.6, 1, 0.21, 0.5, MAT.wood);
  add(g, boxG(1.4, 0.03, 0.8), M('#d9534f'), -0.9, 0.44, D / 2 + 1.0);
  STAGE.v = 2; // windows (with paw sills)
  const w1 = makeRoundWindow(0.62, { flowers: true }); w1.position.set(1.9, 1.95, D / 2 + 0.08); g.add(w1);
  const w2 = makeRoundWindow(0.55); w2.position.set(-3.5, 2.05, D / 2 + 0.08); g.add(w2);
  STAGE.v = 2; // lantern on post
  add(g, boxG(0.18, 2.6, 0.18), MAT.woodDark, -3.6, 1.3, D / 2 + 1.75);
  add(g, boxG(0.7, 0.14, 0.14), MAT.woodDark, -3.35, 2.55, D / 2 + 1.75);
  makeLantern(g, -3.1, 2.48, D / 2 + 1.75, 0.85);
  makePot(g, 1.4, 0.42, D / 2 + 1.5, 0.8);
  STAGE.v = 3; // fish drying rack
  const rk = new THREE.Group(); rk.position.set(W / 2 + 0.6, 0, 1.6); g.add(rk);
  for (const z of [-1.4, 1.4]) add(rk, boxG(0.18, 2.8, 0.18), MAT.woodDark, 0, 1.4, z);
  add(rk, cylG(0.07, 0.07, 3.0, 6), MAT.woodMid, 0, 2.7, 0, PI / 2);
  const fishG = GEO.extrude((() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.28, -0.35, 0.05, -0.9); s.lineTo(0.22, -1.15); s.lineTo(-0.22, -1.15); s.lineTo(-0.05, -0.9); s.quadraticCurveTo(-0.28, -0.35, 0, 0); return s; })(), { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  fishG.translate(0, 0, -0.04);
  { const p = new THREE.Group(); p.position.set(0, 2.62, 0); p.userData.dyn = true; rk.add(p);
    for (let i = 0; i < 5; i++) add(p, fishG, M('#9fb8cf', { m: 0.5, r: 0.35 }), 0, -0.05, -1.1 + i * 0.55, 0, PI / 2, 0);
     }
  STAGE.v = 3; // basket of fish
  add(g, cylG(0.5, 0.4, 0.45, 12), M('#ffffff', { map: TX.weave }), 3.6, 0.22, D / 2 + 0.9);
  info.door = [-0.9, D / 2 + 0.7]; info.doorY = 0.42; STAGE.v = 0;
  return { g, info };
}

// ---------------------------------------------------------------- BOOT HOUSE
function buildBoot() {
  const g = new THREE.Group(); const info = { kind: 'boot' }; STAGE.v = 0;
  const s = new THREE.Shape();
  s.moveTo(3.2, 0); s.lineTo(-3.4, 0);
  s.bezierCurveTo(-5.7, 0, -5.9, 2.7, -4.0, 2.9);
  s.bezierCurveTo(-2.6, 3.05, -0.9, 3.3, -0.3, 4.5);
  s.lineTo(-0.15, 8.4); s.lineTo(3.7, 8.4); s.lineTo(3.7, 1.1); s.quadraticCurveTo(3.7, 0, 3.2, 0);
  const depth = 3.4, bev = 0.75;
  const bg = GEO.extrude(s, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 5, curveSegments: 18 });
  bg.translate(0, bev + 0.5, -depth / 2);
  const leather = M('#b06a36', { map: TX.leather, r: 0.55, rim: 1.1 });
  add(g, bg, leather);
  // sole + heel
  const soleS = new THREE.Shape(); { const sp = roundRectPts(11.4, 5.4, 2.2, 8); sp.forEach((p, i) => i ? soleS.lineTo(p[0], -p[1]) : soleS.moveTo(p[0], -p[1])); }
  const sole = GEO.extrude(soleS, { depth: 0.45, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.08, bevelSegments: 2 });
  sole.rotateX(-PI / 2);
  add(g, sole, M('#4a2c1a', { r: 0.8 }), -0.85, 0.08, 0);
  add(g, boxG(3.0, 0.3, 5.0), M('#3a2213', { r: 0.8 }), 2.6, 0.4, 0);
  // stitched toe cap
  add(g, sphereG(1, 24, 12, 0), M('#8f4f25', { map: TX.leather, r: 0.6 }), -4.5, 1.1, 0, 0, 0, 0, 1.75, 1.45, 2.45);
  // cuff at top
  const cuffS = new THREE.Shape(); { const cp = roundRectPts(5.6, 5.0, 1.6, 8); cp.forEach((p, i) => i ? cuffS.lineTo(p[0], -p[1]) : cuffS.moveTo(p[0], -p[1])); }
  const hole = new THREE.Path(); { const hp = roundRectPts(4.2, 3.6, 1.1, 8); hp.forEach((p, i) => i ? hole.lineTo(p[0], -p[1]) : hole.moveTo(p[0], -p[1])); }
  cuffS.holes.push(hole);
  const cuff = GEO.extrude(cuffS, { depth: 0.6, bevelEnabled: true, bevelSize: 0.18, bevelThickness: 0.18, bevelSegments: 3 }); cuff.rotateX(-PI / 2);
  add(g, cuff, M('#c98a52', { map: TX.leather, r: 0.6 }), 1.78, 9.95, 0);
  add(g, boxG(4.4, 0.1, 3.8), M('#3a2214'), 1.78, 10.3, 0);
  STAGE.v = 3; // stove pipe chimney
  add(g, cylG(0.32, 0.32, 1.8, 10), M('#6d6a68', { m: 0.5, r: 0.5 }), 2.6, 11.0, -0.9);
  add(g, cylG(0.55, 0.36, 0.35, 10), M('#6d6a68', { m: 0.5, r: 0.5 }), 2.6, 12.0, -0.9);
  info.smoke = [2.6, 12.3, -0.9];
  STAGE.v = 0; // laces on shaft front (face x = -0.15 - bev)
  const fx = -0.15 - bev - 0.03; const eyes = [];
  for (let i = 0; i < 7; i++) { const y = 5.9 + i * 0.6; for (const z of [-0.95, 0.95]) { add(g, torusG(0.14, 0.05, 6, 14), MAT.gold, fx + 0.02 * (y - 5.9), y, z, 0, PI / 2, 0); eyes.push([y, z]); } }
  const laceMat = M('#f3dcae', { r: 0.8 });
  for (let i = 0; i < 6; i++) {
    const y0 = 5.9 + i * 0.6, y1 = y0 + 0.6;
    for (const sgn of [-1, 1]) { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(fx - 0.02, y0, sgn * 0.95), new THREE.Vector3(fx - 0.18, (y0 + y1) / 2, 0), new THREE.Vector3(fx - 0.02, y1, -sgn * 0.95)]); add(g, GEO.tube(c, 10, 0.07, 6), laceMat); }
  }
  STAGE.v = 0; // bow
  for (const sgn of [-1, 1]) { add(g, torusG(0.38, 0.07, 6, 16), laceMat, fx - 0.15, 9.95, sgn * 0.4, 0, PI / 2, sgn * 0.5); const c = new THREE.CatmullRomCurve3([new THREE.Vector3(fx - 0.15, 9.85, sgn * 0.1), new THREE.Vector3(fx - 0.3, 9.3, sgn * 0.5), new THREE.Vector3(fx - 0.2, 8.6, sgn * 0.7)]); add(g, GEO.tube(c, 10, 0.06, 5), laceMat); }
  STAGE.v = 0; // vamp laces lower part
  for (let i = 0; i < 3; i++) add(g, boxG(0.12, 0.08, 1.9), laceMat, -1.3 - i * 0.65, 5.55 - i * 0.33, 0, 0, 0, -0.4);
  STAGE.v = 1; // door on +z side (heel), round
  const zf = depth / 2 + bev + 0.1;
  const d = makeDoor(1.7, 1.7, { round: true, depth: 0.5 }); d.group.position.set(1.6, 0.62, zf); g.add(d.group);
  add(g, boxG(2.4, 0.3, 1.1), MAT.wood, 1.6, 0.15, zf + 0.5);
  STAGE.v = 2; // windows on shaft & toe
  const w1 = makeRoundWindow(0.55, { flowers: true }); w1.position.set(1.8, 5.4, zf); g.add(w1);
  const w2 = makeRoundWindow(0.42); w2.position.set(1.6, 7.5, zf); g.add(w2);
  const w3 = makeRoundWindow(0.45); w3.position.set(-2.9, 2.35, zf - 0.05); g.add(w3);
  STAGE.v = 2; // patch with stitches
  add(g, cylG(0.55, 0.55, 0.06, 16), M('#d39a5c', { r: 0.8 }), -0.9, 2.6, zf - 0.1, PI / 2, 0, 0.15);
  STAGE.v = 3; // ivy leaves crawling up the back
  const ivy = M('#4fae45', { r: 0.7 });
  for (let i = 0; i < 46; i++) { const t = i / 46; const y = 1.2 + t * 8; const x = 3.7 + bev - 0.05 + R(-0.05, 0.08); const z = Math.sin(t * 9) * 1.5 + R(-0.4, 0.4); add(g, sphereG(0.22, 6, 5), ivy, x + 0.08, y, z, R(0, 3), R(0, 3), R(0, 3), 1.2, 0.5, 1); }
  for (let i = 0; i < 18; i++) { const t = i / 18; add(g, sphereG(0.22, 6, 5), ivy, 3.0 - t * 1.6 + R(-0.2, 0.2), 1.0 + t * 5 + R(-0.3, 0.3), zf - 0.05, R(0, 3), R(0, 3), R(0, 3), 1.2, 1.0, 0.45); }
  STAGE.v = 2; // lantern by door
  add(g, boxG(0.12, 0.12, 0.6), MAT.dark, 3.0, 2.9, zf - 0.1);
  makeLantern(g, 3.0, 2.85, zf + 0.15, 0.85);
  makePot(g, 0.2, 0, zf + 0.6, 0.85);
  makePot(g, 3.1, 0, zf + 0.7, 0.8, '#ffffff');
  STAGE.v = 3; // firewood pile
  for (let i = 0; i < 6; i++) add(g, cylG(0.18, 0.18, 1.2, 8), M('#9a6236'), -3.6 + (i % 3) * 0.38 + (i > 2 ? 0.19 : 0), 0.2 + (i > 2 ? 0.32 : 0), zf + 0.7, PI / 2, 0, PI / 2);
  info.door = [1.6, zf + 0.6]; info.doorY = 0.3; STAGE.v = 0;
  return { g, info };
}

// ---------------------------------------------------------------- RAIN BOOT HOUSE（Lenia 的红色橡胶雨靴；与储物箱图标 item-boot.png 一致：红色亮面、绿色扣带、碎花内衬、深棕齿纹鞋底）
TX.rubber = ctex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(150,30,20,${R(0.03, 0.08)})`; g.beginPath(); g.arc(R(0, w), R(0, h), R(5, 18), 0, TAU); g.fill(); }
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(110,70,40,${R(0.12, 0.3)})`; g.beginPath(); g.arc(R(0, w), R(0, h), R(0.8, 2.2), 0, TAU); g.fill(); } // 去年的泥点
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(255,235,225,.18)'; g.beginPath(); g.ellipse(R(0, w), R(0, h), R(3, 9), R(1, 2), R(0, 3), 0, TAU); g.fill(); }
}, [0.16, 0.16]);
TX.floral = ctex(256, 256, (g, w, h) => {
  g.fillStyle = '#f6ecd6'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { const x = R(0, w), y = R(0, h), r = R(5, 9); g.fillStyle = pick(['#e35d5d', '#f08aa0', '#f4b844']); for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.45, 0, TAU); g.fill(); } g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(x, y, r * 0.3, 0, TAU); g.fill(); g.fillStyle = '#6aa04e'; g.beginPath(); g.ellipse(x + r * 1.1, y + r * 0.6, r * 0.55, r * 0.25, 0.6, 0, TAU); g.fill(); }
}, [0.25, 0.25]);
TX.floralBox = TX.floral.clone(); TX.floralBox.repeat.set(1.4, 1.1); TX.floralBox.needsUpdate = true;
function buildRainBoot() {
  const g = new THREE.Group(); const info = { kind: 'rboot' }; STAGE.v = 0;
  const s = new THREE.Shape();
  s.moveTo(3.3, 0); s.lineTo(-3.5, 0);
  s.bezierCurveTo(-5.9, 0, -6.1, 2.8, -4.0, 3.05);   // 圆鼓鼓的鞋头
  s.bezierCurveTo(-2.3, 3.25, -0.85, 3.5, -0.65, 4.8); // 脚背
  s.lineTo(-0.92, 7.9); s.quadraticCurveTo(-0.95, 8.7, -0.1, 8.7); s.lineTo(3.1, 8.7); s.quadraticCurveTo(3.95, 8.7, 3.92, 7.9); s.lineTo(3.65, 1.1); s.quadraticCurveTo(3.65, 0, 3.3, 0); // 靴筒上角也是圆的
  const depth = 3.0, bev = 1.0;
  const bg = GEO.extrude(s, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 6, curveSegments: 20 });
  bg.translate(0, bev + 0.6, -depth / 2);
  const rubber = M('#d63a2d', { map: TX.rubber, r: 0.3, rim: 1.2 });
  const rubberDk = M('#a8261d', { map: TX.rubber, r: 0.35 });
  add(g, bg, rubber);
  // 鞋底：深棕色厚底 + 一圈齿纹
  const soleS = new THREE.Shape(); { const sp = roundRectPts(11.8, 5.3, 2.3, 8); sp.forEach((p, i) => i ? soleS.lineTo(p[0], -p[1]) : soleS.moveTo(p[0], -p[1])); }
  const sole = GEO.extrude(soleS, { depth: 0.55, bevelEnabled: true, bevelSize: 0.14, bevelThickness: 0.1, bevelSegments: 2 }); sole.rotateX(-PI / 2);
  const soleM = M('#4a2f20', { r: 0.85 });
  add(g, sole, soleM, -0.95, 0.1, 0);
  for (let i = 0; i < 13; i++) { const x = -6.2 + i * 0.85; for (const z of [-2.8, 2.8]) add(g, boxG(0.42, 0.34, 0.22), soleM, x + 0.3, 0.2, z * (Math.abs(x + 0.3) > 4.6 ? 0.82 : 1)); }
  add(g, boxG(2.9, 0.42, 4.9), M('#3b2418', { r: 0.85 }), 2.45, 0.32, 0); // 鞋跟
  // 鞋头一圈深红包边
  add(g, sphereG(1, 26, 12), rubberDk, -4.55, 1.12, 0, 0, 0, 0, 1.75, 1.2, 2.45);
  // 靴口：卷边 + 里面的碎花内衬
  const cuffS = new THREE.Shape(); { const cp = roundRectPts(6.3, 5.2, 2.0, 8); cp.forEach((p, i) => i ? cuffS.lineTo(p[0], -p[1]) : cuffS.moveTo(p[0], -p[1])); }
  const hole = new THREE.Path(); { const hp = roundRectPts(4.8, 3.6, 1.3, 8); hp.forEach((p, i) => i ? hole.lineTo(p[0], -p[1]) : hole.moveTo(p[0], -p[1])); }
  cuffS.holes.push(hole);
  const cuff = GEO.extrude(cuffS, { depth: 0.4, bevelEnabled: true, bevelSize: 0.22, bevelThickness: 0.22, bevelSegments: 4 }); cuff.rotateX(-PI / 2);
  add(g, cuff, rubber, 1.5, 10.05, 0);
  add(g, boxG(4.9, 0.1, 3.7), M('#ffffff', { map: TX.floralBox, r: 0.85 }), 1.5, 10.38, 0);
  // 绿色扣带 + 黄铜扣（两侧都有，门在 +z 一侧）
  const strapM = M('#5d8f48', { r: 0.6 });
  const zf = depth / 2 + bev + 0.1;
  for (const sz of [-1, 1]) {
    add(g, boxG(3.4, 0.8, 0.18), strapM, 1.75, 8.6, sz * (zf - 0.06), 0, 0, -0.04);
    add(g, torusG(0.38, 0.09, 6, 4), MAT.gold, 0.45, 8.62, sz * (zf + 0.05), 0, 0, PI / 4);
    add(g, boxG(0.1, 0.62, 0.08), MAT.gold, 0.45, 8.62, sz * (zf + 0.08));
  }
  add(g, boxG(0.7, 0.62, 0.9), strapM, -0.85, 8.55, 0, 0, 0, 0.05); // 扣带绕过前面
  // 靴子背面的提耳
  add(g, torusG(0.45, 0.13, 8, 16, PI), rubberDk, 4.55, 9.6, 0, 0, PI / 2, -PI / 2);
  STAGE.v = 3; // 烟囱：从靴口伸出来的小铁皮烟囱 + 靴口里长出来的花
  add(g, cylG(0.32, 0.32, 1.9, 10), M('#6d6a68', { m: 0.5, r: 0.5 }), 2.7, 11.0, -0.9);
  add(g, cylG(0.55, 0.36, 0.35, 10), M('#6d6a68', { m: 0.5, r: 0.5 }), 2.7, 12.0, -0.9);
  info.smoke = [2.7, 12.3, -0.9];
  for (let i = 0; i < 7; i++) { const x = 0.0 + R(-0.6, 1.6), z = R(-1.3, 1.3); add(g, cylG(0.05, 0.06, 1.2, 5), MAT.leaf, x, 10.6, z, R(-0.25, 0.25), 0, R(-0.25, 0.25)); add(g, sphereG(0.24, 8, 6), M(pick(['#ffd23f', '#ffffff', '#ff8fb1', '#ffb347']), { r: 0.6 }), x, 11.25, z); }
  for (let i = 0; i < 6; i++) add(g, sphereG(0.32, 8, 6), MAT.leaf, R(-0.6, 3.4), 10.3, R(-1.6, 1.6), 0, 0, 0, 1.2, 0.5, 1);
  STAGE.v = 1; // 门在鞋跟一侧（+z）、圆门；木台阶
  const d = makeDoor(1.75, 1.75, { round: true, depth: 0.5 }); d.group.position.set(1.65, 0.72, zf); g.add(d.group);
  add(g, boxG(2.6, 0.32, 1.2), MAT.wood, 1.65, 0.16, zf + 0.55); add(g, boxG(2.2, 0.18, 0.8), MAT.woodMid, 1.65, 0.09, zf + 1.35);
  STAGE.v = 2; // 窗：靴筒两扇、鞋头一扇
  const w1 = makeRoundWindow(0.58, { flowers: true }); w1.position.set(1.9, 5.3, zf); g.add(w1);
  const w2 = makeRoundWindow(0.44); w2.position.set(1.7, 7.1, zf); g.add(w2);
  const w3 = makeRoundWindow(0.46); w3.position.set(-3.0, 2.45, zf - 0.05); g.add(w3);
  makeLantern(g, 3.15, 3.0, zf + 0.15, 0.85); add(g, boxG(0.12, 0.12, 0.6), MAT.dark, 3.15, 3.05, zf - 0.1);
  STAGE.v = 3; // 门前的小花盆和雨伞架（一把小叶子伞）
  makePot(g, 0.1, 0, zf + 0.7, 0.85, '#ffd23f'); makePot(g, 3.3, 0, zf + 0.9, 0.75, '#ffffff');
  add(g, cylG(0.04, 0.04, 1.5, 5), MAT.woodDark, -1.1, 0.75, zf + 0.6, 0.15, 0, 0.1);
  add(g, sphereG(0.7, 14, 6, 0, TAU, 0, PI / 2), MAT.leaf, -1.0, 1.45, zf + 0.7, 0.15, 0, 0.1, 1, 0.45, 1);
  for (let i = 0; i < 16; i++) { const t = i / 16; add(g, sphereG(0.22, 6, 5), M('#4fae45', { r: 0.7 }), 3.65 + bev + 0.05, 1.3 + t * 6.5, Math.sin(t * 8) * 1.3 + R(-0.3, 0.3), R(0, 3), R(0, 3), R(0, 3), 1.2, 0.5, 1); }
  info.door = [1.65, zf + 0.7]; info.doorY = 0.35; STAGE.v = 0;
  return { g, info };
}

// ---------------------------------------------------------------- TEACUP HOUSE (duck)
TX.cup = ctex(1024, 256, (g, w, h) => { // 白瓷、粉玫瑰、绿叶、金边（与 item-teacup.png 一致）
  g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d6b25c'; g.fillRect(0, 0, w, 12); g.fillRect(0, 18, w, 3); g.fillRect(0, h - 14, w, 8);
  const leaf = (x, y, a, l) => { g.fillStyle = '#5f9a4c'; g.beginPath(); g.ellipse(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5, l * 0.5, l * 0.22, a, 0, TAU); g.fill(); g.strokeStyle = '#3f7434'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); };
  const rose = (x, y, r) => { g.fillStyle = '#f2a3b6'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = '#d8607e'; g.lineWidth = 2.2; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + (k - 1) * r * 0.12, y + (k - 1) * r * 0.1, r * (0.75 - k * 0.22), k * 1.3, k * 1.3 + 4.2); g.stroke(); } g.fillStyle = '#e57a95'; g.beginPath(); g.arc(x, y, r * 0.22, 0, TAU); g.fill(); };
  for (let i = 0; i < 8; i++) { const x = 64 + i * 128, y = 135 + (i % 2 ? 22 : -12); leaf(x, y, 0.5, 46); leaf(x, y, PI - 0.4, 40); leaf(x, y, -0.9, 34); rose(x, y, 24); rose(x + 46, y + 40 * (i % 2 ? -1 : 1), 12); }
  g.fillStyle = '#f4b9c6'; for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(R(0, w), R(50, h - 30), R(2, 3.2), 0, TAU); g.fill(); }
});
TX.gingham = ctex(128, 128, (g, w, h) => { g.fillStyle = '#fff8ee'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(214,74,60,.55)'; for (let i = 0; i < 8; i++) { g.fillRect(i * 16, 0, 8, h); g.fillRect(0, i * 16, w, 8); } }, [6, 3]);
TX.honeypot = ctex(512, 256, (g, w, h) => { // 琥珀色玻璃罐里的蜂蜜（与 item-honeyjar.png 一致：六棱玻璃、透亮的金色）
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f6b84a'); gr.addColorStop(0.55, '#e99a2c'); gr.addColorStop(1, '#c76f1e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i++) { const x = i * w / 12; const lg = g.createLinearGradient(x, 0, x + w / 12, 0); lg.addColorStop(0, 'rgba(255,236,170,.0)'); lg.addColorStop(0.15, 'rgba(255,236,170,.45)'); lg.addColorStop(0.3, 'rgba(255,236,170,.0)'); lg.addColorStop(0.9, 'rgba(140,60,10,.18)'); g.fillStyle = lg; g.fillRect(x, 0, w / 12, h); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,240,190,${R(0.15, 0.4)})`; g.beginPath(); g.arc(R(0, w), R(40, h - 20), R(1.5, 4), 0, TAU); g.fill(); } // 小气泡
  g.fillStyle = 'rgba(255,248,220,.35)'; g.fillRect(0, 8, w, 6);
}, [2, 1]);
TX.linen = ctex(128, 128, (g, w, h) => { g.fillStyle = '#f3e7cc'; g.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 3) { g.fillStyle = `rgba(160,130,90,${R(0.05, 0.14)})`; g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); } }, [4, 2]);
function buildCup() {
  const g = new THREE.Group(); const info = { kind: 'cup' }; STAGE.v = 0;
  const porcelain = M('#f8f5ef', { r: 0.28, rim: 0.8 }); const blueM = M('#d2ac55', { r: 0.3, m: 0.25 }); // 金边
  add(g, lathe([[0.01, 0], [3.9, 0], [4.6, 0.12], [5.05, 0.34], [5.15, 0.46], [4.9, 0.44], [4.1, 0.32], [2.7, 0.34], [0.01, 0.34]], 56), porcelain);
  add(g, torusG(5.08, 0.07, 6, 64), blueM, 0, 0.46, 0, PI / 2);
  add(g, torusG(4.3, 0.04, 6, 64), blueM, 0, 0.36, 0, PI / 2);
  const prof = [[2.2, 0.34], [2.4, 0.4], [2.45, 0.62], [2.75, 1.4], [3.12, 2.5], [3.4, 3.6], [3.52, 4.3]];
  const rAt = (y) => { for (let i = 1; i < prof.length; i++) if (prof[i][1] >= y) { const a = prof[i - 1], b = prof[i]; return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1])); } return 3.52; };
  const sp = new THREE.SplineCurve(prof.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(30);
  const cupT = TX.cup.clone(); cupT.repeat.set(3, 1); cupT.needsUpdate = true;
  add(g, GEO.lathe(sp, 64), M('#ffffff', { map: cupT, r: 0.25, rim: 0.8 }));
  add(g, torusG(3.52, 0.13, 8, 64), porcelain, 0, 4.3, 0, PI / 2);
  add(g, GEO.cyl(3.42, 3.36, 0.6, 64, 1, true), M('#efe9df', { r: 0.3, ds: true }), 0, 4.05, 0);
  STAGE.v = 3; // latte foam roof + heart
  add(g, GEO.sphere(3.42, 40, 10, 0, TAU, 0, PI / 2), M('#f1dcb8', { r: 0.85 }), 0, 3.95, 0, 0, 0, 0, 1, 0.32, 1);
  const hs = new THREE.Shape(); hs.moveTo(0, -0.9); hs.bezierCurveTo(0.9, -0.2, 1.2, 0.6, 0.6, 0.9); hs.bezierCurveTo(0.25, 1.05, 0, 0.75, 0, 0.55); hs.bezierCurveTo(0, 0.75, -0.25, 1.05, -0.6, 0.9); hs.bezierCurveTo(-1.2, 0.6, -0.9, -0.2, 0, -0.9);
  add(g, GEO.shape(hs, 12), M('#9a6036', { r: 0.8 }), -0.3, 5.1, 0.4, -PI / 2, 0, 0.3, 1.25);
  STAGE.v = 3; // sugar-cube chimney
  const sugar = M('#ffffff', { r: 0.95 });
  add(g, boxG(0.75, 0.75, 0.75), sugar, 1.3, 5.0, -1.0, 0, 0.3, 0); add(g, boxG(0.7, 0.7, 0.7), sugar, 1.35, 5.68, -1.0, 0, 0.9, 0); add(g, boxG(0.62, 0.62, 0.62), sugar, 1.28, 6.3, -1.02, 0, 0.5, 0);
  info.smoke = [1.3, 6.8, -1.0];
  STAGE.v = 0; // handle = porch arch over the door
  const a = 0.62 * PI, HR_ = 1.15; const hg = GEO.torus(HR_, 0.3, 12, 36, 2 * a); hg.rotateZ(-a); hg.rotateY(-PI / 2);
  const yH = 3.35, hz = rAt(yH) - 0.35; add(g, hg, M('#ffffff', { map: cupT, r: 0.25, rim: 0.8 }), 0, yH, hz);
  add(g, torusG(HR_ + 0.02, 0.07, 6, 36, 2 * a), blueM, 0, yH, hz, 0, -PI / 2, -a);
  STAGE.v = 1; // door, windows
  const rD = rAt(1.35);
  const d = makeDoor(1.3, 2.0, { depth: 1.1 }); d.group.position.set(0, 0.34, rD + 0.05); d.group.rotation.x = 0.14; g.add(d.group);
  for (const [ang, y, rr] of [[-0.95, 2.4, 0.5], [0.95, 2.4, 0.5], [PI * 0.62, 3.0, 0.42]]) onSurface(g, makeRoundWindow(rr, { frameMat: blueM, flowers: ang < 0 }), ang, y, rAt, 0.1);
  makeLantern(g, 0, yH - 0.25, hz + HR_, 0.8);
  STAGE.v = 3; // small side saucer patio with stool and teaspoon
  const ps = new THREE.Group(); ps.position.set(4.2, 0, 1.5); g.add(ps);
  add(ps, lathe([[0.01, 0], [1.4, 0], [1.75, 0.16], [1.82, 0.26], [1.6, 0.22], [0.01, 0.2]], 36), porcelain);
  add(ps, torusG(1.78, 0.04, 6, 40), blueM, 0, 0.27, 0, PI / 2);
  add(ps, cylG(0.32, 0.32, 0.45, 16), M('#f3c74a', { r: 0.9 }), 0.4, 0.45, 0.2);
  add(ps, cylG(0.42, 0.42, 0.06, 16), M('#d8a46a'), 0.4, 0.68, 0.2); add(ps, cylG(0.42, 0.42, 0.06, 16), M('#d8a46a'), 0.4, 0.22, 0.2);
  add(ps, boxG(1.6, 0.06, 0.18), MAT.silver, -0.5, 0.26, -0.4, 0, 0.5, 0); add(ps, sphereG(0.3, 14, 8), MAT.silver, -1.2, 0.27, -0.0, 0, 0, 0, 1, 0.3, 0.75);
  makePot(g, -1.6, 0.34, rD + 1.0, 0.8, '#ffd23f'); makePot(g, 1.7, 0.34, rD + 0.9, 0.8, '#ffffff');
  add(g, cylG(0.9, 1.0, 0.18, 10), MAT.rock, 0, 0.09, 5.6, 0, 0, 0, 1, 1, 0.7);
  STAGE.v = 3; // reeds by the water side
  for (let i = 0; i < 9; i++) { const x = R(0.5, 3.0), z = R(-4.2, -3.0); add(g, cylG(0.04, 0.05, R(1.4, 2.4), 5), M('#6aa14a'), x, 0.9, z, R(-0.15, 0.15), 0, R(-0.15, 0.15)); if (i % 2) add(g, capsuleG(), M('#8a5a34'), x, 1.9, z, 0, 0, 0, 1, 1, 1); }
  info.door = [0, rD + 0.7]; info.doorY = 0.34; STAGE.v = 0;
  return { g, info };
}
function capsuleG() { return G('reedHead', () => GEO.capsule(0.09, 0.35, 3, 8)); }

// ---------------------------------------------------------------- HONEY POT HOUSE (bear)
function buildHoney() {
  const g = new THREE.Group(); const info = { kind: 'honey' }; STAGE.v = 0;
  const prof = [[0.01, 0], [2.4, 0], [2.9, 0.22], [3.3, 0.95], [3.45, 2.2], [3.32, 3.4], [2.88, 4.3], [2.32, 4.8], [2.2, 5.05], [2.45, 5.22], [2.42, 5.42], [2.1, 5.45]];
  const sp = new THREE.SplineCurve(prof.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(48);
  const rAt = (y) => { for (let i = 1; i < sp.length; i++) if (sp[i].y >= y) { const a = sp[i - 1], b = sp[i]; return lerp(a.x, b.x, (y - a.y) / (b.y - a.y || 1)); } return 2.2; };
  add(g, GEO.lathe(sp, 64), M('#ffffff', { map: TX.honeypot, r: 0.18, rim: 1.1 }));
  STAGE.v = 0; // 罐口盖着一块米色粗布，麻绳扎着，挂一张小纸签（原物件就有）
  const cloth = M('#ffffff', { map: TX.linen, r: 0.9, ds: true });
  add(g, GEO.sphere(2.62, 40, 10, 0, TAU, 0, PI / 2), cloth, 0, 5.35, 0, 0, 0, 0, 1, 0.42, 1);
  const sk = GEO.cyl(2.6, 2.95, 1.1, 48, 3, true); const skp = sk.attributes.position;
  for (let i = 0; i < skp.count; i++) { const y = skp.getY(i); const a = Math.atan2(skp.getZ(i), skp.getX(i)); if (y < 0) { skp.setY(i, y + 0.16 * (1 - Math.abs(Math.cos(a * 6)))); const k = 1 + 0.04 * Math.sin(a * 12); skp.setX(i, skp.getX(i) * k); skp.setZ(i, skp.getZ(i) * k); } }
  sk.computeVertexNormals(); add(g, sk, cloth, 0, 4.85, 0);
  const rope = M('#c9a46a', { r: 0.95 });
  add(g, torusG(2.48, 0.1, 8, 56), rope, 0, 5.08, 0, PI / 2);
  add(g, sphereG(0.2, 10, 8), rope, 0.9, 5.05, 2.35); for (const s of [-1, 1]) add(g, cylG(0.06, 0.05, 0.9, 6), rope, 0.9 + s * 0.15, 4.6, 2.42, 0.15, 0, s * 0.25);
  add(g, boxG(0.9, 1.2, 0.05), M('#fbf3dc', { r: 0.9 }), 1.55, 4.0, 2.75, 0.12, 0.5, 0.18); add(g, cylG(0.1, 0.1, 0.06, 10), M('#c9a46a'), 1.48, 4.45, 2.8, PI / 2, 0.5, 0);
  STAGE.v = 3; // wooden spoon chimney
  const woodS = M('#c48a52', { r: 0.7 });
  add(g, cylG(0.13, 0.17, 3.4, 10), woodS, 0.7, 6.9, -0.4, 0.12, 0, -0.22);
  add(g, sphereG(1, 20, 12), woodS, 1.07, 8.55, -0.2, 0.12, 0, -0.22, 0.48, 0.66, 0.2);
  info.smoke = [0.55, 6.0, -0.35];
  STAGE.v = 0; // honey drips
  const honey = M('#f3a51b', { r: 0.15 });
  for (const [ang, len] of [[0.5, 1.4], [-0.35, 0.9], [1.6, 1.8], [-1.9, 1.1], [2.7, 0.7]]) {
    const pts = []; for (let k = 0; k <= 8; k++) { const y = 4.75 - len * k / 8; const r = rAt(y) + 0.05; pts.push(new THREE.Vector3(Math.sin(ang) * r, y, Math.cos(ang) * r)); }
    add(g, taperTube(new THREE.CatmullRomCurve3(pts), 12, 0.2, 0.11, 8), honey);
    const e = pts[pts.length - 1]; add(g, sphereG(0.17, 12, 8), honey, e.x, e.y - 0.08, e.z, 0, 0, 0, 1, 1.25, 1);
  }
  add(g, sphereG(1, 20, 8), honey, 1.6, 0.02, 3.4, 0, 0, 0, 0.75, 0.08, 0.55);
  STAGE.v = 1; // door / windows / porch
  const rD = rAt(1.3);
  const d = makeDoor(1.45, 2.35, { depth: 0.9 }); d.group.position.set(0, 0.3, rD + 0.1); g.add(d.group);
  for (const [ang, y, rr] of [[-0.85, 2.7, 0.55], [0.85, 2.7, 0.55], [PI * 0.7, 2.4, 0.45]]) onSurface(g, makeRoundWindow(rr, { flowers: ang > 0 }), ang, y, rAt, 0.08);
  add(g, cylG(1.25, 1.35, 0.3, 12), MAT.rock, 0, 0.15, rD + 0.9, 0, 0, 0, 1, 1, 0.62);
  add(g, cylG(0.85, 0.9, 0.18, 10), MAT.rock, 0.2, 0.09, rD + 2.0, 0, 0.4, 0, 1, 1, 0.7);
  makeLantern(g, 1.15, 3.0, rAt(2.9) + 0.25, 0.85); add(g, boxG(0.1, 0.1, 0.5), MAT.dark, 1.15, 3.05, rAt(2.9));
  makePot(g, -1.7, 0, rD + 0.9, 0.9, '#ffd23f'); makePot(g, 1.8, 0, rD + 0.8, 0.8, '#ff8fb1');
  STAGE.v = 3; // little hive box + honey jars
  add(g, boxG(0.9, 0.7, 0.7), MAT.wood, 3.4, 0.35, 1.6, 0, -0.4, 0); add(g, boxG(1.0, 0.12, 0.8), MAT.woodDark, 3.4, 0.75, 1.6, 0, -0.4, 0);
  for (let k = 0; k < 3; k++) { add(g, cylG(0.17, 0.17, 0.32, 12), M('#f3b33a', { r: 0.15 }), -3.0 + k * 0.42, 0.16, 2.0 + (k % 2) * 0.2); add(g, cylG(0.2, 0.2, 0.08, 12), cloth, -3.0 + k * 0.42, 0.36, 2.0 + (k % 2) * 0.2); }
  info.door = [0, rD + 0.7]; info.doorY = 0.3; STAGE.v = 0;
  return { g, info };
}

// ---------------------------------------------------------------- 自然材料小屋（开局用）
function profAt(pts, y) { for (let i = 1; i < pts.length; i++) if (pts[i][1] >= y) { const a = pts[i - 1], b = pts[i]; return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1] || 1)); } return pts[pts.length - 1][0]; }
function buildMush() {
  const g = new THREE.Group(); const info = { kind: 'mush' }; STAGE.v = 0;
  const stem = [[0.01, 0], [1.8, 0], [1.72, 0.35], [1.56, 1.5], [1.46, 2.55], [1.5, 2.9], [0.01, 2.95]];
  add(g, lathe(stem, 28), M('#f6ead2', { r: 0.8 }));
  add(g, lathe([[0.01, 2.5], [2.95, 2.42], [3.15, 2.72], [2.9, 3.5], [1.95, 4.32], [0.9, 4.66], [0.01, 4.72]], 36), M('#ffffff', { map: TX.mush, r: 0.5 }));
  add(g, cylG(2.85, 1.3, 0.22, 28), M('#f3dcc0'), 0, 2.46, 0);
  const rAt = (y) => profAt(stem, y);
  const d = makeDoor(1.0, 1.7, { depth: 0.7 }); d.group.position.set(0, 0.06, rAt(0.9) + 0.02); g.add(d.group);
  onSurface(g, makeRoundWindow(0.36, { flowers: true }), -1.05, 1.55, rAt, 0.07);
  onSurface(g, makeRoundWindow(0.32), 1.1, 1.7, rAt, 0.07);
  add(g, cylG(0.75, 0.85, 0.18, 10), MAT.rock, 0, 0.09, 2.45, 0, 0, 0, 1, 1, 0.7);
  add(g, cylG(0.17, 0.2, 1.0, 8), M('#a2553a'), 1.15, 4.35, -0.7); add(g, cylG(0.26, 0.26, 0.14, 8), M('#8a4a30'), 1.15, 4.9, -0.7);
  info.smoke = [1.15, 5.1, -0.7];
  makeLantern(g, 0.95, 2.2, rAt(2.2) + 0.25, 0.6); add(g, boxG(0.08, 0.08, 0.35), MAT.dark, 0.95, 2.25, rAt(2.2) + 0.05);
  makePot(g, -1.25, 0, 2.15, 0.7, '#ff6f91');
  for (let i = 0; i < 9; i++) { const a = PI * 0.5 + (i < 5 ? -1 : 1) * (0.7 + (i % 5) * 0.42); add(g, sphereG(R(0.3, 0.45), 10, 8), i % 2 ? MAT.leaf : MAT.green, Math.sin(a) * 2.0, 0.2, Math.cos(a) * 2.0, 0, 0, 0, 1, 0.65, 1); }
  info.door = [0, rAt(0.9) + 0.6]; info.doorY = 0.06; STAGE.v = 0;
  return { g, info };
}
function buildLeaf() {
  const g = new THREE.Group(); const info = { kind: 'leaf' }; STAGE.v = 0;
  add(g, cylG(2.5, 2.65, 0.26, 22), MAT.wood, 0, 0.13, 0);
  const twig = M('#8a5a34', { r: 0.9 });
  for (const z of [-1.55, 1.55]) for (const s of [-1, 1]) { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 2.15, 0.2, z), new THREE.Vector3(s * 1.1, 2.0, z), new THREE.Vector3(s * 0.1, 3.35, z)]); add(g, taperTube(c, 10, 0.12, 0.08, 6), twig); }
  add(g, cylG(0.09, 0.09, 4.0, 6), twig, 0, 3.32, 0, PI / 2);
  const l1 = M('#5cb84a', { r: 0.55, ds: true }), l2 = M('#4a9e3c', { r: 0.6, ds: true }), rib = M('#9ad46a', { r: 0.7 });
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const z = -1.35 + k * 1.35, m = (k + (s > 0 ? 1 : 0)) % 2 ? l1 : l2;
    add(g, sphereG(1, 16, 10), m, s * 1.12, 1.85 + (k % 2) * 0.08, z, 0, 0, s * 0.98, 1.95, 0.1, 0.95);
    add(g, cylG(0.035, 0.03, 3.6, 5), rib, s * 1.17, 1.92, z, 0, 0, s * 0.98 + PI / 2);
  }
  add(g, sphereG(1, 16, 10), l2, 0, 1.55, -1.75, 0, 0, 0, 2.0, 1.6, 0.1);
  for (const s of [-1, 1]) add(g, sphereG(1, 12, 8), l1, s * 1.25, 1.0, 1.62, 0, 0, s * 0.35, 0.72, 1.05, 0.08);
  add(g, sphereG(0.32, 12, 8), M('#8a5a32'), 0, 3.55, 0, 0, 0, 0, 1, 0.6, 1); add(g, sphereG(0.26, 12, 8), M('#c48a50'), 0, 3.32, 0);
  const d = makeDoor(0.95, 1.55, { depth: 0.3, noWin: true }); d.group.position.set(0, 0.26, 1.6); g.add(d.group);
  makeLantern(g, 0.0, 2.75, 1.75, 0.55);
  makePot(g, 1.7, 0.26, 1.5, 0.65, '#ffd23f'); makePot(g, -1.75, 0, 2.2, 0.6);
  info.door = [0, 2.25]; info.doorY = 0.26; STAGE.v = 0;
  return { g, info };
}

// ---------------------------------------------------------------- 松果屋（开局的自然材料小屋）
function buildPine() {
  const g = new THREE.Group(); const info = { kind: 'pine' }; STAGE.v = 0;
  const prof = [[0.01, 0], [1.55, 0], [2.05, 0.7], [2.2, 1.7], [2.0, 2.8], [1.45, 3.7], [0.7, 4.3], [0.01, 4.5]];
  add(g, lathe(prof, 24), M('#8a5634', { r: 0.85 }));
  const rAt = (y) => profAt(prof, y);
  const sc1 = M('#b07440', { r: 0.8 }), sc2 = M('#96602f', { r: 0.8 }), tip = M('#d9a66a', { r: 0.8 });
  for (let row = 0; row < 6; row++) {
    const y = 0.75 + row * 0.6; const n = Math.max(5, Math.round(rAt(y) * 3.6));
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + row * 0.4; const da = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      if (da < 0.55 && y < 2.4) continue; // 门口留空
      const r = rAt(y) + 0.04; const m = add(g, sphereG(1, 10, 6), (i + row) % 2 ? sc1 : sc2, Math.sin(a) * r, y, Math.cos(a) * r, 0, a, 0, 0.46, 0.3, 0.13); m.rotation.set(-0.45, a, 0, 'YXZ');
      if ((i + row) % 3 === 0) add(g, sphereG(1, 8, 5), tip, Math.sin(a) * (r + 0.08), y - 0.2, Math.cos(a) * (r + 0.08), 0, 0, 0, 0.2, 0.08, 0.2);
    }
  }
  add(g, sphereG(0.5, 12, 8), M('#5a8f3a', { r: 0.8 }), 0, 4.55, 0, 0, 0, 0, 1, 0.5, 1);
  for (let k = 0; k < 3; k++) add(g, sphereG(1, 10, 6), MAT.leaf, Math.cos(k * 2.1) * 0.45, 4.75, Math.sin(k * 2.1) * 0.45, 0, -k * 2.1, 0.6, 0.55, 0.08, 0.25);
  const d = makeDoor(0.95, 1.6, { depth: 0.6 }); d.group.position.set(0, 0.06, rAt(0.9) + 0.02); g.add(d.group);
  onSurface(g, makeRoundWindow(0.34, { flowers: true }), -1.15, 2.0, rAt, 0.07);
  onSurface(g, makeRoundWindow(0.3), 1.2, 2.3, rAt, 0.07);
  STAGE.v = 1; add(g, cylG(0.7, 0.8, 0.16, 10), MAT.rock, 0, 0.08, rAt(0.2) + 0.55, 0, 0, 0, 1, 1, 0.7);
  STAGE.v = 3; add(g, cylG(0.16, 0.19, 0.9, 8), M('#a2553a'), -0.9, 4.0, -0.6); add(g, cylG(0.24, 0.24, 0.12, 8), M('#8a4a30'), -0.9, 4.48, -0.6);
  info.smoke = [-0.9, 4.65, -0.6];
  makeLantern(g, 0.9, 2.15, rAt(2.1) + 0.25, 0.55);
  makePot(g, 1.35, 0, 1.95, 0.65, '#ff9a3c');
  info.door = [0, rAt(0.9) + 0.6]; info.doorY = 0.06; STAGE.v = 0;
  return { g, info };
}
// ---------------------------------------------------------------- 店铺门面：门前两张小桌、招牌、花盆（同一个物件，改成店之后多出来的部分）
const SIGN_TEX = {};
function signTex(ch, col) {
  return SIGN_TEX[ch] || (SIGN_TEX[ch] = ctex(128, 96, (c, w, h) => {
    c.fillStyle = '#7a4a26'; c.beginPath(); c.roundRect(0, 0, w, h, 14); c.fill();
    c.fillStyle = '#fbf0d8'; c.beginPath(); c.roundRect(7, 7, w - 14, h - 14, 10); c.fill();
    c.fillStyle = col; c.font = 'bold 62px "PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, w / 2, h / 2 + 3);
  }));
}
export const SHOP_OF = { tea: 'tea', cup: 'tea', fish: 'food', honey: 'food' };
function addShopDressing(root, door, shop) {
  const sg = new THREE.Group(); root.add(sg);
  const top = M('#e8c48a', { r: 0.7 }), leg = MAT.woodDark, china = M('#fbf6ee', { r: 0.35 });
  STAGE.v = 3;
  for (const [tx, tz] of SHOP_TABLES) {
    const x = door[0] + tx, z = door[1] + tz;
    add(sg, cylG(0.6, 0.6, 0.08, 20), top, x, 0.74, z); add(sg, cylG(0.07, 0.09, 0.7, 8), leg, x, 0.37, z); add(sg, cylG(0.3, 0.36, 0.05, 12), leg, x, 0.03, z);
    if (shop === 'tea') {
      for (const k of [-1, 1]) { add(sg, cylG(0.15, 0.15, 0.02, 14), china, x + k * 0.28, 0.79, z + 0.05); add(sg, cylG(0.09, 0.07, 0.13, 12), china, x + k * 0.28, 0.86, z + 0.05); add(sg, cylG(0.075, 0.075, 0.01, 10), M('#b5702e', { r: 0.3 }), x + k * 0.28, 0.92, z + 0.05); }
      add(sg, sphereG(0.15, 14, 10), M('#8fc6c0', { r: 0.4 }), x, 0.9, z - 0.22, 0, 0, 0, 1, 0.85, 1); add(sg, cylG(0.03, 0.04, 0.16, 6), M('#8fc6c0', { r: 0.4 }), x + 0.16, 0.92, z - 0.22, 0, 0, -1.0);
    } else {
      for (const k of [-1, 1]) { add(sg, lathe([[0.01, 0], [0.12, 0.01], [0.17, 0.09], [0.18, 0.11]], 14), china, x + k * 0.28, 0.78, z + 0.05); add(sg, sphereG(0.13, 10, 6), M(k < 0 ? '#f2b03c' : '#e8603c', { r: 0.6 }), x + k * 0.28, 0.86, z + 0.05, 0, 0, 0, 1, 0.45, 1); }
      add(sg, cylG(0.16, 0.16, 0.05, 14), M('#d9a066', { r: 0.6 }), x, 0.8, z - 0.22);
    }
  }
  makePot(sg, door[0] - 1.25, 0, door[1] - 0.15, 0.75, '#ffd23f');
  STAGE.v = 2;
  const sx = door[0] - 1.6, sz = door[1] + 0.85;
  add(sg, boxG(0.12, 2.3, 0.12), leg, sx, 1.15, sz); add(sg, boxG(1.05, 0.08, 0.08), leg, sx + 0.45, 2.22, sz);
  for (const k of [0.08, 0.82]) add(sg, cylG(0.012, 0.012, 0.28, 4), MAT.dark, sx + k, 2.06, sz);
  add(sg, boxG(0.95, 0.68, 0.07), M('#ffffff', { map: signTex(shop === 'tea' ? '茶' : '食', shop === 'tea' ? '#3f7a3a' : '#c4502e'), r: 0.7 }), sx + 0.45, 1.6, sz);
  STAGE.v = 0;
}
// ---------------------------------------------------------------- templates
export const KIND_SCALE = { egg: 0.72, tea: 0.64, fish: 0.66, boot: 0.56, rboot: 0.54, cup: 0.6, honey: 0.74, leaf: 1, mush: 1, pine: 0.9 };
const BUILDERS = { egg: buildEgg, tea: buildTeapot, fish: buildFishcan, boot: buildBoot, rboot: buildRainBoot, cup: buildCup, honey: buildHoney, leaf: buildLeaf, mush: buildMush, pine: buildPine };
function hashStr(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
export let DBG_PARTS = null; export function dbgParts(on) { DBG_PARTS = on ? [] : null; return DBG_PARTS; }
const _inv = new THREE.Matrix4(), _box = new THREE.Box3(), _c = new THREE.Vector3(), _sz = new THREE.Vector3();
// 把整栋房子烘焙成按材质分桶的合并几何体。lo=true 时生成远景简化版：圆周分段约减到 40%，去掉很小的零件，门和风向标直接烘进去
export function buildTemplate(rk, lo = false) {
  const base = rk.endsWith('S') ? rk.slice(0, -1) : rk; const shop = rk.endsWith('S') ? SHOP_OF[base] : null;
  const oldSeed = reseed(hashStr(base)); DETAIL.v = lo ? 0.45 : 1; STAGE.v = 0; // 远景版：分段数约减到 45%（太低会让松果屋的主体变成六棱锥、鳞片悬空）
  try {
    const { g, info } = BUILDERS[base](); const s = KIND_SCALE[base];
    const root = new THREE.Group(); g.scale.setScalar(s); root.add(g);
    if (shop) addShopDressing(root, [info.door[0] * s, info.door[1] * s], shop);
    root.updateMatrixWorld(true);
    const statics = new Map(); const dyns = new Map(); let r = 0, h = 0, tris = 0;
    const bucketOf = (map, o, mt, plain) => { const key = plain ? `vc|${mt.roughness > 0.55 ? 0.8 : 0.4}|false` : mt.uuid; /* 纯色材料按粗糙两档合并，减少绘制调用 */ if (!map.has(key)) map.set(key, { key, src: mt, vc: plain, list: [] }); return map.get(key); };
    root.traverse(o => {
      if (!o.isMesh) return; const mt = o.material;
      let dyn = null; for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.dyn) { dyn = p; break; }
      const geo = norm(o.geometry);
      if (dyn && !lo) { _inv.copy(dyn.matrixWorld).invert(); geo.applyMatrix4(_inv.clone().multiply(o.matrixWorld)); }
      else geo.applyMatrix4(o.matrixWorld);
      const n = geo.attributes.position.count; const P = geo.attributes.position.array;
      _box.setFromBufferAttribute(geo.attributes.position); _box.getCenter(_c); _box.getSize(_sz);
      if (!dyn || lo) for (let i = 0; i < n; i++) { r = Math.max(r, Math.hypot(P[i * 3], P[i * 3 + 2])); h = Math.max(h, P[i * 3 + 1]); }
      const glow = mt.emissiveIntensity * (mt.emissive.r + mt.emissive.g + mt.emissive.b) > 0;
      if (lo && !glow && _sz.length() < 0.32) return; // 远景：很小的零件不要了（主要部件、扣带、藤蔓保留）
      const plain = mt.isMeshStandardMaterial && !mt.map && !mt.vertexColors && mt.metalness < 0.3 && !glow;
      if (plain) { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = mt.color.r; a[i * 3 + 1] = mt.color.g; a[i * 3 + 2] = mt.color.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
      else if (geo.attributes.color) geo.deleteAttribute('color');
      const stg = new Float32Array(n).fill(o.userData.stg || 0), piv = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { piv[i * 3] = _c.x; piv[i * 3 + 1] = _c.y; piv[i * 3 + 2] = _c.z; }
      geo.setAttribute('aStg', new THREE.BufferAttribute(stg, 1)); geo.setAttribute('aPiv', new THREE.BufferAttribute(piv, 3));
      let map = statics;
      if (dyn && !lo) { if (!dyns.has(dyn)) dyns.set(dyn, { type: dyn.userData.spin ? 'spin' : 'door', pivot: dyn.matrixWorld.clone(), map: new Map() }); map = dyns.get(dyn).map; }
      bucketOf(map, o, mt, plain).list.push(geo); tris += n / 3; if (DBG_PARTS) DBG_PARTS.push([Math.round(n / 3), o.geometry.type, '#' + (mt.color ? mt.color.getHexString() : ''), _sz.toArray().map(v => +v.toFixed(2)).join('x')]);
    });
    const finish = (map) => [...map.values()].map(b => { const geo = mergeGeometries(b.list, false); geo.computeBoundingSphere(); return { key: b.key, src: b.src, vc: b.vc, geo }; });
    return { kind: rk, base, lo, buckets: finish(statics), dyn: [...dyns.values()].map(d => ({ type: d.type, pivot: d.pivot, buckets: finish(d.map) })), r, h,
      door: [info.door[0] * s, info.door[1] * s], doorY: (info.doorY || 0) * s, smoke: info.smoke ? info.smoke.map(v => v * s) : null, tris: Math.round(tris) };
  } finally { reseed(oldSeed); DETAIL.v = 1; STAGE.v = 0; }
}
