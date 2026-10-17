// 季节、天气、节日、远行的模拟部分（挂到 Sim 原型上，和 lenia.js 一样）：
// 天气按季节随机、持续半天到一天；下雨时露天还没改造的旧物会受潮、太久会变旧，居民自发把东西搬到屋檐下或盖上叶子；
// 雨后的水洼可以放东西；雪天地面积白、居民堆雪人；每季一个节日；远行小队按真实时间离开（离线也算），回来时按时长、行囊和性格生成游记。
import { DAY, TAU, clamp, isNight, hm, SP_NAME, EDGE_R, GATES, PLAZA_R } from '../shared/layout.js';
import { ITEMS, COMBOS, WORN, placeCheck, SEEDS, inSeason, TOWN_WISHES } from '../shared/items.js';
import { footOf } from '../shared/footprint.js';
import { SEASONS, SEASON_NAME, calendar, WEATHERS, WX_P, WX_DUR, WX_NAME, DAMP_RATE, FESTIVALS, FEST_DAY, SEASON_TEXT, DAMP_SPEED, OLD_AFTER, PUDDLE_MAX, YEAR_DAYS } from '../shared/seasons.js';
import { DESTS, DEST_KEYS, packOf, tripHours, writeJourney, TRIP_CD_H, WET_DEST, recipePick, recipeChance, RECIPE_SEEN } from '../shared/journey.js';

const A = { IDLE: 0, WALK: 1, GATHER: 2, BUILD: 8, INSIDE: 9, SLEEP: 6 };
export const SEASON_ITEMS = Object.fromEntries(SEASONS.map(s => [s, Object.keys(ITEMS).filter(k => ITEMS[k].season === s)]));
const FREE_JOBS = new Set(['wander', 'plaza', 'visit', 'wait', 'gawk', 'fac', '']);

export function installSeasons(Sim) {
  const P = Sim.prototype;
  P.seasonFresh = function () {
    const c = calendar(this.t);
    this.wx = { k: 'sun', until: this.t + DAY * 0.55, t0: this.t, n: 0 };
    this.cover = 0; this.wet = 0; this.rainT = 0; this.puddles = []; this.puddleId = 1; this.snowmen = []; this.snowId = 1;
    this.fest = null; this.festDone = {}; this.seasonKey = ''; // 第一秒触发“换季”：给这个季节的旧物、愿望和一张故事卡
    this.exp = null; this.expN = 0; this.expDone = 0; this.expCD = 0; this.letters = [];
    this.wstats = { wx: {}, sw: {}, inside: {}, fests: [], seasons: [], rescues: 0, worn: 0, snowmen: 0, trips: 0, puddleUses: 0 };
    this.wall = this.wall || 0;
  };
  P.cal = function () { return calendar(this.t); };
  // ---------------------------------------------------------------- 每秒
  P.stepWorld = function () {
    const c = calendar(this.t); const key = `${c.year}-${c.season}`;
    if (key !== this.seasonKey) { this.seasonKey = key; this.onSeason(c); }
    if (this.t >= this.wx.until) this.nextWeather(c);
    const k = this.wx.k, rain = k === 'rain', snow = k === 'snow';
    // 统计（天气比例、雨天/晴天待在屋里的比例）
    const W = this.wstats; W.wx[k] = (W.wx[k] || 0) + 1; const sw = W.sw[c.season] || (W.sw[c.season] = {}); sw[k] = (sw[k] || 0) + 1;
    const dT = this.dayT(); this._wcnt = ((this._wcnt || 0) + 1) % 20;
    if (dT > 0.3 && dT < 0.8 && this._wcnt === 0) { const s = W.inside[k] || (W.inside[k] = [0, 0]); for (const r of this.res) { if (r.away) continue; s[1]++; if (r.act === A.INSIDE || r.job === 'shop' || r.job === 'tend') s[0]++; } }
    // 地面：积雪、湿润
    const sunny = k === 'sun';
    if (snow) this.cover = Math.min(1, this.cover + 1 / (DAY * 0.3));
    else this.cover = Math.max(0, this.cover - 1 / (DAY * (c.season === 'winter' ? (sunny ? 0.7 : 1.4) : 0.12)));
    if (rain) this.wet = Math.min(1, this.wet + 1 / (DAY * 0.04)); else this.wet = Math.max(0, this.wet - 1 / (DAY * (sunny ? 0.18 : 0.3)));
    // 花：下雨天自己就浇上了
    if (rain) for (const f of this.flowers) f.w = 1;
    this.stepPuddles(rain);
    this.stepDamp(rain, snow);
    if ((this._wsec = ((this._wsec || 0) + 1) % 2) === 0) this.rescueTick(rain || snow);
    this.stepSnowmen();
    this.stepFest(c);
    this.stepTrip();
  };
  P.nextWeather = function (c, force = null) {
    const prev = this.wx.k; const p = { ...WX_P[c.season] };
    const festDay = c.sday === FEST_DAY || (c.sday === FEST_DAY - 1 && this.dayT() > 0.6);
    if (festDay) { if (c.season === 'winter') { p.rain = 0; p.snow = (p.snow || 0) * 2; } else { p.rain = 0; p.sun *= 1.5; } }
    if ((prev === 'rain' || prev === 'snow') && (this.wx.n || 0) >= 1) { p[prev] *= 0.35; } // 不要一连下好几场
    let k = force; if (!k) { let tot = 0; for (const w in p) tot += p[w]; let x = this.rng() * tot; k = 'sun'; for (const w in p) { x -= p[w]; if (x <= 0) { k = w; break; } } }
    if (k === 'snow' && c.season !== 'winter') k = 'cloud';
    const n = k === prev ? (this.wx.n || 0) + 1 : 0;
    this.wx = { k, until: this.t + DAY * this.rnd(WX_DUR[0], WX_DUR[1]), t0: this.t, n };
    if (k !== prev) { this.log.push(`天气变了：${WX_NAME[k]}`); this.ver++; }
    if (k === 'snow' && prev !== 'snow' && !this.snowCardDay) { this.snowCardDay = this.day(); const who = this.pickFree(2); if (who.length) this.addCard('weather', '下雪啦', `天上飘起了雪花。${who.map(r => r.name).join('和')}仰着头，张大嘴巴去接雪花，接到一片就欢呼一声。`, who, [who[0].x, who[0].z]); }
  };
  P.pickFree = function (n, f = null) { const c = this.res.filter(r => !r.away && !r.haul && r.act !== A.SLEEP && !(r.act === A.INSIDE && r.job === 'sleep') && (!f || f(r))); const out = []; while (c.length && out.length < n) out.push(c.splice(Math.floor(this.rng() * c.length), 1)[0]); return out; };
  // ---------------------------------------------------------------- 换季
  P.onSeason = function (c) {
    this.wstats.seasons.push(c.season);
    if (this.wx.k === 'snow' && c.season !== 'winter') this.nextWeather(c);
    this.snowCardDay = 0;
    // 换季的小故事
    const who = this.pickFree(2); this.addCard('season', `${SEASON_NAME[c.season]}天来了`, SEASON_TEXT[c.season](who.length ? who.map(r => r.name).join('和') : '大家'), who, null);
    // 季节旧物：阁楼里翻出一件这个季节的东西（新季节第一件优先没见过的）
    const list = SEASON_ITEMS[c.season]; const fresh = list.filter(k => !this.unlocked.includes(k)); const k = fresh.length ? fresh[0] : this.pick(list);
    if (k) this.giveItem(k, 1, 'season');
    // 季节愿望：上一季没实现的收起来；这一季的挂上去（今年还没实现过）
    this.tw = this.tw.filter(w => !TOWN_WISHES[w.k].season || TOWN_WISHES[w.k].season === c.season);
    for (const wk in TOWN_WISHES) { const T = TOWN_WISHES[wk]; if (T.season !== c.season || this.tw.some(w => w.k === wk)) continue; if (this.twDone.some(d => d.k === wk && d.year === c.year)) continue; const w = this.addTownWish(wk); this.tw.unshift(this.tw.pop()); w.year = c.year; }
    this.ver++;
  };
  // ---------------------------------------------------------------- 水洼：下雨一阵子后冒出来，雨停后留一段时间慢慢干掉
  P.stepPuddles = function (rain) {
    if (rain) {
      this.rainT += 1;
      if (this.rainT > DAY * 0.06 && this.puddles.length < PUDDLE_MAX && this.rng() < 0.012) this.spawnPuddle();
      for (const p of this.puddles) p.until = Math.max(p.until, this.t + DAY * p.life);
    } else this.rainT = 0;
    const n = this.puddles.length;
    this.puddles = this.puddles.filter(p => this.t < p.until && !this.lots.some(l => l.stage !== 'far' && l.stage !== 'landed' && Math.hypot(l.x - p.x, l.z - p.z) < l.r + p.r * 0.6));
    if (this.puddles.length !== n) this.ver++;
  };
  P.spawnPuddle = function () {
    const st = this.placeState(); st.puddles = [];
    for (let g = 0; g < 40; g++) {
      const a = this.rnd(0, TAU), d = this.rnd(PLAZA_R + 5, 44); const x = Math.cos(a) * d, z = Math.sin(a) * d; const r = this.rnd(1.9, 2.9);
      if (!placeCheck(x, z, r + 0.4, st).ok) continue; if (this.puddles.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r + 3)) continue;
      if (this.flowers.some(f => Math.hypot(f.x - x, f.z - z) < r + 0.5)) continue;
      const life = this.rnd(1.0, 1.6); this.puddles.push({ id: this.puddleId++, x, z, r, t0: this.t, life, until: this.t + DAY * life }); this.ver++; return;
    }
  };
  P.puddleAt = function (x, z) { return this.puddles.find(p => Math.hypot(x - p.x, z - p.z) < p.r + 0.3) || null; };
  // ---------------------------------------------------------------- 受潮、变旧
  P.dampable = function (l) { if (!l.item || l.item === 'combo' || l.done || l.cover || l.pond || l.stage === 'far' || l.carry) return 0; const it = ITEMS[l.item]; return it ? (DAMP_RATE[it.mat] || 0) : 0; };
  P.stepDamp = function (rain, snow) {
    const k = this.wx.k;
    for (const l of this.lots) {
      const rate = this.dampable(l); if (!rate) continue; const q0 = Math.floor((l.damp || 0) * 4);
      if (rain || snow) { l.damp = Math.min(1, (l.damp || 0) + rate * (snow ? 0.4 : 1) / (DAY * DAMP_SPEED)); if (l.damp >= 1 && !l.old) { l.oldT = (l.oldT || 0) + 1; if (l.oldT > DAY * OLD_AFTER) this.wearOut(l); } }
      else if (l.damp && !l.old) { l.damp = Math.max(0, l.damp - 1 / (DAY * (k === 'sun' ? 0.15 : 0.3))); if (!l.damp) l.oldT = 0; }
      if (Math.floor((l.damp || 0) * 4) !== q0) this.ver++;
    }
  };
  P.wearOut = function (l) {
    const it = ITEMS[l.item]; const W = WORN[l.item]; l.old = true; l.damp = 1; this.ver++; this.wstats.worn++;
    const nm = W ? W.name : `旧旧的${it.name}`; const was = l.name; if (l.stage === 'landed') l.name = nm;
    const night = isNight(this.dayT()); const far = !this.res.some(r => !r.away && Math.hypot(r.x - l.x, r.z - l.z) < 36);
    (this.wstats.wornLog = this.wstats.wornLog || []).push({ day: this.day(), night, far, d: Math.round(Math.hypot(l.x, l.z)) });
    const w = l.look ? this.watchers(l) : []; let who = w.length ? w.slice(0, 2) : this.res.filter(r => !r.away && Math.hypot(r.x - l.x, r.z - l.z) < 20).slice(0, 2); if (!who.length) who = this.pickFree(1);
    const why = night ? '雨下了一整夜，大家都睡着了，谁也没听见。' : far ? '它离小镇太远了，大家忙着躲雨，谁也没注意到。' : '';
    const sigh = who.length ? `第二天${who.map(r => r.name).join('和')}发现了，蹲在旁边惋惜了好一会儿：“要是早点把它抱回屋檐下就好了。”${this.has(who[0], 'generous') || this.has(who[0], 'easy') ? '过了一会儿又说：“没关系，旧了也有旧了的用处。”' : '后来大家商量着，还是能给它找个新用处。'}` : '小动物们惋惜了好一会儿，说旧了也有旧了的用处。';
    this.addCard('weather', `${it.name}淋了太久的雨`, `${why}你放下的${it.name}在雨里淋了太久，${it.mat === 'paper' ? '纸页泡得皱巴巴的' : it.mat === 'wood' ? '木头泡得发胀、颜色也暗了' : '湿漉漉的，颜色也旧了'}，变成了「${nm}」。${sigh}`, who, [l.x, l.z]);
    if (l.stage !== 'landed') l.name = was;
  };
  // 居民自发照看淋雨的旧物：小的抱到屋檐下，大的或附近没有屋檐就盖片大叶子
  P.rescueTick = function (wetNow) {
    for (const l of this.lots) { // 照看的人中途被打断：放下来盖片叶子
      if (l.carry) { const r = this.rById(l.carry); if (!r || r.job !== 'rescue') { l.carry = 0; l.cover = 1; l.rescuer = 0; this.ver++; if (r) r.box = 0; } }
      if (l.rescuer && !l.carry) { const r = this.rById(l.rescuer); if (!r || r.job !== 'rescue') l.rescuer = 0; }
    }
    const dT = this.dayT(); if (!wetNow || dT < 0.24 || dT > 0.8) return; // 傍晚以后大家回家了，夜里没人照看
    const busy = this.res.filter(r => r.job === 'rescue').length; if (busy >= 2) return; // 照看得慢一点：最多两个人同时去
    const L = this.lots.filter(l => this.dampable(l) && !l.rescuer && (l.damp || 0) > 0.12 && !l.old).sort((a, b) => (b.damp || 0) - (a.damp || 0));
    for (const l of L.slice(0, 2 - busy)) {
      const c = this.res.filter(r => !r.away && !r.haul && !r.chat && (FREE_JOBS.has(r.job) || r.job === 'shelter' || r.job === 'nap') && r.act !== A.SLEEP && (r.act !== A.INSIDE || r.job === 'shelter' || r.job === 'nap') && r.full > 20 && Math.hypot(r.x - l.x, r.z - l.z) < 36) // 躲雨的也会跑出来帮忙
        .map(r => ({ r, s: Math.hypot(r.x - l.x, r.z - l.z) - (this.has(r, 'generous') ? 10 : 0) - (this.has(r, 'diligent') ? 6 : 0) + (this.has(r, 'easy') ? 8 : 0) })).sort((a, b) => a.s - b.s);
      if (!c.length) continue; const r = c[0].r; this.finishTask(r); l.rescuer = r.id;
      const a = Math.atan2(r.z - l.z, r.x - l.x), rr = l.r + 0.9;
      this.setSteps(r, [this.go(l.x + Math.cos(a) * rr, l.z + Math.sin(a) * rr), this.doo(A.GATHER, 4, 'rescue', { lot: l.id, face: [l.x, l.z] })], 'rescue', `下雨了，跑去照看淋湿的${ITEMS[l.item].name}`);
      this.emo(r, 2, 3, { k: 'rain', a: ITEMS[l.item].name });
    }
  };
  P.eaveSpot = function (l) { // 屋檐下：紧挨着房子侧面，但按真实占地留出边距，不插进房子里
    const ctx = this.fitCtx(); let best = null;
    for (const h of this.lots) {
      if (!h.done || !['home', 'shop', 'shared', 'shed'].includes(h.use)) continue; const d = Math.hypot(h.x - l.x, h.z - l.z); if (d > 42 || (best && d > best.d)) continue;
      const R = footOf(h).R;
      for (const da of [0.95, -0.95, 1.5, -1.5]) { const a = h.rot + da; let hit = null;
        for (let rr = R * 0.5; rr < R + 4 && !hit; rr += 0.4) { const x = h.x + Math.sin(a) * rr, z = h.z + Math.cos(a) * rr; const ck = placeCheck(x, z, l.r, { bridges: this.bridges, puddles: (this.puddles || []).map(p => [p.x, p.z, p.r, p.id]), fit: { ...ctx, feet: ctx.feet.filter(f => f.id !== l.id) } }, 'item', { item: l.item, rot: l.rot }); if (ck.ok && !ck.puddle) hit = { x, z, h, d }; }
        if (hit) { best = hit; break; } }
    }
    return best;
  };
  P.rescueDone = function (r, st) {
    const l = this.lotById(st.lot); if (!l || l.done || l.cover || !this.dampable(l) && !l.carry) { if (l) l.rescuer = 0; return false; }
    const it = ITEMS[l.item]; const sp = l.stage === 'landed' && it.size !== 'big' ? this.eaveSpot(l) : null; this.wstats.rescues++;
    if (sp) { // 抱起来，送到屋檐下
      l.carry = r.id; r.box = 1; this.ver++; this.emo(r, 2, 3, { k: 'rain', a: it.name });
      this.setSteps(r, [this.go(sp.x + (r.x > sp.x ? 1 : -1) * 0.6, sp.z), this.doo(A.IDLE, 1.6, 'rescueDrop', { lot: l.id, x: sp.x, z: sp.z, h: sp.h.id, face: [sp.x, sp.z] })], 'rescue', `把${it.name}抱到${sp.h.name}的屋檐下躲雨`);
      return true;
    }
    l.cover = 1; l.rescuer = 0; this.ver++; this.emo(r, 3, 3, { k: 'rainDone', a: it.name }); r.mood = Math.min(100, r.mood + 4); this.remember(r, `摘了片大叶子盖住了淋雨的${it.name}`);
    this.addCard('rescue', `${r.name}给${it.name}盖了片叶子`, `雨越下越大。${r.name}摘下一片比自己还大的叶子，${this.has(r, 'timid') ? '缩着脖子' : '顶着雨'}跑过去盖在${it.name}上面。雨点打在叶子上“嗒嗒”响，${it.name}总算不淋雨了。`, [r], [l.x, l.z]);
    return false;
  };
  P.rescueDrop = function (r, st) {
    const l = this.lotById(st.lot); r.box = 0; if (!l || l.carry !== r.id) return;
    l.carry = 0; l.rescuer = 0; l.cover = 2; l.x = l.fx = st.x; l.z = l.fz = st.z; this.ver++; const h = this.lotById(st.h); const it = ITEMS[l.item];
    if (l.look) { l.look.sum = 0; } r.mood = Math.min(100, r.mood + 5); this.emo(r, 3, 3, { k: 'rainDone', a: it.name, b: h ? h.name : '' }); this.remember(r, `把淋雨的${it.name}抱到了屋檐下`);
    this.addCard('rescue', `${r.name}把${it.name}抱进了屋檐下`, `下雨了！${r.name}看见${it.name}还在外面淋着，${this.has(r, 'brave') ? '一个箭步冲出去' : '踮着脚跑过去'}，把它抱到了${h ? h.name : '屋'}的屋檐下。${this.has(r, 'chatty') ? `还对着它念叨：“淋坏了大好人会心疼的。”` : '甩甩身上的雨水，满意地点了点头。'}`, [r], [l.x, l.z]);
  };
  // ---------------------------------------------------------------- 雪人
  P.stepSnowmen = function () {
    if (this.cover < 0.12 && this.snowmen.length && this.rng() < 0.05) { this.snowmen.shift(); this.ver++; }
  };
  P.snowmanSpot = function () {
    const st = this.placeState();
    for (let g = 0; g < 30; g++) { const a = this.rnd(0, TAU), d = this.rnd(PLAZA_R + 2, 30); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (!placeCheck(x, z, 0.9, st).ok) continue; if (this.snowmen.some(s => Math.hypot(s.x - x, s.z - z) < 3)) continue; return [x, z]; }
    return null;
  };
  P.snowmanDone = function (r, st) {
    if (this.cover < 0.2 || this.snowmen.length >= 6) return;
    const s = { id: this.snowId++, x: st.x, z: st.z, rot: this.rnd(0, TAU), k: Math.floor(this.rng() * 4), by: r.name }; this.snowmen.push(s); this.ver++; this.wstats.snowmen++;
    r.mood = Math.min(100, r.mood + 8); this.emo(r, 3, 4, { k: 'snow' }); this.remember(r, '堆了一个雪人');
    const deco = ['用两颗小石子当眼睛，一根胡萝卜当鼻子', '给它戴了一顶树叶帽子', '插了两根小树枝当手，像在跟人打招呼', '用莓果给它点了一个红红的嘴巴'][s.k];
    if (this.snowmen.length === 1 || this.day() !== this.snowmanCardDay) { this.snowmanCardDay = this.day(); const fr = this.rById(r.friends[0]); this.addCard('snowman', `${r.name}堆了一个雪人`, `${r.name}${fr && !fr.away ? `拉着${fr.name}` : ''}在雪地里滚了两个大雪球，摞起来，${deco}。雪人歪着脑袋，好像在笑。`, fr && !fr.away ? [r, fr] : [r], [s.x, s.z]); }
  };
  // decide() 里按天气调整想做的事（sim-core 调用）
  P.weatherOpts = function (r, opts, home) {
    const k = this.wx.k; const mul = { rain: { wander: 0.3, explore: 0.25, social: 0.55, fac: 0.45, gather: 0.7, shop: 1.5 }, snow: { wander: 0.6, explore: 0.4, gather: 0.8 }, sun: { wander: 1.3, social: 1.2, fac: 1.25, explore: 1.15 }, cloud: {} }[k] || {};
    for (const o of opts) if (mul[o[0]]) o[1] *= mul[o[0]];
    if (k === 'rain' && home && home.done) opts.push(['shelter', 0.95 + (this.has(r, 'timid') ? 0.5 : 0) + (this.has(r, 'easy') ? 0.2 : 0) - (this.has(r, 'brave') ? 0.35 : 0)]);
    if (this.cover > 0.35 && this.snowmen.length < 6 && this.dayT() < 0.8 && this.res.filter(o => o.job === 'snowman').length < 2) { const c = this.cal(); opts.push(['snowman', 0.35 + (this.has(r, 'curious') ? 0.3 : 0) + (this.has(r, 'chatty') ? 0.2 : 0) + (c.sday === FEST_DAY ? 0.6 : 0)]); }
  };
  P.weatherAct = function (r, what, home) {
    if (what === 'shelter') return this.setSteps(r, [this.go(...home.door), this.doo(A.INSIDE, this.rnd(70, 150), 'nap')], 'shelter', `下雨了，回${home.name}里躲雨`);
    if (what === 'snowman') { const p = this.snowmanSpot(); if (!p) return this.setSteps(r, [this.go(r.x + this.rnd(-3, 3), r.z + this.rnd(-3, 3)), this.doo(A.IDLE, 6, null)], 'wander', '在雪地里踩脚印');
      return this.setSteps(r, [this.go(p[0] + 1.1, p[1]), this.doo(A.BUILD, 15, 'snowman', { x: p[0], z: p[1], face: [p[0], p[1]] })], 'snowman', '在雪地里滚雪球，要堆个雪人'); }
  };
  // ---------------------------------------------------------------- 节日：每季第 FEST_DAY 天，早上布置、傍晚聚会
  P.stepFest = function (c) {
    const dT = this.dayT(); const key = `${c.year}-${c.season}`;
    if (c.sday === FEST_DAY && dT > 0.27 && dT < 0.98) {
      if (!this.fest || this.fest.key !== key) { if (this.festDone[key]) { if (!this.fest) this.fest = { key, id: FESTIVALS[c.season].id, prog: 1, eve: true }; } else this.startFest(c, key); }
      const f = this.fest; if (dT > 0.5 && f.prog < 1) { f.prog = 1; this.ver++; }
      if (dT > 0.76 && !f.eve) this.festEvening(c);
    } else if (this.fest) { this.fest = null; this.ver++; }
  };
  P.startFest = function (c, key) {
    const F = FESTIVALS[c.season]; this.festDone[key] = 1; this.lstats.festival++; this.wstats.fests.push({ day: this.day(), season: c.season, id: F.id });
    this.fest = { key, id: F.id, prog: 0.15, eve: false, t0: this.t }; this.ver++;
    const who = this.pickFree(4, r => r.job !== 'tend' && r.job !== 'trip' && r.job !== 'rescue');
    who.forEach((r, i) => { this.finishTask(r); const a = i / 4 * TAU + this.rnd(-0.3, 0.3), rr = this.rnd(10.5, 13); this.setSteps(r, [this.go(Math.cos(a) * rr, Math.sin(a) * rr), this.doo(A.BUILD, 12, 'festDecor', { face: [0, 0] })], 'fest', `在广场上布置${F.name}的${F.decor}`); });
    for (const r of this.res) r.mood = Math.min(100, r.mood + 4);
    this.addCard('festival', `${F.name}到了`, F.start(who.length ? who.map(r => r.name).join('、') : '大家'), who, [0, 0]);
  };
  P.festLabel = function () { return FESTIVALS[this.cal().season].name; };
  P.festDecor = function (r) { const f = this.fest; if (!f) return; f.prog = Math.min(1, f.prog + 0.22); this.ver++; r.mood = Math.min(100, r.mood + 5); this.emo(r, 3, 3, { k: 'fest', a: this.festLabel() }); };
  P.festEvening = function (c) {
    const F = FESTIVALS[c.season]; const f = this.fest; f.eve = true; f.prog = 1; this.ver++;
    const who = this.pickFree(9, r => r.job !== 'tend' && r.job !== 'trip' && r.job !== 'rescue' && r.full > 15);
    who.forEach((r, i) => { this.finishTask(r); const a = i / who.length * TAU, rr = this.rnd(5.6, 8.4); this.setSteps(r, [this.go(Math.cos(a) * rr, Math.sin(a) * rr), this.doo(A.IDLE, this.rnd(40, 70), 'festFun', { face: [0, 0] })], 'fest', `在广场上过${F.name}`); });
    for (const r of this.res) r.mood = Math.min(100, r.mood + 10);
    const wishDone = this.twDone.some(d => d.k === F.wish && d.year === c.year);
    this.addCard('festival', `${F.name}的晚上`, F.eve(who.slice(0, 4).map(r => r.name).join('、') || '大家') + (wishDone ? '今年大家的心愿也实现了，连祭坛上的金蛋都好像亮了一点。' : ''), who.slice(0, 4), [0, 0]);
    const g = who[0]; if (g) this.giftQ.push({ t: this.t + DAY * 0.12, rid: g.id, kind: 'wish', wish: F.name + '过得很开心' });
  };
  // ---------------------------------------------------------------- 远行探险（真实时间：this.wall 毫秒，离线也算）
  P.destOpen = function (k) { return !!DESTS[k] && this.expDone >= DESTS[k].unlock; };
  P.startTrip = function (o) {
    if (this.exp) return { ok: false, why: '已经有一支小队在远行了' };
    if (this.wall < this.expCD) return { ok: false, why: `小队刚回来，还要歇 ${Math.ceil((this.expCD - this.wall) / 60000)} 分钟` };
    const D = DESTS[o.dest]; if (!D || !this.destOpen(o.dest)) return { ok: false, why: '还没听说过这个地方' };
    if (!ITEMS[o.item] || !(this.box[o.item] > 0)) return { ok: false, why: '储物箱里没有这件东西了' };
    const rs = [...new Set(o.rids || [])].map(id => this.rById(id)).filter(Boolean); if (rs.length < 2 || rs.length > 3) return { ok: false, why: '要选 2～3 位居民' };
    for (const r of rs) if (r.haul || r.ride) return { ok: false, why: `${r.name}正在拖东西，走不开` };
    const c = this.cal(); const hours = tripHours(o.dest, o.item, rs.flatMap(r => r.traits), c.season, this.rng());
    this.box[o.item]--; if (!this.box[o.item]) delete this.box[o.item];
    const g = GATES[D.gate]; const gl = Math.hypot(g[0], g[1]);
    this.exp = { id: ++this.expN, dest: o.dest, item: o.item, rids: rs.map(r => r.id), names: rs.map(r => r.name), t0: this.wall, dur: hours * 3.6e6, hours, phase: 'out', gate: D.gate, ox: g[0] / gl * (EDGE_R + 12), oz: g[1] / gl * (EDGE_R + 12), day: this.day(), season: c.season };
    rs.forEach((r, i) => this.tripOut(r, i)); this.gateEv(D.gate, 'out', `${rs.map(r => r.name).join('、')}背着${ITEMS[o.item].name}从这里出发去${D.name}`);
    this.wstats.trips++;
    const pk = packOf(o.item);
    this.addCard('trip', `远行小队出发：去${D.name}`, `${rs.map(r => r.name).join('、')}背上你和 Lenia 准备的${ITEMS[o.item].name}（${pk.desc}），从村口出发去${D.name}。大家说，大概要 ${hours} 个小时才回来。`, rs, [g[0], g[1]]);
    return { ok: true, why: `小队出发了，大约 ${hours} 小时后回来`, hours };
  };
  P.tripOut = function (r, i) {
    const e = this.exp; if (r.haul || r.ride) this.leaveHaul(r); this.finishTask(r); r.chat = null; const g = GATES[e.gate]; const s = (i - 1) * 1.1;
    this.setSteps(r, [this.go(g[0], g[1]), this.go(e.ox - e.oz / 80 * s, e.oz + e.ox / 80 * s), this.doo(A.INSIDE, 0.5, 'tripAway')], 'trip', `背着行囊去${DESTS[e.dest].name}远行`);
    r.box = 1; this.remember(r, `出发去${DESTS[e.dest].name}远行`);
  };
  P.tripAway = function (r) { const e = this.exp; if (!e || !e.rids.includes(r.id)) return false; r.away = e.id; r.steps = []; r.si = 0; r.act = A.INSIDE; r.box = 0; r.doing = `在远行（去${DESTS[e.dest].name}）`; return true; };
  P.stepTrip = function () {
    const e = this.exp; if (!e) return;
    const due = this.wall >= e.t0 + e.dur;
    if (e.phase === 'out' || e.phase === 'away') {
      const rs = e.rids.map(id => this.rById(id)).filter(Boolean);
      if (!rs.length) { this.exp = null; return; }
      if (!due) { rs.forEach((r, i) => { if (!r.away && r.job !== 'trip') this.tripOut(r, i); }); if (rs.every(r => r.away)) e.phase = 'away'; return; }
      e.phase = 'back'; e.backT = this.t; this.tripResult(e);
      rs.forEach((r, i) => { r.away = 0; this.finishTask(r); r.x = e.ox + i * 0.8; r.z = e.oz; const g = GATES[e.gate]; const a = this.rnd(0, TAU), rr = this.rnd(6, 8.5);
        this.setSteps(r, [this.go(g[0], g[1]), this.go(Math.cos(a) * rr, Math.sin(a) * rr), this.doo(A.IDLE, 3, 'tripHome')], 'trip', `从${DESTS[e.dest].name}回来了，背着鼓鼓的行囊`); r.box = 1; r.full = Math.max(r.full, 45); r.energy = Math.max(r.energy, 40); });
      this.log.push(`远行小队从${DESTS[e.dest].name}回来了`);
    } else if (e.phase === 'back') {
      const rs = e.rids.map(id => this.rById(id)).filter(Boolean);
      if (rs.every(r => r.tripHome === e.id) || this.t - e.backT > 260) this.tripFinish(e);
    }
  };
  P.tripResult = function (e) { // 按时长、行囊、成员性格生成带回来的东西和游记
    const D = DESTS[e.dest], pk = packOf(e.item); const rs = e.rids.map(id => this.rById(id)).filter(Boolean); const tr = rs.flatMap(r => r.traits);
    let n = 1 + (e.hours >= 4 ? 1 : 0) + (pk.finds || 0) + (pk.wet && WET_DEST.has(e.dest) ? 1 : 0) + (tr.includes('diligent') ? 0.5 : 0) + (tr.includes('curious') ? 0.4 : 0);
    n = clamp(Math.floor(n + this.rng() * 0.8), 1, 3); const luck = (pk.luck || 0) + (tr.includes('brave') ? 0.2 : 0) + (tr.includes('curious') ? 0.15 : 0);
    const finds = []; const c = this.cal();
    for (let i = 0; i < n; i++) {
      if (this.rng() < 0.55) { // 稀有旧物：优先没找到过的（包括别的季节的季节旧物——远方什么都有）
        const pool = D.items.filter(k => ITEMS[k]); const rare = pool.filter(k => !this.unlocked.includes(k) && !finds.some(f => f.k === k)); const k = rare.length && this.rng() < 0.6 + luck ? this.pick(rare) : this.pick(pool);
        finds.push({ type: 'item', k, n: 1, label: (ITEMS[k].season && ITEMS[k].season !== c.season ? `一个不是这个季节的${ITEMS[k].name}` : `一个${ITEMS[k].name}`) });
      } else { const pool = D.seeds; const k = this.pick(pool); const m = 3 + (pk.seeds || 0); finds.push({ type: 'seed', k, n: m, label: `${m} 颗${SEEDS[k].name}种子` }); }
    }
    const it = ITEMS[e.item]; let s = this.rng() * 1e9 | 0; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const J = writeJourney({ dest: e.dest, item: e.item, itemName: it.name, members: rs.map(r => ({ name: r.name, sp: r.sp, traits: r.traits })), hours: e.hours, season: e.season || c.season, finds: finds.map(f => f.label), rnd });
    // 配方：按概率带回 0～1 张（只从还不知道的里面挑；目的地和季节有偏好，见 shared/journey.js）
    let recipe = null; const dry = this.lstats.recipeDry || 0;
    if (this.rng() < recipeChance(e.hours, luck, dry)) { const rc = recipePick(this.recipes, e.dest, e.season || c.season, () => this.rng()); if (rc) recipe = { id: rc.id, line: RECIPE_SEEN[rc.id] || rc.story }; }
    e.res = { finds, title: J.title, paras: J.paras, mood: pk.mood || 0, recipe };
  };
  P.tripFinish = function (e) {
    const rs = e.rids.map(id => this.rById(id)).filter(Boolean); const D = DESTS[e.dest]; if (!e.res) this.tripResult(e);
    for (const f of e.res.finds) { if (f.type === 'item') this.giveItem(f.k, f.n, 'trip'); else this.seeds[f.k] = (this.seeds[f.k] || 0) + f.n; }
    for (const r of rs) { r.tripHome = 0; r.box = 0; if (r.job === 'trip') this.finishTask(r); r.mood = Math.min(100, r.mood + 12 + (e.res.mood || 0)); this.remember(r, `从${D.name}远行回来了`); for (const o of rs) if (o !== r) this.bond(r, o, 6); }
    const card = this.addCard('journey', e.res.title, e.res.paras.join('\n'), rs, [0, 0]); card.dest = e.dest; card.finds = e.res.finds.map(f => f.label);
    const rp = e.res.recipe && COMBOS.find(c => c.id === e.res.recipe.id);
    if (rp && !this.recipes[rp.id]) { this.recipes[rp.id] = { day: this.day(), from: 'trip:' + e.dest }; this.lstats.recipeDry = 0; card.recipe = { id: rp.id, name: rp.name, a: rp.a, b: rp.b, line: e.res.recipe.line }; if (rs[0]) this.remember(rs[0], `在${D.name}学到了${ITEMS[rp.a].name}和${ITEMS[rp.b].name}的拼法`); }
    else this.lstats.recipeDry = (this.lstats.recipeDry || 0) + 1;
    this.letters.unshift({ id: card.id, title: card.title, dest: e.dest, day: this.day(), seen: false }); if (this.letters.length > 12) this.letters.length = 12;
    this.gateEv(e.gate, 'back', `${rs.map(r => r.name).join('、')}从${D.name}回来了，带回${e.res.finds.map(f => f.label).join('、')}`);
    this.expDone++; this.expCD = this.wall + TRIP_CD_H * 3.6e6; this.exp = null; this.ver++;
    const nx = DEST_KEYS.find(k => DESTS[k].unlock === this.expDone); if (nx) this.notices.push({ t: this.t, text: `小队在路上听说了一个新地方：${DESTS[nx].name}。远行地图上多了一条路。`, item: null });
    const g = rs[0]; if (g) this.giftQ.push({ t: this.t + DAY * 0.08, rid: g.id, kind: 'wish', wish: `去${D.name}远行` });
  };
  P.tripInfo = function () {
    const e = this.exp; const D = e ? DESTS[e.dest] : null;
    return { exp: e ? { dest: e.dest, name: D.name, names: e.names, rids: e.rids, item: e.item, hours: e.hours, phase: e.phase, frac: clamp((this.wall - e.t0) / e.dur, 0, 1), left: Math.max(0, e.t0 + e.dur - this.wall) } : null,
      cd: Math.max(0, this.expCD - this.wall), done: this.expDone, open: DEST_KEYS.filter(k => this.destOpen(k)), letters: this.letters.slice(0, 8) };
  };
  P.tripGiftLine = function () {
    const e = this.exp; if (!e) return null; const D = DESTS[e.dest];
    if (e.phase === 'back' || this.wall >= e.t0 + e.dur) return `远行小队（${e.names.join('、')}）从${D.name}回来了！正从村口往回走，背着鼓鼓的行囊，游记马上就到。`;
    const gone = (this.wall - e.t0) / 3.6e6, left = (e.t0 + e.dur - this.wall) / 3.6e6;
    return `远行小队（${e.names.join('、')}）去${D.name}已经 ${gone < 1 ? Math.max(1, Math.round(gone * 60)) + ' 分钟' : gone.toFixed(1) + ' 小时'}了，大概再过 ${left < 1 ? Math.max(1, Math.round(left * 60)) + ' 分钟' : left.toFixed(1) + ' 小时'}回来。`;
  };
  // ---------------------------------------------------------------- 输出 / 存档
  P.worldSnap = function () { return [WEATHERS.indexOf(this.wx.k), Math.round(this.cover * 1000) / 1000, Math.round(this.wet * 1000) / 1000, this.fest ? Math.round(this.fest.prog * 100) / 100 : 0]; };
  P.worldStruct = function () {
    return { puddles: this.puddles.map(p => [p.id, Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, Math.round(p.r * 100) / 100, Math.round(p.t0), Math.round(p.until)]), snowmen: this.snowmen.map(s => [s.id, s.x, s.z, s.rot, s.k]),
      fest: this.fest ? { id: this.fest.id, prog: this.fest.prog } : null };
  };
  P.worldInfo = function () {
    const c = this.cal(); const F = FESTIVALS[c.season];
    return { season: c.season, sname: SEASON_NAME[c.season], sday: c.sday, sdays: YEAR_DAYS / 4, year: c.year, wx: this.wx.k, wxName: WX_NAME[this.wx.k], cover: this.cover, wet: this.wet, fest: this.fest ? { id: this.fest.id, name: F.name } : null, festName: F.name, festIn: FEST_DAY - c.sday, puddles: this.puddles.length, snowmen: this.snowmen.length };
  };
  P.worldSave = function () {
    const R2 = (v) => Math.round(v * 100) / 100;
    return { wx: { k: this.wx.k, u: R2(this.wx.until), n: this.wx.n || 0 }, cv: R2(this.cover), we: R2(this.wet), pd: this.puddles.map(p => [p.id, R2(p.x), R2(p.z), R2(p.r), R2(p.t0), R2(p.life), R2(p.until)]), pi: this.puddleId, sm: this.snowmen.map(s => [s.id, R2(s.x), R2(s.z), R2(s.rot), s.k]), si: this.snowId,
      fd: this.festDone, sk: this.seasonKey, ex: this.exp, en: this.expN, ed: this.expDone, ec: this.expCD, lt: this.letters, wl: this.wall, ws: this.wstats };
  };
  P.worldLoad = function (W, now) {
    this.seasonFresh(); this.wall = Math.max(this.wall || 0, now || 0);
    if (!W) { this.seasonKey = ''; return; } // 旧存档：第一秒就触发“换季”，给这个季节的旧物和愿望
    Object.assign(this, { cover: W.cv || 0, wet: W.we || 0, puddleId: W.pi || 1, snowId: W.si || 1, festDone: W.fd || {}, seasonKey: W.sk || '', exp: W.ex || null, expN: W.en || 0, expDone: W.ed || 0, expCD: W.ec || 0, letters: W.lt || [], wstats: { ...this.wstats, ...(W.ws || {}) } });
    this.wall = Math.max(W.wl || 0, now || 0);
    if (W.wx && WEATHERS.includes(W.wx.k)) this.wx = { k: W.wx.k, until: W.wx.u, t0: this.t, n: W.wx.n || 0 };
    this.puddles = (W.pd || []).map(a => ({ id: a[0], x: a[1], z: a[2], r: a[3], t0: a[4], life: a[5], until: a[6] }));
    this.snowmen = (W.sm || []).map(a => ({ id: a[0], x: a[1], z: a[2], rot: a[3], k: a[4] }));
  };
}
