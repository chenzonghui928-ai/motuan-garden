// Lenia 说话：玩家的好朋友 Lenia 用小对话气泡（带她的小头像徽章）打招呼、在关键时刻说一句。只用文字（声音见 TODO）。
// 频率克制：关键时刻每真实 10 分钟最多 2 句；设置里能关。打招呼、开场和引导不受频率限制。
import { settings } from './settings.js';
import { ITEMS, COMBOS } from './shared/items.js';

// Lenia 的小头像：暖棕短发、刘海、黄色发夹、雀斑、红脸蛋，珊瑚色毛衣配碎花小圆领（程序化 SVG，和界面的描边风格一致）
export function leniaFace() {
  const OL = 'stroke="#5a3a1e" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-label="Lenia">
  <path d="M13 35c-2-15 6-25 19-25s21 10 19 25c-1 6-2 11-4 13H17c-2-2-3-7-4-13z" fill="#8a5232" ${OL}/>
  <path d="M10 64c2-9 10-13.5 22-13.5S52 55 54 64z" fill="#e9877a" ${OL}/>
  <path d="M24 51.5q8 5 16 0l-1.5 4q-6.5 3.5-13 0z" fill="#fbf4e6" ${OL}/><circle cx="28" cy="54" r="1" fill="#e98ea4"/><circle cx="36" cy="54" r="1" fill="#f4b844"/>
  <path d="M28 44h8v8h-8z" fill="#f6cfb2"/>
  <ellipse cx="32" cy="34" rx="13.5" ry="14.5" fill="#ffe4cf" ${OL}/>
  <path d="M17.5 31c-1 8 0 13 2.5 16.5h-4.5c-2.5-5-2.4-12 2-16.5zM46.5 31c1 8 0 13-2.5 16.5h4.5c2.5-5 2.4-12-2-16.5z" fill="#8a5232" ${OL}/>
  <path d="M18.4 31.5c0-11 6.4-17.5 14.6-17.5 8 0 14.2 6.2 14.2 14.6-4.2-.6-7.4-3.4-9.4-6.8-3 4.2-10 8-19.4 9.7z" fill="#9a5c36" ${OL}/>
  <path d="M27 18.5c3-2 7-2.4 10-1.2" stroke="#c4875a" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>
  <g transform="translate(42.5 21.5) rotate(28)"><rect x="-5.2" y="-1.9" width="10.4" height="3.8" rx="1.9" fill="#ffcf3a" ${OL}/><circle cx="-1.6" cy="0" r="1" fill="#e0393a"/><circle cx="1.6" cy="0" r="1" fill="#e0393a"/></g>
  <path d="M23.5 35q2.6-2.8 5.2 0M35.3 35q2.6-2.8 5.2 0" fill="none" stroke="#4a3020" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="22.6" cy="40" rx="3.3" ry="2.1" fill="#f59f95" opacity=".55"/><ellipse cx="41.4" cy="40" rx="3.3" ry="2.1" fill="#f59f95" opacity=".55"/>
  <g fill="#c07a4e"><circle cx="21.2" cy="38.2" r=".7"/><circle cx="23.6" cy="38.9" r=".7"/><circle cx="22.2" cy="40.6" r=".6"/><circle cx="42.8" cy="38.2" r=".7"/><circle cx="40.4" cy="38.9" r=".7"/><circle cx="41.8" cy="40.6" r=".6"/></g>
  <path d="M28.6 42.6q3.4 3.2 6.8 0" fill="#e0675d" stroke="#5a3a1e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

export const PORTRAITS = ['smile', 'happy', 'surprised', 'wave', 'thinking', 'sleepy', 'whisper'];
// 按语境挑表情：打招呼挥手（夜里困）、悄悄话、惊讶、开心、想事情，其余微笑
export function exFor(text, kind) {
  const h = new Date().getHours();
  if (kind === 'greet') return h >= 22 || h < 5 ? 'sleepy' : /早|你来啦/.test(text) ? 'wave' : 'smile';
  if (kind === 'cameo' || /嘘|悄悄|偷偷|别吓着|别让它们发现|小声/.test(text)) return 'whisper';
  if (/居然|哇|怎么|真的吗|诶/.test(text)) return 'surprised';
  if (/成了|太好了|帮上忙|回来啦|厉害|谢谢/.test(text)) return 'happy';
  if (/我们找找|想想|是不是|会不会|好像|不知道/.test(text)) return 'thinking';
  if (/晚安|困|睡/.test(text)) return 'sleepy';
  return 'smile';
}
const MOMENT_WINDOW = 600e3, MOMENT_MAX = 2; // 每真实 10 分钟最多 2 句
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function createLenia({ ui, onEvent = () => { } }) {
  const el = document.createElement('div'); el.id = 'lsay';
  el.innerHTML = `<div class="lport"><img alt="Lenia"></div><div class="lbadge" style="display:none">${leniaFace()}</div><div class="lbub paper"><b class="lname ttlf">Lenia</b><div class="ltxt"></div></div>`;
  document.body.appendChild(el);
  const txt = el.querySelector('.ltxt'), port = el.querySelector('.lport'), pimg = port.querySelector('img'), badge = el.querySelector('.lbadge');
  // 官方风格立绘（assets/lenia/*.png，按语境选表情）；图片缺了就退回小 SVG 头像
  pimg.onerror = () => { port.style.display = 'none'; badge.style.display = ''; };
  pimg.onload = () => { port.style.display = ''; badge.style.display = 'none'; };
  const setEx = (ex) => { const src = `assets/lenia/${PORTRAITS.includes(ex) ? ex : 'smile'}.png`; if (pimg.getAttribute('src') !== src) pimg.setAttribute('src', src); };
  setEx('smile');
  const S = { q: [], showing: null, hideT: 0, said: [], base: null, started: false, log: [] };
  el.addEventListener('click', () => hide());
  function hide() { clearTimeout(S.hideT); el.classList.remove('on'); document.body.classList.remove('lsay'); const was = S.showing; S.showing = null; if (was && was.done) was.done(); setTimeout(next, 450); }
  function next() {
    if (S.showing || !S.q.length) return;
    const m = S.q.shift(); S.showing = m; txt.textContent = m.text; setEx(m.ex || exFor(m.text, m.kind)); el.classList.add('on'); document.body.classList.add('lsay');
    S.log.unshift({ t: Date.now(), text: m.text, kind: m.kind }); if (S.log.length > 12) S.log.pop();
    clearTimeout(S.hideT); S.hideT = setTimeout(hide, m.dur || Math.min(11000, 3800 + m.text.length * 170));
  }
  // kind: greet（打招呼）/ moment（关键时刻，受频率限制）/ cameo（身影出现时，算在关键时刻里）/ force（测试、截图）
  function say(text, { kind = 'moment', dur = 0, done = null, ex = null } = {}) {
    if (!text) return false;
    if (kind !== 'force' && !settings().talk) return false;
    if (kind === 'moment' || kind === 'cameo') {
      const now = Date.now(); S.said = S.said.filter(t => now - t < MOMENT_WINDOW); if (S.said.length >= MOMENT_MAX) return false;
      if (S.q.length >= 2) return false; S.said.push(now);
    }
    S.q.push({ text, kind, dur, done, ex }); next(); return true;
  }
  // ---------------------------------------------------------------- 打招呼：结合真实状态
  function greetLine(info) {
    const I = info, W = I.world, L = I.lenia; const h = I.dayT * 24; const cards = (ui.state.cards || []);
    const hi = h >= 5 && h < 10 ? pick(['早呀！', '你来啦，早上好！']) : h >= 21 || h < 5 ? pick(['这么晚还来看它们呀。', '嘘——你来啦，它们大多睡了。']) : pick(['你来啦！', '嘿，你来啦！']);
    const news = [];
    const g = I.gift && !I.gift.seen ? I.gift : null;
    // 最近一次“你放下的东西被改成了什么”
    const lc = cards.find(c => (c.type === 'lenia' || c.type === 'combo') && /改成了「|组合惊喜/.test(c.title) && c.day >= I.day - 1);
    if (lc) {
      const m = /放下的(.+?)，被它们改成了「(.+?)」/.exec(lc.title); const who = (lc.names || [])[0];
      if (m && who) news.push(`${lc.day < I.day ? '昨天' : '刚才'}${who}${(lc.names || []).length > 1 ? '她们' : ''}把${m[1]}改成了「${m[2]}」，快去看看！`);
      else if (/组合惊喜：(.+?)！/.test(lc.title)) news.push(`我们放在一起的两样东西，变成了${/组合惊喜：(.+?)！/.exec(lc.title)[1]}！`);
    }
    if (g && g.stories && g.stories[0] && !news.length) news.push('你不在的时候它们可忙了，我都记在信里了——');
    else if (g) news.push('我把你不在时的事写成了一封信，等下给你看。');
    if (W && W.fest) news.push(`今天是${W.fest.name}！`);
    else if (W && W.wx === 'rain') news.push('外面在下雨，它们都躲到屋檐下了，我们小声点。');
    else if (W && W.wx === 'snow') news.push('下雪啦！说不定有人在堆雪人。');
    if (L.sill.length >= 3) news.push(`窗台上攒了 ${L.sill.length} 份回礼，我们一起去收吧！`);
    if (I.trip && I.trip.exp && I.trip.exp.phase === 'back') news.push('远行小队回来啦！');
    if (!news.length) news.push(pick(['今天想放点什么进花园？我把储物箱打开啦。', '它们今天看起来都挺开心的。', '我们去看看它们在忙什么吧。']));
    return hi + news.slice(0, 2).join('');
  }
  function greet(info, done) { const t = greetLine(info); if (!say(t, { kind: 'greet', dur: 6500, done })) { done && done(); } return t; }
  // ---------------------------------------------------------------- 关键时刻：对比每秒的 info 找变化
  function onInfo(I) {
    const L = I.lenia, W = I.world; const cur = { first: !!L.lstats.firstDone, combos: L.lstats.combos || 0, fest: L.lstats.festival || 0, trips: I.trip ? I.trip.done : 0, sill: L.sill.length, season: W ? W.season : '', cards: (ui.state.cards[0] || {}).id || 0 };
    const B = S.base; S.base = cur; if (!B || !S.started) return;
    const cards = ui.state.cards || [];
    // 小动物的小欢呼（音效）：改造完成、开店、新家、组合、节日
    for (const c of cards) { if (c.id <= B.cards) break; if (c.type === 'home' || c.type === 'shop' || c.type === 'combo' || c.type === 'festival' || (c.type === 'lenia' && /弄好了$/.test(c.title))) { onEvent('cheer'); break; } }
    if (cur.first && !B.first) { const F = L.lstats.firstDone; say(F.item ? `成了！它们真的把${F.item}改成了「${F.name}」……我们第一次帮上忙啦！` : `成了！「${F.name}」弄好了，我们第一次帮上忙啦！`); return; }
    if (cur.combos > B.combos) { const c = cards.find(c => c.type === 'combo' || /又一座/.test(c.title)); const cb = c && COMBOS.find(x => c.title.includes(x.name)); say(cb ? `哇，${ITEMS[cb.a].name}和${ITEMS[cb.b].name}挨在一起，居然变成了${cb.name}！它们比我们会玩多了。` : '哇，两样东西挨在一起，变出了新东西！'); return; }
    if (cur.fest > B.fest && W && W.fest) { say(`今天是${W.fest.name}！我们躲在篱笆后面看吧，别让它们发现。`); return; }
    if (cur.trips > B.trips) { say(pick(['小队回来啦！快看看它们写了什么游记。', '它们平安回来了！我刚才一直在窗边等。'])); return; }
    if (cur.season && B.season && cur.season !== B.season) { say({ spring: '春天来了！阁楼里的旧风筝，我好像找到了。', summer: '夏天了，晚上说不定能看到萤火虫。', autumn: '秋天啦，叶子都变黄了。它们会不会在准备过冬的东西？', winter: '冬天来了！它们会不会冷？我翻出了手套和毛线帽。' }[cur.season]); return; }
    if (cur.sill >= 5 && B.sill < 5) { say(pick(['窗台都快放不下了！这么多回礼，是给两个大好人的吧？', '窗台上堆满了回礼……它们是不是发现有两个大好人了？'])); return; }
  }
  function start() { S.started = true; }
  return { say, greet, greetLine, onInfo, start, hide, el, get log() { return S.log; }, get state() { return S; } };
}
