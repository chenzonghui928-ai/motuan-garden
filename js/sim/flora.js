// 花园外圈的植物丛（模拟部分，挂到 Sim 原型上）：旧物落在植物上 → 小动物先去把植物清掉（像砍树）→ 清下来的变成小材料 → 空出一块平地；
// 缺木枝 / 干草时小动物也会主动去清一丛取材料（克制：一次一丛、每天有上限、外圈留够）；没被占用的空地按季节慢慢长回来。
// 布局来自 shared/flora.js（确定的）；这里只管每一丛的状态：ok 完好 / clearing 正在被清 / cleared 已清掉 / regrow 正在长回来（g 是长大的进度）。
import { DAY, TAU, isNight, MAT_NAME, ROAD_HALF, segDist } from '../shared/layout.js';
import { FLORA, floraLayout, ST, ST_NAME, floraHits } from '../shared/flora.js';
import { calendar } from '../shared/seasons.js';
import { footOf, ptObb } from '../shared/footprint.js';
import { ITEMS, streamSide, TOWN_SIDE } from '../shared/items.js';

const CHOP = 11, SLEEP = 6, INSIDE = 9;
const IDLE_JOBS = new Set(['', 'wander', 'plaza', 'visit', 'wait', 'gawk']);
export const REGROW_PER_DAY = { spring: 0.22, summer: 0.2, autumn: 0.1, winter: 0 }; // 一天长回多少（1 = 长满）：春夏几天、秋天十来天、冬天不长
export const REGROW_WAIT = 0.5;      // 清掉以后先光秃秃地空着多久（游戏日），才冒出小苗
export const MAT_DAY_CAP = 2;        // 小动物主动清植物取材料：每个游戏日最多这么多丛
export const KEEP_OK = 10;           // 外圈至少留这么多丛完好的（再少就不主动清了）
const bodyDist = (b, x, z) => (b.t === 'b' ? ptObb(x, z, b) : Math.hypot(x - b.x, z - b.z) - b.r);
const NUM = ['零', '一', '两', '三', '四', '五'];
export const numWord = (n) => NUM[n] || String(n);

export function installFlora(Sim) {
  const P = Sim.prototype;
  P.floraFresh = function () {
    this.flora = floraLayout().map(p => ({ ...p, st: 'ok', g: 0, prog: 0, need: 0, mode: '', at: 0, idle: 0, by: [] }));
    this.floraDay = { d: -1, n: 0 };
  };
  P.floraById = function (id) { return this.flora.find(p => p.id === id); };
  // 放置判定 / 清理要用的“还挡着路的”植物：[[id, kind, x, z, size], ...]（完好的和正在被清的）
  P.floraObstacles = function () { return this.flora.filter(p => p.st === 'ok' || p.st === 'clearing').map(p => [p.id, p.kind, p.x, p.z, p.size]); };
  P.floraStruct = function () { return this.flora.map(p => [p.id, p.kind, p.x, p.z, p.size, ST[p.st], p.yaw]); };
  // 给画面的快照：只发不是“完好”的 [id, 状态, 进度]（clearing = 清了多少，regrow = 长大了多少）
  P.floraSnap = function () { const out = []; for (const p of this.flora) if (p.st !== 'ok') out.push([p.id, ST[p.st], p.st === 'clearing' ? Math.min(1, p.prog / (p.need || 1)) : p.st === 'regrow' ? p.g : 0]); return out; };
  P.floraCounts = function () { const c = { ok: 0, clearing: 0, cleared: 0, regrow: 0 }; for (const p of this.flora) c[p.st]++; return c; };

  // ---------------------------------------------------------------- 存档
  P.floraSave = function () { const R2 = (v) => Math.round(v * 100) / 100; return { p: this.flora.map(p => [p.id, ST[p.st], R2(p.g), Math.round(p.prog * 10) / 10, R2(p.at)]), d: [this.floraDay.d, this.floraDay.n] }; };
  // 旧档（没有 fa）：植物全部完好。正在被清的读档后回到完好（进度保留）；被已有建筑压住的植物悄悄让出地方（不给材料）
  P.floraLoad = function (F) {
    this.floraFresh();
    if (F && Array.isArray(F.p)) for (const [id, st, g, prog, at] of F.p) { const p = this.floraById(id); if (!p) continue; p.st = ST_NAME[st] || 'ok'; p.g = +g || 0; p.prog = +prog || 0; p.at = +at || 0; if (p.st === 'clearing') p.st = 'ok'; if (p.st === 'ok') p.need = FLORA[p.kind].work; }
    if (F && F.d) this.floraDay = { d: F.d[0], n: F.d[1] };
    for (const l of this.lots) { if (l.stage === 'done' || l.stage === 'renovate') this.floraMark(l, true); else if (l.stage === 'landed') this.floraMark(l); }
  };

  // ---------------------------------------------------------------- 占地
  // 这栋东西脚下有哪些植物：完好的列进 lot.clear（要先清）；小苗 / 空地悄悄让出（silent = 连完好的也让出，旧档修复用）
  P.floraMark = function (lot, silent = false) {
    lot.clear = null; if (!lot.id || lot.stage === 'far' || lot.upTo || !this.flora) return [];
    const F = footOf(lot); const hits = floraHits({ flora: this.floraObstacles() }, F).map(q => q[0]);
    for (const p of this.flora) if (p.st === 'regrow' && bodyDist(F.body, p.x, p.z) < FLORA[p.kind].rad * 0.8) { p.st = 'cleared'; p.g = 0; p.at = this.t; this.ver++; }
    if (silent) { for (const id of hits) { const p = this.floraById(id); p.st = 'cleared'; p.g = 0; p.at = this.t; p.prog = 0; } if (hits.length) this.ver++; return []; }
    if (hits.length) lot.clear = hits.slice(); return hits;
  };
  P.floraBlocks = function (lot) { if (!lot.fmark) { lot.fmark = 1; this.floraMark(lot); } return !!(lot.clear && lot.clear.length); };
  P.floraFeet = function () { // 现有东西的占地缓存（同一个结构版本只算一次）
    if (this._ffV === this.ver && this._ffN === this.lots.length) return this._ff;
    this._ffV = this.ver; this._ffN = this.lots.length; return (this._ff = this.lots.filter(l => l.stage !== 'far' && !l.upTo).map(l => footOf(l).body));
  };
  P.floraFree = function (p) { // 这块地现在空着吗（没被房子 / 旧物 / 路占着）
    for (const b of this.floraFeet()) if (bodyDist(b, p.x, p.z) < 1.2) return false;
    for (const [a, b, d] of this.edges) { if (!d) continue; const A = this.nodes[a], B = this.nodes[b]; if (A && B && segDist(p.x, p.z, A.x, A.z, B.x, B.z) < ROAD_HALF[d] + 1.0) return false; }
    return true;
  };

  // ---------------------------------------------------------------- 干活的人
  P.floraWorkers = function (p) { return this.res.filter(r => r.clearId === p.id && (r.job === 'clear' || r.job === 'fetch') && r.steps.some((s, i) => i >= r.si && s.fn === 'clearPlant' && s.plant === p.id)); };
  P.floraRelease = function (p) { for (const w of this.floraWorkers(p)) { w.clearId = 0; this.finishTask(w); w.timer = 0.3; } };
  P.clearTick = function (r, st) { // 一小段砍完了：植物还没倒就接着砍（留在原地，不重走）
    const p = this.floraById(st.plant);
    if (!p || p.st !== 'clearing') { r.clearId = 0; return false; }
    r.timer = st.dur; return true;
  };
  P.floraSteps = function (r, p) {
    const a = Math.atan2(r.z - p.z, r.x - p.x) + this.rnd(-0.9, 0.9), rr = FLORA[p.kind].rad * 0.85 + 0.6;
    return [this.go(p.x + Math.cos(a) * rr, p.z + Math.sin(a) * rr), this.doo(CHOP, 5, 'clearPlant', { plant: p.id, face: [p.x, p.z] })];
  };
  P.floraStart = function (p, mode, lot) { // 植物开始被清
    p.st = 'clearing'; p.mode = mode; p.idle = 0; p.by = p.by || []; p.need = FLORA[p.kind].work * (mode === 'mat' ? 0.6 : 1); if (p.prog > p.need) p.prog = 0; this.ver++;
  };
  P.floraSend = function (r, p, lot) { // 派 r 去清 p（给旧物腾地方）
    this.finishTask(r); r.clearId = p.id;
    this.setSteps(r, this.floraSteps(r, p), 'clear', `和大家一起把${lot.name}脚下的${FLORA[p.kind].big}清掉`);
    this.emo(r, 3, 5, { k: 'clear', a: FLORA[p.kind].name, b: lot.name, m: 'lot' });
  };

  // ---------------------------------------------------------------- 每秒
  P.stepFlora = function () {
    if (!this.flora) return;
    const night = isNight(this.dayT());
    // 1) 旧物脚下的植物：召集小动物去清
    for (const lot of this.lots) {
      if (!lot.clear || !lot.clear.length) continue;
      lot.clear = lot.clear.filter(id => { const p = this.floraById(id); return p && (p.st === 'ok' || p.st === 'clearing'); });
      if (!lot.clear.length) { this.floraLotDone(lot, []); continue; }
      if (night) continue;
      const p = this.floraById(lot.clear[0]);
      if (p.st === 'ok') this.floraStart(p, 'lot', lot);
      p.lot = lot.id; const have = this.floraWorkers(p); const want = p.kind === 'dandelion' ? 3 : 2;
      if (have.length >= want) continue;
      const watching = new Set(this.watchers(lot).map(r => r.id));
      const c = this.res.filter(r => !r.away && !r.haul && !r.chat && r.act !== SLEEP && r.act !== INSIDE && IDLE_JOBS.has(r.job) && r.full > 30 && r.energy > 20)
        .map(r => ({ r, s: Math.hypot(r.x - p.x, r.z - p.z) - (watching.has(r.id) ? 60 : 0) - (this.has(r, 'diligent') ? 6 : 0) + (this.has(r, 'timid') ? 5 : 0) })).sort((a, b) => a.s - b.s);
      for (const { r } of c.slice(0, want - have.length)) this.floraSend(r, p, lot);
    }
    // 2) 正在被清的植物：干活的人到位了就累积进度；没人干了就先放着
    for (const p of this.flora) {
      if (p.st !== 'clearing') continue;
      const ws = this.floraWorkers(p);
      const owned = p.mode === 'mat' || this.lots.some(l => l.clear && l.clear.includes(p.id));
      if (!owned) { this.floraRelease(p); p.st = 'ok'; this.ver++; continue; }
      if (night) { for (const w of ws) { w.clearId = 0; this.finishTask(w); } }
      const on = ws.filter(w => w.act === CHOP && Math.hypot(w.x - p.x, w.z - p.z) < FLORA[p.kind].rad + 3);
      if (on.length) { p.idle = 0; p.prog += on.length; for (const w of on) if (!p.by.includes(w.id)) p.by.push(w.id); }
      else if (!ws.length) { p.idle++; if (p.idle > 20 && p.mode === 'mat') { p.st = 'ok'; p.mode = ''; this.ver++; } } // 取材的人中途被打断：这丛先放着，不算占着
      if (p.prog >= p.need) this.floraFell(p, ws);
    }
    // 3) 长回来
    const rate = REGROW_PER_DAY[calendar(this.t).season] || 0; let free = null;
    for (const p of this.flora) {
      if (p.st === 'cleared') { if (this.t - p.at >= DAY * REGROW_WAIT && (rate > 0)) { if (this.floraFree(p)) { p.st = 'regrow'; p.g = 0; this.ver++; } else p.at = this.t - DAY * REGROW_WAIT + 30; } }
      else if (p.st === 'regrow') {
        if (!this.floraFree(p)) { p.st = 'cleared'; p.g = 0; p.at = this.t; this.ver++; continue; } // 被房子 / 旧物 / 路占了：小苗不长了
        p.g += rate / DAY; if (p.g >= 1) { p.st = 'ok'; p.g = 0; p.prog = 0; p.need = FLORA[p.kind].work; p.mode = ''; p.by = []; this.ver++; }
      }
    }
  };

  // 一丛倒下了：产出材料、小记录；干活的人收工
  P.floraFell = function (p, ws) {
    const F = FLORA[p.kind]; const n = Math.max(F.n[0], Math.min(F.n[1], Math.floor(this.rnd(F.n[0], F.n[1] + 1)))); const who = (p.by || []).map(id => this.rById(id)).filter(Boolean).slice(0, 4);
    const lead = ws.find(w => w.job === 'fetch') || null;
    p.st = 'cleared'; p.g = 0; p.at = this.t; p.prog = 0; p.by = []; this.ver++; this.lstats.cleared = (this.lstats.cleared || 0) + 1;
    const mode = p.mode; p.mode = '';
    if (lead) { lead.got = [F.mat, n]; lead.box = 1; } else this.mats[F.mat] = Math.min(this.matCap(), (this.mats[F.mat] || 0) + n);
    const names = who.length ? who.map(r => r.name).join('、') : '小动物们';
    const lots = this.lots.filter(l => l.clear && l.clear.includes(p.id));
    const got = `${numWord(n)}${F.unit}${MAT_NAME[F.mat]}`; const deed = `把一${F.q}${F.big}${F.tool}，${F.cut}${got}`;
    if (mode === 'mat') this.addCard('clear', `${names}清出了${got}`, `施工的地方缺${MAT_NAME[F.mat]}，${names}干脆跑到外圈${deed}，送去了工地。`, who, [p.x, p.z]);
    else { const lot = lots[0]; this.addCard('clear', `${names}清出了一块空地`, `${lot ? lot.name : '旧物'}要落在一${F.q}${F.big}上。${names}${deed}，放进了材料堆，地上留下一块平整的空地。`, who, [p.x, p.z]); }
    for (const w of ws) { w.clearId = 0; if (w.steps[w.si + 1]) { w.si++; this.beginStep(w); } else this.finishTask(w); this.remember(w, `把${F.big}${F.tool}，得到${got}`); w.mood = Math.min(100, w.mood + 2); }
    for (const l of lots) { l.clear = l.clear.filter(id => id !== p.id); if (!l.clear.length) this.floraLotDone(l, ws); }
  };
  // 一栋东西脚下的植物清完了：围观 → 商量用途的流程接着走
  P.floraLotDone = function (lot, ws) {
    lot.clear = null; if (lot.stage !== 'landed') return;
    lot.landT = this.t; lot.look = { seen: ws.map(r => r.id), t2: 0, sum: 0 };
    const free = ws.filter(r => !r.away && !r.haul && r.job !== 'clear'); this.summon(lot, 34, free);
  };

  // ---------------------------------------------------------------- 主动取材：施工缺木枝 / 干草，小动物自己去清一丛（克制）
  P.matPlant = function (m, lot, r) {
    if (!this.flora) return null; if (m !== 'twig' && m !== 'grass') return null;
    const day = this.day(); if (this.floraDay.d !== day) this.floraDay = { d: day, n: 0 };
    if (this.floraDay.n >= MAT_DAY_CAP) return null;
    if (this.flora.some(p => p.st === 'clearing' && p.mode === 'mat')) return null; // 一次只清一丛
    const ok = this.flora.filter(p => p.st === 'ok').length; if (ok - 1 < KEEP_OK) return null;
    if (this.rng() > (m === 'grass' ? 0.6 : 0.4)) return null;
    const lots = new Set(); for (const l of this.lots) if (l.clear) for (const id of l.clear) lots.add(id);
    let best = null;
    for (const p of this.flora) {
      if (p.st !== 'ok' || lots.has(p.id) || FLORA[p.kind].mat !== m) continue;
      if (streamSide(p.x, p.z) !== TOWN_SIDE && !(this.bridges > 0)) continue;
      let near = 1e9; for (const [a, b, d] of this.edges) { if (d !== 1 && d !== 3) continue; const A = this.nodes[a], B = this.nodes[b]; near = Math.min(near, segDist(p.x, p.z, A.x, A.z, B.x, B.z)); }
      if (near < 7) continue; // 离路太近的留着好看
      const s = -Math.hypot(p.x - lot.x, p.z - lot.z) - Math.hypot(p.x - r.x, p.z - r.z) * 0.4 + this.rng() * 8; if (!best || s > best.s) best = { p, s };
    }
    if (!best) return null; this.floraDay.n++; this.floraStart(best.p, 'mat', lot); return best.p;
  };
  P.matClearSteps = function (r, p, lot) { r.clearId = p.id; this.emo(r, 3, 5, { k: 'clear', a: FLORA[p.kind].name, b: lot.name, c: MAT_NAME[FLORA[p.kind].mat], m: 'mat' }); return this.floraSteps(r, p); };
}
