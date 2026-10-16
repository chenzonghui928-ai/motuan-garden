// 造型库·环境：地面、溪水、祭坛、广场、资源点、村口、远景巨物、可被房子/道路遮罩的花草
// 大部分造型摘自 prototype-3d/main.js（祭坛/水/花草/巨物/菜田），布局改为由 shared/layout.js 驱动
import * as THREE from 'three';
import { LOW, PI, TAU, R, RI, pick, rng, clamp, lerp, smooth, fbm, vnoise, segDist, M, MAT, TX, ctex, G, sphereG, boxG, cylG, torusG, add, lathe, bake, mergeList, tint, taperTube, mergeStatic, timeU, ENV } from './core.js';
import { makeLantern, makePot, makeCarrot } from './houses.js';
import { dandelionPlant, cloverClump, foxtailClump, dandelionInstGeos, dandelionMats, ENV_PROBES, envProbe } from './plants.js';
export { ENV_PROBES, envProbe };
import { STREAM, streamDist, WORLD_R, EDGE_R, PLAZA_R, RESOURCES, STORE_POS, startGraph } from '../shared/layout.js';

export const GS = 200; // 地面边长
// 小溪在 200×200 的地块外不再截断：沿两端的方向弯弯地继续往外流到雾里（只在渲染里延伸，模拟里的 STREAM 不动，路网和桥不受影响）
function streamExt(a, b, sign) { // a→b 是溪的端头方向（b 是端点），往外延伸 ~480 单位
  const out = []; let x = b[0], z = b[1]; let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const ph = sign * 1.3;
  for (let i = 1; i <= 80; i++) { const s = i * 6; ang += 0.0045 * Math.cos(s * 0.011 + ph) * 6 * 0.5; x += Math.cos(ang) * 6; z += Math.sin(ang) * 6; out.push([x, z]); }
  return out;
}
export const STREAM_EXT_B = streamExt(STREAM[STREAM.length - 6], STREAM[STREAM.length - 1], 1);          // 下游：继续往东
export const STREAM_EXT_A = streamExt(STREAM[5], STREAM[0], -1);                                         // 上游：继续往西北
export const STREAM_FULL = [...STREAM_EXT_A.slice().reverse(), ...STREAM, ...STREAM_EXT_B];
const EXT_SEGS = [[STREAM[0], ...STREAM_EXT_A], [STREAM[STREAM.length - 1], ...STREAM_EXT_B]];
export const streamDistFull = (x, z) => Math.min(streamDist(x, z), extDist(x, z));
function extDist(x, z) { let m = 1e9; for (const S of EXT_SEGS) for (let i = 0; i < S.length - 1; i++) { const a = S[i], b = S[i + 1]; if (Math.abs(a[0] - x) > 14 && Math.abs(b[0] - x) > 14 || Math.abs(a[1] - z) > 14 && Math.abs(b[1] - z) > 14) continue; m = Math.min(m, segDist(x, z, a[0], a[1], b[0], b[1])); } return m; }
// 地面真实高度（含边缘渐隐；200×200 地块以外是平地）：远景物件脚下用它
export const surfY = (x, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); return m >= GS / 2 ? -0.03 : groundH(x, z) * (1 - smooth(GS * 0.44, GS * 0.5, m)); };
export function groundH(x, z) {
  const r = Math.hypot(x, z);
  let h = smooth(WORLD_R + 6, WORLD_R + 30, r) * (fbm(x * 0.04 + 3, z * 0.04 + 7) * 3.2 + 0.4);
  const sd = Math.min(streamDist(x, z), extDist(x, z)); const carve = 1 - smooth(2.2, 4.4, sd);
  return h * (1 - carve) - 1.15 * carve;
}
// ---------------------------------------------------------------- ground
export function buildGround(scene) {
  const S = LOW ? 1024 : 2048; const toC = (v) => (v + GS / 2) / GS * S; const px = S / GS;
  const tex = ctex(S, S, (g) => {
    g.fillStyle = '#7cc444'; g.fillRect(0, 0, S, S);
    // 远方“人类花园”：割草机留下的条纹草坪
    g.save(); g.beginPath(); g.rect(0, 0, S, S); g.arc(toC(0), toC(0), (EDGE_R - 4) * px, 0, TAU, true); g.clip();
    for (let i = -20; i < 20; i++) { g.fillStyle = i % 2 ? 'rgba(150,210,90,.35)' : 'rgba(80,150,50,.18)'; g.save(); g.translate(S / 2, S / 2); g.rotate(0.5); g.fillRect(i * 6 * px, -S, 6 * px, 2 * S); g.restore(); }
    g.restore();
    for (let i = 0; i < (LOW ? 1600 : 4200); i++) { g.fillStyle = pick(['rgba(140,206,80,.28)', 'rgba(104,178,58,.28)', 'rgba(160,214,90,.22)', 'rgba(92,164,52,.25)', 'rgba(178,220,96,.18)']); g.beginPath(); g.arc(R(0, S), R(0, S), R(6, 46) * S / 2048, 0, TAU); g.fill(); }
    for (let i = 0; i < (LOW ? 9000 : 30000); i++) { const x = R(0, S), y = R(0, S); g.strokeStyle = pick(['rgba(70,140,40,.45)', 'rgba(170,225,100,.5)', 'rgba(90,160,50,.4)']); g.lineWidth = S / 2048 * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-1.5, 1.5), y - R(3, 7) * S / 2048); g.stroke(); }
    g.lineCap = g.lineJoin = 'round';
    const streamStroke = (w, col) => { g.strokeStyle = col; g.lineWidth = w * px; g.beginPath(); STREAM_FULL.forEach((p, i) => i ? g.lineTo(toC(p[0]), toC(p[1])) : g.moveTo(toC(p[0]), toC(p[1]))); g.stroke(); };
    streamStroke(10.5, 'rgba(150,190,90,.5)'); streamStroke(8.8, '#d8c79a'); streamStroke(7.0, '#b8a27a'); streamStroke(5.4, '#6f8f86');
    g.fillStyle = 'rgba(120,150,60,.45)'; g.beginPath(); g.arc(toC(0), toC(0), 10.4 * px, 0, TAU); g.fill();
    g.fillStyle = '#c9ad78'; g.beginPath(); g.arc(toC(0), toC(0), 9.9 * px, 0, TAU); g.fill();
    g.fillStyle = '#9fa85e'; g.beginPath(); g.arc(toC(0), toC(0), 9.5 * px, 0, TAU); g.fill();
    for (let i = 0; i < (LOW ? 1500 : 5000); i++) { const a = R(0, TAU), r = Math.sqrt(R(0, 1)) * 9.4; g.fillStyle = pick(['rgba(110,170,60,.6)', 'rgba(150,200,80,.5)', 'rgba(170,140,90,.45)', 'rgba(90,150,50,.5)']); g.beginPath(); g.arc(toC(Math.cos(a) * r), toC(Math.sin(a) * r), R(1, 3.5) * S / 2048, 0, TAU); g.fill(); }
    const F = RESOURCES.find(r => r.type === 'veg');
    g.fillStyle = 'rgba(90,60,30,.55)'; g.beginPath(); g.roundRect(toC(F.x - F.hx - 0.9), toC(F.z - F.hz - 0.9), (F.hx + 0.9) * 2 * px, (F.hz + 0.9) * 2 * px, 1.2 * px); g.fill();
    for (const s of RESOURCES) if (s.type !== 'veg') { const gr = g.createRadialGradient(toC(s.x), toC(s.z), 0, toC(s.x), toC(s.z), (s.r + 2) * px); gr.addColorStop(0, 'rgba(60,90,30,.35)'); gr.addColorStop(1, 'rgba(60,90,30,0)'); g.fillStyle = gr; g.beginPath(); g.arc(toC(s.x), toC(s.z), (s.r + 2) * px, 0, TAU); g.fill(); }
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const seg = LOW ? 72 : 140;
  const geo = new THREE.PlaneGeometry(GS, GS, seg, seg); geo.rotateX(-PI / 2);
  const p = geo.attributes.position; const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); const edgeF = 1 - smooth(GS * 0.44, GS * 0.5, Math.max(Math.abs(x), Math.abs(z)));
    const h = groundH(x, z) * edgeF; p.setY(i, h);
    const v = 0.9 + 0.14 * fbm(x * 0.08, z * 0.08) + clamp(h, -0.5, 1) * 0.04; col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.97;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, M('#ffffff', { map: tex, vc: true, r: 0.95, rim: 0.25, fol: 2.3 })); m.receiveShadow = true; scene.add(m);
  // 外圈草地：条纹按世界坐标算（和地块里割草机留下的条纹一条对一条），再叠一层很淡的明暗斑，颜色和地块一致，拉到最远也看不出接缝
  const outerM = M('#7cc444', { r: 0.95, rim: 0.25, fol: 2.3, outer: 1 }); const prevC = outerM.onBeforeCompile;
  outerM.onBeforeCompile = (sh, r) => { prevC(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
{ float jkU = vJkW.x * 0.87758 + vJkW.z * 0.47943; float jkOdd = mod(floor(jkU / 6.0), 2.0);
  vec3 jkS = mix(vec3(0.965, 0.98, 0.97), vec3(1.04, 1.015, 1.06), jkOdd) * vec3(1.03, 0.965, 1.12);
  float jkN = jkWN(vJkW.xz * 0.05) * 0.5 + jkWN(vJkW.xz * 0.21 + 4.0) * 0.5; diffuseColor.rgb *= jkS * (0.88 + 0.14 * jkN) * (0.95 + 0.1 * jkWN(vJkW.xz * 1.7)); }`); };
  outerM.customProgramCacheKey = () => 'jk-outer'; outerM.polygonOffset = true; outerM.polygonOffsetFactor = 2; outerM.polygonOffsetUnits = 2;
  const outer = new THREE.Mesh(new THREE.RingGeometry(GS * 0.48, 1100, 64, 1).rotateX(-PI / 2), outerM); outer.position.y = -0.03; outer.receiveShadow = true; scene.add(outer);
}
// ---------------------------------------------------------------- water (stream strip from shared polyline)
export let waterMat = null;
export function buildWater(scene) {
  const A = 7; const pos = [], uv = [], idx = []; let acc = 0; const SF = STREAM_FULL, N = SF.length;
  for (let i = 0; i < N; i++) {
    const c = SF[i], a = SF[Math.max(0, i - 1)], b = SF[Math.min(N - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    if (i) acc += Math.hypot(c[0] - SF[i - 1][0], c[1] - SF[i - 1][1]);
    for (let j = 0; j < A; j++) { const u = j / (A - 1); const off = (u - 0.5) * 6.4; const wx = c[0] - tz * off, wz = c[1] + tx * off; pos.push(wx, -0.52 + 0.56 * smooth(GS * 0.44, GS * 0.5, Math.max(Math.abs(wx), Math.abs(wz))), wz); uv.push(u, acc / 6); }
  }
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < A - 1; j++) { const a = i * A + j, b = a + 1, c = a + A, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  waterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: timeU, uDeep: { value: new THREE.Color('#1fa6c8') }, uShallow: { value: new THREE.Color('#7fe6e0') }, uLight: { value: new THREE.Color(1, 1, 1) }, uSpark: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uDeep, uShallow, uLight; uniform float uSpark; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      void main(){
        float across = abs(vUv.x-0.5)*2.0;
        float n = noise(vec2(vUv.x*4.0, vUv.y*2.0 - uTime*0.55))*0.6 + noise(vec2(vUv.x*9.0+3.1, vUv.y*5.0 - uTime*0.9))*0.4;
        vec3 col = mix(uDeep, uShallow, clamp(smoothstep(0.15, 0.8, across) + (n-0.5)*0.35, 0.0, 1.0));
        col += smoothstep(0.66, 0.78, noise(vec2(vUv.x*7.0, vUv.y*1.2 - uTime*0.7))) * 0.16;
        vec2 sp = vec2(vUv.x*26.0, (vUv.y - uTime*0.6)*14.0); vec2 id = floor(sp); float h = hash(id);
        float tw = sin(uTime*4.0 + h*50.0)*0.5+0.5; float d = length(fract(sp)-0.5);
        col += step(0.9, h) * smoothstep(0.22, 0.0, d) * tw * (1.0 - across*0.6) * 1.4 * uSpark;
        col = mix(col, vec3(0.93,0.99,1.0), smoothstep(0.62, 0.8, across + (n-0.5)*0.25)*0.55);
        col *= uLight;
        gl_FragColor = vec4(col, mix(0.9, 0.55, smoothstep(0.85,1.0,across)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, waterMat); m.renderOrder = 1; scene.add(m);
  // 地块外的溪岸：平平的一条沙土带（水面盖在中间），沿着延伸段一直到雾里
  { const pos2 = [], col2 = [], idx2 = []; const cB = new THREE.Color('#6f8f86'), cS = new THREE.Color('#b8a27a'), cD = new THREE.Color('#d8c79a'); let n2 = 0;
    const prof = [[-4.7, cD], [-3.9, cD], [-3.2, cS], [-2.4, cB], [2.4, cB], [3.2, cS], [3.9, cD], [4.7, cD]];
    for (let i = 0; i < N; i++) { const c = SF[i], a = SF[Math.max(0, i - 1)], b = SF[Math.min(N - 1, i + 1)]; if (Math.max(Math.abs(c[0]), Math.abs(c[1])) < GS * 0.5 - 1.5) continue; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      for (const [off, col] of prof) { pos2.push(c[0] - tz * off, -0.012, c[1] + tx * off); col2.push(col.r, col.g, col.b); } n2++; }
    for (let i = 0; i < n2 - 1; i++) for (let j = 0; j < prof.length - 1; j++) { const a = i * prof.length + j, b = a + 1, c = a + prof.length, d = c + 1; idx2.push(a, c, b, b, c, d); }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3)); g2.setAttribute('color', new THREE.Float32BufferAttribute(col2, 3)); g2.setIndex(idx2); g2.computeVertexNormals();
    const bm = new THREE.Mesh(g2, M('#ffffff', { vc: true, r: 1, ds: true })); bm.receiveShadow = true; scene.add(bm); }
  // 河石 + 睡莲
  const rocks = []; const SS = STREAM;
  for (let i = 0; i < SS.length; i += 2) { const p = SS[i]; if (Math.hypot(p[0], p[1]) > 95) continue; for (const side of [-1, 1]) { if (rng() < 0.62) continue; const q = SS[Math.min(i + 1, SS.length - 1)]; const tx = q[0] - p[0], tz = q[1] - p[1]; const l = Math.hypot(tx, tz) || 1; const off = side * R(2.6, 3.6); rocks.push([p[0] - tz / l * off, p[1] + tx / l * off, R(0.45, 1.15)]); } }
  for (let i = 0; i < 8; i++) { const p = SS[RI(40, 200)]; rocks.push([p[0] + R(-1, 1), p[1] + R(-1, 1), R(0.25, 0.45)]); }
  const rg = new THREE.SphereGeometry(1, 10, 7); { const rp = rg.attributes.position; for (let i = 0; i < rp.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(rp, i); const k = 1 + (vnoise(v.x * 1.7 + 3, v.y * 1.7 + v.z * 1.3) - 0.5) * 0.35; rp.setXYZ(i, v.x * k, v.y * k, v.z * k); } rg.computeVertexNormals(); }
  const im = new THREE.InstancedMesh(rg, M('#ffffff', { r: 0.85 }), rocks.length); const o = new THREE.Object3D(); const c = new THREE.Color();
  rocks.forEach((r, i) => { o.position.set(r[0], groundH(r[0], r[1]) + r[2] * 0.15, r[1]); o.rotation.set(R(0, 3), R(0, 3), R(0, 3)); o.scale.set(r[2] * R(1, 1.4), r[2] * R(0.55, 0.8), r[2]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); c.setHSL(R(0.07, 0.11), R(0.08, 0.16), R(0.55, 0.68)); im.setColorAt(i, c); });
  im.castShadow = im.receiveShadow = true; scene.add(im);
  const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.55, 14, 0.3, TAU - 0.6).rotateX(-PI / 2), M('#4fb04a', { r: 0.6, ds: true }), 12);
  for (let i = 0; i < 12; i++) { const p = SS[RI(30, 240)]; o.position.set(p[0] + R(-1.3, 1.3), -0.5, p[1] + R(-1.3, 1.3)); o.rotation.set(0, R(0, TAU), 0); o.scale.setScalar(R(0.7, 1.2)); o.updateMatrix(); pads.setMatrixAt(i, o.matrix); }
  pads.receiveShadow = true; scene.add(pads);
}
// ---------------------------------------------------------------- altar (守护神的祭坛 + 金蛋)
export function buildAltar(scene) {
  const g = new THREE.Group(); scene.add(g);
  const stoneSide = M('#ffffff', { map: TX.stone, r: 0.9 }), stoneTop = M('#d8cbb0', { r: 0.9 });
  let y = 0;
  for (const [r, h] of [[4.3, 0.5], [3.35, 0.5], [2.45, 0.5]]) {
    add(g, new THREE.CylinderGeometry(r, r + 0.08, h, 40, 1, true), stoneSide, 0, y + h / 2, 0);
    const top = new THREE.CircleGeometry(r, 40); top.rotateX(-PI / 2); add(g, top, stoneTop, 0, y + h, 0);
    add(g, torusG(r - 0.02, 0.08, 6, 48), stoneTop, 0, y + h, 0, PI / 2); y += h;
  }
  for (let i = 0; i < 3; i++) add(g, boxG(1.8, 0.5 * (i + 1), 0.6), stoneTop, 0, 0.25 * (i + 1), 4.55 - i * 0.95);
  for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; const x = Math.sin(a) * 3.85, z = Math.cos(a) * 3.85; add(g, boxG(0.7, 1.2, 0.7), stoneTop, x, 1.1, z, 0, a, 0); add(g, sphereG(0.36, 12, 8), M('#8a5a32'), x, 1.85, z, 0, 0, 0, 1, 0.6, 1); add(g, sphereG(0.3, 12, 8), M('#c48a50'), x, 1.6, z); }
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; add(g, sphereG(0.6, 10, 6), i % 2 ? MAT.leaf : MAT.green, Math.sin(a) * 1.8, 1.62, Math.cos(a) * 1.8, 0.4, a, 0, 0.55, 0.18, 1.2); }
  add(g, lathe([[0.01, 0], [0.9, 0.04], [1.5, 0.35], [1.85, 0.85], [1.95, 1.2]], 36), M('#ffffff', { map: TX.weave, r: 0.9 }), 0, 1.55, 0);
  add(g, torusG(1.95, 0.22, 8, 40), M('#8a5a2c', { r: 0.9 }), 0, 2.75, 0, PI / 2);
  add(g, sphereG(1.7, 24, 8, 0), M('#f0c060', { map: TX.straw, r: 0.95 }), 0, 2.45, 0, 0, 0, 0, 1, 0.25, 1);
  mergeStatic(g);
  const eg = []; for (let i = 0; i <= 24; i++) { const t = i / 24 * PI; eg.push([0.95 * Math.sin(t) * (1 + 0.12 * Math.cos(t)), 1.25 * (1 - Math.cos(t))]); }
  const eggMat = new THREE.MeshStandardMaterial({ color: '#ffcf3a', emissive: '#ffb21e', emissiveIntensity: 1.2, metalness: 0.55, roughness: 0.22, envMap: ENV, envMapIntensity: 1.2 });
  const egg = add(g, lathe(eg, 40), eggMat, 0, 2.35, 0);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex(128, 128, (c, w, h) => { const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,220,120,0.9)'); gr.addColorStop(0.35, 'rgba(255,200,90,0.35)'); gr.addColorStop(1, 'rgba(255,190,80,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.position.set(0, 3.6, 0); halo.scale.set(7, 7, 1); scene.add(halo);
  const pl = new THREE.PointLight('#ffc860', 6, 16, 1.6); pl.position.set(0, 3.8, 0); scene.add(pl);
  return { egg, halo, light: pl };
}
// ---------------------------------------------------------------- plaza flagstones + lantern posts
function stoneGeo(seed, n = 12) {
  const g = new THREE.CylinderGeometry(0.86, 1, 0.16, n, 1); const pp = g.attributes.position;
  for (let i = 0; i < pp.count; i++) { const a = Math.atan2(pp.getZ(i), pp.getX(i)); const k = 1 + 0.09 * Math.sin(a * 2 + seed) + 0.06 * Math.sin(a * 3 + seed * 2.1) + 0.03 * Math.sin(a * 5 + seed); pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k); }
  g.computeVertexNormals(); return g;
}
export const STONE_GEO = () => G('flagstone', () => stoneGeo(0.3));
export const STONE_GEO_LO = () => G('flagstoneLo', () => stoneGeo(0.3, 7));
export const STONE_COLS = ['#d9c3a0', '#cdb08a', '#e2cfae', '#c49c78', '#d8b98f', '#bfa588', '#e6d6b8', '#c8a07a', '#b8a08a', '#dcc29a'];
export function makeTuftGeo(n = 6) {
  const blades = []; for (let i = 0; i < n; i++) { const a = i / n * TAU + R(0, 0.5); const h = R(0.35, 0.7); const b = new THREE.BufferGeometry(); const bx = Math.cos(a) * 0.06, bz = Math.sin(a) * 0.06; const lean = 0.18; const tx = Math.cos(a) * lean, tz = Math.sin(a) * lean; const px = -Math.sin(a) * 0.05, pz = Math.cos(a) * 0.05;
    b.setAttribute('position', new THREE.Float32BufferAttribute([bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + tx * 0.5 - px * 0.6, h * 0.55, bz + tz * 0.5 - pz * 0.6, bx + tx * 0.5 + px * 0.6, h * 0.55, bz + tz * 0.5 + pz * 0.6, bx + tx, h, bz + tz], 3));
    b.setAttribute('color', new THREE.Float32BufferAttribute([0.5, 0.75, 0.3, 0.5, 0.75, 0.3, 0.75, 0.9, 0.42, 0.75, 0.9, 0.42, 0.95, 1, 0.6], 3)); b.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]); b.computeVertexNormals(); blades.push(b); }
  return mergeList(blades, true);
}
export function buildPlaza(scene) {
  const st = [];
  const pass = (n, s0, s1, tries) => { for (let t = 0; t < tries && n > 0; t++) {
    const a = rng() * TAU, r = Math.sqrt(R(4.7 ** 2, 9.3 ** 2)); const x = Math.cos(a) * r, z = Math.sin(a) * r; const s = R(s0, s1);
    if (r + s * 0.85 > 9.55 || r - s * 0.9 < 4.45) continue;
    let ok = true; for (const q of st) if (Math.hypot(q[0] - x, q[1] - z) < (q[2] + s) * 0.98 + 0.09) { ok = false; break; } if (!ok) continue;
    st.push([x, z, s]); n--; } };
  pass(70, 0.62, 0.85, 3000); pass(160, 0.4, 0.58, 6000); pass(LOW ? 120 : 260, 0.22, 0.38, 9000);
  const im = new THREE.InstancedMesh(STONE_GEO(), M('#ffffff', { r: 0.92, rim: 0.4 }), st.length); const o = new THREE.Object3D(); const c = new THREE.Color();
  st.forEach(([x, z, s], i) => { o.position.set(x, 0.02 + R(0, 0.035), z); o.rotation.set(R(-0.03, 0.03), R(0, TAU), R(-0.03, 0.03)); o.scale.set(s * R(1.0, 1.28), R(0.8, 1.35), s); o.updateMatrix(); im.setMatrixAt(i, o.matrix); c.set(pick(STONE_COLS)).offsetHSL(R(-0.012, 0.012), R(-0.04, 0.04), R(-0.07, 0.05)); im.setColorAt(i, c); });
  im.receiveShadow = true; scene.add(im);
  // lantern posts at plaza corners
  const lg = new THREE.Group(); scene.add(lg);
  for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2 + 0.2; const pg = new THREE.Group(); pg.position.set(Math.cos(a) * 10.6, 0, Math.sin(a) * 10.6); pg.rotation.y = -a; lg.add(pg);
    add(pg, cylG(0.35, 0.45, 0.4, 7), MAT.rock, 0, 0.2, 0); add(pg, boxG(0.26, 3.0, 0.26), MAT.woodMid, 0, 1.8, 0); add(pg, boxG(1.1, 0.2, 0.22), MAT.woodMid, 0.4, 3.15, 0); add(pg, boxG(0.12, 0.6, 0.12), MAT.woodMid, 0.2, 2.85, 0, 0, 0, 0.8); makeLantern(pg, 0.8, 3.0, 0, 1.1); }
  mergeStatic(lg);
}
// ---------------------------------------------------------------- resources
export function buildResources(scene) {
  const upd = []; const o = new THREE.Object3D(); const col = new THREE.Color();
  for (const s of RESOURCES) {
    if (s.type === 'berry') {
      const g = new THREE.Group(); g.position.set(s.x, 0, s.z); scene.add(g);
      const bushM = M('#4f9f3a', { r: 0.85, fol: 1 }), bushM2 = M('#5fb048', { r: 0.8, fol: 1 }); // 莓果丛跟着树叶变色（秋天变红黄）
      const BK = 2.2; // 莓果丛按“野草莓 / 小浆果株”的尺度放大（株高约 5 单位、果实直径约 0.6）
      const spots = []; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + R(-0.3, 0.3), r = (i ? R(1.4, 2.2) : 0) * BK; const sz = R(0.9, 1.35) * BK; spots.push([Math.cos(a) * r, Math.sin(a) * r, sz]); add(g, new THREE.IcosahedronGeometry(sz, 1), i % 2 ? bushM : bushM2, Math.cos(a) * r, sz * 0.72, Math.sin(a) * r, 0, R(0, 3), 0, 1, 0.85, 1); }
      add(g, boxG(0.8 * BK, 0.5 * BK, 0.6 * BK), M('#ffffff', { map: TX.weave }), 2.6 * BK, 0.25 * BK, 1.4 * BK, 0, 0.5, 0);
      mergeStatic(g);
      const N = 60; const bm = new THREE.InstancedMesh(G('berry', () => new THREE.SphereGeometry(0.13 * 2.2, 8, 6)), M('#e8392e', { r: 0.35 }), N);
      for (let i = 0; i < N; i++) { const sp = spots[i % spots.length]; const a = R(0, TAU), b = R(0.15, 1.3); o.position.set(s.x + sp[0] + Math.cos(a) * Math.sin(b) * sp[2] * 0.98, sp[2] * 0.72 + Math.cos(b) * sp[2] * 0.85, s.z + sp[1] + Math.sin(a) * Math.sin(b) * sp[2] * 0.98); o.rotation.set(0, 0, 0); o.scale.setScalar(R(0.8, 1.2)); o.updateMatrix(); bm.setMatrixAt(i, o.matrix); col.set(pick(['#e8392e', '#c0392b', '#7a3fb0', '#e8392e'])); bm.setColorAt(i, col); }
      scene.add(bm); upd.push((f) => { bm.count = Math.round(N * clamp(f, 0, 1)); });
    } else if (s.type === 'veg') upd.push(buildField(scene, s));
    else if (s.type === 'fish') {
      const g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = s.ang; scene.add(g);
      for (let i = 0; i < 6; i++) add(g, boxG(2.2, 0.12, 0.42), i % 2 ? MAT.wood : MAT.woodMid, 0, 0.18, 0.4 + i * 0.47);
      for (const sx of [-1, 1]) for (const z of [0.5, 2.6]) add(g, cylG(0.1, 0.1, 1.4, 6), MAT.woodDark, sx * 1.0, -0.35, z);
      add(g, cylG(0.32, 0.26, 0.45, 12), M('#5aa9e6', { r: 0.4 }), 0.7, 0.45, 1.0);
      add(g, cylG(0.03, 0.02, 2.6, 5), MAT.woodDark, -0.6, 1.1, 2.6, 0.9, 0, 0);
      add(g, sphereG(0.09, 8, 6), M('#e2463c'), -0.6, -0.48, 4.3);
      mergeStatic(g);
    } else if (s.type === 'wood') {
      const g = new THREE.Group(); g.position.set(s.x, 0, s.z); scene.add(g);
      const bark = M('#9a6236', { r: 0.9 }), cut = M('#e8c48a', { r: 0.8 });
      for (let i = 0; i < 7; i++) { const row = i < 4 ? 0 : i < 6 ? 1 : 2; const k = row === 0 ? i : row === 1 ? i - 4 : 0; const x = (k - (row === 0 ? 1.5 : row === 1 ? 0.5 : 0)) * 0.72, y = 0.35 + row * 0.6; add(g, cylG(0.36, 0.36, 2.8, 10), bark, x, y, 0, PI / 2, 0, 0); for (const z of [-1.41, 1.41]) add(g, cylG(0.33, 0.33, 0.02, 10), cut, x, y, z, PI / 2, 0, 0); }
      g.scale.setScalar(2.2); // 木枝按真实 10～20 厘米放大（一根长约 6 单位）
      add(g, cylG(0.55, 0.6, 0.6, 12), bark, 2.6, 0.3, 1.2); add(g, cylG(0.52, 0.52, 0.02, 12), cut, 2.6, 0.61, 1.2);
      add(g, boxG(0.08, 0.9, 0.08), MAT.woodMid, 2.6, 0.95, 1.2, 0, 0, 0.5); add(g, boxG(0.32, 0.22, 0.06), MAT.silver, 2.38, 1.33, 1.2, 0, 0, 0.5);
      for (let i = 0; i < 4; i++) add(g, boxG(0.8, 0.5, 0.6), MAT.woodMid, -2.7 + (i % 2) * 0.85, 0.25 + Math.floor(i / 2) * 0.5, 1.6);
      mergeStatic(g);
      dandelionPlant(scene, s.x + 9.5, groundH(s.x + 9.5, s.z - 7), s.z - 7, 11.5); foxtailClump(scene, s.x - 8.5, groundH(s.x - 8.5, s.z - 9.5), s.z - 9.5, 12.5); dandelionPlant(scene, s.x + 12, groundH(s.x + 12, s.z + 5), s.z + 5, 10);
    }
  }
  // 公共粮筐：库存越多，筐里的果蔬越多
  const sg = new THREE.Group(); sg.position.set(STORE_POS[0], 0, STORE_POS[1]); scene.add(sg);
  add(sg, lathe([[0.01, 0], [1.0, 0.02], [1.3, 0.4], [1.45, 1.0]], 24), M('#ffffff', { map: TX.weave, r: 0.9, ds: true }));
  add(sg, torusG(1.45, 0.1, 6, 24), M('#8a5a2c', { r: 0.9 }), 0, 1.0, 0, PI / 2);
  mergeStatic(sg);
  // 筐里的食物按品种分堆（四个扇区：莓果、菜、鱼、面包），每堆最多 NF 个小模型，数量随库存涨落
  const NF = 14; const SECT = [
    { geo: () => new THREE.SphereGeometry(0.17, 9, 6), sc: [1, 1, 1], cols: ['#d9343a', '#c42b3a', '#e8453a'], rot: false },                       // 莓果：红球
    { geo: () => new THREE.ConeGeometry(0.12, 0.55, 6).rotateZ(PI / 2), sc: [1, 1, 1], cols: ['#e8892e', '#f2f0e4', '#6fae3f', '#e8892e'], rot: true },      // 菜：胡萝卜、白萝卜、青菜
    { geo: () => new THREE.SphereGeometry(0.5, 10, 6), sc: [0.95, 0.3, 0.36], cols: ['#8fb4d0', '#a9c4d8', '#7ea3c2'], rot: true },                    // 鱼：长椭球
    { geo: () => new THREE.SphereGeometry(0.4, 10, 7), sc: [0.95, 0.62, 0.7], cols: ['#d9a04a', '#c98f3c', '#e2ae5a'], rot: true },                    // 面包：金黄小面包
  ];
  const foods = SECT.map((S, k) => {
    const im = new THREE.InstancedMesh(G('foodS' + k, S.geo), M('#ffffff', { r: 0.55 }), NF); const a0 = PI / 4 + k * PI / 2;
    for (let i = 0; i < NF; i++) {
      const a = a0 + R(-0.62, 0.62), r = 0.32 + Math.sqrt(R(0, 1)) * 0.58; const layer = Math.floor(i / 5);
      o.position.set(STORE_POS[0] + Math.cos(a) * r, 0.52 + layer * 0.12 + R(0, 0.04), STORE_POS[1] + Math.sin(a) * r); o.rotation.set(0, S.rot ? R(0, TAU) : 0, S.rot && k === 1 ? R(-0.3, 0.3) : 0);
      const u = R(0.85, 1.15); o.scale.set(S.sc[0] * u, S.sc[1] * u, S.sc[2] * u); o.updateMatrix(); im.setMatrixAt(i, o.matrix); col.set(pick(S.cols)); im.setColorAt(i, col);
    }
    o.rotation.set(0, 0, 0); im.castShadow = true; im.count = 0; scene.add(im); return im;
  });
  return (stocks, store) => {
    let k = 0; for (const s of RESOURCES) { if (s.type === 'berry' || s.type === 'veg') upd[k] && upd[k](stocks[RESOURCES.indexOf(s)]); if (s.type === 'berry' || s.type === 'veg') k++; }
    const st = Array.isArray(store) ? store : [store * 0.3, store * 0.4, store * 0.3, 0];
    foods.forEach((im, i) => { const n = st[i] || 0; im.count = n < 0.5 ? 0 : Math.round(clamp(Math.sqrt(n) * 2.3, 1, NF)); });
  };
}
function buildField(scene, F) {
  const g = new THREE.Group(); g.position.set(F.x, 0, F.z); scene.add(g);
  add(g, boxG(F.hx * 2, 0.3, F.hz * 2), MAT.soil, 0, 0.0, 0);
  const rows = 4; const rowZ = []; for (let i = 0; i < rows; i++) rowZ.push(-F.hz + 0.9 + i * (F.hz * 2 - 1.8) / (rows - 1));
  for (const z of rowZ) for (const sx of [-1, 1]) add(g, cylG(0.42, 0.42, F.hx - 0.8, 10), M('#7b4c2b', { r: 1 }), sx * F.hx / 2, 0.16, z, 0, 0, PI / 2, 1, 1, 0.55);
  const per = []; const hx = F.hx + 0.35, hz = F.hz + 0.35; const sp = 0.5;
  const pushLine = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az); const n = Math.round(L / sp); for (let i = 0; i < n; i++) per.push([lerp(ax, bx, i / n), lerp(az, bz, i / n)]); };
  pushLine(-hx, -hz, -1.2, -hz); pushLine(1.2, -hz, hx, -hz); pushLine(hx, -hz, hx, hz); pushLine(hx, hz, 1.2, hz); pushLine(-1.2, hz, -hx, hz); pushLine(-hx, hz, -hx, -hz);
  const cols = ['#e8433a', '#ff9a2e', '#ffd23f', '#5cbf4a', '#3f8fe0', '#8a5ad8', '#ff7aa8', '#33b8a8'];
  const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.21, 0.21, 1, 6).translate(0, 0.5, 0), M('#ffffff', { r: 0.55 }), per.length);
  const cone = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.21, 0.42, 6).translate(0, 0.21, 0), M('#f1cf9a', { r: 0.8 }), per.length);
  const o = new THREE.Object3D(); const c = new THREE.Color();
  per.forEach((p, i) => { const h = R(1.1, 1.75); o.position.set(F.x + p[0], -0.05, F.z + p[1]); o.rotation.set(R(-0.04, 0.04), R(0, 1), R(-0.04, 0.04)); o.scale.set(1, h, 1); o.updateMatrix(); body.setMatrixAt(i, o.matrix); c.set(cols[i % cols.length]); body.setColorAt(i, c); o.position.y = -0.05 + h; o.scale.set(1, 1, 1); o.updateMatrix(); cone.setMatrixAt(i, o.matrix); });
  for (const m of [body, cone]) { m.castShadow = m.receiveShadow = true; scene.add(m); }
  // 小萝卜：红皮白尖的小圆根半露在土面上，顶着一簇宽叶；豌豆苗：细藤卷着须、长着成对的小叶和嫩豆荚（都是本来就矮的作物）
  const carrots = [], cabbages = [];
  for (const z of rowZ) { for (let x = -F.hx + 0.7; x < -0.5; x += 0.95) carrots.push([x + R(-0.1, 0.1), z + R(-0.1, 0.1)]); for (let x = 0.9; x < F.hx - 0.4; x += 1.2) cabbages.push([x + R(-0.1, 0.1), z]); }
  const cTop = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 10, 8).scale(1, 0.85, 1).translate(0, 0.12, 0), M('#e2403c', { r: 0.45 }), carrots.length);
  const radLeaf = mergeList([0, 1, 2, 3, 4].map(k => bake(new THREE.SphereGeometry(0.34, 6, 4), [Math.cos(k * 1.256) * 0.34, 0.62, Math.sin(k * 1.256) * 0.34], [Math.sin(k * 1.256) * 0.7, 0, -Math.cos(k * 1.256) * 0.7], [0.7, 0.2, 1.7].map((v, i) => i === 2 ? v : v))));
  const cLeaf = new THREE.InstancedMesh(radLeaf, M('#4caf3c', { r: 0.7, sway: 0.25 }), carrots.length);
  carrots.forEach((p, i) => { o.position.set(F.x + p[0], 0.3, F.z + p[1]); o.rotation.set(0, R(0, 3), 0); o.scale.setScalar(R(0.85, 1.2)); o.updateMatrix(); cTop.setMatrixAt(i, o.matrix); o.position.y = 0.3; o.updateMatrix(); cLeaf.setMatrixAt(i, o.matrix); });
  const peaCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.18, 0.7, 0.1), new THREE.Vector3(-0.1, 1.3, 0.2), new THREE.Vector3(0.22, 1.8, 0.1)]);
  const peaG = mergeList([new THREE.TubeGeometry(peaCurve, 8, 0.045, 4, false), ...[0.5, 0.95, 1.4].flatMap((y, k) => [-1, 1].map(sd => bake(new THREE.SphereGeometry(0.28, 6, 4), [sd * 0.28 + 0.05, y, 0.1], [0, 0, sd * 0.5], [1, 0.22, 0.7]))), bake(new THREE.CapsuleGeometry(0.07, 0.34, 3, 5), [0.28, 1.05, 0.2], [0, 0, 1.2]), bake(new THREE.CapsuleGeometry(0.07, 0.3, 3, 5), [-0.2, 0.7, 0.18], [0, 0, -1.1])]);
  const cab1 = new THREE.InstancedMesh(peaG, M('#7bc653', { r: 0.6, ds: true, sway: 0.2 }), cabbages.length);
  cabbages.forEach((p, i) => { o.position.set(F.x + p[0], 0.15, F.z + p[1]); o.rotation.set(0, R(0, 3), 0); o.scale.setScalar(R(0.9, 1.25)); o.updateMatrix(); cab1.setMatrixAt(i, o.matrix); });
  for (const m of [cTop, cLeaf, cab1]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  mergeStatic(g);
  const nC = carrots.length, nB = cabbages.length;
  return (f) => { f = clamp(f, 0, 1); cTop.count = cLeaf.count = Math.round(nC * f); cab1.count = Math.round(nB * f); };
}
// ---------------------------------------------------------------- 村口：四座小拱门（两支铅笔立柱 + 冰棍棍横梁 + 写着字的木牌），门外一条小路一直通到草坪边缘，越走越淡
// 返回每个村口的位置，主线程用来点击、在上方浮“！”（序号 = layout.GATES 的序号）
const gateSignTex = (text, arrow) => ctex(256, 112, (c) => {
  c.fillStyle = '#f6e3b4'; c.fillRect(0, 0, 256, 112); c.strokeStyle = '#a8703c'; c.lineWidth = 7; c.strokeRect(5, 5, 246, 102);
  c.fillStyle = '#4a2c14'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 40px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  c.fillText(text, arrow ? 112 : 128, 58);
  if (arrow) { c.fillStyle = '#d9473b'; c.beginPath(); c.moveTo(222, 22); c.lineTo(246, 52); c.lineTo(231, 52); c.lineTo(231, 88); c.lineTo(213, 88); c.lineTo(213, 52); c.lineTo(198, 52); c.closePath(); c.fill(); }
});
export function buildGates(scene) {
  const { nodes } = startGraph(); const g = new THREE.Group(); scene.add(g); const out = [];
  const pencil = (parent, x, h) => { // 立着的铅笔：黄色六棱杆 + 木头色笔尖 + 黑色笔芯 + 底部一圈金属箍
    add(parent, cylG(0.24, 0.24, h, 6), M('#f2c230', { r: 0.7 }), x, h / 2, 0);
    add(parent, new THREE.ConeGeometry(0.25, 0.62, 6), M('#e9c48f', { r: 0.8 }), x, h + 0.31, 0);
    add(parent, new THREE.ConeGeometry(0.075, 0.2, 6), M('#3a3a42', { r: 0.6 }), x, h + 0.68, 0);
    add(parent, cylG(0.255, 0.255, 0.16, 6), MAT.silver, x, 0.12, 0);
  };
  const stick = (parent, x, y, w) => add(parent, boxG(w, 0.12, 0.42), M('#e6bf86', { r: 0.8 }), x, y, 0);
  let gi = 0;
  for (const n of nodes) {
    if (n.k !== 'gate') continue; const l = Math.hypot(n.x, n.z); const ux = n.x / l, uz = n.z / l; const i = gi++;
    const cx = n.x + ux * 2.5, cz = n.z + uz * 2.5, yaw = Math.atan2(ux, uz); const gy = groundH(cx, cz);
    const gg = new THREE.Group(); gg.position.set(cx, gy, cz); gg.rotation.y = yaw; g.add(gg);
    for (const s of [-1, 1]) pencil(gg, s * 1.85, 3.3);
    for (let k = 0; k < 4; k++) stick(gg, (k - 1.5) * 1.05, 3.5 + (k % 2) * 0.01, 1.2);          // 冰棍棍排成横梁
    add(gg, boxG(4.5, 0.1, 0.1), MAT.woodMid, 0, 3.36, 0.22);
    for (let k = 0; k < 4; k++) add(gg, boxG(0.1, 0.18, 0.1), M('#e6bf86', { r: 0.8 }), (k - 1.5) * 1.05, 3.36, 0.0);
    for (let k = -1; k <= 1; k += 2) add(gg, cylG(0.025, 0.025, 0.55, 5), M('#3a2a1c', { r: 1 }), 0.7 * k, 2.95, 0.12);   // 吊牌的两根绳
    for (let k = 0; k < 6; k++) add(gg, sphereG(0.1, 8, 6), M(['#ff6f91', '#ffd23f', '#ffffff'][k % 3], { r: 0.7 }), -2.0 + k * 0.8, 3.72, 0.05);   // 横梁上的小花
    mergeStatic(gg);
    // 木牌：正面（朝小镇）“往花园外 ↑”，背面（朝门外）“欢迎回家”
    const sg = new THREE.PlaneGeometry(2.0, 0.88);
    for (const [txt, arrow, flip] of [['往花园外', true, 1], ['欢迎回家', false, 0]]) {
      const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: gateSignTex(txt, arrow), toneMapped: false })); m.position.set(0, 2.52, flip ? -0.06 : 0.06); m.rotation.y = flip ? PI : 0; gg.add(m);
    }
    // 门外小路：从门口一直延伸到草坪边缘，越往外越淡
    const N = 16, L0 = 2.5, L1 = EDGE_R + 15 - l; const ph = i * 1.7; const mk = (w, col, dy, a0) => {
      const pos = [], colr = [], idx = []; const c = new THREE.Color(col);
      for (let k = 0; k <= N; k++) { const t = k / N, d = L0 + (L1 - L0) * t; const wob = Math.sin(t * 4 + ph) * 1.3 * t; const px = n.x + ux * d - uz * wob, pz = n.z + uz * d + ux * wob; const tx = ux + (-uz) * Math.cos(t * 4 + ph) * 1.3 * 4 / (L1 - L0), tz = uz + ux * Math.cos(t * 4 + ph) * 1.3 * 4 / (L1 - L0); const tl = Math.hypot(tx, tz), nx = -tz / tl, nz = tx / tl;
        const ww = w * (1 - 0.25 * t) / 2; for (const sgn of [-1, 1]) { const qx = px + nx * ww * sgn, qz = pz + nz * ww * sgn; pos.push(qx, groundH(qx, qz) + dy, qz); colr.push(c.r, c.g, c.b, a0 * (1 - Math.pow(t, 1.6))); } }
      for (let k = 0; k < N; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 4)); geo.setIndex(idx); geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 - dy * 40, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.frustumCulled = false; g.add(mesh);
    };
    mk(3.0, '#d3b07a', 0.045, 0.95); mk(2.2, '#e9d09c', 0.06, 1);
    out.push({ i, x: cx, z: cz, yaw, top: gy + 4.6 });
  }
  return out;
}
// ---------------------------------------------------------------- backdrop giants (摘自原型)
export function buildTree(scene, x, z, s) {
  const g = new THREE.Group(); g.position.set(x, groundH(x, z), z); g.scale.setScalar(s); scene.add(g);
  const bark = M('#8a5a34', { keep: 1 }); add(g, cylG(0.45, 0.65, 3.4, 10), bark, 0, 1.7, 0);
  // 枝杈（平时藏在树冠里，冬天叶子掉光就露出来，上面会积雪）
  const crowns = [[0, 4.6, 0, 2.6], [1.6, 4.0, 0.4, 1.8], [-1.5, 4.1, -0.3, 1.9], [0.3, 5.9, -0.4, 1.8], [-0.4, 4.4, 1.5, 1.7]];
  for (const [bx, by, bz] of crowns) { const p0 = new THREE.Vector3(0, 3.2, 0), p1 = new THREE.Vector3(bx * 0.6, by - 0.4, bz * 0.6), p2 = new THREE.Vector3(bx * 1.15 + R(-0.3, 0.3), by + 0.5, bz * 1.15 + R(-0.3, 0.3)); add(g, taperTube(new THREE.CatmullRomCurve3([p0, p1, p2]), 8, 0.3, 0.06, 6), bark);
    for (let k = 0; k < 2; k++) { const q = p1.clone().lerp(p2, 0.5); const e = q.clone().add(new THREE.Vector3(R(-1.1, 1.1), R(0.4, 1.0), R(-1.1, 1.1))); add(g, taperTube(new THREE.CatmullRomCurve3([q, q.clone().lerp(e, 0.5).add(new THREE.Vector3(0, 0.15, 0)), e]), 5, 0.09, 0.03, 4), bark); } }
  const leafM = M(pick(['#5fb848', '#6cc24e', '#56ad44']), { r: 0.85, fol: 1, drop: 1 });
  for (const [bx, by, bz, br] of crowns) add(g, new THREE.IcosahedronGeometry(br, LOW ? 1 : 2), leafM, bx, by, bz);
  for (let i = 0; i < 5; i++) add(g, sphereG(0.18, 8, 6), M('#ff6f61', { drop: 1 }), R(-2, 2), R(3.8, 6), R(-1, 2.2));
  // 春天的花：贴在树冠表面的一团团粉白小花
  const bloomM = M('#ffc8da', { r: 0.7, bloom: 1 }); const bloomW = M('#fff4f6', { r: 0.7, bloom: 1 });
  for (let i = 0; i < (LOW ? 18 : 30); i++) { const c = pick(crowns); const a = R(0, TAU), b = R(0.1, 1.35); add(g, sphereG(R(0.2, 0.32), 7, 5), i % 3 ? bloomM : bloomW, c[0] + Math.cos(a) * Math.sin(b) * c[3] * 0.97, c[1] + Math.cos(b) * c[3] * 0.97, c[2] + Math.sin(a) * Math.sin(b) * c[3] * 0.97); }
  mergeStatic(g);
}
function buildMushroom(scene, x, z, s) {
  const g = new THREE.Group(); g.position.set(x, surfY(x, z) - 0.05, z); g.scale.setScalar(s); g.rotation.y = R(0, TAU); scene.add(g);
  add(g, lathe([[0.01, 0], [0.42, 0], [0.38, 0.4], [0.32, 1.1], [0.36, 1.3], [0.01, 1.32]], 18), M('#fbf1e0', { r: 0.8 }));
  add(g, lathe([[0.01, 1.2], [1.2, 1.15], [1.35, 1.35], [1.2, 1.75], [0.7, 2.1], [0.01, 2.22]], 28), M('#ffffff', { map: TX.mush, r: 0.5 }));
  add(g, cylG(1.15, 0.4, 0.12, 28), M('#f3dcc0'), 0, 1.16, 0);
  mergeStatic(g);
}
function buildGiantDaisy(scene, x, z, h) {
  const g = new THREE.Group(); g.position.set(x, surfY(x, z), z); scene.add(g); g.rotation.y = R(-0.5, 0.5) + Math.atan2(-x, -z);
  const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, h * 0.4, 0.2), new THREE.Vector3(-0.3, h * 0.8, 0.6), new THREE.Vector3(0, h, 1.2)]);
  add(g, taperTube(c, 20, 0.45, 0.3, 8), M('#4fa63a'));
  const head = new THREE.Group(); head.position.set(0, h, 1.2); head.rotation.x = 1.0; g.add(head);
  const petalG = G('petalS', () => new THREE.SphereGeometry(1, 8, 5));
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; add(head, petalG, M('#ffffff', { r: 0.6 }), Math.cos(a) * h * 0.13, 0, Math.sin(a) * h * 0.13, 0, -a, 0.08, h * 0.11, h * 0.02, h * 0.035); }
  add(head, sphereG(1, 16, 10), M('#ffc928', { r: 0.7 }), 0, h * 0.015, 0, 0, 0, 0, h * 0.07, h * 0.035, h * 0.07);
  for (const s of [-1, 1]) add(g, sphereG(1, 10, 8), M('#4fa63a'), s * 1.0, h * 0.3, 0, 0, 0, s * 0.8, 0.35, 1.8, 0.8);
  mergeStatic(g);
}
function heartLeafGeo() {
  return G('heartLeaf', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(0.3, 0.1, 1.0, 0.4, 1.0, 0.9); s.bezierCurveTo(1.0, 1.3, 0.5, 1.35, 0.0, 1.0); s.bezierCurveTo(-0.5, 1.35, -1.0, 1.3, -1.0, 0.9); s.bezierCurveTo(-1.0, 0.4, -0.3, 0.1, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 1, curveSegments: 5 }); g.translate(0, 0, -0.025); return g; });
}
function buildGiantClover(scene, x, z, h) {
  const g = new THREE.Group(); g.position.set(x, surfY(x, z), z); g.rotation.y = R(0, TAU); scene.add(g);
  const m1 = M('#5cb84a', { r: 0.5, fol: 2.2 }), m2 = M('#4a9e3c', { r: 0.55, fol: 2.2 }), stemM = M('#5aa844', { r: 0.7, fol: 2.2 }), dew = M('#f2fbff', { m: 0.5, r: 0.05 });
  for (let k = 0; k < 2; k++) {
    const hh = h * (k ? 0.65 : 1); const ox = k ? R(2, 3.5) : 0, oz = k ? R(-1, 2) : 0;
    const top = new THREE.Vector3(ox + R(-0.6, 0.6), hh, oz + R(-0.6, 0.6));
    add(g, taperTube(new THREE.CatmullRomCurve3([new THREE.Vector3(ox, 0, oz), new THREE.Vector3(ox + 0.4, hh * 0.5, oz + 0.2), top]), 16, 0.32, 0.18, 7), stemM);
    const L = hh * 0.28;
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + k; const leaf = new THREE.Group(); leaf.position.copy(top); leaf.rotation.set(0, a, 0); g.add(leaf);
      add(leaf, heartLeafGeo(), i % 2 ? m1 : m2, 0, 0, 0, -PI / 2 + 0.3, 0, 0, L, L, L);
      if (rng() < 0.5) add(leaf, sphereG(1, 14, 10), dew, 0, L * 0.12 + 0.1, -L * 0.75, 0, 0, 0, L * 0.09, L * 0.07, L * 0.09); }
  }
  mergeStatic(g);
}
function gateClear(x, z) { const { nodes } = startGraph(); for (const n of nodes) if (n.k === 'gate') { const a = Math.atan2(n.z, n.x), b = Math.atan2(z, x); if (Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.2) return false; } return true; }
export const OUTER_TREES = []; // 花园外圈草坪上的植物丛（蒲公英 / 三叶草 / 狗尾草）[x, z, 避让大小]，放旧物时避开
export function buildBackdrop(scene) {
  const n0 = scene.children.length;
  const ring = (n, r0, r1, f) => { let k = 0; for (let i = 0; i < n * 3 && k < n; i++) { const a = R(0, TAU), r = R(r0, r1); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (streamDist(x, z) < 8 || !gateClear(x, z)) continue; f(x, z); k++; } };
  ring(LOW ? 9 : 14, 90, 100, (x, z) => buildGiantDaisy(scene, x, z, R(12.6, 19.8)));   // 巨型雏菊（真雏菊 30～50 厘米，当远景花树，放大 1.8 倍）
  ring(LOW ? 6 : 10, 88, 100, (x, z) => buildGiantClover(scene, x, z, R(3.3, 5.5)));    // 三叶草缩小到约 0.55 倍
  // 远圈原来的树拿掉（真树 4 米放不进画面），补高大的狗尾草丛和蒲公英
  { let k = 0; ring(LOW ? 8 : 14, 80, 92, (x, z) => { if (k++ % 3 === 2) dandelionPlant(scene, x, groundH(x, z), z, R(11, 14)); else foxtailClump(scene, x, groundH(x, z), z, R(11, 15)); }); }
  // 小镇外圈：蒲公英（开花 / 结球）、三叶草丛、狗尾草丛 —— 季节变化靠它们（位置记下来，放旧物时避开）
  { let k = 0; ring(LOW ? 9 : 12, 54, 59, (x, z) => { const t = k++ % 4; const y = groundH(x, z);
      if (t < 2) { dandelionPlant(scene, x, y, z, R(10, 12)); OUTER_TREES.push([x, z, 1.9]); } else if (t === 2) { cloverClump(scene, x, y, z, R(4.2, 5)); OUTER_TREES.push([x, z, 1.25]); } else { foxtailClump(scene, x, y, z, R(11, 13)); OUTER_TREES.push([x, z, 1.3]); } }); }
  ring(10, 80, 95, (x, z) => buildMushroom(scene, x, z, R(1.2, 2.2)));
  // 地块外一直到雾里：疏疏落落的巨型花草，颜色和近处一致（拉远镜头不空、不穿帮）
  const far = (n, r0, r1, f) => { for (let i = 0, k = 0; i < n * 4 && k < n; i++) { const a = R(0, TAU), r = R(r0, r1); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (streamDistFull(x, z) < 10) continue; f(x, z, k); k++; } };
  far(LOW ? 10 : 22, 104, 260, (x, z) => buildGiantDaisy(scene, x, z, R(14, 24)));
  far(LOW ? 5 : 12, 104, 240, (x, z) => buildGiantClover(scene, x, z, R(4, 7)));
  far(LOW ? 6 : 14, 104, 230, (x, z) => buildMushroom(scene, x, z, R(1.6, 3)));
  far(LOW ? 8 : 20, 104, 280, (x, z, k) => { if (k % 2) dandelionPlant(scene, x, surfY(x, z), z, R(12, 17)); else foxtailClump(scene, x, surfY(x, z), z, R(12, 17)); });
  // 远方的人类花园：巨大的陶土花盆和倒下的浇水壶（提示“物件从那边来”）
  const pg = new THREE.Group(); pg.position.set(-104, groundH(-104, -40), -40); scene.add(pg);
  add(pg, cylG(9, 7, 13, 28), MAT.terracotta, 0, 6.5, 0); add(pg, torusG(9, 0.9, 8, 32), MAT.terracotta, 0, 13, 0, PI / 2); add(pg, sphereG(8, 16, 10), MAT.leaf, 0, 15, 0, 0, 0, 0, 1, 0.6, 1);
  mergeStatic(pg);
  // 人类花园的白色尖头栅栏（远远的一排巨大的木桩）
  const fg = new THREE.Group(); scene.add(fg); const paint = M('#ffffff', { vc: true, r: 0.9 }), rail = M('#ffffff', { vc: true, r: 0.9 });
  const fence = (w, h, d, base, topCol) => { const g = new THREE.BoxGeometry(w, h, d, 1, 8, 1); const P = g.attributes.position, C = new Float32Array(P.count * 3); const c0 = new THREE.Color(base), c1 = new THREE.Color(topCol), c = new THREE.Color(); for (let i = 0; i < P.count; i++) { c.copy(c0).lerp(c1, smooth(0.45, 1.0, P.getY(i) / h + 0.5)); C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(C, 3)); return g; };
  const FK = 4; const postG = fence(0.5 * FK, 9 * FK, 2.0 * FK, '#bf9f72', '#e9dcc0'), railG = new THREE.BoxGeometry(1, 0.7 * FK, 0.35 * FK);
  const fenceArc = (FR, fa0, fa1) => { let prev = null;
    for (let a = fa0; a <= fa1; a += 0.034 * FK * 97 / FR) { const x = Math.cos(a) * FR, z = Math.sin(a) * FR; const y = surfY(x, z);
      const pg2 = new THREE.Group(); pg2.position.set(x, y, z); pg2.rotation.y = -a; fg.add(pg2);
      add(pg2, postG, paint, 0, 9 * FK / 2, 0); add(pg2, new THREE.ConeGeometry(1.42 * FK, 1.6 * FK, 4), paint, 0, 9 * FK + 0.8 * FK, 0, 0, PI / 4, 0, 1, 1, 0.37);
      if (prev) for (const ry of [2.6 * FK, 6.4 * FK]) { const mx = (prev[0] + x) / 2, mz = (prev[1] + z) / 2; const L = Math.hypot(x - prev[0], z - prev[1]); add(fg, railG, rail, mx, (prev[2] + y) / 2 + ry, mz, 0, -Math.atan2(z - prev[1], x - prev[0]), 0, L, 1, 1); }
      prev = [x, z, y]; } };
  fenceArc(97, 2.4, 3.45); fenceArc(135, 0.05, 1.35); fenceArc(175, 4.9, 6.0);   // 近处一段 + 更远的两段，拉远镜头时一直有人类世界的栅栏
  // 一根绿色的浇水软管弯弯曲曲地横在草坪上，一头连着倒下的浇水壶
  const hp = []; for (let i = 0; i <= 24; i++) { const t = i / 24; const a = lerp(3.95, 5.0, t); const r = 84 + Math.sin(t * 9) * 5 + t * 6; const x = Math.cos(a) * r, z = Math.sin(a) * r; hp.push(new THREE.Vector3(x, groundH(x, z) + 0.5, z)); }
  const hg = new THREE.Group(); scene.add(hg); add(hg, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), 120, 0.5, 10, false), M('#3fa35a', { r: 0.45, rim: 0.6 }));
  for (const k of [0, 24]) add(hg, cylG(0.7, 0.7, 1.1, 14), M('#e8b64a', { m: 0.6, r: 0.35 }), hp[k].x, hp[k].y, hp[k].z, 0, 0, PI / 2);
  mergeStatic(hg);
  const cg = new THREE.Group(); cg.position.set(30, groundH(30, -108), -108); cg.rotation.set(0, 0.6, 0); scene.add(cg);
  const tin = M('#7fb2c9', { m: 0.6, r: 0.4 }); add(cg, cylG(7, 7.5, 9, 24), tin, 0, 7, 0, 0, 0, PI / 2 - 0.15); add(cg, cylG(0.9, 1.6, 14, 12), tin, 9, 8, 0, 0, 0, -0.9);
  mergeStatic(cg);
  // 更远处再来几个人类花园的大物件：陶土花盆（盆里探出大草叶）、倒着的铁罐
  const bigPot = (x, z, sc, yaw = 0) => { const q = new THREE.Group(); q.position.set(x, surfY(x, z), z); q.rotation.y = yaw; q.scale.setScalar(sc); scene.add(q);
    add(q, cylG(9, 7, 13, 28), MAT.terracotta, 0, 6.5, 0); add(q, torusG(9, 0.9, 8, 32), MAT.terracotta, 0, 13, 0, PI / 2); add(q, sphereG(8, 16, 10), MAT.leaf, 0, 15, 0, 0, 0, 0, 1, 0.6, 1);
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; add(q, new THREE.ConeGeometry(0.9, 17 + (k % 3) * 4, 4), MAT.green, Math.cos(a) * 3.5, 22, Math.sin(a) * 3.5, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); } mergeStatic(q); };
  bigPot(150, 92, 1.5, 0.4); bigPot(-168, 118, 1.2, 1.2); bigPot(110, -150, 1.8, 2.1);
  const bigTin = (x, z, sc, yaw) => { const q = new THREE.Group(); q.position.set(x, surfY(x, z), z); q.rotation.y = yaw; q.scale.setScalar(sc); scene.add(q); add(q, cylG(7, 7.5, 9, 24), tin, 0, 7, 0, 0, 0, PI / 2 - 0.15); add(q, cylG(0.9, 1.6, 14, 12), tin, 9, 8, 0, 0, 0, -0.9); mergeStatic(q); };
  bigTin(-150, -120, 1.3, 0.9); bigTin(168, 20, 1.6, 2.4);
  // giant grass blades ring
  const segs = 8, pos = [], cl = [], idx = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs; const w = 0.5 * Math.pow(1 - t, 0.75) + 0.02; const zb = t * t * 0.9; pos.push(-w, t, zb, w, t, zb); for (let k = 0; k < 2; k++) cl.push(lerp(0.22, 0.55, t), lerp(0.48, 0.82, t), lerp(0.16, 0.3, t)); }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const list = []; ring(40, 86, 99, (x, z) => { const n = RI(3, 6); for (let k = 0; k < n; k++) list.push([x + R(-2.5, 2.5), z + R(-2, 2), R(5, 12), R(0, TAU)]); });
  // 地块外一直铺到雾里的大草叶丛（拉远镜头时，外面是一片草海，不是光秃秃的平地）
  for (let i = 0, n = LOW ? 140 : 300; i < n; i++) { const a = R(0, TAU), r = Math.sqrt(R(104 * 104, 360 * 360)); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (streamDistFull(x, z) < 9) continue; const m = RI(3, 6); for (let k = 0; k < m; k++) list.push([x + R(-3, 3), z + R(-3, 3), R(6, 15) * (1 + r / 500), R(0, TAU)]); }
  const im = new THREE.InstancedMesh(geo, M('#ffffff', { vc: true, ds: true, r: 0.7, sway: 0.18, rim: 0.5, fol: 2.4 }), list.length); const o = new THREE.Object3D();
  list.forEach(([x, z, h, ry], i) => { o.position.set(x, surfY(x, z) - 0.1, z); o.rotation.set(0, ry, 0); o.scale.set(h * 0.13, h, h * 0.4); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  im.castShadow = false; im.receiveShadow = true; scene.add(im);
  // 远景都在阴影范围外，不投影，省一半三角形
  for (const o of scene.children.slice(n0)) o.traverse(m => { if (m.isMesh) m.castShadow = false; });
}
// ---------------------------------------------------------------- small flora, masked by roads / houses when the town grows
export function buildFlora(scene) {
  const o = new THREE.Object3D(); const c = new THREE.Color(); const sets = [];
  const freeSpot = (x, z) => { const r = Math.hypot(x, z); if (r < PLAZA_R + 0.6 || r > 92) return false; if (streamDist(x, z) < 3.2) return false; for (const s of RESOURCES) if (Math.hypot(x - s.x, z - s.z) < (s.type === 'veg' ? 8 : s.r + 1.2)) return false; return true; };
  // scale = [最小, 最大]；离中心越远长得越高（中心是小动物生活的地方，草矮一点，看得清路和门；外围草丛高过小动物）
  const grow = (x, z) => lerp(1, 1.9, smooth(36, 86, Math.hypot(x, z)));
  const place = (N, clusterN, rad, scale) => { const base = []; let guard = 0;
    while (base.length < N && guard++ < N * 6) { const cx = R(-92, 92), cz = R(-92, 92); if (!freeSpot(cx, cz)) continue; const n = RI(clusterN[0], clusterN[1]); for (let j = 0; j < n && base.length < N; j++) { const x = cx + R(-rad, rad), z = cz + R(-rad, rad); if (!freeSpot(x, z)) continue; o.position.set(x, groundH(x, z) - 0.02, z); o.rotation.set(0, R(0, TAU), 0); o.scale.setScalar(R(scale[0], scale[1]) * grow(x, z)); o.updateMatrix(); base.push({ x, z, m: o.matrix.clone() }); } }
    return base; };
  const make = (geo, mat, N, clusterN, rad, scale, colorF) => {
    const im = new THREE.InstancedMesh(geo, mat, N); const base = place(N, clusterN, rad, scale); if (colorF) base.forEach((b, i) => { colorF(c); im.setColorAt(i, c); });
    base.forEach((b, i) => im.setMatrixAt(i, b.m)); im.count = base.length; im.receiveShadow = true; scene.add(im); sets.push({ im, base }); return im;
  };
  const K = LOW ? 0.7 : 1; // 数量比旧版少 30%（放大以后每簇占的屏幕更大，不增加绘制压力）
  make(makeTuftGeo(7), M('#8fd45a', { vc: true, ds: true, r: 0.9, sway: 0.35, rim: 0.4, fol: 2.5 }), Math.round((LOW ? 1100 : 3000) * 0.7 * K), [1, 3], 2.2, [1.5, 2.9]);
  const petals = new THREE.Shape(); for (let i = 0; i <= 20; i++) { const a = i / 20 * TAU; const r = 0.13 + 0.09 * Math.pow(Math.abs(Math.cos(a * 5)), 0.6); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? petals.lineTo(x, y) : petals.moveTo(x, y); }
  const daisyG = mergeList([tint(new THREE.CylinderGeometry(0.018, 0.022, 0.5, 4).translate(0, 0.25, 0), '#4caf3c'), tint(bake(new THREE.ShapeGeometry(petals), [0, 0.5, 0], [-PI / 2 + 0.25, 0, 0]), '#ffffff'), tint(bake(new THREE.SphereGeometry(0.06, 8, 5), [0, 0.52, 0.01], [0, 0, 0], [1, 0.5, 1]), '#ffc928')], true);
  make(daisyG, M('#ffffff', { vc: true, ds: true, r: 0.7, sway: 0.2, drop: 1 }), Math.round((LOW ? 200 : 500) * 0.7 * K), [3, 7], 1.2, [3, 4.5]);
  const hs = new THREE.Shape(); hs.moveTo(0, 0); hs.bezierCurveTo(0.06, 0.02, 0.2, 0.08, 0.2, 0.18); hs.bezierCurveTo(0.2, 0.26, 0.1, 0.27, 0.0, 0.2); hs.bezierCurveTo(-0.1, 0.27, -0.2, 0.26, -0.2, 0.18); hs.bezierCurveTo(-0.2, 0.08, -0.06, 0.02, 0, 0);
  const heartG = new THREE.ShapeGeometry(hs, 4);
  const leaf3 = [0, 1, 2].map(k => { const g = heartG.clone(); g.rotateX(-PI / 2 + 0.25); g.rotateY(k * TAU / 3); g.translate(0, 0.22, 0); return g; });
  const cloverG = mergeList([new THREE.CylinderGeometry(0.015, 0.02, 0.22, 4).translate(0, 0.11, 0), ...leaf3]);
  make(cloverG, M('#ffffff', { r: 0.7, sway: 0.15, ds: true, rim: 0, fol: 2.5 }), Math.round((LOW ? 260 : 700) * 0.9 * K), [4, 10], 1.6, [3, 4.8], (cc) => cc.setHSL(R(0.27, 0.32), R(0.5, 0.65), R(0.22, 0.3)));
  { // 蒲公英小苗：茎叶（跟着季节变色）+ 黄花（春）+ 白绒球（夏秋）；三块共用同一批位置，遮罩时一起隐藏
    const dg = dandelionInstGeos(7), dm = dandelionMats(); const dBase = place(Math.round((LOW ? 50 : 90) * K), [1, 2], 2.0, [0.6, 1.1]);
    for (const k of ['body', 'bloom', 'puff']) { const im = new THREE.InstancedMesh(dg[k], dm[k], dBase.length); dBase.forEach((b, i) => im.setMatrixAt(i, b.m)); im.count = dBase.length; im.receiveShadow = true; scene.add(im); sets.push({ im, base: dBase }); }
  }
  // 遮罩：房子占地和道路上的花草隐藏（结构变化时调用，网格加速）
  const CELL = 4; const grid = new Map();
  sets.forEach((s, si) => s.base.forEach((b, i) => { const k = Math.floor(b.x / CELL) * 1000 + Math.floor(b.z / CELL); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push([si, i]); }));
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  return function mask(lots, nodes, edges) {
    const hidden = sets.map(s => new Uint8Array(s.base.length));
    const cover = (x0, z0, x1, z1, test) => { for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) { const a = grid.get(gx * 1000 + gz); if (!a) continue; for (const [si, i] of a) { const b = sets[si].base[i]; if (!hidden[si][i] && test(b.x, b.z)) hidden[si][i] = 1; } } };
    for (const l of lots) { const r = l.r * 0.95; cover(l.x - r, l.z - r, l.x + r, l.z + r, (x, z) => Math.hypot(x - l.x, z - l.z) < r); }
    for (const [a, b, d] of edges) { if (!d) continue; const A = nodes[a], B = nodes[b]; const w = d === 2 ? 1.0 : 1.75; cover(Math.min(A[0], B[0]) - w, Math.min(A[1], B[1]) - w, Math.max(A[0], B[0]) + w, Math.max(A[1], B[1]) + w, (x, z) => segDist(x, z, A[0], A[1], B[0], B[1]) < w); }
    sets.forEach((s, si) => { s.base.forEach((b, i) => s.im.setMatrixAt(i, hidden[si][i] ? ZERO : b.m)); s.im.instanceMatrix.needsUpdate = true; });
  };
}
