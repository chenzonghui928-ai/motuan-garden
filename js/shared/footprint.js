// 统一占地规则：每栋建筑 / 设施 / 摆设 / 组合 / 工地的真实占地（按渲染模型实测的旋转矩形 + 工地脚手架圈 + 门前通道），
// 和“能不能放在这里”的唯一判定 fitCheck。玩家放旧物、居民选址、拖运落点、组合惊喜、就地改造、躲雨挪位、水洼、雪人、旧存档修复全走这里。
// 纯数学，主线程与 Worker 共用（不依赖 three.js）。
import { FOOT_DATA as D } from './footprint-data.js';
import { clamp, segDist, streamDist, PLAZA_R, STORE_POS, RESOURCES, ROAD_HALF, NATURAL } from './layout.js';

export const YARD = 1.5;        // 门前留出的通道（门口往外这么深、左右各 0.8）
export const COMBO_GAP = 4.0;   // 两件旧物的占地边缘相距这么近以内，才算“挨着放”（组合惊喜）
const SITE_PAD = 0.25;          // 脚手架杆子的粗细
// 留白边距：小件 0.6，大房子到 1.0
export const gapOf = (scale) => clamp(0.4 + scale * 0.13, 0.6, 1.0);
const U = (a, b) => [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3])];
const S = (b, k) => [b[0] * k, b[1] * k, b[2] * k, b[3] * k];

// 这件东西在本地坐标里的包围盒（世界单位）、门口、要不要留门前通道、量级
export function localFoot(l) {
  if (l.use === 'bridge') return { box: [-1.5, 1.5, -6.4, 6.4], door: null, house: false, scale: 2.2 };
  const T = D.tmpl[l.kind], P = D.prop[l.kind], R = D.r[l.kind];
  if (T) {
    let b;
    if (NATURAL[l.kind]) b = U(T.home, T.shed);                 // 自然小屋以后可能变储物棚：一开始就把箱子的地方算上
    else if (l.use === 'shop') b = T.shop || T.home;
    else if (l.use) b = T.home;
    else b = T.shop ? U(T.home, T.shop) : T.home;                // 还没定用途：家和店都可能
    b = S(b, R); if (l.combo && D.ov[l.combo]) b = U(b, S(D.ov[l.combo], l.r || R));
    const house = !l.use || ['home', 'shop', 'shared', 'shed'].includes(l.use);
    return { box: b, door: [T.door[0] * R, T.door[1] * R], house, scale: R };
  }
  if (P) {
    const key = l.use === 'fac' ? l.fac : l.use === 'shop' ? l.shop : l.use;
    const b = (l.use && P.v[key]) || (l.pond ? P.wet : P.any);
    const house = l.use ? l.use === 'home' || l.use === 'shop' : P.house;
    return { box: S(b, R), door: [0, R + 0.2], house, scale: R };
  }
  const r = l.r || 1; return { box: [-r, r, -r, r], door: [0, r], house: false, scale: r };
}

// 世界里的形状：b = 旋转矩形 {cx,cz,ux,uz,vx,vz,hx,hz}，c = 圆 {x,z,r}；role: body 房子本体 / site 工地脚手架圈 / yard 门前通道 / pond 池子
function obb(x, z, c, s, b) { const lx = (b[0] + b[1]) / 2, lz = (b[2] + b[3]) / 2; return { t: 'b', cx: x + lx * c + lz * s, cz: z - lx * s + lz * c, ux: c, uz: -s, vx: s, vz: c, hx: (b[1] - b[0]) / 2, hz: (b[3] - b[2]) / 2 }; }
export function footOf(l) {
  const F = localFoot(l); const c = Math.cos(l.rot || 0), s = Math.sin(l.rot || 0); const shapes = [];
  const body = obb(l.x, l.z, c, s, F.box); body.role = 'body'; shapes.push(body);
  if (F.house && F.door) { const [dx, dz] = F.door; const y = obb(l.x, l.z, c, s, [dx - 0.8, dx + 0.8, dz, dz + YARD]); y.role = 'yard'; shapes.push(y); }
  if (!l.done && l.stage !== 'far' && l.use !== 'bridge') { const sr = (D.tmpl[l.kind] ? F.scale / 0.92 : (l.r || F.scale)) * 0.86 + 0.35 + SITE_PAD; shapes.push({ t: 'c', x: l.x, z: l.z, r: sr, role: 'site' }); }
  if (l.pond) shapes.push({ t: 'c', x: l.x, z: l.z, r: l.pond, role: 'pond' });
  let R = 0; for (const q of shapes) R = Math.max(R, q.t === 'c' ? Math.hypot(q.x - l.x, q.z - l.z) + q.r : Math.hypot(q.cx - l.x, q.cz - l.z) + Math.hypot(q.hx, q.hz));
  return { id: l.id, name: l.name, x: l.x, z: l.z, shapes, body, gap: gapOf(F.scale), R };
}
export function circleFoot(x, z, r, gap = 0.3) { const b = { t: 'c', x, z, r, role: 'body' }; return { id: -1, x, z, shapes: [b], body: b, gap, R: r }; }

// ---------------------------------------------------------------- 距离（负数 = 插进去了多深）
export function ptObb(px, pz, A) { const dx = px - A.cx, dz = pz - A.cz; const lx = Math.abs(dx * A.ux + dz * A.uz) - A.hx, lz = Math.abs(dx * A.vx + dz * A.vz) - A.hz; if (lx <= 0 && lz <= 0) return Math.max(lx, lz); return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)); }
function obbObb(A, B) { // 分离轴：各轴上的最大间隙（≤ 真实距离，用来判“够不够远”是保守的）
  let sep = -1e9; const dx = B.cx - A.cx, dz = B.cz - A.cz;
  for (const [nx, nz] of [[A.ux, A.uz], [A.vx, A.vz], [B.ux, B.uz], [B.vx, B.vz]]) {
    const d = Math.abs(dx * nx + dz * nz); const ra = A.hx * Math.abs(A.ux * nx + A.uz * nz) + A.hz * Math.abs(A.vx * nx + A.vz * nz); const rb = B.hx * Math.abs(B.ux * nx + B.uz * nz) + B.hz * Math.abs(B.vx * nx + B.vz * nz);
    sep = Math.max(sep, d - ra - rb);
  }
  return sep;
}
export function shapeSep(a, b) {
  if (a.t === 'c' && b.t === 'c') return Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
  if (a.t === 'c') return ptObb(a.x, a.z, b) - a.r; if (b.t === 'c') return ptObb(b.x, b.z, a) - b.r;
  return obbObb(a, b);
}
export function segShape(ax, az, bx, bz, A) { // 线段到形状的距离
  if (A.t === 'c') return segDist(A.x, A.z, ax, az, bx, bz) - A.r;
  const L = (x, z) => { const dx = x - A.cx, dz = z - A.cz; return [dx * A.ux + dz * A.uz, dx * A.vx + dz * A.vz]; };
  const [p0, q0] = L(ax, az), [p1, q1] = L(bx, bz);
  let t0 = 0, t1 = 1; const dp = p1 - p0, dq = q1 - q0; let hit = true;
  for (const [p, d, h] of [[p0, dp, A.hx], [q0, dq, A.hz]]) { if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) { hit = false; break; } continue; } let ta = (-h - p) / d, tb = (h - p) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { hit = false; break; } }
  if (hit) return -0.01;
  let m = Math.min(ptObb(ax, az, A), ptObb(bx, bz, A));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const x = A.cx + A.ux * A.hx * sx + A.vx * A.hz * sz, z = A.cz + A.uz * A.hx * sx + A.vz * A.hz * sz; m = Math.min(m, segDist(x, z, ax, az, bx, bz)); }
  return m;
}
// 两件东西之间要留多少：本体之间留白边距；工地圈、池子留 0.4；门前通道只要不被压住
function need(a, b, ga, gb) {
  if (a.role === 'yard' && b.role === 'yard') return null;
  if (a.role === 'yard' || b.role === 'yard') return 0.05;
  if (a.role === 'body' && b.role === 'body') return Math.max(ga, gb);
  return 0.4;
}
// 两个占地的冲突：返回 null 或 { kind:'body'|'yard'|'site', d }
export function footClash(A, B, flower = false) {
  if (Math.hypot(A.x - B.x, A.z - B.z) > A.R + B.R + 1.2) return null;
  let worst = null;
  for (const a of A.shapes) for (const b of B.shapes) {
    let n = need(a, b, A.gap, B.gap); if (n == null) continue; if (flower) n = 0.05;
    const d = shapeSep(a, b); if (d < n && (!worst || d - n < worst.over)) worst = { over: d - n, d, kind: a.role === 'yard' || b.role === 'yard' ? (b.role === 'yard' ? 'yard' : 'myyard') : b.role === 'site' ? 'site' : 'body' };
  }
  return worst;
}
// 两件旧物算不算“挨着放”
export function bodyGap(A, B) { return shapeSep(A.body, B.body); }

// ---------------------------------------------------------------- 统一判定
// st: { lots:[lot 或 struct 里的 lot], nodes:[{x,z}|[x,z]], edges:[[a,b,d]], snowmen? }
// 先 prepFit 一次（把已有东西的占地算好），候选位置再逐个 fitCheck
const skipLot = (l) => l.stage === 'far' || l.upTo || l.up || l.carry;
export function prepFit(st) {
  const N = st.nodes || []; const P = (i) => { const n = N[i]; return n ? (n.x !== undefined ? [n.x, n.z] : [n[0], n[1]]) : null; };
  const segs = []; for (const [a, b, d] of st.edges || []) { if (!d) continue; const A = P(a), B = P(b); if (A && B) segs.push([A[0], A[1], B[0], B[1], ROAD_HALF[d], a, b]); }
  const feet = (st.lots || []).filter(l => !skipLot(l)).map(l => footOf(l));
  const snow = (st.snowmen || []).map(s => Array.isArray(s) ? circleFoot(s[1], s[2], 0.8) : circleFoot(s.x, s.z, 0.8));
  return { feet, segs, snow };
}
// o: { ignore:Set(id), skipNode, water(本体离溪中线至少), plaza(离广场边至少), rsc(离资源点至少), road(离路边至少), maxR(最远角), flower }
export function fitCheck(F, ctx, o = {}) {
  const ign = o.ignore || null; const B = F.body; const bridge = !!o.bridge;
  const pts = B.t === 'c' ? [[B.x, B.z], [B.x + B.r, B.z], [B.x - B.r, B.z], [B.x, B.z + B.r], [B.x, B.z - B.r]]
    : [[B.cx, B.cz], ...[[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [B.cx + B.ux * B.hx * a + B.vx * B.hz * b, B.cz + B.uz * B.hx * a + B.vz * B.hz * b])];
  if (o.maxR && pts.some(([x, z]) => Math.hypot(x, z) > o.maxR)) return { ok: false, why: '离小镇太远了' };
  if (!o.flower) {
    const dp = B.t === 'c' ? Math.hypot(B.x, B.z) - B.r : ptObb(0, 0, B); if (dp < PLAZA_R + (o.plaza ?? 0.6)) return { ok: false, why: '这里是祭坛广场' };
    const ds = B.t === 'c' ? Math.hypot(B.x - STORE_POS[0], B.z - STORE_POS[1]) - B.r : ptObb(STORE_POS[0], STORE_POS[1], B); if (ds < 1.9) return { ok: false, why: '挡住了粮筐' };
    for (const s of RESOURCES) {
      const sh = s.type === 'veg' ? { t: 'b', cx: s.x, cz: s.z, ux: 1, uz: 0, vx: 0, vz: 1, hx: s.hx, hz: s.hz } : { t: 'c', x: s.x, z: s.z, r: s.r };
      if (shapeSep(B, sh) < (o.rsc ?? 0.6)) return { ok: false, why: `挡住了${s.name}` };
    }
    if (!bridge && o.water && pts.some(([x, z]) => streamDist(x, z) < o.water)) return { ok: false, why: '离小溪太近了，会掉进水里' };
  }
  for (const G of ctx.feet) {
    if (ign && ign.has(G.id)) continue; const c = footClash(F, G, o.flower); if (!c) continue;
    const nm = G.name || '房子';
    return { ok: false, why: c.kind === 'yard' ? `太挤啦，挡住了${nm}的门口` : c.kind === 'myyard' ? `太挤啦，门口被${nm}挡住了` : c.kind === 'site' ? `太挤啦，离${nm}的工地太近` : `太挤啦，离${nm}太近`, who: G.id };
  }
  for (const S of ctx.snow) if (footClash(F, S)) return { ok: false, why: '太挤啦，离雪人太近' };
  if (!bridge) {
    const pad = o.flower ? 0.3 : (o.road ?? 0.3); const ex = F.R + 2;
    for (const [ax, az, bx, bz, h, a, b] of ctx.segs) {
      if (o.skipNode != null && (a === o.skipNode || b === o.skipNode)) continue;
      if ((ax < F.x - ex && bx < F.x - ex) || (ax > F.x + ex && bx > F.x + ex) || (az < F.z - ex && bz < F.z - ex) || (az > F.z + ex && bz > F.z + ex)) continue;
      if (segShape(ax, az, bx, bz, B) < h + pad) return { ok: false, why: '会挡住小路' };
    }
  }
  return { ok: true };
}
// 两两检查：返回所有互相插进去 / 太挤的对（检查工具和旧存档修复用；只看本体和工地，不要求留白）
export function overlapPairs(lots, strict = false) {
  const F = lots.filter(l => !skipLot(l)).map(l => ({ l, f: footOf(l) })); const out = [];
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
    const A = F[i].f, B = F[j].f; if (Math.hypot(A.x - B.x, A.z - B.z) > A.R + B.R + 1.2) continue;
    if (strict) { const c = footClash(A, B); if (c) out.push({ a: F[i].l, b: F[j].l, d: c.d, kind: c.kind }); continue; }
    let worst = null; for (const a of A.shapes) for (const b of B.shapes) { if (a.role === 'yard' || b.role === 'yard') continue; const d = shapeSep(a, b); if (d < 0 && (worst == null || d < worst)) worst = d; }
    if (worst != null) out.push({ a: F[i].l, b: F[j].l, d: worst, kind: 'overlap' });
  }
  return out;
}
