// 造型库·核心：工具函数、材质、程序化贴图、几何辅助（摘自 prototype-3d/main.js，重组为模块）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const Q = new URLSearchParams(location.search);
export const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || Math.min(innerWidth, innerHeight) < 560;
export const LOW = IS_MOBILE || Q.has('low');
export const PI = Math.PI, TAU = PI * 2;
export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let _rs = 20261015;
export function rng() { let a = _rs = (_rs + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
export function reseed(v) { const o = _rs; _rs = v | 0; return o; }
// 造型细节系数：远景简化版用 <1 的值重建同一造型（圆周分段按比例减少）
export const DETAIL = { v: 1 };
export const seg = (n, min = 3) => Math.max(min, Math.round(n * DETAIL.v));
export const R = (a, b) => a + (b - a) * rng();
export const RI = (a, b) => Math.floor(R(a, b + 1));
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return lerp(lerp(hash2(ix, iy), hash2(ix + 1, iy), ux), lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux), uy); }
export function fbm(x, y) { return vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 5.2, y * 2.1 + 1.3) * 0.3 + vnoise(x * 4.3 + 9.1, y * 4.3 + 7.7) * 0.15; }
export function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); const qx = ax + dx * t - px, qz = az + dz * t - pz; return Math.sqrt(qx * qx + qz * qz); }
export let ENV = null;
export const METALS = [];
export const STAGE = { v: 0 }; // 当前造型部件所属的改造阶段：0 原始物件 1 门/台阶 2 窗/灯 3 烟囱/屋顶/花盆等装饰
export function withStage(s, fn) { const o = STAGE.v; STAGE.v = s; try { return fn(); } finally { STAGE.v = o; } }
export const rimU = { value: new THREE.Color(0.3, 0.27, 0.22) };
export const timeU = { value: 0 };
// 天气和季节（全局，main.js 每帧平滑地改）：积雪 0～1、地面湿润 0～1、树叶和草地的季节色（乘在原色上）
export const WXU = { uSnow: { value: 0 }, uWet: { value: 0 }, uLeafT: { value: new THREE.Color(0.2, 0.5, 0.1) }, uLeafA: { value: 0 }, uGrassT: { value: new THREE.Color(1, 1, 1) } };
export const SEASONAL = { drop: [], bloom: [] }; // 冬天会掉光的树叶、只在春天开的花（材质透明度由 main.js 控制）
// 所有程序化材质共用的天气片段：朝上的面按噪声慢慢积雪；湿的时候朝上的面变暗、变光滑（有一点反光）
const WX_VERT_HEAD = 'varying vec3 vJkW;';
const WX_VERT = `#ifdef USE_INSTANCING
vJkW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vJkW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`;
const WX_FRAG_HEAD = `uniform float uSnow, uWet, uWxK, uFolK, uLeafA; uniform vec3 uLeafT, uGrassT; varying vec3 vJkW;
float jkWH(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float jkWN(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(jkWH(i),jkWH(i+vec2(1,0)),u.x), mix(jkWH(i+vec2(0,1)),jkWH(i+vec2(1,1)),u.x), u.y); }`;
// 草地：乘一个季节色；树叶：按亮度换成季节的叶色（绿色乘不出橙色）
const WX_COLOR = `if (uFolK > 1.5) diffuseColor.rgb *= mix(vec3(1.0), uGrassT, uFolK - 1.5); else if (uFolK > 0.5) { float jkL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(diffuseColor.rgb, uLeafT * (0.5 + jkL * 1.6), uLeafA); }`;
const WX_FRAG = `if (uSnow + uWet > 0.002 && uWxK > 0.0) {
  vec3 jkUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); float up = dot(normal, jkUp);
  float n = jkWN(vJkW.xz * 0.45) * 0.6 + jkWN(vJkW.xz * 2.3 + 7.0) * 0.4;
  float sn = clamp((uSnow * 1.45 - (1.0 - up) * 1.25 - n * 0.5 + 0.12) * 5.0, 0.0, 1.0) * uWxK;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), sn);
  float wt = uWet * smoothstep(0.3, 0.9, up) * uWxK * (1.0 - sn) * (0.75 + 0.25 * n);
  diffuseColor.rgb *= 1.0 - 0.32 * wt;
  roughnessFactor = mix(roughnessFactor, 0.14, wt * 0.85); roughnessFactor = mix(roughnessFactor, 0.9, sn);
}`;
// 给任意 MeshStandardMaterial 的着色器加上天气（houses、路面这些自己写 onBeforeCompile 的材质也调用它）
export function wxShader(sh, { k = 1, fol = 0 } = {}) {
  Object.assign(sh.uniforms, WXU); sh.uniforms.uWxK = { value: k }; sh.uniforms.uFolK = { value: fol };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WX_VERT_HEAD).replace('#include <project_vertex>', '#include <project_vertex>\n' + WX_VERT);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + WX_FRAG_HEAD).replace('#include <color_fragment>', '#include <color_fragment>\n' + WX_COLOR).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WX_FRAG);
}
// 进屋时的暖灯（假点光源）：只加在室内材质和居民身上，不进屋时颜色为 0（不增加真实灯光，不触发全场景重编译着色器）
export const LAMPU = { uLampP: { value: new THREE.Vector3(0, -999, 0) }, uLampC: { value: new THREE.Color(0, 0, 0) }, uLampR: { value: 5 } };
export function lampShader(sh) {
  Object.assign(sh.uniforms, LAMPU);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLampW;').replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
vLampW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vLampW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uLampP, uLampC; uniform float uLampR; varying vec3 vLampW;')
    .replace('#include <opaque_fragment>', `if (uLampC.r + uLampC.g + uLampC.b > 0.001) { vec3 jkLv = uLampP - vLampW; float jkLd = length(jkLv); float jkLa = clamp(1.0 - jkLd / uLampR, 0.0, 1.0); jkLa *= jkLa;
  float jkLn = 0.45 + 0.55 * max(dot(normal, normalize((viewMatrix * vec4(jkLv, 0.0)).xyz)), 0.0); outgoingLight += diffuseColor.rgb * uLampC * (jkLa * jkLn); }
#include <opaque_fragment>`);
}
export function wxPatch(mat, o = {}) { const prev = mat.onBeforeCompile; mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); wxShader(sh, o); }; const key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : ''; mat.customProgramCacheKey = () => key + 'wx'; return mat; }
export function patch(mat, { rim = 1, sway = 0, wx = 1, fol = 0 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rimU; sh.uniforms.uRimK = { value: rim }; sh.uniforms.uTime = timeU;
    wxShader(sh, { k: wx, fol });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimK;')
      .replace('#include <opaque_fragment>', 'outgoingLight += uRim * uRimK * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);\n#include <opaque_fragment>');
    if (sway > 0) {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
#else
vec2 ip = vec2(modelMatrix[3].x, modelMatrix[3].z);
#endif
float hgt = max(position.y, 0.0);
float sw = sin(uTime*1.7 + ip.x*0.31 + ip.y*0.23) + 0.45*sin(uTime*3.1 + ip.x*0.9 - ip.y*0.5);
transformed.x += sw * ${sway.toFixed(3)} * hgt * hgt;
transformed.z += cos(uTime*1.3 + ip.y*0.4 + ip.x*0.2) * ${(sway * 0.6).toFixed(3)} * hgt * hgt;`);
    }
  };
  mat.customProgramCacheKey = () => 'jk' + (sway > 0 ? 's' + sway : '');
  return mat;
}
export const MATS = new Map();
export function M(color, o = {}) {
  const key = color + '|' + JSON.stringify(o, (k, v) => (v && v.isTexture) ? v.uuid : v);
  if (MATS.has(key)) return MATS.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: o.r ?? 0.78, metalness: o.m ?? 0, map: o.map || null,
    side: o.ds ? THREE.DoubleSide : THREE.FrontSide, vertexColors: !!o.vc, flatShading: !!o.flat,
  });
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
  if ((o.m ?? 0) > 0.3) { m.envMap = ENV; m.envMapIntensity = 1; METALS.push(m); }
  if (o.fol || o.keep) m.userData.keep = true; // 季节材质不要被 globalMerge 转成顶点色（那样就没法统一变色了）
  if (o.drop || o.bloom) { m.alphaHash = true; m.transparent = false; SEASONAL[o.drop ? 'drop' : 'bloom'].push(m); }
  patch(m, { rim: o.rim ?? 1, sway: o.sway || 0, wx: o.wx ?? 1, fol: o.fol || 0 });
  MATS.set(key, m);
  return m;
}
export function ctex(w, h, draw, rep = [1, 1], srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export const TX = {};
TX.wood = ctex(256, 256, (g, w, h) => {
  g.fillStyle = '#c98a4f'; g.fillRect(0, 0, w, h);
  const pw = w / 4;
  for (let i = 0; i < 4; i++) {
    g.fillStyle = ['#c98a4f', '#bf7f45', '#d39657', '#c48549'][i]; g.fillRect(i * pw, 0, pw, h);
    for (let k = 0; k < 18; k++) { g.strokeStyle = `rgba(110,60,25,${R(0.08, 0.22)})`; g.lineWidth = R(0.6, 1.6); g.beginPath(); const x = i * pw + R(4, pw - 4); g.moveTo(x, 0); g.bezierCurveTo(x + R(-5, 5), h * 0.3, x + R(-5, 5), h * 0.7, x + R(-3, 3), h); g.stroke(); }
    g.fillStyle = 'rgba(80,40,15,.55)'; g.fillRect(i * pw, 0, 2.5, h);
  }
}, [1, 1]);
TX.shell = ctex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${RI(170, 210)},${RI(140, 170)},${RI(100, 130)},${R(0.12, 0.35)})`; g.beginPath(); g.arc(R(0, w), R(0, h), R(0.6, 2.4), 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(160,130,100,.35)'; g.lineWidth = 1.2;
  for (let c = 0; c < 4; c++) { g.beginPath(); let x = R(0, w), y = R(0, h * 0.3); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += R(-14, 14); y += R(6, 18); g.lineTo(x, y); } g.stroke(); }
}, [3, 2]);
TX.straw = ctex(256, 256, (g, w, h) => {
  g.fillStyle = '#d9a650'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) { const c = pick(['#f0c470', '#c58c3a', '#e8b860', '#a8742c', '#f6d58a']); g.strokeStyle = c; g.lineWidth = R(1, 2.6); g.beginPath(); const x = R(-20, w), y = R(0, h); const a = R(-0.5, 0.5); const l = R(18, 50); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
}, [6, 2]);
TX.teapot = ctex(512, 256, (g, w, h) => {
  g.fillStyle = '#5cc0b5'; g.fillRect(0, 0, w, h);
  const flower = (x, y, r, petal, center) => { g.fillStyle = petal; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, r * 0.55, r * 0.32, a, 0, TAU); g.fill(); } g.fillStyle = center; g.beginPath(); g.arc(x, y, r * 0.35, 0, TAU); g.fill(); };
  for (let i = 0; i < 26; i++) { const x = R(10, w - 10), y = R(40, h - 30); flower(x, y, R(9, 16), 'rgba(255,255,250,.95)', '#ffc83a'); }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(R(0, w), R(30, h), R(1.5, 3.5), 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,240,200,.9)'; g.fillRect(0, h - 22, w, 8); g.fillRect(0, 10, w, 6);
}, [3, 1]);
TX.fishcan = ctex(1024, 256, (g, w, h) => {
  g.fillStyle = '#3f78cf'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f7ead0'; g.fillRect(0, h * 0.40, w, h * 0.24);
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 5;
  for (const yy of [h * 0.18, h * 0.86]) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, yy + Math.sin(x / 22) * 5); g.stroke(); }
  const fish = (x, y, s, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, 34 * s, 16 * s, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(x + 28 * s, y); g.lineTo(x + 52 * s, y - 16 * s); g.lineTo(x + 52 * s, y + 16 * s); g.closePath(); g.fill(); g.fillStyle = '#2b3550'; g.beginPath(); g.arc(x - 20 * s, y - 3 * s, 3.5 * s, 0, TAU); g.fill(); };
  for (let i = 0; i < 6; i++) fish(80 + i * 170, h * 0.52, 0.95, '#5b8fd6');
  const paw = (x, y) => { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(x, y, 10, 8, 0, 0, TAU); g.fill(); for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x - 11 + k * 7.3, y - 12 - (k === 1 || k === 2 ? 3 : 0), 3.6, 0, TAU); g.fill(); } };
  for (let i = 0; i < 6; i++) { paw(165 + i * 170, h * 0.28); }
}, [1, 1]);
TX.label = ctex(512, 256, (g, w, h) => {
  g.fillStyle = '#e2463c'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,1)';
  g.fillStyle = '#fff3e0'; g.fillRect(0, h * 0.06, w, 10); g.fillRect(0, h * 0.9, w, 10);
  g.fillStyle = 'rgba(120,10,10,.25)'; for (let y = 0; y < h; y += 26) g.fillRect(0, y, w, 2);
  g.fillStyle = '#fff3e0';
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(64 + i * 128, h * 0.5, 22, 0, TAU); g.fill(); }
  g.fillStyle = '#ff9a2e'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(54 + i * 128, h * 0.42); g.lineTo(74 + i * 128, h * 0.42); g.lineTo(64 + i * 128, h * 0.62); g.fill(); g.fillStyle = '#5cb84a'; g.fillRect(60 + i * 128, h * 0.36, 8, 8); g.fillStyle = '#ff9a2e'; }
}, [2, 1]);
TX.stripes = ctex(256, 32, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff6ea' : '#e2463c'; g.fillRect(i * w / 8, 0, w / 8, h); } }, [2, 1]);
TX.stone = ctex(256, 256, (g, w, h) => {
  g.fillStyle = '#6f6458'; g.fillRect(0, 0, w, h);
  const rows = 4, bh = h / rows;
  for (let r = 0; r < rows; r++) { const n = 5, bw = w / n, off = (r % 2) * bw / 2; for (let i = -1; i < n + 1; i++) { const v = RI(176, 214); g.fillStyle = `rgb(${v},${v - 8},${v - 22})`; const x = i * bw + off + 3, y = r * bh + 3; g.beginPath(); g.roundRect(x, y, bw - 6, bh - 6, 9); g.fill(); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 4, y + 3, bw - 14, 4); } }
}, [5, 1]);
TX.weave = ctex(128, 128, (g, w, h) => {
  g.fillStyle = '#7a4a22'; g.fillRect(0, 0, w, h);
  const s = 16;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { const odd = ((x + y) / s) % 2; g.fillStyle = odd ? '#b8783a' : '#a0652e'; g.beginPath(); if (odd) g.ellipse(x + s / 2, y + s / 2, s * 0.5, s * 0.3, 0.6, 0, TAU); else g.ellipse(x + s / 2, y + s / 2, s * 0.3, s * 0.5, 0.6, 0, TAU); g.fill(); }
}, [8, 2]);
TX.leather = ctex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${RI(110, 150)},${RI(60, 80)},30,${R(0.02, 0.06)})`; g.beginPath(); g.arc(R(0, w), R(0, h), R(6, 22), 0, TAU); g.fill(); }
  for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(90,50,20,.08)'; g.beginPath(); const x = R(0, w), y = R(0, h); g.moveTo(x, y); g.lineTo(x + R(-12, 12), y + R(-4, 4)); g.stroke(); }
}, [0.35, 0.35]);
TX.yarn = ctex(128, 128, (g, w, h) => { g.fillStyle = '#ff7aa8'; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.strokeStyle = i % 2 ? 'rgba(255,190,215,.8)' : 'rgba(200,60,110,.5)'; g.lineWidth = 2.2; g.beginPath(); const y = i * 3.3; g.moveTo(0, y); g.bezierCurveTo(40, y + 10, 80, y - 10, 128, y + 4); g.stroke(); } }, [3, 2]);
TX.mush = ctex(256, 128, (g, w, h) => { g.fillStyle = '#e23b33'; g.fillRect(0, 0, w, h); for (let i = 0; i < 26; i++) { const y = R(h * 0.08, h * 0.75); const r = R(6, 13) * (1 - y / h * 0.6); g.fillStyle = '#fff6ec'; g.beginPath(); g.ellipse(R(0, w), y, r * 1.2, r, 0, 0, TAU); g.fill(); } }, [1, 1]);
TX.thread = (col) => ctex(64, 64, (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y, w, 1.5); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, y + 2, w, 1); } }, [1, 4]);
TX.sign = ctex(128, 96, (g, w, h) => { g.fillStyle = '#f3dfb5'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff8c2a'; g.beginPath(); g.moveTo(40, 30); g.lineTo(88, 40); g.lineTo(46, 70); g.closePath(); g.fill(); g.fillStyle = '#4fae3a'; g.beginPath(); g.ellipse(36, 30, 10, 6, -0.6, 0, TAU); g.fill(); });

export let MAT = null, DYN_EMISSIVE = null;
export function initCore(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; void main(){ float h = vP.y;
        vec3 sky = mix(vec3(0.95,0.88,0.76), vec3(0.22,0.45,0.85), smoothstep(0.0,0.55,h));
        vec3 gnd = mix(vec3(0.55,0.5,0.36), vec3(0.16,0.3,0.1), smoothstep(0.0,-0.3,h));
        vec3 c = h > 0.0 ? sky : gnd;
        float tree = step(h, 0.06 + 0.04*sin(atan(vP.z, vP.x)*9.0)) * step(0.0, h); c = mix(c, vec3(0.3,0.55,0.25), tree*0.8);
        float sun = pow(max(dot(vP, normalize(vec3(-0.45,0.65,-0.6))), 0.0), 90.0); c += vec3(3.2,2.9,2.4)*sun;
        float soft = pow(max(dot(vP, normalize(vec3(0.5,0.5,0.7))), 0.0), 6.0); c += vec3(0.25,0.22,0.18)*soft;
        gl_FragColor = vec4(c, 1.0); }` });
    es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), m));
  ENV = pmrem.fromScene(es, 0.0).texture;
  MAT = {
  wood: M('#ffffff', { map: TX.wood, r: 0.85 }),
  woodDark: M('#8a5530', { r: 0.85 }),
  woodMid: M('#b27242', { r: 0.85 }),
  door: (() => { const t = TX.wood.clone(); t.repeat.set(0.9, 0.45); t.needsUpdate = true; return M('#e8b07a', { map: t, r: 0.8 }); })(),
  dark: M('#2c1c12', { r: 1 }),
  gold: M('#e8b64a', { m: 0.8, r: 0.35 }),
  silver: M('#c9d0d9', { m: 0.95, r: 0.27 }),
  window: M('#ffd98e', { emissive: '#ffae42', ei: 0.4, r: 0.45 }),
  lantern: M('#ffe2a0', { emissive: '#ffb347', ei: 0.4, r: 0.4 }),
  green: M('#5fb048', { r: 0.8 }),
  leaf: M('#4f9f3a', { r: 0.8 }),
  terracotta: M('#d0764a', { r: 0.85 }),
  soil: M('#6b4127', { r: 1 }),
  rock: M('#a9a39a', { r: 0.9, flat: true }),
  white: M('#fbf6ee', { r: 0.7 }),
  orange: M('#ff8f2a', { r: 0.7 }),
  };
  DYN_EMISSIVE = { window: MAT.window, lantern: MAT.lantern };
}
export const GC = new Map();
export function G(key, make) { if (!GC.has(key)) GC.set(key, make()); return GC.get(key); }
export const sphereG = (r = 1, w = 20, h = 14) => { w = seg(w, 5); h = seg(h, 3); return G(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h)); };
export const boxG = (x, y, z) => G(`b${x},${y},${z}`, () => new THREE.BoxGeometry(x, y, z));
export const cylG = (a, b, h, s = 16, open = false) => { s = seg(s, 4); return G(`c${a},${b},${h},${s},${open}`, () => new THREE.CylinderGeometry(a, b, h, s, 1, open)); };
export const torusG = (r, t, rs = 8, ts = 24, arc = TAU) => { rs = seg(rs, 3); ts = seg(ts, 6); return G(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)); };
export function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true; m.userData.stg = STAGE.v; parent.add(m); return m;
}
// 简化版：轮廓点也按比例抽稀（保留首尾）
export function thin(pts) { if (DETAIL.v >= 1 || pts.length < 8) return pts; const k = Math.min(3, Math.round(1 / DETAIL.v)); const o = pts.filter((p, i) => i % k === 0); if (o[o.length - 1] !== pts[pts.length - 1]) o.push(pts[pts.length - 1]); return o; }
export function lathe(pts, n = 32) { return new THREE.LatheGeometry(thin(pts).map(p => new THREE.Vector2(p[0], p[1])), seg(n, 6)); }
// 直接构造几何体的细节版本（受 DETAIL 影响）
export const GEO = {
  sphere: (r, w, h, ...a) => new THREE.SphereGeometry(r, seg(w, 5), seg(h, 3), ...a),
  cyl: (a, b, h, s, hs = 1, open = false) => new THREE.CylinderGeometry(a, b, h, seg(s, 4), hs, open),
  torus: (r, t, rs, ts, arc) => new THREE.TorusGeometry(r, t, seg(rs, 3), seg(ts, 6), arc),
  lathe: (pts, n) => new THREE.LatheGeometry(thin(pts), seg(n, 6)),
  tube: (c, ts, r, rs, closed) => new THREE.TubeGeometry(c, seg(ts, 4), r, seg(rs, 3), closed),
  circle: (r, n) => new THREE.CircleGeometry(r, seg(n, 6)),
  shape: (sh, n) => new THREE.ShapeGeometry(sh, seg(n, 2)),
  extrude: (sh, o) => new THREE.ExtrudeGeometry(sh, { ...o, curveSegments: seg(o.curveSegments ?? 12, 3), bevelSegments: o.bevelEnabled ? Math.max(1, seg(o.bevelSegments ?? 3, 1)) : o.bevelSegments }),
  capsule: (r, l, c, rs) => new THREE.CapsuleGeometry(r, l, seg(c, 2), seg(rs, 4)),
};
export function archShape(w, h) { const s = new THREE.Shape(); const r = w / 2; s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, PI, false); s.lineTo(-r, 0); return s; }
export function circleShape(r, cy) { const s = new THREE.Shape(); s.absarc(0, cy, r, 0, TAU, false); return s; }
export function bake(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  return geo.clone().applyMatrix4(m);
}
export function norm(g) {
  g = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
export function mergeList(list, withColor = false) {
  const gs = list.map(norm);
  for (const g of gs) { if (withColor) { if (!g.attributes.color) { const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); } } else if (g.attributes.color) g.deleteAttribute('color'); }
  return mergeGeometries(gs, false);
}
export function tint(geo, color) { const c = new THREE.Color(color); const g = norm(geo); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
export function taperTube(curve, segs, r0, r1, radial = 14) {
  segs = seg(segs, 3); radial = seg(radial, 3);
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false); const pos = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) { const c = curve.getPointAt(i / segs); const r = lerp(r0, r1, i / segs); for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, v.x, v.y, v.z); } }
  g.computeVertexNormals(); return g;
}
export function wallGeometry(pts, y0, y1) {
  const n = pts.length; let cx = 0, cz = 0; pts.forEach(p => { cx += p[0] / n; cz += p[1] / n; });
  const per = [0]; for (let i = 1; i <= n; i++) { const a = pts[i - 1], b = pts[i % n]; per[i] = per[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], pr = pts[(i - 1 + n) % n], nx = pts[(i + 1) % n];
    let tx = nx[0] - pr[0], tz = nx[1] - pr[1]; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    let ox = tz, oz = -tx; if (ox * (p[0] - cx) + oz * (p[1] - cz) < 0) { ox = -ox; oz = -oz; }
    pos.push(p[0], y0, p[1], p[0], y1, p[1]); nor.push(ox, 0, oz, ox, 0, oz); uv.push(per[i] / per[n], 0, per[i] / per[n], 1);
  }
  const p0 = pts[0], p1 = pts[1]; const tx = p1[0] - p0[0], tz = p1[1] - p0[1];
  const faceN = [-tz, tx]; const outward = [nor[0], nor[2]]; const ok = faceN[0] * outward[0] + faceN[1] * outward[1] > 0;
  for (let i = 0; i < n; i++) { const a = 2 * i, b = a + 1, c = a + 2, d = a + 3; if (ok) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
export function roundRectPts(w, d, r, seg = 8) {
  const pts = []; const cx = [w / 2 - r, -(w / 2 - r), -(w / 2 - r), w / 2 - r], cz = [d / 2 - r, d / 2 - r, -(d / 2 - r), -(d / 2 - r)];
  for (let k = 0; k < 4; k++) for (let j = 0; j <= seg; j++) { const a = k * PI / 2 + j / seg * PI / 2; pts.push([cx[k] + r * Math.cos(a), cz[k] + r * Math.sin(a)]); }
  return pts;
}
// merge static meshes in a group by material (big draw call saver)
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(); const remove = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    let p = o; while (p && p !== root) { if (p.userData.dyn) return; p = p.parent; }
    const g = norm(o.geometry); if (g.attributes.color) g.deleteAttribute('color');
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid + (o.castShadow ? 'c' : '');
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, list: [] });
    buckets.get(key).list.push(g); remove.push(o);
  });
  remove.forEach(o => o.parent.remove(o));
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(b.list, false), b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = true; root.add(mesh);
  }
}

// 静态场景按材质合并（摘自原型 globalMerge）：把 root 下所有静态 Mesh 按材质合成一个，平色材质转顶点色进一步合并
export function globalMerge(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(); const remove = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || !o.material.isMeshStandardMaterial || o.userData.noMerge) return;
    let p = o; while (p) { if (p.userData.dyn || p.userData.noMerge) return; p = p.parent; }
    const mt = o.material;
    const plain = !mt.map && !mt.vertexColors && !mt.userData.keep && mt.metalness < 0.3 && mt.emissiveIntensity * (mt.emissive.r + mt.emissive.g + mt.emissive.b) === 0;
    const g = norm(o.geometry); if (g.attributes.color && !mt.vertexColors) g.deleteAttribute('color');
    g.applyMatrix4(o.matrixWorld);
    let key, mat;
    if (plain) {
      const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = mt.color.r; a[i * 3 + 1] = mt.color.g; a[i * 3 + 2] = mt.color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      mat = M('#ffffff', { vc: true, r: Math.round(mt.roughness * 5) / 5, ds: mt.side === THREE.DoubleSide, flat: mt.flatShading }); key = 'vc' + mat.uuid + (o.castShadow ? 'c' : '');
    } else { mat = mt; key = mt.uuid + (o.castShadow ? 'c' : ''); if (mt.vertexColors && !g.attributes.color) { g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3)); } }
    if (!buckets.has(key)) buckets.set(key, { mat, cast: o.castShadow, list: [] });
    buckets.get(key).list.push(g); remove.push(o);
  });
  remove.forEach(o => o.parent.remove(o));
  for (const b of buckets.values()) { const mesh = new THREE.Mesh(mergeGeometries(b.list, false), b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = true; root.add(mesh); }
  return buckets.size;
}
