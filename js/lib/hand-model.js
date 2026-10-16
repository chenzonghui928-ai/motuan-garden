// 玩家的手（放东西模式）：程序化 3D，Q 版手办感——圆润短胖手指（指节、圆指甲）、哑光暖肤色，燕麦色粗针织毛衣袖（罗纹袖口）。
// 只露前臂 + 袖子，从屏幕上方伸进来。姿势：pinch 捏持 / release 张开放下 / hover 空闲悬停；setGrip(高, 厚) 让手指贴合不同大小的物件。
// 建模单位：手腕到中指尖 ≈ 1，整体放大到 HAND_LEN（世界单位）。材质与 Lenia 共用（lenia-model.js）。
import * as THREE from 'three';
import { patch } from './core.js';
import { leniaMaterials } from './lenia-model.js';

export const HAND_LEN = 4;              // 世界单位：和小镇里大件旧物（茶壶屋约 5～6 高）同一量级
const PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

let _nail = null;
function nailMat() { if (_nail) return _nail; _nail = new THREE.MeshStandardMaterial({ color: '#f7d3c8', roughness: 0.38 }); patch(_nail, { rim: 0.5, wx: 0 }); return _nail; }
const mesh = (geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.scale.set(...s); m.castShadow = true; m.receiveShadow = true; return m; };
const triCount = (root) => { let n = 0; root.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; };
function latheY(ctrl, seg = 28, n = 16) { const c = new THREE.SplineCurve(ctrl.map(p => new THREE.Vector2(p[0], p[1]))); return new THREE.LatheGeometry(c.getSpacedPoints(n).map(v => new THREE.Vector2(Math.max(v.x, 0.0005), v.y)), seg); }

// 手的坐标：手腕在原点，手指朝 -y，手背朝 +z（朝镜头），掌心朝 -z，拇指在 +x 一侧（右手）
const FINGERS = [ // [x, 近节长, 远节长, 半径]
  [0.125, 0.145, 0.13, 0.054], [0.04, 0.16, 0.14, 0.056], [-0.045, 0.148, 0.13, 0.054], [-0.125, 0.115, 0.105, 0.048],
];
const KNUCKLE_Y = -0.43;
function buildFinger(M, x, l1, l2, r) {
  const base = new THREE.Group(); base.position.set(x, KNUCKLE_Y, -0.005);
  base.add(mesh(new THREE.CapsuleGeometry(r, l1, 4, 12), M.skin, [0, -l1 / 2, 0]));
  base.add(mesh(new THREE.SphereGeometry(r * 1.08, 12, 8), M.skin, [0, 0.005, 0.012], [0, 0, 0], [1, 0.9, 0.9])); // 掌指关节的小鼓包
  const mid = new THREE.Group(); mid.position.set(0, -l1, 0); base.add(mid);
  mid.add(mesh(new THREE.SphereGeometry(r * 1.04, 12, 8), M.skin, [0, 0, 0.004], [0, 0, 0], [1, 0.9, 1])); // 指节
  mid.add(mesh(new THREE.CapsuleGeometry(r * 0.97, l2, 4, 12), M.skin, [0, -l2 / 2, 0]));
  mid.add(mesh(new THREE.SphereGeometry(1, 12, 8, 0, TAU, 0, PI / 2), nailMat(), [0, -l2 * 0.82, r * 0.72], [PI / 2 - 0.18, 0, 0], [r * 0.62, r * 0.25, r * 0.72])); // 圆指甲
  const tip = new THREE.Object3D(); tip.position.set(0, -l2 - r * 0.6, -r * 0.55); mid.add(tip); // 指腹
  return { base, mid, tip, r };
}
function buildThumb(M) {
  const base = new THREE.Group(); base.position.set(0.15, -0.17, -0.05);
  const r = 0.056, l1 = 0.12, l2 = 0.11;
  base.add(mesh(new THREE.SphereGeometry(0.085, 14, 10), M.skin, [-0.01, -0.02, 0.0], [0, 0, 0], [0.9, 1.3, 0.9])); // 拇指根的肉垫
  base.add(mesh(new THREE.CapsuleGeometry(r, l1, 4, 12), M.skin, [0, -l1 / 2, 0]));
  const mid = new THREE.Group(); mid.position.set(0, -l1, 0); base.add(mid);
  mid.add(mesh(new THREE.SphereGeometry(r * 1.04, 12, 8), M.skin));
  mid.add(mesh(new THREE.CapsuleGeometry(r * 0.96, l2, 4, 12), M.skin, [0, -l2 / 2, 0]));
  mid.add(mesh(new THREE.SphereGeometry(1, 12, 8, 0, TAU, 0, PI / 2), nailMat(), [0, -l2 * 0.82, r * 0.72], [PI / 2 - 0.18, 0, 0], [r * 0.62, r * 0.25, r * 0.72]));
  const tip = new THREE.Object3D(); tip.position.set(0, -l2 - r * 0.6, -r * 0.5); mid.add(tip);
  return { base, mid, tip, r };
}

let _fadeKnit = null; // 袖子尾端渐隐用的针织材料（顶点 alpha）
function fadeKnit(M) { if (_fadeKnit) return _fadeKnit; const m = M.knit.clone(); m.vertexColors = true; m.transparent = true; patch(m, { rim: 0.9, wx: 0 }); return (_fadeKnit = m); }
// fade：袖子从 fade×armLength 处往外慢慢淡掉（游戏里俯视大视野时手臂不会变成横穿整个画面的长杆子）
let _warmSkin = null; // 游戏里的手：比 Lenia 预览的肤色再暖一点（小镇的强日光 + 色调映射下不发白）
export function createPlayerHand({ armLength = 3.2, reach = 0.55, facing = -1.0, fade = 0, warm = false } = {}) {
  const M0 = leniaMaterials(); const M = warm ? { ...M0, skin: _warmSkin || (_warmSkin = (() => { const m = M0.skin.clone(); m.color.set('#f0b48f'); m.emissive.set('#6a2a10'); m.emissiveIntensity = 0.08; patch(m, { rim: 0.55, wx: 0 }); return m; })()) } : M0;
  const group = new THREE.Group(); group.name = 'PlayerHand';
  const root = new THREE.Group(); root.scale.setScalar(HAND_LEN); group.add(root);
  const turn = new THREE.Group(); turn.rotation.y = facing; root.add(turn);            // 默认把拇指/食指一侧转向镜头，捏的动作看得清
  const arm = new THREE.Group(); arm.rotation.x = reach; turn.add(arm);            // 前臂从上方、朝镜头一侧伸进来
  // 袖子：罗纹袖口 + 粗针织袖身（一直伸出画面）
  arm.add(mesh(latheY([[0.17, 0.04], [0.2, 0.06], [0.205, 0.16], [0.21, 0.25], [0.19, 0.27]]), M.rib, [0, 0, 0]));
  const sleeve = mesh(latheY([[0.185, 0.24], [0.23, 0.32], [0.255, 0.6], [0.27, 1.2], [0.29, armLength]], 30, 18), fade ? fadeKnit(M) : M.knit); arm.add(sleeve);
  if (fade) { const P = sleeve.geometry.attributes.position, C = new Float32Array(P.count * 4); for (let i = 0; i < P.count; i++) { const y = P.getY(i); C.set([1, 1, 1, 1 - smooth(armLength * fade, armLength, y)], i * 4); } sleeve.geometry.setAttribute('color', new THREE.BufferAttribute(C, 4)); sleeve.castShadow = false; }
  sleeve.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = i % 2 ? v * armLength * 1.6 : v * 5; });
  const wrist = new THREE.Group(); wrist.rotation.x = -reach; arm.add(wrist);        // 手腕弯回来，手自然下垂
  wrist.add(mesh(new THREE.CylinderGeometry(0.15, 0.165, 0.22, 20), M.skin, [0, 0.0, -0.005]));
  // 手掌：厚软的圆角掌，手背略鼓
  const palmG = new THREE.SphereGeometry(1, 26, 18); { const p = palmG.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); x *= 1 + 0.12 * smooth(0.2, -0.8, y); z *= z > 0 ? 1.0 : 0.8; p.setXYZ(i, x, y, z); } palmG.computeVertexNormals(); }
  wrist.add(mesh(palmG, M.skin, [0, -0.25, -0.005], [0, 0, 0], [0.205, 0.25, 0.1]));
  const fingers = FINGERS.map(([x, l1, l2, r]) => { const f = buildFinger(M, x, l1, l2, r); wrist.add(f.base); return f; });
  const thumb = buildThumb(M); wrist.add(thumb.base);
  const hold = new THREE.Group(); wrist.add(hold);                                     // 物件挂在这里
  const cur = { curl: 0.3, spread: 0, lift: 0, ring: 0.6, tx: 0.3, tz: 0.6, tm: 0.2 };
  const H = { mode: 'pinch', obj: null, h: 0.5, w: 0.3, front: 0.15, dropV: 0, dropping: null, first: true, t: 0 };
  const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const poseFingers = (c) => fingers.forEach((f, i) => { const k = i === 0 ? c.curl : i === 1 ? c.curl * 0.92 : Math.max(c.curl, c.ring); const sp = (i - 1.5) * -0.07 * c.spread;
    f.base.rotation.set(k * 0.9, 0, sp); f.mid.rotation.set(k * 1.0, 0, 0); });
  const poseThumb = (tx, tz, tm) => { thumb.base.rotation.set(tx, 0, tz); thumb.mid.rotation.set(tm, 0, 0); };
  // 手腕坐标里的指尖位置（只用局部矩阵，不碰世界矩阵）
  const tipLocal = (f, out) => { f.base.updateMatrix(); f.mid.updateMatrix(); return out.copy(f.tip.position).applyMatrix4(f.mid.matrix).applyMatrix4(f.base.matrix); };
  const pose = () => { poseFingers(cur); poseThumb(cur.tx, cur.tz, cur.tm); root.position.y = cur.lift; };
  // 捏持：食指指腹在物件前面，拇指指腹绕到后面，两指相距 = 物件被捏部分的厚度。网格搜索拇指角度（只在握法变化时算一次）
  const solved = { key: '', tx: 0.3, tz: 0.6, tm: 0.2 };
  const solveThumb = (curl, span) => {
    const key = curl.toFixed(3) + '|' + span.toFixed(3); if (key === solved.key) return solved;
    poseFingers({ curl, ring: 0.9, spread: 0.2 }); const it = tipLocal(fingers[0], _a).clone(); const tgt = it.add(_v.set(-0.015, -0.01, -span));
    let best = 1e9;
    for (let tx = 0; tx <= 1.81; tx += 0.06) for (let tz = -0.7; tz <= 1.01; tz += 0.06) for (const tm of [0.15, 0.4, 0.7]) {
      poseThumb(tx, tz, tm); const d = tipLocal(thumb, _b).distanceToSquared(tgt); if (d < best) { best = d; Object.assign(solved, { tx, tz, tm }); }
    }
    solved.key = key; return solved;
  };
  const api = {
    group, armLength, get mode() { return H.mode; },
    // 物件原点在底面中心；h = 捏住处的顶高、w = 捏住部分的厚度、front = 物件中轴到捏住部分前表面的距离（世界单位）
    setGrip(h, w = h * 0.8, front = w / 2) { H.h = h / HAND_LEN; H.w = w / HAND_LEN; H.front = front / HAND_LEN; },
    attach(obj, h, w = h * 0.8, front = w / 2) { if (H.obj && H.obj !== obj && H.obj.parent === hold) hold.remove(H.obj); H.obj = obj; H.dropping = null; hold.add(obj); obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); obj.scale.setScalar(1 / HAND_LEN); api.setGrip(h, w, front); H.mode = 'pinch'; },
    setMode(m, instant = false) { if (m === H.mode && !instant) return; const prev = H.mode; H.mode = m; if (instant) H.first = true;
      if (prev === 'pinch' && m !== 'pinch' && H.obj && H.obj.parent === hold) { // 松手：物件留在原地往下落
        const o = H.obj; const wp = new THREE.Vector3(), wq = new THREE.Quaternion(); o.getWorldPosition(wp); o.getWorldQuaternion(wq); const par = group.parent || group;
        par.add(o); par.worldToLocal(wp); o.position.copy(wp); o.quaternion.copy(wq); o.scale.setScalar(1); H.dropping = o; H.dropV = 0; H.dropFloor = 0; } },
    update(dt, t) {
      H.t = t; const m = H.mode; const tight = 1 - smooth(0.04, 0.45, H.w);
      const pc = lerp(0.72, 1.0, tight);
      const th = m === 'pinch' ? solveThumb(pc, clamp(H.w, 0.015, 0.3) + fingers[0].r * 0.9 + thumb.r * 0.9) : m === 'release' ? { tx: 0.1, tz: 0.85, tm: 0.1 } : { tx: 0.45, tz: 0.45, tm: 0.3 };
      const tg = m === 'pinch' ? { curl: pc, spread: 0.15, ring: 1.15, lift: 0, ...th }
        : m === 'release' ? { curl: 0.08, spread: 1, ring: 0.15, lift: 0.18 + 0.03 * Math.sin(t * 2), ...th }
        : { curl: 0.35, spread: 0.35, ring: 0.6, lift: 0.05 * Math.sin(t * 1.4), ...th };
      const k = H.first ? 1 : 1 - Math.exp(-dt * 8); H.first = false;
      for (const key of ['curl', 'spread', 'ring', 'lift', 'tx', 'tz', 'tm']) cur[key] = lerp(cur[key], tg[key], k);
      pose();
      // 轻晃（三个姿势都有，悬停时最明显）
      const sw = m === 'hover' ? 1 : 0.4; root.rotation.set(0.04 * Math.sin(t * 1.1) * sw, 0.08 * Math.sin(t * 0.7) * sw, 0.05 * Math.sin(t * 0.9 + 1) * sw);
      if (!H.obj || H.obj.parent === hold) { // 物件：被捏部分夹在食指指腹（前）和拇指指腹（后）之间（没挂物件时也算，游戏里用 anchor() 把手对到物件上）
        const a = tipLocal(fingers[0], _a), b = tipLocal(thumb, _b); const mid = a.add(b).multiplyScalar(0.5);
        const top = mid.y + clamp(H.w * 0.5, 0.02, 0.06);
        hold.position.set(mid.x, top - H.h, mid.z + H.w / 2 - H.front);
      }
      if (H.dropping) { const o = H.dropping; H.dropV += 30 * dt; o.position.y = Math.max(H.dropFloor, o.position.y - H.dropV * dt); if (o.position.y <= H.dropFloor) { H.dropping = null; } }
    },
    // 被捏物件底面中心的世界坐标（游戏里物件由别处画，手按这个点对齐：group.position += 目标 - anchor）
    anchor(out = new THREE.Vector3()) { group.updateMatrixWorld(true); return hold.getWorldPosition(out); },
    worldBottom() { const b = new THREE.Box3().setFromObject(group); return b.min.y; },
  };
  api.update(0, 0); api.tris = triCount(group);
  return api;
}

// 地面上的柔和投影斑：随手的高度变大变淡，让人看出悬空多高（实时阴影之外的补充，远景也能用）
export function createHandShadow() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(40,30,20,0.55)'); gr.addColorStop(0.5, 'rgba(40,30,20,0.25)'); gr.addColorStop(1, 'rgba(40,30,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.renderOrder = 1; const _p = new THREE.Vector3();
  return { mesh: m, update(hand, obj) { const src = obj && obj.group.parent ? obj.group : hand.group; src.getWorldPosition(_p); const hgt = Math.max(0, hand.worldBottom()); const s = HAND_LEN * (0.7 + hgt * 0.12); m.position.set(_p.x, 0.02, _p.z); m.scale.set(s, 1, s * 0.8); m.material.opacity = clamp(1 - hgt / (HAND_LEN * 4), 0.15, 0.9); } };
}

// 预览用的两件旧物（世界单位，原点在底面中心）：茶壶、小纽扣
export function makeTeapot() {
  const k = HAND_LEN; const g = new THREE.Group();
  const glaze = new THREE.MeshStandardMaterial({ color: '#5fb8ae', roughness: 0.35 }), cream = new THREE.MeshStandardMaterial({ color: '#fff1d2', roughness: 0.45 }); patch(glaze, { wx: 0 }); patch(cream, { wx: 0 });
  g.add(mesh(latheY([[0.001, 0], [0.26, 0.01], [0.38, 0.18], [0.37, 0.36], [0.26, 0.5], [0.16, 0.54]], 32, 18), glaze, [0, 0, 0], [0, 0, 0], [k, k, k]));
  g.add(mesh(latheY([[0.17, 0.53], [0.18, 0.56], [0.12, 0.62], [0.03, 0.65], [0.001, 0.66]], 24, 8), cream, [0, 0, 0], [0, 0, 0], [k, k, k]));
  g.add(mesh(new THREE.SphereGeometry(0.045, 12, 8), cream, [0, 0.69 * k, 0], [0, 0, 0], [k, k, k]));
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.3, 0.18, 0), new THREE.Vector3(0.5, 0.3, 0), new THREE.Vector3(0.58, 0.5, 0)]), 12, 0.05, 10), glaze, [0, 0, 0], [0, 0, 0], [k, k, k]));
  g.add(mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 18, PI * 1.2), glaze, [-0.38 * k, 0.3 * k, 0], [0, 0, PI * 0.4], [k, k, k]));
  return { group: g, h: 0.735 * k, w: 0.09 * k, front: 0.045 * k };   // 捏的是壶盖顶上的小圆钮
}
export function makeButton() {
  const k = HAND_LEN; const g = new THREE.Group(); const red = new THREE.MeshStandardMaterial({ color: '#e0563f', roughness: 0.4 }); patch(red, { wx: 0 });
  const r = 0.08, t = 0.03; const body = mesh(new THREE.CylinderGeometry(r, r, t, 28), red, [0, r * k, 0], [PI / 2, 0, 0], [k, k, k]); g.add(body);
  const rim = mesh(new THREE.TorusGeometry(r * 0.92, t * 0.35, 6, 28), red, [0, r * k, 0], [0, 0, 0], [k, k, k]); g.add(rim);
  const dark = new THREE.MeshStandardMaterial({ color: '#7a2416', roughness: 0.6 });
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, t * 1.05, 8), dark, [x * 0.022 * k, (r + y * 0.022) * k, 0], [PI / 2, 0, 0], [k, k, k]));
  return { group: g, h: 2 * r * k, w: t * k, front: t * k / 2 };
}
