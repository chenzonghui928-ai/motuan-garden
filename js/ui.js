// 界面层（花园工具房风格）：木工具栏四个入口（储物箱 / 打理 / 愿望 / 相册）、太阳时钟、回礼篮、储物箱、愿望晾绳、居民档案板、窗台回礼、相册与图鉴、托梦、离开期间的信。
// 只读 Worker 发来的 info；玩家动作通过 api 交给 main.js（放置、种花）或发给 Worker。
import { SP_NAME, OBJ_NAME, OBJ_KINDS, USES, MATS, MAT_NAME, SHOP, TEAM, SPECIES, STAGE_COST, GATES } from './shared/layout.js';
import { TRAITS } from './shared/text.js';
import { FOODS, FOOD_SHOW, FOODS_NA, FOOD_PIC, FAV_BONUS } from './shared/food.js';
import { ITEMS, ITEM_KEYS, COMBOS, SEEDS, GIFTS, FAC, TEMPLATE_OF, WORN, matSources, movable } from './shared/items.js';
import { SEASON_NAME, MAT_LABEL, DAMP_RATE, WX_NAME } from './shared/seasons.js';
import { DESTS, DEST_KEYS, packOf, tripHours, TRIP_H } from './shared/journey.js';
import { icon, hydrate, ART } from './ui-art.js';
import { wishArt } from './wish-art.js';
import { leniaFace } from './lenia-talk.js';
import { play as sfx, sinceMs } from './sfx.js';
const leniaMini = () => `<span class="lbadge lmini">${leniaFace()}</span>`;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CARD_TAG = { discover: ['发现', 'b'], haul: ['拖运', 'o'], home: ['新家', 'g'], shop: ['开店', 'o'], guest: ['店铺', 'o'], friend: ['朋友', 'r'], wish: ['心愿', 'r'], dream: ['托梦', 'b'], arrive: ['新邻居', 'g'], away: ['你不在时', ''], change: ['变化', 'g'], upgrade: ['翻新', 'g'], moment: ['日常', 'b'], lenia: ['旧物', 'o'], combo: ['组合惊喜', 'r'], twish: ['小镇愿望', 'g'], festival: ['节日', 'r'], season: ['换季', 'g'], weather: ['天气', 'b'], rescue: ['下雨天', 'b'], snowman: ['雪人', 'b'], trip: ['远行', 'o'], journey: ['游记', 'r'], clear: ['清理', 'g'] };
const SPECIAL = new Set(['lenia', 'combo', 'twish', 'festival', 'season', 'journey', 'trip']);
const DREAM_ST = { pending: ['等着去做', 'o'], done: ['达成', 'g'], blocked: ['受阻', 'r'], expired: ['过期', ''] };
const MERGE = new Set(['wish', 'friend', 'moment', 'upgrade', 'away', 'rescue', 'snowman', 'clear']);
const mergeTitle = (type, n) => ({ wish: `今天有 ${n} 个心愿实现了`, friend: `今天有 ${n} 对新朋友`, moment: `今天的 ${n} 个小片段`, upgrade: `今天有 ${n} 栋房子换了新样子`, away: `你不在时的 ${n} 段小故事`, rescue: `雨天里 ${n} 次照看旧物`, snowman: `今天堆了 ${n} 个雪人`, clear: `今天清了 ${n} 丛外圈的植物` }[type] || `${n} 件事`);
const av = (sp, cls = '') => `<span class="av ${cls}">${icon('av:' + sp)}</span>`;
const seeds = (p, n = 5) => `<span class="seeds">${Array.from({ length: n }, (_, i) => `<i class="seed ${p * n >= i + 0.5 ? 'on' : ''}"></i>`).join('')}</span>`;
const itemIc = (k, cls = '') => icon('item:' + k, cls);
// ---- 食物：图标是 Codex 交付的 assets/food/，效果文字按 shared/food.js 的数值生成
const foodIc = (k, big = false) => `<img class="fic${big ? ' big' : ''}" src="assets/food/${FOOD_PIC[k]}-${big ? 128 : 64}.png" alt="${esc((FOODS[k] || FOODS_NA[k]).name)}">`;
const num = (n) => String(Math.round(n * 100) / 100);
const effectLine = (k) => { const F = FOODS[k]; return `吃一份：饱腹 +${num(F.full)}，心情 +${num(F.mood)}${F.energy ? `，精力 +${num(F.energy)}` : ''}；${F.note}。最爱吃它的会再多得 心情 +${FAV_BONUS.mood}、饱腹 +${FAV_BONUS.full}。`; };
const eatWhen = (a) => `第${a.day}天 ${a.hm}`;
// ---- 配方：储物箱格子角标 / 详情「搭配」栏 / 图鉴三态 / 游记配方卡
const known = (L, id) => !!(L.recipes && L.recipes[id]);
const recipeMark = (L, k) => COMBOS.some(c => (c.a === k || c.b === k) && known(L, c.id)) ? '<i class="rbadge" title="知道它的拼法"></i>' : '';
function recipeRows(L, k, combos) {
  const rs = combos.filter(c => known(L, c.id)); let h = `<div class="rcps"><div class="rcph">搭配</div>`;
  if (!rs.length) return h + `<div class="rcp none">还不知道它能和什么拼</div></div>`;
  for (const c of rs) {
    const o = c.a === k ? c.b : c.a; const hint = (L.landed || []).some(x => x.item === o) ? `花园里就有${ITEMS[o].name}` : L.box[o] > 0 ? `储物箱里就有${ITEMS[o].name}` : '';
    h += `<div class="rcp">${recipeIcons(k, o, c.id)}<span class="rcpt">能和<b>${esc(ITEMS[o].name)}</b>拼成<b>${esc(c.name)}</b>${L.cdex && L.cdex[c.id] ? '' : '<span class="chip rst">已知配方 · 还没拼过</span>'}${hint ? `<em>${esc(hint)}</em>` : ''}</span></div>`;
  }
  return h + '</div>';
}
const recipeIcons = (a, b, id) => `<span class="rcpi">${itemIc(a)}<i>+</i>${itemIc(b)}<i>=</i>${icon('item:combo_' + id)}</span>`;
const BACK = Object.fromEntries(Object.entries(TEMPLATE_OF).map(([k, v]) => [v, k]));
const homeIc = (r) => { const k = r.homeCombo ? 'combo_' + r.homeCombo : BACK[r.homeKind] || (r.homeKind && ITEMS[r.homeKind] ? r.homeKind : null); return k ? `<span class="slot homeslot">${itemIc(k)}</span>` : `<span class="slot homeslot"><span class="ttlf" style="color:#fff3d8;font-size:13px">${r.homeKind ? '小屋' : '没家'}</span></span>`; };
const comboOfCard = (c) => { const m = /「(.+?)」|：(.+?)！/.exec(c.title); return m; };

export function createUI(api) {
  const S = { openGroups: new Set(), mergedToast: null, info: null, cards: [], album: [], tab: 'town', view: null, boxTab: 'items', boxSel: null, atticSel: null, seedSel: 'daisy', albumSub: 'new', resId: null,
    dreamRid: null, dreamTarget: null, seenCards: 0, giftShown: 0, toastIds: new Set(), toastMode: 'stack', lastCardId: 0, wishSeen: '', noticeT: -1, extra: [], trip: { item: null, rids: [], dest: 'picnic' }, letterShown: 0, giftHold: true, pendingGift: null, rs: { sp: 'all', sort: 'doing', page: 0, order: null, loose: false, n: null }, resFrom: null };
  const sheet = $('sheet'), frame = $('sheetF'), body = $('sheetB');
  // ---------------------------------------------------------------- 打开 / 关闭
  function setTab(tab, view = null) {
    if (tab === 'tend') { close(); api.startTend(); return; }
    if (tab === 'dex') { S.albumSub = 'dex'; tab = 'album'; }
    const wasOpen = sheet.classList.contains('open'), oldView = S.view; // 音效：开箱 / 关箱 / 换页
    S.tab = tab; S.view = view || tab;
    if (tab === 'town') { if (wasOpen && sinceMs('drop') > 500 && sinceMs('reject') > 500) sfx('close'); } else if (!wasOpen) sfx('open'); else if (oldView !== S.view) sfx('page');
    for (const b of document.querySelectorAll('#toolbar .tool')) b.classList.toggle('on', b.dataset.tab === tab);
    document.body.classList.toggle('nugtab', tab === 'nugget'); document.body.classList.toggle('roster-open', tab === 'roster');
    if (tab === 'roster') { S.rs.order = null; if (oldView !== 'roster') S.rs.page = 0; }
    if (tab === 'town') { sheet.classList.remove('open'); document.body.classList.remove('sheet-open'); api.onSheet(false); }
    else { sheet.classList.add('open'); document.body.classList.add('sheet-open'); api.onSheet(true); render(true); }
    if (tab === 'album') { S.seenCards = S.cards.length ? S.cards[0].id : 0; updateDots(); }
    if (tab === 'wish') { S.wishSeen = wishKey(); updateDots(); }
  }
  const close = () => { api.select(null); setTab('town'); };
  $('toolbar').addEventListener('click', (e) => { const b = e.target.closest('.tool'); if (!b) return; if (b.dataset.tab === S.tab) return close(); setTab(b.dataset.tab); });
  function openRes(id, from = null) { S.resId = id; S.resFrom = from; rosterSeen(id); api.select(id); setTab('res'); }
  function openSite(id) { S.siteId = id; S.siteMsg = ''; api.select(null); setTab('site'); }
  function openGate(i) { S.gateId = i; api.select(null); setTab('gate'); } // 点村口：这条路通往哪、最近谁出发回来、拖回了什么
  function openThing(id) { S.thingId = id; api.select(null); setTab('thing'); } // 小设施 / 摆设 / 桥 / 公共粮筐的小卡片
  document.body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act, v = el.dataset.v; const I = S.info;
    if (a === 'res') openRes(+v);
    else if (a === 'rosterBadge') { if (S.view === 'roster' && sheet.classList.contains('open')) close(); else { S.resFrom = null; api.select(null); setTab('roster'); } }
    else if (a === 'rosterSp') { S.rs.sp = S.rs.sp === v ? 'all' : v; S.rs.order = null; S.rs.page = 0; render(true); }
    else if (a === 'rosterSort') { S.rs.sort = v; S.rs.order = null; S.rs.page = 0; render(true); }
    else if (a === 'rosterOpen') openRes(+v, 'roster');
    else if (a === 'rosterPage') { S.rs.page = Math.max(0, S.rs.page + (+v)); render(true); }
    else if (a === 'rosterDense') { S.rs.loose = !S.rs.loose; render(); }
    else if (a === 'rosterBack') { S.resFrom = null; api.select(null); setTab('roster'); }
    else if (a === 'close') close();
    else if (a === 'tab') setTab(v);
    else if (a === 'focus') { const [x, z] = v.split(',').map(Number); api.focus(x, z); if (innerWidth < 900) close(); }
    else if (a === 'follow') { api.follow(+v); if (innerWidth < 900) close(); }
    else if (a === 'collect') { const on = !S.album.some(c => c.id === +v); api.send({ type: 'collect', id: +v, on }); if (on) S.album.unshift({ ...S.cards.find(c => c.id === +v) }); else S.album = S.album.filter(c => c.id !== +v); render(); renderToasts(); }
    else if (a === 'boxTab') { S.boxTab = v; render(true); }
    else if (a === 'boxSel') { S.boxSel = v; render(); }
    else if (a === 'atticSel') { S.atticSel = v; render(); }
    else if (a === 'seedSel') { S.seedSel = v; render(); }
    else if (a === 'place') { if (S.boxSel && I && I.lenia.box[S.boxSel] > 0) { const k = S.boxSel; close(); api.startPlace(k); } }
    else if (a === 'plant') { close(); api.startTend('plant', v || S.seedSel); }
    else if (a === 'unlock') api.send({ type: 'lenia', act: 'unlock', item: v });
    else if (a === 'buySeed') api.send({ type: 'lenia', act: 'seed', seed: v });
    else if (a === 'gift') { flyHeart(el, I && I.lenia.sill.find(g => g.id === +v)); el.style.visibility = 'hidden'; api.send({ type: 'lenia', act: 'gift', id: +v }); }
    else if (a === 'giftAll') { for (const g of document.querySelectorAll('.gift')) flyHeart(g, I && I.lenia.sill.find(x => x.id === +g.dataset.v)); api.send({ type: 'lenia', act: 'gift', id: 'all' }); }
    else if (a === 'heartInfo') setTab('heart');
    else if (a === 'gateTrip') { const ds = DEST_KEYS.filter(k => DESTS[k].gate === S.gateId); const k = I && ds.find(k => I.trip.open.includes(k)); if (!k) { toast({ id: -Date.now(), type: 'notice', title: '还没听说过', text: '这条路通向的地方，大家还没去过。先从别的村口派小队出发吧。' }); return; } S.trip.dest = k; setTab('trip'); }
    else if (a === 'foodSel') { S.foodSel = S.foodSel === v ? null : v; render(); }
    else if (a === 'thoughtRes') { hideThought(); openRes(+v); }
    else if (a === 'thoughtX') hideThought();
    else if (a === 'thoughtFollow') { hideThought(); api.follow(+v); }
    else if (a === 'goAttic') { S.boxTab = 'attic'; setTab('box'); }
    else if (a === 'spTab') { const r = I.res.find(r => r.sp === v); if (r) openRes(r.id, S.resFrom); }
    else if (a === 'resNav') { const list = I.res; const i = list.findIndex(r => r.id === S.resId); const r = list[(i + (+v) + list.length) % list.length]; if (r) openRes(r.id, S.resFrom); }
    else if (a === 'dreamFor') { S.dreamRid = +v; S.dreamTarget = null; setTab('dream'); }
    else if (a === 'drRes') { S.dreamRid = +v; render(); }
    else if (a === 'drTgt') { S.dreamTarget = v; render(); }
    else if (a === 'drGo') { const [type, id] = S.dreamTarget.split(':'); api.send({ type: 'dream', rid: S.dreamRid, target: { type, id: +id } }); }
    else if (a === 'sub') { S.albumSub = v; render(true); }
    else if (a === 'toastX') { S.toastIds.delete(+v); renderToasts(); }
    else if (a === 'toastMore') { S.toastMode = 'list'; renderToasts(); }
    else if (a === 'toastLess') { S.toastMode = 'chip'; renderToasts(); }
    else if (a === 'toastChip') { S.toastMode = 'list'; renderToasts(); }
    else if (a === 'toastAll') { S.toastIds.clear(); S.toastMode = 'stack'; renderToasts(); }
    else if (a === 'giftOk') { $('gift').classList.remove('open'); api.send({ type: 'giftSeen' }); }
    else if (a === 'grp') { if (S.openGroups.has(v)) S.openGroups.delete(v); else S.openGroups.add(v); render(); }
    else if (a === 'tpItem') { S.trip.item = v; render(); }
    else if (a === 'tpRes') { const id = +v, L = S.trip.rids; if (L.includes(id)) S.trip.rids = L.filter(x => x !== id); else if (L.length < 3) L.push(id); else { L.shift(); L.push(id); } render(); }
    else if (a === 'tpDest') { if (I && I.trip.exp) return; if (I && I.trip.open.includes(v)) { S.trip.dest = v; render(); } else toast({ id: -Date.now(), type: 'notice', title: '还没去过', text: `再完成 ${DESTS[v].unlock - (I ? I.trip.done : 0)} 次远行，小队就会打听到${DESTS[v].name}在哪儿。` }); }
    else if (a === 'tpGo') { const T = S.trip; T.going = T.dest; T.goRid = T.rids[0]; api.send({ type: 'lenia', act: 'trip', item: T.item, rids: T.rids.slice(), dest: T.dest }); }
    else if (a === 'tripWith') { const r = I && I.res.find(r => r.id === +v); if (r && !r.away) { if (!S.trip.rids.includes(r.id)) { S.trip.rids.push(r.id); if (S.trip.rids.length > 3) S.trip.rids.shift(); } } setTab('trip'); }
    else if (a === 'letter') { const c = S.cards.find(c => c.id === +v) || S.album.find(c => c.id === +v); if (c) showLetter(c); }
    else if (a === 'letterRecipe') { const e = document.querySelector('#letter .rcard'); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else if (a === 'letterOk') { $('letter').classList.remove('open'); }
    else if (a === 'letterKeep') { const id = +v; if (!S.album.some(c => c.id === id)) { api.send({ type: 'collect', id, on: true }); const c = S.cards.find(c => c.id === id); if (c) S.album.unshift({ ...c }); } $('letter').classList.remove('open'); render(); }
    else if (a === 'siteDream' || a === 'siteFill' || a === 'siteRecall') { if (el.disabled) return; S.siteBusy = a; api.send({ type: 'lenia', act: a, id: S.siteId }); }
    else if (a === 'siteMove' || a === 'thingMove') { if (el.disabled) return; const id = a === 'siteMove' ? S.siteId : S.thingId; close(); if (api.startMove) api.startMove(id); }
    else if (a === 'nugFollow') { close(); }
    else if (a === 'siteEnter') { const id = S.siteId; close(); if (api.enter) api.enter(id); }
    else if (a === 'wxInfo') { const W = I && I.world; if (W) toast({ id: -Date.now(), type: 'notice', title: `${W.sname}天第 ${W.sday} 天 · ${W.wxName}`, text: `${W.fest ? `今天是${W.fest.name}！` : W.festIn > 0 ? `再过 ${W.festIn} 天是${W.festName}。` : ''}${W.wx === 'rain' ? '下雨了：露天、还没改造的纸和布做的东西会受潮，小动物会去照看。雨后会有水洼，水洼里也能放东西。' : W.wx === 'snow' ? '下雪了：地上会慢慢积白，小动物会堆雪人。' : W.puddles ? `地上还有 ${W.puddles} 汪水洼，往里放东西试试。` : '天气不错，大家都爱出门。'}` }); }
  });
  // 右上角心意数字变了：旁边飘出 +n / -n，涨的时候小红心跳一下
  function heartTick(n) {
    const el = $('heartN'), tag = $('heartTag'); el.textContent = Math.floor(n); const prev = S.heartPrev; S.heartPrev = n; if (prev == null || n === prev) return;
    const d = Math.round((n - prev) * 100) / 100; const r = tag.getBoundingClientRect(); const f = document.createElement('div'); f.className = 'heartfly ' + (d > 0 ? 'up' : 'down'); f.textContent = (d > 0 ? '+' : '-') + Math.abs(d);
    f.style.left = r.left + r.width / 2 + 'px'; f.style.top = r.bottom + 2 + 'px'; document.body.appendChild(f); setTimeout(() => f.remove(), 1300);
    if (d > 0) sfx('coin');
    if (d > 0) { const ic = tag.querySelector('.ic'); ic.classList.remove('beat'); void ic.offsetWidth; ic.classList.add('beat'); }
  }
  function flyHeart(el, g) { if (!g) return; const r = el.getBoundingClientRect(); const f = document.createElement('div'); f.className = 'heartfly'; f.textContent = `❤ +${g.heart}`; f.style.left = r.left + r.width / 2 - 20 + 'px'; f.style.top = r.top + 'px'; document.body.appendChild(f); setTimeout(() => f.remove(), 1100); }
  // ---------------------------------------------------------------- 数据进来
  const wishKey = () => S.info ? S.info.lenia.tw.map(w => w.k + (w.p >= 1 ? 1 : 0)).join(',') : '';
  function onInfo(info) {
    S.info = info; const L = info.lenia;
    if (info.cards) {
      const newest = info.cards[0]?.id || 0; const last = S.lastCardId;
      S.cards = info.cards; S.album = info.album; // 先换上新卡片再弹提示（不然提示里找不到这张卡，显示成空的）
      if (last && newest > last) for (const c of info.cards.filter(c => c.id > last).reverse()) if (c.type !== 'away' && c.type !== 'moment') toast(c, info.cards);
      if (!last) S.seenCards = newest;
      S.lastCardId = newest;
    }
    for (const n of L.notices) if (n.t > S.noticeT) { if (S.noticeT >= 0) toast({ id: -Math.round(n.t * 10), type: 'notice', title: '储物箱里多了东西', text: n.text, item: n.item }); S.noticeT = n.t; }
    if (S.noticeT < 0) S.noticeT = 0;
    if (!S.wishSeen) S.wishSeen = wishKey();
    $('sunHand').style.transform = `rotate(${info.dayT * 360 + 180}deg)`;
    const W = info.world; $('dayTag').innerHTML = W ? `<span>${W.sname}·第${W.sday}天</span> <span>${info.hm}</span>` : `<span>第${info.day}天</span> <span>${info.hm}</span>`;
    if (W) { const ic = $('wxIc'); const n = 'hud-weather-' + W.wx; if (ic.dataset.ic !== n) { ic.dataset.ic = n; hydrate(ic.parentElement); } ic.parentElement.title = `${W.sname}天 · ${W.wxName}`; }
    const T = info.trip; if (T) { const tl = T.letters.find(l => !l.seen); if (tl && S.letterShown !== tl.id && info.cards) { const c = info.cards.find(c => c.id === tl.id); if (c) { S.letterShown = tl.id; showLetter(c, true); api.send({ type: 'lenia', act: 'letter', id: tl.id }); } } $('tripDot').style.display = T.exp && T.exp.phase === 'back' ? 'block' : 'none'; }
    heartTick(L.heart); rosterTick(info.res.length);
    const sd = $('sillDot'); sd.style.display = L.sill.length ? 'block' : 'none'; sd.textContent = L.sill.length;
    renderJobs(); updateDots();
    if (info.gift && !info.gift.seen && S.giftShown !== info.gift.id) { if (S.giftHold) S.pendingGift = info.gift; else { S.giftShown = info.gift.id; showGift(info.gift); } } // 开场/引导/打招呼先说完，再给离开期间的信
    if (S.tab !== 'town') render();
  }
  function updateDots() {
    const nNew = S.cards.filter(c => c.id > S.seenCards).length; const d = $('albumDot'); d.style.display = nNew && S.tab !== 'album' ? 'block' : 'none'; d.textContent = nNew > 9 ? '9+' : nNew;
    const w = $('wishDot'); const ch = S.info && wishKey() !== S.wishSeen; w.style.display = ch && S.tab !== 'wish' ? 'block' : 'none'; w.textContent = '!';
  }
  function renderJobs() {
    const I = S.info; if (!I) return; const parts = [];
    for (const l of I.lenia.landed.slice(0, 2)) parts.push(`<div class="job paper" data-act="focus" data-v="${l.x.toFixed(1)},${l.z.toFixed(1)}">${l.look ? `${l.look} 个小家伙围着${esc(ITEMS[l.item].name)}看` : `天上掉下来的${esc(ITEMS[l.item].name)}`}</div>`);
    for (const p of I.projs.slice(0, 3 - parts.length)) {
      const name = p.stage === 'renovate' ? p.name : OBJ_NAME[p.kind];
      const txt = p.stage === 'gather' ? `召集拖${name} ${p.team}/${p.need}` : p.stage === 'haul' ? `${p.team} 人拖${name}` : p.missing.length ? `${name}缺${p.missing.map(m => MAT_NAME[m]).join('、')}` : `改造${name}`;
      const pr = p.stage === 'renovate' ? p.prog : p.stage === 'gather' ? p.team / p.need : 0.5;
      parts.push(`<div class="job paper" data-act="focus" data-v="${p.x.toFixed(1)},${p.z.toFixed(1)}">${esc(txt)}<i><b style="width:${Math.round(pr * 100)}%"></b></i></div>`);
    }
    const h = parts.join(''); if ($('jobs')._h !== h) { $('jobs').innerHTML = h; $('jobs')._h = h; }
  }
  function toast(c, all = S.cards) {
    if (MERGE.has(c.type)) { const same = all.filter(o => o.type === c.type && o.day === c.day); if (same.length >= 2) { for (const o of same) S.toastIds.delete(o.id); if (S.mergedToast) S.toastIds.delete(S.mergedToast.id); c = { ...c, merged: same.length }; S.mergedToast = c; } }
    if (c.type === 'notice') S.extra.push(c);
    sfx(c.type === 'combo' ? 'combo' : 'notice');
    S.toastIds.add(c.id); while (S.toastIds.size > 9) S.toastIds.delete(S.toastIds.values().next().value); renderToasts(); // 最多留 9 条排队，多的折成「还有 N 条」
    const expire = () => { if (S.toastMode === 'list') { setTimeout(expire, 4000); return; } S.toastIds.delete(c.id); renderToasts(); }; // 玩家展开列表在看时先不收
    setTimeout(expire, SPECIAL.has(c.type) ? 12000 : 9000);
  }
  const cardItem = (c) => { if (c.item) return c.item; if (c.type === 'combo') { const cb = COMBOS.find(x => c.title.includes(x.name)); return cb ? 'combo_' + cb.id : null; } if (c.type === 'lenia') return ITEM_KEYS.find(k => c.title.includes(ITEMS[k].name)) || null; return null; };
  function renderToasts() {
    const list = [...S.toastIds].map(id => (S.mergedToast && S.mergedToast.id === id) ? S.mergedToast : S.cards.find(c => c.id === id) || S.extra.find(c => c.id === id)).filter(Boolean).reverse(); // 新的在前
    const one = (c) => { const on = S.album.some(a => a.id === c.id); const it = cardItem(c); const sp = SPECIAL.has(c.type) || c.type === 'notice';
      return `<div class="toast paper ${sp ? 'special' : ''}"><span class="pin"></span>${it ? itemIc(it, 'thumb') : ''}<div class="grow"><div class="t"><b class="ttlf">${esc(c.merged ? mergeTitle(c.type, c.merged) : c.title)}</b><br>${esc(c.text.length > 46 ? c.text.slice(0, 46) + '…' : c.text)}</div></div>
      <button class="tx press" data-act="toastX" data-v="${c.id}" title="关掉这条" aria-label="关掉这条"></button>${c.type === 'notice' ? '' : `<button class="star press" data-act="collect" data-v="${c.id}" title="收进相册">${icon(on ? 'star' : 'star-o')}</button>`}</div>`; };
    const n = list.length; if (!n) S.toastMode = 'stack'; let h = '';
    if (n && S.toastMode === 'chip') h = `<button class="tchip press" data-act="toastChip">通知 ${n} <i class="tarrow"></i></button>`;
    else if (n && S.toastMode === 'list') h = `<div class="tlist">${list.map(one).join('')}</div><div class="trow"><button class="woodbtn press" data-act="toastLess">收起 <i class="tarrow up"></i></button><button class="woodbtn press" data-act="toastAll">全部关闭</button></div>`;
    else if (n) h = `<div class="tstack${n > 2 ? ' n3' : n > 1 ? ' n2' : ''}">${one(list[0])}</div>${n > 1 ? `<button class="tmore press" data-act="toastMore">还有 ${n - 1} 条 <i class="tarrow"></i></button>` : ''}`;
    if ($('toasts')._h !== h) { $('toasts').innerHTML = h; $('toasts')._h = h; hydrate($('toasts')); }
    $('toasts').style.display = n ? 'flex' : 'none';
  }
  // ---------------------------------------------------------------- 各页
  const FR = { box: 'crate', wish: 'shed', res: 'board', sill: 'sill', album: 'book', dream: 'book', trip: 'board' };
  function render(top = false) {
    const I = S.info; if (!I) return; const sc = frame.querySelector('.scroll'); const st = sc ? sc.scrollTop : 0; let h = '';
    if (S.view === 'box') h = viewBox(I); else if (S.view === 'wish') h = viewWish(I); else if (S.view === 'res') { const r = I.res.find(r => r.id === S.resId); h = r ? viewRes(r, I) : '<div class="empty">找不到这位居民</div>'; }
    else if (S.view === 'roster') h = viewRoster(I); else if (S.view === 'sill') h = viewSill(I); else if (S.view === 'album') h = viewAlbum(I); else if (S.view === 'dream') h = viewDream(I); else if (S.view === 'trip') h = viewTrip(I); else if (S.view === 'site') h = viewSite(I); else if (S.view === 'thing') h = viewThing(I); else if (S.view === 'heart') h = viewHeart(I); else if (S.view === 'gate') h = viewGate(I); else if (S.view === 'nugget') h = viewNugget(I);
    $('sheetT').textContent = S.view;
    dragTip.classList.toggle('on', S.view === 'box' && S.boxTab === 'items' && ITEM_KEYS.some(k => I.lenia.box[k] > 0));
    if (body._h !== h) { body.innerHTML = h; body._h = h; hydrate(body); const s2 = frame.querySelector('.scroll'); if (s2) { s2.scrollTop = top ? 0 : st; if (S.view === 'roster') rosterRange(s2); } }
  }
  const closeBtn = `<button class="enamel cream sm x2 press" data-act="close" title="关上">${icon('close')}</button>`;
  // 储物箱：打开的旧木箱，上盖挂名牌和三个椭圆标签，下面是木格
  function viewBox(I) {
    const L = I.lenia; const tabs = [['items', '旧物'], ['seeds', '花种'], ['attic', '阁楼']];
    let h = `<div class="crate"><div class="cbox"><div class="lid">${closeBtn}<div class="plank paper ttlf">Lenia 的储物箱</div><div class="tabs">${tabs.map(([k, n]) => `<button class="${S.boxTab === k ? 'on' : ''}" data-act="boxTab" data-v="${k}">${n}</button>`).join('')}</div></div>`;
    if (S.boxTab === 'items') {
      const keys = ITEM_KEYS.filter(k => L.box[k] > 0); if (!keys.includes(S.boxSel)) S.boxSel = keys[0] || null;
      const cells = keys.map(k => `<button class="slot ${S.boxSel === k ? 'sel' : ''}" data-act="boxSel" data-v="${k}">${itemIc(k)}${recipeMark(L, k)}<span class="n">${L.box[k]}</span></button>`);
      while (cells.length < 8 || cells.length % 4) cells.push(`<div class="slot empty"></div>`);
      h += `<div class="cavity scroll"><div class="slots">${cells.join('')}</div></div></div>`;
      if (S.boxSel) { const k = S.boxSel, it = ITEMS[k]; const dx = L.idex[k]; const known = dx ? dx.uses : [];
        const combos = COMBOS.filter(c => c.a === k || c.b === k);
        const tags = `${it.season ? `<span class="chip g">${SEASON_NAME[it.season]}天限定</span>` : ''}${DAMP_RATE[it.mat] ? `<span class="chip b">${MAT_LABEL[it.mat]} · 怕淋雨</span>` : ''}`;
        h += `<div class="detail"><div class="card paper">${itemIc(k, 'big')}<div class="grow"><div class="nm ttlf">${esc(it.name)} ${tags}</div><div class="ds">${esc(it.desc)}</div>
          <div class="chips">${it.uses.map(u => known.includes(u.name) ? `<span class="chip g">${esc(u.name)}</span>` : `<span class="chip">？？？</span>`).join('')}</div>
          ${recipeRows(L, k, combos)}${it.size === 'big' ? '<div class="ds" style="margin-top:4px">大件，要好几个人拖</div>' : ''}</div></div>
          <div class="gobtn"><button class="enamel green big press" data-act="place" title="放进花园">${icon('hand')}</button>放进花园</div></div>`; }
      else h += `<div class="detail empty" style="color:#fff3d8">箱子空了。<br>收下窗台上的回礼攒心意，去 Lenia 家「阁楼」里找找。</div>`;
    } else if (S.boxTab === 'seeds') {
      const ks = Object.keys(SEEDS).filter(k => !SEEDS[k].rare || L.seeds[k] > 0); if (!ks.includes(S.seedSel)) S.seedSel = 'daisy';
      h += `<div class="cavity scroll"><div class="slots">${ks.map(k => `<button class="slot ${S.seedSel === k ? 'sel' : ''} ${L.seeds[k] ? '' : 'lock'}" data-act="seedSel" data-v="${k}"><span style="width:56%;height:56%;border-radius:50%;background:radial-gradient(circle,${SEEDS[k].mid} 0 26%,${SEEDS[k].col} 28% 70%,rgba(0,0,0,0) 72%);filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))"></span><span class="n">${L.seeds[k] || 0}</span></button>`).join('')}</div></div></div>`;
      const sd = SEEDS[S.seedSel]; const n = L.seeds[S.seedSel] || 0; const cost = Math.max(1, sd.cost);
      h += `<div class="detail"><div class="card paper"><span class="big" style="border-radius:50%;background:radial-gradient(circle,${sd.mid} 0 22%,${sd.col} 24% 66%,rgba(0,0,0,0) 68%)"></span><div class="grow"><div class="nm ttlf">${sd.name}种子 ×${n}</div><div class="ds">种在空地上，浇过水大约半天开花。开花后附近的小动物会更开心，有时还会用它编花环送你。</div>
        <div style="margin-top:6px">${sd.rare ? '<span class="chip r">远行带回来的稀有花种</span>' : `<button class="woodbtn" data-act="buySeed" data-v="${S.seedSel}" ${L.heart >= cost ? '' : 'disabled'}>用 ❤${cost} 换 3 颗</button>`}</div></div></div>
        <div class="gobtn"><button class="enamel green big press" data-act="plant" data-v="${S.seedSel}" ${n ? '' : 'disabled'} title="去种花">${icon('watering-can')}</button>去种花</div></div>`;
    } else {
      const sea = I.world ? I.world.season : null; const ks = ITEM_KEYS.filter(k => !ITEMS[k].season || ITEMS[k].season === sea || L.unlocked.includes(k)).sort((a, b) => ((ITEMS[b].season === sea) - (ITEMS[a].season === sea)) || (L.unlocked.includes(b) - L.unlocked.includes(a)) || ITEMS[a].cost - ITEMS[b].cost); if (!ks.includes(S.atticSel)) S.atticSel = ks.find(k => !L.unlocked.includes(k)) || ks[0];
      h += `<div class="cavity scroll"><div class="slots">${ks.map(k => `<button class="slot ${S.atticSel === k ? 'sel' : ''} ${L.unlocked.includes(k) ? '' : 'lock'}" data-act="atticSel" data-v="${k}">${itemIc(k)}<span class="price">❤${L.price[k]}</span></button>`).join('')}</div></div></div>`;
      const k = S.atticSel, it = ITEMS[k]; const new_ = !L.unlocked.includes(k);
      h += `<div class="detail"><div class="card paper">${itemIc(k, 'big')}<div class="grow"><div class="nm ttlf">${esc(it.name)} ${new_ ? '<span class="chip r">还没找到过</span>' : `<span class="chip">箱子里 ${L.box[k] || 0}</span>`}${it.season ? ` <span class="chip g">${SEASON_NAME[it.season]}天限定</span>` : ''}</div><div class="ds">${esc(it.desc)}</div>
        <div class="ds" style="margin-top:3px">心意 ❤${L.heart}。窗台上的回礼越多，能翻出来的东西越多；阁楼里偶尔也会自己冒出点什么。</div>
        <div style="margin-top:6px"><button class="woodbtn green" data-act="unlock" data-v="${k}" ${L.heart >= L.price[k] ? '' : 'disabled'}>用 ❤${L.price[k]} 找出来</button></div></div></div></div>`;
    }
    return h + `</div>`;
  }
  // 愿望清单：工具架上的晾绳，木夹夹着纸签
  function viewWish(I) {
    const L = I.lenia; const R = (rw) => { const a = []; if (rw.item) a.push(Object.keys(rw.item).map(k => ITEMS[k].name).join('、')); if (rw.seeds) a.push(Object.keys(rw.seeds).map(k => SEEDS[k].name + '种子').join('、')); if (rw.heart) a.push('心意 ❤' + rw.heart); return a.join(' · '); };
    let h = `<div class="shed"><div class="beam wood plain"></div><button class="enamel cream sm press backbtn" style="left:10px;top:24px" data-act="close" title="返回">${icon('back')}</button><h2 class="ttlf">小镇愿望</h2>
      <div class="lline">${leniaMini()}<span>这是它们向“大好人”许的愿，我偷偷抄下来了。我们一起凑齐东西放进花园吧！</span></div><div class="scroll" style="max-height:calc(100vh - 210px)">`;
    h += `<div class="line"><div class="rope"></div><div class="tags">${L.tw.map(w => `<div class="wtag paper"><span class="pin"></span><div class="wart">${wishArt(w.k)}${av(w.who || 'chick', 'sm')}</div><div class="tt ttlf">${w.season ? `<span class="chip g" style="margin-bottom:3px">${SEASON_NAME[w.season]}天的愿望</span><br>` : ''}${esc(w.title)}</div>${w.say ? `<div class="lline sm">${leniaMini()}<span>${esc(w.say)}</span></div>` : ''}<div class="nd">需要：${esc(w.need)}</div>${w.k === 'flowers' || w.k === 'harvest' ? `<div class="needs2">${['daisy', 'sunflower', 'tulip'].map(k => `<span class="slot"><span style="width:60%;height:60%;border-radius:50%;background:radial-gradient(circle,${SEEDS[k].mid} 0 26%,${SEEDS[k].col} 28% 70%,rgba(0,0,0,0) 72%)"></span></span>`).join('')}</div>` : (w.items || []).length ? `<div class="needs2">${w.items.map(k => `<span class="slot">${itemIc(k)}</span>`).join('')}</div>` : ''}${seeds(w.p)}<div class="rw">实现后：${esc(R(w.reward))}</div>${w.p >= 1 ? '<span class="stamp">实现</span>' : ''}</div>`).join('')}</div></div>`;
    if (L.twDone.length) h += `<div class="sec">已经实现的愿望</div><div class="minis">${L.twDone.map(d => `<span class="mini paper"><span class="chip g">✓</span>${esc(d.title)} · 第${d.day}天</span>`).join('')}</div>`;
    const ws = I.res.filter(r => r.wish);
    h += `<div class="sec">居民各自的小心愿（点名字看名片）</div><div class="minis">${ws.length ? ws.map(r => `<button class="mini paper" data-act="res" data-v="${r.id}">${av(r.sp, 'sm')}<span><b>${esc(r.name)}</b> ${esc(r.wish.text.replace(r.name, ''))}</span></button>`).join('') : '<span class="muted">大家现在都挺满足的</span>'}</div>`;
    return h + `</div></div>`;
  }
  // 居民名片：黄铜夹档案板 + 右侧物种标签
  function viewRes(r, I) {
    const sps = SPECIES.filter(sp => I.res.some(x => x.sp === sp));
    const fr = r.friends.length ? r.friends.map(f => `<span class="chip r" data-act="res" data-v="${f.id}">${esc(f.name)}</span>`).join('') : '<span class="muted">还没有好朋友</span>';
    const mates = I.res.filter(x => x.sp === r.sp);
    return `<div class="board"><div class="brassclip"></div>${closeBtn}${S.resFrom === 'roster' ? '<button class="woodbtn rback" data-act="rosterBack" aria-label="回到居民名册">‹ 名册</button>' : ''}<div class="sidetabs">${sps.map(sp => `<button class="${sp === r.sp ? 'on' : ''}" data-act="spTab" data-v="${sp}" title="${SP_NAME[sp]}">${av(sp)}</button>`).join('')}</div>
      <div class="sheet2 paper"><div class="scroll" style="max-height:calc(100vh - 230px)"><div class="photo">${av(r.sp)}<div class="grow"><h3 class="ttlf">${esc(r.name)}</h3><div class="muted">${SP_NAME[r.sp]} · ${mates.length > 1 ? `镇上有 ${mates.length} 只${SP_NAME[r.sp]}` : '镇上唯一的' + SP_NAME[r.sp]}</div><div class="chips">${r.traits.map(t => `<span class="chip o">${TRAITS[t]}</span>`).join('')}</div></div></div>
      <div class="needs"><span>饱腹</span>${seeds(r.full / 100)}<span>精力</span>${seeds(r.energy / 100)}<span>心情</span>${seeds(r.mood / 100)}</div>
      ${r.away || r.trip ? `<div class="chip o" style="margin-top:8px;white-space:normal">${icon('map', 'chipic')}${esc(r.doing)}</div>` : ''}
      <div class="homerow">${homeIc(r)}<div class="grow"><div class="t"><span class="muted">住在</span> ${esc(r.home)}${r.owner ? ` · <span class="muted">店主</span> ${esc(r.owner)}` : ''}</div>
      <div class="t"><span class="muted">正在</span> ${esc(r.doing)}</div></div><span class="paw" title="爪印"><svg viewBox="0 0 40 40" width="26" height="26" style="margin-top:9px"><g fill="rgba(255,232,215,.92)"><ellipse cx="20" cy="26" rx="8" ry="7"/><circle cx="10" cy="16" r="3.6"/><circle cx="16" cy="10" r="3.6"/><circle cx="24" cy="10" r="3.6"/><circle cx="30" cy="16" r="3.6"/></g></svg></span></div>
      <div class="sec">吃的</div><div class="t feat0">最爱吃 ${foodIc(r.fav)}<b>${FOODS[r.fav].name}</b></div>${r.ate && r.ate.length ? r.ate.map(a => `<div class="t feat0">最近吃了 ${foodIc(a.f)}<b>${FOODS[a.f].name}</b>${a.fav ? ' <i class="fheart">♥</i>' : ''}<span class="muted"> · ${eatWhen(a)}</span></div>`).join('') : '<div class="muted">还没有新的进食记录</div>'}
      <div class="sec">心里的小愿望</div><div class="t">${r.wish ? esc(r.wish.text) : '<span class="muted">现在没什么特别想要的</span>'}</div>${r.dream ? `<div class="muted">记着一个梦：${esc(r.dream)}</div>` : ''}
      <div class="sec">好朋友</div><div>${fr}</div>
      <div class="sec">最近</div>${r.recent.length ? r.recent.map(x => `<div class="t">· ${esc(x)}</div>`).join('') : '<div class="muted">刚来不久</div>'}
      <div class="muted" style="margin-top:6px">拖过 ${r.hauled} 次东西 · 帮忙盖房 ${r.built} 回</div>
      ${r.away || r.trip ? '' : `<button class="woodbtn" style="margin-top:8px;width:100%" data-act="tripWith" data-v="${r.id}">${icon('map', 'chipic')} 邀请${esc(r.name)}去远行</button>`}</div>
      <div class="navrow"><button class="enamel cream sm press" data-act="resNav" data-v="-1" title="上一位">${icon('arrow-left')}</button><button class="woodbtn green" data-act="follow" data-v="${r.id}">跟着看看</button><button class="woodbtn" data-act="dreamFor" data-v="${r.id}">托个梦</button><button class="enamel cream sm press" data-act="resNav" data-v="1" title="下一位">${icon('arrow-right')}</button></div></div></div>`;
  }

  // ---------------------------------------------------------------- 居民名册（顶部人数小牌 + 名册面板）
  const SEEN_KEY = 'lenia-roster-seen';
  const seenSet = (() => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); } })();
  function rosterSeen(id) { if (seenSet.has(id)) return; seenSet.add(id); try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSet])); } catch (e) { /* 存不了也不影响 */ } }
  const reduceMotion = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
  function rosterTick(n) { // 人数小牌：数字变化时轻轻一跳（+1）/ 一沉（-1）；减少动态效果时只换数字
    const badge = $('rosterBtn'); if (!badge) return; const prev = S.rs.n; S.rs.n = n;
    $('rosterN').textContent = n > 999 ? '999+' : n; badge.setAttribute('aria-label', `居民 ${n} 位，打开居民名册`);
    if (prev == null || prev === n) return;
    $('rosterLive').textContent = n > prev ? '新邻居来了' : '一位邻居搬走了';
    if (reduceMotion()) return;
    const d = n - prev; badge.classList.remove('up', 'down'); void badge.offsetWidth; badge.classList.add(d > 0 ? 'up' : 'down');
    const f = document.createElement('i'); f.className = 'rfly ' + (d > 0 ? 'up' : 'down'); f.textContent = (d > 0 ? '+' : '−') + Math.abs(d); badge.appendChild(f);
    setTimeout(() => { f.remove(); badge.classList.remove('up', 'down'); }, 700);
  }
  const ACT_ORDER = ['进食', '照料', '制作', '休息', '散步', '其他', '远行'];
  const ACT_IC = { 进食: 'basket', 照料: 'watering-can', 制作: 'box', 休息: 'moon', 散步: 'seedbag', 其他: 'star', 远行: 'map' };
  const actOf = (r) => { if (r.away || r.trip) return '远行'; const d = r.doing || '';
    if (/吃|饱|面包|莓|蘑菇|菜|喝|点心/.test(d)) return '进食'; if (/浇|照料|种|打理|看顾|照看|雨|施肥/.test(d)) return '照料';
    if (/做|烤|修|盖|建|拖|改造|搬|钓|摘|收|装|造|整理|帮忙|缝/.test(d)) return '制作'; if (/睡|休息|歇|醒|躺|床|打盹/.test(d)) return '休息';
    if (/散步|转转|逛|晒|聊|广场|玩|走|看/.test(d)) return '散步'; return '其他'; };
  const isAway = (r) => !!(r.away || r.trip);
  const isNew = (r, I) => r.arr > 0 && I.day - r.arr <= 3 && !seenSet.has(r.id);
  const zh = new Intl.Collator('zh-Hans-CN-u-co-pinyin');
  const cmpName = (a, b) => zh.compare(a.name, b.name) || a.id - b.id;
  function rosterOrder(I) {
    const R = S.rs; const ids = new Set(I.res.map(r => r.id));
    if (!R.order) {
      const by = R.sort === 'home' ? (a, b) => zh.compare(a.home, b.home) || cmpName(a, b) : R.sort === 'name' ? cmpName : (a, b) => (ACT_ORDER.indexOf(actOf(a)) - ACT_ORDER.indexOf(actOf(b))) || cmpName(a, b);
      R.order = I.res.slice().sort(by).map(r => r.id);
    }
    R.order = R.order.filter(id => ids.has(id)); for (const r of I.res) if (!R.order.includes(r.id)) R.order.push(r.id); // 新来的排到最后，不挤动正在看的行
    return R.order;
  }
  const pips = (n, kind, label) => `<span class="pips ${kind}" role="img" aria-label="${label}${n}/5">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  const bubbleMark = '<svg class="rbub" viewBox="0 0 24 20" role="img" aria-label="头顶有气泡"><path d="M12 1.5C6 1.5 1.5 5 1.5 9.2c0 2.3 1.2 4.2 3.2 5.5L3.6 18.5l4.2-2.2c1.3.4 2.8.6 4.2.6 6 0 10.5-3.5 10.5-7.7S18 1.5 12 1.5z" fill="#fffaf0" stroke="#7a5420" stroke-width="1.5"/><g fill="#7a5420"><circle cx="7.5" cy="9.2" r="1.3"/><circle cx="12" cy="9.2" r="1.3"/><circle cx="16.5" cy="9.2" r="1.3"/></g></svg>';
  function homeKey(r) { return r.homeCombo ? 'combo_' + r.homeCombo : BACK[r.homeKind] || (r.homeKind && ITEMS[r.homeKind] ? r.homeKind : null); }
  function rosterRow(r, I, dense) {
    const away = isAway(r), cat = actOf(r), nw = isNew(r, I), hk = homeKey(r);
    const trs = r.traits.slice(0, dense ? 1 : 2).map(t => `<i class="rtr">${esc(TRAITS[t])}</i>`).join('');
    const st = away ? `<span class="rst away"><span class="rnone">— — —</span><span class="rnone">— — —</span></span>`
      : `<span class="rst"><span class="rl"><em>饱腹</em>${pips(Math.round(r.full / 20), 'leaf', '饱腹')}</span><span class="rl"><em>心情</em>${pips(Math.round(r.mood / 20), 'heart', '心情')}</span></span>`;
    return `<button class="rrow${away ? ' away' : ''}${dense ? ' dense' : ''}" data-act="rosterOpen" data-v="${r.id}" aria-label="${esc(r.name)}，${SP_NAME[r.sp]}，${away ? '出远门了' : esc(r.doing || '')}，打开名片">
      <span class="rav">${av(r.sp)}${r.bub && !away ? bubbleMark : ''}</span>
      <span class="rmain"><span class="rname"><b>${esc(r.name)}</b><i class="rsp">${SP_NAME[r.sp]}</i>${trs}${nw ? '<i class="rnew">新邻居</i>' : ''}</span>
      <span class="rdo">${icon(ACT_IC[cat], 'rdic')}<span>${away ? '出远门了' : esc(r.doing || '在附近转转')}</span></span>
      <span class="rhome">${hk ? itemIc(hk, 'rhic') : icon('hud-home', 'rhic')}<span>住在 ${esc(r.home)}</span></span></span>${st}</button>`;
  }
  const wide = () => matchMedia('(min-width:900px)').matches;
  function viewRoster(I) {
    const R = S.rs, N = I.res.length, away = I.res.filter(isAway).length;
    const ord = rosterOrder(I); const byId = new Map(I.res.map(r => [r.id, r]));
    const all = ord.map(id => byId.get(id)).filter(r => R.sp === 'all' || r.sp === R.sp);
    const w = wide(), PER = 8; const pages = Math.max(1, Math.ceil(all.length / PER)); if (R.page >= pages) R.page = pages - 1;
    const dense = !w && N >= 30 && !R.loose; const shown = w ? all.slice(R.page * PER, R.page * PER + PER) : all;
    const cnt = (sp) => I.res.filter(r => r.sp === sp).length;
    const tab = (sp, label, n, ic) => `<button class="rtab${R.sp === sp ? ' on' : ''}" data-sp="${sp}" data-act="rosterSp" data-v="${sp}" aria-pressed="${R.sp === sp}"><span class="rtic">${ic}</span><span class="rtt"><b>${label}</b><u>${n}</u></span></button>`;
    const filt = `<div class="rfilt"><button class="rtab all${R.sp === 'all' ? ' on' : ''}" data-act="rosterSp" data-v="all" aria-pressed="${R.sp === 'all'}"><b>全部</b><u>${N}</u></button>${SPECIES.map(sp => tab(sp, SP_NAME[sp], cnt(sp), av(sp))).join('')}</div>`;
    const sorts = [['doing', '在做什么'], ['home', '住哪'], ['name', '名字']];
    const sort = `<div class="rsort" role="group" aria-label="排序">${sorts.map(([k, n]) => `<button class="${R.sort === k ? 'on' : ''}" data-act="rosterSort" data-v="${k}" aria-pressed="${R.sort === k}">${n}</button>`).join('')}</div>`;
    const list = shown.length ? shown.map(r => rosterRow(r, I, dense)).join('') : `<div class="rempty">${N ? '还没有这类邻居' : '花园还在等第一位邻居'}<br><button class="woodbtn" data-act="rosterSp" data-v="all">看全部居民</button></div>`;
    const foot = w ? `<div class="rfoot"><span>点击居民，打开名片</span><span class="rpg"><button class="woodbtn" data-act="rosterPage" data-v="-1" ${R.page ? '' : 'disabled'} aria-label="上一页">‹</button><b>${all.length ? `${R.page * PER + 1} - ${Math.min(all.length, R.page * PER + PER)} / ${all.length}` : '0 / 0'}</b><button class="woodbtn" data-act="rosterPage" data-v="1" ${R.page < pages - 1 ? '' : 'disabled'} aria-label="下一页">›</button></span></div>`
      : `<div class="rfoot"><span id="rRange">点击居民，打开名片 · 共 ${all.length} 位</span>${N >= 30 ? `<button class="woodbtn" data-act="rosterDense">${dense ? '舒展' : '紧凑'}</button>` : ''}</div>`;
    return `<div class="rost${w ? ' desk' : ''}${dense ? ' dense' : ''}" role="dialog" aria-label="花园居民名册"><button class="enamel cream sm x2 press rx" data-act="close" title="关上" aria-label="关闭名册">${icon('close')}</button>
      <div class="rhead"><h2 class="ttlf">花园居民 ${N} 位</h2><div class="rsub">在家 ${N - away} · 远行 ${away}</div></div>${w ? `<div class="rbar">${filt}${sort}</div>` : `${filt}${sort}`}
      <div class="rbody"><div class="rlist scroll${w ? ' two' : ''}" data-n="${shown.length}">${list}</div></div>${foot}</div>`;
  }
  function rosterRange(sc) { // 手机长列表：底部写“显示 起 - 止 / 总数”
    const el = $('rRange'); if (!el || !sc || sc.classList.contains('two')) return; const rows = sc.querySelectorAll('.rrow'); if (!rows.length) return;
    const t = sc.getBoundingClientRect(); let a = 0, b = 0; rows.forEach((r, i) => { const q = r.getBoundingClientRect(); if (q.bottom > t.top + 8 && !a) a = i + 1; if (q.top < t.bottom - 8) b = i + 1; });
    el.textContent = rows.length > 6 ? `显示 ${a || 1} - ${b || rows.length} / ${rows.length} · 向上滑动继续查看` : `点击居民，打开名片 · 共 ${rows.length} 位`;
  }
  body.addEventListener('scroll', (e) => { if (e.target.classList && e.target.classList.contains('rlist')) rosterRange(e.target); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.view === 'roster' && sheet.classList.contains('open')) { close(); const b = $('rosterBtn'); if (b) b.focus(); } });
  matchMedia('(min-width:900px)').addEventListener('change', () => { if (S.view === 'roster') render(true); });
  // 窗台回礼：窗户（透出小镇）+ 窗台木板上的回礼
  function viewSill(I) {
    const L = I.lenia; const g = L.sill;
    const gifts = g.map((x, i) => x.type === 'note' ? `<button class="gift note" data-act="gift" data-v="${x.id}" style="animation-delay:${i * 0.06}s"><div class="paper">“${esc(x.text)}”</div><span class="gl">${esc(x.name)}的小纸条</span><span class="gf">❤${x.heart}</span></button>`
      : `<button class="gift" data-act="gift" data-v="${x.id}" style="animation-delay:${i * 0.06}s">${icon('gift:' + x.type)}<span class="gl">${GIFTS[x.type].name}</span><span class="gf" title="${esc(x.name)}送的">${esc(x.name)} ❤${x.heart}</span></button>`).join('');
    return `<div class="sill"><div class="win"><div class="gifts" style="--rows:${g.length > 4 ? 2 : 1}">${gifts || '<div class="empty" style="color:#fff3d8;text-shadow:0 1px 2px rgba(0,0,0,.5)">窗台上空空的。<br>小动物们会悄悄把回礼放在这里。</div>'}</div></div><div class="board2"><div class="sillnav"><button class="enamel cream sm press" data-act="close" title="返回">${icon('back')}</button><div class="ttlf" style="font-size:18px;color:#fff7e0;text-shadow:0 1px 0 rgba(60,30,10,.5)">Lenia 家的窗台 · ❤${L.heart}</div>
      <div class="gobtn"><button class="enamel green big press" data-act="giftAll" ${g.length ? '' : 'disabled'} title="全部收下">${icon('basket')}</button>全部收下</div></div>
      <div class="muted" style="text-align:center;color:#fff0d0">回礼是给“大好人”的——你和 Lenia 一起收下攒心意，可以去「阁楼」里找新的旧物、换花种。</div></div></div>`;
  }
  function cardHTML(c) {
    const on = S.album.some(a => a.id === c.id); const [tag, cl] = CARD_TAG[c.type] || ['', '']; const it = cardItem(c);
    const body = c.type === 'journey' ? `<div class="t">${esc(c.text.split('\n')[0])}</div><a class="lnk" data-act="letter" data-v="${c.id}">读整封游记（${c.text.split('\n').length} 段）</a>` : `<div class="t">${esc(c.text)}</div>`;
    return `<div class="polar paper ${SPECIAL.has(c.type) ? 'spec' : ''}"><span class="tape"></span><div class="row" style="align-items:flex-start">${it ? itemIc(it, 'thumb" style="width:52px;height:52px') : c.type === 'journey' ? icon('map', 'thumb" style="width:52px;height:52px') : ''}<div class="grow"><div class="ttl ttlf">${esc(c.title)}</div>${body}
      <div class="muted" style="margin-top:4px">${tag ? `<span class="chip ${cl}">${tag}</span> ` : ''}第${c.day}天 ${c.hm}${c.at ? ` · <a class="lnk" data-act="focus" data-v="${c.at.join(',')}">在哪儿</a>` : ''}${c.who && c.who.length ? ' · ' + c.who.map((id, i) => `<a class="lnk" data-act="res" data-v="${id}">${esc(c.names[i])}</a>`).join('、') : ''}</div></div>
      <button class="star press" data-act="collect" data-v="${c.id}" title="${on ? '已收藏' : '收进相册'}">${icon(on ? 'star' : 'star-o')}</button></div></div>`;
  }
  function groupCards(cards) {
    const out = []; const groups = new Map();
    for (const c of cards) { if (!MERGE.has(c.type)) { out.push(c); continue; } const k = c.type + '|' + c.day; let g = groups.get(k); if (!g) { g = { group: true, key: k, type: c.type, day: c.day, list: [] }; groups.set(k, g); out.push(g); } g.list.push(c); }
    return out.map(x => {
      if (!x.group) return cardHTML(x); if (x.list.length === 1) return cardHTML(x.list[0]);
      const open = S.openGroups.has(x.key); const names = [...new Set(x.list.flatMap(c => c.names || []))].slice(0, 6).join('、');
      return `<div class="polar paper"><div class="row" data-act="grp" data-v="${x.key}" style="cursor:pointer"><div class="grow"><div class="ttl ttlf">第${x.day}天 · ${mergeTitle(x.type, x.list.length)}</div><div class="muted">${esc(names)}</div></div><span class="chip">${open ? '收起' : '展开'}</span></div>${open ? `<div style="margin-top:10px">${x.list.map(cardHTML).join('')}</div>` : ''}</div>`;
    }).join('');
  }
  function viewAlbum(I) {
    const tabs = [['new', '新故事'], ['mine', `我的相册 ${S.album.length}`], ['dex', '图鉴']];
    let h = `<div class="book">${closeBtn}<div class="tabs" style="margin:2px 40px 12px 0">${tabs.map(([k, n]) => `<button class="${S.albumSub === k ? 'on' : ''}" data-act="sub" data-v="${k}">${n}</button>`).join('')}</div><div class="pages"><div class="scroll" style="max-height:calc(100vh - 200px);padding-top:8px">`;
    if (S.albumSub === 'new') h += S.cards.length ? groupCards(S.cards) : '<div class="empty">还没有故事，等一等。</div>';
    else if (S.albumSub === 'mine') h += S.album.length ? S.album.map(cardHTML).join('') : '<div class="empty">相册还是空的。<br>在「新故事」里点星星，就能把喜欢的片段收进来。</div>';
    else h += viewDex(I);
    return h + `</div></div></div>`;
  }
  function viewDex(I) {
    const L = I.lenia;
    let h = `<div class="sec">旧物图鉴（你放下过的东西，被改成了什么）</div><div class="dexg">`;
    for (const k of ITEM_KEYS) { const d = L.idex[k]; const it = ITEMS[k];
      h += `<div class="dexc paper ${d ? '' : 'no'}">${itemIc(k)}<div class="ttlf">${d ? esc(it.name) : '？？？'}</div><div class="chips" style="justify-content:center">${it.uses.map(u => d && d.uses.includes(u.name) ? `<span class="chip g">${esc(u.name)}</span>` : '<span class="chip">？</span>').join('')}</div></div>`; }
    h += `</div><div class="sec">组合惊喜</div><div class="dexg">`;
    for (const c of COMBOS) { const d = L.cdex[c.id], kn = !d && known(L, c.id); // 三态：拼出过（彩色）/ 知道配方没拼过（线稿 + 配方）/ 没见过（？？？）
      h += `<div class="dexc paper ${d ? '' : kn ? 'kn' : 'no'}">${itemIc('combo_' + c.id)}<div class="ttlf">${d || kn ? esc(c.name) : '？？？'}</div>${kn ? `<div class="rcpi mini">${itemIc(c.a)}<i>+</i>${itemIc(c.b)}</div><div class="muted">${ITEMS[c.a].name} + ${ITEMS[c.b].name}<br>已知配方 · 未拼过</div>` : `<div class="muted">${d ? `${ITEMS[c.a].name} + ${ITEMS[c.b].name} · 第${d.day}天` : '两样东西挨着放…'}</div>`}</div>`; }
    h += `</div><div class="sec">远方捡到的物件</div><div class="dexg">`;
    for (const k of OBJ_KINDS) { const c = I.cat[k]; h += `<div class="dexc paper ${c ? '' : 'no'}"><div class="ttlf">${c ? OBJ_NAME[k] : '？？？'}</div><div class="muted">${c ? `捡到 ${c.n} 次` : `${TEAM[k]} 人才拖得动`}</div>${c ? `<div class="chips" style="justify-content:center">${c.uses.map(u => `<span class="chip g">${esc(u)}</span>`).join('')}</div>` : ''}</div>`; }
    h += `</div><div class="sec">小材料</div><div class="paper" style="padding:8px">${MATS.map(m => `<span class="chip ${['twig', 'stone', 'grass'].includes(m) ? 'g' : 'o'}">${MAT_NAME[m]} ${I.mats[m] || 0}</span>`).join(' ')}</div>`;
    h += `<div class="sec">小镇的房子和设施</div>` + I.lots.filter(l => l.done).map(l => `<div class="polar paper" data-act="focus" data-v="${l.x.toFixed(1)},${l.z.toFixed(1)}" style="padding:8px 12px;cursor:pointer"><div class="ttl ttlf" style="font-size:14px">${esc(l.name)} ${l.tier ? `<span style="color:#d9822b">${'★'.repeat(l.tier)}</span>` : ''}</div>
      <div class="muted">${l.use === 'shared' ? '共享小屋' : l.use === 'shed' ? '储物棚' : l.use === 'deco' ? '摆设' : l.use === 'fac' ? '设施' : l.use === 'bridge' ? '桥' : l.use === 'shop' ? `${SHOP[l.shop].name} · 店主 ${esc(l.owner || '暂无')}${l.open ? ' · 开着门' : ''}` : (l.beds.length ? '住着 ' + l.beds.map(esc).join('、') : '空着')}</div></div>`).join('');
    return h;
  }
  function viewDream(I) {
    const can = I.lenia.heart >= I.dreamCost; let h = `<div class="book">${closeBtn}<div class="ttlf" style="color:#fff7e0;font-size:19px;margin:2px 0 10px 4px">托梦</div><div class="pages"><div class="scroll" style="max-height:calc(100vh - 190px)">
      <div class="paper" style="padding:10px 12px"><b class="ttlf">心意 ${icon('heart', 'chipic')} ${Math.floor(I.lenia.heart)}</b><div class="muted">夜里你和 Lenia 可以悄悄托个梦，告诉小动物远方有什么、哪里的果子熟了。一次花 ${I.dreamCost} 点心意；心意从窗台上的回礼里攒。</div></div>`;
    h += `<div class="sec">托梦给谁</div><div class="minis" style="justify-content:flex-start">` + I.res.map(r => `<button class="mini paper" style="${S.dreamRid === r.id ? 'outline:3px solid #d9473b' : ''}" data-act="drRes" data-v="${r.id}">${av(r.sp, 'sm')}${esc(r.name)}</button>`).join('') + `</div>`;
    const tg = [];
    for (const f of I.far) tg.push([`obj:${f.id}`, `远方草丛里的${f.name}`, '去村口外发现它']);
    for (const p of I.projs) if ((p.stage === 'gather' || p.stage === 'haul') && p.team < p.need) tg.push([`obj:${p.id}`, `正在拖的${OBJ_NAME[p.kind]}（${p.team}/${p.need}人）`, '去帮忙拖']);
    for (const s of I.rsc) tg.push([`res:${s.id}`, s.name, `${s.type === 'fish' ? '钓鱼' : s.type === 'veg' ? '收菜' : '摘莓果'} · 还剩 ${s.stock}`]);
    h += `<div class="sec">梦里出现什么</div>` + tg.map(([k, n, d]) => `<div class="polar paper" data-act="drTgt" data-v="${k}" style="padding:8px 12px;cursor:pointer;${S.dreamTarget === k ? 'outline:3px solid #d9473b' : ''}"><b>${esc(n)}</b><div class="muted">${esc(d)}</div></div>`).join('');
    const who = I.res.find(r => r.id === S.dreamRid);
    h += `<button class="woodbtn green" style="width:100%;padding:12px;margin:4px 0 8px;font-size:15px" data-act="drGo" ${can && who && S.dreamTarget ? '' : 'disabled'}>${!can ? '心意不够，去窗台收点回礼' : !who ? '先选一位居民' : !S.dreamTarget ? '再选梦里的东西' : `托梦给${esc(who.name)}（${I.dreamCost} 点）`}</button>`;
    if (S.dreamMsg) h += `<div class="muted" style="text-align:center;margin-bottom:6px">${esc(S.dreamMsg)}</div>`;
    h += `<div class="sec">托梦记录</div>` + (I.dreams.length ? I.dreams.map(d => { const [txt, c] = DREAM_ST[d.status]; return `<div class="polar paper"><div class="row"><div class="grow"><div class="t"><b>${esc(d.name)}</b> 梦见了${esc(d.label)}</div><div class="muted">第${d.day}天 ${d.hm}${d.note ? ' · ' + esc(d.note) : ''}</div></div><span class="chip ${c}">${txt}</span></div></div>`; }).join('') : '<div class="empty">还没有托过梦。</div>');
    return h + `</div></div></div>`;
  }
  // ---------------------------------------------------------------- 施工牌：点还没盖好的建筑 → 挂在木桩上的木牌 + 纸签（不进屋）
  const STG = ['开门窗', '装窗灯', '收尾'];
  const matIc = (m) => icon('mat:' + m, 'matic');
  function siteState(I, id) {
    const L = I.lenia.landed.find(l => l.id === id); if (L) return { kind: 'landed', L, item: L.item };
    const p = I.projs.find(p => p.lot === id); const lot = I.lots.find(l => l.id === id);
    if (p) return { kind: p.stage === 'renovate' ? 'reno' : 'haul', p, lot, item: p.item };
    if (lot && lot.done) return { kind: 'done', lot };
    return null;
  }
  function viewSite(I) {
    const id = S.siteId, st = siteState(I, id);
    const wrap = (inner) => `<div class="site"><div class="stake"></div><div class="signboard"><span class="pin l"></span><span class="pin r"></span>${closeBtn}<div class="sp paper"><div class="scroll" style="max-height:calc(100vh - 210px)">${inner}</div></div></div></div>`;
    if (!st) return wrap(`<h3 class="ttlf">这里空了</h3><div class="muted">${esc(S.siteMsg || '东西已经不在这儿了。')}</div>`);
    if (st.kind === 'done') return wrap(`<h3 class="ttlf">「${esc(st.lot.name)}」盖好啦</h3><div class="muted">施工牌已经摘下来了。</div><div class="sbtns"><div class="gobtn"><button class="enamel green big press" data-act="siteEnter" title="进去看看">${icon('eye')}</button>进去看看</div><div class="gobtn"><button class="enamel cream big press" data-act="siteMove" title="换个地方">${icon('hand')}</button>搬家</div></div>`);
    const p = st.p, mine = !!st.item && st.item !== 'combo';
    const what = st.item && ITEMS[st.item] ? `你放下的${ITEMS[st.item].name}` : st.item === 'combo' ? '你拼在一起的两件旧物' : `大家找到的${OBJ_NAME[p.kind] || '大物件'}`;
    const target = st.kind === 'landed' ? null : (st.lot && st.lot.use ? st.lot.name : p.name);
    const head = st.kind === 'landed' ? `${what} <span class="arrow">→</span> 还在商量用途` : st.kind === 'haul' ? `${what} <span class="arrow">→</span> 正在拖回来${target && p.use ? `，要改成「${esc(target)}」` : ''}` : `${what} <span class="arrow">→</span> 正在改成「${esc(target)}」`;
    let h = `<div class="sthead">${st.item && ITEMS[st.item] ? itemIc(st.item, 'big') : p && BACK[p.kind] ? itemIc(BACK[p.kind], 'big') : ''}<h3 class="ttlf">${head}</h3></div>`;
    // 三阶段进度（种子形进度点）
    const prog = st.kind === 'reno' ? p.prog : 0; const cur = st.kind === 'reno' ? Math.min(2, Math.floor(prog * 3 + 1e-6)) : -1;
    h += `<div class="stg">${STG.map((n, i) => { const f = clamp01(prog * 3 - i); return `<div class="sg ${f >= 1 ? 'done' : i === cur ? 'cur' : ''}"><i class="seed ${f >= 1 ? 'on' : ''}" style="--f:${f.toFixed(2)}"></i><b>${n}</b></div>`; }).join('<span class="dash"></span>')}</div>`;
    const miss = st.kind === 'reno' ? p.missing : [];
    if (st.kind === 'landed') h += `<div class="stline">${st.L.look ? `${st.L.look} 个小家伙围着看，正在七嘴八舌地商量` : '还没有小家伙发现它'}</div>${seeds(st.L.talk)}`;
    else if (st.kind === 'haul') h += `<div class="stline">${p.stage === 'gather' ? `正在召集人手：${p.team}/${p.need}` : `${p.team} 个小家伙拖着走，已经走了 ${Math.round(p.hp * 100)}%`}</div><div class="pbar"><i style="width:${Math.round((p.stage === 'gather' ? p.team / p.need * 0.3 : p.hp) * 100)}%"></i></div>`;
    // 还差的材料
    if (st.kind === 'reno') {
      if (p.paid < 3) { const cost = STAGE_COST[p.paid]; h += `<div class="sec">${miss.length ? '还差的材料（缺料停工了）' : `下一步「${STG[p.paid]}」要用的材料`}</div><div class="mats">${Object.entries(cost).map(([m, n]) => { const have = Math.min(n, Math.floor(I.mats[m] || 0)); const lack = miss.includes(m); return `<span class="mt ${lack ? 'lack' : ''}">${matIc(m)}<b>${MAT_NAME[m]}</b><em>${have}/${n}</em></span>`; }).join('')}</div>`; }
      else h += `<div class="sec">材料都到齐了，只差收尾</div>`;
    }
    // 正在干活的居民
    const who = (st.kind === 'landed' ? st.L.who : p.who || []).map(rid => I.res.find(r => r.id === rid)).filter(Boolean);
    h += `<div class="sec">${st.kind === 'landed' ? '围着看的小家伙' : st.kind === 'haul' ? '拖它的小家伙' : '在这儿干活的小家伙'}</div><div class="workers">${who.length ? who.map(r => `<button data-act="res" data-v="${r.id}" title="${esc(r.doing || '')}">${av(r.sp, 'sm')}<b>${esc(r.name)}</b></button>`).join('') : '<span class="muted">这会儿没人，大家去忙别的了</span>'}</div>`;
    // 大概还要多久
    const eta = p && p.eta > 0 ? Math.max(1, Math.round(p.eta / 60)) : 0;
    h += `<div class="eta">${icon('notes', 'chipic')}${st.kind === 'landed' ? '大家商量好了就动手' : miss.length ? '缺料停工：材料到了才能接着盖' : p.stage === 'gather' ? '人到齐就出发' : eta ? `大概还要 ${eta >= 60 ? Math.round(eta / 6) / 10 + ' 小时' : eta + ' 分钟'}（按 1× 算）` : '快好了'}</div>`;
    // 操作：托个梦 / 补材料 / 收回
    const dreamOk = st.kind === 'reno' && miss.length && I.lenia.heart >= I.dreamCost;
    const dreamWhy = st.kind !== 'reno' ? '开工以后缺材料时才用得上' : !miss.length ? '现在不缺材料' : I.lenia.heart < I.dreamCost ? `心意不够（${Math.floor(I.lenia.heart)}/${I.dreamCost}）` : `花 ${I.dreamCost} 点心意，托梦给一位相关的小家伙去找${miss.map(m => MAT_NAME[m]).join('、')}`;
    const src = miss.flatMap(m => matSources(I.lenia.box, m).map(([k]) => k)); const fillOk = st.kind === 'reno' && miss.length && src.length;
    const fillWhy = st.kind !== 'reno' ? '开工以后缺材料时才用得上' : !miss.length ? '现在不缺材料' : src.length ? `拆掉储物箱里的${[...new Set(src)].slice(0, 2).map(k => ITEMS[k].name).join('、')}补上` : `储物箱里没有能拆成${miss.map(m => MAT_NAME[m]).join('、')}的小东西`;
    const recallOk = mine && (st.kind === 'landed' || (p && p.recall));
    const mv = movable(I.lots.find(l => l.id === id) || { stage: 'far' });
    const recallWhy = !mine ? '这件不是你放下的' : recallOk ? '收回储物箱，下次再放' : '已经开工啦，收不回来了';
    const btn = (act, col, ic, name, ok, why) => `<div class="sbtn ${ok ? '' : 'off'}"><button class="enamel ${col} press" data-act="${act}" ${ok ? '' : 'disabled'} title="${esc(why)}">${icon(ic)}</button><b>${name}</b><small>${esc(why)}</small></div>`;
    h += `<div class="sbtns">${btn('siteDream', 'blue', 'moon', '托个梦', dreamOk, dreamWhy)}${btn('siteFill', 'green', 'box', '补材料', fillOk, fillWhy)}${mine ? btn('siteRecall', 'red', 'back', '收回', recallOk, recallWhy) : ''}${btn('siteMove', 'cream', 'hand', '挪一挪', mv.ok, mv.ok ? (st.kind === 'reno' ? '脚手架、材料和进度一起挪过去' : '拎起来换个地方，小家伙们会跟过去') : mv.why)}</div>`;
    if (S.siteMsg) h += `<div class="smsg paper">${esc(S.siteMsg)}</div>`;
    return wrap(h);
  }
  // 心声框：点头顶有气泡的居民，弹出放大版的同款气泡，说它此刻在想什么（文字由 shared/text.js 的 thoughtOf 按真实状态生成）
  function showThought(r, T) {
    const el = $('thought'); el.innerHTML = `<div class="tb"><button class="tx" data-act="thoughtX" title="收起">×</button><div class="th">${av(r.sp, 'sm')}<b>${esc(r.name)}</b><span class="muted">心里想的是</span></div>
      <div class="tm">${esc(T.main)}</div>${T.doing ? `<div class="ts">${esc(T.doing)}</div>` : ''}${T.wish ? `<div class="ts">${esc(T.wish)}</div>` : ''}
      <div class="tbtns"><button class="woodbtn green sm" data-act="thoughtRes" data-v="${r.id}">打开名片</button><button class="woodbtn sm" data-act="thoughtFollow" data-v="${r.id}">跟着它</button></div><i class="tt"></i></div>`; hydrate(el); el.classList.remove('open'); void el.offsetWidth; el.classList.add('open');
  }
  function hideThought() { $('thought').classList.remove('open'); }
  // 村口卡片：这条路通往人类的院子 + 最近真的发生过的远行和拖回的旧物
  function viewGate(I) {
    const i = S.gateId; const wrap = (inner) => `<div class="site thing"><div class="stake"></div><div class="signboard"><span class="pin l"></span><span class="pin r"></span>${closeBtn}<div class="sp paper"><div class="scroll" style="max-height:calc(100vh - 210px)">${inner}</div></div></div></div>`;
    const ds = DEST_KEYS.filter(k => DESTS[k].gate === i); const T = I.trip; const open = ds.filter(k => T.open.includes(k));
    const near = I.far.filter(f => { let b = 0, bd = 1e9; GATES.forEach((g, j) => { const d = Math.hypot(g[0] - f.x, g[1] - f.z); if (d < bd) { bd = d; b = j; } }); return b === i; });
    const log = (I.gateLog || []).filter(e => e.g === i).slice(-4).reverse(); const TAG = { out: '出发', back: '回来', haul: '拖回', far: '新东西' };
    const going = T.exp && DESTS[T.exp.dest] && DESTS[T.exp.dest].gate === i ? T.exp : null;
    let h = `<div class="sthead">${icon('map', 'big')}<h3 class="ttlf">村口 · 往花园外</h3></div><div class="stline">这条路通往人类的院子</div>`;
    h += `<div class="sec">路的那头</div><div class="tfx">${ds.map(k => T.open.includes(k) ? `<b>${esc(DESTS[k].name)}</b>：${esc(DESTS[k].desc)}` : `<b>？？？</b>：一个大家还没听说过的地方`).join('<br>')}</div>`;
    if (going) h += `<div class="tev">远行小队（${esc(going.names.join('、'))}）正在去${esc(going.name)}的路上。</div>`;
    h += `<div class="sec">门外现在</div>${near.length ? near.map(f => `<div class="tev">草坪上有一个${esc(f.name)}，还没有人发现。</div>`).join('') : '<div class="muted">草坪上暂时空空的。</div>'}`;
    h += `<div class="sec">最近从这里出发、回来的</div>${log.length ? log.map(e => `<div class="tev"><b>${TAG[e.k] || ''}</b> 第${e.day}天 ${esc(e.hm)} · ${esc(e.t)}</div>`).join('') : '<div class="muted">还没有谁从这里出去过。</div>'}`;
    h += `<div class="sbtns" style="margin-top:10px"><button class="woodbtn ${open.length ? 'green' : ''}" data-act="gateTrip" style="width:100%;padding:12px">派远行队从这里出发</button></div>${open.length ? '' : '<div class="muted" style="text-align:center;margin-top:4px">这条路通向的地方，大家还没去过。</div>'}`;
    return wrap(h);
  }
  // 鸡块的小卡片：转达 Lenia 的一句话（按真实状态挑）；带了礼物就写上
  function openNugget(d) { S.nug = d; api.select(null); setTab('nugget'); }
  function viewNugget(I) {
    const d = S.nug || {}; const wrap = (inner) => `<div class="site thing nug"><div class="stake"></div><div class="signboard"><span class="pin l"></span><span class="pin r"></span>${closeBtn}<div class="sp paper"><div class="scroll" style="max-height:calc(100vh - 210px)">${inner}</div></div></div></div>`;
    let h = `<div class="sthead"><img class="nugpic" src="assets/lenia/nugget-${d.gift ? 'surprised' : 'happy'}.png" alt="" onerror="this.style.display='none'"><h3 class="ttlf">鸡块</h3></div><div class="stline">Lenia 家的白团子，常在花园里蹦来蹦去</div>`;
    if (d.gift) h += `<div class="sec">还送来了</div><div class="tsrcs"><span class="tsrc">${d.gift.item ? itemIc(d.gift.item) : ''}<b>${esc(d.gift.name)}</b></span></div><div class="muted" style="margin-top:4px">${d.gift.item ? '已经放进 Lenia 的储物箱了' : '花种放进打理的种子袋了'}</div>`;
    else if (d.pending) h += `<div class="muted" style="margin-top:6px">它在怀里摸了摸……</div>`;
    if (d.ids && d.ids.length) h += `<div class="sec">好奇地围过来的</div><div class="workers">${d.ids.map(id => I.res.find(r => r.id === id)).filter(Boolean).map(r => `<button data-act="res" data-v="${r.id}">${av(r.sp, 'sm')}<b>${esc(r.name)}</b></button>`).join('')}</div>`;
    return wrap(h);
  }
  // 点右上角心意数字：说明卡片
  function viewHeart(I) {
    const L = I.lenia; const wrap = (inner) => `<div class="site thing"><div class="stake"></div><div class="signboard"><span class="pin l"></span><span class="pin r"></span>${closeBtn}<div class="sp paper"><div class="scroll" style="max-height:calc(100vh - 210px)">${inner}</div></div></div></div>`;
    const price = Object.values(L.price).filter(v => v > 0); const lo = price.length ? Math.min(...price) : 3, hi = price.length ? Math.max(...price) : 10;
    return wrap(`<div class="sthead">${icon('heart', 'big')}<h3 class="ttlf">心意 ${Math.floor(L.heart)}</h3></div><div class="stline">心意是小动物们送你的谢意</div>
      <div class="sec">怎么得到</div><div class="tfx">收下窗台上的回礼：每份 1～3 点。小镇的愿望、小家伙的小心愿实现时，也会多送你一点。</div>
      <div class="sec">能做什么</div><div class="tfx">去 Lenia 家的阁楼找新的旧物（${lo}～${hi} 点一件）、换花种；给小动物托个梦（${I.dreamCost} 点一次，也能在施工牌上托梦找缺的材料）。</div>
      <div class="sbtns" style="margin-top:10px"><button class="woodbtn green" data-act="goAttic" style="width:100%;padding:12px">去阁楼看看</button></div>`);
  }
  // ---------------------------------------------------------------- 小设施 / 摆设的小卡片：名字、由什么旧物改的、谁放的、谁改的、有什么用、最近在这儿发生的事
  function viewThing(I) {
    const wrap = (inner) => `<div class="site thing"><div class="stake"></div><div class="signboard"><span class="pin l"></span><span class="pin r"></span>${closeBtn}<div class="sp paper"><div class="scroll" style="max-height:calc(100vh - 210px)">${inner}</div></div></div></div>`;
    if (S.thingId === 'store') {
      const st = I.stores || {}; const sel = S.foodSel; const favs = (k) => I.res.filter(r => r.fav === k);
      let h = `<div class="sthead">${icon('hud-basket', 'big')}<h3 class="ttlf">公共粮筐</h3></div><div class="stline">大家一起采，一起吃</div>
        <div class="fgrid">${FOOD_SHOW.map(k => FOODS[k] ? `<button class="fcell${sel === k ? ' sel' : ''}" data-act="foodSel" data-v="${k}">${foodIc(k)}<span class="ftag">${FOODS[k].name}<b>×${num(Math.floor(st[k] || 0))}</b></span></button>`
          : `<button class="fcell na${sel === k ? ' sel' : ''}" data-act="foodSel" data-v="${k}">${foodIc(k)}<span class="ftag">${FOODS_NA[k].name}<b class="nb">暂无</b></span></button>`).join('')}</div>`;
      if (sel) h += FOODS[sel] ? `<div class="tfx" style="margin-top:8px"><b>${FOODS[sel].name}</b>：${esc(effectLine(sel))}${favs(sel).length ? `<br>最爱它的：${favs(sel).map(r => esc(r.name)).join('、')}` : ''}</div>` : `<div class="tfx" style="margin-top:8px"><b>${FOODS_NA[sel].name}</b>：${FOODS_NA[sel].note}，所以这里先空着。</div>`;
      const bk = I.lots.filter(l => l.done && l.use === 'shop' && (l.shop === 'bakery' || l.shop === 'food'));
      if (bk.length) h += `<div class="sec">面包从哪来</div>${bk.map(l => `<div class="tev">${esc(l.name)}${l.owner ? `（店主${esc(l.owner)}）` : ''}：店里 ${num(l.bread)} 块面包${l.baking ? '，炉子正烤着' : ''}${l.baked ? `，一共烤过 ${l.baked} 块` : ''}</div>`).join('')}<div class="muted">店主拿粮筐里的菜和莓果做原料，每炉 3 份原料出 3 块面包；没有原料就烤不出来。</div>`;
      h += `<div class="sec">最近谁吃了什么</div>${I.foodLog && I.foodLog.length ? I.foodLog.slice(0, 6).map(a => `<div class="feat" data-act="res" data-v="${a.id}">${av(a.sp, 'sm')}<span class="fwho"><b>${esc(a.name)}</b> 吃了${FOODS[a.f].name}${a.fav ? ' <i class="fheart">♥ 最爱</i>' : ''}<br><span class="muted">${eatWhen(a)}${a.at ? ' · ' + esc(a.at) : ''}</span></span>${foodIc(a.f)}</div>`).join('') : '<div class="muted">还没有新的进食记录</div>'}<div class="muted" style="text-align:center;margin-top:6px">只记录真实发生的进食</div>`;
      return wrap(h);
    }
    const l = I.lots.find(l => l.id === S.thingId); if (!l) return wrap(`<h3 class="ttlf">这里空了</h3><div class="muted">东西已经不在这儿了。</div>`);
    const cb = l.combo ? COMBOS.find(c => c.id === l.combo) : null; const src = cb ? [cb.a, cb.b] : l.item && ITEMS[l.item] ? [l.item] : BACK[l.kind] ? [BACK[l.kind]] : [];
    const ic = cb ? itemIc('combo_' + cb.id, 'big') : src[0] ? itemIc(src[0], 'big') : '';
    const from = src.length ? src.map(k => `<span class="tsrc">${itemIc(k)}<b>${esc(ITEMS[k].name)}</b></span>`).join('<span class="arrow">＋</span>') : `<span class="tsrc"><b>${esc(OBJ_NAME[l.kind] || '大物件')}</b></span>`;
    const who = cb ? '你把两件旧物挨着放，它们拼成了一个' : l.item ? '你放下的' : '大家从远方草坪上找到、拖回来的';
    const by = (l.by || []).map(id => I.res.find(r => r.id === id)).filter(Boolean);
    const fx = l.use === 'fac' && FAC[l.fac] ? FAC[l.fac].fx : l.use === 'bridge' ? '架在小溪上，小溪对岸也能放东西、去玩了' : '摆着好看';
    const ev = (l.ev || []).slice(-2).reverse();
    let h = `<div class="sthead">${ic}<h3 class="ttlf">${esc(l.name)}</h3></div>`;
    if (!l.done) h += `<div class="stline">还在施工中</div>`;
    h += `<div class="sec">由什么改的</div><div class="tsrcs">${from}</div><div class="muted" style="margin-top:4px">${who}</div>`;
    h += `<div class="sec">谁改的</div><div class="workers">${by.length ? by.map(r => `<button data-act="res" data-v="${r.id}">${av(r.sp, 'sm')}<b>${esc(r.name)}</b></button>`).join('') : '<span class="muted">大家一起弄的</span>'}</div>`;
    h += `<div class="sec">有什么用</div><div class="tfx">${esc(fx)}</div>`;
    h += `<div class="sec">最近在这儿</div>${ev.length ? ev.map(e => `<div class="tev">第${e.d}天 ${esc(e.hm)} · ${esc(e.t)}</div>`).join('') : '<div class="muted">还没有什么事，过一阵再来看看。</div>'}`;
    const mv = movable(l); h += `<div class="sbtns" style="margin-top:10px"><button class="woodbtn ${mv.ok ? 'green' : ''}" data-act="thingMove" ${mv.ok ? '' : 'disabled'} style="width:100%;padding:12px">${mv.ok ? (l.done ? '挪一挪（换个地方摆）' : '挪一挪（连工地一起挪）') : esc(mv.why)}</button></div>`;
    return wrap(h);
  }
  // ---------------------------------------------------------------- 远行：一张手绘地图（小镇在中间，虚线小路通向各个目的地）+ 行囊、队员、出发
  const DEST_IC = {
    picnic: `<rect x="-7" y="-5" width="14" height="10" rx="1" fill="#fbf3e4" stroke="#5a3a1e" stroke-width="1"/><path d="M-7 -1.7h14M-7 1.7h14M-3.5 -5v10M0 -5v10M3.5 -5v10" stroke="#d9473b" stroke-width="1.6" opacity=".8"/><circle cx="4" cy="-7" r="2.2" fill="#e8433a"/><path d="M4 -9.2v-1.6" stroke="#4f8f3e" stroke-width=".8"/>`,
    sill: `<rect x="-7" y="-8" width="14" height="12" rx="1" fill="#bfe3ff" stroke="#5a3a1e" stroke-width="1"/><path d="M0 -8v12M-7 -2h14" stroke="#5a3a1e" stroke-width="1"/><rect x="-9" y="4" width="18" height="2.6" fill="#c98a4e" stroke="#5a3a1e" stroke-width=".8"/><path d="M2.5 4l.5 -3h3l.5 3z" fill="#d0764a"/><circle cx="4.5" cy="-0.6" r="1.6" fill="#ff6f91"/>`,
    puddle: `<path d="M-9 1c1-5 7-6 10-4s8 0 8 4-6 6-10 5-9 0-8-5z" fill="#8fc6e8" stroke="#3b72b6" stroke-width="1"/><ellipse cx="-1" cy="1" rx="4" ry="1.6" fill="none" stroke="#fff" stroke-width=".8"/><path d="M3 -5l0 -3M5.5 -4l1 -3M1 -4.5l-1 -3" stroke="#3b72b6" stroke-width=".8" stroke-linecap="round"/>`,
    alley: `<path d="M-5 6l-2 -8h14l-2 8z" fill="#d0764a" stroke="#5a3a1e" stroke-width="1"/><path d="M-3 -2c0-5 3-5 3-8M2 -2c0-4 3-4 4-6" stroke="#4f8f3e" stroke-width="1.2" fill="none"/><circle cx="0" cy="-10" r="2.4" fill="#ff6f91"/><circle cx="6" cy="-8" r="2.2" fill="#ffd23f"/><circle cx="-5" cy="-6" r="2" fill="#c77dff"/>`,
    atticbox: `<path d="M-9 -2h18v9h-18z" fill="#c98a4e" stroke="#5a3a1e" stroke-width="1"/><path d="M-9 -2l3 -5h12l3 5" fill="#e0a564" stroke="#5a3a1e" stroke-width="1"/><path d="M-2 1h4" stroke="#5a3a1e" stroke-width="1.4"/><path d="M-12 -9l12 -6 12 6" fill="none" stroke="#9a5c2c" stroke-width="1.4"/>`,
    pond: `<ellipse cx="0" cy="1" rx="11" ry="6" fill="#7fc0d0" stroke="#3b72b6" stroke-width="1"/><path d="M-5 0a3.5 2.4 0 1 0 6 0l-3 0z" fill="#5fa14c" stroke="#3a7330" stroke-width=".6"/><circle cx="4" cy="2" r="1.6" fill="#5fa14c"/><circle cx="3.4" cy="1.4" r=".5" fill="#fff"/>`,
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const fmtLeft = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} 小时${m % 60 ? ' ' + (m % 60) + ' 分' : ''}` : `${m} 分钟`; };
  function tripMap(I) {
    const T = I.trip, e = T.exp; const H = 82; const X = (p) => p[0], Y = (p) => p[1] * 0.82; const town = [50, 45];
    const route = (k) => { const D = DESTS[k]; const a = [town[0], town[1]], b = [X(D.map), Y(D.map)]; const mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.18, my = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.18; return { a, b, c: [mx, my], d: `M${a[0]} ${a[1]}Q${mx.toFixed(1)} ${my.toFixed(1)} ${b[0]} ${b[1].toFixed(1)}` }; };
    let svg = `<svg viewBox="0 0 100 ${H}" class="tmap" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="98" height="${H - 2}" rx="3" fill="#f6ead0" stroke="#c9a46a" stroke-width="1"/><rect x="3" y="3" width="94" height="${H - 6}" rx="2" fill="none" stroke="#d9c094" stroke-width=".5" stroke-dasharray="1.5 1.5"/>
      <path d="M100 8C80 14 74 26 64 30S40 30 30 44 8 60 0 64" fill="none" stroke="#9cc9e6" stroke-width="4" stroke-linecap="round" opacity=".75"/><path d="M100 8C80 14 74 26 64 30S40 30 30 44 8 60 0 64" fill="none" stroke="#fff" stroke-width=".8" stroke-dasharray="2 4" opacity=".8"/>
      ${[[12, 12], [86, 56], [30, 74], [70, 72], [92, 20], [6, 44], [62, 52]].map(([x, y]) => `<g transform="translate(${x} ${y})" opacity=".55"><path d="M0 0c-2-3 0-6 3-5 1-3 6-2 5 2 3 0 3 4 0 4h-8c-2 0-2-1 0-1z" fill="#9cc77a"/></g>`).join('')}`;
    for (const k of DEST_KEYS) { const r = route(k); const open = T.open.includes(k); const on = e ? e.dest === k : S.trip.dest === k;
      svg += `<path d="${r.d}" fill="none" stroke="${on ? '#d9473b' : '#9a7a52'}" stroke-width="${on ? 1.4 : 0.9}" stroke-dasharray="${open ? '2.2 2' : '0.8 2.6'}" stroke-linecap="round" opacity="${open ? 1 : 0.45}"/>`; }
    svg += `<g transform="translate(${town[0]} ${town[1]})"><circle r="8.5" fill="#cfe6b4" stroke="#7a9a52" stroke-width="1"/><path d="M-5 2v-4l2.5-2.5 2.5 2.5v4zM1 2v-3l2-2 2 2v3z" fill="#e0a564" stroke="#5a3a1e" stroke-width=".7"/><circle cx="0" cy="-4.5" r="1.4" fill="#ffcf3a"/><text y="13" text-anchor="middle" font-size="4.2" font-weight="800" fill="#5a3a1e">小镇</text></g>`;
    for (const k of DEST_KEYS) { const D = DESTS[k]; const open = T.open.includes(k); const on = e ? e.dest === k : S.trip.dest === k;
      svg += `<g class="dpin ${on ? 'on' : ''}" data-act="tpDest" data-v="${k}" transform="translate(${X(D.map)} ${Y(D.map).toFixed(1)})"><circle r="10" fill="${on ? '#ffe7b0' : 'rgba(255,255,255,.01)'}" stroke="${on ? '#d9473b' : 'none'}" stroke-width="1" stroke-dasharray="2 1.4"/><g opacity="${open ? 1 : 0.35}" transform="scale(.82)">${DEST_IC[k] || ''}</g>${open ? '' : '<text y="3" text-anchor="middle" font-size="9" font-weight="900" fill="#7a5838">？</text>'}<text y="13" text-anchor="middle" font-size="3.8" font-weight="800" fill="${open ? '#4a3020' : '#9a7c5c'}">${open ? D.name : '还没去过'}</text></g>`; }
    if (e) { const r = route(e.dest); const u = e.phase === 'back' ? 0.12 : 0.08 + clamp01(e.frac) * 0.84; const q = (t) => [(1 - t) * (1 - t) * r.a[0] + 2 * t * (1 - t) * r.c[0] + t * t * r.b[0], (1 - t) * (1 - t) * r.a[1] + 2 * t * (1 - t) * r.c[1] + t * t * r.b[1]]; const p = q(u);
      svg += `<g transform="translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})"><circle r="4.4" fill="#fff8e6" stroke="#d9473b" stroke-width="1"/>${e.names.map((n, i) => `<circle cx="${((i - (e.names.length - 1) / 2) * 2.4).toFixed(1)}" cy="0.3" r="1.2" fill="${['#ffd75e', '#e9c79c', '#cfcfd6'][i % 3]}" stroke="#5a3a1e" stroke-width=".4"/>`).join('')}</g>`; }
    return svg + `<g transform="translate(9 10)" opacity=".85"><circle r="5" fill="none" stroke="#9a7a52" stroke-width=".6"/><path d="M0 -6l1.6 6h-3.2z" fill="#d9473b"/><path d="M0 6l1.6 -6h-3.2z" fill="#9a7a52"/><text y="-7.2" text-anchor="middle" font-size="3" fill="#7a5838">北</text></g></svg>`;
  }
  function viewTrip(I) {
    const T = I.trip, e = T.exp, L = I.lenia, tp = S.trip; const W = I.world;
    if (!T.open.includes(tp.dest)) tp.dest = T.open[0]; const items = ITEM_KEYS.filter(k => L.box[k] > 0); if (!items.includes(tp.item)) tp.item = items[0] || null;
    tp.rids = tp.rids.filter(id => { const r = I.res.find(r => r.id === id); return r && !r.away && !r.trip; });
    let h = `<div class="board mapboard"><div class="brassclip"></div>${closeBtn}<div class="sheet2 paper"><div class="scroll" style="max-height:calc(100vh - 150px)"><h3 class="ttlf" style="margin:0 0 4px;padding-right:50px">远行地图</h3>
      <div class="muted" style="padding-right:44px">挑一件旧物当行囊，选 2～3 个小家伙，去花园外面走一趟。离开几个小时（关掉网页也照样算），回来会带着稀奇的旧物、花种和一封游记。</div>${tripMap(I)}`;
    if (e) {
      const back = e.phase === 'back';
      h += `<div class="tripon paper"><b class="ttlf">${back ? '小队回来啦！' : '小队在路上'}</b><div class="t">${e.names.map(esc).join('、')} 背着${esc(ITEMS[e.item].name)}去了${esc(e.name)}。</div>
        ${back ? '<div class="muted">正从村口往回走，游记马上就到。</div>' : `<div class="pbar"><i style="width:${Math.round(e.frac * 100)}%"></i></div><div class="muted">已经走了 ${Math.round(e.frac * 100)}% · 大约还要 ${fmtLeft(e.left)}</div>`}</div>`;
    } else if (T.cd > 0) h += `<div class="tripon paper"><b class="ttlf">小队刚回来，在歇脚</b><div class="muted">再等 ${fmtLeft(T.cd)} 就能再出发了。</div></div>`;
    else {
      const D = DESTS[tp.dest]; const pk = tp.item ? packOf(tp.item) : null; const ms = tp.rids.map(id => I.res.find(r => r.id === id)).filter(Boolean);
      const tr = ms.flatMap(r => r.traits); const h0 = tp.item ? tripHours(tp.dest, tp.item, tr, W.season, 0) : D.hours[0], h1 = tp.item ? tripHours(tp.dest, tp.item, tr, W.season, 1) : D.hours[1];
      h += `<div class="sec">目的地 · ${esc(D.name)}</div><div class="t">${esc(D.desc)}<span class="muted"> 大约 ${h0 === h1 ? h0 : h0 + '～' + h1} 小时</span></div>`;
      h += `<div class="sec">行囊（从储物箱里挑一件，会被带走）</div>${items.length ? `<div class="hscroll"><div class="slots trow">${items.map(k => `<button class="slot ${tp.item === k ? 'sel' : ''}" data-act="tpItem" data-v="${k}">${itemIc(k)}<span class="n">${L.box[k]}</span></button>`).join('')}</div></div>` : '<div class="muted">储物箱空了，先去阁楼找点东西吧。</div>'}`;
      if (pk) h += `<div class="t" style="margin-top:4px"><b>${esc(ITEMS[tp.item].name)}</b>：${esc(pk.desc)}</div>`;
      h += `<div class="sec">队员（选 2～3 个，${tp.rids.length}/3）</div><div class="tres">${I.res.map(r => { const on = tp.rids.includes(r.id); const busy = r.away || r.trip; return `<button class="${on ? 'pick' : ''}" data-act="tpRes" data-v="${r.id}" ${busy ? 'disabled' : ''}>${av(r.sp, 'sm')}<b>${esc(r.name)}</b><span>${busy ? '在远行' : r.traits.map(t => TRAITS[t]).join('、')}</span></button>`; }).join('')}</div>`;
      const ok = tp.item && tp.rids.length >= 2;
      h += `<button class="woodbtn green" style="width:100%;padding:12px;margin:10px 0 4px;font-size:15px" data-act="tpGo" ${ok ? '' : 'disabled'}>${!tp.item ? '先挑一件行囊' : tp.rids.length < 2 ? '再选几个队员' : `出发去${esc(D.name)}！`}</button>`;
    }
    const lets = T.letters; if (lets.length) h += `<div class="sec">收到的游记</div>` + lets.map(l => `<button class="mini paper" style="width:100%;margin-bottom:6px" data-act="letter" data-v="${l.id}">${icon('map', 'chipic')}<span><b>${esc(l.title)}</b> · 第${l.day}天</span></button>`).join('');
    h += `<div class="muted" style="margin-top:6px">完成 ${T.done} 次远行${T.open.length < DEST_KEYS.length ? `，再走 ${DESTS[DEST_KEYS.find(k => !T.open.includes(k))].unlock - T.done} 次能打听到新地方` : '，地图上的地方都去过了'}。</div>`;
    return h + `</div></div></div>`;
  }
  function showLetter(c, fresh = false) {
    const paras = c.text.split('\n'); const on = S.album.some(a => a.id === c.id); const rp = c.recipe && COMBOS.find(x => x.id === c.recipe.id);
    $('letterB').innerHTML = `<div class="stampx">${icon('map')}</div><h3 class="ttlf">${esc(c.title)}</h3><div class="muted">第${c.day}天 · ${(c.names || []).map(esc).join('、')}寄来的</div>${rp && fresh ? `<button class="rnew" data-act="letterRecipe">${icon('item:combo_' + rp.id)}信里夹着一张新配方卡<span>点我看</span></button>` : ''}
      ${paras.map(p => `<p>${esc(p)}</p>`).join('')}${c.finds && c.finds.length ? `<div class="sec">带回来的东西（已经放进储物箱）</div><div>${c.finds.map(f => `<span class="chip o">${esc(f)}</span>`).join(' ')}</div>` : ''}
      ${rp ? `<div class="rcard ${fresh ? 'fresh' : ''}"><span class="rtape"></span><div class="rtag">${fresh ? '新学会一个拼法' : '路上学到的拼法'}</div><div class="rsay">${esc(c.recipe.line)}</div><div class="rwho">${recipeIcons(rp.a, rp.b, rp.id)}<span><b>${esc(ITEMS[rp.a].name)}</b> + <b>${esc(ITEMS[rp.b].name)}</b><br>能拼成 <b>${esc(rp.name)}</b></span></div><div class="rnote">去储物箱看看，把它们放在一起试试。</div></div>` : ''}
      <div class="row" style="margin-top:12px;gap:8px"><button class="woodbtn" style="flex:1" data-act="letterOk">收下</button><button class="woodbtn green" style="flex:1" data-act="letterKeep" data-v="${c.id}" ${on ? 'disabled' : ''}>${on ? '已经在相册里' : '收进相册'}</button></div>`;
    $('letter').classList.add('open'); hydrate($('letterB'));
  }
  // ---------------------------------------------------------------- 离开期间：一封信
  function showGift(g) {
    const items = Object.entries(g.items).map(([k, n]) => `<span class="chip o">${MAT_NAME[k]} ×${n}</span>`).join(' ');
    const hrs = g.hours >= 1 ? `${Math.round(g.hours)} 个小时` : `${Math.round(g.hours * 60)} 分钟`;
    const sill = (g.sill || []).map(s => `<span class="chip r">${esc(s.name)}的${GIFTS[s.type] ? GIFTS[s.type].name : '回礼'}</span>`).join(' ');
    $('giftB').innerHTML = `<h3 class="ttlf">你不在的时候</h3><div class="muted">你离开了 ${hrs}${g.hours >= 48 ? '（最多算两天）' : ''}，花园里照常过着日子。</div>
      ${sill ? `<div class="sec">窗台上多了几份回礼</div><div>${sill}</div>` : ''}
      ${g.season ? `<div class="st" style="border-left-color:#7fb8ec">${esc(g.season)}</div>` : ''}${g.trip ? `<div class="sec">远行小队</div><div class="st" style="border-left-color:#d9734f">${esc(g.trip)}</div>` : ''}
      <div class="sec">大家捡到的小东西</div><div>${items}</div>
      <div class="sec">几段小故事</div>${g.stories.map(s => `<div class="st">${esc(s.text)}</div>`).join('')}
      ${g.wish ? `<div class="sec">心愿</div><div class="st">${esc(g.wish)}</div>` : ''}
      <div class="muted" style="margin:8px 0">这些故事也放进了「相册 · 新故事」。</div>
      <button class="woodbtn green" style="width:100%;padding:12px;font-size:15px" data-act="giftOk">收下，去看看花园</button>`;
    $('gift').classList.add('open');
  }
  function onDreamResult(r) { S.dreamMsg = r.msg; if (r.ok) S.dreamTarget = null; render(); setTimeout(() => { S.dreamMsg = ''; }, 6000); }
  function onLenia(r) {
    if (r.act === 'siteDream' || r.act === 'siteFill' || r.act === 'siteRecall') { S.siteBusy = null; S.siteMsg = r.why || '';
      if (r.ok && r.act === 'siteRecall') { toast({ id: -Date.now(), type: 'notice', title: `${r.name}收回储物箱了`, text: r.why, item: r.item }); close(); return; }
      if (S.view === 'site') render(); else if (r.ok || r.why) toast({ id: -Date.now(), type: 'notice', title: r.ok ? '好啦' : '没成', text: r.why }); return; }
    if (!r.ok && r.why) toast({ id: -Date.now(), type: 'notice', title: '没成', text: r.why }); else if (r.act === 'unlock' || r.act === 'seed') toast({ id: -Date.now(), type: 'notice', title: '找到啦', text: r.why, item: r.act === 'unlock' ? S.atticSel : null });
    else if (r.act === 'trip' && r.ok) { S.trip.rids = []; toast({ id: -Date.now(), type: 'notice', title: '小队出发了', text: r.why }); close(); if (api.tripStart) api.tripStart(S.trip.going, S.trip.goRid); } }
  // ---------------------------------------------------------------- 储物箱：按住旧物，直接拖进花园
  // 按住约 0.3 秒（鼠标：明显拖动；手机：按住不动或横着拖）→ 格子里的旧物浮起；拖出箱沿 → 箱子往下收、交给 main.js 的放置模式（3D 手、大视野、边缘滚动、金圈、绿红判定都复用）；
  // 绿色处松手 = 放下；红色处松手 = 旧物飞回箱子并说明原因。手机上的纵向滑动（还没按够就移动）不会触发拖动。
  const HOLD_MS = 300, MOVE_TOL = 8;
  const dragTip = document.createElement('div'); dragTip.id = 'dragTip'; dragTip.className = 'paper ttlf'; dragTip.textContent = '按住旧物，拖进花园'; frame.appendChild(dragTip);
  let bd = null, tipTimer = 0;
  const cellOf = (k) => body.querySelector(`.slot[data-act="boxSel"][data-v="${k}"]`);
  const cleanCells = () => { for (const c of body.querySelectorAll('.slot.lift,.slot.away')) c.classList.remove('lift', 'away'); };
  const makeGhost = (k) => { const g = document.createElement('div'); g.id = 'dragGhost'; g.innerHTML = itemIc(k); hydrate(g); document.body.appendChild(g); return g; };
  const putGhost = (g, x, y) => { g.style.left = x + 'px'; g.style.top = y + 'px'; };
  function setTip(text, bad = false, ms = 0) { dragTip.textContent = text; dragTip.classList.toggle('bad', bad); clearTimeout(tipTimer); if (ms) tipTimer = setTimeout(() => { dragTip.textContent = '按住旧物，拖进花园'; dragTip.classList.remove('bad'); }, ms); }
  function dragStop() { if (!bd) return; clearTimeout(bd.timer); if (bd.ghost) bd.ghost.remove(); cleanCells(); dragTip.classList.remove('hot'); try { body.releasePointerCapture(bd.id); } catch (e) { } bd = null; }
  // 按住拿起的那一刻：箱子和详情立刻收走（只留底边一条细缝），旧物马上进放置模式、跟着手指，整个屏幕空出来看花园
  function dragArm() {
    if (!bd || bd.on) return; bd.on = true; dragTip.classList.add('hot');
    if (api.dragPlace && api.dragPlace(bd.k, { pointerId: bd.id, pointerType: bd.touch ? 'touch' : 'mouse', clientX: bd.x, clientY: bd.y })) { sfx('pickup'); bd.handed = true; bd.moved = true; document.body.classList.add('boxdrag'); sheet.classList.add('tuck'); const c = cellOf(bd.k); if (c) c.classList.add('away'); return; }
    sfx('pickup'); const c = cellOf(bd.k); if (c) c.classList.add('lift'); // 放置模式进不去（比如教程接管）：退回原来的浮起样子
    try { body.setPointerCapture(bd.id); } catch (e) { /* 不支持就算了 */ }
  }
  body.addEventListener('pointerdown', (e) => {
    if (bd || document.body.classList.contains('mode') || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const c = e.target.closest('.slot[data-act="boxSel"]'); if (!c || S.boxTab !== 'items') return; const k = c.dataset.v; if (!(S.info && S.info.lenia.box[k] > 0)) return;
    bd = { k, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', on: false, moved: false, handed: false, ghost: null };
    bd.timer = setTimeout(dragArm, HOLD_MS);
  });
  body.addEventListener('pointermove', (e) => {
    if (!bd || bd.handed || e.pointerId !== bd.id) return; bd.x = e.clientX; bd.y = e.clientY; const dx = e.clientX - bd.x0, dy = e.clientY - bd.y0, d = Math.hypot(dx, dy);
    if (!bd.on) {
      if (bd.touch ? (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.6) : d > 6) dragArm(); // 手机：横着拖算拖出；鼠标：明显拖动
      else if (bd.touch && d > MOVE_TOL) { dragStop(); return; } // 手机上还没按够就动了：是在滑动列表，不拿旧物
      if (!bd.on || bd.handed) return;
    }
    if (d < 5 && !bd.moved) return;
    if (!bd.moved) { bd.moved = true; const c = cellOf(bd.k); if (c) { c.classList.remove('lift'); c.classList.add('away'); } bd.ghost = makeGhost(bd.k); }
    const gy = e.clientY - (bd.touch ? 32 : 0); putGhost(bd.ghost, e.clientX, gy);
    const r = frame.getBoundingClientRect(); // 越过箱沿 8px：箱子下收，进入放置模式（同一次按压一路拖进花园）
    if (e.clientX < r.left - 8 || e.clientX > r.right + 8 || gy < r.top - 8) {
      if (api.dragPlace && api.dragPlace(bd.k, e)) { bd.handed = true; bd.ghost.remove(); bd.ghost = null; document.body.classList.add('boxdrag'); sheet.classList.add('tuck'); }
    }
  });
  const dragUp = (e) => {
    if (!bd || bd.handed || e.pointerId !== bd.id) return; const was = bd; dragStop();
    if (e.type === 'pointerup' && was.on && !was.moved) { S.boxSel = was.k; render(); } // 按住了但没拖：当作点选
    if (was.moved) { const stop = (ev) => ev.stopPropagation(); document.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', stop, true), 60); }
  };
  body.addEventListener('pointerup', dragUp); body.addEventListener('pointercancel', dragUp);
  document.addEventListener('touchmove', (e) => { if (bd && bd.on && e.cancelable) e.preventDefault(); }, { passive: false }); // 按住之后再动，不让列表跟着滚
  body.addEventListener('contextmenu', (e) => { if (e.target.closest('.slot')) e.preventDefault(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && bd && !bd.handed) dragStop(); });
  // 放置模式那边松手之后回来：放下了 → 关箱子；没放成 → 旧物飞回格子、箱子弹出来，并说明原因
  function boxDragDone() { sfx('drop'); document.body.classList.remove('boxdrag'); sheet.classList.remove('tuck'); dragStop(); close(); }
  function boxDragBack(pt, why, pick) {
    const k = bd && bd.k; if (pick && k != null) { S.boxSel = k; render(); } document.body.classList.remove('boxdrag'); dragStop(); if (k == null) { sheet.classList.remove('tuck'); return; }
    const g = makeGhost(k); putGhost(g, pt.x, pt.y);
    frame.style.transition = 'none'; sheet.classList.remove('tuck'); void frame.offsetWidth; const c = cellOf(k), r = c && c.getBoundingClientRect(); sheet.classList.add('tuck'); void frame.offsetWidth; frame.style.transition = ''; sheet.classList.remove('tuck');
    if (c) c.classList.add('away');
    const to = r ? [r.left + r.width / 2, r.top + r.height / 2] : [pt.x, pt.y];
    const an = g.animate([{ left: pt.x + 'px', top: pt.y + 'px', opacity: 1 }, { left: to[0] + 'px', top: to[1] + 'px', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'forwards' });
    const fin = () => { g.remove(); cleanCells(); const c2 = cellOf(k); if (c2) c2.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' }); };
    an.onfinish = fin; setTimeout(() => { if (g.isConnected) fin(); }, 700);
    if (why) { setTip(why, true, 2600); sfx('reject'); }
  }
  const boxPointIn = (x, y) => { const r = frame.getBoundingClientRect(); return sheet.classList.contains('tuck') ? y > r.top - 4 : x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  function holdGift(on) { S.giftHold = on; if (!on && S.pendingGift) { const g = S.pendingGift; S.pendingGift = null; if (!g.seen && S.giftShown !== g.id) { S.giftShown = g.id; showGift(g); } } }
  return { onInfo, onDreamResult, onLenia, openRes, openSite, openThing, openGate, openNugget, render, showThought, hideThought, setTab, close, toast, showLetter, holdGift, boxDragDone, boxDragBack, boxPointIn, get state() { return S; } };
}
