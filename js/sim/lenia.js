// 「你和好朋友 Lenia 一起照顾小动物」的模拟部分（挂到 Sim 原型上）：放东西 → 居民围观 → 商量用途 → 拖运 / 就地改造；组合惊喜；
// 窗台回礼与心意；储物箱解锁；打理花园；小镇愿望清单。拖运、改造、入住、开店全部复用 sim-core 原有流程。
import { DAY, TAU, clamp, isNight, SPECIES, SP_NAME, CAP, MAT_NAME, MATS, STREAM, streamDist, OBJ_NAME, SHOP, TIME_K, hm, STAGE_COST } from '../shared/layout.js';
import { ITEMS, ITEM_KEYS, TEMPLATE_OF, renderKindOf, START_BOX, START_UNLOCK, START_SEEDS, COMBOS, comboOf, COMBO_R, FAC, GIFTS, SEEDS, FLOWER_DAY, MAX_FLOWERS, MAX_SILL, noteText, TOWN_WISHES, WISH_ORDER, placeCheck, streamSide, TOWN_SIDE, ITEM_TEAM, WORN, puddleUses, inSeason, matSources } from '../shared/items.js';
import { calendar, SEASON_NAME } from '../shared/seasons.js';
import { footOf, bodyGap, COMBO_GAP } from '../shared/footprint.js';
import { RECIPE_START } from '../shared/journey.js';
import { movable, moveCheck } from '../shared/items.js';
const ACT_WALK = 1;

const LOOK_R = 34, MAX_WATCH = 5, HOLD_MS = 5 * 60e3; // HOLD_MS：教程“等一等”最长真实 5 分钟
export const EMO = { Q: 1, WOW: 2, NOTE: 3, TALK: 4, HUNGRY: 5, LOVE: 10 }; // 5 饿了（空碗）、10～13 吃到最爱的（10 + 食物序号：莓果、菜、鱼、面包）

export function installLenia(Sim) {
  const P = Sim.prototype;
  P.leniaFresh = function () {
    this.notices = this.notices || []; this.box = { ...START_BOX }; this.unlocked = [...START_UNLOCK]; this.seeds = { ...START_SEEDS }; this.heart = 8; // 开局 8 点 = 原来的心意 2 + 梦的力气 6
    this.sill = []; this.giftId = 1; this.flowers = []; this.flowerId = 1; this.tw = []; this.twDone = []; this.idex = {}; this.cdex = {}; this.giftQ = [];
    this.recipes = Object.fromEntries(RECIPE_START.map(id => [id, { day: 0, from: 'start' }])); // 已知配方：{ 组合id: { day, from } }，开局只知道茶壶 + 毛线球
    this.nextDaily = Math.floor(this.t / DAY) * DAY + DAY * 0.3; if (this.nextDaily < this.t) this.nextDaily += DAY;
    this.nextAttic = this.t + DAY * 1.6; this.bridges = 0; this.lstats = { drops: 0, decided: 0, combos: 0, gifts: 0, giftsTaken: 0, planted: 0, watered: 0, bloomed: 0, twDone: 0, unlocks: 0, mat: 0, festival: 0 };
    for (const k of WISH_ORDER.slice(0, 3)) this.addTownWish(k);
  };
  // ---------------------------------------------------------------- 摆放
  P.placeState = function () { return { lots: this.lots.slice(), snowmen: this.snowmen || [], nodes: this.nodes.map(n => [n.x, n.z, n.k]), edges: this.edges, bridges: this.bridges, flowers: this.flowers.map(f => [f.x, f.z]), puddles: (this.puddles || []).map(p => [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, Math.round(p.r * 100) / 100, p.id]) }; }; // 和发给主线程的 struct 同样取两位小数：金圈、绿红判定两边算得一模一样
  P.dropItem = function (item, x, z, rot = 0, hold = false) {
    const it = ITEMS[item]; if (!it) return { ok: false, why: '没有这件东西' };
    if (!(this.box[item] > 0)) return { ok: false, why: `储物箱里没有${it.name}了` };
    const kind = renderKindOf(item); const r = this.K[kind].r;
    const chk = placeCheck(x, z, r, this.placeState(), 'item', { item, rot }); if (!chk.ok) return chk;
    if (chk.gold) { x = chk.gold.x; z = chk.gold.z; rot = chk.gold.rot; } // 放进金圈：对齐圈心落下
    this.box[item]--; if (!this.box[item]) delete this.box[item];
    const lot = this.newLot(kind); lot.item = item; lot.name = it.name;
    if (hold) lot.hold = Date.now() + HOLD_MS; // 新手教程：先别让小动物商量它的用途（临时字段，不进存档；到点自动解除）
    const pd = chk.puddle ? this.puddles.find(p => p.id === chk.puddle) : null;
    if (pd) { lot.pond = Math.max(pd.r, r + 0.6); this.puddles = this.puddles.filter(p => p !== pd); this.wstats.puddleUses++; if (placeCheck(pd.x, pd.z, r, this.placeState(), 'item', { item, rot }).ok) { x = pd.x; z = pd.z; } } // 放进水洼：水洼留下来变成它的池子
    Object.assign(lot, { x, z, fx: x, fz: z, rot, stage: 'landed', landT: this.t, look: { seen: [], t2: 0, sum: 0 } });
    this.lots.push(lot); this.ver++; this.lstats.drops++;
    this.log.push(`天上轻轻落下了一个${it.name}`);
    if (!this.idex[item]) this.idex[item] = { n: 0, day: this.day(), uses: [] }; this.idex[item].n++;
    const T = chk.gold ? this.lotById(chk.gold.id) : null; const cb = T && comboOf(item, T.item);
    if (cb) { const w = [...new Set([...this.watchers(T), ...this.res.filter(o => !o.away && !o.haul && !o.chat && o.act !== 6 && o.act !== 9 && (!o.job || ['wander', 'plaza', 'visit', 'wait', 'gawk'].includes(o.job)) && Math.hypot(o.x - x, o.z - z) < 14)])].slice(0, 5); const cl = this.doCombo(lot, T, cb, w); if (cl) return { ok: true, id: cl.id, why: chk.why, combo: cb.id, x: cl.x, z: cl.z }; } // 金圈：落下就拼
    this.summon(lot, LOOK_R);
    return { ok: true, id: lot.id, why: chk.why, x, z };
  };
  // 新手教程的“等一等”标记：解除全部（教程结束 / 跳过时调用）
  // 新手教程：组合落成时周围的小动物开心地蹦一下、冒音符
  P.celebrate = function (id) { const l = this.lotById(id); if (!l) return { ok: false, silent: true }; let n = 0; for (const r of this.res) if (!r.away && Math.hypot(r.x - l.x, r.z - l.z) < 16) { this.emo(r, EMO.NOTE, 4, { k: 'celebrate' }); r.mood = Math.min(100, r.mood + 5); n++; } return { ok: true, n, silent: true }; };
  P.releaseHold = function () { let n = 0; for (const l of this.lots) if (l.hold) { delete l.hold; n++; } return { ok: true, n, silent: true }; };
  P.summon = function (lot, R) {
    if (isNight(this.dayT())) return 0; lot.look.sum = this.t; let n = 0;
    const busy = new Set(['eat', 'forage', 'sleep', 'camp', 'shop', 'tend', 'gawk', 'arrive', 'trip', 'rescue', 'fest', 'snowman', 'shelter']);
    const c = this.res.filter(r => !r.haul && !r.chat && !r.away && !busy.has(r.job) && r.act !== 6 && r.act !== 9 && r.full > 22 && Math.hypot(r.x - lot.x, r.z - lot.z) < R)
      .map(r => ({ r, s: Math.hypot(r.x - lot.x, r.z - lot.z) - (this.has(r, 'curious') ? 8 : 0) - (this.has(r, 'brave') ? 3 : 0) + (this.has(r, 'timid') ? 5 : 0) })).sort((a, b) => a.s - b.s);
    const have = this.res.filter(r => r.job === 'gawk' && r.steps[1] && r.steps[1].lot === lot.id).length;
    for (const { r } of c.slice(0, Math.max(0, MAX_WATCH - have))) {
      this.finishTask(r); const a = Math.atan2(r.z - lot.z, r.x - lot.x) + this.rnd(-0.5, 0.5), rr = lot.r + 1.3 + this.rnd(0, 0.8);
      this.setSteps(r, [this.go(lot.x + Math.cos(a) * rr, lot.z + Math.sin(a) * rr), this.doo(0, 34, 'gawk', { lot: lot.id, face: [lot.x, lot.z] })], 'gawk', `跑去看天上掉下来的${ITEMS[lot.item].name}`);
      this.emo(r, EMO.Q, 4, { k: 'gawk', a: ITEMS[lot.item].name }); n++;
    }
    return n;
  };
  // why：冒这个气泡的真实原因 { k: 类型, a/b: 相关的东西或人的名字 }，点气泡看“心声”时据此说话
  P.emo = function (r, code, sec, why) { r.emo = code; r.emoT = sec; r.emoWhy = why || null; r.emote = Math.max(r.emote || 0, Math.min(sec, 2.5)); };
  P.watchers = function (lot) { return this.res.filter(r => r.job === 'gawk' && r.si === 1 && r.steps[1] && r.steps[1].lot === lot.id); };
  // 每秒：围观 → 商量 → 决定
  P.stepDrops = function () {
    const night = isNight(this.dayT());
    for (const lot of this.lots) {
      if (lot.stage !== 'landed' || lot.carry || lot.rescuer) continue; // 正被抱去躲雨：先别商量用途
      if (lot.hold) { if (Date.now() < lot.hold) continue; delete lot.hold; } // 教程里等着拼金圈：到点（真实 5 分钟）自动放开
      const w = this.watchers(lot); for (const r of w) { if (!lot.look.seen.includes(r.id)) { lot.look.seen.push(r.id); this.emo(r, this.rng() < 0.5 ? EMO.WOW : EMO.Q, 3, { k: 'gawk', a: ITEMS[lot.item].name }); } }
      if (night) continue;
      if (w.length < 2 && this.t - lot.look.sum > 25) this.summon(lot, this.t - lot.landT > 60 ? Math.max(80, Math.hypot(lot.x, lot.z) + 50) : LOOK_R + 12); // 放在花园外圈的：多等一会儿，镇上的都能听见
      if (w.length >= 2) lot.look.t2 += 1; else if (w.length === 1) lot.look.t2 += 0.4;
      if (lot.look.t2 >= 6 && !lot.look.talk) { lot.look.talk = 1; for (const r of w) this.emo(r, EMO.TALK, 5, { k: 'talk', a: ITEMS[lot.item].name, b: w.filter(o => o !== r).map(o => o.name).slice(0, 2).join('、') }); }
      const forced = this.t - lot.landT > DAY * 0.12 && lot.look.seen.length === 0;
      if (lot.look.t2 >= 12 || forced || (this.t - lot.landT > DAY * 0.08 && lot.look.seen.length)) this.decideDrop(lot, w);
    }
  };
  // ---------------------------------------------------------------- 商量用途
  P.useScore = function (lot, o, w) {
    const pop = this.res.length; const sd = streamDist(lot.x, lot.z); const nearWater = sd < 9; const plazaD = Math.hypot(lot.x, lot.z);
    const wsp = w.map(r => r.sp); let s = 0, why = '';
    if (o.water) { if (!nearWater) return { s: -99 }; s += 4.2; why = '它就在溪边'; }
    if (o.u === 'home') {
      const sp = o.sp || this.neediestSp(); if (!sp) return { s: -99 };
      const mine = this.res.filter(r => r.sp === sp); const homeless = mine.filter(r => r.home < 0).length; const inHut = mine.filter(r => { const h = this.lotById(r.home); return h && h.usp !== sp; }).length;
      const free = this.lots.filter(l => l.use === 'home' && l.usp === sp && l !== lot).reduce((a, l) => a + CAP[l.kind] - (l.done ? l.beds.length : 0), 0);
      s += homeless * 3 + inHut * 1.4 - free * 1.3 + (wsp.includes(sp) ? 1.2 : 0) + (this.townFull() ? -4 : 0) + (mine.length === 0 ? -0.5 : 0);
      if (this.tw.some(t => t.k === 'home' && t.sp === sp)) s += 3;
      why = why || (homeless ? `${SP_NAME[sp]}们还没有地方睡` : inHut ? `${SP_NAME[sp]}们还挤在别人家里` : `${SP_NAME[sp]}说想要个新家`);
      return { s, why, sp };
    }
    if (o.u === 'shop') {
      const same = this.lots.some(l => l.use === 'shop' && l.shop === o.shop && l !== lot);
      s += same || !this.shopRoom(o.shop) ? -5 : pop >= 6 ? 3.2 : 1.2; if (this.tw.some(t => (t.k === 'bakery' && o.shop === 'bakery') || (t.k === 'bath' && o.shop === 'bath'))) s += 3.5;
      if (o.shop === 'food' && wsp.some(sp => sp === 'bear' || sp === 'cat')) s += 0.6;
      return { s, why: why || `镇上还没有${SHOP[o.shop].name}` };
    }
    if (o.u === 'fac') {
      const same = this.lots.filter(l => l.use === 'fac' && l.fac === o.fac).length; s += 2.2 - same * 1.6;
      if (o.plaza) s += plazaD < 22 ? 1.4 : -0.8;
      const want = { play: 'play', lamp: 'lamp', stage: 'harvest', garden: 'flowers' }; for (const t of this.tw) if (want[o.fac] === t.k) s += 3;
      if (o.fac === 'play' && w.some(r => r.sp === 'dog' || this.has(r, 'curious'))) s += 0.8;
      if (o.fac === 'garden' && this.flowers.length) s += 0.8;
      return { s, why: why || ({ play: '小家伙们想要个玩的地方', table: '大家想有个坐下来聊天的地方', stage: '有人提议办个晚会', shed: '小材料没地方放', dock: '有了它就能下水了', well: '浇花要走好远去打水', flag: '想让远处的人也认得小镇', post: '想给大好人寄小纸条', bell: '想要一个报时的钟', lamp: '晚上路太黑了', garden: '想把花种得更多', school: '有人想听故事', train: '拖大物件太累了' })[o.fac] };
    }
    if (o.u === 'bridge') { if (!nearWater || this.bridges > 0 || streamSide(lot.x, lot.z) !== TOWN_SIDE) return { s: -99 }; s += 3 + (this.tw.some(t => t.k === 'bridge') ? 4 : 0); return { s, why: '大家一直想去小溪对岸看看' }; }
    if (o.u === 'mat') { const need = this.projects.some(p => p.stage === 'renovate' && this.stageMissing(this.lotById(p.lot)).includes(o.mat)); s += 0.6 + (need ? 2.8 : 0) + (this.has(w[0] || { traits: [] }, 'diligent') ? 0.5 : 0); return { s, why: need ? `正在盖的房子缺${MAT_NAME[o.mat]}` : '拆开来当材料最实在' }; }
    if (o.u === 'deco') return { s: 1.1 + (plazaD < 24 ? 0.5 : 0), why: why || '大家觉得它摆着就很好看' };
    return { s: -99 };
  };
  P.neediestSp = function () {
    let best = null; for (const sp of SPECIES) { const mine = this.res.filter(r => r.sp === sp); if (!mine.length) continue; const need = mine.filter(r => { const h = this.lotById(r.home); return !h || h.usp !== sp; }).length; if (need && (!best || need > best.n)) best = { sp, n: need }; }
    return best ? best.sp : null;
  };
  P.decideDrop = function (lot, w) {
    // 组合惊喜：附近还有一件刚落下的东西
    // 组合惊喜只在“放进金圈”时触发（dropItem 里，和放置模式画金圈用同一个 goldRings），这里不再按距离另判，免得金圈外也拼起来
    const it = ITEMS[lot.item]; let best = null;
    if (lot.pond) { // 放在水洼里：小池塘 / 澡堂 / 小船 / 码头
      for (const o of puddleUses(lot.item)) { const same = this.lots.filter(l => l !== lot && l.done && (l.fac === o.fac && o.fac || o.shop && l.shop === o.shop)).length; let s = o.fac === 'pond' ? 2.4 - same * 0.6 : o.fac === 'boat' ? 3.3 - same * 1.0 : o.fac === 'dock' ? 3.0 - same * 1.2 : this.shopRoom('bath') ? 3.4 : -5;
        s += this.rng() * 1.6; if (!best || s > best.s) best = { o, s, why: o.fac === 'pond' ? '水洼正好可以当个小池塘' : o.fac === 'boat' ? '它浮在水上，正好当船' : o.fac === 'dock' ? '架在水洼边当码头刚刚好' : '水洼里的水晒得暖暖的，正好泡澡' }; }
      return this.applyUse(lot, best.o, best.why, w, null);
    }
    const uses = lot.old && WORN[lot.item] ? WORN[lot.item].uses : it.uses; // 淋雨太久变旧了：能做的事也变了
    for (const o of uses) { const r = this.useScore(lot, o, w); if (r.s <= -50) continue; const s = r.s + this.rng() * 1.6; if (!best || s > best.s) best = { o, s, why: lot.old ? `它被雨泡旧了，${r.why}` : r.why, sp: r.sp }; }
    if (!best) best = { o: it.uses.find(u => u.u === 'deco') || { u: 'deco', name: `摆着的${it.name}` }, why: '大家觉得它摆着就很好看' };
    this.applyUse(lot, best.o, best.why, w, best.sp);
  };
  P.applyUse = function (lot, o, why, w, sp) {
    const it = ITEMS[lot.item]; this.lstats.decided++;
    const names = w.length ? w.map(r => r.name).join('、') : '路过的小动物';
    const dx = this.idex[lot.item] || (this.idex[lot.item] = { n: 1, day: this.day(), uses: [] }); if (!dx.uses.includes(o.name)) dx.uses.push(o.name);
    for (const r of w) { this.emo(r, EMO.WOW, 4, { k: 'made', a: it.name, b: o.name }); r.mood = Math.min(100, r.mood + 6); this.remember(r, `和大家把天上掉下来的${it.name}改成「${o.name}」`); }
    lot.look = null; lot.why = why;
    const twist = this.pick(['谁也没想到', '商量了好半天', '吵了一小会儿', '有人一拍脑袋', '大家围着转了三圈']);
    const head = `你放下的${lot.old && WORN[lot.item] ? WORN[lot.item].name : it.name}`;
    if (o.u === 'mat') {
      this.mats[o.mat] = Math.min(this.matCap(), (this.mats[o.mat] || 0) + o.n); this.lstats.mat++;
      this.lots = this.lots.filter(l => l !== lot); this.ver++;
      for (const r of w) this.finishTask(r);
      this.addCard('lenia', `${head}，被拆成了材料`, `${names}围着${it.name}转了好几圈。${twist}，${why}，就把它拆开，收进了材料堆：${o.name}（${MAT_NAME[o.mat]} +${o.n}）。`, w.slice(0, 4), [lot.x, lot.z]);
      return;
    }
    if (o.u === 'bridge') return this.startBridge(lot, o, why, w, head, names);
    lot.use = o.u === 'fac' ? 'fac' : o.u; lot.name = o.name; lot.fac = o.fac || null; lot.shop = o.shop || null; if (o.u === 'home') lot.usp = sp || o.sp;
    let moved = false;
    if ((o.u === 'home' || o.u === 'shop') && !lot.pond) {
      const fx = lot.x, fz = lot.z; lot.stage = 'pick';
      if (this.placeSite(lot, [fx, fz])) {
        const d = Math.hypot(lot.x - fx, lot.z - fz);
        if (d > 3) { moved = true; this.startHaul(lot, fx, fz, w); }
      } else { lot.x = fx; lot.z = fz; lot.node = -1; }
    }
    if (!moved && !lot.pond) { // 就地改造：按定下来的用途再查一次占地，挤了就往旁边挪一点（大家一起推过去）
      const ctx = this.fitCtx(); if (!this.lotFits(lot, lot.x, lot.z, lot.rot, ctx, true).ok) { const sp = this.nearFit(lot, lot.x, lot.z, { ctx }); if (sp) Object.assign(lot, { x: sp.x, z: sp.z, fx: sp.x, fz: sp.z, rot: sp.rot }); }
    }
    if (!moved) this.buildInPlace(lot, w);
    const where = moved ? `大家套上绳子，要把它拖到路边去` : '就地动手改';
    this.addCard('lenia', `${head}，被它们改成了「${o.name}」`, `${names}围着${it.name}转了好几圈。${twist}——${why}，所以决定把它改成「${o.name}」！${where}。`, w.slice(0, 4), [lot.x, lot.z]);
  };
  P.startHaul = function (lot, fx, fz, w) {
    lot.stage = 'haul'; const path = [[fx, fz]];
    for (const id of this.route(this.nearestNode(fx, fz), lot.node)) { const p = this.nodes[id]; path.push([p.x, p.z]); }
    path.push([lot.x, lot.z]); const p = this.makeProject(lot, path); p.yaw = lot.rot; this.projects.push(p); this.ver++;
    for (const r of w.slice(0, p.need)) this.joinHaul(r, p);
    for (const r of w.slice(p.need)) this.finishTask(r);
    return p;
  };
  P.buildInPlace = function (lot, w) {
    if ((lot.use !== 'home' && lot.use !== 'shop') || (lot.fast && Date.now() < lot.fast)) lot.paid = 3; // 教程加速的组合也不用小材料；设施、摆设、桥：不用小材料，干活就行
    lot.stage = 'renovate'; lot.prog = 0;
    if (lot.node < 0 || lot.node == null) { const c = Math.cos(lot.rot), s = Math.sin(lot.rot); const dl = this.K[lot.kind].door; lot.door = [lot.x + dl[0] * c + dl[1] * s, lot.z - dl[0] * s + dl[1] * c]; lot.node = -1; }
    const p = this.makeProject(lot, [[lot.x, lot.z], [lot.x, lot.z]]); p.stage = 'renovate'; p.yaw = lot.rot; p.cum = [0, 0]; this.projects.push(p); this.ver++;
    for (const r of w) { this.finishTask(r); if (lot.use === 'deco' && p.workers >= 2) continue; this.build(r, p); }
    return p;
  };
  P.startBridge = function (lot, o, why, w, head, names) {
    let bi = 1, bd = 1e9; STREAM.forEach((q, i) => { if (i < 1 || i >= STREAM.length - 1) return; const d = Math.hypot(q[0] - lot.x, q[1] - lot.z); if (d < bd) { bd = d; bi = i; } });
    const Pq = STREAM[bi], a = STREAM[bi - 1], b = STREAM[bi + 1]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz, nz = tx; const fx = lot.x, fz = lot.z;
    Object.assign(lot, { use: 'bridge', name: o.name, x: Pq[0], z: Pq[1], rot: Math.atan2(nx, nz), r: 2.2, paid: 3, prog: 0 });
    lot.bridgeEnds = [[Pq[0] + nx * 6.2, Pq[1] + nz * 6.2], [Pq[0] - nx * 6.2, Pq[1] - nz * 6.2]];
    if (streamSide(...lot.bridgeEnds[0]) !== TOWN_SIDE) lot.bridgeEnds.reverse();
    const e = lot.bridgeEnds[0]; lot.stage = 'haul';
    const p = this.makeProject(lot, [[fx, fz], [e[0], e[1]], [Pq[0], Pq[1]]]); p.yaw = lot.rot; this.projects.push(p); this.ver++;
    for (const r of w.slice(0, p.need)) this.joinHaul(r, p); for (const r of w.slice(p.need)) this.finishTask(r);
    this.addCard('lenia', `${head}，被它们改成了「${o.name}」`, `${names}比了比${ITEMS[lot.item].name}的长度，又比了比小溪的宽度——刚刚好！${why}，就把它架到溪上，当一座桥。`, w.slice(0, 4), [fx, fz]);
  };
  P.finishBridge = function (lot) {
    const [A, B] = lot.bridgeEnds; const na = this.addNode(A[0], A[1]), nb = this.addNode(B[0], B[1]);
    const near = this.nearestNode(A[0], A[1]); this.edges.push([near, na, 3], [na, nb, 0]); this.bridges++; this.graphDirty = true;
  };
  // 组合惊喜
  P.doCombo = function (a, b, c, w) {
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; const kind = c.base || 'combo_' + c.id;
    this.lots = this.lots.filter(l => l !== a && l !== b);
    const lot = this.newLot(kind); lot.item = 'combo'; lot.combo = c.id; lot.name = c.name; lot.use = c.u === 'fac' ? 'fac' : c.u; lot.fac = c.fac || null; lot.shop = c.shop || null;
    if (c.u === 'home') lot.usp = c.sp || this.neediestSp() || this.pick(SPECIES); // 家类组合：写明给哪种小动物住（没写就给最缺家的那种）
    Object.assign(lot, { x: mx, z: mz, fx: mx, fz: mz, rot: a.rot, node: -1, stage: 'pick' });
    // 两件合成一个整体（一个占地）：中点放得下就放中点，放不下就挪到最近的空地，绝不插进别人家里
    const sp = this.nearFit(lot, mx, mz) || this.nearFit(lot, a.x, a.z) || this.nearFit(lot, b.x, b.z, { maxD: 30 });
    if (sp) Object.assign(lot, { x: sp.x, z: sp.z, fx: sp.x, fz: sp.z, rot: sp.rot }); else { this.lots.push(a, b); this.nextLot--; return null; } // 实在没地方合成：各自按原样商量用途
    if (a.hold || b.hold) lot.fast = Date.now() + HOLD_MS; // 新手教程这一次组合：施工加速（临时字段，不进存档，到点失效），让玩家在十几秒里看到它落成
    this.lots.push(lot);
    const all = [...new Set([...w, ...this.watchers(b)])];
    if (lot.fast) { const free = this.res.filter(o => !all.includes(o) && !o.away && !o.haul && !o.dream && !['sleep', 'trip', 'camp', 'tend', 'build'].includes(o.job)).sort((p, q) => Math.hypot(p.x - lot.x, p.z - lot.z) - Math.hypot(q.x - lot.x, q.z - lot.z)); while (all.length < 4 && free.length) { const o = free.shift(); this.interrupt(o, '听说有新鲜事，跑去帮忙'); all.push(o); } } // 教程：不管离得多远、手头在忙什么，叫上最近的几位小动物跑来施工（它们小跑着赶来）
    const first = !this.cdex[c.id]; if (first) this.cdex[c.id] = { day: this.day() }; if (!this.recipes[c.id]) this.recipes[c.id] = { day: this.day(), from: 'made' }; this.lstats.combos++;
    for (const r of all) { this.emo(r, EMO.WOW, 5, { k: 'combo', a: ITEMS[c.a].name, b: ITEMS[c.b].name, c: c.name }); r.mood = Math.min(100, r.mood + 10); this.remember(r, `看见${ITEMS[c.a].name}和${ITEMS[c.b].name}变成了${c.name}`); }
    this.buildInPlace(lot, all);
    const names = all.length ? all.slice(0, 4).map(r => r.name).join('、') : '大家';
    this.addCard(first ? 'combo' : 'lenia', first ? `组合惊喜：${c.name}！` : `又一座${c.name}`, `你把${ITEMS[c.a].name}和${ITEMS[c.b].name}放在了一起。${names}看了半天，忽然有了主意：${c.story}`, all.slice(0, 4), [lot.x, lot.z]);
    return lot;
  };
  // ---------------------------------------------------------------- 施工牌：补材料 / 收回
  // 补材料：缺料停工时，把储物箱里能拆成缺的材料的小旧物直接拆了补上（一次补齐这一阶段缺的，不够就补多少算多少）
  P.siteFill = function (id) {
    const lot = this.lotById(id); const p = this.projects.find(q => q.id === id && q.stage === 'renovate');
    if (!lot || !p) return { ok: false, why: '这里没在施工' };
    const miss = this.siteMissing(lot); if (!miss.length) return { ok: false, why: '材料都齐了，不用补' };
    const cost = STAGE_COST[lot.paid] || {}; const used = [];
    for (const m of miss) while ((this.mats[m] || 0) < cost[m]) { const src = matSources(this.box, m)[0]; if (!src) break; const [k, n] = src;
      this.box[k]--; if (!this.box[k]) delete this.box[k]; this.mats[m] = (this.mats[m] || 0) + n; used.push([k, m, n]); }
    if (!used.length) return { ok: false, why: `储物箱里没有能拆成${miss.map(m => MAT_NAME[m]).join('、')}的小东西` };
    this.lstats.mat++; const left = this.siteMissing(lot);
    const txt = used.map(([k, m, n]) => `${ITEMS[k].name}（${MAT_NAME[m]} +${n}）`).join('、');
    return { ok: true, why: `拆了${txt}${left.length ? `，还差${left.map(m => MAT_NAME[m]).join('、')}` : `，${lot.name}可以接着盖了`}`, used, left };
  };
  // 能不能收回：只收你放下的东西，而且还没动工（刚放下 / 还在商量 / 要拖走但还没起步）
  P.recallable = function (lot) {
    if (!lot || !lot.item || lot.item === 'combo' || lot.done) return { ok: false, why: lot && lot.item === 'combo' ? '两件东西已经拼在一起了' : '这件不是你放下的' };
    if (lot.stage === 'landed' || lot.stage === 'pick') return { ok: true };
    const p = this.projects.find(q => q.id === lot.id);
    if (lot.stage === 'haul' && p && p.stage === 'gather' && p.s < 0.05) return { ok: true };
    return { ok: false, why: lot.stage === 'renovate' ? '已经开工啦' : '大家已经拖着它上路了' };
  };
  const RECALL_LINE = ['歪着头看它慢慢飞回天上：“诶？不要了吗……”', '冲着天上挥了挥爪子：“下次再来呀！”', '揉了揉眼睛：“刚才是做梦吗？”', '小声嘀咕：“我们还没商量完呢。”', '盯着空地看了好半天，又低头闻了闻：“还有一点点它的味道。”'];
  P.siteRecall = function (id) {
    const lot = this.lotById(id); const ck = this.recallable(lot); if (!ck.ok) return { ok: false, why: ck.why };
    const it = ITEMS[lot.item]; const w = lot.stage === 'landed' && lot.look ? this.watchers(lot) : [];
    const p = this.projects.find(q => q.id === lot.id);
    if (p) { for (const rid of p.team) { const r = this.rById(rid); if (r) this.leaveHaul(r, `${it.name}被收回去了`); } this.projects = this.projects.filter(q => q !== p); }
    if (lot.carry) { const r = this.rById(lot.carry); if (r) { this.finishTask(r); r.box = 0; } }
    for (const r of w) { this.finishTask(r); this.emo(r, EMO.Q, 4, { k: 'flyback', a: it.name }); }
    if (lot.pond && this.puddles) this.puddles.push({ id: this.puddleId++, x: lot.x, z: lot.z, r: lot.pond, t0: this.t, life: 1, until: this.t + DAY * 0.6 });
    this.lots = this.lots.filter(l => l !== lot); this.ver++;
    this.box[lot.item] = (this.box[lot.item] || 0) + 1;
    const near = w[0] || this.res.filter(r => !r.away && Math.hypot(r.x - lot.x, r.z - lot.z) < 26).sort((a, b) => Math.hypot(a.x - lot.x, a.z - lot.z) - Math.hypot(b.x - lot.x, b.z - lot.z))[0];
    const line = near ? `${near.name}${this.pick(RECALL_LINE)}` : '花园里静悄悄的，好像谁也没发现。';
    if (near) { this.emo(near, EMO.Q, 4, { k: 'flyback', a: it.name }); this.remember(near, `看见${it.name}又飞回了天上`); }
    this.addCard('lenia', `你把${it.name}收回了储物箱`, `你想了想，又把${it.name}轻轻收了回来。${line}`, near ? [near] : [], [lot.x, lot.z]);
    return { ok: true, why: line, item: lot.item, name: it.name, rid: near ? near.id : -1 };
  };
  // ---------------------------------------------------------------- 挪一挪 / 搬家（施工牌、设施卡、进屋界面的「挪一挪 / 搬家」）
  // 未开工：直接挪，围观的小家伙跟过去接着看；改造中：脚手架、已到的材料、进度一起挪；盖好的：算搬家，住户/店主先嘀咕一句，搬家期间不能进屋，屋里的东西照旧。
  const MOVE_SEC = 45;
  const MOVE_LINE = {
    home: [n => `又搬家啦？${n}里的火柴盒床可别摔了！`, n => `咦，${n}飞起来了！我窗台上的花盆……`, n => `慢一点慢一点，我的顶针凳要滚出去啦！`, n => `搬家啦！${n}要去新地方了，我先跟过去占个好位置。`],
    shop: [n => `${n}要搬走？客人的点心别打翻了！`, n => `店要换地方啦？那我先把招牌扶稳。`, n => `搬就搬吧，新地方客人能找到吗……`],
    shared: [n => `${n}要搬家啦？大家的东西都还在里面呢！`], shed: [n => `储物棚要搬走？材料可别撒一地。`],
    fac: [n => `${n}要换地方了？我还没玩够呢。`, n => `${n}飞起来了！大好人要把它放到哪儿去？`],
    deco: [n => `${n}要挪到哪儿去呀？我跟着看看。`],
  };
  P.moveWho = function (lot) { const ids = new Set([...(lot.beds || []), ...this.res.filter(r => r.owner === lot.id || r.home === lot.id).map(r => r.id)]); return this.res.filter(r => ids.has(r.id) && !r.away); };
  P.movePrep = function (id) { // 点了「搬家」：住户/店主先冒气泡嘀咕一句（位置还没变）
    const lot = this.lotById(id); const m = movable(lot); if (!m.ok) return m;
    if (!lot.done) return { ok: true, line: '', rid: -1 };
    let who = this.moveWho(lot).sort((a, b) => Math.hypot(a.x - lot.x, a.z - lot.z) - Math.hypot(b.x - lot.x, b.z - lot.z)); if (!who.length) who = this.res.filter(r => !r.away && r.act !== 6 && Math.hypot(r.x - lot.x, r.z - lot.z) < 22).sort((a, b) => Math.hypot(a.x - lot.x, a.z - lot.z) - Math.hypot(b.x - lot.x, b.z - lot.z)).slice(0, 1);
    const L = MOVE_LINE[lot.use] || MOVE_LINE.deco; const r0 = who[0]; const line = r0 ? L[(r0.id + this.day()) % L.length](lot.name) : '';
    who.forEach((r, i) => { this.emo(r, EMO.TALK, 7, { k: 'move', a: lot.name, b: i ? `${lot.name}要搬家了，我得跟着去帮忙。` : line }); this.remember(r, `${lot.name}要搬家了`); });
    return { ok: true, line, rid: r0 ? r0.id : -1, name: r0 ? r0.name : '', ids: who.map(r => r.id) };
  };
  P.moveLot = function (id, x, z, rot) {
    const lot = this.lotById(id); const chk = moveCheck(lot, x, z, rot, this.placeState()); if (!chk.ok) return chk;
    const ox = lot.x, oz = lot.z, wasDone = lot.done; const hadNode = lot.node >= 0;
    if (hadNode) { const old = lot.node; this.edges = this.edges.filter(e => !(e[2] === 2 && (e[0] === old || e[1] === old))); lot.node = -1; this.graphDirty = true; } // 拆掉旧门口的小径
    Object.assign(lot, { x, z, rot, fx: x, fz: z });
    if (hadNode) this.placeLot(lot, x, z, rot); // 新门口接一段小径到最近的路
    else if (lot.door || lot.stage === 'renovate' || lot.done) { const c = Math.cos(rot), sn = Math.sin(rot); const dl = this.K[lot.kind].door; lot.door = [x + dl[0] * c + dl[1] * sn, z - dl[0] * sn + dl[1] * c]; }
    const p = this.projects.find(q => q.lot === id);
    if (p) { p.path = [[x, z], [x, z]]; p.cum = [0, 0]; p.s = 0; p.x = x; p.z = z; p.yaw = rot; } // 改造中：工地（脚手架、材料堆、进度）跟着走
    const dx = x - ox, dz = z - oz; const who = [];
    for (const r of this.res) {
      if (r.away) continue;
      const st = r.steps[1];
      if (r.job === 'gawk' && st && st.lot === id) { const a = Math.atan2(r.z - oz, r.x - ox), rr = lot.r + 1.3 + this.rnd(0, 0.8); r.steps = [this.go(x + Math.cos(a) * rr, z + Math.sin(a) * rr), { ...st, face: [x, z] }]; r.si = 0; this.beginStep(r); r.doing = `跟着${lot.name}跑过去看`; this.emo(r, EMO.Q, 3, { k: 'gawk', a: lot.name }); who.push(r); continue; }
      if (p && (r.buildP === p.id || r.fetchP === p.id)) { const f = r.fetchP === p.id; if (!f) { this.finishTask(r); this.build(r, p); } else for (const q of r.steps) if (q.k === 'go' && Math.hypot(q.x - ox, q.z - oz) < lot.r * 1.6 + 1) { q.x += dx; q.z += dz; } who.push(r); continue; }
      if (this.inLot(r) === id) { if (lot.door) { r.x = lot.door[0]; r.z = lot.door[1]; } continue; } // 在屋里：跟着房子一起搬过去，屋里的东西照旧
      if (r.home === id || r.owner === id || (r.seat && r.seat[0] === id)) { if (r.act === ACT_WALK || r.seat) { this.finishTask(r); r.timer = 0.5; } }
    }
    if (wasDone) { lot.moving = this.t + MOVE_SEC; const ws = this.moveWho(lot); for (const r of ws) { r.doing = `跟着${lot.name}搬家`; this.remember(r, `${lot.name}搬到了新地方`); }
      this.lotEv(lot, '搬到了新地方'); this.addCard('lenia', `${lot.name}搬家啦`, `你轻轻拎起${lot.name}，换到了新的地方。${ws.length ? ws.map(r => r.name).slice(0, 3).join('、') + '跟在后面一路小跑，' : ''}屋里的东西一样也没少。`, ws.slice(0, 4), [x, z]); }
    this.ver++; this.lstats.moves = (this.lstats.moves || 0) + 1;
    return { ok: true, id, x, z, rot, done: wasDone, why: wasDone ? `${lot.name}搬好家了` : `${lot.name}挪到这儿了` };
  };
  // ---------------------------------------------------------------- 鸡块 / Lenia 的身影：点一下，附近的小家伙好奇地围过来看；偶尔（真实时间冷却）真的送来一件旧物或花种，走储物箱入库
  const MG_CD = { nugget: 8 * 60e3, lenia: 6 * 60e3 };
  P.gawkAt = function (x, z, k, a, n = 4) {
    if (isNight(this.dayT())) return [];
    const c = this.res.filter(r => !r.away && !r.haul && !r.chat && r.act !== 6 && r.act !== 9 && (!r.job || ['wander', 'plaza', 'visit', 'wait', 'gawkN', 'explore'].includes(r.job) || (r.job === 'gather' && !r.got && !r.carry)) && Math.hypot(r.x - x, r.z - z) < 36)
      .sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z)).slice(0, n);
    c.forEach((r, i) => { this.finishTask(r); const ang = Math.atan2(r.z - z, r.x - x) + (i - 1.5) * 0.35, rr = 2.4 + this.rnd(0, 0.8);
      this.setSteps(r, [this.go(x + Math.cos(ang) * rr, z + Math.sin(ang) * rr), this.doo(0, this.rnd(10, 16), 'gawkN', { face: [x, z] })], 'gawkN', k === 'nugget' ? '围着白团子看' : '抬头看大大的身影');
      this.emo(r, i % 2 ? EMO.WOW : EMO.Q, 4, { k, a }); this.remember(r, k === 'nugget' ? '围着一只白白软软的团子看了好一会儿' : '好像看见了大好人'); });
    return c.map(r => r.id);
  };
  P.mascotGift = function (who, x = 0, z = 0) {
    this.mg = this.mg || {}; const now = this.wall || 0; const ids = this.gawkAt(x, z, who, who === 'nugget' ? '蹦蹦跳跳' : '身影');
    if (this.mg[who] && now - this.mg[who] < MG_CD[who]) return { ok: false, gift: null, ids };
    if (this.rng() > 0.7) { this.mg[who] = now - MG_CD[who] * 0.6; return { ok: false, gift: null, ids }; } // 这次没带东西，过一小会儿再看
    this.mg[who] = now; const season = calendar(this.t).season;
    if (this.rng() < 0.5) { const ks = Object.keys(SEEDS).filter(k => !SEEDS[k].rare); const k = ks[Math.floor(this.rng() * ks.length)]; this.seeds[k] = (this.seeds[k] || 0) + 2;
      return { ok: true, gift: { seed: k, n: 2, name: `${SEEDS[k].name}花种 ×2` }, ids }; }
    const pool = ITEM_KEYS.filter(k => ITEMS[k].size !== 'big' && inSeason(k, season)); const k = pool[Math.floor(this.rng() * pool.length)];
    this.giveItem(k, 1, who); return { ok: true, gift: { item: k, n: 1, name: ITEMS[k].name }, ids };
  };
  // 改造完成后（sim-core.finishLot 调用）
  P.leniaFinish = function (lot) {
    if (lot.use === 'bridge') this.finishBridge(lot);
    if (lot.fac === 'garden') for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4, rr = lot.r + 1.2; this.addFlower(lot.x + Math.cos(a) * rr, lot.z + Math.sin(a) * rr, k % 2 ? 'tulip' : 'daisy', 0.4, true); }
    const ppl = this.res.filter(r => r.builtOn === lot.id || lot.beds.includes(r.id) || r.owner === lot.id);
    if (lot.use === 'fac' || lot.use === 'deco' || lot.use === 'bridge') {
      const fx = lot.fac ? FAC[lot.fac].fx : ''; const who = ppl.slice(0, 3);
      this.addCard('lenia', `${lot.name}弄好了`, lot.use === 'bridge' ? `${lot.name}架好了，${who.map(r => r.name).join('、') || '大家'}第一个走过去，在对岸的草地上打了个滚。从此小溪对岸也能放东西了。` : `${who.map(r => r.name).join('、') || '大家'}忙完最后一下，${lot.name}弄好了。${fx ? fx + '。' : ''}`, who, [lot.x, lot.z]);
    }
    if (!this.lstats.firstDone && lot.item) this.lstats.firstDone = { day: this.day(), name: lot.name, item: lot.item === 'combo' ? '' : ITEMS[lot.item].name }; // 第一次改造完成：Lenia 会说一句
    const thank = ppl[0] || this.pick(this.res); if (thank && lot.item)this.giftQ.push({ t: this.t + DAY * this.rnd(0.08, 0.25), rid: thank.id, kind: 'thanks', item: lot.item === 'combo' ? '礼物' : ITEMS[lot.item].name, what: lot.name });
  };
  // ---------------------------------------------------------------- 设施、花园、回礼、愿望（每秒）
  P.facs = function (f) { return this.lots.filter(l => l.done && l.use === 'fac' && (!f || l.fac === f)); };
  P.hasFac = function (f) { return this.lots.some(l => l.done && l.use === 'fac' && l.fac === f); };
  P.stepLenia = function () {
    this.stepDrops();
    for (const l of this.lots) if (l.moving && this.t > l.moving) { delete l.moving; this.ver++; } // 搬家落好了：又能进屋了
    const night = isNight(this.dayT()); const fac = this.facs(); const bloom = this.flowers.filter(f => f.g >= 1);
    // 设施和开着的花让附近居民开心
    if (fac.length || bloom.length) for (const r of this.res) {
      if (r.act === 9) continue; let m = 0;
      for (const l of fac) { const d = Math.hypot(r.x - l.x, r.z - l.z); if (d < 10) m += (l.fac === 'lamp' && night ? 0.06 : 0.025); }
      for (const f of bloom) if (Math.abs(r.x - f.x) < 6 && Math.abs(r.z - f.z) < 6) m += 0.008;
      if (m) r.mood = Math.min(100, r.mood + Math.min(0.12, m) / TIME_K * 2.5);
    }
    if (this.hasFac('dock')) for (const s of this.rsc) if (s.type === 'fish') s.stock = Math.min(s.max, s.stock + 0.04);
    // 花：浇过水才长，水慢慢干
    const fast = this.facs().filter(l => l.fac === 'garden' || l.fac === 'well');
    for (const f of this.flowers) {
      if (f.w > 0 && f.g < 1) { let k = 1; for (const l of fast) if (Math.hypot(l.x - f.x, l.z - f.z) < 14) k = 1.6; const st0 = Math.floor(f.g * 3); f.g = Math.min(1, f.g + k / (FLOWER_DAY * DAY)); if (Math.floor(f.g * 3) !== st0) { this.ver++; if (f.g >= 1) this.lstats.bloomed++; } }
      f.w = Math.max(0, f.w - 1 / (DAY * 0.7));
      if (f.w <= 0 && !f.rain && this.rng() < 0.0006) f.w = 0.6; // 偶尔下点小雨，没人浇也会慢慢长
    }
    // 回礼
    for (const q of this.giftQ) if (this.t >= q.t) { q.done = 1; const r = this.rById(q.rid); if (r) this.addGift(r, q.kind === 'thanks' ? 'note' : this.pick(['pebble', 'leafpack']), { kind: q.kind, item: q.item, what: q.what, wish: q.wish }); }
    this.giftQ = this.giftQ.filter(q => !q.done);
    if (this.t >= this.nextDaily) {
      this.nextDaily += DAY; const avg = this.res.reduce((a, r) => a + r.mood, 0) / this.res.length;
      let n = 1 + (avg > 62 ? 1 : 0) + (this.hasFac('post') ? 1 : 0);
      const happy = this.res.filter(r => r.mood > 50); for (let i = 0; i < n && happy.length; i++) {
        const r = this.pick(happy); const t = bloom.length >= 3 && this.rng() < 0.5 ? 'wreath' : this.pick(['pebble', 'leafpack', 'acorn', 'feather', 'note']);
        this.addGift(r, t, { kind: t === 'wreath' ? 'flower' : 'daily', flower: bloom.length ? SEEDS[this.pick(bloom).k].name : '雏菊' });
      }
    }
    // 阁楼里又翻出了东西（时间推移解锁）
    if (this.t >= this.nextAttic) {
      this.nextAttic = this.t + DAY * this.rnd(1.3, 1.9);
      const season = calendar(this.t).season; const ok = (k) => inSeason(k, season);
      const locked = ITEM_KEYS.filter(k => !this.unlocked.includes(k) && ok(k)).sort((a, b) => ITEMS[a].cost - ITEMS[b].cost); const seasonal = ITEM_KEYS.filter(k => ITEMS[k].season === season);
      const k = seasonal.length && this.rng() < 0.3 ? this.pick(seasonal) : locked.length && this.rng() < 0.6 ? locked[Math.floor(this.rng() * Math.min(3, locked.length))] : this.pick(this.unlocked.filter(ok));
      this.giveItem(k, 1, 'attic');
    }
    if (((this._lsec = (this._lsec || 0) + 1) % 4) === 0) this.checkTownWishes();
  };
  P.giveItem = function (k, n, why) {
    const first = !this.unlocked.includes(k); if (first) this.unlocked.push(k); this.box[k] = (this.box[k] || 0) + n; this.lstats.unlocks++;
    const sn = SEASON_NAME[calendar(this.t).season];
    const txt = { attic: `Lenia 在她家阁楼里翻了翻，又找到了${n > 1 ? n + '个' : '一个'}${ITEMS[k].name}，交给了你。`, wish: `小镇的愿望实现了，Lenia 想起家里储物间还有${ITEMS[k].name}，拿来交给了你。`, heart: `窗台上的回礼攒够了心意，Lenia 从柜子深处翻出了${ITEMS[k].name}，塞到你手里。`, nugget: `鸡块蹦蹦跳跳地跑过来，从怀里掏出一个${ITEMS[k].name}，说是 Lenia 让它送来的。`, lenia: `Lenia 悄悄把一个${ITEMS[k].name}塞给了你：“放进花园试试？”`, season: `${sn}天到了，你和 Lenia 在阁楼里翻出了${ITEMS[k].name}——这是只有${sn}天才找得到的东西。`, trip: `远行小队带回来一个${ITEMS[k].name}，放进了储物箱。` }[why] || '';
    this.notices.push({ t: this.t, text: txt + (first ? '（新旧物）' : ''), item: k });
    if (this.notices.length > 6) this.notices.shift();
  };
  P.addGift = function (r, type, ctx = {}) {
    if (this.sill.length >= MAX_SILL) return null;
    const g = { id: this.giftId++, type, rid: r.id, name: r.name, sp: r.sp, day: this.day(), hm: hm(this.dayT()), heart: GIFTS[type].heart };
    const nk = ctx.kind === 'thanks' ? 'thanks' : ctx.kind === 'wish' ? 'wish' : type === 'wreath' ? 'flower' : 'daily';
    g.text = noteText(nk, { n: r.name, item: ctx.item, what: ctx.what, flower: ctx.flower || '雏菊', wish: ctx.wish, seed: Math.floor(this.rng() * 1e6) });
    this.sill.push(g); this.lstats.gifts++; this.remember(r, `在大好人的窗台上留了${GIFTS[type].name}`); return g;
  };
  P.takeGift = function (id) {
    const list = id === 'all' ? this.sill.slice() : this.sill.filter(g => g.id === id); let h = 0;
    for (const g of list) { h += g.heart; this.lstats.giftsTaken++; }
    this.sill = this.sill.filter(g => !list.includes(g)); this.heart += h; return { ok: true, heart: h, n: list.length };
  };
  P.itemPrice = function (k) { return Math.max(3, ITEMS[k].cost * 2) + 2 * ((this.bought || {})[k] || 0); };
  P.unlockItem = function (k) {
    const it = ITEMS[k]; if (!it) return { ok: false, why: '没有这件东西' }; const cost = this.itemPrice(k);
    if (!this.unlocked.includes(k) && !inSeason(k, calendar(this.t).season)) return { ok: false, why: `${it.name}要到${SEASON_NAME[it.season]}天才找得到` };
    if (this.heart < cost) return { ok: false, why: `心意不够（要 ${cost}）` };
    this.heart -= cost; this.bought = this.bought || {}; this.bought[k] = (this.bought[k] || 0) + 1; this.giveItem(k, 1, 'heart'); return { ok: true, why: `找到了${it.name}` };
  };
  P.buySeed = function (k) { const s = SEEDS[k]; if (!s) return { ok: false }; const cost = Math.max(1, s.cost); if (this.heart < cost) return { ok: false, why: `心意不够（要 ${cost}）` }; this.heart -= cost; this.seeds[k] = (this.seeds[k] || 0) + 3; return { ok: true, why: `${s.name}种子 +3` }; };
  P.addFlower = function (x, z, k, g = 0, free = false) {
    if (this.flowers.length >= MAX_FLOWERS) return { ok: false, why: '花园里已经种满了' };
    if (!free) { if (!(this.seeds[k] > 0)) return { ok: false, why: '没有这种花种了' }; const c = placeCheck(x, z, 0.4, this.placeState(), 'flower'); if (!c.ok) return c; this.seeds[k]--; if (!this.seeds[k]) delete this.seeds[k]; this.lstats.planted++; }
    const f = { id: this.flowerId++, x, z, k, g, w: free ? 1 : 0.5 }; this.flowers.push(f); this.ver++; return { ok: true, id: f.id };
  };
  P.waterAt = function (x, z, R = 4) { let n = 0; for (const f of this.flowers) if (Math.hypot(f.x - x, f.z - z) < R) { f.w = 1; n++; } if (n) this.lstats.watered++; return { ok: n > 0, n, why: n ? `浇了 ${n} 棵花` : '这附近没有花' }; };
  // ---------------------------------------------------------------- 小镇愿望
  P.addTownWish = function (k) {
    const w = { k, day: this.day(), t0: this.t };
    if (k === 'home') { const sp = this.neediestSp() || this.pick(SPECIES); w.sp = sp; }
    w.c0 = this.lstats.combos;
    this.tw.push(w); return w;
  };
  P.twProgress = function (w) {
    const done = (f) => this.lots.some(l => l.done && f(l)); const doing = (f) => this.lots.some(l => !l.done && l.stage !== 'landed' && f(l));
    const bloom = this.flowers.filter(f => f.g >= 1).length;
    switch (w.k) {
      case 'bakery': return done(l => l.shop === 'bakery') ? 1 : doing(l => l.shop === 'bakery') ? 0.6 : this.lots.some(l => (l.item === 'cookietin' || l.item === 'toaster') && l.stage === 'landed') ? 0.25 : 0;
      case 'flowers': return Math.min(1, bloom / 6);
      case 'play': return done(l => l.fac === 'play') ? 1 : doing(l => l.fac === 'play') ? 0.6 : 0;
      case 'bridge': return this.bridges > 0 ? 1 : doing(l => l.use === 'bridge') ? 0.6 : 0;
      case 'home': return done(l => l.use === 'home' && l.usp === w.sp) ? 1 : doing(l => l.use === 'home' && l.usp === w.sp) ? 0.6 : 0;
      case 'harvest': return Math.min(1, bloom / 8) * 0.6 + (done(l => l.fac === 'stage' || (l.item === 'pumpkin' && l.fac === 'lamp')) ? 0.4 : 0);
      case 'kite': return done(l => l.item === 'kite') ? 1 : this.lots.some(l => l.item === 'kite' && l.stage !== 'landed') ? 0.7 : this.lots.some(l => l.item === 'kite') ? 0.3 : 0;
      case 'firefly': return done(l => l.fac === 'lamp' || ['strawhat', 'shell', 'popsicle'].includes(l.item)) ? 1 : doing(l => l.fac === 'lamp' || ['strawhat', 'shell', 'popsicle'].includes(l.item)) ? 0.6 : 0;
      case 'snowlamp': return Math.min(1, (this.snowmen || []).length / 2) * 0.5 + (this.lots.some(l => ['mittens', 'beanie', 'hotbottle', 'jinglebell'].includes(l.item) && l.stage !== 'landed') ? 0.5 : 0);
      case 'lamp': return done(l => l.fac === 'lamp') ? 1 : doing(l => l.fac === 'lamp') ? 0.6 : 0;
      case 'bath': return done(l => l.shop === 'bath') ? 1 : doing(l => l.shop === 'bath') ? 0.6 : 0;
      case 'combo': return this.lstats.combos > (w.c0 || 0) ? 1 : 0;
    }
    return 0;
  };
  P.twTitle = function (w) { const T = TOWN_WISHES[w.k]; return w.k === 'home' ? `${SP_NAME[w.sp]}们${T.title}` : T.title; };
  P.checkTownWishes = function () {
    for (const w of this.tw) {
      w.p = this.twProgress(w); if (w.p < 1) continue;
      w.done = true; const T = TOWN_WISHES[w.k]; const R = T.reward; this.lstats.twDone++;
      this.twDone.unshift({ k: w.k, sp: w.sp, title: this.twTitle(w), day: this.day(), year: calendar(this.t).year }); if (this.twDone.length > 20) this.twDone.length = 20;
      if (R.heart) this.heart += R.heart; for (const k in R.item || {}) this.giveItem(k, R.item[k], 'wish'); for (const k in R.seeds || {}) this.seeds[k] = (this.seeds[k] || 0) + R.seeds[k];
      for (const r of this.res) { r.mood = Math.min(100, r.mood + 8); }
      const sp = w.sp || T.who; const who = this.res.filter(r => !sp || r.sp === sp).slice(0, 3);
      if (w.k === 'harvest') { for (const r of this.res) r.mood = Math.min(100, r.mood + 10); this.addCard('twish', '丰收节准备好了！', `花开满了小镇，舞台也搭好了。${this.res.slice(0, 4).map(r => r.name).join('、')}在舞台前排练了一整个傍晚，就等丰收节那天了。有人说，一定是大好人在帮我们。`, this.res.slice(0, 4), [0, 0]); }
      else this.addCard('twish', `小镇愿望实现：${this.twTitle(w)}`, `${who.map(r => r.name).join('、') || '大家'}高兴得跑来跑去。他们不知道是谁帮的忙，只说要去谢谢「大好人」。`, who, [0, 0]);
      const g = who[0] || this.pick(this.res); if (g) this.giftQ.push({ t: this.t + DAY * 0.05, rid: g.id, kind: 'wish', wish: this.twTitle(w) });
    }
    this.tw = this.tw.filter(w => !w.done);
    const cap = this.day() <= 2 ? 3 : 4;
    while (this.tw.length < cap) {
      const k = WISH_ORDER.find(k => !TOWN_WISHES[k].season && !this.tw.some(w => w.k === k) && (!this.twDone.some(d => d.k === k) || k === 'home'));
      if (!k || (k === 'home' && !this.neediestSp())) break; this.addTownWish(k);
      if (k === 'home') break;
    }
  };
  // ---------------------------------------------------------------- 输出 / 存档
  P.leniaInfo = function () {
    return { price: Object.fromEntries(ITEM_KEYS.map(k => [k, this.itemPrice(k)])), box: { ...this.box }, unlocked: this.unlocked.slice(), seeds: { ...this.seeds }, heart: this.heart, sill: this.sill.slice(), idex: this.idex, cdex: this.cdex, recipes: this.recipes, lstats: { ...this.lstats }, bridges: this.bridges,
      flowers: { n: this.flowers.length, bloom: this.flowers.filter(f => f.g >= 1).length, dry: this.flowers.filter(f => f.g < 1 && f.w <= 0).length },
      tw: this.tw.map(w => ({ items: TOWN_WISHES[w.k].items, k: w.k, sp: w.sp || null, title: this.twTitle(w), need: TOWN_WISHES[w.k].need, say: TOWN_WISHES[w.k].say.replace('{sp}', w.sp ? SP_NAME[w.sp] : '小动物'), who: w.sp || TOWN_WISHES[w.k].who, p: w.p ?? this.twProgress(w), day: w.day, reward: TOWN_WISHES[w.k].reward })), twDone: this.twDone.slice(0, 8), notices: this.notices.slice(),
      landed: this.lots.filter(l => l.stage === 'landed').map(l => ({ id: l.id, item: l.item, x: l.x, z: l.z, look: l.look ? l.look.seen.length : 0, who: l.look ? this.watchers(l).map(r => r.id) : [], talk: l.look ? Math.min(1, l.look.t2 / 12) : 0, old: !!l.old })) };
  };
  P.leniaSave = function () {
    const R2 = (v) => Math.round(v * 100) / 100;
    return { box: this.box, un: this.unlocked, se: this.seeds, he: this.heart, si: this.sill, gi: this.giftId, fl: this.flowers.map(f => [f.id, R2(f.x), R2(f.z), f.k, R2(f.g), R2(f.w)]), fi: this.flowerId, tw: this.tw, twd: this.twDone, id: this.idex, cd: this.cdex, rc: this.recipes, gq: this.giftQ, nd: R2(this.nextDaily), na: R2(this.nextAttic), br: this.bridges, ls: this.lstats, bo: this.bought || {}, mg: this.mg || {} };
  };
  P.leniaLoad = function (L) {
    this.leniaFresh(); if (!L) return;
    Object.assign(this, { box: L.box || {}, unlocked: L.un || [...START_UNLOCK], seeds: L.se || {}, heart: L.he || 0, sill: L.si || [], giftId: L.gi || 1, flowerId: L.fi || 1, tw: L.tw || this.tw, twDone: L.twd || [], idex: L.id || {}, cdex: L.cd || {}, giftQ: L.gq || [], nextDaily: L.nd ?? this.nextDaily, nextAttic: L.na ?? this.nextAttic, bridges: L.br || 0, lstats: { ...this.lstats, ...(L.ls || {}) }, bought: L.bo || {}, mg: L.mg || {} });
    this.flowers = (L.fl || []).map(a => ({ id: a[0], x: a[1], z: a[2], k: a[3], g: a[4], w: a[5] }));
    // 配方：旧档（没有 rc）由已拼出过的组合 + 茶壶毛线球补齐，不补发别的；新档保留存下来的，再把拼出过的并进去
    this.recipes = L.rc ? { ...L.rc } : Object.fromEntries(RECIPE_START.map(id => [id, { day: 0, from: 'start' }]));
    for (const id in this.cdex) if (!this.recipes[id]) this.recipes[id] = { day: this.cdex[id].day || 0, from: 'made' };
    if (!this.lstats.firstDone && (this.lots || []).some(l => l.done && l.item)) this.lstats.firstDone = { day: 0, name: '', item: '' }; // 旧存档：早就改造过了，不再算“第一次”
  };
}
export { ITEMS, ITEM_TEAM, TEMPLATE_OF };
