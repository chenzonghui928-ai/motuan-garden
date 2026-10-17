// 造型库·角色：六种动物的程序化雕刻 + GPU 骨骼（摘自 prototype-3d/main.js）
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOW, PI, TAU, clamp, lerp, G, M, rimU, taperTube, lampShader } from './core.js';
export const MAXC = 72; export const CS = 1.12; // MAXC：每个物种的实例容量
export const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
export const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
// joints: 0 body, 1 head, 3 earL, 4 earR, 5 upper armL, 6 upper armR, 11 forearmL, 12 forearmR, 7 legL, 8 legR, 9 tail, 10 can, 13 carried box
// aTag = (joint, slot + 4*fabric, variantMask, expr)   expr: 1 open eye (blink/happy squash), 2 happy-only arc
// aState = (variant + carry*0.5, happy, elbowL, elbowR)
export const RIG_VERT = `
attribute vec4 aTag; attribute vec3 aPivot;
attribute vec4 aBody; attribute vec4 aHead; attribute vec4 aEars; attribute vec4 aArms; attribute vec4 aFeet; attribute vec4 aState;
uniform vec3 uNeck; uniform vec3 uShL; uniform vec3 uShR; uniform vec3 uElR;
varying vec3 vRest; varying float vFab;
mat3 rigM(vec3 r){ float cx=cos(r.x), sx=sin(r.x), cy=cos(r.y), sy=sin(r.y), cz=cos(r.z), sz=sin(r.z);
  mat3 X = mat3(1.0,0.0,0.0, 0.0,cx,sx, 0.0,-sx,cx); mat3 Y = mat3(cy,0.0,-sy, 0.0,1.0,0.0, sy,0.0,cy); mat3 Z = mat3(cz,sz,0.0, -sz,cz,0.0, 0.0,0.0,1.0); return Y*X*Z; }
void rigRot(inout vec3 p, inout vec3 n, vec3 piv, vec3 r){ mat3 m = rigM(r); p = m*(p-piv)+piv; n = m*n; }
bool isJ(float a, float b){ return abs(a-b) < 0.5; }
void rig(inout vec3 p, inout vec3 n){
  vRest = p; vFab = floor(aTag.y / 4.0 + 0.01);
  float vb = exp2(floor(aState.x + 0.001));
  if (mod(floor(aTag.z / vb + 0.001), 2.0) < 0.5) { p = vec3(0.0, -50.0, 0.0); return; }
  float j = aTag.x; float ex = aTag.w; float happy = aState.y; float fr = fract(aState.x); float blink = fr >= 0.5 ? 0.1 : 1.0; float carry = mod(fr, 0.5) * 4.0;
  float can = aEars.w; float tilt = can * 0.6;
  if (ex > 0.5 && ex < 1.5) p.y = aPivot.y + (p.y - aPivot.y) * max(blink * (1.0 - happy), 0.06);
  if (ex > 1.5) p = aPivot + (p - aPivot) * max(happy, 0.0001);
  if (isJ(j,10.0)) { p = aPivot + (p-aPivot)*max(can, 0.0001); rigRot(p,n,aPivot, vec3(tilt,0.0,0.0)); rigRot(p,n,uElR, vec3(aState.w,0.0,0.0)); rigRot(p,n,uShR, vec3(aArms.z,0.0,aArms.w)); }
  if (isJ(j,11.0)) { rigRot(p,n,aPivot, vec3(aState.z,0.0,0.0)); rigRot(p,n,uShL, vec3(aArms.x,0.0,aArms.y)); }
  if (isJ(j,12.0)) { rigRot(p,n,aPivot, vec3(aState.w,0.0,0.0)); rigRot(p,n,uShR, vec3(aArms.z,0.0,aArms.w)); }
  if (isJ(j,5.0)) rigRot(p,n,aPivot, vec3(aArms.x,0.0,aArms.y));
  if (isJ(j,6.0)) rigRot(p,n,aPivot, vec3(aArms.z,0.0,aArms.w));
  if (isJ(j,13.0)) p = aPivot + (p-aPivot)*max(carry, 0.0001);
  if (isJ(j,9.0)) rigRot(p,n,aPivot, vec3(0.0, aHead.w, aHead.w*0.4));
  if (isJ(j,3.0)) rigRot(p,n,aPivot, vec3(aEars.x, 0.0, aEars.z));
  if (isJ(j,4.0)) rigRot(p,n,aPivot, vec3(aEars.y, 0.0, aEars.z));
  if (j > 0.5 && j < 4.5) { rigRot(p,n,uNeck, vec3(aHead.x, aHead.y, -aBody.z*0.6)); p.y += aHead.z; }
  if (isJ(j,7.0)) { rigRot(p,n,aPivot, vec3(aFeet.x,0.0,0.0)); p.y += aFeet.y; }
  else if (isJ(j,8.0)) { rigRot(p,n,aPivot, vec3(aFeet.z,0.0,0.0)); p.y += aFeet.w; }
  else { p.xz *= 1.0 + aBody.w; p.y *= 1.0 - aBody.w; rigRot(p,n,vec3(0.0), vec3(aBody.y, 0.0, aBody.z)); p.y += aBody.x; }
}
`;
export const RIG_FRAG = `
uniform vec3 uRim; uniform float uSil; varying vec3 vRest; varying float vFab;
float jkH(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
float jkN(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(jkH(i),jkH(i+vec3(1,0,0)),f.x), mix(jkH(i+vec3(0,1,0)),jkH(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(jkH(i+vec3(0,0,1)),jkH(i+vec3(1,0,1)),f.x), mix(jkH(i+vec3(0,1,1)),jkH(i+vec3(1,1,1)),f.x),f.y), f.z); }
`;
export function rigMaterials(sp) {
  const U = { uNeck: { value: new THREE.Vector3(...sp.neck) }, uShL: { value: new THREE.Vector3(...sp.sh) }, uShR: { value: new THREE.Vector3(-sp.sh[0], sp.sh[1], sp.sh[2]) }, uElR: { value: new THREE.Vector3(-sp.el[0], sp.el[1], sp.el[2]) },
    uPal: { value: sp.pal.flat().map(c => new THREE.Color(c)) }, uSil: SIL };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U); sh.uniforms.uRim = rimU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uPal[9];\n' + RIG_VERT)
      .replace('#include <color_vertex>', '#include <color_vertex>\n{ float slot = mod(aTag.y, 4.0); if (slot > 0.5) { int k = int(floor(aState.x + 0.001)) * 3 + int(slot + 0.5) - 1; vColor.rgb = uPal[k]; } }')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(normal); vec3 rigP = vec3(position); rig(rigP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = rigP;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + RIG_FRAG)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float g = jkH(floor(vRest*160.0));
  if (vFab < 0.5) diffuseColor.rgb *= 0.9 + 0.12*jkN(vRest*16.0) + 0.06*(g-0.5);
  else if (vFab < 1.5) { float a = sin((vRest.x+vRest.z)*230.0), b = sin(vRest.y*230.0); diffuseColor.rgb *= 0.92 + 0.05*a*b + 0.08*jkN(vRest*22.0) + 0.04*(g-0.5); }
  else { float ang = atan(vRest.x, vRest.z)*16.0; float v = abs(fract(ang)-0.5); float row = fract(vRest.y*30.0 + v*1.4); diffuseColor.rgb *= 0.8 + 0.26*smoothstep(0.0,0.45,row)*smoothstep(1.0,0.55,row) + 0.04*(g-0.5); } }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ float s = vFab > 1.5 ? 0.0 : 1.0; normal = normalize(normal + (vec3(jkN(vRest*60.0), jkN(vRest*60.0+7.1), jkN(vRest*60.0+3.3)) - 0.5) * 0.22 * s); }')
      .replace('#include <opaque_fragment>', 'float fzz = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.2);\noutgoingLight += uRim * 0.7 * fzz + diffuseColor.rgb * fzz * 0.12;\n#include <opaque_fragment>')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\nif (uSil > 0.5) gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);');
    lampShader(sh); // 屋里的暖灯
  };
  mat.customProgramCacheKey = () => 'rig3';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + RIG_VERT)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); vec3 rigN0 = vec3(0.0, 1.0, 0.0); rig(transformed, rigN0);');
  };
  depth.customProgramCacheKey = () => 'rigdepth3';
  return { mat, depth };
}
export const SIL = { value: 0 };

// ---------------------------------------------------------------- sculpting helpers
export function P(L, geo, col, o = {}, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const e = r.isEuler ? r : new THREE.Euler(...r);
  let g = geo.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(...s)));
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count; const c = new THREE.Color(col || '#ffffff'); const pv = o.piv || [0, 0, 0];
  const ca = new Float32Array(n * 3), ta = new Float32Array(n * 4), pa = new Float32Array(n * 3);
  const tag = [o.j || 0, (o.slot || 0) + 4 * (o.fab || 0), o.vm ?? 7, o.ex || 0];
  for (let i = 0; i < n; i++) { ca.set([c.r, c.g, c.b], i * 3); ta.set(tag, i * 4); pa.set(pv, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); g.setAttribute('aTag', new THREE.BufferAttribute(ta, 4)); g.setAttribute('aPivot', new THREE.BufferAttribute(pa, 3));
  L.push(g); return g;
}
export let CD = LOW ? 0.6 : 0.82; const sg = (n, m = 4) => Math.max(m, Math.round(n * CD));
export const SPH = (w = 16, h = 12) => G(`unitS${sg(w)},${sg(h, 3)}`, () => new THREE.SphereGeometry(1, sg(w), sg(h, 3)));
export const _upY = new THREE.Vector3(0, 1, 0), _upZ = new THREE.Vector3(0, 0, 1);
export function capAB(L, col, o, a, b, r, rs = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b); const d = B.clone().sub(A); const len = d.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(len, 0.001), LOW ? 2 : 3, sg(rs, 5));
  const q = new THREE.Quaternion().setFromUnitVectors(_upY, d.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return P(L, g, col, o);
}
export function ringAxis(L, col, o, c, R, tube, dir) {
  const g = new THREE.TorusGeometry(R, tube, 5, sg(18, 8)); const q = new THREE.Quaternion().setFromUnitVectors(_upZ, new THREE.Vector3(...dir).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...c), q, new THREE.Vector3(1, 1, 1))); return P(L, g, col, o);
}
export function ring(L, col, o, y, R, tube, tz = 1, x = 0, z = 0) { return P(L, new THREE.TorusGeometry(R, tube, 5, sg(30, 10)), col, o, [x, y, z], [PI / 2, 0, 0], [1, tz, 1]); }
export function profR(prof, y) { if (y <= prof[0][1]) return prof[0][0]; for (let i = 1; i < prof.length; i++) if (prof[i][1] >= y) { const a = prof[i - 1], b = prof[i]; return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1] || 1)); } return prof[prof.length - 1][0]; }
export function sliceP(prof, y0, y1, k = 1, flare = 0, steps = 8) { steps = Math.max(3, Math.round(steps * (LOW ? 0.7 : 1))); const pts = []; for (let i = 0; i <= steps; i++) { const y = lerp(y0, y1, i / steps); const t = (y1 - y) / (y1 - y0 || 1); pts.push([profR(prof, y) * k * (1 + flare * t * t), y]); } return pts; }
export function latheP(L, pts, col, o, seg = 24, ph0 = 0, phl = TAU, tz = 1) { return P(L, new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), sg(seg, 6), ph0, phl), col, o, [0, 0, 0], [0, 0, 0], [1, 1, tz]); }
export const dk = (c, k = 0.82) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
export function superHead(r, n = 2, jaw = 0, w = 26, h = 18) {
  let g = new THREE.SphereGeometry(1, sg(w), sg(h)); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const s = Math.pow(Math.abs(x) ** n + Math.abs(y) ** n + Math.abs(z) ** n, -1 / n); const jf = y < 0 ? 1 + jaw * (-y * s) : 1; p.setXYZ(i, x * s * r[0] * jf, y * s * r[1], z * s * r[2]); }
  g.computeVertexNormals(); return g;
}
// height-field surfaces for placing facial features
export function surfE(c, r, n = 2, jaw = 0) { return (x, y) => { const dy = (y - c[1]) / r[1]; const jf = dy < 0 ? 1 + jaw * (-dy) : 1; const ax = Math.abs((x - c[0]) / (r[0] * jf)) ** n, ay = Math.abs(dy) ** n; const t = 1 - ax - ay; return t <= 0 ? -9 : c[2] + r[2] * Math.pow(t, 1 / n); }; }
export function surfP(prof, tz = 1) { return (x, y) => { const r = profR(prof, y); return r * r - x * x <= 0 ? -9 : tz * Math.sqrt(r * r - x * x); }; }
export const surfU = (...fs) => (x, y) => Math.max(...fs.map(f => f(x, y)));
export function onS(H, x, y, out = 0) {
  const e = 0.006; const z = H(x, y); const dzx = (H(x + e, y) - H(x - e, y)) / (2 * e), dzy = (H(x, y + e) - H(x, y - e)) / (2 * e);
  const n = new THREE.Vector3(-clamp(dzx, -6, 6), -clamp(dzy, -6, 6), 1).normalize();
  return { p: [x + n.x * out, y + n.y * out, z + n.z * out], rx: -Math.asin(clamp(n.y, -1, 1)), ry: Math.atan2(n.x, n.z) };
}
export function feat(L, H, geo, col, o, x, y, out, s, rz = 0) { const q = onS(H, x, y, out); P(L, geo, col, o, q.p, new THREE.Euler(q.rx, q.ry, rz, 'YXZ'), s); return q; }
export const ARC = () => G('arcU', () => new THREE.TorusGeometry(1, 0.24, 4, 12, PI));
export function eyes(L, H, x, y, styles, k = 1, irisCol = '#2a1810') {
  const groups = {}; styles.forEach((st, v) => { groups[st] = (groups[st] || 0) | (1 << v); });
  for (const s of [-1, 1]) {
    const ex = s * x; const piv = onS(H, ex, y, 0).p;
    for (const [st, vm] of Object.entries(groups)) {
      const o1 = { j: 1, vm, ex: 1, piv };
      if (st === 'moon') { feat(L, H, ARC(), '#3a2418', { j: 1, vm }, ex, y - 0.01 * k, 0.004, [0.046 * k, 0.04 * k, 0.03 * k]); continue; }
      if (st === 'bean') {
        feat(L, H, SPH(12, 9), '#1d1411', o1, ex, y, -0.006, [0.04 * k, 0.054 * k, 0.026 * k]);
        feat(L, H, SPH(6, 5), '#ffffff', o1, ex + 0.012 * k, y + 0.02 * k, 0.014, [0.012 * k, 0.012 * k, 0.008 * k]);
      } else {
        feat(L, H, SPH(14, 10), '#1a100c', o1, ex, y, -0.008, [0.058 * k, 0.072 * k, 0.03 * k]);
        feat(L, H, SPH(12, 8), irisCol, o1, ex, y - 0.012 * k, 0.008, [0.044 * k, 0.048 * k, 0.018 * k]);
        feat(L, H, SPH(8, 6), '#ffffff', o1, ex + 0.018 * k, y + 0.024 * k, 0.02, [0.02 * k, 0.022 * k, 0.01 * k]);
        feat(L, H, SPH(6, 5), '#ffffff', o1, ex - 0.016 * k, y - 0.026 * k, 0.02, [0.01 * k, 0.01 * k, 0.006 * k]);
        if (st === 'lash') for (const [dx, dy, a] of [[0.05, 0.045, 0.7], [0.062, 0.022, 1.15]]) feat(L, H, SPH(6, 4), '#1a100c', o1, ex + s * dx * k, y + dy * k, 0.006, [0.026 * k, 0.007 * k, 0.008 * k], -s * a);
      }
      feat(L, H, ARC(), '#3a2418', { j: 1, vm, ex: 2, piv }, ex, y - 0.015 * k, 0.006, [0.048 * k, 0.044 * k, 0.03 * k]);
    }
    feat(L, H, SPH(6, 4), '#6a4a3a', { j: 1 }, ex + s * 0.01 * k, y + 0.105 * k, 0.004, [0.03 * k, 0.008 * k, 0.008 * k], -s * 0.15);
  }
}
export function blush(L, H, x, y, k = 1) { for (const s of [-1, 1]) feat(L, H, SPH(10, 6), '#f39a9a', { j: 1 }, s * x, y, 0.004, [0.062 * k, 0.04 * k, 0.014 * k]); }
export function smile(L, H, x, y, r, out = 0.006, col = '#4a2a20') { feat(L, H, ARC(), col, { j: 1 }, x, y, out, [r, r * 0.9, r * 0.6], PI); }
export function torso(L, S, col = null, o = { slot: 1 }) { const pr = S.prof; latheP(L, [[0.004, pr[0][1] - 0.035], ...pr, [0.004, pr[pr.length - 1][1] + 0.03]], col, o, 24, 0, TAU, S.tz); }
export function arms(L, S, { r, paw, pawSlot = 1, sleeves = [], pawCol = null }) {
  let furVm = 7; for (const sl of sleeves) furVm &= ~sl.vm;
  for (const s of [1, -1]) {
    const ju = s > 0 ? 5 : 6, jl = s > 0 ? 11 : 12;
    const sh = [s * S.sh[0], S.sh[1], S.sh[2]], el = [s * S.el[0], S.el[1], S.el[2]], hd = [s * S.hand[0], S.hand[1], S.hand[2]];
    if (furVm) { capAB(L, null, { j: ju, slot: 1, vm: furVm, piv: sh }, sh, el, r); capAB(L, null, { j: jl, slot: 1, vm: furVm, piv: el }, el, hd, r * 0.94); }
    for (const sl of sleeves) {
      const cuffP = [lerp(el[0], hd[0], 0.62), lerp(el[1], hd[1], 0.62), lerp(el[2], hd[2], 0.62)];
      capAB(L, sl.col, { j: ju, fab: sl.fab, vm: sl.vm, piv: sh }, sh, el, r + 0.016);
      capAB(L, sl.col, { j: jl, fab: sl.fab, vm: sl.vm, piv: el }, el, cuffP, r + 0.014);
      capAB(L, null, { j: jl, slot: 1, vm: sl.vm, piv: el }, cuffP, hd, r * 0.94);
      ringAxis(L, sl.cuff || sl.col, { j: jl, fab: sl.fab, vm: sl.vm, piv: el }, cuffP, r + 0.016, sl.fab === 2 ? 0.026 : 0.014, [hd[0] - el[0], hd[1] - el[1], hd[2] - el[2]]);
    }
    P(L, SPH(12, 9), pawCol, { j: jl, slot: pawCol ? 0 : pawSlot, piv: el }, hd, [0, 0, 0], [paw, paw * 0.95, paw]);
  }
}
export function legsM(L, S, { hx, hipY, r, footY = 0.05, foot, footSlot = 1, pants = [], footCol = null }) {
  for (const s of [1, -1]) {
    const j = s > 0 ? 7 : 8; const piv = [s * hx, hipY, 0];
    capAB(L, null, { j, slot: 1, piv }, [s * hx, hipY, 0], [s * hx, footY + foot[1] * 0.6, 0.0], r);
    P(L, SPH(14, 9), footCol, { j, slot: footCol ? 0 : footSlot, piv }, [s * hx, footY, foot[2] * 0.3], [0, 0, 0], foot);
    for (const pn of pants) {
      P(L, new THREE.CylinderGeometry(r + 0.028, r + 0.034, pn.y1 - pn.y0, 14, 1, true), pn.col, { j, vm: pn.vm, fab: 1, piv }, [s * hx, (pn.y0 + pn.y1) / 2, 0]);
      ring(L, pn.cuff || pn.col, { j, vm: pn.vm, fab: 1, piv }, pn.y0 + 0.012, r + 0.036, 0.026, 1, s * hx, 0);
    }
  }
}
export function legsBird(L, { hx, hipY, r = 0.03, col = '#f08a2e', webbed = false, toe = 0.11 }) {
  for (const s of [1, -1]) {
    const j = s > 0 ? 7 : 8; const piv = [s * hx, hipY, 0];
    capAB(L, col, { j, piv }, [s * hx, hipY, 0], [s * hx, 0.04, 0.01], r, 8);
    if (webbed) {
      const sh = new THREE.Shape(); sh.moveTo(0, -0.02); sh.lineTo(-0.1, 0.16); sh.quadraticCurveTo(-0.05, 0.2, 0, 0.17); sh.quadraticCurveTo(0.05, 0.2, 0.1, 0.16); sh.lineTo(0, -0.02);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 6 }); g.rotateX(PI / 2); g.translate(0, 0.05, 0);
      P(L, g, col, { j, piv }, [s * hx, 0, -0.02], [0, s * 0.12, 0]);
    } else for (const a of [-0.45, 0, 0.45]) capAB(L, col, { j, piv }, [s * hx, 0.025, 0.02], [s * hx + Math.sin(a) * toe, 0.022, 0.02 + Math.cos(a) * toe], 0.022, 6);
  }
}
export function straps(L, S, { vm, col, fab = 1, yBib, yWaist, bx, k, button = '#c9a25a', side = false }) {
  const prof = S.prof, tz = S.tz; const O = { vm, fab };
  const zAt = (y, x, kk = k) => Math.sqrt(Math.max(0.0004, (profR(prof, y) * kk) ** 2 - x * x)) * tz;
  let yTop = yBib; for (let y = yBib; y < yBib + 0.6; y += 0.004) { yTop = y; if (profR(prof, y) * k < bx + 0.025) break; }
  for (const s of [-1, 1]) {
    const yMid = (yBib + yTop) / 2;
    if (side) { const yS = yBib - 0.01; const rS = profR(prof, yS) * (k + 0.03); const pts = []; for (let i = 0; i <= 8; i++) { const a = lerp(Math.asin(clamp(bx / rS, 0, 1)), 1.3, i / 8); const y = yS + 0.07 * (i / 8); const rr = profR(prof, y) * (k + 0.03); pts.push(new THREE.Vector3(s * Math.sin(a) * rr, y, Math.cos(a) * rr * tz)); }
      P(L, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.022, 5), col, O); if (button) P(L, SPH(8, 6), button, { vm }, [s * bx, yBib - 0.022, zAt(yBib - 0.022, bx, k + 0.03) + 0.006], [0, 0, 0], [0.022, 0.022, 0.012]); continue; }
    const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(s * bx, yBib - 0.02, zAt(yBib, bx, k + 0.02)), new THREE.Vector3(s * bx, yMid, zAt(yMid, bx, k + 0.03)), new THREE.Vector3(s * bx, yTop + 0.012, 0), new THREE.Vector3(s * bx * 1.08, yMid, -zAt(yMid, bx * 1.08, k + 0.03)), new THREE.Vector3(s * bx * 1.15, yWaist, -zAt(yWaist, bx * 1.15, k + 0.02))]);
    P(L, new THREE.TubeGeometry(cv, 16, 0.024, 5), col, O, [0, 0, 0], [0, 0, 0], [1, 1, 1]);
    if (button) P(L, SPH(8, 6), button, { vm }, [s * bx, yBib - 0.022, zAt(yBib - 0.022, bx, k + 0.03) + 0.006], [0, 0, 0], [0.022, 0.022, 0.012]);
  }
}
export function overalls(L, S, { vm, col, yLow, yWaist, yBib, bx = 0.1, w = 0.6, k = 1.045, pocket = true, side = false }) {
  const prof = S.prof, tz = S.tz; const O = { vm, fab: 1 };
  latheP(L, sliceP(prof, yLow, yWaist, k), col, O, 26, 0, TAU, tz);
  latheP(L, sliceP(prof, yWaist - 0.02, yBib, k + 0.012, 0, 6), col, O, 10, -w, 2 * w, tz);
  ring(L, dk(col, 0.88), O, yWaist, profR(prof, yWaist) * (k + 0.012), 0.016, tz);
  ring(L, dk(col, 0.9), O, yLow + 0.012, profR(prof, yLow) * k + 0.008, 0.02, tz);
  straps(L, S, { vm, col, yBib, yWaist, bx, k, side });
  if (pocket) { const y = lerp(yWaist, yBib, 0.45); P(L, new THREE.BoxGeometry(1, 1, 1), dk(col, 0.9), O, [0, y, profR(prof, y) * (k + 0.014) * tz + 0.004], [0, 0, 0], [bx * 1.25, (yBib - yWaist) * 0.38, 0.014]); }
}
export function apron(L, S, { vm, col, yHem, yWaist, yBib, w = 0.95, k = 1.06, flare = 0.15, bx = 0.1, tie = null, pocket = true }) {
  const prof = S.prof, tz = S.tz; const O = { vm, fab: 1 };
  latheP(L, sliceP(prof, yHem, yWaist, k, flare), col, O, 14, -w, 2 * w, tz);
  latheP(L, sliceP(prof, yWaist - 0.01, yBib, k + 0.01, 0, 6), col, O, 10, -w * 0.55, w * 1.1, tz);
  ring(L, tie || dk(col, 0.85), O, yWaist, profR(prof, yWaist) * (k + 0.02), 0.022, tz);
  const zb = -profR(prof, yWaist) * (k + 0.02) * tz;
  for (const s of [-1, 1]) { P(L, SPH(10, 8), tie || dk(col, 0.85), O, [s * 0.06, yWaist + 0.01, zb - 0.02], [0, 0, s * 0.5], [0.06, 0.04, 0.025]); P(L, SPH(8, 6), tie || dk(col, 0.85), O, [s * 0.035, yWaist - 0.07, zb - 0.015], [0, 0, s * 0.25], [0.022, 0.07, 0.015]); }
  straps(L, S, { vm, col, yBib, yWaist, bx, k: k + 0.01, button: null });
  const r0 = profR(prof, yHem) * k * (1 + flare);
  P(L, new THREE.TorusGeometry(r0, 0.016, 5, 16, 2 * w), dk(col, 0.9), O, [0, yHem + 0.008, 0], [PI / 2, 0, PI / 2 - w], [1, tz, 1]);
  if (pocket) { const y = lerp(yHem, yWaist, 0.55); P(L, new THREE.BoxGeometry(1, 1, 1), dk(col, 0.9), O, [0.03, y, profR(prof, y) * (k + 0.01) * (1 + flare * 0.2) * tz + 0.01], [0, 0, 0], [0.13, 0.1, 0.014]); }
}
export function bodice(L, S, { vm, col, fab = 1, y0, y1, k = 1.03, collar = null, buttons = 0, btn = '#f5efe2' }) {
  const prof = S.prof, tz = S.tz;
  latheP(L, sliceP(prof, y0, y1, k), col, { vm, fab }, 24, 0, TAU, tz);
  if (collar) for (const s of [-1, 1]) P(L, SPH(10, 6), collar, { vm, fab: 1 }, [s * 0.05, y1 - 0.01, profR(prof, y1) * k * tz * 0.95], [0.3, s * 0.4, s * 0.3], [0.065, 0.025, 0.045]);
  for (let i = 0; i < buttons; i++) { const y = y1 - 0.06 - i * 0.07; P(L, SPH(6, 5), btn, { vm }, [0, y, profR(prof, y) * k * tz + 0.006], [0, 0, 0], [0.016, 0.016, 0.01]); }
}
export function skirt(L, S, { vm, col, fab = 1, yHem, yWaist, k = 1.05, flare = 0.4, hem = null }) {
  const prof = S.prof, tz = S.tz;
  latheP(L, sliceP(prof, yHem, yWaist, k, flare), col, { vm, fab }, 26, 0, TAU, tz);
  ring(L, hem || dk(col, 0.9), { vm, fab }, yHem + 0.012, profR(prof, yHem) * k * (1 + flare) + 0.004, 0.02, tz);
}
export function sweater(L, S, { vm, col, yHem, yNeck, k = 1.07, turtle = true }) {
  const prof = S.prof, tz = S.tz; const O = { vm, fab: 2 };
  latheP(L, sliceP(prof, yHem, yNeck, k), col, O, 26, 0, TAU, tz);
  ring(L, col, O, yHem + 0.02, profR(prof, yHem) * k + 0.01, 0.036, tz);
  const rn = profR(prof, yNeck) * k; ring(L, col, O, yNeck, rn + 0.02, 0.045, tz); if (turtle) ring(L, col, O, yNeck + 0.055, rn + 0.005, 0.042, tz);
}
export function vest(L, S, { vm, col, yHem, yTop, gap = 0.42, k = 1.07, btn = '#6b4a2a' }) {
  const prof = S.prof, tz = S.tz; const O = { vm, fab: 1 };
  latheP(L, sliceP(prof, yHem, yTop, k, 0.04), col, O, 24, gap, TAU - 2 * gap, tz);
  for (let i = 0; i < 3; i++) { const y = lerp(yHem, yTop, 0.2 + i * 0.22); const r = profR(prof, y) * k; P(L, SPH(6, 5), btn, { vm }, [Math.sin(gap) * r + 0.005, y, Math.cos(gap) * r * tz + 0.01], [0, 0, 0], [0.018, 0.018, 0.012]); }
  for (const s of [-1, 1]) { const y = lerp(yHem, yTop, 0.25); const a = s * (gap + 0.45); const r = profR(prof, y) * (k + 0.012); P(L, new THREE.BoxGeometry(1, 1, 1), dk(col, 0.88), O, [Math.sin(a) * r, y, Math.cos(a) * r * tz], [0, a, 0], [0.1, 0.05, 0.012]); }
}
export function bandana(L, S, { vm, col, y, k = 1.04 }) {
  const prof = S.prof, tz = S.tz; const r = profR(prof, y) * k; const O = { vm, fab: 1 };
  latheP(L, sliceP(prof, y - 0.035, y + 0.03, k + 0.03, 0, 3), col, O, 26, 0, TAU, tz); ring(L, dk(col, 0.9), O, y - 0.035, profR(prof, y - 0.035) * (k + 0.03), 0.012, tz);
  const zf = r * tz; P(L, new THREE.ConeGeometry(0.12, 0.17, 3), col, O, [0, y - 0.08, zf * 0.97 + 0.01], [PI, PI / 6, 0], [1, 1, 0.3]);
  P(L, SPH(8, 6), col, O, [r * 0.62, y + 0.01, zf * 0.72], [0, 0, 0], [0.04, 0.035, 0.035]);
  for (const a of [-0.5, 0.4]) P(L, SPH(8, 6), col, O, [r * 0.72, y - 0.03, zf * 0.62], [0, 0, a], [0.06, 0.022, 0.02]);
}
export function carryBox(L, S, k = 1) {
  const piv = [0, S.chestY, S.chestZ]; const o = { j: 13, piv };
  P(L, new THREE.BoxGeometry(1, 1, 1), '#c9a06a', o, piv, [0, 0, 0], [0.26 * k, 0.2 * k, 0.2 * k]);
  P(L, new THREE.BoxGeometry(1, 1, 1), '#8a6a44', o, piv, [0, 0, 0], [0.268 * k, 0.21 * k, 0.025 * k]);
  P(L, new THREE.BoxGeometry(1, 1, 1), '#8a6a44', o, piv, [0, 0, 0], [0.025 * k, 0.21 * k, 0.208 * k]);
  P(L, SPH(6, 4), '#8a6a44', o, [0, S.chestY + 0.11 * k, S.chestZ], [0, 0, 0], [0.04 * k, 0.02 * k, 0.03 * k]);
}
export function wateringCan(L, S) {
  const H = [-S.hand[0], S.hand[1], S.hand[2]]; const k = S.canK; const o = { j: 10, piv: H };
  P(L, new THREE.CylinderGeometry(0.11 * k, 0.13 * k, 0.2 * k, 12), '#5aa9e6', o, [H[0], H[1] - 0.1 * k, H[2] + 0.1 * k]);
  P(L, new THREE.CylinderGeometry(0.022 * k, 0.03 * k, 0.3 * k, 6), '#5aa9e6', o, [H[0], H[1] - 0.04 * k, H[2] + 0.3 * k], [1.0, 0, 0]);
  P(L, new THREE.CylinderGeometry(0.055 * k, 0.028 * k, 0.05 * k, 8), '#3f8fd0', o, [H[0], H[1] + 0.06 * k, H[2] + 0.42 * k], [1.0, 0, 0]);
  P(L, new THREE.TorusGeometry(0.085 * k, 0.02 * k, 6, 12, PI), '#3f8fd0', o, [H[0], H[1], H[2] + 0.08 * k], [0, PI / 2, 0]);
  S.spout = new THREE.Vector3(H[0], H[1] + 0.08 * k, H[2] + 0.46 * k);
}

// ---------------------------------------------------------------- species sculpts
export const BLUE = '#5b7ea8', SHIRT = '#f1e7d2';
export const SPECIES_BUILD = {
  chick(L, S) {
    const y0 = 0.1, H = 0.86, R0 = 0.37, kk = 0.2; const prof = [];
    for (let i = 1; i < 24; i++) { const th = i / 24 * PI; prof.push([R0 * Math.sin(th) * (1 + kk * Math.cos(th)), y0 + H * (1 - Math.cos(th)) / 2]); }
    Object.assign(S, { prof, tz: 1, neck: [0, 0.5, 0], sh: [0.31, 0.56, 0], el: [0.31, 0.56, 0], hand: [0.4, 0.28, 0.06], top: 1.08, chestY: 0.5, canK: 0.8 });
    latheP(L, [[0.004, y0], ...prof, [0.004, y0 + H]], null, { slot: 1 }, 30);
    const HD = surfP(prof);
    for (const [tx, ty, tz] of [[-0.075, 1.04, 0.02], [0, 1.08, 0], [0.075, 1.04, -0.02]]) capAB(L, null, { j: 1, slot: 3 }, [0, 0.93, 0], [tx, ty, tz], 0.03, 8);
    eyes(L, HD, 0.135, 0.665, ['bean', 'lash', 'moon'], 0.95);
    const cone = G('beakCone', () => new THREE.ConeGeometry(0.07, 0.13, 12).rotateX(PI / 2));
    feat(L, HD, cone, '#f2892e', { j: 1 }, 0, 0.59, 0.05, [1.3, 0.85, 1]);
    feat(L, HD, cone, '#d9702a', { j: 1 }, 0, 0.555, 0.03, [0.95, 0.6, 0.7]);
    blush(L, HD, 0.22, 0.565);
    for (const s of [1, -1]) P(L, SPH(12, 9), null, { j: s > 0 ? 5 : 6, slot: 3, piv: [s * 0.31, 0.56, 0] }, [s * 0.36, 0.43, 0.0], [0, 0, s * 0.22], [0.062, 0.2, 0.14]);
    legsBird(L, { hx: 0.12, hipY: 0.17, r: 0.028 });
    for (const a of [-0.45, 0, 0.45]) P(L, SPH(8, 6), null, { j: 9, slot: 3, piv: [0, 0.36, -0.34] }, [Math.sin(a) * 0.06, 0.4 + Math.cos(a) * 0.04, -0.38], [0.6, 0, a], [0.04, 0.09, 0.025]);
    S.chestZ = profR(prof, 0.5) + 0.12;
    // v0 blue overalls
    overalls(L, S, { vm: 1, col: '#4f78b5', yLow: 0.13, yWaist: 0.38, yBib: 0.56, bx: 0.12, w: 0.62, k: 1.04, side: true });
    for (const s of [1, -1]) { const j = s > 0 ? 7 : 8; P(L, new THREE.CylinderGeometry(0.075, 0.08, 0.07, 14, 1, true), '#4f78b5', { j, vm: 1, fab: 1, piv: [s * 0.12, 0.17, 0] }, [s * 0.12, 0.13, 0]); ring(L, '#45689c', { j, vm: 1, fab: 1, piv: [s * 0.12, 0.17, 0] }, 0.1, 0.082, 0.02, 1, s * 0.12, 0); }
    // v1 rust pinafore skirt
    skirt(L, S, { vm: 2, col: '#c0664a', yHem: 0.14, yWaist: 0.44, k: 1.05, flare: 0.14 });
    latheP(L, sliceP(prof, 0.43, 0.58, 1.055, 0, 6), '#c0664a', { vm: 2, fab: 1 }, 10, -0.5, 1.0); straps(L, S, { vm: 2, col: '#c0664a', yBib: 0.58, yWaist: 0.44, bx: 0.11, k: 1.055, button: '#f3e6cc', side: true });
    P(L, new THREE.BoxGeometry(1, 1, 1), '#a95a40', { vm: 2, fab: 1 }, [0.08, 0.27, profR(prof, 0.27) * 1.1 + 0.005], [0, 0.15, 0], [0.12, 0.09, 0.014]);
    // v2 green neckerchief
    bandana(L, S, { vm: 4, col: '#7c9a6a', y: 0.6, k: 1.03 });
    carryBox(L, S, 0.85); wateringCan(L, S);
    S.pal = [['#f8cf45', '#fde9a0', '#f4c23a'], ['#f5e2b2', '#fff2d8', '#efd49a'], ['#efb53a', '#fbdc8c', '#e3a432']];
  },
  rabbit(L, S) {
    const prof = [[0.15, 0.18], [0.21, 0.24], [0.245, 0.34], [0.25, 0.46], [0.235, 0.6], [0.2, 0.74], [0.155, 0.86], [0.11, 0.96]];
    Object.assign(S, { prof, tz: 0.88, neck: [0, 0.98, 0], sh: [0.19, 0.85, 0], el: [0.25, 0.63, 0.02], hand: [0.27, 0.43, 0.06], top: 1.66, chestY: 0.66, canK: 0.9 });
    torso(L, S);
    const HC = [0, 1.3, 0.02], HR = [0.25, 0.32, 0.24];
    P(L, SPH(26, 20), null, { j: 1, slot: 1 }, HC, [0, 0, 0], HR);
    for (const s of [-1, 1]) P(L, SPH(14, 10), null, { j: 1, slot: 1 }, [s * 0.11, 1.17, 0.1], [0, 0, 0], [0.155, 0.135, 0.15]);
    const HD = surfU(surfE(HC, HR), surfE([0.11, 1.17, 0.1], [0.155, 0.135, 0.15]), surfE([-0.11, 1.17, 0.1], [0.155, 0.135, 0.15]));
    for (const s of [-1, 1]) feat(L, HD, SPH(12, 9), null, { j: 1, slot: 2 }, s * 0.038, 1.165, 0.012, [0.058, 0.046, 0.04]);
    feat(L, HD, SPH(10, 8), '#f09aa6', { j: 1 }, 0, 1.21, 0.03, [0.032, 0.022, 0.022]);
    for (const s of [-1, 1]) feat(L, HD, G('box1', () => new THREE.BoxGeometry(1, 1, 1)), '#ffffff', { j: 1 }, s * 0.017, 1.112, 0.03, [0.03, 0.046, 0.016]);
    eyes(L, HD, 0.115, 1.3, ['big', 'bean', 'lash'], 1.0);
    blush(L, HD, 0.17, 1.17);
    for (const s of [1, -1]) {
      const j = s > 0 ? 3 : 4; const piv = [s * 0.1, 1.56, -0.02];
      P(L, SPH(14, 12), null, { j, slot: 3, piv }, [s * 0.11, 1.85, -0.02], [0, 0, -s * 0.05], [0.078, 0.31, 0.046]);
      P(L, SPH(12, 10), '#f2a9b0', { j, piv }, [s * 0.11, 1.84, 0.014], [0, 0, -s * 0.05], [0.048, 0.25, 0.02]);
    }
    feat(L, HD, SPH(12, 8), '#d9a874', { j: 1, vm: 4 }, 0.12, 1.43, -0.01, [0.13, 0.11, 0.05], 0.4);
    P(L, SPH(12, 8), '#d9a874', { j: 4, vm: 4, piv: [-0.1, 1.56, -0.02] }, [-0.115, 1.98, -0.02], [0, 0, 0.05], [0.07, 0.15, 0.05]);
    arms(L, S, { r: 0.058, paw: 0.066, pawSlot: 2, sleeves: [{ vm: 2, col: SHIRT, fab: 1 }, { vm: 4, col: '#c9716a', fab: 1, cuff: '#fff4e6' }] });
    legsM(L, S, { hx: 0.1, hipY: 0.24, r: 0.07, footY: 0.05, foot: [0.078, 0.056, 0.15], footSlot: 2, pants: [{ vm: 2, col: BLUE, y0: 0.12, y1: 0.27 }] });
    P(L, SPH(10, 8), null, { j: 9, slot: 2, piv: [0, 0.32, -0.2] }, [0, 0.32, -0.245], [0, 0, 0], [0.085, 0.08, 0.08]);
    S.chestZ = profR(prof, 0.66) * 0.88 + 0.15;
    apron(L, S, { vm: 1, col: '#8fa877', yHem: 0.19, yWaist: 0.56, yBib: 0.8, w: 1.0, k: 1.06, flare: 0.22, bx: 0.1, tie: '#a8b88a' });
    bodice(L, S, { vm: 2, col: SHIRT, y0: 0.45, y1: 0.95, k: 1.025, collar: '#fbf6ec' });
    overalls(L, S, { vm: 2, col: BLUE, yLow: 0.17, yWaist: 0.5, yBib: 0.74, bx: 0.1, w: 0.6 });
    bodice(L, S, { vm: 4, col: '#c9716a', y0: 0.5, y1: 0.95, k: 1.03, collar: '#fff4e6', buttons: 3 });
    skirt(L, S, { vm: 4, col: '#c9716a', yHem: 0.15, yWaist: 0.56, k: 1.04, flare: 0.5, hem: '#fff4e6' });
    carryBox(L, S, 0.95); wateringCan(L, S);
    S.pal = [['#f4ece0', '#fffaf3', '#f4ece0'], ['#a99c90', '#efe6da', '#a99c90'], ['#f6eee2', '#fffaf3', '#f6eee2']];
  },
  cat(L, S) {
    const prof = [[0.14, 0.17], [0.19, 0.24], [0.21, 0.34], [0.205, 0.46], [0.185, 0.58], [0.155, 0.7], [0.12, 0.8]];
    Object.assign(S, { prof, tz: 0.9, neck: [0, 0.82, 0], sh: [0.17, 0.72, 0], el: [0.215, 0.52, 0.02], hand: [0.225, 0.33, 0.05], top: 1.5, chestY: 0.58, canK: 0.85 });
    torso(L, S);
    const HC = [0, 1.08, 0], HR = [0.36, 0.27, 0.29];
    P(L, superHead(HR, 2.7, 0.06), null, { j: 1, slot: 1 }, HC);
    for (const s of [-1, 1]) P(L, SPH(14, 10), null, { j: 1, slot: 2 }, [s * 0.2, 0.97, 0.1], [0, 0, 0], [0.17, 0.13, 0.16]);
    P(L, SPH(14, 10), null, { j: 1, slot: 2 }, [0, 0.98, 0.14], [0, 0, 0], [0.18, 0.13, 0.15]);
    const HD = surfU(surfE(HC, HR, 2.7, 0.06), surfE([0.2, 0.97, 0.1], [0.17, 0.13, 0.16]), surfE([-0.2, 0.97, 0.1], [0.17, 0.13, 0.16]), surfE([0, 0.98, 0.14], [0.18, 0.13, 0.15]));
        for (const s of [-1, 1]) feat(L, HD, SPH(10, 8), null, { j: 1, slot: 2 }, s * 0.03, 1.0, 0.008, [0.045, 0.034, 0.03]);
    feat(L, HD, SPH(8, 6), '#f29aa6', { j: 1 }, 0, 1.037, 0.018, [0.026, 0.018, 0.016]);
    for (const s of [-1, 1]) smile(L, HD, s * 0.023, 0.982, 0.022, 0.01);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const a = onS(HD, s * 0.13, 1.0 + k * 0.022, 0.004).p; capAB(L, '#5a4a48', { j: 1 }, a, [s * 0.29, 0.99 + k * 0.04, a[2] - 0.05], 0.0045, 4); }
    eyes(L, HD, 0.15, 1.1, ['lash', 'bean', 'big'], 1.18);
    blush(L, HD, 0.22, 1.0);
    for (const s of [1, -1]) {
      const j = s > 0 ? 3 : 4; const piv = [s * 0.2, 1.3, -0.02];
      P(L, G('earCone', () => new THREE.ConeGeometry(0.13, 0.23, 14)), null, { j, slot: 3, piv }, [s * 0.23, 1.39, -0.03], [0, 0, -s * 0.32], [1, 1, 0.55]);
      P(L, G('earCone2', () => new THREE.ConeGeometry(0.08, 0.16, 10)), '#f2a9b0', { j, piv }, [s * 0.225, 1.375, 0.005], [0, 0, -s * 0.32], [1, 1, 0.3]);
    }
    const tc = new THREE.CatmullRomCurve3([[0, 0.3, -0.16], [0.05, 0.3, -0.38], [0.1, 0.55, -0.5], [0.04, 0.82, -0.44], [-0.04, 0.9, -0.33]].map(p => new THREE.Vector3(...p)));
    P(L, taperTube(tc, 22, 0.045, 0.034, 8), null, { j: 9, slot: 1, piv: [0, 0.3, -0.16] });
    P(L, SPH(8, 6), null, { j: 9, slot: 1, piv: [0, 0.3, -0.16] }, [-0.04, 0.9, -0.33], [0, 0, 0], [0.034, 0.034, 0.034]);
    arms(L, S, { r: 0.05, paw: 0.058, pawSlot: 2, sleeves: [{ vm: 1, col: '#c4685a', fab: 1, cuff: '#c4685a' }, { vm: 2, col: '#9cb08a', fab: 2 }, { vm: 4, col: SHIRT, fab: 1 }] });
    legsM(L, S, { hx: 0.085, hipY: 0.22, r: 0.062, footY: 0.045, foot: [0.07, 0.05, 0.11], footSlot: 2, pants: [{ vm: 4, col: BLUE, y0: 0.11, y1: 0.25 }] });
    S.chestZ = profR(prof, 0.58) * 0.9 + 0.14;
    bodice(L, S, { vm: 1, col: '#c4685a', y0: 0.45, y1: 0.8, k: 1.04, collar: '#fbf3e6', buttons: 2 });
    skirt(L, S, { vm: 1, col: '#c4685a', yHem: 0.13, yWaist: 0.47, k: 1.04, flare: 0.62, hem: '#e3c9a8' });
    sweater(L, S, { vm: 2, col: '#9cb08a', yHem: 0.2, yNeck: 0.79, k: 1.08, turtle: false });
    bodice(L, S, { vm: 4, col: SHIRT, y0: 0.42, y1: 0.8, k: 1.025, collar: '#fbf6ec' });
    overalls(L, S, { vm: 4, col: BLUE, yLow: 0.16, yWaist: 0.44, yBib: 0.65, bx: 0.09, w: 0.6 });
    carryBox(L, S, 0.9); wateringCan(L, S);
    S.pal = [['#9a9496', '#f3eee6', '#9a9496'], ['#e3a262', '#f7ecd8', '#e3a262'], ['#55504f', '#f3eee6', '#55504f']];
  },
  dog(L, S) {
    const prof = [[0.2, 0.21], [0.27, 0.29], [0.3, 0.41], [0.295, 0.55], [0.27, 0.68], [0.23, 0.8], [0.17, 0.93]];
    Object.assign(S, { prof, tz: 0.88, neck: [0, 0.98, 0], sh: [0.255, 0.83, 0], el: [0.32, 0.6, 0.03], hand: [0.335, 0.4, 0.07], top: 1.6, chestY: 0.7, canK: 1.0 });
    torso(L, S);
    const HC = [0, 1.3, 0], HR = [0.29, 0.27, 0.27];
    P(L, superHead(HR, 2.4), null, { j: 1, slot: 1 }, HC);
    P(L, G('muzzleCap', () => new THREE.CapsuleGeometry(0.12, 0.14, 4, 14).rotateX(PI / 2)), null, { j: 1, slot: 2 }, [0, 1.18, 0.22], [0, 0, 0], [1.15, 0.92, 1]);
    const HD = surfU(surfE(HC, HR, 2.4), surfE([0, 1.18, 0.22], [0.138, 0.11, 0.19]));
    P(L, SPH(14, 10), '#3b2a22', { j: 1 }, [0, 1.245, 0.4], [0.2, 0, 0], [0.085, 0.062, 0.06]);
    P(L, SPH(6, 4), '#ffffff', { j: 1 }, [0.03, 1.27, 0.445], [0, 0, 0], [0.022, 0.012, 0.01]);
    for (const s of [-1, 1]) P(L, ARC(), '#3b2a22', { j: 1 }, [s * 0.04, 1.125, 0.385], [0.35, s * 0.15, PI], [0.04, 0.034, 0.025]);
    capAB(L, '#3b2a22', { j: 1 }, [0, 1.19, 0.42], [0, 1.14, 0.405], 0.006, 4);
    P(L, SPH(12, 8), '#f07a7a', { j: 1, ex: 2, piv: [0, 1.11, 0.39] }, [0, 1.1, 0.39], [0.4, 0, 0], [0.04, 0.05, 0.02]);
    feat(L, HD, SPH(10, 8), null, { j: 1, slot: 2 }, 0, 1.45, -0.02, [0.05, 0.09, 0.045]);
    eyes(L, HD, 0.125, 1.335, ['bean', 'big', 'lash'], 1.0);
    blush(L, HD, 0.19, 1.25);
    feat(L, HD, SPH(12, 8), '#c88a4e', { j: 1, vm: 1 }, -0.13, 1.37, -0.02, [0.1, 0.09, 0.05]);
    for (const [x, y] of [[0.16, 1.47], [-0.08, 1.5]]) feat(L, HD, SPH(10, 6), '#8d8a8c', { j: 1, vm: 4 }, x, y, -0.02, [0.07, 0.06, 0.04]);
    for (const s of [1, -1]) { const j = s > 0 ? 3 : 4; const piv = [s * 0.25, 1.49, 0]; P(L, SPH(14, 12), null, { j, slot: 3, piv }, [s * 0.32, 1.25, 0.0], [0, 0, s * 0.13], [0.1, 0.27, 0.058]); }
    const tc = new THREE.CatmullRomCurve3([[0, 0.42, -0.24], [0, 0.55, -0.38], [0.02, 0.72, -0.43]].map(p => new THREE.Vector3(...p)));
    P(L, taperTube(tc, 12, 0.05, 0.036, 8), null, { j: 9, slot: 1, piv: [0, 0.42, -0.24] });
    P(L, SPH(8, 6), null, { j: 9, slot: 2, piv: [0, 0.42, -0.24] }, [0.02, 0.73, -0.43], [0, 0, 0], [0.042, 0.05, 0.042]);
    arms(L, S, { r: 0.072, paw: 0.085, pawSlot: 2, sleeves: [{ vm: 2, col: SHIRT, fab: 1 }, { vm: 4, col: '#c4654f', fab: 2 }] });
    legsM(L, S, { hx: 0.13, hipY: 0.28, r: 0.088, footY: 0.06, foot: [0.1, 0.07, 0.15], footSlot: 2, pants: [{ vm: 1, col: '#5f8f95', y0: 0.11, y1: 0.31 }] });
    S.chestZ = profR(prof, 0.7) * 0.88 + 0.16;
    overalls(L, S, { vm: 1, col: '#5f8f95', yLow: 0.2, yWaist: 0.52, yBib: 0.78, bx: 0.14, w: 0.62 });
    bandana(L, S, { vm: 1, col: '#c9573f', y: 0.91, k: 1.05 });
    bodice(L, S, { vm: 2, col: SHIRT, y0: 0.45, y1: 0.93, k: 1.025, collar: '#fbf6ec' });
    apron(L, S, { vm: 2, col: '#d1a24a', yHem: 0.18, yWaist: 0.54, yBib: 0.8, w: 1.0, k: 1.06, flare: 0.25, bx: 0.13 });
    sweater(L, S, { vm: 4, col: '#c4654f', yHem: 0.24, yNeck: 0.92, k: 1.07 });
    carryBox(L, S, 1.05); wateringCan(L, S);
    S.pal = [['#f1e2c6', '#fff6e6', '#c88a4e'], ['#6e4632', '#f3e5cf', '#553424'], ['#eeedea', '#ffffff', '#7d7a7c']];
  },
  duck(L, S) {
    const prof = [[0.2, 0.17], [0.3, 0.25], [0.335, 0.37], [0.32, 0.5], [0.27, 0.62], [0.2, 0.72], [0.13, 0.8]];
    Object.assign(S, { prof, tz: 0.95, neck: [0, 0.96, 0.02], sh: [0.27, 0.62, 0], el: [0.27, 0.62, 0], hand: [0.37, 0.3, 0.06], top: 1.44, chestY: 0.52, canK: 0.9 });
    torso(L, S);
    capAB(L, null, { slot: 1 }, [0, 0.74, 0.0], [0, 1.0, 0.03], 0.1, 12);
    const HC = [0, 1.15, 0.03], HR = [0.2, 0.19, 0.19];
    P(L, SPH(22, 16), null, { j: 1, slot: 3 }, HC, [0, 0, 0], HR);
    const HD = surfE(HC, HR);
    for (const [tx, ty, tz] of [[-0.035, 1.42, -0.03], [0.03, 1.41, 0.01]]) capAB(L, null, { j: 1, slot: 3 }, [0, 1.31, 0.0], [tx, ty, tz], 0.026, 8);
    P(L, SPH(18, 10), '#f39b40', { j: 1 }, [0, 1.085, 0.22], [0.1, 0, 0], [0.155, 0.045, 0.14]);
    P(L, SPH(16, 8), '#e5852f', { j: 1 }, [0, 1.048, 0.2], [0.05, 0, 0], [0.125, 0.032, 0.11]);
    eyes(L, HD, 0.1, 1.185, ['moon', 'big', 'bean'], 0.92);
    blush(L, HD, 0.14, 1.1, 0.9);
    for (const s of [1, -1]) P(L, SPH(12, 9), null, { j: s > 0 ? 5 : 6, slot: 1, piv: [s * 0.27, 0.62, 0] }, [s * 0.335, 0.45, -0.02], [0, 0, s * 0.2], [0.07, 0.22, 0.16]);
    P(L, G('duckTail', () => new THREE.ConeGeometry(0.12, 0.24, 10)), null, { j: 9, slot: 1, piv: [0, 0.4, -0.27] }, [0, 0.47, -0.36], [-1.0, 0, 0], [1, 1, 0.45]);
    legsBird(L, { hx: 0.11, hipY: 0.19, r: 0.032, webbed: true });
    S.chestZ = profR(prof, 0.52) * 0.95 + 0.14;
    vest(L, S, { vm: 1, col: '#c99a47', yHem: 0.3, yTop: 0.75, gap: 0.42, k: 1.07 });
    apron(L, S, { vm: 2, col: '#8fa877', yHem: 0.2, yWaist: 0.5, yBib: 0.7, w: 0.95, k: 1.06, flare: 0.12, bx: 0.11 });
    overalls(L, S, { vm: 4, col: BLUE, yLow: 0.16, yWaist: 0.44, yBib: 0.64, bx: 0.12, w: 0.62 });
    P(L, SPH(18, 10, 0), BLUE, { j: 1, vm: 4, fab: 1 }, [0, 1.27, 0.0], [-0.15, 0, 0], [0.21, 0.1, 0.21]);
    P(L, SPH(14, 8), BLUE, { j: 1, vm: 4, fab: 1 }, [0, 1.27, 0.15], [-0.25, 0, 0], [0.15, 0.022, 0.1]);
    P(L, SPH(6, 4), '#45679c', { j: 1, vm: 4 }, [0, 1.37, -0.01], [0, 0, 0], [0.025, 0.018, 0.025]);
    carryBox(L, S, 0.9); wateringCan(L, S);
    S.pal = [['#f6f0e4', '#fffaf2', '#f6f0e4'], ['#f6dc84', '#fff1c0', '#f6dc84'], ['#f3eee2', '#fffaf2', '#557d4f']];
  },
  bear(L, S) {
    const prof = [[0.25, 0.3], [0.33, 0.38], [0.365, 0.5], [0.365, 0.64], [0.34, 0.78], [0.29, 0.92], [0.22, 1.03]];
    Object.assign(S, { prof, tz: 0.85, neck: [0, 1.06, 0], sh: [0.32, 0.93, 0], el: [0.39, 0.69, 0.03], hand: [0.41, 0.47, 0.07], top: 1.78, chestY: 0.8, canK: 1.1 });
    torso(L, S);
    const HC = [0, 1.38, 0], HR = [0.355, 0.33, 0.32];
    P(L, superHead(HR, 2.2, 0.18), null, { j: 1, slot: 1 }, HC);
    P(L, SPH(16, 12), null, { j: 1, slot: 2 }, [0, 1.27, 0.24], [0, 0, 0], [0.16, 0.12, 0.12]);
    const HD = surfU(surfE(HC, HR, 2.2, 0.18), surfE([0, 1.27, 0.24], [0.16, 0.12, 0.12]));
    P(L, SPH(12, 8), '#3a241a', { j: 1 }, [0, 1.325, 0.35], [0.3, 0, 0], [0.068, 0.046, 0.042]);
    capAB(L, '#3a241a', { j: 1 }, [0, 1.29, 0.36], [0, 1.25, 0.355], 0.006, 4);
    for (const s of [-1, 1]) P(L, ARC(), '#3a241a', { j: 1 }, [s * 0.032, 1.248, 0.355], [0.2, s * 0.1, PI], [0.034, 0.03, 0.02]);
    eyes(L, HD, 0.15, 1.43, ['moon', 'lash', 'bean'], 1.05);
    blush(L, HD, 0.22, 1.3, 1.15);
    for (const s of [1, -1]) { const j = s > 0 ? 3 : 4; const piv = [s * 0.22, 1.6, 0]; P(L, SPH(14, 10), null, { j, slot: 1, piv }, [s * 0.265, 1.69, -0.02], [0, 0, 0], [0.105, 0.1, 0.07]); P(L, SPH(10, 8), null, { j, slot: 2, piv }, [s * 0.265, 1.685, 0.035], [0, 0, 0], [0.06, 0.058, 0.03]); }
    P(L, SPH(10, 8), null, { j: 9, slot: 1, piv: [0, 0.48, -0.28] }, [0, 0.48, -0.32], [0, 0, 0], [0.075, 0.07, 0.07]);
    arms(L, S, { r: 0.092, paw: 0.1, pawSlot: 1, sleeves: [{ vm: 1, col: '#e6d6bb', fab: 2 }, { vm: 2, col: SHIRT, fab: 1 }, { vm: 4, col: '#efe2c8', fab: 1 }] });
    legsM(L, S, { hx: 0.16, hipY: 0.36, r: 0.12, footY: 0.07, foot: [0.13, 0.09, 0.17], footSlot: 1, pants: [{ vm: 4, col: BLUE, y0: 0.13, y1: 0.39 }] });
    S.chestZ = profR(prof, 0.8) * 0.85 + 0.17;
    sweater(L, S, { vm: 1, col: '#e6d6bb', yHem: 0.4, yNeck: 1.03, k: 1.07 });
    bodice(L, S, { vm: 2, col: SHIRT, y0: 0.55, y1: 1.03, k: 1.025, collar: '#fbf6ec' });
    apron(L, S, { vm: 2, col: '#bf5f45', yHem: 0.3, yWaist: 0.66, yBib: 0.9, w: 1.0, k: 1.06, flare: 0.2, bx: 0.15 });
    bodice(L, S, { vm: 4, col: '#efe2c8', y0: 0.55, y1: 1.03, k: 1.025, collar: '#fbf6ec' });
    for (let i = 0; i < 4; i++) ring(L, '#c9b48e', { vm: 4, fab: 1 }, 0.82 + i * 0.05, profR(prof, 0.82 + i * 0.05) * 1.03, 0.008, 0.85);
    overalls(L, S, { vm: 4, col: BLUE, yLow: 0.3, yWaist: 0.62, yBib: 0.86, bx: 0.15, w: 0.6 });
    carryBox(L, S, 1.15); wateringCan(L, S);
    S.pal = [['#8a5634', '#e4c79a', '#8a5634'], ['#5c3826', '#d9b88c', '#5c3826'], ['#b97a45', '#f0d6a8', '#b97a45']];
  },
};
export const DEFS = {
  chick: { home: 'egg', speed: 1.2, step: 1.3, waddle: 0.1, bob: 0.06, wings: true, share: 0.19 },
  rabbit: { home: 'tea', speed: 1.4, step: 1.0, waddle: 0.05, bob: 0.085, share: 0.17 },
  cat: { home: 'fish', speed: 1.4, step: 1.05, waddle: 0.05, bob: 0.05, share: 0.16 },
  dog: { home: 'boot', speed: 1.5, step: 1.0, waddle: 0.07, bob: 0.06, share: 0.16 },
  duck: { home: 'cup', speed: 1.15, step: 1.2, waddle: 0.24, bob: 0.03, wings: true, share: 0.16 },
  bear: { home: 'honey', speed: 1.0, step: 0.62, waddle: 0.1, bob: 0.04, share: 0.16 },
};
export const SPECIES = {};
export const ATTRS = ['aBody', 'aHead', 'aEars', 'aArms', 'aFeet', 'aState'];
export function buildSpecies(scene) {
  const total = Object.values(DEFS).reduce((a, d) => a + d.share, 0);
  for (const [name, d] of Object.entries(DEFS)) {
    const max = MAXC;
    const sp = { name, ...d, max };
    const L = []; SPECIES_BUILD[name](L, sp);
    const geo = mergeGeometries(L, false);
    for (const a of ATTRS) { const at = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(a, at); }
    const { mat, depth } = rigMaterials(sp);
    const im = new THREE.InstancedMesh(geo, mat, max); im.customDepthMaterial = depth; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.count = 0;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im);
    sp.im = im; sp.attr = Object.fromEntries(ATTRS.map(a => [a, geo.attributes[a].array])); sp.tris = geo.attributes.position.count / 3;
    sp.hv = new THREE.Vector3(-sp.hand[0], sp.hand[1], sp.hand[2]); sp.ev = new THREE.Vector3(-sp.el[0], sp.el[1], sp.el[2]); sp.sv = new THREE.Vector3(-sp.sh[0], sp.sh[1], sp.sh[2]);
    // 远景 LOD：同一套雕刻用更少的圆周分段重建一次，不投射实时阴影（远处用脚下的圆形阴影斑代替）
    const cd0 = CD; CD = 0.3; const L2 = []; const sp2 = { ...sp }; SPECIES_BUILD[name](L2, sp2); CD = cd0;
    const geo2 = mergeGeometries(L2, false);
    for (const a of ATTRS) { const at = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); at.setUsage(THREE.DynamicDrawUsage); geo2.setAttribute(a, at); }
    const im2 = new THREE.InstancedMesh(geo2, mat, max); im2.castShadow = false; im2.receiveShadow = true; im2.frustumCulled = false; im2.count = 0; im2.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im2);
    sp.lo = { im: im2, attr: Object.fromEntries(ATTRS.map(a => [a, geo2.attributes[a].array])), tris: geo2.attributes.position.count / 3 };
    SPECIES[name] = sp;
  }
}

// ---------------------------------------------------------------- 动画（主线程：只做表现，状态来自 Worker 快照）
// act 与 sim-core.js 的 ACT 对应
const A_ = { IDLE: 0, WALK: 1, GATHER: 2, FISH: 3, FARM: 4, EAT: 5, SLEEP: 6, CHAT: 7, BUILD: 8, INSIDE: 9, HAUL: 10, CHOP: 11 };
export function makeAnimState(id, species) {
  const h = (id * 2654435761 % 1000) / 1000;
  return { id, species, variant: id % 3, x: 0, z: 0, y: 0, yaw: 0, act: 0, flags: 0, phase: h * TAU, seed: h * 100, blink: 1 + h * 4, walk: 0, spd: 0, prevSpd: 0,
    earL: 0, earLV: 0, earR: 0, earRV: 0, lastBob: 0, lean: 0, leanV: 0, headP: 0, headPV: 0, hy: 0, hyV: 0, nod: 0, bubble: 0, happy: 0, carry: 0, water: 0,
    arm: [0, 0.07, 0, -0.07, -0.15, -0.15], look: 0, hidden: false, vis: 1 };
}
export function writeChar(c, idx, t, dt, lo = false) {
  const sp = SPECIES[c.species]; const S = lo ? sp.lo : sp; const im = S.im; const A = S.attr;
  if (c.hidden && c.vis <= 0.01) { im.setMatrixAt(idx, ZERO); return; }
  const h = Math.min(dt, 0.05); const act = c.act;
  const moving = c.spd > 0.15; c.walk += ((moving ? 1 : 0) - c.walk) * Math.min(1, dt * 7);
  const pulling = act === A_.HAUL && (c.flags & 8);
  const stepK = act === A_.HAUL ? 0.55 : 1; const sv = clamp(c.spd, 0, 4);
  c.phase += dt * Math.max(sv, pulling ? 0.55 : 0) * 7.0 * sp.step * stepK * (0.3 + c.walk);
  const w = act === A_.HAUL ? Math.max(c.walk, pulling ? 1 : 0) : c.walk, ph = c.phase;
  c.blink -= dt; if (c.blink < -0.13) c.blink = 1.5 + Math.random() * 4;
  const speaking = (act === A_.CHAT && (Math.floor(t / 1.6) % 2) === (((c.flags >> 4) & 3) - 1)) || (c.flags & 64) !== 0;
  c.bubble += ((speaking ? 1 : 0) - c.bubble) * Math.min(1, dt * 8);
  const happyT = (c.flags & 4) || (act === A_.CHAT && !speaking) || (act === A_.GATHER && Math.sin(t * 0.8 + c.seed) > 0.5) ? 1 : (act === A_.IDLE && Math.sin(t * 0.37 + c.seed * 3) > 0.93 ? 1 : 0);
  c.happy += (happyT - c.happy) * Math.min(1, dt * 6);
  c.carry += (((c.flags & 1) ? 1 : 0) - c.carry) * Math.min(1, dt * 5);
  c.water += ((act === A_.FARM || act === A_.FISH ? 1 : 0) - c.water) * Math.min(1, dt * 2.5);
  c.nod = act === A_.CHAT ? (speaking ? Math.sin(t * 7.5 + c.seed) * 0.11 : Math.max(0, Math.sin(t * 3 + c.seed)) * 0.06) : act === A_.EAT ? Math.max(0, Math.sin(t * 5 + c.seed)) * 0.14 : act === A_.SLEEP ? 0.32 : act === A_.BUILD ? Math.sin(t * 9 + c.seed) * 0.05 + 0.15 : 0;
  c.look = act === A_.IDLE ? Math.sin(t * 0.7 + c.seed) * 0.5 : 0;
  const bob = w * Math.abs(Math.sin(ph)) * sp.bob + (1 - w) * (Math.sin(t * (act === A_.HAUL ? 6 : 2.1) + c.seed) * 0.008 + 0.008) - (act === A_.BUILD || act === A_.CHOP ? 0.03 : 0);
  const bobV = (bob - c.lastBob) / Math.max(dt, 1e-3); c.lastBob = bob;
  const acc = (c.spd - c.prevSpd) / Math.max(dt, 1e-3); c.prevSpd = c.spd;
  const leanT = act === A_.HAUL ? (pulling ? 0.34 : 0.12) : act === A_.SLEEP ? 0.1 : act === A_.CHOP ? 0.28 : act === A_.BUILD ? 0.12 : w * 0.08 + c.water * 0.1;
  c.leanV += ((leanT - c.lean) * 60 - c.leanV * 4.5 - clamp(acc, -20, 20) * 0.35) * h; c.lean = clamp(c.lean + c.leanV * h, -0.3, 0.38);
  c.headPV += ((c.nod - c.lean * 0.55 - c.headP) * 80 - c.headPV * 7 - c.leanV * 2.2) * h; c.headP = clamp(c.headP + c.headPV * h, -0.4, 0.45);
  c.hyV += ((-c.hy) * 120 - c.hyV * 9 - bobV * 2.0) * h; c.hy = clamp(c.hy + c.hyV * h, -0.06, 0.06);
  const roll = w * Math.sin(ph) * sp.waddle; const sq = (1 - w) * Math.sin(t * (act === A_.SLEEP ? 1.2 : 2.1) + c.seed) * (act === A_.SLEEP ? 0.035 : 0.02) + w * Math.cos(2 * ph) * 0.03;
  const eT = -w * 0.3 - c.lean * 0.6;
  c.earLV += ((eT - c.earL) * 70 - c.earLV * 6 - bobV * 7) * h; c.earL += c.earLV * h;
  c.earRV += ((eT * 0.9 - c.earR) * 60 - c.earRV * 5.5 - bobV * 7) * h; c.earR += c.earRV * h;
  const wob = Math.sin(t * 1.3 + c.seed) * 0.05; const earK = c.species === 'dog' ? 2.2 : c.species === 'rabbit' ? 1 : 0.4;
  const k = idx * 4;
  A.aBody[k] = bob; A.aBody[k + 1] = c.lean; A.aBody[k + 2] = roll; A.aBody[k + 3] = sq;
  A.aHead[k] = c.headP; A.aHead[k + 1] = c.look * (1 - w); A.aHead[k + 2] = c.hy;
  A.aEars[k] = c.earL * earK; A.aEars[k + 1] = c.earR * earK; A.aEars[k + 2] = (wob - roll * 0.6) * earK; A.aEars[k + 3] = c.water;
  const T = [0, 0.07, 0, -0.07, -0.15, -0.15];
  if (sp.wings) { const flap = w * (0.12 + 0.28 * (0.5 + 0.5 * Math.sin(ph * 2))) + (1 - w) * Math.max(0, Math.sin(t * 0.9 + c.seed) - 0.93) * 8; T[1] = 0.05 + flap; T[3] = -0.05 - flap; T[4] = T[5] = 0; }
  else { T[0] = -Math.sin(ph) * 0.5 * w; T[2] = Math.sin(ph) * 0.5 * w; T[4] = T[5] = -0.15 - 0.25 * w; }
  if (c.bubble > 0.05) { T[0] = -0.25; T[1] = sp.wings ? 2.3 : 2.55; T[4] = sp.wings ? 0 : -0.35 + Math.sin(t * 9 + c.seed) * 0.35; }
  if (act === A_.HAUL) { const tug = pulling ? Math.sin(ph) * 0.12 : 0; T[0] = -1.25 + tug; T[2] = -1.25 - tug; T[1] = 0.12; T[3] = -0.12; T[4] = T[5] = sp.wings ? 0 : -0.25; }
  else if (act === A_.BUILD) { const hm = Math.sin(t * 9 + c.seed); T[2] = -1.5 + hm * 0.75; T[3] = -0.15; T[5] = sp.wings ? 0 : -0.6 - hm * 0.3; T[0] = -0.7; T[1] = 0.2; }
  else if (act === A_.CHOP) { T[0] = T[2] = -0.9 + Math.sin(t * 4 + c.seed) * 0.2; T[4] = T[5] = sp.wings ? 0 : -0.4; }
  else if (act === A_.GATHER) { T[0] = -1.9 + Math.sin(t * 3 + c.seed) * 0.5; T[2] = -1.3 + Math.sin(t * 3 + c.seed + 2) * 0.5; T[4] = T[5] = sp.wings ? 0 : -0.5; }
  else if (act === A_.EAT) { T[0] = T[2] = -1.0; T[1] = 0.25; T[3] = -0.25; T[4] = T[5] = sp.wings ? 0 : -1.3; }
  if ((c.flags & 128) && !(c.flags & 8)) { if (c.id % 3 === 0) { T[0] = T[2] = -1.25; T[1] = 0.12; T[3] = -0.12; T[4] = T[5] = sp.wings ? 0 : -0.25; } else { T[1] = sp.wings ? 0.9 + Math.sin(t * 8 + c.seed) * 0.4 : 2.3; T[3] = sp.wings ? -0.9 : -0.1; T[4] = sp.wings ? 0 : -0.35 + Math.sin(t * 8 + c.seed) * 0.35; } } // 坐在玩具车里：司机扶方向盘，乘客挥手
  if (c.carry > 0.05 && !sp.wings) { T[0] = T[2] = -0.62; T[1] = -0.32; T[3] = 0.32; T[4] = T[5] = -1.05; }
  else if (c.carry > 0.05) { T[1] = -0.35; T[3] = 0.35; T[0] = T[2] = -0.6; }
  if (c.water > 0.02) { T[2] = -1.0; T[3] = -0.05; T[5] = sp.wings ? 0 : -0.35; }
  for (let i = 0; i < 6; i++) c.arm[i] += (T[i] - c.arm[i]) * Math.min(1, dt * 8);
  const [aLx, aLz, aRx, aRz, eL, eR] = c.arm;
  A.aArms[k] = aLx; A.aArms[k + 1] = aLz; A.aArms[k + 2] = aRx; A.aArms[k + 3] = aRz;
  const stride = sp.name === 'bear' ? 0.32 : 0.5;
  A.aFeet[k] = Math.sin(ph) * stride * w; A.aFeet[k + 1] = Math.max(0, Math.cos(ph)) * 0.05 * w; A.aFeet[k + 2] = -Math.sin(ph) * stride * w; A.aFeet[k + 3] = Math.max(0, -Math.cos(ph)) * 0.05 * w;
  const tailW = sp.name === 'dog' ? Math.sin(t * 9 + c.seed) * 0.5 : Math.sin(t * 2.4 + c.seed) * 0.3;
  A.aHead[k + 3] = tailW + w * Math.sin(ph) * 0.3;
  const closed = c.blink < 0 || act === A_.SLEEP;
  A.aState[k] = c.variant + clamp(c.carry, 0, 0.99) * 0.24 + (closed ? 0.5 : 0); A.aState[k + 1] = c.happy; A.aState[k + 2] = eL; A.aState[k + 3] = eR;
  const sc = CS * c.vis;
  _q.setFromEuler(_e.set(c.pitch || 0, c.yaw, c.roll || 0, 'YXZ')); _m.compose(_v.set(c.x, c.y, c.z), _q, _s.set(sc, sc, sc)); im.setMatrixAt(idx, _m); // pitch/roll：屋里躺在床上
}
// 居民头顶气泡的位置（世界坐标高度）：头顶再高一点。气泡本身是 DOM（见 js/bubble.js），全镇一个样式
export function headTopY(c) { return c.y + (SPECIES[c.species].top + 0.12) * CS; }
// 手的世界坐标（拉绳用）：近似为身体前方、胸口高度
export function handWorld(c, out) { const sp = SPECIES[c.species]; const f = (sp.chestZ || 0.3) * CS + 0.25; out.set(c.x + Math.sin(c.yaw) * f, c.y + sp.chestY * CS * 0.95, c.z + Math.cos(c.yaw) * f); return out; }
