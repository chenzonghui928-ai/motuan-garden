// 入口：渲染器、昼夜、相机、鱼缸模式、点选居民、存档；模拟在 Worker 里，主线程只做插值、动画和界面
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Q, LOW, IS_MOBILE, PI, clamp, lerp, smooth, initCore, MAT, DYN_EMISSIVE, METALS, rimU, timeU, globalMerge, ctex, WXU, SEASONAL } from './lib/core.js';
import { buildSpecies, SPECIES as SPM, MAXC, makeAnimState, writeChar, headTopY } from './lib/characters.js';
import { buildGround, buildWater, waterMat, buildAltar, buildPlaza, buildResources, buildGates, buildBackdrop, buildFlora, groundH, OUTER_TREES } from './lib/environment.js';
import { Town, Roads } from './render/town.js';
import { Props } from './render/props.js';
import { makeThumbs } from './render/thumbs.js';
import { WeatherFX } from './render/weather.js';
import { SEASON_DAYS, SEASONS } from './shared/seasons.js';
import { createUI } from './ui.js';
import { loadArt, hydrate, setThumbs, icon } from './ui-art.js';
import { startGuide, guideSeen } from './guide.js';
import { createLenia } from './lenia-talk.js';
import { createAudio } from './audio.js';
import { play as sfx, animal as sfxAnimal } from './sfx.js';
import { createBubbles } from './bubble.js';
import { settings, onSetting } from './settings.js';
import { thoughtOf } from './shared/text.js';
import { Cameo, LENIA_CAMEO } from './render/cameo.js';
import { Interior, canEnter, warmInterior, ROOM_NAME } from './render/interior.js';
import { Worksite } from './render/worksite.js';
import { FoodFX } from './render/foodfx.js';
import { DAY, SPECIES, WORLD_R, GATES, streamDist, CAP, STORE_POS } from './shared/layout.js';
import { DESTS } from './shared/journey.js';
import { ITEMS, ITEM_K, TEMPLATE_OF, TEMPLATE_KINDS, renderKindOf, placeCheck, SEEDS, goldRings, moveCheck, movable, COMBOS, PLACE_R } from './shared/items.js';
import { Nugget, GoldRings, NUGGET_SIZE } from './render/mascot.js';
import { localFoot } from './shared/footprint.js';
import { createPlayerHand, createHandShadow, HAND_LEN } from './lib/hand-model.js';

const SAVE_KEY = 'lenia-garden-save-v2';
const SNAP_STRIDE = 7, TICK_MS = 200;
const DEBUG = Q.has('debug'); if (DEBUG) document.body.classList.add('debug');

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(devicePixelRatio || 1, LOW ? 1.75 : 2);
renderer.setPixelRatio(DPR); renderer.setSize(innerWidth, innerHeight, false); let prBase = DPR, prNow = DPR; // prBase：基础像素比（鱼缸会改）；prNow：当前实际用的（快进画质会再降）
renderer.shadowMap.enabled = true; renderer.shadowMap.type = LOW ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.info.autoReset = false;
initCore(renderer);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 1, 1800);

// ---------------------------------------------------------------- world
const tBuild0 = performance.now();
buildGround(scene); buildWater(scene);
const altar = buildAltar(scene);
buildPlaza(scene);
const updateResources = buildResources(scene);
const gateList = buildGates(scene); buildBackdrop(scene);
altar.egg.userData.noMerge = true;
globalMerge(scene);
const nFl0 = scene.children.length; const maskFlora = buildFlora(scene);
const floraIMs = scene.children.slice(nFl0).filter(o => o.isInstancedMesh).map(im => ({ im, full: im.count })); // 草/花/三叶草：快进画质时减量
buildSpecies(scene);
const town = new Town(scene);
const props = new Props(scene); town.onLand = (x, z, r) => props.puff(x, z, r);
const roads = new Roads(scene);
const weather = new WeatherFX(scene);
const cameo = new Cameo(scene, props); // Lenia 的身影（偶尔露出局部）
const nugget = new Nugget(scene); // 鸡块：Lenia 家的白团子，常驻花园的小吉祥物
nugget.camera = camera; // 停下、被点、睡觉时转向镜头
const golds = new GoldRings(scene); // 放置模式的金圈
const foodfx = new FoodFX(scene); // 手里的食物小模型、烤面包的轻烟
const worksite = new Worksite(scene); // 改造中的房子：脚手架、绳子围栏、材料堆、头顶小牌子
const interior = new Interior(scene); interior.camera = camera; // 进屋（玩具屋式掀顶）
const buildMs = performance.now() - tBuild0;

// ---------------------------------------------------------------- lights, sky, day cycle
const hemi = new THREE.HemisphereLight('#cfe8ff', '#8a9a52', 1.2); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff2dc', 3.0); sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 54, bottom: -54, near: 10, far: 300 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } },
  vertexShader: `varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h=clamp(vP.y,0.0,1.0); gl_FragColor=vec4(mix(hor,top,pow(h,0.55)),1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }` });
const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), skyMat); sky.renderOrder = -1; scene.add(sky);
const FOG_N = 170, FOG_F = 520; // 空气墙配套：雾调近，地面尽头和地平线都被雾盖住（最远镜头 190、墙内最远 ~120）
scene.fog = new THREE.Fog('#e9f6ff', FOG_N, FOG_F);
const KF = [
  { t: 0.00, sun: '#7f8fff', si: 0.7, sky: '#6f78d0', gnd: '#3b3f6e', hi: 1.15, top: '#1b2058', hor: '#4b4f9a', exp: 1.05, night: 1, rim: '#5866e0' },
  { t: 0.165, sun: '#7f8fff', si: 0.7, sky: '#6f78d0', gnd: '#3b3f6e', hi: 1.15, top: '#252a6a', hor: '#5a5aa0', exp: 1.05, night: 1, rim: '#5866e0' },
  { t: 0.215, sun: '#ffa868', si: 1.7, sky: '#ffc9a8', gnd: '#7a6a50', hi: 1.0, top: '#7d9ee0', hor: '#ffc89a', exp: 1.05, night: 0.55, rim: '#ffb080' },
  { t: 0.27, sun: '#ffdcaa', si: 3.0, sky: '#d8ecff', gnd: '#94924e', hi: 1.15, top: '#78b8f2', hor: '#fff0d2', exp: 1.08, night: 0.12, rim: '#ffe0b0' },
  { t: 0.40, sun: '#fff1da', si: 3.3, sky: '#d6ecff', gnd: '#93a256', hi: 1.2, top: '#6cb2f4', hor: '#eaf6ff', exp: 1.05, night: 0.0, rim: '#fff4e0' },
  { t: 0.62, sun: '#fff1da', si: 3.3, sky: '#d6ecff', gnd: '#93a256', hi: 1.2, top: '#6cb2f4', hor: '#eaf6ff', exp: 1.05, night: 0.0, rim: '#fff4e0' },
  { t: 0.73, sun: '#ffd49a', si: 2.9, sky: '#ffe2c4', gnd: '#94884e', hi: 1.1, top: '#7aa8e8', hor: '#ffe0b8', exp: 1.06, night: 0.15, rim: '#ffd0a0' },
  { t: 0.795, sun: '#ffa05c', si: 2.3, sky: '#ffd0b0', gnd: '#80684e', hi: 1.05, top: '#8e9ce0', hor: '#ffbe94', exp: 1.08, night: 0.55, rim: '#ffa8a0' },
  { t: 0.905, sun: '#b496ff', si: 1.0, sky: '#8f8ee0', gnd: '#46476e', hi: 1.1, top: '#3a3f92', hor: '#b882b0', exp: 1.08, night: 0.95, rim: '#a090ff' },
  { t: 0.85, sun: '#7f8fff', si: 0.7, sky: '#6f78d0', gnd: '#3b3f6e', hi: 1.15, top: '#1e2360', hor: '#4b4f9a', exp: 1.05, night: 1, rim: '#5866e0' },
  { t: 1.00, sun: '#7f8fff', si: 0.7, sky: '#6f78d0', gnd: '#3b3f6e', hi: 1.15, top: '#1b2058', hor: '#4b4f9a', exp: 1.05, night: 1, rim: '#5866e0' },
];
KF.forEach(k => { for (const key of ['sun', 'sky', 'gnd', 'top', 'hor', 'rim']) k[key] = new THREE.Color(k[key]); });
const _c1 = new THREE.Color(), _v = new THREE.Vector3(); let NIGHT = 0;
const dayDir = new THREE.Vector3(), moonDir = new THREE.Vector3(0.35, 0.8, -0.5).normalize();
function applyTime(t) {
  let a = KF[0], b = KF[1]; for (let i = 0; i < KF.length - 1; i++) if (t >= KF[i].t && t <= KF[i + 1].t) { a = KF[i]; b = KF[i + 1]; break; }
  const f = smooth(0, 1, (t - a.t) / (b.t - a.t || 1));
  sun.color.copy(a.sun).lerp(b.sun, f); sun.intensity = lerp(a.si, b.si, f);
  hemi.color.copy(a.sky).lerp(b.sky, f); hemi.groundColor.copy(a.gnd).lerp(b.gnd, f); hemi.intensity = lerp(a.hi, b.hi, f);
  skyMat.uniforms.top.value.copy(a.top).lerp(b.top, f); skyMat.uniforms.hor.value.copy(a.hor).lerp(b.hor, f); scene.fog.color.copy(skyMat.uniforms.hor.value);
  renderer.toneMappingExposure = lerp(a.exp, b.exp, f);
  NIGHT = lerp(a.night, b.night, f);
  worldLight();
  rimU.value.copy(a.rim).lerp(b.rim, f).multiplyScalar(0.32 + NIGHT * 0.1);
  const dt = clamp((t - 0.21) / 0.63, 0, 1); const az = lerp(PI * 0.92, PI * 2.08, dt); const el = lerp(0.22, 1.05, Math.sin(dt * PI));
  dayDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el) * 0.8 - 0.25).normalize();
  const isDay = smooth(0.17, 0.215, t) * (1 - smooth(0.83, 0.875, t));
  sun.position.copy(sun.target.position).addScaledVector(_v.copy(moonDir).lerp(dayDir, isDay).normalize(), 140);
  DYN_EMISSIVE.window.emissiveIntensity = 0.35 + NIGHT * 2.6; DYN_EMISSIVE.lantern.emissiveIntensity = 0.25 + NIGHT * 4.0;
  waterMat.uniforms.uLight.value.copy(sun.color).multiplyScalar(0.25 * sun.intensity / 3.3).add(_c1.copy(hemi.color).multiplyScalar(0.75 * hemi.intensity / 1.2));
  waterMat.uniforms.uSpark.value = 0.4 + isDay * 0.8;
  town.smokeMat.uniforms.uColor.value.copy(hemi.color).lerp(_c1.set('#ffffff'), 0.5).multiplyScalar(0.85 + 0.15 * (1 - NIGHT));
  for (const m of METALS) m.envMapIntensity = 0.3 + (1 - NIGHT) * 0.75;
  altar.light.intensity = 4 + NIGHT * 14;
}

// ---------------------------------------------------------------- 季节和天气：草地、树叶、光线色温随季节平滑变化；阴天雨天光线变暗变冷，雾更近
const SEA = { // leaf/grass 乘在原来的绿色上；sun/hemi 光线色温；ex 曝光
  spring: { leaf: '#9ed35a', la: 0.45, grass: [1.06, 1.08, 0.8], sun: [1.0, 1.0, 0.97], hemi: [1.0, 1.02, 0.98], ex: 1.0 },
  summer: { leaf: '#3d8a36', la: 0.35, grass: [0.8, 0.95, 0.7], sun: [1.05, 1.0, 0.9], hemi: [1.02, 1.0, 0.94], ex: 1.03 },
  autumn: { leaf: '#e9b334', leaf2: '#d8562a', la: 0.9, grass: [1.85, 1.0, 0.42], sun: [1.08, 0.93, 0.78], hemi: [1.05, 0.96, 0.86], ex: 1.0 },
  winter: { leaf: '#9a8664', la: 0.7, grass: [1.7, 0.95, 1.05], sun: [0.9, 0.96, 1.12], hemi: [0.92, 0.98, 1.1], ex: 1.02 },
};
const wxS = { rain: 0, snow: 0, cloud: 0, cover: 0, wet: 0, fest: 0 }; // 平滑后的天气（目标值来自模拟）
const seaS = { leaf: new THREE.Color(1, 1, 1), grass: new THREE.Color(1, 1, 1), sun: new THREE.Color(1, 1, 1), hemi: new THREE.Color(1, 1, 1), ex: 1, si: 0, f: 0, w: [1, 0, 0, 0], leafOp: 1, bloom: 0 };
const _sa = new THREE.Color(), _sb = new THREE.Color(), _wc = new THREE.Color(); const wxv = document.getElementById('wxv');
const _lc = new THREE.Color(), _lc2 = new THREE.Color(); let curWx = 'sun';
function seaCol(key, si, f) { const P = SEA[SEASONS[si]]; const v = P[key]; if (key === 'leaf') { _lc.set(v); if (P.leaf2) _lc.lerp(_lc2.set(P.leaf2), smooth(0.1, 0.95, f)); return [_lc.r, _lc.g, _lc.b]; } return v; }
function seasonAt(simT) { // 季节位置：si 当前季、f 季内进度；换季后第一天平滑过渡
  const pos = (simT / DAY / SEASON_DAYS) % 4; const si = Math.floor(pos), f = pos - si, pv = (si + 3) % 4; const b = smooth(0, 1 / SEASON_DAYS, f);
  for (const k of ['leaf', 'grass', 'sun', 'hemi']) { _sa.setRGB(...seaCol(k, pv, 1)); _sb.setRGB(...seaCol(k, si, f)); seaS[k].copy(_sa).lerp(_sb, b); }
  seaS.ex = lerp(SEA[SEASONS[pv]].ex, SEA[SEASONS[si]].ex, b); seaS.la = lerp(SEA[SEASONS[pv]].la, SEA[SEASONS[si]].la, b); seaS.si = si; seaS.f = f; seaS.w = [0, 0, 0, 0]; seaS.w[si] = b; seaS.w[pv] += 1 - b;
  const name = SEASONS[si]; seaS.leafOp = name === 'spring' ? 0.3 + 0.7 * smooth(0, 0.35, f) : name === 'summer' ? 1 : name === 'autumn' ? 1 - 0.88 * smooth(0.4, 1.0, f) : 0.12 * (1 - smooth(0, 0.15, f));
  seaS.bloom = name === 'spring' ? smooth(0.03, 0.22, f) * (1 - smooth(0.78, 1.0, f)) : 0;
}
function worldLight() {
  const cl = wxS.cloud, rn = wxS.rain, sn = wxS.snow;
  sun.color.multiply(seaS.sun).lerp(_wc.set('#d9e1ef'), cl * 0.45); sun.intensity *= (1 - 0.64 * cl) * seaS.ex;
  hemi.color.multiply(seaS.hemi).lerp(_wc.set('#bac7d8'), cl * 0.38); hemi.groundColor.lerp(_wc.set('#5c6272'), cl * 0.3); hemi.intensity *= 1 - 0.1 * cl + sn * 0.06;
  const dim = 1 - NIGHT * 0.82; skyMat.uniforms.top.value.lerp(_wc.set('#8d9bb0').multiplyScalar(dim), cl * 0.8); skyMat.uniforms.hor.value.lerp(_wc.set('#d2d8df').multiplyScalar(dim), cl * 0.72);
  scene.fog.color.copy(skyMat.uniforms.hor.value); scene.fog.near = lerp(FOG_N, 70, Math.max(rn * 0.85, sn * 0.7)); scene.fog.far = lerp(FOG_F, 300, Math.max(rn * 0.85, sn * 0.65));
  renderer.toneMappingExposure *= 1 - 0.1 * cl;
  wxv.style.opacity = (rn * 0.32 + sn * 0.06 + cl * 0.06).toFixed(3); // 雨天整体偏冷偏暗（一层很淡的蓝灰）
}
function updateWorld(dt) {
  const s = lastSnap; const simT = s ? s.t + (performance.now() - snapAt) / 1000 * speed : DAY * 0.3; seasonAt(simT);
  const w = s && s.wx ? s.wx : [0, 0, 0, 0]; const k = ['sun', 'cloud', 'rain', 'snow'][w[0]] || 'sun'; curWx = k;
  const a = 1 - Math.exp(-dt / 9), b = 1 - Math.exp(-dt / 2.5); // 天气 9 秒左右平滑过渡；积雪、湿润跟着模拟慢慢变
  wxS.rain += ((k === 'rain' ? 1 : 0) - wxS.rain) * a; wxS.snow += ((k === 'snow' ? 1 : 0) - wxS.snow) * a; wxS.cloud += ({ sun: 0, cloud: 0.5, rain: 1, snow: 0.75 }[k] - wxS.cloud) * a;
  wxS.cover += (w[1] - wxS.cover) * b; wxS.wet += (Math.max(w[2], wxS.rain * 0.6) - wxS.wet) * b; wxS.fest = w[3];
  WXU.uSnow.value = wxS.cover; WXU.uWet.value = wxS.wet; WXU.uLeafT.value.copy(seaS.leaf); WXU.uLeafA.value = seaS.la; WXU.uGrassT.value.copy(seaS.grass);
  for (const m of SEASONAL.drop) { m.opacity = seaS.leafOp; m.visible = seaS.leafOp > 0.02; }
  for (const m of SEASONAL.bloom) { m.opacity = seaS.bloom; m.visible = seaS.bloom > 0.02; }
  return simT;
}
// ---------------------------------------------------------------- camera / controls / fish tank
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.07;
controls.minPolarAngle = 0.25; controls.maxPolarAngle = 1.3; controls.minDistance = 6; controls.maxDistance = 190;
controls.screenSpacePanning = false; controls.zoomSpeed = 0.9; controls.rotateSpeed = 0.6;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
// ---------------------------------------------------------------- 空气墙：镜头目标点限制在圆形范围内（软边界 + 回弹）
// 基础半径 80，随已建范围略扩大（所有已放置物件到中心的最大距离 + 余量，与 80 取大，上限 120）；拖出边界时有阻力，松手平滑弹回；进屋、跟随、飞行中不管。
const WALL_R0 = 80, WALL_RMAX = 120, WALL_PAD = 14, WALL_SOFT = 16; // WALL_SOFT：拖着时最多能拖出边界多远
let wallS = WALL_R0, wallT = WALL_R0, ctlDrag = false;
controls.addEventListener('start', () => { ctlDrag = true; }); controls.addEventListener('end', () => { ctlDrag = false; });
const wallRadius = () => wallT;
function wallUpdate() { wallT = clamp(Math.max(WALL_R0, town.extent() + WALL_PAD), WALL_R0, WALL_RMAX); }
function applyWall(dt) {
  wallS += (wallT - wallS) * (1 - Math.exp(-dt * 2)); // 已建范围变大时墙平滑外移
  if (interior.busy || cam.fly) return;
  const tx = controls.target.x, tz = controls.target.z, r = Math.hypot(tx, tz); if (r <= wallS) return;
  const ex = r - wallS, k = ctlDrag ? 1 - Math.exp(-dt * 16) : 1 - Math.exp(-dt * 6); // 拖着：每帧被拉回一大截（越拖越吃力，最多超出 WALL_SOFT）；松手：平滑弹回
  const nr = wallS + Math.min(ex * (1 - k), WALL_SOFT), f = nr / r;
  const mx = tx * f - tx, mz = tz * f - tz; controls.target.x += mx; controls.target.z += mz; camera.position.x += mx; camera.position.z += mz;
}
function wallClampPoint(v, pad = 0) { const r = Math.hypot(v.x, v.z), lim = wallS - pad; if (r > lim) { v.x *= lim / r; v.z *= lim / r; } return v; }
const CTL0 = { minPolarAngle: controls.minPolarAngle, maxPolarAngle: controls.maxPolarAngle, minDistance: controls.minDistance, maxDistance: controls.maxDistance, enablePan: true, rotateSpeed: controls.rotateSpeed };
// 双指拧（绕镜头中心水平转）：OrbitControls 只管双指缩放 + 平移，拧的角度在这里补上；放置模式（镜头锁住）不转
const twist = { pts: new Map(), a: null };
const twistAng = () => { const [p, q] = [...twist.pts.values()]; return Math.atan2(q[1] - p[1], q[0] - p[0]); };
canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; twist.pts.set(e.pointerId, [e.clientX, e.clientY]); twist.a = twist.pts.size === 2 ? twistAng() : null; });
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'touch' || !twist.pts.has(e.pointerId)) return; twist.pts.set(e.pointerId, [e.clientX, e.clientY]); if (twist.pts.size !== 2) return;
  const a = twistAng(); if (twist.a != null && controls.enabled && controls.enableRotate) { const d = Math.atan2(Math.sin(a - twist.a), Math.cos(a - twist.a)); if (Math.abs(d) < 0.5) { _tw.copy(camera.position).sub(controls.target).applyAxisAngle(_twY, d); camera.position.copy(controls.target).add(_tw); } }
  twist.a = a;
});
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, (e) => { twist.pts.delete(e.pointerId); twist.a = null; });
const _tw = new THREE.Vector3(), _twY = new THREE.Vector3(0, 1, 0);
// 进屋后：单指绕房子转（水平 360°、俯仰限制在不穿地不穿顶）、双指缩放（有上下限）、不平移；阻尼带惯性，松手停在哪就是哪
function insideControls(on) {
  if (on) { const d = camera.position.distanceTo(controls.target); const r = interior.shellR || 3;
    Object.assign(controls, { minPolarAngle: 0.16, maxPolarAngle: 1.3, minDistance: Math.max(r * 1.7, d * 0.42), maxDistance: Math.max(d * 1.7, r * 6), enablePan: false, rotateSpeed: 0.75 }); controls.enabled = true; }
  else { Object.assign(controls, CTL0); }
}
function setView(dist, pol, azi, tx = 0, tz = 0) { controls.target.set(tx, 0, tz); camera.position.set(tx + Math.sin(pol) * Math.sin(azi) * dist, Math.cos(pol) * dist, tz + Math.sin(pol) * Math.cos(azi) * dist); controls.update(); }
// 让相机正好框住整个小镇（按房子包围点投影二分求距离；竖屏多试几个方位角取最近的）
const _fc = new THREE.PerspectiveCamera(), _fv = new THREE.Vector3();
function fitView(pol, fov, aspect, azis, margin = 0.9) {
  const P = town.fitPoints(); let cx = 0, cz = 0; for (const p of P) { cx += p[0] / P.length; cz += p[2] / P.length; }
  _fc.fov = fov; _fc.aspect = aspect; _fc.near = 1; _fc.far = 3000; _fc.updateProjectionMatrix(); let best = null;
  for (const az of azis) {
    let tx = cx, tz = cz, d = 100;
    for (let it = 0; it < 3; it++) {
      const place = (dd) => { _fc.position.set(tx + Math.sin(pol) * Math.sin(az) * dd, Math.cos(pol) * dd, tz + Math.sin(pol) * Math.cos(az) * dd); _fc.lookAt(tx, 0, tz); _fc.updateMatrixWorld(); };
      const bounds = () => { let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (const p of P) { _fv.set(p[0], p[1], p[2]).project(_fc); x0 = Math.min(x0, _fv.x); x1 = Math.max(x1, _fv.x); y0 = Math.min(y0, _fv.y); y1 = Math.max(y1, _fv.y); } return { x0, x1, y0, y1 }; };
      let lo = 10, hi = 900; for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; place(mid); const b = bounds(); if (b.x0 > -margin && b.x1 < margin && b.y0 > -margin * 0.8 && b.y1 < margin * 0.86) hi = mid; else lo = mid; }
      d = hi; place(d); const b = bounds(); const ox = (b.x0 + b.x1) / 2, oy = (b.y0 + b.y1) / 2 - 0.04;
      const halfH = d * Math.tan(fov * PI / 360), halfW = halfH * aspect;
      tx += (Math.cos(az) * ox * halfW - Math.sin(az) * oy * halfH / Math.cos(pol)) * 0.9; tz += (-Math.sin(az) * ox * halfW - Math.cos(az) * oy * halfH / Math.cos(pol)) * 0.9;
    }
    if (!best || d < best.d) best = { d, az, tx, tz };
  }
  return best;
}
function defaultView() {
  const portrait = innerHeight > innerWidth * 1.1; camera.fov = portrait ? 46 : 34; camera.updateProjectionMatrix();
  const pol = portrait ? 0.68 : 0.82; const azis = portrait ? [-0.6, -0.3, 0, 0.3, 0.6] : [0.12];
  const f = fitView(pol, camera.fov, camera.aspect, azis, portrait ? 1.06 : 0.9);
  setView(f.d, pol, f.az, f.tx, f.tz);
}
let viewExtent = 0;
let userHold = 0; controls.addEventListener('start', () => { userHold = 25; }); // 跟随：真的拖动/双指/滚轮才停（见 stopFollow），轻点不停
// 镜头平滑移动到某处 / 跟随某位居民
const cam = { fly: null, follow: null };
function focusAt(x, z, dist = 26) {
  const off = camera.position.clone().sub(controls.target); const pol = 0.9, azi = Math.atan2(off.x, off.z);
  cam.fly = { t: 0, tx: x, tz: z, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(x + Math.sin(pol) * Math.sin(azi) * dist, (groundY(x, z)) + Math.cos(pol) * dist, z + Math.sin(pol) * Math.cos(azi) * dist), t1: new THREE.Vector3(x, groundY(x, z) + 1, z) };
  userHold = 20; cam.follow = null;
}
const groundY = (x, z) => Math.hypot(x, z) > WORLD_R + 4 ? groundH(x, z) : 0;
const tank = { on: false, timer: 0, mode: 'orbit', follow: null, azi: 0, dist: 120, camT: new THREE.Vector3(), camP: new THREE.Vector3() };
function tankNext() {
  tank.timer = 16 + Math.random() * 10;
  const hauls = lastSnap ? lastSnap.proj.filter(p => p.stage === 'haul' || p.stage === 'renovate') : [];
  const vis = [...chars.values()].filter(c => !c.hidden && c.act !== 6);
  const r = Math.random();
  if (hauls.length && r < 0.4) { tank.mode = 'haul'; tank.follow = hauls[Math.floor(Math.random() * hauls.length)].lot; tank.azi = Math.random() * PI * 2; tank.dist = 30; }
  else if (r < 0.8 && vis.length) { tank.mode = 'follow'; tank.follow = vis[Math.floor(Math.random() * vis.length)].id; tank.azi = Math.random() * PI * 2; tank.dist = 15 + Math.random() * 6; }
  else { tank.mode = 'orbit'; tank.azi = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z); tank.dist = town.extent() * 2.0 + 14 + Math.random() * 16; }
}
function updateTank(dt) {
  if (!tank.on || userHold > 0) return;
  tank.timer -= dt; if (tank.timer <= 0) tankNext();
  let T, pol = 0.8;
  if (tank.mode === 'follow' && chars.get(tank.follow) && !chars.get(tank.follow).hidden) { const c = chars.get(tank.follow); T = tank.camT.set(c.x, c.y + 0.8, c.z); pol = 0.98; }
  else if (tank.mode === 'haul' && town.lots.get(tank.follow) && lastSnap && lastSnap.proj.some(p => p.lot === tank.follow)) { const d = town.lots.get(tank.follow); T = tank.camT.set(d.x, groundY(d.x, d.z) + 1, d.z); pol = 0.92; }
  else { if (tank.mode !== 'orbit') tankNext(); T = tank.camT.set(-2, 0, 0); pol = 0.8; }
  wallClampPoint(T, 4); tank.azi += dt * 0.035;
  const P = tank.camP.set(T.x + Math.sin(pol) * Math.sin(tank.azi) * tank.dist, T.y + Math.cos(pol) * tank.dist, T.z + Math.sin(pol) * Math.cos(tank.azi) * tank.dist);
  const k = 1 - Math.exp(-dt * 0.7); controls.target.lerp(T, k); camera.position.lerp(P, k);
}

// ---------------------------------------------------------------- worker bridge + interpolation
const chars = new Map();     // id -> anim state (+ interpolation)
props.chars = chars;
let lastSnap = null, snapAt = 0, dayT = 0.3, speed = 1, saveBytes = 0, struct = null, info = null;
const kindsMeta = town.meta();
const worker = new Worker(new URL('./sim/sim.worker.js', import.meta.url), { type: 'module' });
let saved = null; try { saved = Q.has('fresh') ? null : localStorage.getItem(SAVE_KEY); } catch (e) { }
if (saved) saveBytes = saved.length;
const send = (m) => worker.postMessage(m);
const ui = createUI({ send, enter: (id) => enterInterior(id), focus: (x, z) => { exitInterior(true); focusAt(x, z); }, follow: (id) => startFollow(id), startMove: (id) => startMove(id), select: (id) => select(id), onSheet: (open) => { sheetOpen = open; }, startPlace: (k) => startPlace(k), dragPlace: (k, e) => startPlaceDrag(k, e), startTend: (m, seed) => startTend(m, seed),
  tripStart: (dest, rid) => { const D = DESTS[dest]; if (!D) return; const g = GATES[D.gate]; if (rid != null) setTimeout(() => { cam.follow = rid; userHold = 0; cam.fly = null; }, 300); else setTimeout(() => focusAt(g[0] * 0.82, g[1] * 0.82, 48), 400); } }); // 小队出发：镜头飞到村口，看着它们走出去
loadArt().then(() => hydrate(document.body));
const audio = createAudio(); audio.mount(); // 背景音乐 + 环境音 + 音乐盒
const lenia = createLenia({ ui, onEvent: (k) => { if (k === 'cheer') audio.cheer(); } }); // Lenia 说话
let sheetOpen = false, selected = null;
function select(id) { selected = id; }
send({ type: 'init', save: saved, kinds: kindsMeta, seed: Q.has('seed') ? +Q.get('seed') : undefined });
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'struct') { struct = m.st; _ps = null; nugget.setStruct(struct); if (mode.kind === 'place') refreshGold(); town.setStruct(struct); props.setStruct(struct); weather.setStruct(struct); roads.rebuild(struct.nodes, struct.edges); maskFlora(struct.lots.filter(l => l.stage !== 'far'), struct.nodes, struct.edges); if (moveWait) { const l = struct.lots.find(l => l.id === moveWait.id); if (!l) { moveWait = null; town.hideId = props.hideId = -1; } else if (Math.hypot(l.x - moveWait.x, l.z - moveWait.z) < 0.8) { landMoved(l.id); moveWait = null; town.hideId = props.hideId = -1; } } wallUpdate(); const ex = town.extent(); if (Math.abs(ex - viewExtent) > 5 && userHold <= 0 && !tank.on && !cam.follow && !interior.busy) { viewExtent = ex; defaultView(); } if (interior.busy && !struct.lots.some(l => l.id === interior.lotId && canEnter(l))) exitInterior(true); }
  else if (m.type === 'snap') onSnap(m);
  else if (m.type === 'info') { info = m.info; gateNew.clear(); for (const f of info.far) { let b = 0, bd = 1e9; GATES.forEach((g, i) => { const d = Math.hypot(g[0] - f.x, g[1] - f.z); if (d < bd) { bd = d; b = i; } }); gateNew.add(b); } ui.onInfo(info); if (!document.getElementById('guide')) lenia.onInfo(info); /* 引导进行时 Lenia 的卡片就是她在说话，不再叠第二个气泡 */ renderFollow(); if (mode.kind === 'plant' || mode.kind === 'water') renderTend(); }
  else if (m.type === 'dreamResult') ui.onDreamResult(m);
  else if (m.type === 'leniaResult') { dispatchEvent(new CustomEvent('lenia-act', { detail: m })); if (onAct(m)) return; ui.onLenia(m); if (m.act === 'plant' || m.act === 'water') floatText(m.ok ? (m.act === 'plant' ? '种下了' : m.why) : m.why); }
  else if (m.type === 'save') { try { localStorage.setItem(SAVE_KEY, m.data); saveBytes = m.data.length; } catch (err) { saveBytes = -1; } }
  else if (m.type === 'advanced') { window.__ng.lastAdvance = m; }
};
// 居民插值（修抽搐）：以前每到一份快照就从“当前显示位置（含避让偏移）”重新出发，避让偏移被算了两次，
// 站着挨在一起的小动物每 0.2 秒被拽一下、走路动画也被误触发；快照晚到时还会停一下再猛冲。
// 现在：每只居民存最近几份快照（按名义时间 = 上一份 + 200ms，慢慢对齐真实到达时间），画面落后 250ms 在两份之间平滑插值；
// 避让偏移只加在最后显示的位置上；朝向限制每帧最大转角；走路动画的速度缓起缓停。
const INTERP_DELAY = TICK_MS * 1.25, TURN_MAX = 3.4; let snapNom = 0;
function onSnap(s) {
  const now = performance.now(); const b = s.buf; const n = s.pop; const alive = new Set();
  snapNom = snapNom ? snapNom + TICK_MS : now; snapNom += (now - snapNom) * 0.08; if (Math.abs(now - snapNom) > 450) snapNom = now; // 名义时间：均匀的 200ms 一步，慢慢跟上真实到达时间
  for (let i = 0; i < n; i++) {
    const o = i * SNAP_STRIDE; const id = b[o]; let c = chars.get(id); alive.add(id); const x = b[o + 2], z = b[o + 3], yw = b[o + 4];
    if (!c) { c = makeAnimState(id, SPECIES[b[o + 1]]); c.x = c.bx = x; c.z = c.bz = z; c.yaw = yw; c.vis = 0; c.h = []; chars.set(id, c); }
    const L = c.h[c.h.length - 1]; if (L && Math.hypot(x - L[1], z - L[2]) > 40 + speed) c.h.length = 0; // 瞬移（远行回来等）：不插值
    c.h.push([snapNom, x, z, yw]); if (c.h.length > 5) c.h.shift(); c.act = b[o + 5]; c.flags = b[o + 6];
  }
  for (const id of [...chars.keys()]) if (!alive.has(id)) chars.delete(id);
  if (!lastSnap || Math.abs(s.dayT - dayT) > 0.02 && Math.abs(s.dayT - dayT) < 0.98) dayT = s.dayT;
  lastSnap = s; snapAt = now; speed = s.speed;
  town.setProjects(s.proj); props.setProjects(s.proj); updateResources(s.stock, s.stores || s.store);
}
const angD = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function interpolate(dt) {
  const R = performance.now() - INTERP_DELAY;
  for (const c of chars.values()) {
    const h = c.h; if (!h.length) continue; const pbx = c.bx, pbz = c.bz; let x, z, ty;
    if (R <= h[0][0] || h.length === 1) { x = h[0][1]; z = h[0][2]; ty = h[0][3]; if (h.length === 1) { x = h[0][1]; z = h[0][2]; } }
    else if (R >= h[h.length - 1][0]) { const A = h[h.length - 1]; x = A[1]; z = A[2]; ty = A[3]; }
    else { let i = h.length - 2; while (i > 0 && h[i][0] > R) i--; const A = h[i], B = h[i + 1]; const f = clamp((R - A[0]) / Math.max(1, B[0] - A[0]), 0, 1); x = lerp(A[1], B[1], f); z = lerp(A[2], B[2], f); ty = A[3] + angD(A[3], B[3]) * f; }
    c.bx = x; c.bz = z; if (c.lookK > 0.02 && c.spd < 0.5) ty += angD(ty, c.lookTy) * c.lookK; // 抬头看 Lenia 的身影
    const dy = angD(c.yaw, ty); c.yaw += clamp(dy * Math.min(1, dt * 9), -TURN_MAX * dt, TURN_MAX * dt); // 转身平滑，每帧有最大转角
    const sp = Math.hypot(c.bx - pbx, c.bz - pbz) / Math.max(dt, 1e-3); c.spd += (Math.min(sp, 8) - c.spd) * Math.min(1, dt * 5); // 缓起缓停
    c.x = c.bx + (c.sx || 0); c.z = c.bz + (c.sz || 0);
    c.hidden = !!(c.flags & 2) || interior.hide.has(c.id); c.vis = interior.hide.has(c.id) ? 0 : clamp(c.vis + (c.hidden ? -dt * 4 : dt * 3), 0, 1); // 进屋时：屋里画了的居民，外面的那份藏起来
    c.y = groundY(c.x, c.z);
  }
}
// 角色 LOD + 阴影策略：近处高模，远处低模；低功耗模式（手机/鱼缸）角色用脚下阴影斑，阴影贴图每 0.5 秒刷新一次
const LOD_D = LOW ? 30 : 42;
const blobIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: ctex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(25,45,15,0.42)'); g.addColorStop(0.6, 'rgba(25,45,15,0.25)'); g.addColorStop(1, 'rgba(25,45,15,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), 64);
blobIM.frustumCulled = false; blobIM.count = 0; scene.add(blobIM);
// 选中居民脚下的光圈
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.82, 32).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, depthWrite: false })); selRing.visible = false; scene.add(selRing);
const realShadows = () => !LOW && !tank.on && !fq.frozen;
let shadowT = 0, nLo = 0, nHi = 0;
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3(), _bp = new THREE.Vector3();
// 纯表现层的避让：相互重叠的角色轻轻推开（不回写模拟），避免排成一串叠在一起
const SEP = new Map();
function separate(dt) {
  SEP.clear(); for (const c of chars.values()) { if (c.hidden || (c.act === 10)) continue; const k = Math.floor(c.x / 1.2) * 4096 + Math.floor(c.z / 1.2); let a = SEP.get(k); if (!a) SEP.set(k, a = []); a.push(c); }
  for (const c of chars.values()) {
    let px = 0, pz = 0;
    if (!c.hidden && c.act !== 10) { const gx = Math.floor(c.x / 1.2), gz = Math.floor(c.z / 1.2);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = SEP.get((gx + i) * 4096 + gz + j); if (!a) continue; for (const o of a) { if (o === c) continue; const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz); if (d < 0.95 && d > 1e-4) { const f = (0.95 - d) / d; px += dx * f; pz += dz * f; } else if (d <= 1e-4) { px += (c.id % 7 - 3) * 0.1; pz += (c.id % 5 - 2) * 0.1; } } } }
    const k = Math.min(1, dt * 3); c.sx = lerp(c.sx || 0, clamp((c.sx || 0) + px * 0.5, -1.5, 1.5), k); c.sz = lerp(c.sz || 0, clamp((c.sz || 0) + pz * 0.5, -1.5, 1.5), k);
    if (c.act === 10 || c.hidden) { c.sx *= 1 - k; c.sz *= 1 - k; }
  }
}
function updateCharacters(dt, t) {
  const real = realShadows(); const cnt = {}, cntLo = {}; for (const n of SPECIES) { cnt[n] = 0; cntLo[n] = 0; } let nBlob = 0; nLo = nHi = 0;
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  for (const c of interior.chars.size ? [...chars.values(), ...interior.chars.values()] : chars.values()) {
    const lo = Math.hypot(c.x - cx, c.y - cy, c.z - cz) > LOD_D;
    const i = lo ? cntLo[c.species] : cnt[c.species]; if (i >= MAXC) continue;
    if (lo) { cntLo[c.species]++; nLo++; } else { cnt[c.species]++; nHi++; }
    writeChar(c, i, t, dt, lo);
    if ((lo || !real) && c.vis > 0.05 && nBlob < 64) { const r = (c.species === 'bear' ? 0.75 : 0.6) * c.vis; _bm.compose(_bp.set(c.x, c.y + 0.03, c.z), _bq, _bs.set(r * 2, 1, r * 2)); blobIM.setMatrixAt(nBlob++, _bm); }
  }
  for (const n of SPECIES) { const sp = SPM[n];
    for (const [S, k] of [[sp, cnt[n]], [sp.lo, cntLo[n]]]) { S.im.count = k; S.im.visible = k > 0; S.im.instanceMatrix.needsUpdate = true; for (const a in S.attr) S.im.geometry.attributes[a].needsUpdate = true; }
    sp.im.castShadow = real; }
  blobIM.count = nBlob; blobIM.visible = nBlob > 0; blobIM.instanceMatrix.needsUpdate = true;
  if (real) renderer.shadowMap.autoUpdate = true;
  else { renderer.shadowMap.autoUpdate = false; shadowT += dt; if (shadowT > 0.5) { shadowT = 0; renderer.shadowMap.needsUpdate = true; } }
  // 选中的居民：脚下光圈 + 名字牌
  const sc = selected != null ? chars.get(selected) : null; const tag = document.getElementById('tag');
  if (sc && sc.vis > 0.3 && !tank.on) { selRing.visible = true; selRing.position.set(sc.x, sc.y + 0.05, sc.z); const s = 1 + Math.sin(t * 4) * 0.06; selRing.scale.set(s, 1, s);
    _v.set(sc.x, sc.y + 2.3, sc.z).project(camera); if (_v.z < 1) { tag.style.display = 'block'; tag.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth}px`; tag.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight}px`; const r = info && info.res.find(r => r.id === selected); tag.textContent = r ? r.name : ''; } else tag.style.display = 'none'; }
  else { selRing.visible = false; tag.style.display = 'none'; }
}

// ---------------------------------------------------------------- 点选居民（轻点，不是拖动）
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; if (mode.kind === 'place' || mode.kind === 'move') placeDown(e); });
canvas.addEventListener('pointermove', (e) => { if ((mode.kind === 'place' || mode.kind === 'move') && (mode.drag || pinch.pts.size > 1)) placeMove(e); else if (mode.kind) mode.hover = groundAt(e.clientX, e.clientY); else if (cam.follow != null && down && e.buttons && (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || twist.pts.size > 1)) stopFollow(); });
canvas.addEventListener('wheel', () => { if (cam.follow != null) stopFollow(); }, { passive: true });
canvas.addEventListener('pointerup', (e) => {
  if (tank.on) { peekTank(); return; }
  if (mode.kind === 'place' || mode.kind === 'move') { placeUp(e); return; }
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 450) return;
  if (mode.kind === 'plant' || mode.kind === 'water') { tendTap(e); return; }
  if (interior.busy) { insideTap(e); return; }
  const bk = bubbles.hit(e.clientX, e.clientY, e.pointerType === 'touch' ? 38 : 28); if (bk === 'nug') { nuggetTap(); return; } if (typeof bk === 'string') { ui.openGate(+bk.slice(1)); return; } if (bk != null) { openThought(bk); return; } // 点头顶的气泡 → 心声（村口的“！”→ 村口卡片）
  closeThought();
  let best = null, bd = 44;
  for (const c of chars.values()) { if (c.vis < 0.3) continue; _v.set(c.x, c.y + 0.7, c.z).project(camera); if (_v.z > 1) continue; const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight; const d = Math.hypot(sx - e.clientX, sy - e.clientY); if (d < bd) { bd = d; best = c; } }
  if (best) { sfxAnimal(best.species); if (bubbles.has(best.id)) openThought(best.id); else startFollow(best.id); return; } // 冒着气泡的居民：先看心声（框里能“跟着它”）；没气泡：镜头跟着它，底部小卡片
  if (nugget.hit(camera, e.clientX, e.clientY, innerWidth, innerHeight)) { nuggetTap(); return; }
  if (LENIA_CAMEO && cameo.hit(camera, e.clientX, e.clientY, innerWidth, innerHeight)) { cameoTap(); return; }
  const gi = pickGate(e.clientX, e.clientY); if (gi >= 0) { ui.openGate(gi); return; }
  const lot = pickLot(e.clientX, e.clientY, true); if (!lot) { if (pickStore(e.clientX, e.clientY)) ui.openThing('store'); return; }
  if (lot.moving) { mode.tap = { x: e.clientX, y: e.clientY }; floatText(`${lot.name}正在搬家，等落好了再进去`); return; }
  if (canEnter(lot)) enterInterior(lot.id); else if (unfinished(lot)) ui.openSite(lot.id); else ui.openThing(lot.id); // 盖好的进屋；没盖好的看施工牌；小设施、摆设、桥开小卡片
});
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { down = null; }); // 松手后清掉按下记录（排在上面的 pointerup 之后）：否则鼠标不按键飘过画布，也会被当成拖动把跟随打断
// 改造中的建筑（施工现场画面用）：位置跟着画面里的房子走
const _sites = [];
function siteList() {
  _sites.length = 0; if (!lastSnap) return _sites;
  for (const p of lastSnap.proj) { if (p.stage !== 'renovate' || p.lot === town.hideId) continue; let d = town.lots.get(p.lot), h, r;
    if (d) { if (!d.rk) continue; const T = town.ensure(d.rk, 'hi').T; h = T.h; r = T.r; } else { d = props.lots.get(p.lot); if (!d || d.use === 'bridge') continue; h = (ITEM_K[d.kind] || { h: 2 }).h; r = d.r; }
    _sites.push({ id: p.lot, x: d.x, z: d.z, yaw: d.yaw, r, h, y: groundY(d.x, d.z), prog: p.prog, miss: p.miss || [], pile: p.pile || [] }); }
  return _sites;
}
// ---------------------------------------------------------------- 进屋（玩具屋式）：点房子 → 镜头推近、盖子抬起；点空白处 / 返回钮 → 盖子落回、镜头拉回
function lotHR(l) { const S = town.sets[l.rk] && town.sets[l.rk].hi; if (S) return [S.T.h, S.T.r]; const K = ITEM_K[l.kind]; return [K ? K.h : 2, l.r || 2]; }
function pickStore(sx, sy) { _v.set(STORE_POS[0], 0.8, STORE_POS[1]).project(camera); if (_v.z > 1) return false; const px = (_v.x * 0.5 + 0.5) * innerWidth, py = (-_v.y * 0.5 + 0.5) * innerHeight; const dist = camera.position.distanceTo(_bp.set(STORE_POS[0], 0.8, STORE_POS[1])); return Math.hypot(px - sx, py - sy) < Math.max(26, 1.4 / dist * innerHeight / (2 * Math.tan(camera.fov * PI / 360))); } // 广场边的公共粮筐
const unfinished = (l) => !l.done && !l.up && l.stage !== 'far' && l.use !== 'bridge';
function pickLot(sx, sy, site = false) { // 屏幕上点中的建筑（能进的；site = 也算没盖好的）：投影房子中部，按屏幕上的大小判断，离镜头近的优先
  if (!struct) return null; let best = null, bd = 1e9;
  for (const l of struct.lots) { const wip = site && unfinished(l); if (!canEnter(l) && !wip && !(site && l.done && !l.up && l.stage !== 'far')) continue; /* site：小设施、摆设、桥也能点 */ const [h, r] = lotHR(l); const dl = wip ? (town.lots.get(l.id) || props.lots.get(l.id)) : null; const lx = dl ? dl.x : l.x, lz = dl ? dl.z : l.z; // 拖运中的按画面上的位置
    _v.set(lx, groundY(lx, lz) + h * 0.45, lz).project(camera); if (_v.z > 1) continue;
    const px = (_v.x * 0.5 + 0.5) * innerWidth, py = (-_v.y * 0.5 + 0.5) * innerHeight; const dist = camera.position.distanceTo(_bp.set(lx, h * 0.45, lz));
    const rad = Math.max(26, Math.max(r * 0.85, h * 0.5) / dist * innerHeight / (2 * Math.tan(camera.fov * PI / 360))); const d = Math.hypot(px - sx, py - sy);
    if (d < rad && dist < bd) { bd = dist; best = l; } }
  return best;
}
const insideCam = { pos: new THREE.Vector3(), target: new THREE.Vector3(), saved: null };
const intBar = document.getElementById('intBar'), intAvs = document.getElementById('intAvs'), intName = document.getElementById('intName');
function enterInterior(id) {
  if (tank.on || interior.busy || mode.kind) return false; const l = struct && struct.lots.find(l => l.id === id); if (!canEnter(l)) return false;
  const src = town.cutParts(id) || props.cutParts(id); if (!src || !src.parts) return false; const ov = src.tmpl ? props.cutParts(id) : null;
  if (!interior.enter(src, { ...l, cap: CAP[l.kind] || 2 }, ov)) return false;
  town.hideId = id; props.hideId = id; ui.close(); select(null);
  insideCam.saved = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
  const v = interior.view(camera); insideCam.pos.copy(v.pos); insideCam.target.copy(v.target);
  cam.fly = { t: 0, dur: 0.95, p0: camera.position.clone(), t0: controls.target.clone(), p1: v.pos.clone(), t1: v.target.clone() }; cam.follow = null; userHold = 1e9; controls.enabled = false;
  document.body.classList.add('inside'); setTimeout(() => document.body.classList.add('int-on'), 350);
  intName.textContent = l.name || ROOM_NAME[interior.type]; intAvs.innerHTML = '<span class="none">…</span>'; interior.whoDirty = true;
  return true;
}
function exitInterior(now = false) {
  if (!interior.busy) return; document.body.classList.remove('int-on'); insideControls(false); controls.enabled = false;
  const back = () => { town.hideId = -1; props.hideId = -1; document.body.classList.remove('inside'); controls.enabled = true; userHold = 6; };
  const sv = insideCam.saved;
  if (now) { interior.dispose(); back(); if (sv) { camera.position.copy(sv.pos); controls.target.copy(sv.target); } cam.fly = null; return; }
  interior.close(back);
  if (sv) setTimeout(() => { cam.fly = { t: 0, dur: 1.0, p0: camera.position.clone(), t0: controls.target.clone(), p1: sv.pos.clone(), t1: sv.target.clone() }; }, 260);
}
function insideTap(e) { // 屋里：点居民开名片；点房子外面的空白处出屋
  let best = null, bd = 44;
  for (const c of interior.chars.values()) { if (c.vis < 0.2) continue; _v.set(c.x, c.y + 0.5, c.z).project(camera); const d = Math.hypot((_v.x * 0.5 + 0.5) * innerWidth - e.clientX, (-_v.y * 0.5 + 0.5) * innerHeight - e.clientY); if (d < bd) { bd = d; best = c; } }
  if (best) { ui.openRes(best.id); return; }
  if (sheetOpen) { ui.close(); return; }
  if (interior.state === 'open' && !interior.screenHit(camera, e.clientX, e.clientY)) exitInterior();
}
function renderWho() {
  if (!interior.whoDirty) return; interior.whoDirty = false; const L = interior.who;
  intName.textContent = `${(interior.lot && interior.lot.name) || ROOM_NAME[interior.type]} · ${L.length ? `屋里有 ${L.length} 位` : '这会儿屋里没人'}`;
  intAvs.innerHTML = L.length ? L.map(r => `<button data-rid="${r.id}" title="${r.doing || ''}"><span class="av">${'<span class="ic" data-ic="av:' + r.sp + '"></span>'}</span><b>${r.name}</b></button>`).join('') : '<span class="none">大家都出门了，过一会儿再来看看</span>';
  hydrate(intAvs);
}
intAvs.addEventListener('click', (e) => { const b = e.target.closest('[data-rid]'); if (b) ui.openRes(+b.dataset.rid); });
document.getElementById('intBack').onclick = () => { if (sheetOpen) ui.close(); exitInterior(); };

// ---------------------------------------------------------------- 玩家（Lenia 的好朋友）放东西（悬在镜头前、拖到地上、绿/红提示、转一转、轻轻落下）和打理花园
const mode = { kind: null, item: null, x: 0, z: 0, yaw: 0, ok: false, why: '', drag: false, off: [0, 0], seed: 'daisy', hover: null, rel: 0 };
const _ray = new THREE.Raycaster(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _ndc = new THREE.Vector2(), _hit = new THREE.Vector3();
function groundAt(sx, sy) { _ndc.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1); _ray.setFromCamera(_ndc, camera); return _ray.ray.intersectPlane(_plane, _hit) ? [_hit.x, _hit.z] : null; }
const placeEl = document.getElementById('placebar'), tendEl = document.getElementById('tendbar'), hintEl = document.getElementById('placeHint');
let _ps = null; // 同一份 struct 只建一次（占地、金圈都缓存在里面）
function placeState() { if (_ps) return _ps; return (_ps = struct ? { lots: struct.lots, nodes: struct.nodes, edges: struct.edges, bridges: struct.bridges, snowmen: struct.snowmen || [], flowers: (struct.flowers || []).map(f => [f[1], f[2]]), puddles: (struct.puddles || []).map(p => [p[1], p[2], p[3], p[0]]) } : { lots: [] }); }
function itemR(k) { const rk = renderKindOf(k); return TEMPLATE_OF[k] ? kindsMeta[rk].r : ITEM_K[rk].r; }
function itemH(k) { const rk = renderKindOf(k); return TEMPLATE_OF[k] ? kindsMeta[rk].h : ITEM_K[rk].h; }
function startPlace(k) {
  endMode(false, true); const c = groundAt(innerWidth / 2, innerHeight * 0.46) || [controls.target.x, controls.target.z];
  Object.assign(mode, { kind: 'place', item: k, x: c[0], z: c[1], yaw: 0, drag: false, rel: 0 }); controls.enabled = false; userHold = 1e9; tank.on && setTank(false);
  document.body.classList.add('mode'); placeEl.classList.add('on'); const pi = document.getElementById('placeIc'); pi.dataset.ic = 'item:' + k; pi._done = null; hydrate(placeEl);
  handOn(); refreshGold(); checkPlace();
  if (!mode.ok) { const x0 = mode.x, z0 = mode.z; for (let k = 1; k < 160 && !mode.ok; k++) { const a = k * 2.4, d = Math.sqrt(k) * 2.2; mode.x = x0 + Math.cos(a) * d; mode.z = z0 + Math.sin(a) * d; checkPlace(); } if (!mode.ok) { mode.x = x0; mode.z = z0; checkPlace(); } } // 一开始就挑一块附近能放的空地
  placeCamIn(mode.x, mode.z);
}
// 玩家的手（3D，lib/hand-model.js）：只露前臂 + 浅色针织袖子，从屏幕上方伸进来，拇指和食指捏住旧物的顶；
// 跟着拖动平滑移动，地上有一块柔和的影子；放下时松手、往上收走。第一次进放置模式才建模型。
const P3 = { hand: null, sh: null, on: false, leave: 0, first: true, x: 0, z: 0, opt: { armLength: 3.0, reach: -0.4, facing: 0, fade: 0.3, warm: true }, yaw: -0.6, tilt: 0.9 };
const _ha = new THREE.Vector3(), _hb = new THREE.Vector3();
function hand3() {
  if (P3.hand) return P3.hand;
  P3.hand = createPlayerHand(P3.opt); P3.sh = createHandShadow();
  P3.hand.group.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } }); // 袖子很长，别被视锥裁掉；不往小镇上投实时阴影（下面另有一块柔和影子）
  scene.add(P3.hand.group, P3.sh.mesh); return P3.hand;
}
function handOn() { const h = hand3(); P3.on = true; P3.leave = 0; P3.first = true; h.setMode('pinch', true); h.group.visible = P3.sh.mesh.visible = true; }
function handOff() { P3.on = false; P3.leave = 0; if (P3.hand) P3.hand.group.visible = P3.sh.mesh.visible = false; }
function handLeave() { if (!P3.hand || !P3.on) return; P3.leave = 1e-4; P3.hand.setMode('release'); }
// 让捏住的位置正好在物件 (x, y, z)（底面中心）上；H 高、R 半径决定手的大小和两指张开多宽
function handFollow(dt, t, x, y, z, H, R) {
  const h = hand3(); if (!P3.on) return;
  const k0 = 1 - Math.exp(-dt * 16); if (P3.first) { P3.x = x; P3.z = z; } else { P3.x += (x - P3.x) * k0; P3.z += (z - P3.z) * k0; }
  const L = clamp(Math.max(H * 1.2, R * 2, camera.position.distanceTo(controls.target) * 0.045), 3.5, 11), k = L / HAND_LEN; // 手长跟着物件大小走（像人的手捏着一件旧物），俯视拉远时也不至于小到看不清
  h.group.scale.setScalar(k); h.setGrip(H / k, clamp(R * 0.45, 0.25, 1.6) / k, clamp(R * 0.3, 0.12, 1.2) / k);
  h.group.rotation.set(-P3.tilt * smooth(0.2, 1.1, 1.45 - Math.acos(clamp((camera.position.y - y) / camera.position.distanceTo(_hb.set(P3.x, y, P3.z)), -1, 1))), Math.atan2(camera.position.x - P3.x, camera.position.z - P3.z) + P3.yaw, 0, 'YXZ'); // 镜头越俯视，手越往前趴：手背朝上、手指朝镜头一侧捏住； 手背大致朝镜头、略侧一点，看得见拇指和食指捏着；手臂从屏幕右上方伸进来
  h.update(P3.first ? 0 : dt, t); P3.first = false;
  h.anchor(_ha); h.group.position.add(_hb.set(P3.x, y, P3.z).sub(_ha));
  P3.sh.update(h, null); // 手腕下方地上一块柔和的影子（物件自己的影子在 props 里）
  return [P3.x, P3.z];
}
function updateHandLeave(dt, t) { // 松手以后：手指张开，停一下，往上（远离镜头）收走
  if (!P3.hand || !P3.on || !P3.leave) return; P3.leave += dt; const h = P3.hand; h.update(dt, t);
  if (P3.leave > 0.3) { _ha.set(camera.position.x - h.group.position.x, 0, camera.position.z - h.group.position.z).normalize(); const sp = (P3.leave - 0.3) * 60 * dt; h.group.position.x -= _ha.x * sp * 0.5; h.group.position.z -= _ha.z * sp * 0.5; h.group.position.y += sp; }
  P3.sh.mesh.material.opacity *= Math.exp(-dt * 4);
  if (P3.leave > 1.3) handOff();
}
// 花园外圈草坪上的大树（只是背景，模拟里没有）：别把旧物放进树干里
function treeCheck(r, x, z, rad) { if (!r.ok || r.gold) return r; for (const [tx, tz, k] of OUTER_TREES) if (Math.hypot(x - tx, z - tz) < rad + 2.4 * k) return { ok: false, why: '这里有棵大树' }; return r; }
function checkPlace() {
  if (mode.kind === 'move') { const l = struct && struct.lots.find(l => l.id === mode.id); const r = l ? treeCheck(moveCheck(l, mode.x, mode.z, mode.yaw, placeState()), mode.x, mode.z, l.r || 2) : { ok: false, why: '它已经不在了' }; mode.ok = r.ok; mode.why = r.why; mode.gold1 = null;
    hintEl.textContent = r.ok ? `${r.why}` : `不合适 · ${r.why}`; hintEl.className = 'paper ' + (r.ok ? 'good' : 'bad'); document.getElementById('placeOk').disabled = !r.ok; return; }
  const r = treeCheck(placeCheck(mode.x, mode.z, itemR(mode.item), placeState(), 'item', { item: mode.item, rot: mode.yaw }), mode.x, mode.z, itemR(mode.item)); mode.ok = r.ok; mode.why = r.why; mode.gold1 = r.gold || null;
  const tip = mode.gold && mode.gold.length && !r.gold ? '（放进金圈会有惊喜）' : '';
  hintEl.textContent = r.gold ? '✨ 放进金圈会有惊喜！' : r.ok ? `放这里吧 · ${r.why}${tip}` : `不合适 · ${r.why}${tip}`; hintEl.className = 'paper ' + (r.ok ? 'good' : 'bad'); document.getElementById('placeOk').disabled = !r.ok; }
// 新手教程用的小接口（guide.js 只通过它碰场景）：模式、金圈屏幕位置、挪一挪、镜头、“等一等”标记
const guideEnv = {
  hold: false, mode, send, endMode: () => endMode(), cheer: () => audio.cheer(),
  focusWide: (x, z) => { exitInterior(true); const m = innerWidth < 700, d = m ? 58 : 40; const o = camera.position.clone().sub(controls.target), l = Math.hypot(o.x, o.z) || 1, k = m ? 0.2 * d : 0.08 * d; focusAt(x + o.x / l * k, z + o.z / l * k, d); userHold = 90; }, // 镜头往后挪一点，让整栋落在屏幕上半部，不被底部的 Lenia 卡片盖住 // 教程里拼成之后：镜头停在能看清整栋组合和围观小动物的距离
  lots: () => (struct && struct.lots) || [],
  boxCount: (k) => (info && info.lenia.box[k]) || 0,
  startMove: (id) => startMove(id), focus: (x, z) => { exitInterior(true); focusAt(x, z, 22); },
  goldRings: () => (mode.kind === 'place' ? mode.gold || [] : []),
  goldHole() { // 第一个金圈在屏幕上的位置（圆心 + 半径），跟着镜头变
    const g = mode.kind === 'place' && mode.gold && mode.gold[0]; if (!g) return null; const c = screenOf(g.x, 0.3, g.z);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); const e = screenOf(g.x + right.x * g.r, 0.3, g.z + right.z * g.r);
    return { x: c.x, y: c.y, r: Math.max(40, Math.hypot(e.x - c.x, e.y - c.y)) }; },
};
// 金圈：手里这件能和地上哪件拼（位置由 shared/items.js 的 goldRings 算，和 Worker 落地拼合用同一个函数）
const goldsEl = document.getElementById('golds');
function refreshGold() {
  if (mode.kind !== 'place') { mode.gold = []; golds.set([]); goldsEl.innerHTML = ''; return; }
  mode.gold = goldRings(mode.item, itemR(mode.item), placeState()); golds.set(mode.gold);
  const cd = (info && info.lenia && info.lenia.recipes) || {}; // 按“已知配方”显示：知道配方 = 组合图标，不知道 = ？
  goldsEl.innerHTML = mode.gold.map(g => `<div class="gl" data-g="${g.id}" title="${cd[g.combo] ? (COMBOS.find(c => c.id === g.combo) || {}).name : '还不知道的搭配'}">${cd[g.combo] ? icon('item:combo_' + g.combo) : '？'}</div>`).join(''); hydrate(goldsEl);
}
// 挪一挪 / 搬家：拎起已经放下的东西（同放置模式：绿/红、转一转、放这里）
function startMove(id) {
  const l = struct && struct.lots.find(l => l.id === id); const mv = movable(l); if (!mv.ok) { mode.tap = null; floatText(mv.why); return false; }
  exitInterior(true); endMode(false, true); stopFollow(); closeThought();
  Object.assign(mode, { kind: 'move', id, item: l.item, rk: l.rk, x: l.x, z: l.z, yaw: l.rot, drag: false, lift: 0, done: l.done, lot: l, gold: [] });
  controls.enabled = false; userHold = 1e9; tank.on && setTank(false); town.hideId = props.hideId = id;
  document.body.classList.add('mode'); placeEl.classList.add('on'); const pi = document.getElementById('placeIc'); pi.dataset.ic = l.combo ? 'item:combo_' + l.combo : l.item && ITEMS[l.item] ? 'item:' + l.item : 'hand'; pi._done = null; hydrate(placeEl);
  document.querySelector('#placeOk + .lbl').textContent = l.done ? '搬到这' : '挪到这'; document.querySelector('#placeNo + .lbl').textContent = '不挪了';
  handOn(); checkPlace();
  if (l.done) send({ type: 'lenia', act: 'movePrep', id }); // 住户/店主先嘀咕一句
  placeCamIn(l.x, l.z); return true;
}

// 放置/挪动时的镜头：自动平滑拉高拉远成俯视大视野（看得到大半个花园）；放下/取消后平滑回到进入前的视角
const placeCam = { saved: null };
function placeCamIn(x, z) {
  if (!placeCam.saved) placeCam.saved = { pos: camera.position.clone(), target: controls.target.clone() };
  const off = camera.position.clone().sub(controls.target); const azi = Math.atan2(off.x, off.z), pol = 0.52;
  const vf = camera.fov * PI / 360, hf = Math.atan(Math.tan(vf) * camera.aspect); // 竖屏看宽 ~70，横屏看纵深 ~60
  const dist = clamp(Math.max(35 / Math.tan(hf), 30 / Math.tan(vf) / Math.cos(pol)), 70, 175);
  const R = Math.hypot(x, z), kk = R > 40 ? 40 / R : 1, tx = x * kk, tz = z * kk; // 对准手里的旧物；太靠外时往花园中间收一点，大半个花园都在画面里
  cam.fly = { t: 0, dur: 0.85, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(tx + Math.sin(pol) * Math.sin(azi) * dist, Math.cos(pol) * dist, tz + Math.sin(pol) * Math.cos(azi) * dist), t1: new THREE.Vector3(tx, 0, tz) };
  cam.follow = null;
}
function placeCamOut(drop) {
  const S = placeCam.saved; placeCam.saved = null; if (!S) return; const p1 = S.pos.clone(), t1 = S.target.clone();
  if (drop) { _v.set(drop.x, groundY(drop.x, drop.z), drop.z); const tmp = camera.clone(); tmp.position.copy(p1); tmp.lookAt(t1); tmp.updateMatrixWorld(); _v.project(tmp); // 放下的地方在原来的视角里看不见：原角度、原距离，挪过去对准它
    if (Math.abs(_v.x) > 0.8 || Math.abs(_v.y) > 0.75 || _v.z > 1) { const d = _bp.set(drop.x, t1.y, drop.z).sub(t1); p1.add(d); t1.add(d); } }
  cam.fly = { t: 0, dur: 0.9, p0: camera.position.clone(), t0: controls.target.clone(), p1, t1 };
}
// 双指缩放（放置模式里 OrbitControls 关着，自己处理）+ 滚轮
const pinch = { pts: new Map(), d0: 0, dist0: 0 };
const pinchD = () => { const [a, b] = [...pinch.pts.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; };
function placeZoom(d) { cam.fly = null; const off = camera.position.clone().sub(controls.target); off.setLength(clamp(d, 24, 200)); camera.position.copy(controls.target).add(off); }
function placeDown(e) {
  if (e.pointerType === 'touch') pinch.pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch.pts.size >= 2) { mode.drag = false; mode.px = null; pinch.d0 = pinchD(); pinch.dist0 = camera.position.distanceTo(controls.target); return; }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 有的浏览器不支持就算了 */ }
  const g = groundAt(e.clientX, e.clientY); if (!g) return; _v.set(mode.x, 0, mode.z).project(camera); const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight; const near = Math.hypot(sx - e.clientX, sy - e.clientY) < 140; mode.drag = true; mode.off = near ? [sx - e.clientX, sy - e.clientY] : [0, -50]; placeMove(e); }
function placeMove(e) {
  if (pinch.pts.has(e.pointerId)) pinch.pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch.pts.size >= 2) { placeZoom(pinch.dist0 * pinch.d0 / pinchD()); return; }
  mode.px = e.clientX; mode.py = e.clientY; if (mode.boxDrag && !mode.boxDrag.far && Math.hypot(e.clientX - mode.boxDrag.x0, e.clientY - mode.boxDrag.y0) > 14) mode.boxDrag.far = true;
  const g = groundAt(e.clientX + mode.off[0], e.clientY + mode.off[1]); if (!g) return; const R = Math.hypot(g[0], g[1]); const k = R > PLACE_R ? PLACE_R / R : 1; mode.x = g[0] * k; mode.z = g[1] * k; checkPlace(); }
function placeUp(e) { pinch.pts.delete(e.pointerId); if (pinch.pts.size < 2) pinch.d0 = 0; mode.drag = false; mode.px = null; if (mode.boxDrag && e.pointerId === mode.boxDrag.id) boxDragEnd(e, e.type === 'pointercancel'); }
// 从储物箱里按住拖出来（ui.js 判定按住/越过箱沿后调进来）：同一次按压直接进放置模式，3D 手、大视野、边缘滚动、金圈、绿红判定全部沿用；
// 绿色处松手 = 点了「放这里」；红色处（或拖回箱子、取消、Esc）松手 = 旧物回箱。从详情的「放进花园」进来的不带 boxDrag，仍是 放回去/转一转/放这里 三个按钮。
function startPlaceDrag(k, e) {
  if (!info || !(info.lenia.box[k] > 0)) return false;
  startPlace(k); if (mode.kind !== 'place') return false;
  const touch = e.pointerType !== 'mouse'; mode.boxDrag = { id: e.pointerId, item: k, touch, x0: e.clientX, y0: e.clientY, far: false };
  pinch.pts.clear(); if (e.pointerType === 'touch') pinch.pts.set(e.pointerId, [e.clientX, e.clientY]);
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 有的浏览器不支持就算了 */ }
  mode.drag = true; mode.off = [0, touch ? -32 : -18]; placeMove(e); return true;
}
function boxDragEnd(e, cancelled) {
  if (!mode.boxDrag) return; const still = !mode.boxDrag.far; mode.boxDrag = null;
  const pt = e ? { x: e.clientX, y: e.clientY } : { x: mode.px == null ? innerWidth / 2 : mode.px, y: mode.py == null ? innerHeight / 2 : mode.py };
  const back = !cancelled && ui.boxPointIn(pt.x, pt.y); // 又拖回箱子上松手：算放回去
  if (!cancelled && still && e) { endMode(); ui.boxDragBack(pt, '', true); return; } // 按住拿起后一动没动就松手：旧物回箱并选中看详情
  if (!cancelled && !back && mode.ok) { document.getElementById('placeOk').click(); ui.boxDragDone(); return; }
  const why = cancelled || back ? '' : `放不下：${mode.why}，旧物回箱啦`;
  endMode(); ui.boxDragBack(pt, why);
}
canvas.addEventListener('pointercancel', (e) => { if (mode.kind === 'place' || mode.kind === 'move') placeUp(e); });
canvas.addEventListener('wheel', (e) => { if (mode.kind !== 'place' && mode.kind !== 'move') return; placeZoom(camera.position.distanceTo(controls.target) * Math.exp(e.deltaY * 0.0012)); }, { passive: true });
// 边缘滚动：拖着旧物靠近屏幕边缘（12% 以内），地图往那边平移，越靠边越快；旧物一直在指尖下
const EDGE = 0.12;
const edgeK = (u) => u < EDGE ? -(EDGE - u) / EDGE : u > 1 - EDGE ? (u - 1 + EDGE) / EDGE : 0;
function edgeScroll(dt) {
  if (mode.boxDrag && mode.drag && mode.px != null && cam.fly) { placeMove({ pointerId: -1, clientX: mode.px, clientY: mode.py }); return; } // 从箱里拖出来时镜头还在飞：旧物跟着指尖重新对准地面
  if (!mode.drag || mode.px == null || cam.fly) return;
  const ex = edgeK(mode.px / innerWidth), ey = edgeK(mode.py / innerHeight); if (!ex && !ey) return;
  const off = camera.position.clone().sub(controls.target); const fx = -off.x, fz = -off.z, fl = Math.hypot(fx, fz) || 1; // 屏幕“上”在地上的方向
  const sp = off.length() * 0.4 * dt; const dx = (-fz / fl * ex - fx / fl * ey) * sp, dz = (fx / fl * ex - fz / fl * ey) * sp;
  const nx = controls.target.x + dx, nz = controls.target.z + dz, R = Math.hypot(nx, nz), lim = wallS, k = R > lim ? lim / R : 1;
  const mx = nx * k - controls.target.x, mz = nz * k - controls.target.z; if (Math.abs(mx) + Math.abs(mz) < 1e-5) return;
  controls.target.x += mx; controls.target.z += mz; camera.position.x += mx; camera.position.z += mz; camera.updateMatrixWorld();
  placeMove({ pointerId: -1, clientX: mode.px, clientY: mode.py });
}
let moveWait = null; // 搬家/挪动已经发给模拟、等新位置回来：原物继续藏着，回来后在新位置“落下”
function landMoved(id) { for (const L of [town.lots.get(id), props.lots.get(id)]) if (L) { L.x = L.lx; L.z = L.lz; L.yaw = L.rot; L.fall = 1; } }
function endMode(keepHand = false, switching = false, drop = null) {
  if (mode.boxDrag) { const q = { x: mode.px == null ? innerWidth / 2 : mode.px, y: mode.py == null ? innerHeight / 2 : mode.py }; mode.boxDrag = null; ui.boxDragBack(q, ''); } // 从箱里拖出来时被别处强行结束（比如教程接管）：旧物回箱、箱子弹回来
  if (mode.kind === 'move' && !moveWait) { town.hideId = props.hideId = -1; }
  if ((mode.kind === 'place' || mode.kind === 'move') && !switching) placeCamOut(drop); pinch.pts.clear(); mode.drag = false; mode.px = null; mode.boxDrag = null;
  mode.kind = null; controls.enabled = true; userHold = 2; document.body.classList.remove('mode'); placeEl.classList.remove('on'); tendEl.classList.remove('on');
  town.ghost = null; props.setGhost(null); if (!keepHand) handOff(); mode.gold = []; golds.set([]); goldsEl.innerHTML = '';
  document.querySelector('#placeOk + .lbl').textContent = '放这里'; document.querySelector('#placeNo + .lbl').textContent = '放回去';
}
document.getElementById('placeNo').onclick = () => endMode();
document.getElementById('placeRot').onclick = () => { mode.yaw += Math.PI / 4; checkPlace(); }; // 转一转占地也跟着转，重新查一次
document.getElementById('placeOk').onclick = () => {
  if (mode.kind === 'move') { checkPlace(); if (!mode.ok) return; const id = mode.id; moveWait = { id, x: mode.x, z: mode.z, t: performance.now() };
    send({ type: 'lenia', act: 'move', id, x: mode.x, z: mode.z, rot: mode.yaw }); endMode(true, false, { x: mode.x, z: mode.z }); handLeave();
    setTimeout(() => { if (moveWait && moveWait.id === id) { moveWait = null; town.hideId = props.hideId = -1; } }, 4000); return; }
  if (mode.kind !== 'place') return; checkPlace(); if (!mode.ok) return;
  if (mode.gold1) { mode.x = mode.gold1.x; mode.z = mode.gold1.z; mode.yaw = mode.gold1.rot; } // 放进金圈：对齐圈心
  const d = { x: mode.x, z: mode.z, t: performance.now() }; town.pendingDrop = props.pendingDrop = d; sfx('drop'); // 放下：咚 + 叮铃（从箱里拖出来时 ui.boxDragDone 也会发一次，限频后只响一声）
  send({ type: 'lenia', act: 'drop', item: mode.item, x: mode.x, z: mode.z, rot: mode.yaw, hold: guideEnv.hold && mode.item === 'teapot' });
  endMode(true, false, d); handLeave();
};
// 打理花园：选花种 → 点空地种下；拿水壶 → 点花浇水
function startTend(m = null, seed = null) {
  endMode(); const I = info && info.lenia; mode.kind = m || ((I && Object.keys(I.seeds).length) ? 'plant' : 'water'); if (seed) mode.seed = seed;
  if (I && !(I.seeds[mode.seed] > 0)) mode.seed = Object.keys(I.seeds)[0] || 'daisy';
  document.body.classList.add('mode'); tendEl.classList.add('on'); renderTend();
}
function renderTend() {
  const I = info && info.lenia; const seeds = I ? I.seeds : {}; const ks = Object.keys(SEEDS).filter(k => seeds[k] > 0);
  const html = ks.map(k => `<button class="seedpk paper ${mode.kind === 'plant' && mode.seed === k ? 'on' : ''}" data-seed="${k}"><i style="background:radial-gradient(circle,${SEEDS[k].mid} 0 26%,${SEEDS[k].col} 28% 70%,rgba(0,0,0,0) 72%)"></i>${SEEDS[k].name}<small>${seeds[k]}</small></button>`).join('')
    + `<button class="enamel blue ${mode.kind === 'water' ? 'down' : ''}" data-water="1" title="浇水"><span class="ic" data-ic="watering-can"></span></button><button class="enamel green" data-done="1" title="好了"><span class="ic" data-ic="check"></span></button>`;
  const ti = document.getElementById('tendInner'); if (ti._h !== html) { ti.innerHTML = html; ti._h = html; hydrate(tendEl); }
  hintEl.className = 'paper good'; hintEl.textContent = mode.kind === 'water' ? '点一点花，给它们浇水（附近的一起浇）' : ks.length ? `点空地，种下${SEEDS[mode.seed].name}` : '花种用完了，去储物箱换一点';
}
tendEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.seed) { mode.kind = 'plant'; mode.seed = b.dataset.seed; } else if (b.dataset.water) mode.kind = 'water'; else if (b.dataset.done) { endMode(); return; } renderTend(); });
function tendTap(e) { const g = groundAt(e.clientX, e.clientY); if (!g) return; mode.tap = { x: e.clientX, y: e.clientY };
  if (mode.kind === 'plant') send({ type: 'lenia', act: 'plant', x: g[0], z: g[1], seed: mode.seed }); else { send({ type: 'lenia', act: 'water', x: g[0], z: g[1], r: 4 }); props.puff(g[0], g[1], 1.2); }
  setTimeout(renderTend, 300); }
function floatText(t, ms = 1100) { const p = mode.tap || { x: innerWidth / 2, y: innerHeight / 2 }; const f = document.createElement('div'); f.className = 'heartfly' + (ms > 1500 ? ' slow' : ''); f.style.color = '#3a7330'; f.textContent = t; f.style.left = Math.max(8, Math.min(innerWidth - 260, p.x - 30)) + 'px'; f.style.top = p.y - 30 + 'px'; document.body.appendChild(f); setTimeout(() => f.remove(), ms); }
function updateMode(dt, t) {
  if (mode.kind === 'move') { // 拎起来：原物藏起，手捏着它的“影子”悬在半空跟着走
    const l = mode.lot; mode.lift = Math.min(1, mode.lift + dt * 2); const e = 1 - (1 - mode.lift) ** 3; const h = e * (4.2 + Math.sin(t * 2) * 0.25); const [H, r] = lotHR(l);
    const tmpl = TEMPLATE_KINDS.has(l.kind);
    const [mx, mz] = handFollow(dt, t, mode.x, h, mode.z, H, r) || [mode.x, mode.z]; // 手捏着它平滑跟随拖动
    town.ghost = tmpl ? { kind: l.rk, x: mx, z: mz, y: 0, h, yaw: mode.yaw } : null;
    props.setGhost({ kind: l.use === 'bridge' ? 'bridge_' + l.kind : l.kind, x: mx, z: mz, yaw: mode.yaw, h, r: l.r, ok: mode.ok, t, show: !tmpl, foot: localFoot(l).box });
    return; }
  if (mode.kind !== 'place') { if (mode.kind && mode.hover) props.setGhost({ kind: 'flower', x: mode.hover[0], z: mode.hover[1], yaw: 0, h: 0, r: mode.kind === 'water' ? 3.2 : 0.5, ok: true, t, show: false }); return; }
  const k = mode.item, rk = renderKindOf(k), r = itemR(k), H = itemH(k); const h = 4.2 + Math.sin(t * 2) * 0.25; const tmpl = !!TEMPLATE_OF[k];
  const G = mode.gold1; const gy = G ? G.rot : mode.yaw; // 进了金圈：影子吸到圈心
  const [gx, gz] = handFollow(dt, t, G ? G.x : mode.x, h, G ? G.z : mode.z, H, r) || [G ? G.x : mode.x, G ? G.z : mode.z]; // 手捏着它平滑跟随拖动
  town.ghost = tmpl ? { kind: rk, x: gx, z: gz, y: 0, h, yaw: gy } : null;
  props.setGhost({ kind: rk, x: gx, z: gz, yaw: gy, h, r, ok: mode.ok, t, show: !tmpl, foot: localFoot({ kind: rk, item: k, r, stage: 'landed' }).box, marker: !G });
  for (const g of mode.gold || []) g.hot = G && G.id === g.id;
  const labs = goldsEl.children; (mode.gold || []).forEach((g, i) => { const el = labs[i]; if (!el) return; _v.set(g.x, 0.3, g.z).project(camera); el.style.display = _v.z > 1 ? 'none' : ''; el.style.left = ((_v.x * 0.5 + 0.5) * innerWidth).toFixed(0) + 'px'; el.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight).toFixed(0) + 'px'; });
}
// 居民头顶的气泡（围观 ？！、哼歌 ♪、聊天 …、找材料 ？……）：全部走 bubble.js 这一个公用函数，样式统一，只换中间的符号。
// 点气泡或点冒着气泡的居民 → 弹出“心声”（见 openThought）
const gateNew = new Set(); // 门外有还没被发现的新东西的村口序号（每次 info 更新）
function pickGate(sx, sy) { let best = -1, bd = 1e9; for (const gt of gateList) { _v.set(gt.x, 2.2, gt.z).project(camera); if (_v.z > 1) continue; const dist = camera.position.distanceTo(_bp.set(gt.x, 2.2, gt.z)); const rad = Math.max(30, 3.2 / dist * innerHeight / (2 * Math.tan(camera.fov * PI / 360))); const d = Math.hypot((_v.x * 0.5 + 0.5) * innerWidth - sx, (-_v.y * 0.5 + 0.5) * innerHeight - sy); if (d < rad && d < bd) { bd = d; best = gt.i; } } return best; }
const emoBox = document.getElementById('emos'); const bubbles = createBubbles(emoBox);
const thoughtEl = document.getElementById('thought'); let thoughtId = null, thoughtT = 0;
function updateEmos(dt = 0.016) {
  bubbles.begin();
  if (!tank.on) {
    const list = lastSnap && lastSnap.emo; const codes = new Map(); if (list) for (let i = 0; i < list.length; i += 2) codes.set(list[i], list[i + 1]);
    const look = LENIA_CAMEO && cameo.active && cameo.t > 1.2; const ph = look ? (cameo.t < 8 ? 2 : (Math.floor(cameo.t / 3) % 3 === 0 ? 3 : Math.floor(cameo.t / 3) % 3 === 1 ? 1 : 0)) : 0;
    const fpx = innerHeight / (2 * Math.tan(camera.fov * PI / 360)); let n = 0, k = 0;
    for (const c of chars.values()) {
      if (c.hidden || c.vis < 0.3 || n >= 24 || c.id === thoughtId) continue; // 心声框开着时，它自己的小气泡先收起（心声框就是放大的那个气泡）
      let cd = codes.get(c.id) || (c.bubble > 0.5 ? 4 : 0);   // 4 = 聊天（轮到它说话时）
      if (!cd && ph && c.lookK >= 0.5 && k < 6 && !((c.id + Math.floor(cameo.t / 3)) % 2 && cameo.t >= 8)) { cd = ph; k++; } // 看见 Lenia 的身影（身影关着时不会触发）
      if (!cd) continue;
      _v.set(c.x, headTopY(c), c.z).project(camera); if (_v.z > 1) continue;
      const dist = camera.position.distanceTo(_bp.set(c.x, c.y + 1.4, c.z));
      bubbles.put(c.id, (_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, cd, clamp(0.95 * fpx / dist, 30, 62)); n++;
    }
  }
  // 鸡块：被点了冒个“！”（同款气泡）
  if (!tank.on && mascotS.bub > 0) { _v.set(nugget.x, NUGGET_SIZE + 0.4, nugget.z).project(camera); if (_v.z < 1) { const dist = camera.position.distanceTo(_bp.set(nugget.x, NUGGET_SIZE, nugget.z)); bubbles.put('nug', (_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, 2, clamp(0.95 * innerHeight / (2 * Math.tan(camera.fov * PI / 360)) / dist, 30, 62)); } }
  // 村口上方：门外有新东西还没人发现 → 浮一个小“！”（也是同款气泡）
  if (!tank.on && gateNew.size) for (const gt of gateList) { if (!gateNew.has(gt.i)) continue; _v.set(gt.x, gt.top, gt.z).project(camera); if (_v.z > 1) continue; const dist = camera.position.distanceTo(_bp.set(gt.x, gt.top, gt.z));
    bubbles.put('g' + gt.i, (_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, 2, clamp(1.0 * innerHeight / (2 * Math.tan(camera.fov * PI / 360)) / dist, 30, 62)); }
  bubbles.end();
  // 心声框跟着居民走；居民的气泡没了、几秒后自动收起
  if (thoughtId != null && !thoughtEl.classList.contains('open')) thoughtId = null;
  if (thoughtId != null) {
    thoughtT -= dt; const c = chars.get(thoughtId);
    if (!c || tank.on || thoughtT <= 0) closeThought();
    else { _v.set(c.x, headTopY(c) + 0.2, c.z).project(camera); const bw = thoughtEl.offsetWidth, bh = thoughtEl.offsetHeight; const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
      const left = clamp(sx - bw * 0.22, 10, innerWidth - bw - 10), top = clamp(sy - bh - 18, 64, innerHeight - bh - 90); thoughtEl.style.transform = `translate(${left.toFixed(0)}px,${top.toFixed(0)}px)`;
      thoughtEl.style.setProperty('--tx', clamp(sx - left, 24, bw - 24).toFixed(0) + 'px'); }
  }
}
function openThought(id, quiet = false) {
  const I = info; const r = I && I.res.find(r => r.id === id); if (!r) { if (!quiet) ui.openRes(id); return; }
  thoughtId = id; thoughtT = 9; ui.showThought(r, thoughtOf(r, I.day)); select(null);
}
function closeThought() { thoughtId = null; ui.hideThought(); }
// ---------------------------------------------------------------- 点居民：镜头平滑跟着它，底部小卡片（名字、在做什么、名片、不跟了）；拖动/双指/滚轮就停
const followEl = document.getElementById('follow');
function startFollow(id) { exitInterior(true); closeThought(); cam.follow = id; userHold = 0; cam.fly = null; select(id); followEl.dataset.id = id; renderFollow(true); }
function stopFollow() { if (cam.follow == null) return; cam.follow = null; select(null); }
function renderFollow(force = false) {
  const id = cam.follow; if (id == null) return; const r = info && info.res.find(r => r.id === id); if (!r) return;
  const key = r.name + '|' + r.doing; if (!force && followEl._k === key) return; followEl._k = key;
  document.getElementById('followAv').innerHTML = icon('av:' + r.sp); hydrate(followEl); document.getElementById('followName').textContent = r.name; document.getElementById('followDo').textContent = r.away ? '出远门了' : (r.doing || '在附近转转');
}
document.getElementById('followCard').onclick = () => { if (cam.follow != null) ui.openRes(cam.follow); };
document.getElementById('followStop').onclick = () => stopFollow();
document.getElementById('intMove').onclick = () => { const id = interior.lotId; if (id != null) startMove(id); };
// ---------------------------------------------------------------- 动作结果（挪动 / 搬家 / 鸡块和 Lenia 送东西）：在这里处理，不进施工牌的提示
const mascotS = { bub: 0, who: null };
function screenOf(x, y, z) { _v.set(x, y, z).project(camera); return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight }; }
function onAct(m) {
  if (m.act === 'movePrep') { if (m.ok && m.line) setTimeout(() => { if (mode.kind !== 'move') return; const l = mode.lot; const [H] = lotHR(l); mode.tap = screenOf(l.x, H + 6, l.z); mode.tap.y = Math.max(240, mode.tap.y - 60); floatText(`${m.name}：“${m.line}”`, 3400); }, 200); return true; } // 住户/店主嘀咕：头上冒统一气泡（模拟里的 emo），话飘在房子上方
  if (m.act === 'move') { if (!m.ok) { moveWait = null; town.hideId = props.hideId = -1; mode.tap = null; floatText(m.why || '没挪成'); } else { audio.cheer && m.done && audio.cheer(); } return true; }
  if (m.act === 'mascot') {
    const who = m.req; const at = who === 'nugget' ? screenOf(nugget.x, NUGGET_SIZE + 0.6, nugget.z) : screenOf(cameo.hitP.x, cameo.hitP.y + 1, cameo.hitP.z);
    if (who === 'nugget') { const st = ui.state; if (st.nug) { st.nug.pending = false; st.nug.gift = m.gift || null; st.nug.ids = m.ids || []; ui.render(); } if (m.gift) nugget.poke(true, 10); }
    if (m.gift) { mode.tap = at; floatText(`+ ${m.gift.name}`); }
    return true; }
  return false;
}
// 鸡块转达的 Lenia 的话：按真实状态挑（窗台回礼、小镇愿望、缺料停工、还在商量的旧物……）
function nuggetLine(I) {
  if (!I) return '我在窗边看着呢，让鸡块先跟你打个招呼！'; const L = I.lenia, c = [];
  if (L.sill.length >= 3) c.push(`窗台上攒了 ${L.sill.length} 份回礼，记得去收哦。`);
  const w = L.tw.find(w => (w.p || 0) < 1); if (w) c.push(`它们还想要「${w.title}」——${w.need}。`);
  const stall = I.projs.find(p => p.missing && p.missing.length); if (stall) c.push(`${stall.name}缺材料停工了，去施工牌看看能不能帮一把？`);
  const ld = L.landed[0]; if (ld && ITEMS[ld.item]) c.push(`你放下的${ITEMS[ld.item].name}，它们还在七嘴八舌地商量呢。`);
  if (L.flowers && L.flowers.dry) c.push(`有 ${L.flowers.dry} 棵花还没浇水，拿水壶去转一圈吧。`);
  if (I.world && I.world.wx === 'rain') c.push('下雨了，我在屋里听雨，你帮我看看它们有没有淋湿。');
  if (!c.length) c.push('它们今天都挺好的，你想放点什么进花园？', '我刚泡了热可可，等下跟你说今天看到的趣事。');
  return c[Math.floor(Math.random() * c.length)];
}
function nuggetTap() {
  stopFollow(); closeThought(); mascotS.bub = 3.5; nugget.poke(false, 14);
  const line = nuggetLine(info); ui.openNugget({ line, pending: true, gift: null, ids: [] });
  lenia.hide(); setTimeout(() => lenia.say(line, { kind: 'force' }), 120); // 鸡块带来的话由 Lenia 本人在左下角说出来
  send({ type: 'lenia', act: 'mascot', who: 'nugget', req: 'nugget', x: nugget.x, z: nugget.z });
}
const CAMEO_TAP = {
  legs: ['嘿嘿，被你发现啦！我就站在草丛后面看它们。', '嘘——我在这儿站一会儿，别让它们看见我。'],
  water: ['我在给花浇水呢，顺便偷看一眼它们在干嘛~', '这几朵花开得真好，等下摘一朵放进花园？'],
  window: ['我在窗边呢！它们的灯一盏一盏亮了。', '还不睡呀？我也睡不着，趴在窗边看它们。'],
};
function cameoTap() {
  const L = CAMEO_TAP[cameo.kind] || CAMEO_TAP.legs; const night = cameo.kind === 'window' && cameo.night;
  lenia.say(L[Math.floor(Math.random() * L.length)], { kind: 'force', ex: night ? 'sleepy' : cameo.kind === 'water' ? 'wave' : 'whisper' });
  send({ type: 'lenia', act: 'mascot', who: 'lenia', req: 'lenia', x: cameo.focus.x, z: cameo.focus.z });
}
// ---------------------------------------------------------------- Lenia 的身影：偶尔出现在花园边上几十秒（雨靴 / 拿喷壶的手 / 窗边的影子）
const CAMEO_LOOK = 34;
const cameoS = { next: performance.now() / 1000 + (Q.has('cameo') ? 6 : 150 + Math.random() * 120) };
const CAMEO_LINE = {
  legs: ['我在花园边上站一会儿，嘘——别吓着它们。', '我站在草丛后面看它们，它们好像发现我了！'], legsRain: ['下雨了，我出来看看它们有没有淋湿。'],
  water: ['我给远处的花浇浇水，顺便偷看一眼它们在干嘛~', '嘿嘿，我假装在浇花，其实在看它们。'],
  window: ['我在窗边看着呢，它们的灯一盏一盏亮了。', '我趴在窗边看了好一会儿，它们好像也在看我的窗户。'], shadow: ['我就在花园边上，它们看见我的影子了！'],
};
function startCameo(kind = null, az = null) {
  if (!LENIA_CAMEO) return null; // 身影先全部关掉（见 render/cameo.js）
  const wx = curWx, night = NIGHT;
  if (kind === 'boots') kind = 'legs';
  if (!kind) kind = night > 0.5 ? 'window' : (wx === 'rain' || wx === 'snow') ? (Math.random() < 0.7 ? 'legs' : 'window') : (Math.random() < 0.45 ? 'water' : Math.random() < 0.75 ? 'legs' : 'window');
  if (az == null) az = Math.atan2(controls.target.z - camera.position.z, controls.target.x - camera.position.x) + (Math.random() - 0.5) * 0.9; // 镜头对面的花园边（画面上方）
  const p = cameo.start(kind, az, { night });
  const L = kind === 'legs' && wx === 'rain' ? CAMEO_LINE.legsRain : kind === 'window' && night <= 0.45 ? CAMEO_LINE.shadow : CAMEO_LINE[kind];
  if (Math.random() < 0.6) setTimeout(() => lenia.say(L[Math.floor(Math.random() * L.length)], { kind: 'cameo' }), 2500);
  return { kind, ...p };
}
function updateCameo(dt, time) {
  cameo.update(dt, time); const now = performance.now() / 1000;
  if (!cameo.active && now > cameoS.next && loadDone && !mode.kind && !document.getElementById('guide')) { cameoS.next = now + 240 + Math.random() * 240; startCameo(); }
}
function cameoLook(dt) {
  const on = cameo.active && cameo.t > 1.2 && cameo.t < cameo.dur - 2; const f = cameo.focus;
  for (const c of chars.values()) {
    const want = on && !c.hidden && Math.hypot(c.x - f.x, c.z - f.z) < CAMEO_LOOK ? 0.92 : 0; c.lookK = (c.lookK || 0) + (want - (c.lookK || 0)) * Math.min(1, dt * 2.5);
    if (c.lookK > 0.02) c.lookTy = Math.atan2(f.x - c.x, f.z - c.z); // 朝向在 interpolate() 里平滑转过去
  }
}

// ---------------------------------------------------------------- 鱼缸模式：藏起界面、镜头慢慢游走跟拍、30fps
const PR_TANK = Math.min(DPR, LOW ? 1.25 : 1.5);
function setTank(on) {
  if (on) exitInterior(true); // 鱼缸模式不进屋
  tank.on = on; document.body.classList.toggle('tank', on); prBase = on ? PR_TANK : DPR; applyPR(true);
  if (on) { userHold = 0; cam.follow = null; cam.fly = null; ui.setTab('town'); tankNext(); } else { document.body.classList.remove('peek'); }
}
let peekTimer = 0; function peekTank() { document.body.classList.add('peek'); clearTimeout(peekTimer); peekTimer = setTimeout(() => document.body.classList.remove('peek'), 3000); }
document.getElementById('tankBtn').onclick = () => setTank(true);
document.getElementById('tankExit').onclick = () => setTank(false);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode.boxDrag) boxDragEnd(null, true); if (e.key === 'Escape' && interior.busy) exitInterior(); if (e.key === 'Escape' && tank.on) setTank(false); if (e.key === 'f' && !tank.on && document.activeElement === canvas) setTank(true); });

// ---------------------------------------------------------------- 快进画质：倍速 ≥3× 时自动省画质（设置里“倍速时省画质”可关）
// 冻结阴影贴图（灯仍 castShadow，只停 autoUpdate，不重编译着色器）、像素比降到 1、草/花减量，加一层很淡的暖色暗角和“快进”小标；
// 进入：约 0.5 秒内分三步降像素比和草花；回 1×：先分两步恢复像素比和草花，再过 0.5 秒才恢复实时阴影（分开两帧段，不卡）。
const fq = { on: false, frozen: false, f: 0, prDone: true, flDone: true, pr: DPR, flora: 1, t: 0, shT: -1 };
const FQ_PR = 1, fqFx = document.getElementById('fastfx');
function applyPR(force = false) { // 实际像素比 = min(基础, 快进) ；有变化才重设（重设会重分配画布，别每帧调）
  const v = Math.min(prBase, fq.pr); if (!force && Math.abs(v - prNow) < 0.01) return; prNow = v; renderer.setPixelRatio(v); onResize();
}
// 低分辨率离屏渲染：重设画布像素比要重新分配（多重采样）缓冲，实测一次卡 80～400 毫秒；
// 所以快进画质不动画布，而是启动时预先建好一块 1 倍像素比的离屏目标（4 倍抗锯齿、半精度浮点），快进时场景画进去、再铺满画布（铺的时候做色调映射和颜色空间转换，颜色和直接画一致）。
// 切换只是换一条渲染路径，不分配内存；预热（把离屏版的着色器编好）放在加载画面还在的时候。创建失败就退回 setPixelRatio。
const fqRT = { rt: null, quad: null, qs: null, qc: null, use: false, fail: false };
function fqInitRT() {
  if (fqRT.rt || fqRT.fail) return !fqRT.fail;
  try {
    const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    const rt = new THREE.WebGLRenderTarget(Math.round(innerWidth * FQ_PR), Math.round(innerHeight * FQ_PR), { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: LOW ? 2 : 4, depthBuffer: true });
    const mat = new THREE.ShaderMaterial({ uniforms: { tex: { value: rt.texture } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: 'uniform sampler2D tex; varying vec2 vUv; void main(){ gl_FragColor=texture2D(tex,vUv);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
    fqRT.rt = rt; fqRT.quad = quad; fqRT.qs = new THREE.Scene(); fqRT.qs.add(quad); fqRT.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return true;
  } catch (e) { console.warn('fq rt', e); fqRT.fail = true; return false; }
}
function fqWarm() { // 把离屏路径的着色器编好（加载画面还在时调用）
  if (settings().fastq === false || !fqInitRT()) return; try { fqRT.use = true; render(); fqRT.use = false; render(); } catch (e) { fqRT.fail = true; fqRT.use = false; }
}
function setFlora(k) { fq.flora = k; for (const f of floraIMs) f.im.count = Math.max(1, Math.round(f.full * k)); }
function fqWant() { return settings().fastq !== false && spdSel >= 3; }
function fqSync() { // 倍速或设置变了：开始一次进入/退出
  const w = fqWant(); if (w === fq.on) return; fq.on = w; fq.t = 0; fq.prDone = false; fq.flDone = false; document.body.classList.toggle('fast', w);
  if (fqFx) fqFx.dataset.spd = String(spdSel);
  if (w) { fq.frozen = true; fq.shT = -1; } else fq.shT = 0.5; // 退出时：阴影 0.5 秒后再恢复
}
onSetting((k) => { if (k === 'fastq') fqSync(); });
function fastQ(dt) {
  fq.t += dt;
  if (fq.t < 1) { // 渐变期：像素比只改一次（重设画布本身最贵，分几步反而卡几次），草花分两步，不和像素比挤在同一帧
    if (!fq.prDone) { fq.prDone = true; if (fq.on && fqInitRT() && !fqRT.fail) fqRT.use = true; else if (!fq.on && fqRT.use) fqRT.use = false; else { fq.pr = fq.on ? FQ_PR : DPR; applyPR(); } }
    if (fq.t >= 0.17 && !fq.flDone) { fq.flDone = true; setFlora(fq.on ? 0.45 : 1); fq.f = fq.on ? 1 : 0; }
  }
  if (!fq.on && fq.shT > 0) { fq.shT -= dt; if (fq.shT <= 0) { fq.frozen = false; fq.shT = -1; } } // 回 1×：像素比和草花先恢复，0.5 秒后才恢复实时阴影
}
if (fqFx) fqFx.dataset.spd = '1';
// ---------------------------------------------------------------- 调试面板（?debug）
// 通知纸条的位置：跟着左上角木牌和右侧图标的实际底边走（不同屏幕、木牌高矮都不重叠）
{ const root = document.documentElement, hud = document.getElementById('hud'), hl = document.getElementById('hudL'), hr = document.getElementById('hudR');
  const place = () => { const hb = hud.getBoundingClientRect(); const safe = Math.max(0, hb.top - 8); let bot = hl.getBoundingClientRect().bottom;
    if (matchMedia('(max-width:899px)').matches) { const r = hr.getBoundingClientRect(); if (r.width) bot = Math.max(bot, r.bottom); }
    root.style.setProperty('--toastTop', Math.ceil(bot - safe + 8) + 'px'); };
  place(); addEventListener('resize', place); addEventListener('orientationchange', place); if (window.ResizeObserver) { const ro = new ResizeObserver(place); ro.observe(hl); ro.observe(hr); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place); setTimeout(place, 1500); }
const SPD_KEY = 'lenia-garden-speed', SPD_STEPS = [1, 3, 10, 30, 60]; let spdSel = 1; // spdSel：玩家选的倍速（快照里的 speed 会晚一拍，连点时不能用它）
const setSpeed = (v, keep = false) => {
  send({ type: 'speed', v }); speed = spdSel = v; fqSync(); document.querySelectorAll('#panel [data-spd]').forEach(b => b.classList.toggle('on', +b.dataset.spd === v));
  document.querySelectorAll('#spdRow [data-spd]').forEach(x => { const on = +x.dataset.spd === v; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  { const cur = document.getElementById('spdCur'); if (cur) { cur.dataset.spd = String(v); cur.dataset.fast = v >= 3 ? '1' : '0'; cur.querySelector('b').textContent = v + 'X'; cur.setAttribute('aria-label', `当前${v}倍速，展开速度选择`); } }
  if (!keep) try { localStorage.setItem(SPD_KEY, String(v)); } catch (e) { }
};
// 手机：当前倍速按钮展开/收起五档木条；选完收起，点外面、Esc、再点按钮都收起（不改倍速）
const spdCurBtn = document.getElementById('spdCur'), spdRowEl = document.getElementById('spdRow');
const spdMenu = (open, back = false) => { if (!spdCurBtn) return; spdRowEl.classList.toggle('open', open); document.body.classList.toggle('spdopen', open); spdCurBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); if (!open && back) spdCurBtn.focus({ preventScroll: true }); };
if (spdCurBtn) {
  spdCurBtn.onclick = () => spdMenu(!spdRowEl.classList.contains('open'));
  document.addEventListener('pointerdown', (e) => { if (spdRowEl.classList.contains('open') && !spdRowEl.contains(e.target) && !spdCurBtn.contains(e.target)) { spdMenu(false); if (e.target === canvas) e.stopPropagation(); } }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && spdRowEl.classList.contains('open')) spdMenu(false, true); });
  addEventListener('resize', () => { if (!matchMedia('(max-width:599px)').matches) spdMenu(false); });
}
document.querySelectorAll('#spdRow [data-spd]').forEach(b => b.onclick = () => { setSpeed(+b.dataset.spd); spdMenu(false, true); }); // 三个按钮一排，点哪档就是哪档（debug 的 60× 时三个都不亮）
document.querySelectorAll('#panel [data-spd]').forEach(b => b.onclick = () => setSpeed(+b.dataset.spd));
document.getElementById('dbgAdv').onclick = () => send({ type: 'advance', sec: DAY / 2 });
document.getElementById('dbgAway').onclick = () => send({ type: 'away', ms: 5 * 3600e3 });
document.getElementById('dbgReset').onclick = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } location.href = location.pathname + '?debug&fresh'; };
function refreshPanel(fps) {
  if (!DEBUG || !lastSnap) return; const i = renderer.info.render;
  document.getElementById('pstats').innerHTML = [`FPS ${fps}${tank.on ? '（鱼缸 30）' : ''} x${speed}`, `draw calls ${i.calls} · 三角形 ${(i.triangles / 1000).toFixed(0)}k`, `房子 高模 ${town.nHi} / 简化 ${town.nLo}`, `居民 近 ${nHi} / 远 ${nLo}`,
    `Worker ${lastSnap.tickAvg.toFixed(2)}ms/${lastSnap.speed}步`, `存档 ${saveBytes < 0 ? '写入失败' : (saveBytes / 1024).toFixed(1) + ' KB'}`, `建场景 ${buildMs.toFixed(0)}ms`].join('<br>');
}

// ---------------------------------------------------------------- loop
let last = performance.now(), simT = 0, fpsFrames = 0, fpsT = 0, saveT = 0, frameMs = 0;
function onResize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); if (fqRT.rt) fqRT.rt.setSize(Math.round(w * FQ_PR), Math.round(h * FQ_PR)); camera.aspect = w / h; camera.updateProjectionMatrix(); town.smokeMat.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * PI / 360)); }
let lastPortrait = innerHeight > innerWidth * 1.1;
addEventListener('resize', () => { onResize(); const pt = innerHeight > innerWidth * 1.1; if (pt !== lastPortrait) { lastPortrait = pt; if (userHold <= 0 && !tank.on && !interior.busy) { defaultView(); onResize(); } } if (interior.busy) { const v = interior.view(camera); camera.position.copy(v.pos); controls.target.copy(v.target); cam.fly = null; } });
defaultView(); onResize();
// 隐藏即暂停（标签页切走/锁屏）：渲染停，Worker 也停；切走前存一次档
document.addEventListener('visibilitychange', () => { if (document.hidden) { send({ type: 'save', reason: 'hide' }); send({ type: 'pause' }); } else { send({ type: 'resume' }); last = performance.now(); } });
addEventListener('pagehide', () => send({ type: 'save', reason: 'hide' }));
function step(dt) {
  simT += dt; timeU.value = simT;
  const simNow = updateWorld(dt); dayT = (dayT + dt * speed / DAY) % 1; applyTime(dayT);
  interpolate(dt); separate(dt); cameoLook(dt); updateCharacters(dt, simT); edgeScroll(dt); updateMode(dt, simT); updateHandLeave(dt, simT); town.update(dt, simT, chars, camera); props.update(dt, simT, camera); worksite.update(dt, simT, siteList()); foodfx.update(dt, simT, chars, lastSnap, struct, lotHR); interior.update(dt, simT, info, smooth(0.35, 0.8, NIGHT)); if (interior.busy) renderWho(); updateEmos(dt);
  const sw = seaS.w, nightK = smooth(0.35, 0.8, NIGHT); _wc.copy(hemi.color).multiplyScalar(hemi.intensity / 1.2 * 0.75).add(_sa.copy(sun.color).multiplyScalar(sun.intensity / 3.3 * 0.35));
  weather.setDensity((LOW ? 0.5 : 1) * (tank.on ? 0.6 : 1) * (interior.busy ? 0.25 : 1)); // 手机减半，鱼缸再减；进屋时屋顶开着，雨雪少一点
  weather.update(dt, simT, camera, controls.target, { rain: wxS.rain, snow: wxS.snow, petals: sw[0] * seaS.bloom * (1 - wxS.rain) * 0.55, leaves: sw[2] * smooth(0.15, 0.8, seaS.si === 2 ? seaS.f : 1) * (1 - wxS.rain * 0.6) * 0.8,
    flies: sw[1] * nightK * (1 - wxS.rain) * (wxS.fest > 0 ? 1 : 0.5), light: _wc, top: skyMat.uniforms.top.value, hor: skyMat.uniforms.hor.value, cover: wxS.cover }, simNow);
  const pulse = 0.5 + 0.5 * Math.sin(simT * 1.3);
  altar.egg.material.emissiveIntensity = 0.9 + pulse * 0.7 + NIGHT * 0.8; altar.egg.rotation.y = simT * 0.2; altar.egg.position.y = 2.35 + Math.sin(simT * 0.9) * 0.05;
  altar.halo.material.opacity = 0.35 + pulse * 0.25 + NIGHT * 0.3; const hs = 6.5 + pulse * 0.8; altar.halo.scale.set(hs, hs, 1);
  if (userHold > 0) userHold -= dt;
  if (cam.fly) { const f = cam.fly; f.t = Math.min(1, f.t + dt / (f.dur || 1.2)); const e = smooth(0, 1, f.t); camera.position.lerpVectors(f.p0, f.p1, e); controls.target.lerpVectors(f.t0, f.t1, e); if (f.t >= 1) { cam.fly = null; if (interior.busy && interior.state !== 'closing') insideControls(true); } }
  else if (cam.follow != null && !tank.on) { const c = chars.get(cam.follow); if (c) { const k = 1 - Math.exp(-dt * 2); _v.set(c.x, c.y + 0.8, c.z); const off = camera.position.clone().sub(controls.target); const want = Math.min(off.length(), 24); off.setLength(lerp(off.length(), want, k)); controls.target.lerp(_v, k); camera.position.copy(controls.target).add(off); } }
  updateTank(dt); controls.update(); applyWall(dt); fastQ(dt);
  updateCameo(dt, simT);
  nugget.update(dt, simT, chars, NIGHT > 0.62 && !interior.busy); golds.update(simT); followEl.classList.toggle('on', cam.follow != null && !tank.on); if (mascotS.bub > 0) mascotS.bub -= dt;
  audio.update(dt, { dayT, wx: curWx, season: SEASONS[seaS.si], rain: wxS.rain, near: clamp(1 - streamDist(controls.target.x, controls.target.z) / 45, 0, 1) });
  sun.target.position.set(clamp(controls.target.x, -30, 30), 0, clamp(controls.target.z, -30, 30));
  sky.position.copy(camera.position);
}
function render() {
  renderer.info.reset();
  if (fqRT.use && fqRT.rt) { renderer.setRenderTarget(fqRT.rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(fqRT.qs, fqRT.qc); }
  else renderer.render(scene, camera);
}
function loop(now) {
  requestAnimationFrame(loop);
  if (document.hidden) { last = now; return; }
  let dt = (now - last) / 1000;
  if (tank.on && dt < 0.026) return;           // 鱼缸模式 30fps（容差放宽：60Hz 屏幕上隔一帧画一帧，不会因为几毫秒的抖动连跳两帧）
  last = now; dt = Math.min(dt, 0.1);
  const t0 = performance.now(); step(dt); render(); window.__ng.frames = (window.__ng.frames || 0) + 1; frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;
  fpsFrames++; fpsT += dt; saveT += dt;
  if (saveT > 10) { saveT = 0; send({ type: 'save', reason: 'auto' }); }
  if (fpsT > 0.5) { refreshPanel(Math.round(fpsFrames / fpsT)); window.__ng.fps = fpsFrames / fpsT; fpsFrames = 0; fpsT = 0; }
}
requestAnimationFrame((n) => { last = n; loop(n); });
// 加载画面：小镇搭好 → 收到第一份模拟快照 → 画出几帧后淡出；然后 Lenia 讲开场/打招呼
const loadP = (v, m) => { try { window.__loadP && window.__loadP(v, m); } catch (e) { } };
loadP(0.72, '把小镇摆好…');
let loadDone = false; const loadT0 = performance.now();
function finishLoading() {
  if (loadDone) return; loadDone = true; loadP(1, '好啦，进花园吧'); const ld = document.getElementById('loading');
  setTimeout(() => { if (ld) { ld.style.opacity = 0; setTimeout(() => ld.remove(), 650); } setTimeout(afterLoad, 700); }, 220);
}
// 进花园以后：第一次由 Lenia 讲开场并带一遍（合并成一套引导）；以后每次 Lenia 结合真实状态打个招呼。都说完了再给“离开期间的信”
function afterLoad() {
  lenia.start(); const allow = !Q.has('noguide') && !Q.has('tank') && !DEBUG;
  if (allow && !guideSeen()) { startGuide(ui, { env: guideEnv, onDone: () => { lenia.state.base = null; setTimeout(() => ui.holdGift(false), 450); } }); return; }
  if ((allow || Q.has('greet')) && info) { let done = false; const rel = () => { if (!done) { done = true; ui.holdGift(false); } }; lenia.greet(info, rel); setTimeout(rel, 4200); return; }
  ui.holdGift(false);
}
(function waitLoad() { if (loadDone) return; if (lastSnap) loadP(0.9, '叫醒小动物…'); if ((lastSnap && ((window.__ng && window.__ng.frames) || 0) > 3) || performance.now() - loadT0 > 9000) { try { fqWarm(); } catch (e) { } finishLoading(); } else setTimeout(waitLoad, 120); })();
setTimeout(() => { try { setThumbs(makeThumbs(renderer, town, props)); } catch (e) { console.warn('thumbs', e); } }, 300);
setTimeout(() => { try { // 预热进屋用的着色器（剖面材质的几种变体 + 家具材质），第一次进屋不卡
  const sm = [], seen = new Set(); for (const rk of ['egg', 'tea', 'rboot']) for (const b of town.ensure(rk, 'hi').T.buckets) { const k = b.vc ? b.key : (b.src.map ? 'map' : '') + (b.src.metalness > 0.3 ? 'm' : '') + (b.src.transparent ? 't' : ''); if (seen.has(k)) continue; seen.add(k); sm.push([b.vc ? b.key : b.src, b.vc]); }
  sm.push([props.lmat.main, false], [props.lmat.metal, false]); warmInterior(renderer, camera, scene, sm);
} catch (e) { console.warn('warm', e); } }, 2500);
{ let sv = 1; try { sv = +localStorage.getItem(SPD_KEY) || 1; } catch (e) { } if (!SPD_STEPS.includes(sv)) sv = SPD_STEPS.reduce((a, b) => Math.abs(b - sv) < Math.abs(a - sv) ? b : a, 1); /* 旧存的值：取最近的一档 */ setSpeed(Q.has('x') ? +Q.get('x') : sv, Q.has('x')); }
if (Q.has('tank')) setTank(true);

// ---------------------------------------------------------------- test hooks（Playwright 截图/测数用）
window.__ng = {
  fq, fqRT, wall: () => ({ R: wallS, T: wallT, drag: ctlDrag }), floraIMs, ready: true, THREE, scene, camera, controls, chars, town, renderer, buildMs, setSpeed, setTank, defaultView, send, ui, focusAt,
  get snap() { return lastSnap; }, get struct() { return struct; }, get info() { return info; }, get saveBytes() { return saveBytes; }, frameMs: () => frameMs,
  advance: (sec) => send({ type: 'advance', sec }),
  save: () => send({ type: 'save' }),
  view(px, py, pz, tx, ty, tz, fov) { if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); } camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); controls.update(); userHold = 1e9; cam.follow = null; },
  setView: (d, p, a, x, z) => { setView(d, p, a, x, z); userHold = 1e9; },
  release() { userHold = 0; cam.follow = null; cam.fly = null; },
  userHold: () => userHold,
  stats() { render(); const i = renderer.info; return { charHi: nHi, charLo: nLo, houseHi: town.nHi, houseLo: town.nLo, calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, progs: i.programs.length, frameMs, templateTris: town.templateTris }; },
  setDay(t) { send({ type: 'setTime', dayT: t }); dayT = t; },
  guideEnv, worksite, siteList, props, mode, startPlace, startTend, endMode, interior, enterInterior, exitInterior, pickLot, dbgInside: (lot, what = 'eat') => send({ type: 'dbgInside', lot, what }), dbgShop: (lot, n = 3) => send({ type: 'dbgShop', lot, n }), dbgFood: (o) => send({ type: 'dbgFood', ...o }), foodfx, dbgStall: (lot) => send({ type: 'dbgStall', lot }), stress: (n) => send({ type: 'stress', n }), startGuide: (force = true) => startGuide(ui, { force }),
  placeAt(x, z, yaw = 0) { mode.x = x; mode.z = z; mode.yaw = yaw; checkPlace(); return { ok: mode.ok, why: mode.why }; },
  confirmPlace() { document.getElementById('placeOk').click(); },
  lenia(m) { send({ type: 'lenia', ...m }); },
  lenia, audio, cameo, startCameo, nugget, golds, startMove, startFollow, stopFollow, nuggetTap, cameoTap, get moveWait() { return moveWait; }, get hand3d() { return P3.hand; }, handTune(opt, yaw, tilt) { if (tilt != null) P3.tilt = tilt; if (P3.hand) { scene.remove(P3.hand.group, P3.sh.mesh); P3.hand = null; } Object.assign(P3.opt, opt || {}); if (yaw != null) P3.yaw = yaw; if (mode.kind) handOn(); }, cam, get loadDone() { return loadDone; }, bubbles, openThought, closeThought, gateList, gateNew, pickGate,
  weather, wxS, seaS, setWeather(k, cover = null, wet = null) { send({ type: 'weather', k, cover, wet }); }, tripNow() { send({ type: 'tripNow' }); }, give(item, n = 1) { send({ type: 'give', item, n }); },
};
