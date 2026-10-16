// 模拟核心：Worker 内运行（也可在 Node 里直接 import 做无头测试）
// 原则：决策只在“当前动作结束”或“被打断（饿了、目标没了、走不动）”时做；每步只做移动和需求变化；存档只存当前状态。
// 一条完整生活链：远方出现物件 → 居民发现 → 自愿组队拖回 → 选址 → 商量用途 → 分阶段改造（要小材料） → 入住/开店
import {
  PI, TAU, clamp, lerp, segDist, segProj, DAY, WORLD_R, EDGE_R, PLAZA_R, ROAD_HALF, STORE_POS, WOOD_POS, STREAM,
  streamDist, SPECIES, SP_NAME, SPEED, OBJ_KINDS, NATURAL, TEAM, CAP, KIND_DEFAULT, RESOURCES, USES, SHOP,
  POP_CAP, MAX_OBJ_LOTS, MATS, MAT_NAME, MAT_NATURAL, MAT_TRINKET, STAGE_COST, STAGE_NAME, startGraph, isNight, hm, OBJ_NAME, shopSpots, TIME_K, TIER_DAYS, TIER_NAME,
} from '../shared/layout.js';
import { NAMES, TRAITS, TRAIT_CLASH, SP_TRAITS, wishText, AWAY, eatText } from '../shared/text.js';
import { FOOD_IDS, FOODS, FAV_FOOD, RSC_FOOD, BREAD_FAN, emptyStore, storeSum, splitOldStore, eatEffect, chooseFood } from '../shared/food.js';
import { FOODISH, FAC, ITEMS, MAX_SILL, streamSide, PLACE_R } from '../shared/items.js';
import { footOf, localFoot, prepFit, fitCheck, segShape, overlapPairs } from '../shared/footprint.js';
import { installLenia, EMO } from './lenia.js';
import { installSeasons } from './seasons.js';

export const ACT = { IDLE: 0, WALK: 1, GATHER: 2, FISH: 3, FARM: 4, EAT: 5, SLEEP: 6, CHAT: 7, BUILD: 8, INSIDE: 9, HAUL: 10, CHOP: 11 };
export const FLAG = { CARRY: 1, HIDDEN: 2, HAPPY: 4, PULL: 8, EMOTE: 64 };
export const SNAP_STRIDE = 7; // id, sp, x, z, yaw, act, flags
export const SAVE_VERSION = 10; // 10：统一尺寸（旧物 / 组合 / 雨靴屋等占地半径变了，读档时按新半径重算门口并把互相插进去的东西挪开，保留已有进度）； 9：粮筐按品种分开存（旧档的总数按 3:4:3 拆成莓果/菜/鱼，面包从零开始），店里有自己的面包库存； 8：配方（远行带回的搭配配方，旧档由已拼出过的组合 + 茶壶毛线球补齐）； 5：天气、季节、节日、远行；6：统一占地规则（旧的 3～5 版读档时把互相插进去的东西挪开）；7：「梦的力气」并进「心意」（旧档的力气余额加到心意上）
const HUNGRY_AT = 32; // 饱腹低于这个数就会头顶冒“饿了”
const STORE_FULL = 20; // 粮筐里每种食物堆到这么多就不再专门去采
const BAKE_T = 45; // 一炉面包要烤多久（模拟秒）
const FRIEND = 30, FRIEND_MEETS = 5, DREAM_COST = 3, MAX_WISHES = 8, MAX_CARDS = 40, MAX_ALBUM = 240;
const LOW_JOBS = new Set(['wander', 'plaza', 'visit', 'wait', 'arrive']);

export class Sim {
  constructor(opts = {}) {
    this.K = JSON.parse(JSON.stringify(KIND_DEFAULT));
    if (opts.kinds) for (const k in opts.kinds) if (this.K[k]) this.K[k] = opts.kinds[k];
    this.log = []; this.gateLog = []; // gateLog：每个村口发生过的真事（远行出发/回来、拖回的旧物、门外新出现的东西），最多留 40 条
    if (opts.save) {
      try { const S = typeof opts.save === 'string' ? JSON.parse(opts.save) : opts.save; if (![3, 4, 5, 6, 7, 8, 9, SAVE_VERSION].includes(S.v)) throw new Error('old save'); this._now = opts.now || 0; this.load(S); this.fixOverlaps(S.v); if (opts.now) this.makeGift(opts.now); return; }
      catch (e) { this.log.push('存档读取失败，重新开局'); this.loadError = String(e && e.message || e); }
    }
    this.fresh(opts.seed ?? 1015);
    if (opts.now) { this.savedAt = opts.now; this.wall = opts.now; }
  }
  // ---------------------------------------------------------------- setup
  fresh(seed) {
    this.seed = seed; this.rs = seed; this.t = DAY * 0.27; this.nextId = 1; this.nextLot = 1; this.ver = 1;
    this.res = []; this.lots = []; this.projects = [];
    const g = startGraph(seed); this.nodes = g.nodes; this.edges = g.edges; this.graphDirty = true;
    this.rsc = RESOURCES.map((r, i) => ({ ...r, id: i, stock: r.max * 0.8 }));
    this.store = splitOldStore(16); this.foodLog = []; this.mats = { twig: 4, stone: 2, grass: 2, button: 1, cap: 1, thread: 1, nail: 1 };
    this.cards = []; this.album = []; this.cardId = 1; this.cardVer = 1; this.cat = {}; this.dreams = []; this.dreamId = 1; this.gift = null; this.savedAt = 0;
    this.stats = { hauls: 0, built: 0, stuck: 0, arrivals: 0, discover: 0, chats: 0, friends: 0, wishDone: 0, dreamDone: 0, dreamBlocked: 0, dreamExpired: 0, shopVisits: 0, blocked: 0, interrupts: 0 };
    this.nextArrival = this.t + DAY * 0.4; this.nextFar = this.t + DAY * 0.3; this.nextWish = this.t + DAY * 0.02; this.farN = 1; this.tierT = 0;
    for (const k of ['leaf', 'mush', 'pine']) { const lot = this.newLot(k); this.lots.push(lot); if (this.placeSite(lot)) Object.assign(lot, { done: true, prog: 1, paid: 3, stage: 'done', use: 'home', name: NATURAL[k], doneAt: this.t }); else this.lots.pop(); }
    SPECIES.forEach((sp, i) => { const a = i / 6 * TAU + 0.3; const r = this.spawn(sp, Math.cos(a) * 7.5, Math.sin(a) * 7.5); this.claimBed(r); });
    // 开局就有一件物件躺在远方，好奇的居民很快会去看看
    this.spawnFar(this.pick(['egg', 'cup', 'honey']));
    const cur = this.res.find(r => r.traits.includes('curious') || r.traits.includes('brave')) || this.res[2];
    this.giveWish(cur, 'find');
    this.notices = []; this.leniaFresh(); this.seasonFresh();
  }
  rng() { let a = this.rs = (this.rs + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  rnd(a, b) { return a + (b - a) * this.rng(); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  dayT() { return (this.t / DAY) % 1; }
  day() { return Math.floor(this.t / DAY) + 1; }
  rById(id) { return this.res.find(r => r.id === id); }
  spawn(sp, x, z) {
    const used = new Set(this.res.map(r => r.name)); const name = NAMES[sp].find(n => !used.has(n)) || NAMES[sp][0] + (this.res.length + 1);
    const pool = [...SP_TRAITS[sp], ...SP_TRAITS[sp], ...Object.keys(TRAITS)]; const traits = [];
    for (let g = 0; g < 40 && traits.length < 2; g++) { const t = this.pick(pool); if (!traits.includes(t) && !traits.some(o => TRAIT_CLASH[o].includes(t))) traits.push(t); }
    const r = { id: this.nextId++, name, sp, traits, x, z, yaw: this.rnd(0, TAU), full: this.rnd(60, 90), energy: this.rnd(65, 95), mood: 62, home: -1,
      act: ACT.IDLE, flags: 0, steps: [], si: 0, way: null, wi: 0, timer: this.rnd(0.5, 3), carry: 0, carryF: null, fav: this.rng() < BREAD_FAN ? 'bread' : FAV_FOOD[sp], ate: [], hungryCD: 0, box: 0, chatCD: this.rnd(10, 40), chat: null,
      haul: null, ox: this.rnd(-0.5, 0.5), oz: this.rnd(-0.5, 0.5), spd: SPEED[sp] * this.rnd(0.9, 1.1), job: '', doing: '刚醒来，揉揉眼睛', aff: {}, wish: null, wishCD: 0, dream: null,
      hauled: 0, built: 0, owner: -1, recent: [], late: this.rnd(-0.015, 0.03), meets: {}, lastMeet: {}, friends: [], emote: 0, mv: 0, mvT: 0, taskT: 0, lastShop: -1e9, buildP: 0, fetchP: 0, seat: null, got: null, builtOn: 0 };
    this.res.push(r); return r;
  }
  remember(r, text) { r.recent.unshift(`${hm(this.dayT())} ${text}`); if (r.recent.length > 4) r.recent.pop(); }
  // ---------------------------------------------------------------- cards (story collection)
  addCard(type, title, text, who = [], at = null) {
    const c = { id: this.cardId++, type, title, text, who: who.map(r => r.id), names: who.map(r => r.name), at: at ? [Math.round(at[0] * 10) / 10, Math.round(at[1] * 10) / 10] : null, day: this.day(), hm: hm(this.dayT()) };
    this.cards.unshift(c); if (this.cards.length > MAX_CARDS) this.cards.length = MAX_CARDS; this.cardVer++; this.log.push(`【${title}】${text}`); return c;
  }
  collect(id, on = true) {
    if (!on) { this.album = this.album.filter(c => c.id !== id); this.cardVer++; return; }
    if (this.album.some(c => c.id === id)) return; const c = this.cards.find(c => c.id === id); if (!c) return;
    this.album.unshift({ ...c, saved: this.day() }); if (this.album.length > MAX_ALBUM) this.album.length = MAX_ALBUM; this.cardVer++;
  }
  // ---------------------------------------------------------------- road graph
  addNode(x, z, k = 'path') { this.nodes.push({ x, z, k }); this.graphDirty = true; return this.nodes.length - 1; }
  splitEdge(ei, x, z) { const [a, b, d] = this.edges[ei]; const n = this.addNode(x, z); this.edges[ei] = [a, n, d]; this.edges.push([n, b, d]); return n; }
  // 路网缓存：只在路网变了（加路、建筑增删/挪动接门口小径）时清空。以前每次变动都用 Floyd 全对全重算（n³，路点多了单次要几百毫秒），
  // 现在只建邻接表，按“目的地”懒算一棵最短路树（Dijkstra，n²），同一个目的地反复问路直接查表。
  rebuildGraph() {
    const n = this.nodes.length; const adj = Array.from({ length: n }, () => []);
    for (const [a, b, t] of this.edges) { const A = this.nodes[a], B = this.nodes[b]; if (!A || !B) continue; const d = Math.hypot(A.x - B.x, A.z - B.z) * (t === 0 ? 1.3 : 1); adj[a].push(b, d); adj[b].push(a, d); }
    this.G = { n, adj, tree: new Map() }; this.graphDirty = false; if (this.stats) this.stats.graphBuilds = (this.stats.graphBuilds || 0) + 1;
  }
  routeTree(b) { // 到 b 的最短路树：NX[i] = 从 i 往 b 走的下一个路点（-1 = 走不到）
    const G = this.G; let NX = G.tree.get(b); if (NX) return NX;
    const n = G.n; const D = new Float64Array(n).fill(1e18); const done = new Uint8Array(n); NX = new Int32Array(n).fill(-1);
    if (b >= 0 && b < n) { D[b] = 0; NX[b] = b; }
    for (;;) {
      let u = -1, du = 1e18; for (let i = 0; i < n; i++) if (!done[i] && D[i] < du) { du = D[i]; u = i; }
      if (u < 0) break; done[u] = 1; const A = G.adj[u];
      for (let k = 0; k < A.length; k += 2) { const v = A[k], nd = du + A[k + 1]; if (nd < D[v]) { D[v] = nd; NX[v] = u; } }
    }
    if (G.tree.size > 256) G.tree.clear(); G.tree.set(b, NX); return NX;
  }
  nearestNode(x, z) { let b = 0, bd = 1e9; this.nodes.forEach((p, i) => { if (p.k === 'door') return; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; b = i; } }); return b; }
  route(a, b) { if (this.graphDirty || !this.G || !this.G.adj) this.rebuildGraph(); const NX = this.routeTree(b); const r = [a]; let c = a, g = 0; while (c !== b && g++ < 400) { c = NX[c]; if (c < 0) break; r.push(c); } return r; }
  pathPts(x0, z0, x1, z1, off = [0, 0]) { // 起点 → 最近路点 → 路网 → 终点
    if (Math.hypot(x1 - x0, z1 - z0) < 7) return [[x1, z1]];
    const a = this.nearestNode(x0, z0), b = this.nearestNode(x1, z1); const pts = [];
    for (const id of this.route(a, b)) { const p = this.nodes[id]; pts.push([p.x + off[0], p.z + off[1]]); }
    if (pts.length > 1 && Math.hypot(pts[1][0] - x0, pts[1][1] - z0) < Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])) pts.shift(); // 不走回头路
    pts.push([x1, z1]); return pts;
  }
  // ---------------------------------------------------------------- lots (houses grow along the curvy roads)
  newLot(kind) { return { id: this.nextLot++, kind, tier: 0, doneAt: 0, use: null, usp: null, shop: null, name: OBJ_NAME[kind] || NATURAL[kind], x: 0, z: 0, rot: 0, r: this.K[kind].r, prog: 0, paid: 0, done: false, beds: [], door: null, node: -1, stage: 'far', fx: 0, fz: 0, owner: -1, seats: [] }; }
  lotById(id) { return id < 0 ? null : this.lots.find(l => l.id === id); }
  natural(l) { return !!NATURAL[l.kind]; }
  // 占地检查（js/shared/footprint.js 的统一规则）：居民自己选址更讲究——离溪、广场、资源点都多留一点
  fitOpt(lot, player = false) { return player ? { ignore: new Set([lot.id]), water: 2.4, plaza: 0.6, rsc: 0.6, road: 0.3 } : { ignore: new Set([lot.id]), water: 3.2, plaza: 2.2, rsc: 1.4, road: 0.3, maxR: this.maxR || WORLD_R - 2 }; }
  fitCtx() { return prepFit({ lots: this.lots, nodes: this.nodes, edges: this.edges, snowmen: this.snowmen || [] }); }
  lotFits(lot, x, z, rot, ctx, player = false, extra = null) { return fitCheck(footOf({ ...lot, x, z, rot }), ctx, extra ? { ...this.fitOpt(lot, player), ...extra } : this.fitOpt(lot, player)); }
  // 就近找一块合法空地（不跨溪、不出界），保持朝向，必要时转个方向；组合惊喜、就地改造、躲雨、旧存档修复用
  nearFit(lot, x0, z0, o = {}) {
    const ctx = o.ctx || this.fitCtx(); const side = streamSide(x0, z0); const rots = o.rots || [lot.rot || 0, (lot.rot || 0) + PI / 2, (lot.rot || 0) - PI / 2, (lot.rot || 0) + PI];
    for (let d = 0; d <= (o.maxD || 16); d += 0.5) {
      const n = d === 0 ? 1 : Math.ceil(TAU * d / 0.9);
      for (let k = 0; k < n; k++) { const a = k / n * TAU + d * 0.37; const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
        if (Math.hypot(x, z) > PLACE_R || streamSide(x, z) !== side) continue;
        for (const rot of rots) if (this.lotFits(lot, x, z, rot, ctx, o.player !== false, o.extra).ok) return { x, z, rot, d }; }
    }
    return null;
  }
  placeSite(lot, near = null) {
    let best = null; const F = localFoot(lot); const front = F.box[3], side0 = (F.box[0] + F.box[1]) / 2;
    for (let attempt = 0; attempt < 3 && !best; attempt++) {
      const ctx = this.fitCtx();
      for (let ei = 0; ei < this.edges.length; ei++) {
        const [a, b, d] = this.edges[ei]; if (d !== 1 && d !== 3) continue; const A = this.nodes[a], B = this.nodes[b];
        const len = Math.hypot(B.x - A.x, B.z - A.z); if (len < 0.5) continue; const tx = (B.x - A.x) / len, tz = (B.z - A.z) / len;
        for (let s = 0.4; s < len; s += 1.4) for (const side of [-1, 1]) {
          const off = front + ROAD_HALF[d] + 0.45; const px = A.x + tx * s, pz = A.z + tz * s; const nx = -tz * side, nz = tx * side; // 从路指向房子的法线
          const rot = Math.atan2(-nx, -nz); const c = Math.cos(rot), sn = Math.sin(rot);
          const x = px + nx * off - side0 * c, z = pz + nz * off + side0 * sn; // 门对着路，本体前沿离路边留一点
          if (near && Math.hypot(x - near[0], z - near[1]) > 40) continue;
          if (!this.lotFits(lot, x, z, rot, ctx).ok) continue;
          let nb = 0; for (const l of this.lots) { if (l === lot || l.stage === 'far') continue; const dd = Math.hypot(l.x - x, l.z - z); if (dd < 14) nb += 2.2 * (1 - dd / 20); }
          const score = near ? -Math.hypot(x - near[0], z - near[1]) * 1.6 + (d === 1 ? 2 : 0) + this.rng() * 1.5 : -Math.hypot(x, z) * 0.5 + nb * 1.4 + (d === 1 ? 5 : 0) + this.rng() * 3;
          if (!best || score > best.score) best = { score, x, z, ei, side, tx, tz, rot };
        }
      }
      if (!best) this.extendRoad(); // 路边没有合适的空地：往外长一段小路再找，不硬塞
    }
    if (!best) return false;
    this.placeLot(lot, best.x, best.z, best.rot, best.ei); return true;
  }
  // 把房子放到 (x,z,rot)，门口接一段小径到最近的路（ei 给了就接那条路）
  placeLot(lot, x, z, rot, ei = -1) {
    const nx = -Math.sin(rot), nz = -Math.cos(rot); const c = Math.cos(rot), sn = Math.sin(rot); const dl = this.K[lot.kind].door;
    const dx = x + dl[0] * c + dl[1] * sn, dz = z - dl[0] * sn + dl[1] * c; // 门口世界坐标
    const fx = dx - nx * 0.7, fz = dz - nz * 0.7;
    if (ei < 0) { let bd = 1e9; this.edges.forEach(([a, b, d], i) => { if (d !== 1 && d !== 3) return; const A = this.nodes[a], B = this.nodes[b]; const q = segDist(fx, fz, A.x, A.z, B.x, B.z); if (q < bd) { bd = q; ei = i; } }); }
    const [a, b] = this.edges[ei]; const A = this.nodes[a], B = this.nodes[b];
    const tp = segProj(fx, fz, A.x, A.z, B.x, B.z); const qx = lerp(A.x, B.x, tp), qz = lerp(A.z, B.z, tp);
    let joint; if (Math.hypot(qx - A.x, qz - A.z) < 1.2) joint = a; else if (Math.hypot(qx - B.x, qz - B.z) < 1.2) joint = b; else joint = this.splitEdge(ei, qx, qz);
    const dn = this.addNode(fx, fz, 'door'); this.edges.push([joint, dn, 2]);
    Object.assign(lot, { x, z, rot, door: [dx, dz], node: dn }); this.graphDirty = true;
    this.ver++;
  }
  extendRoad() { // 地方不够了：从环路或土路往外长一段弯弯的小路
    const feet = this.fitCtx().feet;
    for (let t = 0; t < 120; t++) {
      const ei = Math.floor(this.rng() * this.edges.length); const [a, , d] = this.edges[ei]; if (d !== 1 && d !== 3) continue;
      const A = this.nodes[a]; const l = Math.hypot(A.x, A.z) || 1; const ang = Math.atan2(A.z, A.x) + this.rnd(-0.7, 0.7);
      const L = this.rnd(9, 14); const ex = A.x + Math.cos(ang) * L, ez = A.z + Math.sin(ang) * L;
      if (Math.hypot(ex, ez) > (this.maxR || WORLD_R) - 6 || Math.hypot(ex, ez) < l + 3) continue;
      let ok = true; for (let k = 1; k <= 8 && ok; k++) { const x = lerp(A.x, ex, k / 8), z = lerp(A.z, ez, k / 8); if (streamDist(x, z) < 4.5) ok = false;  for (const s of this.rsc) if (Math.hypot(x - s.x, z - s.z) < (s.type === 'veg' ? 8 : s.r + 1.5)) ok = false; }
      if (ok) for (const F of feet) if (segShape(A.x, A.z, ex, ez, F.body) < ROAD_HALF[3] + 0.6) { ok = false; break; } // 新路不能穿过已有的房子、设施和工地
      if (!ok) continue;
      const mx = (A.x + ex) / 2 + this.rnd(-1.5, 1.5), mz = (A.z + ez) / 2 + this.rnd(-1.5, 1.5);
      const m = this.addNode(mx, mz), e = this.addNode(ex, ez); this.edges.push([a, m, 3], [m, e, 3]); this.ver++; return true;
    }
    return false;
  }
  // ---------------------------------------------------------------- housing
  homeLots() { return this.lots.filter(l => l.done && l.use === 'home'); }
  claimBed(r) {
    if (r.home >= 0) return true; let best = null;
    for (const l of this.homeLots()) { if (l.beds.length >= CAP[l.kind]) continue; const s = (l.usp === r.sp ? 10 : this.natural(l) ? 5 : 0) - Math.hypot(l.x - r.x, l.z - r.z) * 0.01; if (!best || s > best.s) best = { l, s }; }
    if (!best) return false; best.l.beds.push(r.id); r.home = best.l.id; return true;
  }
  moveHome(r) { // 住在别处的居民，有了本族住所空床就搬过去
    const cur = this.lotById(r.home); if (cur && cur.usp === r.sp) return false;
    const l = this.lots.find(l => l.done && l.use === 'home' && l.usp === r.sp && l.beds.length < CAP[l.kind]); if (!l) return false;
    if (cur) cur.beds = cur.beds.filter(id => id !== r.id); l.beds.push(r.id); r.home = l.id; r.mood = Math.min(100, r.mood + 12);
    this.remember(r, `搬进了${l.name}`); this.wishHit(r, 'home'); return true;
  }
  homeless() { return this.res.filter(r => r.home < 0); }
  // ---------------------------------------------------------------- far objects: appear → discovered → haul → renovate
  spawnFar(kind) {
    const lot = this.newLot(kind); const gates = this.nodes.filter(n => n.k === 'gate');
    for (let g = 0; g < 40; g++) {
      const gt = this.pick(gates); const a = Math.atan2(gt.z, gt.x) + this.rnd(-0.45, 0.45); const R = EDGE_R + this.rnd(-1, 5);
      const x = Math.cos(a) * R, z = Math.sin(a) * R; if (streamDist(x, z) < lot.r + 5) continue;
      if (this.lots.some(l => l.stage === 'far' && Math.hypot(l.x - x, l.z - z) < 14)) continue;
      Object.assign(lot, { x, z, fx: x, fz: z, rot: this.rnd(0, TAU), stage: 'far' }); this.lots.push(lot); this.ver++; this.gateEv(gates.indexOf(gt), 'far', `门外的草坪上多了一个${OBJ_NAME[kind]}`);
      this.log.push(`远方的草坪上多了一个${OBJ_NAME[kind]}，还没有人发现`); return lot;
    }
    return null;
  }
  chooseFarKind() {
    const pop = this.res.length; const w = {};
    for (const k of OBJ_KINDS) {
      if (TEAM[k] > Math.max(2, pop - 1)) continue;
      let v = 1; const sps = USES[k].filter(u => u.use === 'home').map(u => u.sp);
      for (const s of sps) if (!this.lots.some(l => l.usp === s && l.use === 'home')) v += s === USES[k][0].sp ? 2.5 : 1;
      if (USES[k].some(u => u.use === 'shop') && pop >= 7 && this.lots.filter(l => l.use === 'shop').length < 2) v += 2;
      if (!this.cat[k]) v += 1.2;
      if (this.lots.some(l => l.kind === k && l.stage !== 'done')) v *= 0.2;
      w[k] = v;
    }
    let tot = 0; for (const k in w) tot += w[k]; let x = this.rng() * tot; for (const k in w) { x -= w[k]; if (x <= 0) return k; }
    return 'egg';
  }
  builtObjLots() { return this.lots.filter(l => !this.natural(l) && l.stage !== 'far' && l.stage !== 'landed' && (!l.use || l.use === 'home' || l.use === 'shop') && !l.upTo).length; }
  townFull() { return this.builtObjLots() >= MAX_OBJ_LOTS; }
  shopRoom(type) { const shops = this.lots.filter(l => l.use === 'shop' || l.forceShop); const same = shops.filter(l => (l.shop || l.forceShop) === type).length; return shops.length < 5 && same < (this.res.length >= 11 ? 2 : 1); }
  upgradeTarget() { const c = this.lots.filter(l => l.done && l.node >= 0 && ['home', 'shop', 'shared'].includes(l.use) && (l.tier || 0) < 3 && !this.lots.some(o => o.upTo === l.id)); c.sort((a, b) => (a.tier || 0) - (b.tier || 0) || (a.doneAt || 0) - (b.doneAt || 0)); return c[0] || null; }
  matCap() { return 60 + 20 * this.lots.filter(l => l.use === 'shed' || (l.done && l.fac === 'shed')).length; }
  tierUp(l, how, who = [], kind = null) {
    if ((l.tier || 0) >= 3) return; l.tier = (l.tier || 0) + 1; this.ver++;
    const ppl = who.length ? who : [...l.beds.map(id => this.rById(id)), this.rById(l.owner)].filter(Boolean);
    for (const r of ppl) { r.mood = Math.min(100, r.mood + 6); this.remember(r, `${l.name}${TIER_NAME[l.tier]}`); }
    const names = ppl.length ? ppl.slice(0, 4).map(r => r.name).join('、') : '大家';
    const days = Math.max(1, Math.round((this.t - (l.doneAt || 0)) / DAY));
    const text = how === 'haul' ? `${names}把拖回来的${OBJ_NAME[kind]}拆开，木板、把手和零件全都用上了：${l.name}${TIER_NAME[l.tier]}。` : `${l.name}落成第 ${days} 天，${names}慢慢给它${TIER_NAME[l.tier]}。屋子越来越像个家了。`;
    this.addCard('upgrade', `${l.name}的新样子 ${'★'.repeat(l.tier)}`, text, ppl.slice(0, 4), [l.x, l.z]);
  }
  tierTick() { // 随入住天数和主人心情慢慢升级（全镇每次最多一栋，隔一阵才有下一栋）
    for (const l of this.lots) {
      if (!l.done || !['home', 'shop', 'shared', 'shed'].includes(l.use) || (l.tier || 0) >= 3) continue;
      if ((this.t - (l.doneAt || 0)) / DAY < TIER_DAYS[l.tier || 0]) continue;
      const ppl = [...l.beds.map(id => this.rById(id)), this.rById(l.owner)].filter(Boolean);
      const mood = ppl.length ? ppl.reduce((a, r) => a + r.mood, 0) / ppl.length : (l.use === 'shared' || l.use === 'shed' ? 70 : 0);
      if (mood >= 58) { this.tierUp(l, 'time'); this.tierT = this.t + DAY * 1.4; return; }
    }
  }
  convertHut(l) { // 空出来的自然小屋不拆：头一栋变共享小屋，其余变储物棚
    const shared = this.lots.some(o => o.use === 'shared'); l.use = shared ? 'shed' : 'shared'; l.name = `${NATURAL[l.kind]}${shared ? '·储物棚' : '·共享小屋'}`; this.ver++;
    this.addCard('change', '老房子有了新用处', shared ? `大家都搬进了新家，空出来的${NATURAL[l.kind]}被收拾成了储物棚，木枝、纽扣和瓶盖终于有地方放了。` : `大家都搬进了新家，可谁也舍不得拆掉最早的${NATURAL[l.kind]}。现在它是小镇的共享小屋，谁累了都可以进去坐坐。`, [], [l.x, l.z]);
  }
  activeProjects() { return this.projects.filter(p => p.stage !== 'done').length; }
  discover(lot, r) {
    if (lot.stage !== 'far') return false;
    if (this.activeProjects() >= 2) { this.remember(r, `在远方看见了${OBJ_NAME[lot.kind]}，可大家正忙，先记在心里`); r.doing = `看见了远方的${OBJ_NAME[lot.kind]}，先记在心里`; return false; }
    // 镇子满员后：先看能不能再开一家店；不然拖回来拆开，给某栋房子翻新升级
    let up = null;
    if (this.townFull()) { const st = USES[lot.kind].find(u => u.use === 'shop'); if (st && this.shopRoom(st.shop)) lot.forceShop = st.shop; else up = this.upgradeTarget(); }
    if (up) {
      const e = this.edges.find(e => e[2] === 2 && (e[0] === up.node || e[1] === up.node)); const jn = e ? (e[0] === up.node ? e[1] : e[0]) : up.node; const J = this.nodes[jn];
      Object.assign(lot, { upTo: up.id, node: jn, x: J.x, z: J.z, rot: up.rot, door: [J.x, J.z] });
    } else if ((lot.noRoomT && this.t - lot.noRoomT < DAY * 0.2) || !this.placeSite(lot)) { if (!lot.noRoomT || this.t - lot.noRoomT >= DAY * 0.2) lot.noRoomT = this.t; this.remember(r, `镇上一时找不到地方放${OBJ_NAME[lot.kind]}`); return false; } // 刚找过没地方：隔一阵再找（不然每个路过的居民都把全镇空地和小路重新算一遍）
    lot.stage = 'haul'; this.ver++;
    const gates = this.nodes.map((n, i) => ({ n, i })).filter(o => o.n.k === 'gate');
    let g = gates[0], gd = 1e9; for (const o of gates) { const d = Math.hypot(o.n.x - lot.fx, o.n.z - lot.fz); if (d < gd) { gd = d; g = o; } }
    const path = [[lot.fx, lot.fz]]; for (const id of this.route(g.i, lot.node)) { const p = this.nodes[id]; path.push([p.x, p.z]); } path.push([lot.x, lot.z]);
    const p = this.makeProject(lot, path); p.finder = r.id; this.projects.push(p);
    const c = this.cat[lot.kind] || (this.cat[lot.kind] = { n: 0, day: this.day(), uses: [] }); c.n++;
    this.stats.discover++; r.emote = 4; r.mood = Math.min(100, r.mood + 8); this.gateEv(gates.indexOf(g), 'haul', `${r.name}发现了${OBJ_NAME[lot.kind]}，叫上大家从这里拖回了镇上`);
    const plan = lot.upTo ? `，大家说拖回来拆开，正好给${this.lotById(lot.upTo).name}翻新` : lot.forceShop ? `，大家盘算着再开一家${SHOP[lot.forceShop].name}` : '';
    if (c.n === 1 || plan) this.addCard('discover', `${r.name}发现了${OBJ_NAME[lot.kind]}`, `${r.name}在村口外的草坪上发现了一只${OBJ_NAME[lot.kind]}，要 ${TEAM[lot.kind]} 个人才拖得动${plan}。${r.name}跑回来喊大家帮忙。`, [r], [lot.fx, lot.fz]);
    this.remember(r, `发现了远方的${OBJ_NAME[lot.kind]}`); this.wishHit(r, 'find');
    this.joinHaul(r, p);
    return true;
  }
  makeProject(lot, path) {
    const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    return { id: lot.id, kind: lot.kind, lot: lot.id, stage: 'gather', path, cum, s: 0, team: [], need: TEAM[lot.kind], x: path[0][0], z: path[0][1], yaw: lot.rot, moving: 0, rest: 0, restCD: this.rnd(14, 24), workers: 0, fetchers: 0, t0: this.t, nightNote: false };
  }
  joinHaul(r, p) { if (p.team.includes(r.id)) return; this.finishTask(r); p.team.push(r.id); r.haul = p.id; r.job = 'haul'; r.act = ACT.WALK; r.doing = `去远方帮忙拖${OBJ_NAME[p.kind]}`; }
  leaveHaul(r, why) { const p = this.projects.find(p => p.id === r.haul); if (p) p.team = p.team.filter(id => id !== r.id); r.haul = null; this.finishTask(r); if (why) { r.doing = why; this.remember(r, why); } }
  pathAt(p, s) { const { path, cum } = p; if (path.length < 2) return [path[0][0], path[0][1], p.yaw || 0]; s = clamp(s, 0, cum[cum.length - 1]); let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const a = path[i - 1], b = path[i]; const L = cum[i] - cum[i - 1] || 1; const u = (s - cum[i - 1]) / L; return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), Math.atan2(b[0] - a[0], b[1] - a[1])]; }
  haulSlot(p, k) { // 队员位置：物件前方成两列排开
    const K = this.K[p.kind]; const row = Math.floor(k / 2), side = k % 2 ? 1 : -1;
    const ahead = K.r * 0.8 + 2.4 + row * 1.15; const [x, z, yaw] = this.pathAt(p, p.s + ahead);
    const lat = side * (0.6 + row * 0.12); return [x + Math.cos(yaw) * lat, z - Math.sin(yaw) * lat, yaw];
  }
  decideUse(lot) {
    const pop = this.res.length; let best = null;
    if (lot.forceShop) { const o = USES[lot.kind].find(u => u.use === 'shop'); best = { o, s: 9, why: `镇上的人多了，一家${SHOP[o.shop].name}有时坐不下` }; }
    for (const o of lot.forceShop ? [] : USES[lot.kind]) {
      let s = 0, why = '';
      if (o.use === 'home') {
        const mine = this.res.filter(r => r.sp === o.sp); const homeless = mine.filter(r => r.home < 0).length; const inHut = mine.filter(r => { const h = this.lotById(r.home); return h && h.usp !== o.sp; }).length;
        const free = this.lots.filter(l => l.use === 'home' && l.usp === o.sp && l !== lot).reduce((a, l) => a + CAP[l.kind] - (l.done ? l.beds.length : 0), 0);
        s = homeless * 3 + inHut * 1.5 - free * 1.2 + (o.sp === USES[lot.kind][0].sp ? 0.9 : 0) + (mine.length <= 1 && pop < POP_CAP ? 0.6 : 0);
        why = homeless ? `${SP_NAME[o.sp]}们还没有地方睡` : inHut ? `${SP_NAME[o.sp]}们还挤在别人家里` : `给以后搬来的${SP_NAME[o.sp]}留个家`;
      } else {
        const same = this.lots.some(l => l.use === 'shop' && l.shop === o.shop && l !== lot); const any = this.lots.some(l => l.use === 'shop' && l !== lot);
        s = same || !this.shopRoom(o.shop) ? -5 : pop >= 7 ? 3.0 + (any ? 0 : 0.8) : 0.4; why = `镇上还没有${SHOP[o.shop].name}`;
      }
      s += this.rng() * 0.6; if (!best || s > best.s) best = { o, s, why };
    }
    // 房子和店都够了：擦干净摆在路边，当个纪念（不用改造）
    const built = this.lots.filter(l => l !== lot && !this.natural(l) && l.stage !== 'far' && l.use !== 'deco' && !l.upTo).length;
    if (!lot.forceShop && built >= MAX_OBJ_LOTS && best.s < 2.5) { lot.use = 'deco'; lot.name = `路边的${OBJ_NAME[lot.kind]}`; lot.paid = 3; lot.prog = 0; const c = this.cat[lot.kind] || (this.cat[lot.kind] = { n: 1, day: this.day(), uses: [] }); if (!c.uses.includes('摆设')) c.uses.push('摆设'); this.ver++; return '镇上的房子和店已经够用了'; }
    const o = best.o; lot.use = o.use; lot.name = o.name; if (o.use === 'home') lot.usp = o.sp; else lot.shop = o.shop;
    const c = this.cat[lot.kind] || (this.cat[lot.kind] = { n: 1, day: this.day(), uses: [] }); if (!c.uses.includes(o.name)) c.uses.push(o.name);
    this.ver++; return best.why;
  }
  stepProject(p, dt) {
    const lot = this.lotById(p.lot); if (!lot) { p.stage = 'done'; return; }
    if (p.stage === 'gather' || p.stage === 'haul') {
      p.team = p.team.filter(id => { const r = this.rById(id); return r && r.haul === p.id; });
      if (isNight(this.dayT())) { // 天黑：大家把物件留在原地，明天再来
        if (p.team.length) { for (const r of p.team.map(id => this.rById(id))) this.leaveHaul(r, `天黑了，把${OBJ_NAME[p.kind]}留在半路，明天再来`); if (!p.nightNote && p.s > 1) { p.nightNote = true; this.log.push(`天黑了，大家把${OBJ_NAME[p.kind]}留在了半路`); } }
        p.stage = 'gather'; p.moving = 0; return;
      }
    }
    if (p.stage === 'gather') {
      p.moving = 0;
      if (p.team.length >= p.need) {
        let ready = true; p.team.forEach((id, k) => { const r = this.rById(id); const [sx, sz] = this.haulSlot(p, k); if (Math.hypot(r.x - sx, r.z - sz) > 1.6) ready = false; });
        if (ready) { p.stage = 'haul'; this.log.push(`${p.team.length} 人套好绳子，开始拖${OBJ_NAME[p.kind]}`); for (const id of p.team) this.rById(id).doing = `正在拖${OBJ_NAME[p.kind]}回镇上`; }
      }
    } else if (p.stage === 'haul') {
      const total = p.cum[p.cum.length - 1];
      if (p.team.length < Math.ceil(p.need * 0.6)) { p.stage = 'gather'; p.moving = 0; return; }
      if (p.rest > 0) { p.rest -= dt; p.moving = 0; }
      else { p.restCD -= dt; if (p.restCD <= 0) { p.rest = this.rnd(3, 6); p.restCD = this.rnd(16, 28); } p.moving = 1; const v = 0.8 * Math.min(1, p.team.length / p.need) * (this.hasFac('train') ? 1.35 : 1); p.s = Math.min(total, p.s + v * dt); }
      const [x, z, yaw] = this.pathAt(p, p.s); p.x = x; p.z = z; if (p.moving) p.yaw += Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)) * Math.min(1, dt * 0.8);
      if (p.s >= total - 0.01) this.arrive(p, lot);
    } else if (p.stage === 'renovate') {
      p.yaw += Math.atan2(Math.sin(lot.rot - p.yaw), Math.cos(lot.rot - p.yaw)) * Math.min(1, dt * 0.5);
      if (lot.prog >= 1 - 1e-6 && lot.paid >= 3) this.finishLot(p, lot);
    }
  }
  arrive(p, lot) {
    if (lot.upTo) { // 翻新：拖到要升级的房子门口，拆开用掉
      const T = this.lotById(lot.upTo); const team = p.team.map(id => this.rById(id)).filter(Boolean);
      for (const r of team) { r.haul = null; r.mood = Math.min(100, r.mood + 10); r.hauled++; this.finishTask(r); this.remember(r, `把${OBJ_NAME[p.kind]}拖回来给${T ? T.name : '小镇'}翻新`); this.wishHit(r, 'haul'); }
      for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) this.bond(team[i], team[j], 4);
      p.team = []; p.stage = 'done'; this.stats.hauls++; this.lots = this.lots.filter(l => l !== lot); this.ver++;
      const c = this.cat[lot.kind] || (this.cat[lot.kind] = { n: 1, day: this.day(), uses: [] }); if (!c.uses.includes('翻新材料')) c.uses.push('翻新材料');
      if (T) this.tierUp(T, 'haul', team, p.kind); return;
    }
    p.stage = 'renovate'; p.moving = 0; lot.stage = 'renovate'; p.x = lot.x; p.z = lot.z;
    const team = p.team.map(id => this.rById(id)).filter(Boolean);
    for (const r of team) { r.haul = null; r.mood = Math.min(100, r.mood + 10); r.hauled++; this.finishTask(r); this.remember(r, `和大家把${OBJ_NAME[p.kind]}拖回了镇上`); this.wishHit(r, 'haul'); }
    for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) this.bond(team[i], team[j], 5);
    p.team = [];
    if (lot.item) { this.stats.hauls++; this.ver++; if (lot.use !== 'home' && lot.use !== 'shop') lot.paid = 3; lot.prog = 0; p.cum = [0, 0]; for (const r of team) this.build(r, p); return; } // 玩家放的东西：用途早就商量好了
    const why = this.decideUse(lot); this.stats.hauls++; this.ver++;
    if (lot.use === 'deco') { lot.done = true; lot.stage = 'done'; lot.doneAt = this.t; p.stage = 'done'; lot.by = team.map(r => r.id).slice(0, 5); this.lotEv(lot, `${team.slice(0, 3).map(r => r.name).join('、')}把它擦干净摆在了路边`); }
    const first = this.stats.hauls === 1; const ck = this.cat[p.kind] || (this.cat[p.kind] = { n: 1, day: this.day(), uses: [] }); const firstKind = !ck.hauled; ck.hauled = 1;
    if (first || firstKind || lot.use === 'shop') this.addCard('haul', first ? '第一次拖回物件！' : `${OBJ_NAME[p.kind]}拖回来了`, `${team.map(r => r.name).join('、')}一路喊着号子，把${OBJ_NAME[p.kind]}拖到了镇上。大家商量了一下：${why}，${lot.use === 'deco' ? '就把它擦干净摆在路边，当个纪念吧' : `就把它改成「${lot.name}」吧`}。`, team, [lot.x, lot.z]);
  }
  finishLot(p, lot) {
    lot.done = true; lot.stage = 'done'; lot.doneAt = this.t; lot.forceShop = null; p.stage = 'done'; this.ver++; this.stats.built++;
    const builders = this.res.filter(r => r.builtOn === lot.id); lot.by = builders.map(r => r.id).slice(0, 5); this.lotEv(lot, `${builders.length ? builders.slice(0, 3).map(r => r.name).join('、') : '大家'}把${lot.name}弄好了`);
    if (lot.use === 'fac' || lot.use === 'deco' || lot.use === 'bridge') { if (lot.item) this.leniaFinish(lot); for (const r of builders) r.builtOn = 0; return; }
    if (lot.use === 'home') {
      const movers = [];
      for (const r of this.res) if (r.home < 0 && r.sp === lot.usp && lot.beds.length < CAP[lot.kind]) { lot.beds.push(r.id); r.home = lot.id; movers.push(r); this.wishHit(r, 'home'); }
      for (const r of this.res) if (lot.beds.length < CAP[lot.kind] && r.sp === lot.usp && !movers.includes(r) && this.moveHome(r)) movers.push(r);
      for (const r of this.res) if (r.home < 0 && lot.beds.length < CAP[lot.kind]) { lot.beds.push(r.id); r.home = lot.id; movers.push(r); }
      const who = [...movers, ...builders.filter(b => !movers.includes(b)).slice(0, 2)];
      if (movers.length || this.stats.built <= 1) this.addCard('home', `新家落成：${lot.name}`, movers.length ? `${lot.name}装好了门窗和烟囱。${movers.map(r => r.name).join('、')}搬了进去，第一晚就睡得特别香。` : `${lot.name}装好了门窗和烟囱，屋里还空着，等新邻居搬来。`, who, [lot.x, lot.z]);
    } else {
      let best = null;
      for (const r of this.res.filter(r => r.owner < 0)) { const s = (USES[lot.kind] && r.sp === USES[lot.kind][0].sp ? 2 : 0) + (r.traits.includes('diligent') ? 1 : 0) + (r.traits.includes('generous') ? 0.8 : 0) + (r.traits.includes('chatty') ? 0.6 : 0) + this.rng(); if (!best || s > best.s) best = { r, s }; }
      if (best) { lot.owner = best.r.id; best.r.owner = lot.id; best.r.mood = Math.min(100, best.r.mood + 15); this.remember(best.r, `当上了${lot.name}的店主`); }
      this.addCard('shop', `开店啦：${lot.name}`, `${lot.name}挂上了招牌，${best ? best.r.name + '当了店主，' : ''}门口摆好了两张小桌。以后大家累了、馋了，都可以来坐一坐。`, best ? [best.r] : [], [lot.x, lot.z]);
    }
    if (lot.item) this.leniaFinish(lot);
    for (const r of builders) r.builtOn = 0;
  }
  // 施工现场（画面和施工牌用）：缺料停工时缺什么；工地旁边堆着的材料（正在用的这一阶段按进度慢慢用掉；等着开工的按镇上已有的算）
  siteWho(p, lot) { const ids = this.res.filter(r => (r.buildP === p.id && r.job === 'build') || (r.fetchP === p.id && r.job === 'fetch') || p.team.includes(r.id)).map(r => r.id); return ids.length ? ids : this.res.filter(r => r.builtOn === lot.id).map(r => r.id).slice(0, 4); }
  siteEta(p, lot) { // 大概还要多少秒（小镇时间）；-1 = 说不准（缺料、等人）
    if (p.stage === 'renovate') { if (this.siteMissing(lot).length) return -1; const w = Math.max(1, Math.min(4, p.workers || this.siteWho(p, lot).length || 1)); return (1 - lot.prog) * (80 + TEAM[p.kind] * 22) / w * 1.6; }
    if (p.stage === 'haul') return (p.cum[p.cum.length - 1] - p.s) / 0.7 * 1.3;
    return -1;
  }
  lotFast(id) { const l = this.lotById(id); return !!(l && l.fast && Date.now() < l.fast); } // 新手教程那次组合的施工加速标记（临时字段）
  siteMissing(lot) { return lot.paid < 3 && lot.prog >= lot.paid / 3 - 1e-6 ? this.stageMissing(lot) : []; }
  sitePile(lot) {
    const out = []; if (lot.paid >= 3 && lot.prog >= 1 - 1e-6) return out;
    if (lot.prog < lot.paid / 3 - 1e-6) { const st = lot.paid - 1; if (st < 0 || !STAGE_COST[st]) return out; const left = clamp((lot.paid / 3 - lot.prog) * 3, 0, 1); for (const k in STAGE_COST[st]) { const n = Math.ceil(STAGE_COST[st][k] * left); if (n > 0) out.push([k, n]); } }
    else if (lot.paid < 3) { const c = STAGE_COST[lot.paid]; for (const k in c) { const n = Math.min(c[k], Math.floor(this.mats[k] || 0)); if (n > 0) out.push([k, n]); } }
    return out;
  }
  stageMissing(lot) { if (lot.paid >= 3) return []; const cost = STAGE_COST[lot.paid]; const miss = []; for (const k in cost) if ((this.mats[k] || 0) < cost[k]) miss.push(k); return miss; }
  payStage(lot, r) {
    const cost = STAGE_COST[lot.paid]; for (const k in cost) this.mats[k] -= cost[k];
    const used = Object.entries(cost).map(([k, n]) => `${n} 个${MAT_NAME[k]}`).join('、');
    this.log.push(`${r.name}用了${used}，给${lot.name}${STAGE_NAME[lot.paid]}`); this.remember(r, `给${lot.name}${STAGE_NAME[lot.paid]}`); lot.paid++;
  }
  // ---------------------------------------------------------------- decisions (only when a task ends or gets interrupted)
  finishTask(r) { this.releaseSeat(r); this.releaseBuild(r); r.steps = []; r.si = 0; r.way = null; r.timer = 0; r.act = ACT.IDLE; r.job = ''; if (!r.got) r.box = 0; r.taskT = 0; }
  interrupt(r, why) { this.stats.interrupts++; this.finishTask(r); if (r.got) { this.mats[r.got[0]] = Math.min(this.matCap(), (this.mats[r.got[0]] || 0) + r.got[1]); r.got = null; r.box = 0; } r.timer = 0.2; if (why) r.doing = why; }
  setSteps(r, steps, job, doing) { this.releaseSeat(r); r.steps = steps; r.si = 0; r.way = null; r.job = job; r.taskT = 0; r.mv = 0; r.mvT = 0; if (doing) r.doing = doing; this.beginStep(r); }
  go(x, z) { return { k: 'go', x, z }; }
  doo(act, dur, fn, extra = {}) { return { k: 'do', act, dur, fn, ...extra }; }
  has(r, t) { return r.traits.includes(t); }
  shopOpen(l) { const o = this.rById(l.owner); return !!(o && o.job === 'tend' && o.si >= 1 && !isNight(this.dayT())); }
  decide(r) {
    const night = isNight(this.dayT(), r.late + (this.has(r, 'chatty') || this.has(r, 'curious') ? 0.015 : 0)); const home = this.lotById(r.home);
    if (r.home < 0) this.claimBed(r);
    this.stowFood(r);
    const supper = night && r.energy >= 12 && r.full < 50 && !!chooseFood(r.fav, this.store); // 睡前先吃点：不然小块的莓果之后一觉睡到饿
    // 1) 睡觉
    if ((night || r.energy < 12) && !supper) {
      const h = this.lotById(r.home);
      if (h && h.done) return this.setSteps(r, [this.go(...h.door), this.doo(ACT.INSIDE, 0, 'sleepHome')], 'sleep', `在${h.name}里睡觉`);
      const a = this.rnd(0, TAU), rr = this.rnd(6.2, 8.4); return this.setSteps(r, [this.go(Math.cos(a) * rr, Math.sin(a) * rr), this.doo(ACT.SLEEP, 0, 'sleepCamp')], 'camp', '在祭坛边的草地上打地铺');
    }
    // 2) 吃饭
    if (r.full < 35 || (r.full < 50 && this.has(r, 'foodie')) || supper) {
      const shop = this.lots.find(l => l.use === 'shop' && FOODISH.has(l.shop) && l.done && l.owner !== r.id && this.shopOpen(l) && this.freeSeat(l) >= 0 && (l.bread || 0) - l.seats.filter(Boolean).length >= 1); // 店里要真有现做的面包才去
      if (shop && this.rng() < 0.4) return this.visitShop(r, shop);
      const want = chooseFood(r.fav, this.store);
      if (want) { const a = this.rnd(0, TAU), rr = this.rnd(5.6, 8.6), b = this.rnd(0, TAU); const take = [this.go(STORE_POS[0] + Math.cos(b) * 2.2, STORE_POS[1] + Math.sin(b) * 2.2), this.doo(ACT.IDLE, 1.2, 'takeFood')];
        const h = this.lotById(r.home); if (h && h.done && this.rng() < 0.4) return this.setSteps(r, [...take, this.go(...h.door), this.doo(ACT.INSIDE, this.rnd(10, 16), 'eat')], 'eat', `把吃的带回${h.name}，坐在桌边慢慢吃`); // 有家的有时带回家吃（进屋能看到围坐吃饭）
        return this.setSteps(r, [...take, this.go(Math.cos(a) * rr, Math.sin(a) * rr), this.doo(ACT.EAT, 7, 'eat')], 'eat', `去粮筐拿${FOODS[want].name}吃`); }
      return this.gather(r, true);
    }
    // 3) 店主看店
    const own = this.lotById(r.owner);
    if (own && own.done && r.energy > 25 && this.dayT() > 0.27 && this.dayT() < 0.84 && this.rng() < 0.6) return this.tend(r, own);
    // 4) 托梦：醒着、不太饿就先去
    if (r.dream && r.dream.status === 'pending' && r.full >= 25) { if (this.doDream(r)) return; }
    // 5) 打分
    const opts = []; const pop = this.res.length; const target = pop * 4 + 10; const W = r.wish ? r.wish.type : ''; const dT = this.dayT();
    opts.push(['gather', clamp((target - storeSum(this.store)) / target, 0, 1) * 1.6 + 0.12 + (this.has(r, 'diligent') ? 0.25 : 0) + (W === 'fish' || W === 'berry' ? 0.8 : 0)]);
    const hp = this.projects.filter(p => (p.stage === 'gather' || p.stage === 'haul') && p.team.length < p.need);
    if (hp.length && dT < 0.8 && r.full > 45) { const fr = hp[0].team.some(id => r.friends.includes(id)) ? 0.5 : 0; opts.push(['haul', 1.9 + fr + (this.has(r, 'generous') ? 0.4 : 0) + (W === 'haul' ? 0.8 : 0) + (this.has(r, 'easy') ? -0.4 : 0)]); }
    const rp = this.projects.filter(p => p.stage === 'renovate');
    const rpWork = rp.filter(p => { const l = this.lotById(p.lot); return p.workers < 4 && l.prog < 1 - 1e-6 && (l.prog < l.paid / 3 - 1e-6 || !this.stageMissing(l).length); });
    const rpFetch = rp.filter(p => { const l = this.lotById(p.lot); return l.prog >= l.paid / 3 - 1e-6 && this.stageMissing(l).length && p.fetchers < 3; });
    if (rpWork.length && dT < 0.86) opts.push(['build', 1.3 + (this.has(r, 'diligent') ? 0.35 : 0) + (rpWork.some(p => this.lotById(p.lot).usp === r.sp) ? 0.4 : 0) + (W === 'build' ? 0.8 : 0)]);
    if (rpFetch.length && dT < 0.86) opts.push(['fetch', 1.5 + (this.has(r, 'diligent') ? 0.3 : 0)]);
    const far = this.lots.filter(l => l.stage === 'far');
    if (dT < 0.8) opts.push(['explore', (far.length && this.activeProjects() < 2 ? 0.55 : 0.12) + (this.has(r, 'curious') ? 0.5 : 0) + (this.has(r, 'brave') ? 0.3 : 0) + (this.has(r, 'timid') ? -0.3 : 0) + (W === 'find' ? 0.9 : 0)]);
    const shops = this.lots.filter(l => l.use === 'shop' && l.done && this.shopOpen(l) && this.freeSeat(l) >= 0 && l.owner !== r.id);
    if (shops.length && this.t - r.lastShop > DAY * 0.25) opts.push(['shop', (100 - r.mood) / 100 * 1.2 + 0.35 + (this.has(r, 'foodie') ? 0.35 : 0) + (W === 'shop' ? 0.9 : 0)]);
    opts.push(['social', (100 - r.mood) / 100 * 1.0 + 0.15 + (this.has(r, 'chatty') ? 0.4 : 0) + (W === 'friend' ? 0.7 : 0)]);
    if (r.energy < 40 && home && home.done) opts.push(['nap', 1.0 + (this.has(r, 'easy') ? 0.3 : 0)]);
    opts.push(['wander', 0.3 + (this.has(r, 'easy') ? 0.3 : 0)]);
    const facs = this.facs(); if (facs.length && dT < 0.85) opts.push(['fac', 0.35 + (100 - r.mood) / 180 + (this.has(r, 'curious') ? 0.15 : 0)]);
    this.weatherOpts(r, opts, home); // 下雨多躲在家里/店里，晴天多出门，下雪堆雪人
    let best = null; for (const [k, v] of opts) { const s = v + this.rng() * 0.45; if (!best || s > best[1]) best = [k, s]; }
    switch (best[0]) {
      case 'shelter': case 'snowman': return this.weatherAct(r, best[0], home);
      case 'gather': return this.gather(r, false, W === 'fish' ? 'fish' : W === 'berry' ? 'berry' : null);
      case 'haul': return this.joinHaul(r, hp[0]);
      case 'build': return this.build(r, this.pick(rpWork));
      case 'fetch': return this.fetchMat(r, this.pick(rpFetch));
      case 'explore': return this.explore(r, far.length && (W === 'find' || this.rng() < 0.7) ? this.pick(far) : null);
      case 'shop': { const wl = W === 'shop' ? shops.find(l => l.id === r.wish.target) : null; return this.visitShop(r, wl || this.pick(shops)); }
      case 'fac': { const fw = facs.map(l => (l.fac === 'pond' && (r.sp === 'duck' || r.sp === 'chick')) || (l.fac === 'play' && r.sp === 'dog') || (l.fac === 'table' && r.full < 70) ? 3 : 1); let q = this.rng() * fw.reduce((a, b) => a + b, 0), l = facs[0]; for (let i = 0; i < facs.length; i++) { q -= fw[i]; if (q <= 0) { l = facs[i]; break; } } const a = this.rnd(0, TAU), rr = Math.max(l.r + 0.9, footOf(l).R * 0.8); return this.setSteps(r, [this.go(l.x + Math.cos(a) * rr, l.z + Math.sin(a) * rr), this.doo(ACT.IDLE, this.rnd(8, 14), 'facFun', { lot: l.id, face: [l.x, l.z] })], 'wander', `去${l.name}${FAC[l.fac].verb}`); }
      case 'nap': return this.setSteps(r, [this.go(...home.door), this.doo(ACT.INSIDE, this.rnd(50, 100), 'nap')], 'nap', `回${home.name}打个盹`);
      case 'social': {
        const others = this.res.filter(o => o !== r && !o.haul && o.act !== ACT.INSIDE && o.act !== ACT.SLEEP && o.job !== 'tend');
        const wt = W === 'friend' ? this.rById(r.wish.target) : null;
        const fr = others.filter(o => (r.aff[o.id] || 0) >= 8);
        const o = wt && others.includes(wt) ? wt : fr.length && this.rng() < 0.6 ? this.pick(fr) : others.length && this.rng() < 0.5 ? this.pick(others) : null;
        if (o) return this.setSteps(r, [this.go(o.x + this.rnd(-1.5, 1.5), o.z + this.rnd(-1.5, 1.5)), this.doo(ACT.IDLE, this.rnd(3, 6), null)], 'visit', `去找${o.name}聊天`);
        const a = this.rnd(0, TAU), rr = this.rnd(5.5, 9); return this.setSteps(r, [this.go(Math.cos(a) * rr, Math.sin(a) * rr), this.doo(ACT.IDLE, this.rnd(10, 20), null)], 'plaza', '在广场上晒太阳');
      }
      default: {
        const n = this.nodes[Math.floor(this.rng() * this.nodes.length)];
        return this.setSteps(r, [this.go(n.x + this.rnd(-2, 2), n.z + this.rnd(-2, 2)), this.doo(ACT.IDLE, this.rnd(6, 14), 'stroll')], 'wander', '在小路上闲逛');
      }
    }
  }
  gather(r, forSelf, prefType = null, onlyIdx = -1, exclude = -1) {
    const pref = prefType || { chick: 'veg', rabbit: 'veg', cat: 'fish', dog: 'berry', duck: 'fish', bear: 'berry' }[r.sp];
    let best = null;
    for (const s of this.rsc) { if (s.type === 'wood' || s.stock < 1 || s.id === exclude) continue; if (onlyIdx >= 0 && s.id !== onlyIdx) continue; if (!forSelf && (this.store[RSC_FOOD[s.type]] || 0) >= STORE_FULL) continue; /* 这种已经堆满了，不用再采 */ const ft = RSC_FOOD[s.type]; const lack = clamp((12 - (this.store[ft] || 0)) / 12, 0, 1); /* 粮筐里这种缺得越多越想采它 */ const sc = (s.type === pref ? 16 : 0) + lack * 14 - Math.hypot(s.x - r.x, s.z - r.z) * 0.6 + s.stock * 0.3 + this.rng() * 10; if (!best || sc > best.sc) best = { s, sc }; }
    if (!best) { const a = this.rnd(0, TAU); const stocked = this.rsc.some(q => q.type !== 'wood' && q.stock >= 1); return this.setSteps(r, [this.go(Math.cos(a) * 8, Math.sin(a) * 8), this.doo(ACT.IDLE, 8, null)], 'wait', stocked ? '粮筐里的吃的够多了，在广场上晒晒太阳' : '能吃的都被采光了，在广场上等等'); }
    const s = best.s; let px, pz;
    if (s.type === 'veg') { const side = this.rng() < 0.5 ? -1 : 1; px = s.x + this.rnd(-s.hx + 0.6, s.hx - 0.6); pz = s.z + side * (s.hz + 0.9); }
    else if (s.type === 'fish') { const a = this.rnd(-0.8, 0.8); px = s.x - Math.sin(s.ang + a) * 1.3; pz = s.z - Math.cos(s.ang + a) * 1.3; }
    else { const a = this.rnd(0, TAU); px = s.x + Math.cos(a) * (s.r + 0.6); pz = s.z + Math.sin(a) * (s.r + 0.6); }
    const act = s.type === 'fish' ? ACT.FISH : s.type === 'veg' ? ACT.FARM : ACT.GATHER;
    const steps = [this.go(px, pz), this.doo(act, this.rnd(10, 16), forSelf ? 'gatherEat' : 'gather', { src: s.id, face: [s.x, s.z] })];
    if (!forSelf) steps.push(this.go(STORE_POS[0] + this.rnd(-2.3, 2.3), STORE_POS[1] + this.rnd(-2.3, 2.3)), this.doo(ACT.IDLE, 1.5, 'deliver'));
    const verb = s.type === 'fish' ? '钓鱼' : s.type === 'veg' ? '收菜' : '摘莓果';
    this.setSteps(r, steps, forSelf ? 'forage' : 'gather', forSelf ? `饿了，去${s.name}${verb}填肚子` : `去${s.name}${verb}`);
  }
  build(r, p) {
    const lot = this.lotById(p.lot);
    if (lot.paid >= 3 && lot.prog >= 1 - 1e-6) { r.timer = 1; return; }
    if (lot.prog >= lot.paid / 3 - 1e-6) { if (this.stageMissing(lot).length) return this.fetchMat(r, p); this.payStage(lot, r); }
    const a = this.rnd(0, TAU), rr = lot.r * 0.85 + 0.8;
    this.setSteps(r, [this.go(lot.x + Math.cos(a) * rr, lot.z + Math.sin(a) * rr), this.doo(ACT.BUILD, lot.fast && Date.now() < lot.fast ? 2 : 12, 'work', { face: [lot.x, lot.z], lot: lot.id })], 'build', `在给${lot.name}${STAGE_NAME[Math.max(0, lot.paid - 1)]}`);
    p.workers++; r.buildP = p.id;
  }
  fetchMat(r, p) {
    const lot = this.lotById(p.lot); const miss = this.stageMissing(lot); if (!miss.length) return this.build(r, p);
    const m = this.pick(miss); let steps, where;
    if (m === 'twig') { steps = [this.go(WOOD_POS[0] + this.rnd(-2.5, 2.5), WOOD_POS[1] + 3.6), this.doo(ACT.CHOP, 5, 'getMat', { mat: m, n: 2 })]; where = '木枝堆'; }
    else if (m === 'stone') { const s = STREAM[60 + Math.floor(this.rng() * 70)]; const l = Math.hypot(s[0], s[1]); steps = [this.go(s[0] - s[0] / l * 4.2, s[1] - s[1] / l * 4.2), this.doo(ACT.GATHER, 6, 'getMat', { mat: m, n: 1 + (this.rng() < 0.4 ? 1 : 0), face: [s[0], s[1]] })]; where = '溪边'; }
    else if (m === 'grass') { const a = this.rnd(0, TAU), rr = this.rnd(30, 44); steps = [this.go(Math.cos(a) * rr, Math.sin(a) * rr), this.doo(ACT.GATHER, 6, 'getMat', { mat: m, n: 2 })]; where = '草地'; }
    else { const g = this.pick(this.nodes.filter(n => n.k === 'gate')); const l = Math.hypot(g.x, g.z); const ox = g.x / l * (EDGE_R - 3) + this.rnd(-4, 4), oz = g.z / l * (EDGE_R - 3) + this.rnd(-4, 4); steps = [this.go(g.x, g.z), this.go(ox, oz), this.doo(ACT.GATHER, 8, 'getMat', { mat: m, n: 1, trinket: true })]; where = '人类花园的草坪'; }
    steps.push(this.go(lot.x + this.rnd(-1, 1) * lot.r, lot.z + this.rnd(-1, 1) * lot.r), this.doo(ACT.IDLE, 1.5, 'dropMat', { lot: lot.id }));
    this.setSteps(r, steps, 'fetch', `${lot.name}缺${MAT_NAME[m]}，去${where}找`);
    p.fetchers++; r.fetchP = p.id; if (!r.emo) this.emo(r, 1, 3, { k: 'mat', a: MAT_NAME[m], b: lot.name, c: where }); // 头顶冒个“？”：在找东西
  }
  explore(r, lot, dream = false) {
    const gates = this.nodes.filter(n => n.k === 'gate'); let tx, tz, g;
    if (lot) { g = gates.reduce((b, n) => !b || Math.hypot(n.x - lot.fx, n.z - lot.fz) < Math.hypot(b.x - lot.fx, b.z - lot.fz) ? n : b, null); const d = Math.hypot(g.x - lot.fx, g.z - lot.fz) || 1; const k = Math.max(0, d - lot.r - 3) / d; tx = g.x + (lot.fx - g.x) * k; tz = g.z + (lot.fz - g.z) * k; }
    else { g = this.pick(gates); const l = Math.hypot(g.x, g.z); tx = g.x + g.x / l * this.rnd(5, 9); tz = g.z + g.z / l * this.rnd(5, 9); }
    this.setSteps(r, [this.go(g.x, g.z), this.go(tx, tz), this.doo(ACT.IDLE, 4, 'look', { lot: lot ? lot.id : -1, dream, face: lot ? [lot.fx, lot.fz] : null })], 'explore', dream ? '梦见了远方的东西，去村口外看看' : '去村口外的人类花园探探路');
  }
  tend(r, lot) {
    const sp = shopSpots(lot, this.K[lot.kind]); const ox = Math.sin(lot.rot), oz = Math.cos(lot.rot);
    this.setSteps(r, [this.go(...sp.counter), this.doo(ACT.IDLE, this.rnd(90, 160), 'tend', { face: [sp.counter[0] + ox, sp.counter[1] + oz] })], 'tend', `在${lot.name}看店`);
  }
  freeSeat(l) { for (let i = 0; i < 4; i++) if (!l.seats[i]) return i; return -1; }
  visitShop(r, l) {
    const i = this.freeSeat(l); if (i < 0) return this.gather(r, true);
    const s = shopSpots(l, this.K[l.kind]).seats[i];
    this.setSteps(r, [this.go(s[0], s[1]), this.doo(ACT.EAT, this.rnd(14, 22), 'shopEat', { lot: l.id, face: [s[2], s[3]] })], 'shop', `去${l.name}${SHOP[l.shop].act}`);
    l.seats[i] = r.id; r.seat = [l.id, i]; if (FOODISH.has(l.shop) && (l.bread || 0) >= 1) r.carryF = 'bread';
  }
  releaseSeat(r) { if (r.seat) { const l = this.lotById(r.seat[0]); if (l && l.seats[r.seat[1]] === r.id) l.seats[r.seat[1]] = 0; r.seat = null; } }
  // ---------------------------------------------------------------- 吃：每种食物效果不同，吃到最爱的更开心
  stowFood(r) { // 手上还剩着没吃的（被打断了）：饿就顺手吃一份，其余放回粮筐，不让食物凭空消失
    if (!r.carryF || !(r.carry > 0)) { r.carry = r.carryF ? 0 : r.carry; r.carryF = null; return; }
    const k = r.carryF; let n = r.carry; r.carry = 0; r.carryF = null;
    if (r.full < 80) { this.ate(r, k, '路边'); n -= 1; }
    if (n > 0) this.store[k] = (this.store[k] || 0) + n;
  }
  noteSwap(r, k) { // 最爱的吃不到、改吃别的：记一笔（日常小事，不是失败）
    const f = r.fav; if (k === f || (this.store[f] || 0) >= 1) return;
    this.stats.swaps = (this.stats.swaps || 0) + 1; const sh = this.stats.short || (this.stats.short = {}); sh[f] = (sh[f] || 0) + 1;
    this.remember(r, `想吃${FOODS[f].name}，可粮筐里没有了，改吃${FOODS[k].name}`);
  }
  ate(r, food, where, portion = 1, light = false) {
    const e = eatEffect(r.fav, food, portion); r.full = Math.min(100, r.full + e.full); r.mood = Math.min(100, r.mood + e.mood); r.energy = Math.min(100, r.energy + e.energy);
    const rec = { f: food, fav: e.fav ? 1 : 0, day: this.day(), hm: hm(this.dayT()), at: where }; r.ate.unshift(rec); if (r.ate.length > 3) r.ate.length = 3;
    this.foodLog.unshift({ id: r.id, name: r.name, sp: r.sp, ...rec }); if (this.foodLog.length > 8) this.foodLog.length = 8;
    const st = this.stats; st.eats = (st.eats || 0) + 1; const by = st.eatBy || (st.eatBy = {}); by[food] = (by[food] || 0) + 1; if (e.fav) st.favEats = (st.favEats || 0) + 1;
    if (!light) this.remember(r, eatText(food, e.fav, where));
    if (e.fav && !light) this.emo(r, EMO.LOVE + FOOD_IDS.indexOf(food), 4, { k: 'favEat', a: FOODS[food].name, b: where });
    return e;
  }
  // 面包房 / 小食堂：店主在店里真的烤面包。用粮筐里的菜和莓果当原料；炉子烤上一阵才出炉，原料不够就不出
  bakeTick(dt) {
    const reserve = 4;
    for (const l of this.lots) {
      if (l.use !== 'shop' || !FOODISH.has(l.shop) || !l.done) { if (l.cook) l.cook = 0; continue; }
      const o = this.rById(l.owner); const work = !!(o && !o.away && o.job === 'tend' && o.si >= 1 && !isNight(this.dayT()));
      if (!work) { l.cook = 0; continue; }
      const raw = this.store.veg + this.store.berry;
      if (!(l.cook > 0)) { if ((l.bread || 0) < 4 && this.store.bread < 5 && raw >= 3 + reserve) l.cook = 0.01; else continue; }
      l.cook += dt;
      if (l.cook >= BAKE_T) {
        l.cook = 0; const S = this.store; const take = []; // 配方：菜 2 + 莓果 1 → 面包 3；缺哪样就用另一样顶上（一共要 3 份）
        const nv = Math.min(2, Math.floor(S.veg)), nb = Math.min(1, Math.floor(S.berry)); for (let i = 0; i < nv; i++) take.push('veg'); for (let i = 0; i < nb; i++) take.push('berry');
        while (take.length < 3) { const k = S.veg - take.filter(x => x === 'veg').length >= S.berry - take.filter(x => x === 'berry').length ? 'veg' : 'berry'; if (S[k] - take.filter(x => x === k).length < 1) break; take.push(k); }
        if (take.length < 3 || raw < 3 + reserve) { l.fail = (l.fail || 0) + 1; continue; } // 没原料：这一炉不出
        for (const k of take) S[k] -= 1;
        const inShop = Math.min(2, 6 - (l.bread || 0)); l.bread = (l.bread || 0) + inShop; S.bread += 3 - inShop;
        l.baked = (l.baked || 0) + 3; this.stats.baked = (this.stats.baked || 0) + 3;
        if (o) { o.mood = Math.min(100, o.mood + 1); this.remember(o, `在${l.name}烤出一炉面包`); }
      }
    }
  }
  // step handlers (task results)；返回 true 表示已经换了新任务
  onDone(r, st) {
    const s = this.rsc[st.src];
    switch (st.fn) {
      case 'takeFood': { const k = chooseFood(r.fav, this.store); if (k) { this.noteSwap(r, k); this.store[k] -= 1; r.carry = 1; r.carryF = k; } break; }
      case 'eat': if (r.carry) { this.ate(r, r.carryF || 'veg', r.act === ACT.INSIDE ? '家里' : '粮筐边'); r.carry = 0; r.carryF = null; } break;
      case 'gather': case 'gatherEat': {
        if (!s || s.stock < 1) { // 目标没了：换个地方（受阻 → 改选）
          this.stats.blocked++; this.remember(r, `${s ? s.name : '那里'}已经被采光了，换个地方`);
          if (r.dream && r.dream.status === 'pending' && r.dream.type === 'res' && s && r.dream.target === s.id) this.dreamEnd(r, 'blocked', `${s.name}已经被采光了`);
          this.gather(r, st.fn === 'gatherEat', null, -1, st.src); return true;
        }
        if (st.fn === 'gather') { const n = Math.min(s.stock, s.type === 'fish' ? 3 : 2.5); s.stock -= n; r.carry = n; r.carryF = RSC_FOOD[s.type] || 'veg'; } else { s.stock -= 1; this.ate(r, RSC_FOOD[s.type] || 'veg', s.name); }
        if (s.type === 'fish') this.wishHit(r, 'fish'); if (s.type === 'berry') this.wishHit(r, 'berry');
        if (r.dream && r.dream.status === 'pending' && r.dream.type === 'res' && r.dream.target === s.id) this.dreamEnd(r, 'done', `在${s.name}满载而归`);
        this.pickup(r, s.type === 'fish' ? 'stone' : s.type === 'veg' ? 'grass' : 'twig', 0.2);
        break;
      }
      case 'deliver': this.store[r.carryF || 'veg'] = (this.store[r.carryF || 'veg'] || 0) + r.carry; r.carry = 0; r.carryF = null; r.mood = Math.min(100, r.mood + 2); break;
      case 'work': {
        const p = this.projects.find(p => p.id === r.buildP); const lot = this.lotById(st.lot);
        if (p && lot && p.stage === 'renovate') { lot.prog = Math.min(lot.paid / 3, lot.prog + 12 / (80 + TEAM[p.kind] * 22) * (lot.fast && Date.now() < lot.fast ? 14 : 1)); r.built++; r.builtOn = lot.id; this.wishHit(r, 'build'); r.mood = Math.min(100, r.mood + 1); }
        this.releaseBuild(r); break;
      }
      case 'getMat': {
        let m = st.mat; const n = st.n; if (st.trinket && this.rng() > 0.85) m = this.pick(MAT_TRINKET);
        r.box = 1; r.got = [m, n]; this.remember(r, `找到了 ${n} 个${MAT_NAME[m]}`);
        if (st.trinket && this.rng() < 0.3) this.pickup(r, this.pick(MAT_NATURAL), 1);
        break;
      }
      case 'dropMat': { if (r.got) { this.mats[r.got[0]] = Math.min(this.matCap(), (this.mats[r.got[0]] || 0) + r.got[1]); r.got = null; } r.box = 0; this.releaseFetch(r); break; }
      case 'nap': r.energy = Math.min(100, r.energy + 30); break;
      case 'look': {
        const lot = this.lotById(st.lot);
        if (lot && lot.stage === 'far') {
          const ok = this.discover(lot, r);
          if (st.dream) this.dreamEnd(r, ok ? 'done' : 'blocked', ok ? `照着梦里的样子，真的找到了${OBJ_NAME[lot.kind]}` : '找到了，可大家手上的活太多，只好先记在心里');
          return ok;
        }
        if (lot && st.dream) { // 被别人先发现了：能帮就去帮忙拖
          const p = this.projects.find(p => p.id === lot.id);
          if (p && (p.stage === 'gather' || p.stage === 'haul') && p.team.length < p.need) { this.dreamEnd(r, 'done', '赶到时别人已经发现了，就一起帮忙拖'); this.joinHaul(r, p); return true; }
          this.dreamEnd(r, 'blocked', `${OBJ_NAME[lot.kind]}已经被别人拖走了`);
        }
        if (!this.pickup(r, this.pick(MAT_TRINKET), 0.45)) this.remember(r, '去村口外转了一圈，没找到什么');
        break;
      }
      case 'shopEat': {
        const l = this.lotById(st.lot); if (!l) break; this.stats.shopVisits++; r.lastShop = this.t;
        if (FOODISH.has(l.shop)) { if ((l.bread || 0) >= 1 && r.full < 75) { l.bread -= 1; this.ate(r, 'bread', l.name); r.mood = Math.min(100, r.mood + 4); l.sold = (l.sold || 0) + 1; } else { r.mood = Math.min(100, r.mood + 5); this.remember(r, (l.bread || 0) >= 1 ? `去${l.name}坐了坐，肚子不饿，闻着面包香就够了` : `去${l.name}坐了坐，刚好面包卖完了`); } } else { r.mood = Math.min(100, r.mood + 14); r.energy = Math.min(100, r.energy + 12); }
        const o = this.rById(l.owner); if (o) { o.mood = Math.min(100, o.mood + 2); this.bond(r, o, 3); }
        if (!FOODISH.has(l.shop)) this.remember(r, `在${l.name}${SHOP[l.shop].verb}`); this.wishHit(r, 'shop');
        if (!l.firstGuest) { l.firstGuest = r.id; if (!this.lots.some(o => o !== l && o.firstGuest)) this.addCard('guest', `${l.name}的第一位客人`, `${r.name}成了${l.name}的第一位客人，${SHOP[l.shop].verb}${o ? `，还跟店主${o.name}聊了好一会儿` : ''}。`, o ? [r, o] : [r], [l.x, l.z]); }
        break;
      }
      case 'facFun': { const l = this.lotById(st.lot); if (l && l.done && l.fac) this.facFun(r, l); break; }
      case 'stroll': this.pickup(r, streamDist(r.x, r.z) < 9 ? 'stone' : this.rng() < 0.5 ? 'twig' : 'grass', 0.12); break;
      case 'tripAway': return this.tripAway(r);
      case 'tripHome': { const e = this.exp; r.box = 0; if (e) r.tripHome = e.id; break; }
      case 'rescue': return this.rescueDone(r, st);
      case 'rescueDrop': this.rescueDrop(r, st); break;
      case 'snowman': this.snowmanDone(r, st); break;
      case 'festDecor': this.festDecor(r); break;
      case 'festFun': r.mood = Math.min(100, r.mood + 6); this.emo(r, 3, 4, { k: 'fest', a: this.festLabel() }); break;
    }
    return false;
  }
  pickup(r, m, p) { if (this.rng() >= p) return false; this.mats[m] = Math.min(this.matCap(), (this.mats[m] || 0) + 1); this.remember(r, `顺手捡到一个${MAT_NAME[m]}`); return true; }
  releaseBuild(r) { if (r.buildP) { const p = this.projects.find(p => p.id === r.buildP); if (p) p.workers = Math.max(0, p.workers - 1); r.buildP = 0; } this.releaseFetch(r); }
  releaseFetch(r) { if (r.fetchP) { const p = this.projects.find(p => p.id === r.fetchP); if (p) p.fetchers = Math.max(0, p.fetchers - 1); r.fetchP = 0; } }
  beginStep(r) {
    const st = r.steps[r.si]; if (!st) { this.finishTask(r); return; }
    if (st.k === 'go') { r.way = this.pathPts(r.x, r.z, st.x, st.z, [r.ox, r.oz]); r.wi = 0; r.act = ACT.WALK; }
    else {
      if (st.act === ACT.INSIDE) { const h = this.lotById(r.home); if (h && h.moving) { this.finishTask(r); r.timer = 4; r.doing = `${h.name}在搬家，等落好了再进去`; return; } } // 搬家期间不进屋
      r.act = st.act; r.timer = st.dur; if (st.face) r.yaw = Math.atan2(st.face[0] - r.x, st.face[1] - r.z); }
  }
  // ---------------------------------------------------------------- per-step update
  stepRes(r, dt) {
    if (r.away) { r.act = ACT.INSIDE; r.full = Math.max(r.full, 50); return; } // 远行在外：不在镇上
    const asleep = r.act === ACT.SLEEP || (r.act === ACT.INSIDE && r.job === 'sleep');
    r.full = Math.max(0, r.full - dt * (asleep ? 0.05 : r.haul ? 0.1 : 0.14) / TIME_K);
    r.energy = clamp(r.energy + dt * (r.act === ACT.INSIDE ? (r.job === 'sleep' ? 0.5 : 0.35) : r.act === ACT.SLEEP ? 0.32 : -0.17) / TIME_K, 0, 100);
    r.mood = clamp(r.mood + ((55 - r.mood) * dt * 0.0015 - (r.full < 15 ? dt * 0.04 : 0)) / TIME_K, 0, 100);
    r.chatCD -= dt; if (r.emote > 0) r.emote -= dt; r.taskT += dt;
    if (r.hungryCD > 0) r.hungryCD -= dt;
    if (r.full < HUNGRY_AT && r.hungryCD <= 0 && !r.emo && r.act !== ACT.SLEEP && r.act !== ACT.INSIDE && !['eat', 'shop', 'camp', 'sleep'].includes(r.job)) { // 饿了：头顶冒个“饿”气泡，点开会说想吃什么
      const f = r.fav; r.hungryCD = 45; this.emo(r, EMO.HUNGRY, 6, { k: 'hungry', a: FOODS[f].name, b: (this.store[f] || 0) >= 1 ? '' : FOODS[chooseFood(r.fav, this.store) || 'veg'].name });
    }
    if (r.chat) { r.chat.t -= dt; r.act = ACT.CHAT; if (r.chat.t <= 0) { r.act = r.chat.prev; r.chat = null; r.chatCD = this.rnd(25, 60); } return; }
    if (r.haul) return this.stepHauler(r, dt);
    // 被打断：饿坏了 / 做太久
    if (r.full < 18 && !['eat', 'forage', 'sleep', 'camp', 'shop', 'trip', 'rescue'].includes(r.job) && r.steps.length) { this.interrupt(r, '肚子咕咕叫，先放下手里的事去吃饭'); return; }
    if (r.taskT > 260 && !['sleep', 'camp', 'tend', 'trip'].includes(r.job) && r.steps.length) { this.stats.stuck++; this.interrupt(r, '这件事做了太久，换件事做'); return; }
    const st = r.steps[r.si];
    if (!st) { r.timer -= dt; if (r.timer <= 0) this.decide(r); return; }
    if (st.k === 'go') {
      const w = r.way && r.way[r.wi]; if (!w) { this.interrupt(r, '找不到路，换个办法'); return; }
      const dx = w[0] - r.x, dz = w[1] - r.z; const d = Math.hypot(dx, dz); const v = r.spd * dt * (r.box ? 0.85 : 1) * (r.job === 'build' && r.buildP != null && this.lotFast(r.buildP) ? 7 : 1); // 教程加速的工地：小动物小跑着赶去
      if (d <= v) { r.x = w[0]; r.z = w[1]; r.mv += d; if (++r.wi >= r.way.length) { r.si++; this.beginStep(r); } }
      else { r.x += dx / d * v; r.z += dz / d * v; r.yaw = Math.atan2(dx, dz); r.mv += v; }
      r.mvT += dt; if (r.mvT > 6) { if (r.mv < 0.3) { this.stats.stuck++; this.interrupt(r, '被挡住了，换条路走'); return; } r.mvT = 0; r.mv = 0; }
      return;
    }
    if (st.fn === 'sleepHome' || st.fn === 'sleepCamp') { if (!isNight(this.dayT(), -r.late) && r.energy > 70) { r.si++; r.mood += (st.fn === 'sleepHome' ? 5 : -3) + (this.hasFac('bell') ? 3 : 0); /* 有钟：听着钟声起床，精神好 */ r.doing = '睡醒了，伸了个懒腰'; this.beginStep(r); } return; }
    if (st.fn === 'tend' && isNight(this.dayT())) { r.si++; this.beginStep(r); return; }
    r.timer -= dt; if (r.timer <= 0) { if (this.onDone(r, st)) return; r.si++; this.beginStep(r); }
  }
  stepHauler(r, dt) {
    const p = this.projects.find(p => p.id === r.haul); if (!p || (p.stage !== 'gather' && p.stage !== 'haul')) { r.haul = null; this.finishTask(r); return; }
    const k = p.team.indexOf(r.id); if (k < 0) { r.haul = null; this.finishTask(r); return; }
    if (r.full < 10) { this.leaveHaul(r, '饿得拉不动了，先去吃点东西'); this.log.push(`${r.name}饿得拉不动了，先回去吃点东西`); return; }
    if (r.energy < 6) { this.leaveHaul(r, '累坏了，回去歇一歇'); return; }
    const [sx, sz, yaw] = this.haulSlot(p, k); const dx = sx - r.x, dz = sz - r.z; const d = Math.hypot(dx, dz);
    if (p.stage === 'gather' || d > 1.6) {
      if (d > 0.3) {
        r.wayT = (r.wayT || 0) - dt; if (!r.way || r.wayT < 0) { r.way = this.pathPts(r.x, r.z, sx, sz); r.wi = 0; r.wayT = p.stage === 'haul' ? 2 : 30; }
        const w = r.way[r.wi] || [sx, sz]; const wx = w[0] - r.x, wz = w[1] - r.z, wd = Math.hypot(wx, wz); const v = r.spd * dt;
        if (wd <= v) { r.x = w[0]; r.z = w[1]; if (r.wi < r.way.length - 1) r.wi++; else r.way = null; } else { r.x += wx / wd * v; r.z += wz / wd * v; r.yaw = Math.atan2(wx, wz); }
        r.act = ACT.WALK;
      } else { r.act = ACT.IDLE; r.yaw = yaw; r.way = null; r.doing = `在${OBJ_NAME[p.kind]}旁边等人到齐（${p.team.length}/${p.need}）`; }
      return;
    }
    if (d > 0.01) { const v = Math.min(d, Math.max(0.8, d * 2) * dt); r.x += dx / d * v; r.z += dz / d * v; }
    r.yaw += Math.atan2(Math.sin(yaw - r.yaw), Math.cos(yaw - r.yaw)) * Math.min(1, dt * 3);
    r.act = ACT.HAUL;
  }
  // 交朋友：好感够了，而且不同时候真的碰面聊过好几回；每人的好朋友有限
  friendCap(r) { return this.has(r, 'chatty') ? 5 : this.has(r, 'timid') ? 2 : 3; }
  isFriend(a, b) { return a.friends.includes(b.id); }
  bond(a, b, n) { if (this.hasFac('school')) n *= 1.25; /* 有学堂：大家更爱交朋友 */ a.aff[b.id] = Math.min(100, (a.aff[b.id] || 0) + n); b.aff[a.id] = Math.min(100, (b.aff[a.id] || 0) + n); this.tryFriend(a, b); }
  meet(a, b) { // 一次真实碰面（聊天）；隔一阵才算新的一次
    if (this.t - (a.lastMeet[b.id] ?? -1e9) < DAY * 0.3) return; a.lastMeet[b.id] = b.lastMeet[a.id] = this.t;
    a.meets[b.id] = (a.meets[b.id] || 0) + 1; b.meets[a.id] = (b.meets[a.id] || 0) + 1;
    if (this.isFriend(a, b) && this.t >= (this.momentT || 0) && this.rng() < 0.35) this.moment(a, b); else this.tryFriend(a, b);
  }
  moment(a, b) { // 老朋友碰面的小片段：地点是真的
    this.momentT = this.t + DAY * this.rnd(0.35, 0.6);
    const near = (x, z) => { let best = '小路上', bd = 1e9; for (const l of this.lots) { if (l.stage !== 'done') continue; const d = Math.hypot(l.x - x, l.z - z); if (d < bd && d < 9) { bd = d; best = `${l.name}门口`; } } for (const s of this.rsc) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd && d < 8) { bd = d; best = `${s.name}边上`; } } if (Math.hypot(x, z) < 11) best = '祭坛广场'; return best; };
    const where = near(a.x, a.z); const topic = this.pick([`${b.name}新学会的${this.pick(['口哨', '翻跟头', '编草环', '数星星的办法'])}`, '昨晚做的梦', '远方草坪上看到的东西', `${this.lotById(a.home)?.name || '家'}门口新开的花`, '哪里的莓果最甜', '明天要不要一起去钓鱼']);
    this.addCard('moment', `${a.name}和${b.name}`, `${where}，老朋友${a.name}和${b.name}碰上了，聊起了${topic}，一聊就是好半天。`, [a, b], [(a.x + b.x) / 2, (a.z + b.z) / 2]);
  }
  tryFriend(a, b) {
    if (this.isFriend(a, b) || (a.aff[b.id] || 0) < FRIEND || (a.meets[b.id] || 0) < FRIEND_MEETS) return;
    if (a.friends.length >= this.friendCap(a) || b.friends.length >= this.friendCap(b)) return;
    a.friends.push(b.id); b.friends.push(a.id);
    this.stats.friends++; a.mood = Math.min(100, a.mood + 10); b.mood = Math.min(100, b.mood + 10);
    this.addCard('friend', `${a.name}和${b.name}成了好朋友`, `${a.name}（${SP_NAME[a.sp]}）和${b.name}（${SP_NAME[b.sp]}）前前后后碰面聊了 ${a.meets[b.id]} 回，发现彼此都${this.commonLine(a, b)}。从今天起，他们是好朋友了。`, [a, b], [(a.x + b.x) / 2, (a.z + b.z) / 2]);
    this.remember(a, `和${b.name}成了好朋友`); this.remember(b, `和${a.name}成了好朋友`);
    this.wishHit(a, 'friend', b.id); this.wishHit(b, 'friend', a.id);
  }
  commonLine(a, b) {
    const c = a.traits.find(t => b.traits.includes(t)); if (c) return { curious: '对什么都好奇', diligent: '闲不下来', generous: '喜欢帮别人', timid: '有点怕黑', foodie: '最爱吃', chatty: '话特别多', easy: '不着急', brave: '胆子大' }[c];
    return this.pick(['喜欢傍晚的风', '讨厌下雨天踩到泥坑', '觉得莓果比蘑菇好吃', '想去远方看看']);
  }
  social() { // 每模拟秒一次：近邻聊天，聊天加好感
    const grid = new Map();
    for (const r of this.res) { if (r.haul || r.chat || r.act === ACT.INSIDE || r.act === ACT.SLEEP) continue; const k = Math.floor(r.x / 3) * 4096 + Math.floor(r.z / 3); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(r); }
    for (const r of this.res) {
      if (r.chat || r.haul || r.chatCD > 0 || (r.act !== ACT.WALK && r.act !== ACT.IDLE) || r.job === 'sleep' || r.job === 'camp' || r.box || r.job === 'tend') continue;
      const gx = Math.floor(r.x / 3), gz = Math.floor(r.z / 3);
      outer: for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
        const a = grid.get((gx + ix) * 4096 + gz + iz); if (!a) continue;
        for (const o of a) { if (o === r || o.chat || o.chatCD > 0 || o.box || (o.act !== ACT.WALK && o.act !== ACT.IDLE) || o.job === 'sleep' || o.job === 'tend') continue;
          if (Math.hypot(o.x - r.x, o.z - r.z) < 2.4 && Math.hypot(r.x, r.z) > PLAZA_R * 0.4) {
            const chance = 0.45 + (this.has(r, 'chatty') ? 0.2 : 0) + (this.has(o, 'chatty') ? 0.2 : 0) + (r.friends.includes(o.id) ? 0.15 : 0);
            if (this.rng() < chance) {
              const dur = this.rnd(4, 7); r.chat = { p: o.id, t: dur, prev: r.act, side: 0 }; o.chat = { p: r.id, t: dur, prev: o.act, side: 1 };
              r.yaw = Math.atan2(o.x - r.x, o.z - r.z); o.yaw = r.yaw + PI; r.mood = Math.min(100, r.mood + 8); o.mood = Math.min(100, o.mood + 8);
              this.stats.chats++; const n = (this.rnd(2, 4) + (this.has(r, 'chatty') ? 1 : 0) + (this.has(o, 'chatty') ? 1 : 0)) * (r.traits.some(t => o.traits.includes(t)) || r.sp === o.sp ? 1.3 : 0.7);
              this.bond(r, o, n); this.meet(r, o); r.doing = `和${o.name}聊天`; o.doing = `和${r.name}聊天`;
            } else r.chatCD = this.rnd(6, 12);
            break outer;
          } }
      }
    }
  }
  arrivals() {
    if (this.t < this.nextArrival || this.res.length >= POP_CAP) return;
    const free = this.homeLots().filter(l => l.beds.length < CAP[l.kind]);
    const pop = this.res.length; const mood = this.res.reduce((a, r) => a + r.mood, 0) / pop;
    if (!free.length || mood < 40 || isNight(this.dayT())) { this.nextArrival = this.t + DAY * 0.08; return; }
    const cnt = {}; for (const r of this.res) cnt[r.sp] = (cnt[r.sp] || 0) + 1;
    const spFree = free.filter(l => l.usp && (cnt[l.usp] || 0) < 3).map(l => l.usp);
    const sp = spFree.length ? this.pick(spFree) : SPECIES.slice().sort((a, b) => (cnt[a] || 0) - (cnt[b] || 0) + this.rnd(-0.6, 0.6))[0];
    const g = this.pick(this.nodes.filter(n => n.k === 'gate')); const len = Math.hypot(g.x, g.z);
    const r = this.spawn(sp, g.x / len * (EDGE_R - 2), g.z / len * (EDGE_R - 2)); r.box = 1; this.claimBed(r);
    const a = this.rnd(0, TAU); this.setSteps(r, [this.go(g.x, g.z), this.go(Math.cos(a) * 7.5, Math.sin(a) * 7.5), this.doo(ACT.IDLE, 3, 'unpack')], 'arrive', '背着行李搬来小镇');
    for (const o of this.res) if (o !== r) o.mood = Math.min(100, o.mood + 1.5);
    const h = this.lotById(r.home); this.stats.arrivals++;
    this.addCard('arrive', `新邻居：${r.name}`, `一只叫${r.name}的${SP_NAME[sp]}背着小包袱搬来了小镇${h ? `，住进了${h.name}` : ''}。性格${r.traits.map(t => TRAITS[t]).join('、')}。`, [r], [g.x, g.z]);
    this.nextArrival = this.t + DAY * this.rnd(0.7, 1.1) * (this.hasFac('flag') ? 0.8 : 1); // 有旗杆：远处的小动物更容易找到小镇
  }
  // ---------------------------------------------------------------- wishes (每人最多 1 个，全镇最多 8 个；不回应不惩罚)
  wishTypes(r) {
    const out = []; const h = this.lotById(r.home);
    if (!h || h.usp !== r.sp) out.push(['home', 1.4, null]);
    const acq = Object.entries(r.aff).filter(([id, v]) => v >= 6 && !r.friends.includes(+id)).map(([id]) => +id).filter(id => this.rById(id)); if (acq.length) out.push(['friend', 1.5, this.pick(acq)]);
    if (this.lots.some(l => l.stage === 'far' || l.stage === 'haul')) { out.push(['haul', r.hauled ? 0.5 : 1.3, null]); out.push(['find', (this.has(r, 'curious') || this.has(r, 'brave')) ? 1.2 : 0.4, null]); }
    const shops = this.lots.filter(l => l.use === 'shop' && l.done && l.owner !== r.id); if (shops.length) out.push(['shop', 1.2, this.pick(shops).id]);
    out.push(['fish', r.sp === 'cat' || r.sp === 'duck' ? 0.7 : 0.2, null]); out.push(['berry', r.sp === 'bear' || this.has(r, 'foodie') ? 0.7 : 0.2, null]);
    if (this.projects.some(p => p.stage === 'renovate')) out.push(['build', r.sp === 'dog' || this.has(r, 'diligent') ? 1.2 : 0.5, null]);
    return out;
  }
  giveWish(r, type = null) {
    let opts = this.wishTypes(r); if (type) opts = opts.filter(o => o[0] === type); if (!opts.length) return;
    const tot = opts.reduce((a, o) => a + o[1], 0); let x = this.rng() * tot, ch = opts[0]; for (const o of opts) { x -= o[1]; if (x <= 0) { ch = o; break; } }
    const [t, , target] = ch; const ctx = { n: r.name, sp: r.sp, traits: r.traits, hut: this.lotById(r.home)?.name };
    if (t === 'friend') ctx.o = this.rById(target).name; if (t === 'shop') { const l = this.lotById(target); ctx.s = l.name; ctx.shopKind = l.shop; }
    r.wish = { type: t, target, text: wishText(t, ctx, Math.floor(this.rng() * 1e6)), t0: this.t, day: this.day() };
  }
  wishHit(r, type, target = null) {
    const w = r.wish; if (!w || w.type !== type) return; if (w.target != null && target != null && w.target !== target) return;
    if (type === 'home') { const h = this.lotById(r.home); if (!h || h.usp !== r.sp) return; }
    r.wish = null; r.wishCD = this.t + DAY * 1.0; r.mood = Math.min(100, r.mood + 12); this.stats.wishDone++; this.heart += 1; r.emote = 3; /* 愿望实现：小动物多送一份谢意 */
    this.addCard('wish', `${r.name}的心愿实现了`, `「${w.text}」——第${w.day}天许下的小心愿，今天真的实现了。${r.name}高兴得原地转了一圈。`, [r], [r.x, r.z]);
  }
  wishTick() {
    for (const r of this.res) if (r.wish && this.t - r.wish.t0 > DAY * 1.5) { r.wish = null; r.wishCD = this.t + DAY * 0.5; }
    if (this.t < this.nextWish) return; this.nextWish = this.t + DAY * (this.day() <= 5 ? this.rnd(0.5, 0.8) : this.rnd(0.3, 0.5));
    if (this.res.filter(r => r.wish).length >= MAX_WISHES) return;
    const c = this.res.filter(r => !r.wish && this.t >= r.wishCD); if (c.length) this.giveWish(this.pick(c));
  }
  // ---------------------------------------------------------------- 托梦（你和 Lenia 夜里悄悄托梦）
  dream(rid, target) {
    const r = this.rById(rid); if (!r) return { ok: false, msg: '找不到这位居民' };
    if (this.heart < DREAM_COST) return { ok: false, msg: `心意不够（要 ${DREAM_COST} 点），收下窗台上的回礼就有了` };
    let label;
    if (target.type === 'obj') { const l = this.lotById(target.id); if (!l || (l.stage !== 'far' && l.stage !== 'haul')) return { ok: false, msg: '那件东西已经不在远方了' }; label = l.stage === 'far' ? `远方草丛里的${OBJ_NAME[l.kind]}` : `大家正在拖的${OBJ_NAME[l.kind]}`; }
    else if (target.type === 'res') { const s = this.rsc[target.id]; if (!s || s.type === 'wood') return { ok: false, msg: '那里没什么可采的' }; label = s.name; }
    else return { ok: false, msg: '梦太模糊了' };
    if (r.dream && r.dream.status === 'pending') this.dreamEnd(r, 'expired', '被新的梦盖过去了');
    this.heart -= DREAM_COST;
    const rec = { id: this.dreamId++, rid, name: r.name, type: target.type, target: target.id, label, t0: this.t, day: this.day(), hm: hm(this.dayT()), status: 'pending', note: '' };
    r.dream = rec; this.dreams.unshift(rec); if (this.dreams.length > 12) this.dreams.length = 12; r.emote = 3;
    this.remember(r, `梦见了${label}`);
    const asleep = r.act === ACT.INSIDE || r.act === ACT.SLEEP;
    if (!r.haul && (LOW_JOBS.has(r.job) || !r.steps.length)) this.interrupt(r, `梦见了${label}，想去看看`);
    return { ok: true, msg: `${r.name}${asleep ? '在睡梦里' : '打了个盹，'}梦见了${label}` };
  }
  // 施工牌「托个梦」：挑一位和这栋房子最相关的居民（在这儿干过活的、正给它找材料的、要住进去的同类、离得近的、勤快的），梦见缺的材料在哪
  siteDream(id) {
    const lot = this.lotById(id); const p = this.projects.find(q => q.id === id && q.stage === 'renovate');
    if (!lot || !p) return { ok: false, msg: '这里没在施工' };
    const miss = this.siteMissing(lot); if (!miss.length) return { ok: false, msg: '材料都齐了，大家正在干活' };
    if (this.heart < DREAM_COST) return { ok: false, msg: `心意不够（要 ${DREAM_COST} 点），收下窗台上的回礼就有了` };
    const cand = this.res.filter(r => !r.away && r.job !== 'trip' && !r.haul && !(r.dream && r.dream.status === 'pending'));
    if (!cand.length) return { ok: false, msg: '大家都在忙，一会儿再试' };
    const sc = (r) => (r.builtOn === lot.id ? -100 : 0) + (r.fetchP === p.id ? -50 : 0) + (lot.usp && r.sp === lot.usp ? -20 : 0) + (this.has(r, 'diligent') ? -8 : 0) + Math.hypot(r.x - lot.x, r.z - lot.z) * 0.4;
    const r = cand.sort((a, b) => sc(a) - sc(b))[0]; const m = miss[0];
    const label = `${lot.name}缺的${miss.map(k => MAT_NAME[k]).join('、')}`;
    this.heart -= DREAM_COST;
    const rec = { id: this.dreamId++, rid: r.id, name: r.name, type: 'mat', target: lot.id, mat: m, label, t0: this.t, day: this.day(), hm: hm(this.dayT()), status: 'pending', note: '' };
    r.dream = rec; this.dreams.unshift(rec); if (this.dreams.length > 12) this.dreams.length = 12; r.emote = 3; this.remember(r, `梦见了${label}`);
    const asleep = r.act === ACT.INSIDE || r.act === ACT.SLEEP;
    if (LOW_JOBS.has(r.job) || !r.steps.length || r.job === 'build') this.interrupt(r, `梦见了${label}，想去找`);
    return { ok: true, rid: r.id, msg: `${r.name}${asleep ? '在睡梦里' : '打了个盹，'}梦见了${label}在哪儿` };
  }
  doDream(r) {
    const d = r.dream;
    if (d.type === 'mat') { // 施工牌上托的梦：去给停工的房子找缺的材料
      const lot = this.lotById(d.target); const p = this.projects.find(q => q.id === d.target && q.stage === 'renovate');
      if (!lot || !p || !this.siteMissing(lot).length) { this.dreamEnd(r, 'blocked', '醒来发现材料已经凑齐了'); return false; }
      this.fetchMat(r, p); this.dreamEnd(r, 'done', `醒来就去给${lot.name}找${MAT_NAME[d.mat] || '材料'}了`); return true;
    }
    if (d.type === 'obj') {
      const l = this.lotById(d.target); if (!l) { this.dreamEnd(r, 'blocked', '梦里的东西找不到了'); return false; }
      if (l.stage === 'far') { this.explore(r, l, true); return true; }
      const p = this.projects.find(p => p.id === l.id);
      if (p && (p.stage === 'gather' || p.stage === 'haul') && p.team.length < p.need) { this.dreamEnd(r, 'done', '跟着梦里的指引去帮忙拖'); this.joinHaul(r, p); return true; }
      this.dreamEnd(r, 'blocked', p && (p.stage === 'gather' || p.stage === 'haul') ? '拖的人已经够了' : `${OBJ_NAME[l.kind]}已经拖回镇上了`); return false;
    }
    const s = this.rsc[d.target]; if (s.stock < 1) { this.dreamEnd(r, 'blocked', `${s.name}已经被采光了`); return false; }
    this.gather(r, false, null, d.target); r.doing = `梦见了${s.name}，醒来就去了`; return true;
  }
  dreamEnd(r, status, note) {
    const d = r.dream; if (!d || d.status !== 'pending') return; d.status = status; d.note = note; d.end = this.t; r.dream = null;
    if (status === 'done') { this.stats.dreamDone++; r.mood = Math.min(100, r.mood + 6); this.addCard('dream', `托梦应验：${r.name}`, `你和 Lenia 悄悄托梦给${r.name}，梦里是${d.label}。醒来后，${r.name}${note}。`, [r], [r.x, r.z]); }
    else if (status === 'blocked') this.stats.dreamBlocked++; else this.stats.dreamExpired++;
  }
  // ---------------------------------------------------------------- 离开期间的礼物（按离开时长生成，不补算模拟）
  makeGift(now) {
    const away = now - (this.savedAt || now); this.savedAt = Math.max(this.savedAt || 0, now); this.wall = Math.max(this.wall || 0, now); // 时钟回拨：不给礼物；远行按真实时间照样走
    if (this.gift && !this.gift.seen) return; if (away < 10 * 60 * 1000) return;
    const hours = Math.min(48, away / 3.6e6); const items = {};
    const n = clamp(Math.round(2 + hours * 0.45), 2, 10);
    for (let i = 0; i < n; i++) { const m = this.rng() < 0.6 ? this.pick(MAT_NATURAL) : this.pick(MAT_TRINKET); items[m] = (items[m] || 0) + 1; this.mats[m] = Math.min(this.matCap(), (this.mats[m] || 0) + 1); }
    const k = hours < 2 ? 2 : hours < 8 ? 3 : 4; const stories = []; const usedT = new Set(), usedR = new Set();
    const pairs = []; for (const a of this.res) for (const id of a.friends) if (a.id < id && this.rById(id)) pairs.push([a, this.rById(id)]);
    const shops = this.lots.filter(l => l.use === 'shop' && l.done && this.rById(l.owner));
    for (let g = 0; g < 80 && stories.length < k; g++) {
      const ti = Math.floor(this.rng() * AWAY.length); if (usedT.has(ti)) continue; const T = AWAY[ti]; let text = null, who = [];
      const fresh = (list) => list.filter(r => r && !r.away && !usedR.has(r.id));
      if (T.need === 'friends') { const ps = pairs.filter(([a, b]) => !a.away && !b.away && !usedR.has(a.id) && !usedR.has(b.id)); if (!ps.length) continue; const [a, b] = this.pick(ps); who = [a, b]; text = T.t(a.name, b.name); }
      else if (T.need === 'shop') { if (!shops.length) continue; const l = this.pick(shops); const o = this.rById(l.owner); const gs = fresh(this.res.filter(r => r !== o)); if (!gs.length) continue; const gst = this.pick(gs); who = [o, gst]; text = T.t(o.name, l.name, gst.name); }
      else if (T.need.startsWith('trait:')) { const c = fresh(this.res.filter(r => r.traits.includes(T.need.slice(6)))); if (!c.length) continue; const a = this.pick(c); who = [a]; text = T.t(a.name, MAT_NAME[this.pick(MAT_TRINKET)]); }
      else if (T.need.startsWith('sp:')) { const c = fresh(this.res.filter(r => r.sp === T.need.slice(3))); if (!c.length) continue; const a = this.pick(c); who = [a]; text = T.t(a.name); }
      else if (T.need === 'house') { const c = fresh(this.res.filter(r => { const h = this.lotById(r.home); return h && h.done; })); if (!c.length) continue; const a = this.pick(c); who = [a]; text = T.t(a.name, this.lotById(a.home).name); }
      else { const c = fresh(this.res); if (!c.length) continue; const a = this.pick(c); who = [a]; text = T.t(a.name); }
      usedT.add(ti); who.forEach(r => usedR.add(r.id)); stories.push({ text, who: who.map(r => r.id), names: who.map(r => r.name) });
      this.addCard('away', '你不在的时候', text, who, [who[0].x, who[0].z]);
    }
    // 可能一个心愿有了进展
    let wish = null;
    const fw = this.res.filter(r => r.wish && r.wish.type === 'friend' && this.rById(r.wish.target));
    const fb = this.res.filter(r => r.wish && (r.wish.type === 'fish' || r.wish.type === 'berry'));
    if (fw.length && this.rng() < 0.8) { const r = this.pick(fw); const o = this.rById(r.wish.target); const before = this.isFriend(r, o); r.lastMeet[o.id] = o.lastMeet[r.id] = -1e9; this.bond(r, o, 10); this.meet(r, o); wish = (this.isFriend(r, o) && !before) ? `${r.name}和${o.name}又一起聊了好几回，终于成了好朋友——${r.name}的心愿实现了。` : `${r.name}和${o.name}又一起聊了几回，离成为好朋友更近了一步。`; }
    else if (fb.length && this.rng() < 0.6) { const r = this.pick(fb); const t = r.wish.type; wish = `${r.name}趁你不在的时候去${t === 'fish' ? '溪边钓了鱼' : '莓果丛摘了一大捧果子'}，心愿实现了。`; this.wishHit(r, t); }
    for (const r of this.res) { r.full = Math.max(r.full, 55); r.energy = Math.max(r.energy, 60); }
    this.heart += Math.min(2, Math.floor(hours * 0.5)); // 离开的时间越长，回来时小动物多塞给你一点谢意
    // 窗台多了几份回礼
    const ng = clamp(Math.round(1 + hours * 0.3), 1, 4); const sillGifts = [];
    for (let i = 0; i < ng && this.sill.length < MAX_SILL; i++) { const r = this.pick(this.res); const g = this.addGift(r, this.pick(['pebble', 'leafpack', 'note', 'acorn', 'feather', 'wreath']), { kind: 'daily' }); if (g) sillGifts.push({ name: g.name, type: g.type }); }
    for (const f of this.flowers) { f.g = Math.min(1, f.g + Math.min(0.6, hours * 0.05)); f.w = Math.max(f.w, 0.3); }
    const W = this.worldInfo(); const season = `现在是${W.sname}天第 ${W.sday} 天，外面${W.wx === 'sun' ? '出着太阳' : W.wx === 'cloud' ? '有点阴' : W.wx === 'rain' ? '下着雨' : '飘着雪'}${W.snowmen ? `，镇上立着 ${W.snowmen} 个雪人` : ''}${W.puddles ? `，地上还有 ${W.puddles} 汪水洼` : ''}。`;
    this.gift = { id: Math.floor(now / 1000), hours: Math.round(hours * 10) / 10, items, stories, wish, sill: sillGifts, trip: this.tripGiftLine(), season, seen: false };
  }
  // ---------------------------------------------------------------- main step
  step(dt) {
    this.t += dt; this.wall += dt * 1000; // wall：真实时间（毫秒），远行按它算；离线时由读档补上
    for (const r of this.res) this.stepRes(r, dt);
    for (const p of this.projects) this.stepProject(p, dt);
    if (this.projects.some(p => p.stage === 'done')) this.projects = this.projects.filter(p => p.stage !== 'done');
    this._sec = (this._sec || 0) + dt;
    if (this._sec >= 1) {
      this._sec -= 1; this.social(); this.bakeTick(1);
      for (const s of this.rsc) s.stock = Math.min(s.max, s.stock + s.regen);
      if (this.t >= this.nextFar) {
        // 远方的东西越来越稀：第 k 件之后隔 0.35+0.13k 天（最多约 1.8 天）；满员后再慢一点
        const far = this.lots.filter(l => l.stage === 'far').length, busy = this.lots.filter(l => !this.natural(l) && l.stage !== 'done').length, full = this.townFull();
        this.nextFar = this.t + DAY * Math.min(3.5, 0.9 + 0.3 * this.farN) * this.rnd(0.85, 1.15) * (full ? 1.15 : 1); // 远方拾得物降为次要来源
        if (far < 1 && busy < 3 && this.lots.length < 22 && this.spawnFar(this.chooseFarKind())) this.farN++;
      }
      this.arrivals(); this.wishTick(); this.stepLenia(); this.stepWorld();
      for (const r of this.res) if (r.emoT > 0) { r.emoT -= 1; if (r.emoT <= 0) { r.emo = 0; r.emoWhy = null; } }
      for (const r of this.res) if (!r.haul && r.home >= 0 && !r.steps.length) this.moveHome(r);
      for (const l of this.lots) if (this.natural(l) && l.done && l.use === 'home' && !l.beds.length) { l.emptyT = (l.emptyT || 0) + 1; if (l.emptyT > DAY * 0.6 && this.lots.filter(o => o.use === 'home' && !this.natural(o)).length >= 4) { this.convertHut(l); break; } } else l.emptyT = 0;
      if (this.t >= this.tierT) { this.tierT = this.t + DAY * 0.05; this.tierTick(); }
      for (const r of this.res) if (r.dream && r.dream.status === 'pending' && this.t - r.dream.t0 > DAY) this.dreamEnd(r, 'expired', '一直没顾上去');
    }
  }
  // ---------------------------------------------------------------- outputs
  snapshot() {
    const n = this.res.length; const buf = new Float32Array(n * SNAP_STRIDE);
    this.res.forEach((r, i) => {
      const o = i * SNAP_STRIDE; let f = 0;
      if (r.box || (r.carry && r.job === 'gather' && r.act === ACT.WALK)) f |= FLAG.CARRY;
      if (r.act === ACT.INSIDE) f |= FLAG.HIDDEN;
      if (r.act === ACT.EAT || (r.mood > 80 && r.act === ACT.IDLE)) f |= FLAG.HAPPY;
      if (r.haul) { const p = this.projects.find(p => p.id === r.haul); if (p && p.moving) f |= FLAG.PULL; }
      if (r.emote > 0) f |= FLAG.EMOTE;
      buf[o] = r.id; buf[o + 1] = SPECIES.indexOf(r.sp); buf[o + 2] = r.x; buf[o + 3] = r.z; buf[o + 4] = r.yaw; const hold = r.carryF && (r.act === ACT.EAT || (r.act === ACT.WALK && r.job === 'eat')) ? FOOD_IDS.indexOf(r.carryF) + 1 : 0; // 手里拿着的食物（画面上显示小模型）
      const bk = r.job === 'tend' && r.act === ACT.IDLE && r.si >= 1 && this.lots.some(l => l.owner === r.id && l.cook > 0); // 店主正在烤面包：画面上是干活的姿势
      buf[o + 5] = r.chat ? ACT.CHAT : bk ? ACT.BUILD : r.act; buf[o + 6] = f + (r.chat ? 16 * (r.chat.side + 1) : 0) + (hold << 8);
    });
    const proj = this.projects.map(p => { const lot = this.lotById(p.lot); const o = { id: p.id, kind: p.kind, stage: p.stage, x: p.x, z: p.z, yaw: p.yaw, moving: p.moving, team: p.team.slice(), need: p.need, prog: lot.prog, haulProg: p.cum ? p.s / p.cum[p.cum.length - 1] : 1, lot: p.lot };
      if (p.stage === 'renovate') { o.paid = lot.paid; o.miss = this.siteMissing(lot); o.pile = this.sitePile(lot); } return o; });
    const emo = []; for (const r of this.res) if (r.emo) emo.push(r.id, r.emo);
    return { buf, proj, emo, wx: this.worldSnap(), t: this.t, dayT: this.dayT(), day: this.day(), store: storeSum(this.store), stores: FOOD_IDS.map(k => this.store[k]), bake: this.lots.filter(l => l.cook > 0).map(l => l.id), pop: n, houses: this.lots.filter(l => l.done).length, ver: this.ver, homeless: this.homeless().length, stock: this.rsc.map(s => s.stock / (s.max > 1e8 ? 1 : s.max)) };
  }
  rkind(l) { return l.use === 'shop' && ['tea', 'fish', 'cup', 'honey'].includes(l.kind) ? l.kind + 'S' : l.kind; }
  structure() {
    return { ver: this.ver, lots: this.lots.map(l => ({ id: l.id, kind: l.kind, rk: this.rkind(l), tier: l.tier || 0, up: !!l.upTo, x: l.x, z: l.z, rot: l.rot, r: l.r, done: l.done, stage: l.stage, name: l.name, use: l.use, door: l.door, item: l.item || null, combo: l.combo || null, fac: l.fac || null, shop: l.shop || null, damp: l.damp ? Math.round(l.damp * 4) / 4 : 0, old: l.old ? 1 : 0, cover: l.cover || 0, carry: l.carry || 0, pond: l.pond || 0, node: l.node ?? -1, moving: l.moving ? 1 : 0 })), ...this.worldStruct(), flowers: this.flowers.map(f => [f.id, f.x, f.z, f.k, Math.floor(f.g * 3)]), bridges: this.bridges, nodes: this.nodes.map(n => [n.x, n.z, n.k]), edges: this.edges.map(e => e.slice()) };
  }
  info() { // 给界面用的“可读”信息，每秒一次
    const nm = (id) => this.rById(id)?.name;
    return {
      day: this.day(), hm: hm(this.dayT()), dayT: this.dayT(), dreamCost: DREAM_COST, mats: { ...this.mats }, store: Math.floor(storeSum(this.store)), stores: Object.fromEntries(FOOD_IDS.map(k => [k, Math.floor(this.store[k] * 10) / 10])), foodLog: this.foodLog.slice(0, 8), foodStats: { ...(this.stats.eatBy || {}), swaps: this.stats.swaps || 0, favEats: this.stats.favEats || 0, eats: this.stats.eats || 0 }, pop: this.res.length, popCap: POP_CAP,
      res: this.res.map(r => {
        const h = this.lotById(r.home); const own = this.lotById(r.owner);
        const rel = Object.entries(r.aff).map(([id, v]) => ({ id: +id, name: nm(+id), v: Math.round(v) })).filter(x => x.name).sort((a, b) => b.v - a.v);
        return { id: r.id, name: r.name, sp: r.sp, traits: r.traits, full: Math.round(r.full), energy: Math.round(r.energy), mood: Math.round(r.mood), home: h ? h.name : '还没有家', homeKind: h ? h.kind : null, homeCombo: h ? h.combo || null : null, owner: own ? own.name : null,
          friends: rel.filter(x => r.friends.includes(x.id)), acq: rel.filter(x => !r.friends.includes(x.id)).slice(0, 2), wish: r.wish ? { type: r.wish.type, text: r.wish.text, day: r.wish.day } : null, doing: r.doing, recent: r.recent.slice(),
          dream: r.dream ? r.dream.label : null, hauled: r.hauled, built: r.built, hidden: r.act === ACT.INSIDE, bub: r.emo ? { code: r.emo, why: r.emoWhy || null } : null, chatP: r.chat ? nm(r.chat.p) : null, away: !!r.away, trip: r.job === 'trip', x: r.x, z: r.z, job: r.job, act: r.act, in: this.inLot(r), hl: r.home, ate: r.ate.map(a => ({ ...a })), fav: r.fav };
      }),
      far: this.lots.filter(l => l.stage === 'far').map(l => ({ id: l.id, kind: l.kind, name: OBJ_NAME[l.kind], x: l.x, z: l.z })),
      projs: this.projects.filter(p => p.stage !== 'done').map(p => { const l = this.lotById(p.lot); return { id: p.id, kind: p.kind, stage: p.stage, team: p.team.length, need: p.need, prog: l.prog, paid: l.paid, name: l.use ? l.name : OBJ_NAME[p.kind], use: l.use, missing: p.stage === 'renovate' && l.prog >= l.paid / 3 - 1e-6 ? this.stageMissing(l) : [], x: p.x, z: p.z, lot: p.lot, item: l.item || null, who: this.siteWho(p, l), eta: this.siteEta(p, l), recall: this.recallable ? this.recallable(l).ok : false, lx: l.x, lz: l.z, hp: p.cum && p.cum[p.cum.length - 1] > 0 ? p.s / p.cum[p.cum.length - 1] : 0 }; }),
      lots: this.lots.filter(l => l.stage !== 'far' && !l.upTo).map(l => ({ moving: l.moving ? 1 : 0, carry: l.carry || 0, id: l.id, name: l.name, kind: l.kind, use: l.use, tier: l.tier || 0, shop: l.shop, done: l.done, owner: nm(l.owner), open: l.use === 'shop' && l.done && this.shopOpen(l), bread: l.bread || 0, baking: l.cook > 0 ? 1 : 0, baked: l.baked || 0, sold: l.sold || 0, beds: l.beds.map(nm), x: l.x, z: l.z, item: l.item || null, combo: l.combo || null, fac: l.fac || null, stage: l.stage, by: l.by || [], ev: l.ev || [], pond: l.pond || 0 })),
      rsc: this.rsc.filter(s => s.type !== 'wood').map(s => ({ id: s.id, name: s.name, type: s.type, stock: Math.floor(s.stock), max: s.max, x: s.x, z: s.z })),
      gateLog: this.gateLog.slice(), cat: this.cat, lenia: this.leniaInfo(), world: this.worldInfo(), trip: this.tripInfo(), dreams: this.dreams.map(d => ({ ...d })), cardVer: this.cardVer, stats: { ...this.stats }, gift: this.gift && !this.gift.seen ? this.gift : null,
    };
  }
  // 此刻在哪栋建筑里（进屋画面用）：在家里（睡觉/打盹/躲雨/吃饭）、在店里看店或坐着吃喝、在图书角这类设施里玩
  inLot(r) {
    if (r.away) return -1;
    if (r.act === ACT.INSIDE) return r.home;
    if (r.act === ACT.WALK || r.chat) return -1;
    if (r.job === 'tend' && r.owner > 0) return r.owner;
    if (r.job === 'shop' && r.seat && r.act === ACT.EAT) return r.seat[0];
    const st = r.steps[r.si]; if (st && st.fn === 'facFun' && st.lot != null) return st.lot;
    return -1;
  }
  // 测试/截图用：让某栋房子的住户马上进屋吃饭或睡觉；让某家店来客人（不是正常玩法）
  dbgInside(lotId, what = 'eat', n = 9) {
    const l = this.lotById(lotId); if (!l || !l.door) return 0; let k = 0;
    if (!this.res.some(r => r.home === lotId) && l.beds) for (const r of [...this.res].sort((a, b) => (b.sp === l.usp) - (a.sp === l.usp)).slice(0, Math.min(n, 3))) { const o = this.lotById(r.home); if (o && o.beds) o.beds = o.beds.filter(id => id !== r.id); l.beds.push(r.id); r.home = lotId; } // 空房子：先请几位住进来
    for (const r of this.res) { if (r.home !== lotId || r.away || r.haul || k >= n) continue; this.finishTask(r); r.x = l.door[0]; r.z = l.door[1]; k++;
      if (what === 'eat') { r.carry = 1; r.carryF = chooseFood(r.fav, this.store) || 'bread'; this.setSteps(r, [this.doo(ACT.INSIDE, 90, 'eat')], 'eat', `把吃的带回${l.name}，坐在桌边慢慢吃`); }
      else this.setSteps(r, [this.doo(ACT.INSIDE, 120, 'nap')], what === 'sleep' ? 'sleep' : 'nap', `回${l.name}打个盹`); }
    return k;
  }
  // 测试/截图用（不是正常玩法）：store 设粮筐库存；hungry 让某些居民饿了；eat 让某居民在 (x,z) 吃指定食物；bake 让一家店马上开烤
  dbgFood(o = {}) {
    const out = {};
    if (o.store) Object.assign(this.store, o.store);
    for (const id of o.hungry || []) { const r = this.rById(id); if (r) { r.full = Math.min(r.full, 24); r.hungryCD = 0; r.emo = 0; } }
    for (const e of o.eat || []) { const r = this.rById(e.id); if (!r) continue; this.finishTask(r); r.x = e.x; r.z = e.z; r.carry = 1; r.carryF = e.food; r.full = Math.min(r.full, 40); this.setSteps(r, [this.doo(ACT.EAT, e.dur || 60, 'eat')], 'eat', `吃${FOODS[e.food].name}`); if (e.fav) r.fav = e.food; if (e.face) r.yaw = e.face; }
    for (const e of o.love || []) { const r = this.rById(e.id); if (r) { r.fav = e.food; this.ate(r, e.food, '粮筐边'); } }
    if (o.bake) {
      let l = this.lots.find(x => x.use === 'shop' && FOODISH.has(x.shop) && x.done) || this.lots.find(x => x.done && x.use === 'home' && x.node >= 0);
      if (l) { const w = this.res.find(r => !r.away && !r.haul) ; l.use = 'shop'; l.shop = 'bakery'; l.owner = w.id; l.done = true; l.stage = 'done'; this.ver++; this.t = Math.floor(this.t / DAY) * DAY + DAY * 0.45;
        this.store.veg = Math.max(this.store.veg, 12); this.store.berry = Math.max(this.store.berry, 6); l.bread = o.bread ?? 2; l.cook = 0;
        this.finishTask(w); this.tend(w, l); const st = w.steps[w.si]; if (st && st.k === 'go') { w.x = st.x; w.z = st.z; w.si++; this.beginStep(w); } out.lot = l.id; out.owner = w.id; out.x = l.x; out.z = l.z; }
    }
    return out;
  }
  dbgShop(lotId, n = 3) {
    const l = this.lotById(lotId); if (!l) return 0; let k = 0;
    if (l.use === 'shop' && l.owner > 0) { const o = this.rById(l.owner); if (o && !o.away) { this.finishTask(o); this.tend(o, l); const st = o.steps[o.si]; if (st && st.k === 'go') { o.x = st.x; o.z = st.z; o.si++; this.beginStep(o); } } }
    for (const r of this.res) { if (k >= n || r.away || r.haul || r.id === l.owner) continue;
      if (l.use === 'shop') { if (this.freeSeat(l) < 0) break; this.finishTask(r); this.visitShop(r, l); }
      else { this.finishTask(r); this.setSteps(r, [this.doo(ACT.IDLE, 60, 'facFun', { lot: l.id, face: [l.x, l.z] })], 'wander', `在${l.name}里玩`); }
      const st = r.steps[r.si]; if (st && st.k === 'go') { r.x = st.x; r.z = st.z; r.si++; this.beginStep(r); } k++; }
    return k;
  }
  serialize(now = 0) {
    const R2 = (v) => Math.round(v * 100) / 100; if (now) this.savedAt = now;
    return JSON.stringify({ v: SAVE_VERSION, seed: this.seed, rs: this.rs, t: R2(this.t), nextId: this.nextId, nextLot: this.nextLot, store: FOOD_IDS.map(k => R2(this.store[k])), fl: this.foodLog, na: R2(this.nextArrival), nf: R2(this.nextFar), nw: R2(this.nextWish),
      mats: this.mats, gl: this.gateLog, savedAt: this.savedAt, farN: this.farN, tierT: R2(this.tierT), cardId: this.cardId, dreamId: this.dreamId, cards: this.cards, album: this.album, cat: this.cat, dreams: this.dreams, gift: this.gift, stats: this.stats,
      res: this.res.map(r => ({ id: r.id, name: r.name, sp: r.sp, tr: r.traits, x: R2(r.x), z: R2(r.z), f: Math.round(r.full), e: Math.round(r.energy), m: Math.round(r.mood), h: r.home, aff: Object.fromEntries(Object.entries(r.aff).map(([k, v]) => [k, Math.round(v)])), w: r.wish, wcd: R2(r.wishCD), d: r.dream ? r.dream.id : 0, ha: r.hauled, bu: r.built, ow: r.owner, rc: r.recent, doing: r.doing, ls: R2(r.lastShop), mt: r.meets, fr: r.friends, la: R2(r.late), aw: r.away || 0, th: r.tripHome || 0, at: r.ate, ff: r.fav })),
      lots: this.lots.map(l => ({ id: l.id, k: l.kind, u: l.use, usp: l.usp, sh: l.shop, n: l.name, x: R2(l.x), z: R2(l.z), rot: R2(l.rot), p: Math.round(l.prog * 1e4) / 1e4, pd: l.paid, d: l.done ? 1 : 0, b: l.beds, node: l.node, st: l.stage, fx: R2(l.fx), fz: R2(l.fz), ow: l.owner, fg: l.firstGuest || 0, ti: l.tier || 0, da: R2(l.doneAt || 0), up: l.upTo || 0, fs: l.forceShop || null, it: l.item || null, fc: l.fac || null, cb: l.combo || null, be: l.bridgeEnds || null, lr: l.use === 'bridge' ? l.r : 0, lt: l.landT ? R2(l.landT) : 0, wy: l.why || null, dp: l.damp ? R2(l.damp) : 0, od: l.old ? 1 : 0, cv: l.cover || 0, pn: l.pond ? R2(l.pond) : 0, by: l.by || null, ev: l.ev || null, mv: l.moving ? R2(l.moving) : 0, br: l.bread ? R2(l.bread) : 0 })),
      nodes: this.nodes.map(n => [R2(n.x), R2(n.z), n.k]), edges: this.edges, rsc: this.rsc.map(s => R2(s.stock)),
      proj: this.projects.filter(p => p.stage !== 'done').map(p => ({ id: p.id, st: p.stage === 'haul' ? 'gather' : p.stage, s: R2(p.s), path: p.path.map(q => [R2(q[0]), R2(q[1])]), fi: p.finder || 0 })), le: this.leniaSave(), wd: this.worldSave() });
  }
  load(S) {
    Object.assign(this, { seed: S.seed, rs: S.rs, t: S.t, nextId: S.nextId, nextLot: S.nextLot, store: Array.isArray(S.store) ? Object.fromEntries(FOOD_IDS.map((k, i) => [k, +S.store[i] || 0])) : splitOldStore(S.store), foodLog: S.fl || [], nextArrival: S.na, nextFar: S.nf, nextWish: S.nw, mats: S.mats, gateLog: S.gl || [], savedAt: S.savedAt || 0, cardId: S.cardId, dreamId: S.dreamId,
      cards: S.cards || [], album: S.album || [], cat: S.cat || {}, dreams: S.dreams || [], gift: S.gift || null, stats: S.stats, ver: 1, cardVer: 1, graphDirty: true, farN: S.farN || 1, tierT: S.tierT || 0 });
    for (const k of MATS) this.mats[k] = Math.max(0, Math.floor(this.mats[k] || 0));
    this.nodes = S.nodes.map(n => ({ x: n[0], z: n[1], k: n[2] })); this.edges = S.edges;
    this.rsc = RESOURCES.map((r, i) => ({ ...r, id: i, stock: S.rsc[i] ?? r.max }));
    this.lots = S.lots.map(a => { if (a.k === 'boot' && (a.it === 'boot' || a.cb === 'bootpost')) a.k = 'rboot'; /* 旧存档：Lenia 的雨靴改用红雨靴造型 */ const K = this.K[a.k]; const c = Math.cos(a.rot), s = Math.sin(a.rot); const far = a.st === 'far';
      return { id: a.id, kind: a.k, use: a.u, usp: a.usp, shop: a.sh, name: a.n, x: a.x, z: a.z, rot: a.rot, r: K.r, prog: a.p, paid: a.pd, done: !!a.d, beds: a.b, node: a.node, stage: a.st, fx: a.fx, fz: a.fz, owner: a.ow, firstGuest: a.fg, seats: [], tier: a.ti || 0, doneAt: a.da || 0, upTo: a.up || 0, forceShop: a.fs || null, item: a.it || null, fac: a.fc || null, combo: a.cb || null, bridgeEnds: a.be || null, landT: a.lt || 0, why: a.wy || null, damp: a.dp || 0, old: !!a.od, cover: a.cv || 0, pond: a.pn || 0, by: a.by || null, ev: a.ev || null, ...(a.mv ? { moving: a.mv } : {}), bread: a.br || 0, cook: 0, look: a.st === 'landed' ? { seen: [], t2: 0, sum: 0 } : null,
        door: far ? null : a.up ? [a.x, a.z] : [a.x + K.door[0] * c + K.door[1] * s, a.z - K.door[0] * s + K.door[1] * c] }; });
    this.res = []; const nid = this.nextId;
    for (const a of S.res) { const r = this.spawn(a.sp, a.x, a.z); Object.assign(r, { id: a.id, name: a.name, traits: a.tr, full: a.f, energy: a.e, mood: a.m, home: a.h, aff: {}, wish: a.w, wishCD: a.wcd, hauled: a.ha, built: a.bu, owner: a.ow, recent: a.rc || [], doing: a.doing || '', lastShop: a.ls ?? -1e9, meets: a.mt || {}, friends: a.fr || [], late: a.la ?? 0, away: a.aw || 0, tripHome: a.th || 0, ate: a.at || [], fav: a.ff || FAV_FOOD[a.sp] });
      for (const k in a.aff || {}) r.aff[k] = +a.aff[k]; const d = this.dreams.find(d => d.id === a.d && d.status === 'pending'); r.dream = d || null; }
    for (const d of this.dreams) if (d.status === 'pending' && !this.res.some(r => r.dream === d)) d.status = 'expired';
    this.nextId = nid;
    this.notices = []; this.leniaLoad(S.le); this.worldLoad(S.wd, this._now);
    if ((S.v || 0) < 7 && S.power > 0) this.heart += Math.floor(S.power); // 旧档：梦的力气并进心意，不多不少
    for (const l of this.lots) if (l.use === 'bridge') l.r = 2.2;
    this.projects = (S.proj || []).map(a => { const lot = this.lotById(a.id); if (!lot) return null; const p = this.makeProject(lot, a.path); p.stage = a.st; p.s = a.s; p.finder = a.fi; const q = this.pathAt(p, p.s); p.x = q[0]; p.z = q[1]; p.yaw = q[2]; if (p.stage === 'renovate') { p.x = lot.x; p.z = lot.z; p.yaw = lot.rot; p.cum = [0, 0]; } return p; }).filter(Boolean);
  }
  // ---------------------------------------------------------------- 设施：居民去用一下（每种都有实实在在的作用，见 FAC.fx）
  facFun(r, l) {
    let mood = 7, verb = FAC[l.fac].verb; const pals = this.res.filter(o => o !== r && !o.away && o.steps[o.si] && o.steps[o.si].fn === 'facFun' && o.steps[o.si].lot === l.id);
    if (l.fac === 'table') { const tk = r.full < 80 ? chooseFood(r.fav, this.store, 0.6) : null; if (tk) { this.store[tk] -= 0.6; this.ate(r, tk, l.name, 0.3, true); verb = pals.length ? `和大家围着吃了点${FOODS[tk].name}` : `吃了点${FOODS[tk].name}`; } mood += pals.length ? 4 : 1; for (const o of pals) this.bond(r, o, 2); }
    else if (l.fac === 'play') { if (r.sp === 'dog' || this.has(r, 'curious')) mood += 4; for (const o of pals) this.bond(r, o, 1); }
    else if (l.fac === 'stage') { const ev = this.dayT() > 0.68; mood += ev ? 5 : 1; if (ev) verb = '傍晚跳了一支舞'; for (const o of pals) this.bond(r, o, 1); }
    else if (l.fac === 'pond' && (r.sp === 'duck' || r.sp === 'chick')) mood += 5;
    else if (l.fac === 'school') { mood += 2; for (const o of pals) this.bond(r, o, 3); }
    else if (l.fac === 'well') { r.full = Math.min(100, r.full + 3); if (this.flowers.length && this.waterAt(l.x, l.z, 7).ok) verb = '打了一桶水，顺手浇了浇附近的花'; }
    else if (l.fac === 'garden') { if (this.flowers.length && this.waterAt(l.x, l.z, 6).ok) verb = '闻了闻花，还给它们浇了点水'; }
    else if (l.fac === 'lamp') { if (isNight(this.dayT())) { mood += 4; verb = '借着亮亮的灯光坐了一会儿'; } }
    else if (l.fac === 'boat') { mood += 3; }
    else if (l.fac === 'post' && this.rng() < 0.4) { const g = this.addGift(r, 'note', { kind: 'daily' }); if (g) verb = '寄了一张小纸条，纸条落在了你的窗台上'; }
    r.mood = Math.min(100, r.mood + mood); this.remember(r, `在${l.name}${verb}`); this.emo(r, 3, 3, { k: 'fac', a: l.name, b: verb });
    this.lotEv(l, `${r.name}${pals.length && l.fac !== 'table' ? `和${pals[0].name}` : ''}${verb}`);
  }
  gateEv(i, k, text) { if (i < 0) return; this.gateLog.push({ g: i, k, day: this.day(), hm: hm(this.dayT()), t: text }); if (this.gateLog.length > 40) this.gateLog.shift(); }
  lotEv(l, text) { (l.ev = l.ev || []).push({ d: this.day(), hm: hm(this.dayT()), t: text }); if (l.ev.length > 3) l.ev.shift(); }
  // ---------------------------------------------------------------- 旧存档修复：互相插进去的东西，把后建的那个（或附属小件）挪到最近的合法空地，路网接上，留一张小故事卡
  fixOverlaps(v = SAVE_VERSION) {
    const moved = []; const small = (l) => !['home', 'shop', 'shared', 'shed'].includes(l.use) || !!ITEMS[l.kind];
    for (let guard = 0; guard < 40; guard++) {
      const pairs = overlapPairs(this.lots, true); if (!pairs.length) break;
      const { a, b } = pairs[0]; const mover = small(a) !== small(b) ? (small(a) ? a : b) : (a.id > b.id ? a : b); const other = mover === a ? b : a;
      if (moved.filter(m => m.l === mover).length > 2) break;
      const house = ['home', 'shop', 'shared', 'shed'].includes(mover.use) && mover.node >= 0 && !mover.upTo;
      const ox = mover.x, oz = mover.z; let ok = false;
      if (house) { // 房子：沿路重新找块地，门口小径改接过去（旧的那段小径拆掉）
        const oldNode = mover.node; const keep = { x: mover.x, z: mover.z, rot: mover.rot, door: mover.door };
        this.edges = this.edges.filter(e => !(e[2] === 2 && (e[0] === oldNode || e[1] === oldNode))); mover.node = -1;
        if (this.placeSite(mover, [ox, oz])) ok = true; else { Object.assign(mover, keep); mover.node = oldNode; }
      }
      if (!ok) { const sp = this.nearFit(mover, ox, oz, { maxD: 24 }); if (sp) { Object.assign(mover, { x: sp.x, z: sp.z, fx: sp.x, fz: sp.z, rot: sp.rot }); if (mover.node < 0 || mover.node == null) { const c = Math.cos(sp.rot), s = Math.sin(sp.rot), dl = this.K[mover.kind].door; mover.door = [sp.x + dl[0] * c + dl[1] * s, sp.z - dl[0] * s + dl[1] * c]; } ok = true; } }
      if (!ok) break;
      for (const p of this.projects) if (p.lot === mover.id) { if (p.stage === 'renovate') { p.x = mover.x; p.z = mover.z; p.yaw = mover.rot; p.path = [[mover.x, mover.z], [mover.x, mover.z]]; p.cum = [0, 0]; } else { const path = [[p.x, p.z]]; for (const id of this.route(this.nearestNode(p.x, p.z), mover.node >= 0 ? mover.node : this.nearestNode(mover.x, mover.z))) { const q = this.nodes[id]; path.push([q.x, q.z]); } path.push([mover.x, mover.z]); const np = this.makeProject(mover, path); Object.assign(p, { path: np.path, cum: np.cum, s: 0 }); } }
      for (const r of this.res) if (r.home === mover.id && mover.door && r.act === ACT.INSIDE) { r.x = mover.door[0]; r.z = mover.door[1]; }
      moved.push({ l: mover, other, d: Math.hypot(mover.x - ox, mover.z - oz) }); this.ver++; this.graphDirty = true;
    }
    if (moved.length) {
      const m = moved[0]; const names = [...new Set(moved.map(o => o.l.name))].slice(0, 3).join('、');
      const who = this.res.filter(r => !r.away).slice(0, 3);
      this.addCard('change', '小镇挪了挪地方', `大家早上起来一看：${m.l.name}和${m.other.name}挤得太近，${m.l.name}都快插进${m.other.name}里去了。${who.map(r => r.name).join('、') || '大家'}喊着号子，把${names}往旁边推了推，又顺手把门前的小路接了过去。现在每家门口都宽宽敞敞的。`, who, [m.l.x, m.l.z]);
      this.log.push(`读档时挪开了 ${moved.length} 处挤在一起的东西（存档版本 ${v}）`);
    }
    this.fixedN = moved.length; return moved.length;
  }
  // ---------------------------------------------------------------- 性能测试用：直接摆满 n 栋完工的房子（不是正常玩法）
  stress(n = 40) {
    let guard = 0; this.maxR = 64;
    while (this.lots.filter(l => l.stage !== 'far').length < n && guard++ < 300) {
      const k = this.pick(OBJ_KINDS); const lot = this.newLot(k); this.lots.push(lot);
      if (!this.placeSite(lot)) { this.lots.pop(); this.extendRoad(); continue; }
      const u = this.pick(USES[k]); Object.assign(lot, { stage: 'done', done: true, prog: 1, paid: 3, use: u.use, name: u.name, usp: u.sp || null, shop: u.shop || null });
    }
    this.maxR = 0; this.ver++;
  }
  // ---------------------------------------------------------------- 测试/截图用：快进 n 秒（不跑渲染）
  advance(sec, dt = 0.2) { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) this.step(dt); }
}
installLenia(Sim);
installSeasons(Sim);
