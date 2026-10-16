// 鸡块（Lenia 家的白团子，lenia-model.js 的 createNugget）当小吉祥物常驻花园：沿着小路和广场蹦蹦跳跳、偶尔停在居民旁边、夜里靠在祭坛边睡觉。
// 纯表现层（不进模拟）；点它由 main.js 处理（hit()）。另外放着「金圈」：放置模式里能和手里旧物拼起来的地方（位置来自 shared/items.js 的 goldRings）。
import * as THREE from 'three';
import { PI, TAU, clamp, lerp } from '../lib/core.js';
import { createNugget, NUGGET_H } from '../lib/lenia-model.js';
import { RESIDENT_H } from '../lib/lenia-model.js';

export const NUGGET_SIZE = RESIDENT_H * 1.45; // 比居民略大（约 1.45 倍居民身高），不用原来的巨型尺寸
const SPEED = 2.4;
const ALTAR_R = 5.1; // 祭坛最下面一层石台半径 4.3，靠在边上

export class Nugget {
  constructor(scene) {
    this.m = createNugget(); this.g = new THREE.Group(); this.g.add(this.m.group); this.g.scale.setScalar(NUGGET_SIZE / NUGGET_H);
    this.m.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(this.g);
    this.x = 6.5; this.z = -2.5; this.yaw = 0; this.path = []; this.wait = 2; this.state = 'idle'; this.hold = 0; this.adj = null; this.nodes = null; this.near = null; this.pose = 'idle';
    this.top = NUGGET_SIZE;
  }
  setStruct(st) { // 只走正经的路（环路、土路），不走门口小径和桥
    this.nodes = st.nodes.map(n => [n[0], n[1]]); const adj = this.nodes.map(() => []);
    for (const [a, b, d] of st.edges) if ((d === 1 || d === 3) && adj[a] && adj[b]) { adj[a].push(b); adj[b].push(a); }
    this.adj = adj;
  }
  nearestNode(x, z) { let b = -1, bd = 1e9; if (!this.nodes) return -1; this.nodes.forEach((p, i) => { if (!this.adj[i].length) return; const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; b = i; } }); return b; }
  bfs(a, b) { if (a < 0 || b < 0) return []; const prev = new Map([[a, -1]]); const q = [a]; while (q.length) { const u = q.shift(); if (u === b) break; for (const v of this.adj[u]) if (!prev.has(v)) { prev.set(v, u); q.push(v); } } if (!prev.has(b)) return []; const out = []; for (let c = b; c !== -1; c = prev.get(c)) out.unshift(this.nodes[c].slice()); return out; }
  // 两点之间别穿过祭坛：绕一下
  around(path) { const out = []; let px = this.x, pz = this.z; for (const p of path) { const mx = (px + p[0]) / 2, mz = (pz + p[1]) / 2; if (Math.hypot(mx, mz) < ALTAR_R + 0.5 && Math.hypot(p[0] - px, p[1] - pz) > 2) { const a = Math.atan2(mz, mx) || 0.3; out.push([Math.cos(a) * (ALTAR_R + 1.6), Math.sin(a) * (ALTAR_R + 1.6)]); } out.push(p); px = p[0]; pz = p[1]; } return out; }
  plazaPt(rng = Math.random) { for (let k = 0; k < 12; k++) { const a = rng() * TAU, r = ALTAR_R + 1.2 + rng() * 3.2; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.hypot(x - 5.2, z - 6.4) > 3.2) return [x, z]; } return [-6.5, -2]; } // 别撞上祭坛旁的公共粮筐
  plan(chars, night) {
    if (night) { const a = Math.atan2(this.z, this.x) || 0.6; this.path = this.around([[Math.cos(a) * ALTAR_R, Math.sin(a) * ALTAR_R]]); this.state = 'toSleep'; return; }
    const r = Math.random();
    if (r < 0.3 && chars) { // 去某位居民旁边待一会儿（只找离小路近的）
      const cs = [...chars.values()].filter(c => !c.hidden && c.vis > 0.5 && Math.hypot(c.x, c.z) < 40);
      const c = cs[Math.floor(Math.random() * cs.length)];
      if (c) { const n0 = this.nearestNode(this.x, this.z), n1 = this.nearestNode(c.x, c.z); const nn = this.nodes && n1 >= 0 ? this.nodes[n1] : null;
        if (nn && Math.hypot(nn[0] - c.x, nn[1] - c.z) < 5 || Math.hypot(c.x, c.z) < 12) { const p = Math.hypot(c.x, c.z) < 12 ? [] : this.bfs(n0, n1); const a = Math.random() * TAU; p.push([c.x + Math.cos(a) * 1.6, c.z + Math.sin(a) * 1.6]); this.path = this.around(Math.hypot(c.x, c.z) < 12 ? p : [this.nodes[n0].slice(), ...p]); this.near = c.id; this.state = 'visit'; return; } }
    }
    if (r < 0.65 && this.nodes) { // 顺着小路蹦几段
      let n = this.nearestNode(this.x, this.z); if (n >= 0) { const p = [this.nodes[n].slice()]; for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) { const nb = this.adj[n]; if (!nb.length) break; n = nb[Math.floor(Math.random() * nb.length)]; if (Math.hypot(this.nodes[n][0], this.nodes[n][1]) > 46) break; p.push(this.nodes[n].slice()); } this.path = this.around(p); this.state = 'walk'; return; }
    }
    this.path = this.around([this.plazaPt()]); this.state = 'walk';
  }
  // 被点了：原地停一会儿（小动物围过来看）；gift：捧着东西
  poke(gift = false, sec = 14) { this.hold = sec; this.path = []; this.giftPose = gift ? 4 : 0; this.wait = 0; }
  update(dt, t, chars, night) {
    const asleep = this.state === 'sleep';
    if (this.hold > 0) { this.hold -= dt; this.giftPose = Math.max(0, (this.giftPose || 0) - dt); this.pose = this.giftPose > 0 ? 'hold' : 'idle'; }
    else if (asleep && !night) { this.state = 'idle'; this.wait = 1; }
    else if (asleep) { this.pose = 'lean'; }
    else if (this.path.length) {
      const [tx, tz] = this.path[0]; const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { this.path.shift(); if (!this.path.length) { if (this.state === 'toSleep') { this.state = 'sleep'; this.yaw = Math.atan2(this.x, this.z); } else { this.wait = this.state === 'visit' ? 6 + Math.random() * 6 : 2 + Math.random() * 5; this.state = 'idle'; } } }
      else { const s = Math.min(d, SPEED * dt); this.x += dx / d * s; this.z += dz / d * s; const ty = Math.atan2(dx, dz); this.yaw += Math.atan2(Math.sin(ty - this.yaw), Math.cos(ty - this.yaw)) * Math.min(1, dt * 8); this.pose = 'hop'; }
    } else {
      this.wait -= dt; this.pose = 'idle'; this.idleT = (this.idleT || 0) + dt;
      // 停下来：先看一眼旁边的居民，然后转过来对着镜头（脸始终在镜头这一侧看得见）
      const c = this.near != null && chars && this.idleT < 2.5 ? chars.get(this.near) : null;
      if (c) this.turnTo(Math.atan2(c.x - this.x, c.z - this.z), dt * 3); else this.faceCam(dt * 4);
      if (this.wait <= 0) { this.near = null; this.plan(chars, night); }
    }
    if (this.path.length && !this.hold) this.idleT = 0;
    if (this.hold > 0 || asleep) this.faceCam(dt * (this.hold > 0 ? 6 : 2)); // 被点了 / 睡着：转向镜头
    if (night && this.state !== 'sleep' && this.state !== 'toSleep' && this.hold <= 0) { this.plan(chars, true); } // 用当前状态判断（刚走到这一帧已经睡下了，别又重新出发）
    if (this.m.pose !== this.pose) this.m.setPose(this.pose);
    this.m.update(dt, t);
    this.g.position.set(this.x, 0, this.z); this.g.rotation.y = this.yaw; // 睡觉：脸朝镜头、歪着靠在石台边、闭眼
  }
  turnTo(ty, k) { this.yaw += Math.atan2(Math.sin(ty - this.yaw), Math.cos(ty - this.yaw)) * Math.min(1, k); }
  faceCam(k) { const c = this.camera; if (c) this.turnTo(Math.atan2(c.position.x - this.x, c.position.z - this.z), k); }
  get y() { return 0; }
  hit(camera, sx, sy, W, H) { _v.set(this.x, NUGGET_SIZE * 0.45, this.z).project(camera); if (_v.z > 1) return false; const px = (_v.x * 0.5 + 0.5) * W, py = (-_v.y * 0.5 + 0.5) * H; const dist = camera.position.distanceTo(_w.set(this.x, 1, this.z)); const rad = Math.max(30, NUGGET_SIZE * 0.75 / dist * H / (2 * Math.tan(camera.fov * PI / 360))); return Math.hypot(px - sx, py - sy) < rad; }
}

// ---------------------------------------------------------------- 金圈：金色虚线小圈（缓慢转动的闪光），平铺在地面上
export class GoldRings {
  constructor(scene, n = 8) {
    this.u = { uT: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: this.u, polygonOffset: true, polygonOffsetFactor: -4,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uT; varying vec2 vP;
        void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
          float ring = smoothstep(0.74, 0.79, r) * (1.0 - smoothstep(0.95, 1.0, r));
          float dash = step(0.38, fract(a / 6.2831853 * 16.0 + uT * 0.08));
          float shine = pow(0.5 + 0.5 * cos(a - uT * 1.3), 10.0);
          float fill = (1.0 - smoothstep(0.0, 0.84, r)) * 0.16 + smoothstep(0.55, 0.84, r) * (1.0 - smoothstep(0.84, 0.86, r)) * 0.12;
          vec3 gold = mix(vec3(1.0, 0.78, 0.22), vec3(1.0, 0.97, 0.75), shine);
          float al = ring * dash * (0.9 + 0.1 * sin(uT * 2.2)) + ring * shine * 0.7 + fill * 1.6 * (0.8 + 0.2 * sin(uT * 1.7));
          if (al < 0.01) discard; gl_FragColor = vec4(gold * (1.0 + shine * 0.6), clamp(al, 0.0, 1.0)); }` });
    this.im = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 48).rotateX(-PI / 2), mat, n); this.im.count = 0; this.im.frustumCulled = false; this.im.renderOrder = 3; scene.add(this.im);
    this.list = [];
  }
  set(list) { this.list = list || []; }
  update(t, pulse = 0) {
    this.u.uT.value = t; let i = 0;
    for (const g of this.list) { if (i >= this.im.count + 8 || i >= 8) break; const s = g.r * (1 + 0.04 * Math.sin(t * 2 + i)) * (g.hot ? 1.12 : 1); _m.compose(_w.set(g.x, 0.06, g.z), _q, _s.set(s, 1, s)); this.im.setMatrixAt(i++, _m); }
    this.im.count = i; this.im.visible = i > 0; this.im.instanceMatrix.needsUpdate = true; void pulse;
  }
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
void clamp; void lerp;
