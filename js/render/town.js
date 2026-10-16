// 场景/渲染·动态小镇：房子实例化（近处高模 + 小动画，远处简化版）、拖运中的物件、下垂的绳子、工地、弯曲小路、炊烟、蜜蜂
// 同一造型的所有房子共享几何体，每个材质桶一个 InstancedMesh；每帧按镜头距离把房子分到高模组或简化组，紧凑写入实例矩阵
import * as THREE from 'three';
import { M, rimU, LOW, PI, TAU, clamp, lerp, mulberry32, ctex, wxShader, wxPatch } from '../lib/core.js';
import { buildTemplate } from '../lib/houses.js';
import { STONE_GEO_LO, STONE_COLS, groundH } from '../lib/environment.js';
import { KINDS, WORLD_R } from '../shared/layout.js';
import { TEMPLATE_KINDS } from '../shared/items.js';

const CAPK = 16;                 // 每种造型每个细节级别的实例容量
export const LOD_D = LOW ? 26 : 95; // （旧）离镜头多近用高模；现在按屏幕上的大小切换，见 LOD_PX
export const LOD_PX = LOW ? 90 : 100; // 房子在屏幕上高于这么多 CSS 像素就用高模；带滞回（上 ×1.15 / 下 ×0.87），不会在阈值附近来回跳
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// 改造阶段生长：顶点绕所属部件中心从 0 放大到 1（带回弹）；原始物件阶段整体做旧发灰
const REV_VERT_HEAD = `attribute float aStg; attribute vec3 aPiv; attribute vec3 aRev;
float jkBack(float t){ if (t <= 0.0) return 0.0; if (t >= 1.0) return 1.0; float u = t - 1.0; return 1.0 + 2.70158*u*u*u + 1.70158*u*u; }`;
const REV_VERT_BODY = `float jkG = aStg < 0.5 ? 1.0 : jkBack(aRev.x - (aStg - 1.0)); transformed = aPiv + (transformed - aPiv) * jkG;`;
function houseMat(b) {
  let m;
  if (b.vc) { const p = b.key.split('|'); m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: +p[1], flatShading: p[2] === 'true' }); }
  else { m = b.src.clone(); m.userData.src = b.src; }
  m.side = THREE.DoubleSide; // 原始物件（杯子、罐子）是开口的，要能看到内壁
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rimU; wxShader(sh); // 屋顶积雪、雨天变湿
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + REV_VERT_HEAD + '\nvarying float vDust; varying float vWip;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + REV_VERT_BODY + '\nvDust = aStg < 0.5 ? aRev.y : 0.0; vWip = aRev.z;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim; varying float vDust; varying float vWip;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ float l = dot(diffuseColor.rgb, vec3(0.3,0.59,0.11)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l)*vec3(0.95,0.88,0.78), vDust*0.5); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l)*vec3(0.9,0.88,0.84), vWip*0.4) * (1.0 - vWip*0.2); }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - vWip;') // 没完工：略灰暗、窗户不亮灯
      .replace('#include <opaque_fragment>', 'outgoingLight += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'house-rev';
  return m;
}
function houseDepth() {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + REV_VERT_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + REV_VERT_BODY); };
  d.customProgramCacheKey = () => 'house-rev-depth'; return d;
}
function discTex(inner, outer) { return ctex(128, 128, (c, w, h) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, inner); g.addColorStop(0.62, inner); g.addColorStop(1, outer); c.fillStyle = g; c.fillRect(0, 0, w, h); }); }
function ringTex() { return ctex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 30, 64, 64, 64); g.addColorStop(0, 'rgba(255,230,140,0)'); g.addColorStop(0.7, 'rgba(255,230,140,0.75)'); g.addColorStop(1, 'rgba(255,230,140,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }); }

export class Town {
  constructor(scene) {
    this.scene = scene; this.sets = {}; this.lots = new Map(); this.proj = new Map(); this.clones = []; this.depth = houseDepth(); this.templateTris = {};
    for (const k of KINDS) this.ensure(k, 'hi');
    const disc = new THREE.PlaneGeometry(2, 2).rotateX(-PI / 2);
    this.siteIM = new THREE.InstancedMesh(disc, new THREE.MeshStandardMaterial({ map: discTex('rgba(150,110,70,0.85)', 'rgba(150,110,70,0)'), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }), 16);
    this.aoIM = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ map: discTex('rgba(30,60,20,0.32)', 'rgba(30,60,20,0)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), 64);
    this.farIM = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ map: ringTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false }), 8);
    for (const m of [this.siteIM, this.aoIM, this.farIM]) { m.count = 0; m.frustumCulled = false; m.renderOrder = -0.5; scene.add(m); }
    const stakes = []; for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; stakes.push(new THREE.BoxGeometry(0.06, 0.6, 0.06).translate(Math.cos(a), 0.3, Math.sin(a))); }
    this.stakeIM = new THREE.InstancedMesh(mergeBoxes(stakes), M('#c98a4e', { r: 0.9 }), 16); this.stakeIM.count = 0; this.stakeIM.frustumCulled = false; this.stakeIM.castShadow = true; scene.add(this.stakeIM);
    // 绳子：每根绳子分 8 段，中间下垂（拉紧时下垂少）
    this.ROPE_SEG = 8;
    this.ropeIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true).translate(0, 0.5, 0).rotateX(PI / 2), M('#d9b77a', { r: 0.9 }), 64 * this.ROPE_SEG);
    this.ropeIM.count = 0; this.ropeIM.frustumCulled = false; this.ropeIM.castShadow = true; scene.add(this.ropeIM);
    // 蜜蜂：近处的蜂蜜罐屋/点心铺周围绕圈
    const beeG = new THREE.SphereGeometry(0.11, 8, 6).scale(1, 0.85, 1.3);
    const wingG = new THREE.SphereGeometry(0.09, 6, 4).scale(1.4, 0.15, 0.7);
    const bg = mergeGeoms([tintG(beeG, '#ffc928'), tintG(new THREE.TorusGeometry(0.1, 0.025, 4, 10).rotateY(PI / 2), '#3a2a1a'), tintG(wingG.clone().translate(0.11, 0.09, 0), '#eaf6ff'), tintG(wingG.clone().translate(-0.11, 0.09, 0), '#eaf6ff')]);
    this.beeIM = new THREE.InstancedMesh(bg, M('#ffffff', { vc: true, r: 0.5 }), 48); this.beeIM.count = 0; this.beeIM.frustumCulled = false; scene.add(this.beeIM);
    this.buildSmoke(); this.buildDecor(scene);
  }
  // 造型按需构建（高模开局就建好 9 种基础造型；简化版和店铺造型第一次用到时再建）
  ensure(rk, lod) {
    const S = this.sets[rk] || (this.sets[rk] = {}); if (S[lod]) return S[lod];
    const T = buildTemplate(rk, lod === 'lo'); this.templateTris[rk + ':' + lod] = T.tris;
    const mk = (buckets) => {
      const mat4 = new THREE.InstancedBufferAttribute(new Float32Array(CAPK * 16), 16); mat4.setUsage(THREE.DynamicDrawUsage);
      const rev = new THREE.InstancedBufferAttribute(new Float32Array(CAPK * 3), 3); // 改造进度、做旧程度、未完工（0～1） rev.setUsage(THREE.DynamicDrawUsage);
      const meshes = buckets.map(b => {
        b.geo.setAttribute('aRev', rev); const mat = houseMat(b); if (mat.userData.src) this.clones.push(mat);
        const m = new THREE.InstancedMesh(b.geo, mat, CAPK); m.instanceMatrix = mat4; m.count = 0; m.customDepthMaterial = this.depth;
        m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.visible = false; this.scene.add(m); return m;
      });
      return { meshes, mat4, rev, n: 0 };
    };
    const set = mk(T.buckets); set.T = T; set.dyn = T.dyn.map(d => ({ type: d.type, pivot: d.pivot, ...mk(d.buckets) }));
    return (S[lod] = set);
  }
  fitPoints() { const P = [[-20, 0, -20], [20, 0, 20], [-20, 0, 20], [20, 0, -20]]; for (const d of this.lots.values()) { if (d.stage === 'far') continue; const h = this.sets[d.kind].hi.T.h; for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) P.push([d.lx + ox * d.r, 0, d.lz + oz * d.r]); P.push([d.lx, h, d.lz]); } return P; }
  extent() { let e = 26; for (const d of this.lots.values()) if (d.stage !== 'far') e = Math.max(e, Math.hypot(d.lx, d.lz) + d.r); return e; }
  meta() { const o = {}; for (const k of KINDS) { const T = this.sets[k].hi.T; o[k] = { r: +(T.r * 0.92).toFixed(2), door: T.door.map(v => +v.toFixed(2)), h: +T.h.toFixed(2) }; } return o; }
  setStruct(st) {
    const seen = new Set();
    for (const l of st.lots) {
      if (!TEMPLATE_KINDS.has(l.kind)) continue; // 没有房子模板的旧物由 render/props.js 画
      seen.add(l.id); let d = this.lots.get(l.id);
      if (!d) { const pd = this.pendingDrop; const fall = l.stage === 'landed' && pd && Math.hypot(pd.x - l.x, pd.z - l.z) < 0.5 && performance.now() - pd.t < 4000;
        d = { id: l.id, kind: l.kind, x: l.x, z: l.z, yaw: l.rot, roll: 0, reveal: l.done ? 3 : 0, dust: l.done ? 0 : l.stage === 'landed' ? 0.1 : 1, pop: 1, door: 0, doorT: 0, seen: false, fall: fall ? 1 : 0 }; this.lots.set(l.id, d); }
      if (l.done && d.done === false) d.pop = 0;
      Object.assign(d, { up: l.up, tier: l.tier || 0, rk: l.rk, lx: l.x, lz: l.z, rot: l.rot, r: l.r, done: l.done, stage: l.stage, name: l.name, use: l.use, doorP: l.door });
      if (!d.seen) { d.seen = true; d.x = l.x; d.z = l.z; d.yaw = l.rot; }
    }
    for (const id of [...this.lots.keys()]) if (!seen.has(id)) this.lots.delete(id);
  }
  setProjects(list) { this.proj.clear(); for (const p of list) this.proj.set(p.lot, p); }
  // 进屋用：这栋房子（完工的高模）的所有零件，按材质桶给出（门和风向标烘在原位），坐标是房子本地坐标
  cutParts(id) {
    const d = this.lots.get(id); if (!d || !d.done || d.stage !== 'done') return null; const S = this.ensure(d.rk, 'hi'); const T = S.T;
    const parts = T.buckets.map(b => ({ geo: b.geo, src: b.src, vc: b.vc, key: b.key, m: null }));
    for (const dy of T.dyn) for (const b of dy.buckets) parts.push({ geo: b.geo, src: b.src, vc: b.vc, key: b.key, m: dy.pivot });
    return { parts, base: T.base, rk: d.rk, x: d.x, z: d.z, yaw: d.yaw, y: Math.hypot(d.x, d.z) > WORLD_R + 4 ? groundH(d.x, d.z) : 0, r: T.r, h: T.h, door: T.door, doorY: T.doorY, tmpl: true };
  }
  // 每帧：插值位置、分高低模写实例矩阵与改造进度、门和风向标、蜜蜂、绳子、炊烟
  update(dt, t, chars, camera) {
    let nSite = 0, nAo = 0, nRope = 0, nFar = 0, nBee = 0; const smokeSrc = this.smokeSrc; smokeSrc.length = 0;
    for (const rk in this.sets) for (const lod in this.sets[rk]) { const S = this.sets[rk][lod]; S.n = 0; for (const d of S.dyn) d.n = 0; }
    for (const k in this.decor) this.decor[k].n = 0;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z; this.nHi = 0; this.nLo = 0; const pxK = innerHeight / (2 * Math.tan(camera.fov * PI / 360)); // 世界长度 / 距离 × pxK = 屏幕像素
    for (const d of this.lots.values()) {
      const p = this.proj.get(d.id); const far = d.stage === 'far';
      let tx = d.lx, tz = d.lz, tyaw = d.rot, reveal = 3, dust = 0, moving = 0;
      if (far) { reveal = 0; dust = 1; }
      else if (d.stage === 'landed') { reveal = 0; dust = 0.1; }
      else if (p && (p.stage === 'gather' || p.stage === 'haul')) { tx = p.x; tz = p.z; tyaw = p.yaw; reveal = 0; dust = 1; moving = p.moving; }
      else if (p && p.stage === 'renovate') { tyaw = p.yaw; reveal = clamp(p.prog, 0, 1) * 3.0; dust = 1 - clamp(p.prog * 3, 0, 1); }
      else if (!d.done) { reveal = 0; dust = 1; }
      if (d.use === 'deco' && d.done) { reveal = 0; dust = 0; }
      const k = Math.min(1, dt * 5); const jump = Math.hypot(tx - d.x, tz - d.z) > 30;
      d.x = jump ? tx : lerp(d.x, tx, k); d.z = jump ? tz : lerp(d.z, tz, k); d.yaw += Math.atan2(Math.sin(tyaw - d.yaw), Math.cos(tyaw - d.yaw)) * (jump ? 1 : k);
      d.reveal += (reveal - d.reveal) * Math.min(1, dt * 2.5); d.dust += (dust - d.dust) * Math.min(1, dt * 2);
      const wip = !d.done && !far && d.stage !== 'landed' ? 1 : 0; d.wip = d.wip == null ? wip : d.wip + (wip - d.wip) * Math.min(1, dt * 1.5); // 未完工：略灰暗、不亮窗灯
      if (d.pop < 1) d.pop = Math.min(1, d.pop + dt * 1.6);
      const popS = 1 + Math.sin(d.pop * PI) * 0.06 * (1 - d.pop * 0.3);
      const sway = moving ? Math.sin(t * 2.2 + d.id) * 0.045 : 0, pitch = moving ? Math.sin(t * 4.4 + d.id) * 0.018 : 0;
      d.roll += (sway - d.roll) * Math.min(1, dt * 4);
      let y = Math.hypot(d.x, d.z) > WORLD_R + 4 ? groundH(d.x, d.z) : 0;
      if (d.fall > 0) { d.fall = Math.max(0, d.fall - dt * 1.6); y += d.fall * d.fall * 9; if (d.fall === 0 && this.onLand) this.onLand(d.x, d.z, d.r); }
      if (d.id === this.hideId) continue; // 正在进屋：这栋房子换成剖面模型（render/interior.js）
      const dist = Math.hypot(d.x - cx, y - cy, d.z - cz); const Th = this.sets[d.rk] && this.sets[d.rk].hi ? this.sets[d.rk].hi.T : null; const px = (Th ? Math.max(Th.h, Th.r * 1.4) : 6) / Math.max(1, dist) * pxK;
      if (!d.lod) d.lod = px > LOD_PX ? 'hi' : 'lo'; else if (d.lod === 'lo' && px > LOD_PX * 1.15) d.lod = 'hi'; else if (d.lod === 'hi' && px < LOD_PX * 0.87) d.lod = 'lo';
      const lod = d.lod;
      const S = this.ensure(d.rk, lod); if (S.n >= CAPK) continue; const i = S.n++; if (lod === 'hi') this.nHi++; else this.nLo++;
      _q.setFromEuler(_e.set(pitch, d.yaw, d.roll, 'YXZ')); _m.compose(_v.set(d.x, y + (moving ? Math.abs(Math.sin(t * 4.4 + d.id)) * 0.05 : 0), d.z), _q, _s.set(popS, popS, popS));
      _m.toArray(S.mat4.array, i * 16); S.rev.array[i * 3] = d.reveal; S.rev.array[i * 3 + 1] = d.dust; S.rev.array[i * 3 + 2] = d.wip;
      const T = S.T;
      if (lod === 'hi' && S.dyn.length) { // 小动画：门有人进出时打开，风向标随风转
        let open = 0;
        if (d.done && d.doorP && chars) for (const c of chars.values()) { if (Math.abs(c.x - d.doorP[0]) < 2.2 && Math.abs(c.z - d.doorP[1]) < 2.2 && Math.hypot(c.x - d.doorP[0], c.z - d.doorP[1]) < 1.9 && c.vis > 0.02) { open = 1; break; } }
        d.door += ((open ? -1.25 : 0) - d.door) * Math.min(1, dt * (open ? 5 : 2.5));
        for (const dy of S.dyn) {
          if (dy.n >= CAPK) continue; const j = dy.n++;
          if (dy.type === 'door') _m2.makeRotationY(d.door); else _m2.makeRotationY(t * 0.9 + Math.sin(t * 0.37 + d.id) * 1.4);
          _m2.premultiply(dy.pivot).premultiply(_m); _m2.toArray(dy.mat4.array, j * 16); dy.rev.array[j * 3] = d.reveal; dy.rev.array[j * 3 + 1] = d.dust; dy.rev.array[j * 3 + 2] = d.wip;
        }
        if (d.rk.startsWith('honey') && d.done) for (let b = 0; b < 6 && nBee < 48; b++) { // 蜜蜂
          const ph = t * (0.9 + b * 0.13) + b * 1.7 + d.id; const rr = T.r * (0.7 + 0.25 * Math.sin(ph * 0.7)); const hy = T.h * (0.45 + 0.25 * Math.sin(ph * 1.3 + b));
          const bx = d.x + Math.cos(ph) * rr, bz = d.z + Math.sin(ph) * rr; _q.setFromEuler(_e.set(0, -ph, Math.sin(t * 30 + b) * 0.2)); _m2.compose(_v.set(bx, hy, bz), _q, _s.set(1, 1, 1)); this.beeIM.setMatrixAt(nBee++, _m2);
        }
      }
      if (d.done && d.stage === 'done' && (d.tier > 0 || d.use === 'shed')) this.writeDecor(d, T, t);
      if ((far || d.stage === 'landed') && nFar < 8) { const s2 = T.r * (1.35 + 0.12 * Math.sin(t * 2 + d.id)); _m2.compose(_v.set(d.x, y + 0.06, d.z), _q.identity(), _s.set(s2, 1, s2)); this.farIM.setMatrixAt(nFar++, _m2); }
      if (!d.done && !far && !d.up && d.stage !== 'landed' && d.stage !== 'pick' && nSite < 16) { _m2.compose(_v.set(d.lx, 0.03, d.lz), _q.identity(), _s.set(d.r * 1.05, 1, d.r * 1.05)); this.siteIM.setMatrixAt(nSite, _m2); this.stakeIM.setMatrixAt(nSite, _m2); nSite++; }
      if ((reveal >= 3 || d.done) && nAo < 64) { _m2.compose(_v.set(d.x, 0.02, d.z), _q.identity(), _s.set(T.r * 1.15, 1, T.r * 1.15)); this.aoIM.setMatrixAt(nAo++, _m2); }
      if (d.done && T.smoke && smokeSrc.length < 48 * 3) { const c = Math.cos(d.yaw), s = Math.sin(d.yaw); smokeSrc.push(d.x + T.smoke[0] * c + T.smoke[2] * s, T.smoke[1], d.z - T.smoke[0] * s + T.smoke[2] * c); }
      // 绳子：从队员的手连到物件前缘，中间下垂
      if (p && p.stage === 'haul' && chars) {
        const ax = d.x + Math.sin(d.yaw) * T.r * 0.55, az = d.z + Math.cos(d.yaw) * T.r * 0.55, ay = y + Math.min(1.1, T.h * 0.25);
        for (const id of p.team) { const c = chars.get(id); if (!c || nRope + this.ROPE_SEG > 64 * this.ROPE_SEG) continue; const hx = c.x + Math.sin(c.yaw) * 0.25, hz = c.z + Math.cos(c.yaw) * 0.25, hy = c.y + 0.62;
          const L = Math.hypot(hx - ax, hy - ay, hz - az); if (L < 0.05) continue; const sag = L * (p.moving ? 0.06 : 0.13) + 0.06;
          for (let sgi = 0; sgi < this.ROPE_SEG; sgi++) {
            const t0 = sgi / this.ROPE_SEG, t1 = (sgi + 1) / this.ROPE_SEG;
            _a.set(lerp(ax, hx, t0), lerp(ay, hy, t0) - sag * 4 * t0 * (1 - t0), lerp(az, hz, t0)); _b.set(lerp(ax, hx, t1), lerp(ay, hy, t1) - sag * 4 * t1 * (1 - t1), lerp(az, hz, t1));
            const sl = _a.distanceTo(_b); _m2.lookAt(_a, _b, _up); _q.setFromRotationMatrix(_m2); _q.multiply(_flip); _m2.compose(_a, _q, _s.set(1, 1, sl * 1.04)); this.ropeIM.setMatrixAt(nRope++, _m2);
          }
        }
      }
    }
    const g = this.ghost; // 放置模式：悬浮在镜头前的旧物（模板造型的原始样子）
    if (g && g.show !== false) { const S = this.ensure(g.kind, 'hi'); if (S.n < CAPK) { const i = S.n++; _q.setFromEuler(_e.set(Math.sin(t * 1.6) * 0.04, g.yaw, Math.sin(t * 1.3) * 0.05)); _m.compose(_v.set(g.x, g.y + g.h, g.z), _q, _s.set(1, 1, 1)); _m.toArray(S.mat4.array, i * 16); S.rev.array[i * 3] = 0; S.rev.array[i * 3 + 1] = 0; S.rev.array[i * 3 + 2] = 0; for (const dy of S.dyn) if (dy.n < CAPK) { const j = dy.n++; _m2.copy(dy.pivot).premultiply(_m); _m2.toArray(dy.mat4.array, j * 16); dy.rev.array[j * 3] = 0; dy.rev.array[j * 3 + 1] = 0; dy.rev.array[j * 3 + 2] = 0; } } }
    for (const rk in this.sets) for (const lod in this.sets[rk]) {
      const S = this.sets[rk][lod]; const upd = (G) => { for (const m of G.meshes) { m.count = G.n; m.visible = G.n > 0; } if (G.n) { G.mat4.needsUpdate = true; G.rev.needsUpdate = true; } };
      upd(S); for (const dy of S.dyn) upd(dy);
    }
    for (const k in this.decor) { const D = this.decor[k]; D.im.count = D.n; D.im.visible = D.n > 0; D.im.instanceMatrix.needsUpdate = true; }
    this.siteIM.count = this.stakeIM.count = nSite; this.aoIM.count = nAo; this.ropeIM.count = nRope; this.farIM.count = nFar; this.beeIM.count = nBee;
    for (const m of [this.siteIM, this.stakeIM, this.aoIM, this.ropeIM, this.farIM, this.beeIM]) { m.instanceMatrix.needsUpdate = true; m.visible = m.count > 0; }
    this.farIM.material.opacity = 0.55 + 0.35 * Math.sin(t * 2.4);
    for (const m of this.clones) { const s = m.userData.src; if (s.emissive) m.emissiveIntensity = s.emissiveIntensity; if (s.envMap) m.envMapIntensity = s.envMapIntensity; }
    this.updateSmoke(t);
  }
  // ---------------------------------------------------------------- 翻新升级的生活痕迹：花盆、门前小路、晾衣绳、小信箱、窗台花箱、屋顶小旗（储物棚多两只木箱）
  buildDecor(scene) {
    const C = (g, col) => tintG(g, col); const cyl = (a, b, h, n = 8) => new THREE.CylinderGeometry(a, b, h, n);
    const pot = mergeGeoms([C(cyl(0.3, 0.22, 0.42, 10).translate(0, 0.21, 0), '#d0764a'), C(new THREE.SphereGeometry(0.32, 8, 6).scale(1, 0.75, 1).translate(0, 0.55, 0), '#4f9f3a'),
      ...[0, 1, 2, 3].map(k => C(new THREE.SphereGeometry(0.09, 6, 4).translate(Math.cos(k * 1.6) * 0.2, 0.74, Math.sin(k * 1.6) * 0.2), ['#ff6f91', '#ffd23f', '#ffffff', '#ff9a3c'][k]))]);
    const stone = mergeGeoms([0, 1, 2].map(k => C(cyl(0.34 - k * 0.03, 0.38 - k * 0.03, 0.08, 9).translate(Math.sin(k * 2.1) * 0.25, 0.04, k * 0.75), ['#e6d6b8', '#d9c3a0', '#e2cfae'][k])));
    const line = mergeGeoms([...[-1.5, 1.5].map(z => C(cyl(0.06, 0.07, 1.9, 6).translate(0, 0.95, z), '#8a5530')), C(cyl(0.015, 0.015, 3, 4).rotateX(PI / 2).translate(0, 1.75, 0), '#f1e7d2'),
      ...[[-0.8, '#ff9aa8', 0.5], [0, '#8fc6e8', 0.62], [0.75, '#ffd75e', 0.45]].map(([z, col, h]) => C(new THREE.BoxGeometry(0.03, h, 0.5).translate(0, 1.72 - h / 2, z), col))]);
    const mail = mergeGeoms([C(cyl(0.05, 0.05, 1.0, 6).translate(0, 0.5, 0), '#8a5530'), C(new THREE.BoxGeometry(0.32, 0.26, 0.44).translate(0, 1.1, 0), '#5aa9e6'), C(new THREE.CylinderGeometry(0.16, 0.16, 0.44, 10, 1, false, 0, PI).rotateX(PI / 2).rotateY(PI / 2).translate(0, 1.23, 0), '#5aa9e6'), C(new THREE.BoxGeometry(0.03, 0.2, 0.08).translate(0.18, 1.25, 0.12), '#e8433a')]);
    const plant = mergeGeoms([C(new THREE.BoxGeometry(0.4, 0.28, 1.1).translate(0, 0.56, 0), '#b27242'), ...[0, 1, 2].map(k => C(new THREE.BoxGeometry(0.06, 0.42, 0.06).translate(0, 0.21, -0.45 + k * 0.45), '#8a5530')),
      ...[0, 1, 2, 3, 4].map(k => C(new THREE.SphereGeometry(0.12, 6, 4).translate((k % 2) * 0.08 - 0.04, 0.78, -0.42 + k * 0.21), ['#ff6f91', '#c77dff', '#ffd23f', '#ffffff', '#ff9a3c'][k]))]);
    const pole = C(cyl(0.035, 0.04, 1.4, 6).translate(0, 0.7, 0), '#6b4a2a');
    const fs = new THREE.BufferGeometry(); fs.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.35, 0, 0, 0.95, 0, 0.75, 1.15, 0], 3)); fs.computeVertexNormals();
    const flag = C(fs, '#f39a3d');
    const crate = mergeGeoms([C(new THREE.BoxGeometry(0.8, 0.6, 0.7).translate(0, 0.3, 0), '#c98a4e'), C(new THREE.BoxGeometry(0.6, 0.45, 0.55).translate(0.1, 0.83, 0.05), '#b27242'), C(new THREE.BoxGeometry(0.7, 0.4, 0.6).translate(0, 0.2, 0.85), '#d9a066')]);
    const mat = M('#ffffff', { vc: true, r: 0.8 }), matDS = M('#ffffff', { vc: true, r: 0.8, ds: true });
    const mk = (g, n, m = mat) => { const im = new THREE.InstancedMesh(g, m, n); im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; scene.add(im); return { im, n: 0, cap: n }; };
    this.decor = { pot: mk(pot, 64), stone: mk(stone, 32), line: mk(line, 32), mail: mk(mail, 32), plant: mk(plant, 32), pole: mk(pole, 32), flag: mk(flag, 32, matDS), crate: mk(crate, 8) };
  }
  writeDecor(d, T, t) { // 本地坐标：x 横向，z 朝门外；r 占地半径，h 高度，门在 T.door
    const r = T.r * 0.9, [dx, dz] = T.door, tier = d.tier;
    const put = (k, x, z, yaw = 0, y = 0, sc = 1) => { const D = this.decor[k]; if (D.n >= D.cap) return; _q.setFromEuler(_e.set(0, yaw, 0)); _m2.compose(_v.set(x, y, z), _q, _s.set(sc, sc, sc)); _m2.premultiply(_m); D.im.setMatrixAt(D.n++, _m2); };
    if (d.use === 'shed') { put('crate', r + 0.5, -r * 0.2, 0.3); put('crate', -r - 0.4, r * 0.1, -0.5, 0, 0.8); }
    if (tier >= 1) { put('pot', dx - r * 0.75 - 0.4, dz - 0.6); put('pot', dx + r * 0.75 + 0.4, dz - 0.7, 1, 0, 0.85); put('stone', dx + 0.1, dz + 0.55); }
    if (tier >= 2) { put('line', -r - 0.9, -r * 0.15, 0, 0, Math.max(0.7, r / 3.2)); put('mail', d.use === 'shop' ? dx - 3.7 : dx + r * 0.7 + 1.0, dz + 0.4, -0.3); }
    if (tier >= 3) { put('plant', r + 0.35, -r * 0.35); put('pole', 0.15, -0.1, 0, T.h - 0.25); put('flag', 0.15, -0.1, Math.sin(t * 2.1 + d.id) * 0.5 + 0.6, T.h - 0.25); }
  }
  // ---------------------------------------------------------------- 炊烟（原型的点精灵烟雾）
  buildSmoke() {
    const per = 10, N = 48 * per; this.smokeSrc = []; this.smokePer = per;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(N), 1)); geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(N), 1));
    this.smokeSeed = new Float32Array(N).map(() => Math.random());
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uScale: { value: 400 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/-mv.z; gl_Position=projectionMatrix*mv; vA=aAlpha; }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); float a=smoothstep(0.5,0.1,r)*vA; if(a<0.01) discard; gl_FragColor=vec4(uColor*(0.92+0.08*(1.0-r*2.0)),a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
    this.smoke = new THREE.Points(geo, mat); this.smoke.frustumCulled = false; this.scene.add(this.smoke); this.smokeMat = mat;
  }
  updateSmoke(t) {
    const geo = this.smoke.geometry; const pos = geo.attributes.position.array, size = geo.attributes.aSize.array, al = geo.attributes.aAlpha.array; const per = this.smokePer; const S = this.smokeSrc;
    const n = S.length / 3;
    for (let k = 0; k < n; k++) for (let j = 0; j < per; j++) {
      const i = k * per + j; const a = ((t / 5.5 + j / per + this.smokeSeed[i] * 0.05) % 1); const drift = a * a * 2.4;
      pos[i * 3] = S[k * 3] + drift * 0.8 + Math.sin(t * 0.8 + i) * 0.25 * a; pos[i * 3 + 1] = S[k * 3 + 1] + a * 3.6; pos[i * 3 + 2] = S[k * 3 + 2] - drift * 0.3 + Math.cos(t * 0.6 + i) * 0.2 * a;
      size[i] = 0.45 + a * 1.6; al[i] = Math.sin(Math.min(a * 4, 1) * PI / 2) * (1 - a) * 0.5;
    }
    geo.setDrawRange(0, n * per); this.smoke.visible = n > 0;
    geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true;
  }
}
const _flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), PI);
function mergeBoxes(list) { const g = new THREE.BufferGeometry(); const pos = [], nor = [], idx = []; let off = 0; for (const b of list) { const p = b.attributes.position.array, n = b.attributes.normal.array; pos.push(...p); nor.push(...n); for (const i of b.index.array) idx.push(i + off); off += p.length / 3; } g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g; }
function tintG(g, col) { g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(col); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; }
function mergeGeoms(list) { const g = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'color']) { const arrs = list.map(x => x.attributes[k].array); const tot = arrs.reduce((a, b) => a + b.length, 0); const out = new Float32Array(tot); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } g.setAttribute(k, new THREE.BufferAttribute(out, 3)); } return g; }

// ---------------------------------------------------------------- 路网（实例化的路段 + 路口圆角 + 铺路石）：路被切成很多小段，所以能弯
const ROAD_W = { 1: [3.0, 2.3], 2: [1.7, 1.15], 3: [2.3, 1.6] };
export class Roads {
  constructor(scene) {
    const seg = new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2).translate(0.5, 0, 0); const cap = new THREE.CircleGeometry(0.5, 9).rotateX(-PI / 2);
    const mk = (geo, col, y, n) => { const m = new THREE.InstancedMesh(geo, wxPatch(new THREE.MeshStandardMaterial({ color: col, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 - y * 40, polygonOffsetUnits: -2 })), n); m.receiveShadow = true; m.count = 0; m.frustumCulled = false; m.userData.y = y; scene.add(m); return m; };
    this.CAP = 2400; this.segB = mk(seg, '#d3b07a', 0.02, this.CAP); this.capB = mk(cap, '#d3b07a', 0.02, this.CAP);
    this.segF = mk(seg, '#e9d09c', 0.035, this.CAP); this.capF = mk(cap, '#e9d09c', 0.035, this.CAP);
    this.stones = new THREE.InstancedMesh(STONE_GEO_LO(), M('#ffffff', { r: 0.92, rim: 0.4 }), 900); this.stones.receiveShadow = true; this.stones.count = 0; this.stones.frustumCulled = false; scene.add(this.stones);
  }
  rebuild(nodes, edges) {
    const capW = new Map(); let ns = 0, nc = 0, nst = 0; const o = new THREE.Object3D(); const col = new THREE.Color();
    for (const [a, b, d] of edges) {
      if (!d || ns >= this.CAP) continue; const A = nodes[a], B = nodes[b]; const dx = B[0] - A[0], dz = B[1] - A[1]; const len = Math.hypot(dx, dz); if (len < 0.01) continue; const w = ROAD_W[d];
      for (const [im, ww] of [[this.segB, w[0]], [this.segF, w[1]]]) { const ext = ww * 0.09; o.position.set(A[0] - dx / len * ext, im.userData.y, A[1] - dz / len * ext); o.rotation.set(0, Math.atan2(-dz, dx), 0); o.scale.set(len + ext * 2, 1, ww); o.updateMatrix(); im.setMatrixAt(ns, o.matrix); }
      ns++;
      for (const n of [a, b]) { const c = capW.get(n); if (!c || c[0] < w[0]) capW.set(n, w); }
      const rnd = mulberry32(Math.round(A[0] * 73 + A[1] * 131 + B[0] * 17 + B[1] * 29));
      const R_ = (p, q) => p + (q - p) * rnd();
      for (let s = 0.5; s < len && nst < 900; s += R_(1.2, 2.2)) { if (rnd() < (d === 1 ? 0.4 : 0.6)) continue; const t = s / len; const lx = -dz / len, lz = dx / len; const off = R_(-1, 1) * w[1] * 0.38;
        o.position.set(lerp(A[0], B[0], t) + lx * off, 0.04 + R_(0, 0.03), lerp(A[1], B[1], t) + lz * off); o.rotation.set(0, R_(0, TAU), 0); const sc = R_(0.26, d === 1 ? 0.5 : 0.38); o.scale.set(sc * R_(1, 1.25), R_(0.8, 1.3), sc); o.updateMatrix(); this.stones.setMatrixAt(nst, o.matrix); col.set(STONE_COLS[Math.floor(rnd() * STONE_COLS.length)]); this.stones.setColorAt(nst, col); nst++; }
    }
    // 只在路口、尽头和明显拐弯处放圆角；平缓弯处靠路段两头略微延长互相盖住
    const nb = new Map(); for (const [a, b, d] of edges) { if (!d) continue; if (!nb.has(a)) nb.set(a, []); if (!nb.has(b)) nb.set(b, []); nb.get(a).push(b); nb.get(b).push(a); }
    for (const [n, w] of capW) { if (nc >= this.CAP) break; const P = nodes[n];
      const nn = nb.get(n); if (nn && nn.length === 2) { const A = nodes[nn[0]], B = nodes[nn[1]]; const a1 = Math.atan2(P[1] - A[1], P[0] - A[0]), a2 = Math.atan2(B[1] - P[1], B[0] - P[0]); if (Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) < 0.32) continue; } for (const [im, ww] of [[this.capB, w[0]], [this.capF, w[1]]]) { o.position.set(P[0], im.userData.y, P[1]); o.rotation.set(0, 0, 0); o.scale.set(ww, 1, ww); o.updateMatrix(); im.setMatrixAt(nc, o.matrix); } nc++; }
    this.segB.count = this.segF.count = ns; this.capB.count = this.capF.count = nc; this.stones.count = nst;
    for (const m of [this.segB, this.segF, this.capB, this.capF, this.stones]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}
