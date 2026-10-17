// 玩具车：每座「玩具车货运站」（fac 'train'，包括火柴盒小火车）配一辆真的会跑的小车。
// 车是模拟里的实体（位置、朝向、速度、状态），沿小动物走的同一张路网开（不穿房子、不下水，过桥走桥）：
//   park 停在站里 → joy 载着 1～3 只小动物兜风一圈回来；
//   toHaul 去远方接旧物 → site 停在旧物旁等大家套好绳子 → tow 拖着旧物沿路回镇上 → back 空车开回站里。
// 偶尔抛锚（broke）：乘客下车一起推。存档保存车的位置朝向，读档后车从原地开回站里（行程不续接）。
// 没有货运站就没有车：整个模块在 cars 为空时每秒只做一次很小的检查。
import { DAY, TAU, PI, clamp, lerp, isNight, PLAZA_R, WORLD_R, OBJ_NAME } from '../shared/layout.js';
import { footOf } from '../shared/footprint.js';
import { placeCheck, renderKindOf } from '../shared/items.js';
import { EMO } from './lenia.js';

export const MAX_CARS = 4;            // 同时最多几辆车（再多的货运站只当摆设站）
export const CAR_SEATS = 3;
export const CAR_S = 2.39;           // 车身缩放（= 玩具车旧物的占地半径；火柴盒小火车的车头也用这个大小）
const IDLE = 0, HAUL = 10;
export const CAR_V = { joy: 4.2, run: 4.8, tow: 3.0, push: 0.9 }; // 世界单位 / 模拟秒；徒手拖旧物只有 0.8
export const SEAT = [[-0.1, -0.3], [-0.1, 0.3], [-0.62, 0]]; // 乘客座位：[沿车身, 横向]，单位 = 车缩放
const angD = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const nameList = (rs) => rs.length <= 1 ? (rs[0] ? rs[0].name : '') : rs.slice(0, -1).map(r => r.name).join('、') + '和' + rs[rs.length - 1].name;
const stationYaw = (l) => (l.rot || 0) + PI / 2; // 停车朝向：车头朝向和旧物模型的 +x 一致

export function installCars(Sim) {
  const P = Sim.prototype;
  P.carsFresh = function () { this.cars = []; this.carId = 1; this._carVer = -1; this._carSync = 0; };
  P.carById = function (id) { return this.cars.find(c => c.id === id); };
  P.carOfLot = function (lotId) { return this.cars.find(c => c.lot === lotId); };
  P.carStations = function () { return this.lots.filter(l => l.done && l.use === 'fac' && l.fac === 'train' && !l.upTo && l.stage !== 'far').slice(0, MAX_CARS); };
  P.carAhead = function (p) { return this.K[p.kind].r * 0.8 + 2.3; }; // 车头离旧物中心多远（绳子拉着）

  // ---------------------------------------------------------------- 配车 / 收车
  P.syncCars = function (quiet = false) {
    const want = this.carStations();
    for (const c of this.cars.slice()) if (!want.some(l => l.id === c.lot)) this.carRemove(c);
    for (const l of want) if (!this.cars.some(c => c.lot === l.id)) this.carAdd(l, quiet);
  };
  P.carAdd = function (l, quiet) {
    const c = { id: this.carId++, lot: l.id, x: l.x, z: l.z, yaw: stationYaw(l), v: 0, spin: 0, st: 'park', way: null, wi: 0, pass: [], wait: [], waitT: 0, cd: quiet ? 0 : DAY * 0.03, proj: 0, broke: 0, breakAt: Infinity, breakS: Infinity, didBreak: 0, odo: 0, hold: 0, trips: 0, hauls: 0, breaks: 0, br: 0, doing: '', where: '', t0: this.t, trail: l.combo === 'train' ? 1 : 0 };
    this.cars.push(c); this.ver++;
    if (!quiet) { this.lotEv(l, '玩具车停进了车位，等着有人来开'); this.log.push(`${l.name}有了一辆会跑的玩具车`); }
    return c;
  };
  P.carRemove = function (c) {
    for (const id of c.pass.slice()) { const r = this.rById(id); if (r) this.carUnboard(r, c); }
    for (const id of c.wait.slice()) { const r = this.rById(id); if (r && r.rideWait === c.id) { r.rideWait = 0; if (r.job === 'ride') this.finishTask(r); } }
    const p = c.proj ? this.projects.find(p => p.id === c.proj) : null; if (p) p.car = 0;
    this.cars = this.cars.filter(o => o !== c); this.ver++;
  };

  // ---------------------------------------------------------------- 乘客
  P.carSeatXZ = function (c, i, S) { // 座位 / 推车位置的世界坐标
    const f = [Math.sin(c.yaw), Math.cos(c.yaw)], s = [Math.cos(c.yaw), -Math.sin(c.yaw)];
    if (c.broke > 0) { const b = (i - (c.pass.length - 1) / 2) * 0.62 * S; return [c.x - f[0] * 1.5 * S + s[0] * b, c.z - f[1] * 1.5 * S + s[1] * b]; }
    const [a, b] = SEAT[i % CAR_SEATS]; return [c.x + f[0] * a * S + s[0] * b * S, c.z + f[1] * a * S + s[1] * b * S];
  };
  P.carUnboard = function (r, c, hop = true) { // 下车：落在车旁边
    c.pass = c.pass.filter(id => id !== r.id); if (r.ride !== c.id) return; r.ride = 0;
    if (hop) { const S = CAR_S; const side = (r.id % 2 ? 1 : -1) * (0.75 * S + 0.5); r.x = c.x + Math.cos(c.yaw) * side + Math.sin(c.yaw) * (-0.3 * S); r.z = c.z - Math.sin(c.yaw) * side + Math.cos(c.yaw) * (-0.3 * S); }
    if (!r.haul) this.finishTask(r); else { r.act = HAUL; }
  };
  P.carBoardOK = function (c) {
    if (!c || c.st !== 'park' || c.cd > 0 || c.wait.length >= CAR_SEATS) return false;
    if (isNight(this.dayT()) || (this.wx && (this.wx.k === 'rain' || this.wx.k === 'snow'))) return false;
    if (this.projects.some(p => p.stage === 'gather' && !p.car && p.team.length)) return false; // 有旧物等着拖：车留着干活
    return true;
  };
  P.carFreeFor = function () { return this.cars.find(c => this.carBoardOK(c)); };
  P.carBoard = function (r, c) { // 小动物去车站排队等车
    const l = this.lotById(c.lot); if (!l) return false;
    this.finishTask(r); c.wait.push(r.id); r.rideWait = c.id; r.rideWaitT = this.t;
    const a = (r.id * 2.399) % TAU, rr = Math.max(l.r + 0.9, footOf(l).R * 0.8);
    this.setSteps(r, [this.go(l.x + Math.cos(a) * rr, l.z + Math.sin(a) * rr), this.doo(IDLE, 40, 'carWait', { lot: l.id, face: [l.x, l.z] })], 'ride', `去${l.name}，想坐玩具车兜一圈`);
    return true;
  };
  P.carWaiters = function (c) { return c.wait.map(id => this.rById(id)).filter(r => r && !r.away && r.rideWait === c.id && r.job === 'ride'); };
  P.carArrived = function (r) { const st = r.steps[r.si]; return !!st && st.fn === 'carWait' && r.act === IDLE; };

  // ---------------------------------------------------------------- 兜风
  P.carJoyRoute = function (c, l) {
    const nodes = this.nodes; const ok = [];
    nodes.forEach((n, i) => { if (n.k === 'door' || n.k === 'gate') return; const d = Math.hypot(n.x - l.x, n.z - l.z); if (d >= 9 && d <= 46 && Math.hypot(n.x, n.z) < WORLD_R - 3) ok.push(i); });
    let way = [];
    if (ok.length >= 2) {
      const a = this.pick(ok); const A = nodes[a]; const far = ok.filter(i => i !== a && Math.hypot(nodes[i].x - A.x, nodes[i].z - A.z) > 9);
      const b = far.length ? this.pick(far) : this.pick(ok.filter(i => i !== a)); const B = nodes[b];
      way = [...this.pathPts(l.x, l.z, A.x, A.z), ...this.pathPts(A.x, A.z, B.x, B.z), ...this.pathPts(B.x, B.z, l.x, l.z)];
      c.far = Math.hypot(A.x - l.x, A.z - l.z) > Math.hypot(B.x - l.x, B.z - l.z) ? A : B;
    } else { // 路网太小：绕广场外沿转一圈
      const R = PLAZA_R + 3.5, a0 = Math.atan2(l.z, l.x); for (let k = 0; k <= 8; k++) way.push([Math.cos(a0 + k / 8 * TAU) * R, Math.sin(a0 + k / 8 * TAU) * R]);
      way = [...this.pathPts(l.x, l.z, way[0][0], way[0][1]), ...way, ...this.pathPts(way[8][0], way[8][1], l.x, l.z)]; c.far = { x: 0, z: 0 };
    }
    const out = []; for (const q of way) { const L = out[out.length - 1]; if (!L || Math.hypot(q[0] - L[0], q[1] - L[1]) > 0.3) out.push(q); }
    out.push([l.x, l.z]); return out;
  };
  P.carWhere = function (c) { // 「往哪儿兜」的口语说法
    const f = c.far; if (!f) return '沿着小路';
    if (Math.hypot(f.x, f.z) < PLAZA_R + 6) return '绕着广场';
    let best = null, bd = 12; for (const o of this.lots) { if (!o.done || this.natural(o) || o.id === c.lot || o.upTo) continue; const d = Math.hypot(o.x - f.x, o.z - f.z); if (d < bd) { bd = d; best = o; } }
    return best ? `往${best.name}那边` : '沿着小路';
  };
  P.carDepart = function (c, riders) {
    const l = this.lotById(c.lot); const sit = new Set(riders.map(r => r.id));
    for (const id of c.wait) if (!sit.has(id)) { const r = this.rById(id); if (r && r.rideWait === c.id) { r.rideWait = 0; if (r.job === 'ride') this.finishTask(r); } }
    c.wait = []; c.waitT = 0; c.pass = [];
    for (const r of riders) { this.finishTask(r); r.rideWait = 0; r.ride = c.id; r.job = 'ride'; r.act = IDLE; c.pass.push(r.id); r.mood = Math.min(100, r.mood + 4); }
    c.way = this.carJoyRoute(c, l); c.wi = 0; c.st = 'joy'; c.hold = 1.0; c.odo = 0; c.didBreak = 0; c.where = this.carWhere(c);
    let len = 0; for (let i = 1; i < c.way.length; i++) len += Math.hypot(c.way[i][0] - c.way[i - 1][0], c.way[i][1] - c.way[i - 1][1]);
    c.breakAt = this.rng() < 0.07 ? len * this.rnd(0.25, 0.7) : Infinity; c.trips++; this.stats.carJoy = (this.stats.carJoy || 0) + 1; this.ver++;
    const nm = nameList(riders); c.doing = `${nm}开着玩具车${c.where}兜风`;
    for (const r of riders) { r.doing = `坐在玩具车里${c.where}兜风`; this.emo(r, EMO.NOTE, 4, { k: 'fac', a: l.name, b: '坐上玩具车出发兜风' }); }
  };
  P.carJoyEnd = function (c) {
    const l = this.lotById(c.lot); const rs = c.pass.map(id => this.rById(id)).filter(Boolean); const nm = nameList(rs);
    for (const r of rs.slice()) this.carUnboard(r, c);
    for (const r of rs) { r.mood = Math.min(100, r.mood + 12); r.doing = '兜风回来了，还在笑'; this.remember(r, rs.length > 1 ? `和${nameList(rs.filter(o => o !== r))}开着玩具车${c.where}跑了一圈` : `一个人开着玩具车${c.where}跑了一圈`); this.emo(r, EMO.NOTE, 4, { k: 'fac', a: l ? l.name : '玩具车', b: '兜风回来了，开心' }); }
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) this.bond(rs[i], rs[j], 3);
    if (l) this.lotEv(l, `${nm}开着玩具车${c.where}跑了一圈，回来还笑个不停`);
    c.st = 'park'; c.cd = DAY * this.rnd(0.07, 0.13); c.way = null; c.v = 0; c.doing = ''; this.ver++;
  };

  // ---------------------------------------------------------------- 运货
  P.carPathAt = function (p, s, side = 0) { // 路径上第 s 处的位置；超过终点就顺着最后一段延长（车头在旧物前面）
    const { path, cum } = p; const n = path.length; const total = cum[n - 1];
    if (s <= total) { const q = this.pathAt(p, s); return side ? [q[0] + Math.cos(q[2]) * side, q[1] - Math.sin(q[2]) * side, q[2]] : q; }
    const a = path[n - 2], b = path[n - 1]; const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]); const e = s - total;
    return [b[0] + Math.sin(yaw) * e + Math.cos(yaw) * side, b[1] + Math.cos(yaw) * e - Math.sin(yaw) * side, yaw];
  };
  P.carHookPose = function (c, p) { // 车在旧物前面：离终点不到一个车头距离时往旁边让开，免得压在旧物上
    const ahead = this.carAhead(p); const total = p.cum[p.cum.length - 1]; const rem = total - p.s; const sd = rem < ahead ? (ahead - rem) / ahead * 2.8 : 0;
    return this.carPathAt(p, Math.min(p.s + ahead, total + 0.5), sd);
  };
  P.carClaim = function (c, p) {
    c.proj = p.id; p.car = c.id; p.carT0 = this.t; const [tx, tz] = this.carHookPose(c, p);
    c.way = this.pathPts(c.x, c.z, tx, tz); c.wi = 0; c.st = 'toHaul'; c.hold = 0.6; c.cd = 0;
    for (const id of c.wait) { const r = this.rById(id); if (r && r.rideWait === c.id) { r.rideWait = 0; if (r.job === 'ride') this.finishTask(r); } } c.wait = [];
    c.doing = `开去远处，接${OBJ_NAME[p.kind]}回来`; this.ver++;
    const l = this.lotById(c.lot); if (l) this.log.push(`${l.name}的玩具车出发去接${OBJ_NAME[p.kind]}`);
  };
  P.carRelease = function (c, why) { // 任务取消：乘客下车，空车开回站里
    const p = c.proj ? this.projects.find(p => p.id === c.proj) : null; if (p && p.car === c.id) p.car = 0;
    for (const id of c.pass.slice()) { const r = this.rById(id); if (r) this.carUnboard(r, c); }
    c.proj = 0; c.broke = 0; c.breakS = Infinity; this.carGoHome(c, why); 
  };
  P.carGoHome = function (c, why) { const l = this.lotById(c.lot); if (!l) { c.st = 'park'; return; } c.way = this.pathPts(c.x, c.z, l.x, l.z); c.way.push([l.x, l.z]); c.wi = 0; c.st = 'back'; c.doing = why || '空车开回车位'; };
  P.carHook = function (p) { // 绳子套好开拖：队里前 3 位坐进车里
    const c = this.carById(p.car); if (!c) return;
    c.st = 'tow'; c.pass = []; c.hold = 0; const total = p.cum[p.cum.length - 1];
    for (const id of p.team.slice(0, CAR_SEATS)) { const r = this.rById(id); if (!r) continue; r.ride = c.id; c.pass.push(id); r.doing = `坐在玩具车里，拖着${OBJ_NAME[p.kind]}回镇上`; }
    c.didBreak = 0; c.breakS = this.rng() < 0.12 ? p.s + (total - p.s) * this.rnd(0.3, 0.7) : Infinity;
    c.doing = `拖着${OBJ_NAME[p.kind]}往镇上开`; this.ver++;
  };
  P.carUnhook = function (p) { // 人不够了，停下来等：乘客下车，车回到等待状态
    const c = this.carById(p.car); if (!c) return;
    for (const id of c.pass.slice()) { const r = this.rById(id); if (r) this.carUnboard(r, c); }
    c.st = 'site'; c.broke = 0; c.doing = `停在${OBJ_NAME[p.kind]}旁边，等大家到齐`;
  };
  P.carAbort = function (p, why) { const c = this.carById(p.car); if (c) this.carRelease(c, why || '拖运取消了，空车开回车位'); p.car = 0; };
  P.carDone = function (p) { // 旧物拖到了：下车、车空着开回站里
    const c = this.carById(p.car); if (!c) return; const l = this.lotById(c.lot);
    const team = p.team.map(id => this.rById(id)).filter(Boolean);
    for (const r of c.pass.map(id => this.rById(id)).filter(Boolean)) this.carUnboard(r, c);
    for (const r of team) this.remember(r, `玩具车把${OBJ_NAME[p.kind]}拖回来了，比走路快多了`);
    if (l) this.lotEv(l, `玩具车把远处的${OBJ_NAME[p.kind]}拖回来了，比走路快多了`);
    c.hauls++; this.stats.carHauls = (this.stats.carHauls || 0) + 1; p.carUsed = 1;
    if (!this.carFirstHaul) { this.carFirstHaul = 1; this.addCard('haul', '玩具车第一次拖回物件！', `${team.map(r => r.name).join('、')}把绳子系在玩具车后面，车一路嘟嘟嘟地把${OBJ_NAME[p.kind]}拖回了镇上，比大家用手拖快多了。`, team, [c.x, c.z]); }
    c.proj = 0; p.car = 0; c.broke = 0; this.carGoHome(c, '拖完了，空车开回车位');
  };
  // 队伍准备出发前：车是否到位（返回 true = 可以出发）。没车的、车来不及的，等一小会儿就徒手拖
  P.carReady = function (p, dt) {
    if (p.car) { const c = this.carById(p.car);
      if (!c || c.proj !== p.id) { p.car = 0; return true; }
      if (this.t - p.carT0 > 80 && c.st !== 'site') { this.carRelease(c, '车来得太慢，空车开回车位'); return true; } // 超时：大家先徒手拖
      return c.st === 'site'; }
    const free = this.cars.find(c => c.st === 'park'); if (free && !isNight(this.dayT())) { this.carClaim(free, p); return false; }
    if (this.cars.some(c => c.st === 'joy' || c.wait.length)) { p.carWait = (p.carWait || 0) + dt; return p.carWait > 25; } // 车在兜风，快回来了
    return true;
  };

  // ---------------------------------------------------------------- 抛锚
  P.carBreak = function (c) {
    const l = this.lotById(c.lot); c.broke = this.rnd(9, 14); c.didBreak = 1; c.breaks++; this.stats.carBreaks = (this.stats.carBreaks || 0) + 1; c.breakAt = Infinity; c.breakS = Infinity;
    const rs = c.pass.map(id => this.rById(id)).filter(Boolean); const nm = nameList(rs);
    for (const r of rs) { r.doing = '玩具车抛锚了，下车和大家一起推'; this.emo(r, EMO.Q, 3, { k: 'fac', a: l ? l.name : '玩具车', b: '车抛锚了，一起推' }); }
    c.doing = `抛锚了！${nm}下车一起推`;
    if (l) this.lotEv(l, `玩具车半路抛锚，${nm}下车一起把它推到了路边`);
    if (!this.carFirstBreak) { this.carFirstBreak = 1; this.addCard('change', '玩具车抛锚了', `玩具车开到半路突然「噗」地熄了火。${nm}从车上跳下来，在后面使劲推，推了好一会儿才把它重新发动起来。大家笑着说，这车年纪大了，偶尔要耍点小脾气。`, rs, [c.x, c.z]); }
  };

  // ---------------------------------------------------------------- 每秒检查（决定要不要出发）
  P.carSecond = function () {
    if (this.ver !== this._carVer || ++this._carSync >= 30) { this._carVer = this.ver; this._carSync = 0; this.syncCars(); }
    if (!this.cars.length) return;
    const night = isNight(this.dayT());
    for (const c of this.cars) {
      const l = this.lotById(c.lot); if (!l) continue;
      if (c.st === 'park') {
        c.cd = Math.max(0, c.cd - 1);
        const ws = this.carWaiters(c); c.wait = ws.map(r => r.id);
        for (const r of ws) if (this.t - r.rideWaitT > 55) { r.rideWait = 0; this.finishTask(r); r.doing = '等了半天没轮到玩具车，算了'; c.wait = c.wait.filter(id => id !== r.id); }
        if (!night) { const p = this.projects.find(p => p.stage === 'gather' && !p.car && p.team.length); if (p) { this.carClaim(c, p); continue; } }
        const arr = c.wait.map(id => this.rById(id)).filter(r => r && this.carArrived(r));
        if (arr.length && !night) { c.waitT += 1; if (arr.length >= c.wait.length || c.waitT >= 6) this.carDepart(c, arr.slice(0, CAR_SEATS)); }
        else c.waitT = 0;
      } else if (c.st === 'toHaul' || c.st === 'site' || c.st === 'tow') {
        const p = this.projects.find(p => p.id === c.proj);
        if (!p || p.car !== c.id || (c.st === 'tow' && p.stage !== 'haul') || (c.st !== 'tow' && p.stage !== 'gather') || (night && c.st !== 'tow')) this.carRelease(c, '拖运取消了，空车开回车位');
      }
    }
  };

  // ---------------------------------------------------------------- 每步移动
  P.carDrive = function (c, dt, vmax) { // 沿 c.way 开；返回 true = 到终点
    const w = c.way && c.way[c.wi]; if (!w) return true;
    const dx = w[0] - c.x, dz = w[1] - c.z, d = Math.hypot(dx, dz); const hd = d > 0.05 ? Math.atan2(dx, dz) : c.yaw;
    const last = c.wi >= c.way.length - 1; let vt = vmax; if (last) vt = Math.min(vt, 0.5 + d * 1.1); if (Math.abs(angD(c.yaw, hd)) > 0.7) vt *= 0.6; if (c.broke > 0) vt = Math.min(vt, CAR_V.push);
    c.br = c.v - vt > 1.4 ? 1 : 0; c.v += clamp(vt - c.v, -dt * 8, dt * 3.2); const step = c.v * dt;
    if (d <= Math.max(step, 0.12)) { c.x = w[0]; c.z = w[1]; c.wi++; c.odo += d; if (c.wi >= c.way.length) { c.v = 0; return true; } }
    else { c.x += dx / d * step; c.z += dz / d * step; c.odo += step; }
    c.yaw += angD(c.yaw, hd) * Math.min(1, dt * 7); return false;
  };
  P.carSeat = function (c, dt) { // 把乘客摆到座位上（或推车位置）
    const S = CAR_S; const push = c.broke > 0;
    c.pass = c.pass.filter(id => { const r = this.rById(id); return r && r.ride === c.id && !r.away; });
    c.pass.forEach((id, i) => { const r = this.rById(id); const [sx, sz] = this.carSeatXZ(c, i, S); const k = Math.min(1, dt * 3.5); r.x += (sx - r.x) * k; r.z += (sz - r.z) * k; r.yaw = c.yaw; r.act = push ? HAUL : IDLE; });
  };
  P.stepCar = function (c, dt) {
    const l = this.lotById(c.lot); if (!l) return;
    c.br = 0;
    if (c.broke > 0) { c.broke -= dt; if (c.broke <= 0) { c.broke = 0; const rs = c.pass.map(id => this.rById(id)).filter(Boolean); for (const r of rs) { this.emo(r, EMO.NOTE, 3, { k: 'fac', a: l.name, b: '车修好了，重新发动' }); r.doing = c.st === 'tow' ? `坐回玩具车，继续拖${c.proj ? '旧物' : ''}回镇上` : '坐回玩具车，继续兜风'; } } }
    if (c.st === 'park') {
      if (l.moving) { c.x = l.x; c.z = l.z; }
      const ty = stationYaw(l); c.yaw += angD(c.yaw, ty) * Math.min(1, dt * 4); c.v = 0;
      if (Math.hypot(c.x - l.x, c.z - l.z) > 0.05) { c.x = lerp(c.x, l.x, Math.min(1, dt * 4)); c.z = lerp(c.z, l.z, Math.min(1, dt * 4)); }
    } else if (c.st === 'joy') {
      this.carSeat(c, dt);
      if (c.hold > 0) { c.hold -= dt; c.v = 0; return; }
      if (c.breakAt < Infinity && c.odo >= c.breakAt && !c.didBreak) this.carBreak(c);
      if (this.carDrive(c, dt, CAR_V.joy)) { c.x = l.x; c.z = l.z; this.carJoyEnd(c); }
    } else if (c.st === 'toHaul' || c.st === 'back') {
      if (c.hold > 0) { c.hold -= dt; c.v = 0; return; }
      if (this.carDrive(c, dt, CAR_V.run)) {
        if (c.st === 'back') { c.st = 'park'; c.cd = DAY * this.rnd(0.03, 0.06); c.way = null; c.doing = ''; this.ver++; }
        else c.st = 'site';
      }
    } else if (c.st === 'site' || c.st === 'tow') {
      const p = this.projects.find(p => p.id === c.proj); if (!p) return;
      const [x, z, yaw] = this.carHookPose(c, p); const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
      const px = c.x, pz = c.z; if (d > 3) { c.x += dx / d * Math.min(d, 6 * dt); c.z += dz / d * Math.min(d, 6 * dt); } else { c.x = x; c.z = z; }
      c.yaw += angD(c.yaw, yaw) * Math.min(1, dt * 5); c.v = Math.hypot(c.x - px, c.z - pz) / dt;
      if (c.st === 'tow') { this.carSeat(c, dt); if (c.breakS < Infinity && p.s >= c.breakS && !c.didBreak) this.carBreak(c); }
    }
  };
  P.stepCars = function (dt) { for (const c of this.cars) this.stepCar(c, dt); };

  // ---------------------------------------------------------------- 给画面 / 界面 / 存档
  P.carSnap = function () {
    return this.cars.map(c => { const l = this.lotById(c.lot); const sp = c.st === 'park' || c.st === 'site' ? 0 : c.v;
      return { id: c.id, lot: c.lot, x: c.x, z: c.z, yaw: c.yaw, v: sp, st: c.broke > 0 ? 'broke' : c.st, s: CAR_S, n: c.pass.length, pj: c.proj, br: c.br, tr: c.trail, rot: l ? l.rot : 0 }; });
  };
  P.carInfo = function () {
    return this.cars.map(c => { const l = this.lotById(c.lot); const rs = (c.st === 'park' ? this.carWaiters(c) : c.pass.map(id => this.rById(id)).filter(Boolean));
      let doing = c.doing; if (c.broke > 0) doing = `抛锚了！${nameList(c.pass.map(id => this.rById(id)).filter(Boolean))}下车一起推`; else if (c.st === 'park') doing = rs.length ? `${nameList(rs)}正在排队上车` : '停在车位里，等小伙伴来开';
      else if (c.st === 'site') { const p = this.projects.find(p => p.id === c.proj); doing = p ? `停在${OBJ_NAME[p.kind]}旁边，等大家套好绳子` : doing; }
      return { id: c.id, lot: c.lot, name: l ? l.name : '玩具车', st: c.broke > 0 ? 'broke' : c.st, doing, who: rs.map(r => r.name), x: c.x, z: c.z, trips: c.trips, hauls: c.hauls, breaks: c.breaks, trail: c.trail }; });
  };
  P.carSave = function () { const R2 = (v) => Math.round(v * 100) / 100; return this.cars.map(c => ({ id: c.id, lot: c.lot, x: R2(c.x), z: R2(c.z), yaw: R2(c.yaw), st: c.st, n: c.trips, h: c.hauls, b: c.breaks })); };
  P.carLoad = function (S) { // 读档：车从存档的位置开回站里；没有车记录的旧档在 syncCars 里配一辆停在站里的
    this.cars = []; this.carId = (S.nc | 0) || 1; this._carVer = -1; this._carSync = 0;
    for (const a of S.cars || []) { const l = this.lotById(a.lot); if (!l || !l.done || l.fac !== 'train') continue;
      const c = this.carAdd(l, true); c.id = a.id; c.x = a.x; c.z = a.z; c.yaw = a.yaw; c.trips = a.n || 0; c.hauls = a.h || 0; c.breaks = a.b || 0; this.carId = Math.max(this.carId, a.id + 1);
      if (a.st !== 'park' && Math.hypot(a.x - l.x, a.z - l.z) > 0.5) this.carGoHome(c, '空车开回车位'); }
    this.syncCars(true);
  };

  // ---------------------------------------------------------------- 测试 / 截图用（不是正常玩法）
  // 摆一座完工的玩具车货运站（combo = 火柴盒小火车），返回位置；再让一群居民去开
  P.dbgStation = function (o = {}) {
    const kind = renderKindOf('toycar'); let at = null;
    for (let k = 0; k < 800 && !at; k++) { const a = (k + (o.i || 0) * 40) * 0.7 + (o.a || 0), d = (o.d || 14) + (k % 30) * 0.8; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (placeCheck(x, z, this.K[o.combo ? 'combo_train' : kind].r, this.placeState(), 'item', { item: 'toycar', rot: o.rot || 0 }).ok) at = [x, z]; }
    if (!at) return { ok: false };
    if (!(this.box.toycar > 0)) this.giveItem('toycar', 1, 'attic');
    const r = this.dropItem('toycar', at[0], at[1], o.rot || 0); if (!r.ok) return { ok: false };
    const l = this.lotById(r.id); this.projects = this.projects.filter(p => p.lot !== l.id);
    if (o.combo) { l.kind = 'combo_train'; l.item = 'combo'; l.combo = 'train'; l.r = this.K.combo_train.r; }
    Object.assign(l, { use: 'fac', fac: 'train', done: true, stage: 'done', prog: 1, paid: 3, name: o.combo ? '火柴盒小火车' : '玩具车货运站', doneAt: this.t }); this.ver++; this.syncCars();
    return { ok: true, id: l.id, x: l.x, z: l.z };
  };
  // 让远方出现一件旧物并马上被发现，居民会组队去拖（车会去接）
  P.dbgHaul = function () { let lot = this.lots.find(l => l.stage === 'far'); if (!lot) { this.spawnFar(this.pick(['egg', 'cup', 'honey'])); lot = this.lots.find(l => l.stage === 'far'); } const r = this.res.find(r => !r.away && !r.haul); return lot && r ? { ok: this.discover(lot, r) } : { ok: false }; };
  P.dbgCar = function (o = {}) {
    const c = o.car ? this.carById(o.car) : this.cars[0]; if (!c) return { ok: false };
    const l = this.lotById(c.lot);
    if (o.joy) { const pick = this.res.filter(r => !r.away && !r.haul && !r.ride).slice(0, Math.min(o.joy, 3)); for (const r of pick) { this.finishTask(r); r.x = l.x + 1.5; r.z = l.z + 1.5; r.rideWait = c.id; r.rideWaitT = this.t; c.wait.push(r.id); r.job = 'ride'; } this.carDepart(c, pick); if (o.break) { c.breakAt = 1; } if (o.fast) c.hold = 0; return { ok: true, ids: pick.map(r => r.id) }; }
    if (o.breakNow) { if (c.pass.length) this.carBreak(c); return { ok: true }; }
    return { ok: true };
  };
}
