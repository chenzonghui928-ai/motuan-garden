// 第一次打开：由 Lenia 来带——先讲开场（她发现花园角落住着小动物，邀请你一起照顾，4 句），再手把手带你拼一次金圈：
// 储物箱 → 按住旧茶壶拖进花园（松手就放下）→ 再按住毛线球拖进茶壶旁边的金圈 → 拼成「毛线茶壶暖房」，镜头拉远看小动物们围着它施工、落成、欢呼。
// 可以随时跳过，只出现一次（localStorage 记一下）。看过 v2 引导的老玩家只补一张「两件旧物能拼在一起」的提示卡；更老的（v1）听开场 4 句再补提示卡。
// 教程期间茶壶带“等一等”标记（sim 里 lot.hold，不进存档、最长真实 5 分钟），小动物先不商量它的用途，免得金圈消失。
import { leniaFace } from './lenia-talk.js';
import { goldTarget } from './shared/items.js';
const KEY = 'lenia-intro-v3', V2 = 'lenia-intro-v2', OLD = 'lenia-guide-v1';
const seen = (k) => { try { return !!localStorage.getItem(k); } catch (e) { return true; } };
export function guideSeen() { return seen(KEY); }
const HOLD_MAX = 5 * 60e3;
export function startGuide(ui, { force = false, onDone = null, env = null } = {}) {
  if (!force && guideSeen()) { onDone && onDone(); return null; }
  env = env || { cheer() { }, focusWide() { }, hold: false, mode: { kind: null }, lots: () => [], boxCount: () => 0, goldRings: () => [], goldHole: () => null, send() { }, startMove() { }, focus() { } };
  const mode = env.mode; const S = { tid: null, pend: 0, crowd: 0, cx: 0, cz: 0, emptyT: 0, reopenT: 0, holdTimer: 0 };
  const slot = (k) => `#sheetB [data-act="boxSel"][data-v="${k}"]`, PLACE_BTN = '#sheetB [data-act="place"]';
  const openBox = () => { ui.state.boxTab = 'items'; ui.setTab('box'); };
  const lotOf = () => env.lots().find(l => l.id === S.tid) || null;
  const pendingOk = () => performance.now() - S.pend < 4000; // 刚点了「放这里」，结果还在路上
  // 储物箱里挑一件：按住格子拖进花园（一步到位，不再先点「放进花园」），茶壶和毛线球共用；进了放置模式就算过关
  const pickSteps = (item, afterPlace, texts, pre) => [
    { id: 'pick_' + item, ex: texts.ex, title: texts.t1, text: texts.p1, sel: slot(item), block: true, live: true, noNext: true, track: true, go() { if (pre && pre() === false) return; openBox(); },
      poll() { if (mode.kind === 'place' && mode.item === item) return goto(afterPlace); boxWatch(); } },
  ];
  const boxWatch = () => { if (ui.state.tab !== 'box' && !mode.kind && !pendingOk() && performance.now() - S.reopenT > 700) { S.reopenT = performance.now(); openBox(); } }; // 不小心关了储物箱：悄悄再打开
  const INTRO = [
    { ex: 'wave', text: '嘿，你来啦！跟你说个秘密——我家花园的角落里，住着一群小动物。' },
    { ex: 'smile', text: '小鸡、兔子、猫、小狗、鸭子，还有小熊……它们捡我们不要的旧东西搭房子，认真得不得了。' },
    { ex: 'happy', text: '它们不知道我们是谁，只当是天上掉下来的礼物，还管我们叫“大好人”。' },
    { ex: 'smile', text: '我一个人照顾不过来。你愿意跟我一起，悄悄照顾它们吗？', next: '好呀' },
  ].map((s, k) => ({ ...s, id: 'i' + k, count: k + 1 }));
  const TIP = { id: 'tip', ex: 'happy', title: '新发现：两件旧物能拼在一起', text: '地上有一件旧物的时候，拿另一件合得来的过来，旁边会亮起一个金圈。把东西放进金圈，它们就会拼成新的东西哦！', next: '知道啦', last: true };
  const OUTRO = (text, ex = 'smile') => ({ id: 'outro', ex, title: '金圈的用法', text, next: '开始吧', last: true });
  const TOUR = [
    { id: 'box', ex: 'smile', sel: '#toolbar [data-tab="box"]', title: '我的储物箱', text: '这是我从家里翻出来的旧东西：旧茶壶、雨靴、饼干盒、毛线球……都交给你啦。', go: () => ui.close(),
      next() { // 开局的茶壶放没放过？重新开引导 / 中途刷新页面时按现状接上
        if (env.boxCount('teapot') > 0) return 'pick_teapot';
        const T = env.lots().find(l => l.item === 'teapot' && goldTarget(l)); if (T && env.boxCount('yarn') > 0) { S.tid = T.id; return 'pick_yarn'; }
        return 'outro_none'; } },
    ...pickSteps('teapot', 'placing', { ex: 'smile', t1: '按住茶壶，拖进花园', p1: '我们先试试一个小魔法。用手指按住那把旧茶壶不放，把它拖进花园，在喜欢的空地上松手。' }, () => { env.hold = true; if (!S.holdTimer) S.holdTimer = setTimeout(() => finish(), HOLD_MAX); }),
    { id: 'placing', ex: 'smile', title: '把茶壶放下', text: '手指别松，把茶壶拖到喜欢的位置——绿色就是能放。松手，它就落在那儿啦。', sel: null, top: true, soft: true, live: true, noNext: true,
      click: (e) => { if (e.target.closest('#placeOk')) S.pend = performance.now(); },
      poll() { if (!mode.kind && !pendingOk()) goto('pick_teapot'); },
      act(m) { if (m.act !== 'drop') return; if (m.ok) { S.tid = m.id; env.hold = false; goto('pick_yarn'); } else S.pend = 0; } },
    ...pickSteps('yarn', 'ring', { ex: 'surprised', t1: '按住毛线球，拖进金圈', p1: '再拿一个毛线球——按住它拖出来，茶壶旁边会亮起一个金圈，把毛线球拖进金圈里松手吧。' }, () => { if (!env.boxCount('yarn')) { goto('bye'); return false; } }),
    { id: 'ring', ex: 'happy', title: '把毛线球放进金圈', sel: null, ring: true, top: true, soft: true, live: true, noNext: true, track: true,
      text() { return '手指别松，把毛线球拖进金圈里，圈会变亮——松手就放下。'; },
      go() { S.emptyT = 0; },
      click: (e) => { if (e.target.closest('#placeOk')) S.pend = performance.now(); },
      poll() {
        if (!mode.kind) { if (!pendingOk()) goto('pick_yarn'); return; }
        const T = lotOf(); if (!T) { S.noT = S.noT || performance.now(); if (performance.now() - S.noT > 4000) goto('bye'); return; } S.noT = 0; // 茶壶不见了（被商量走了）：友好结束
        if (!goldTarget(T)) return; // 茶壶被小动物抱去躲雨之类：等它放回来
        if (env.goldRings().length) { S.emptyT = 0; return; }
        S.emptyT = S.emptyT || performance.now(); if (performance.now() - S.emptyT > 700) goto('crowd'); },
      act(m) { if (m.act !== 'drop') return; if (!m.ok) { S.pend = 0; return; } if (m.combo) { S.cx = m.x; S.cz = m.z; S.cid = m.id; goto('building'); } else goto('miss'); } },
    { id: 'crowd', ex: 'thinking', title: '这里有点挤', text: '这里有点挤，放不下金圈。我们把茶壶挪到空一点的地方吧！', next: '好，挪一挪', top: true,
      go() { if (mode.kind) env.endMode(); if (++S.crowd > 3) { setTimeout(() => goto('outro_ring'), 0); } },
      next() { if (lotOf() && env.startMove(S.tid) !== false) return 'moving'; return 'outro_ring'; } },
    { id: 'moving', ex: 'smile', title: '挪一挪', text: '用手指把茶壶拖到一块空地，绿色就能放，然后点「挪到这」。', sel: '#placeOk', top: true, soft: true, live: true, noNext: true,
      click: (e) => { if (e.target.closest('#placeOk')) S.pend = performance.now(); },
      poll() { if (!mode.kind && !pendingOk()) goto('crowd'); },
      act(m) { if (m.act !== 'move') return; if (m.ok) setTimeout(() => goto('pick_yarn'), 900); else S.pend = 0; } },
    { id: 'miss', ex: 'thinking', title: '差一点点', top: true, live: true,
      text() { return env.boxCount('yarn') > 0 ? '差一点点！毛线球要落在金圈里面才行。你还有一个毛线球，再试一次吧！' : '毛线球用完啦……没关系，记住金圈的用法：手里的旧物和地上某件合得来，放进它旁边的金圈，就会拼在一起。下次再试试别的搭配吧！'; },
      next() { return env.boxCount('yarn') > 0 && lotOf() ? 'pick_yarn' : 'bye'; }, nextLabel() { return env.boxCount('yarn') > 0 ? '再试一次' : '好的'; } },
    { id: 'building', ex: 'surprised', title: '它们动手啦！', text: '快看，小动物们围过来了，正忙着把茶壶改成暖房……', clear: true, low: true, live: true, noNext: true,
      go() { env.hold = false; env.send({ type: 'lenia', act: 'holdOff' }); S.bT = performance.now(); setTimeout(() => env.focusWide(S.cx, S.cz), 450); },
      poll() { const l = env.lots().find(l => l.id === S.cid); const t = performance.now() - S.bT; if ((l && (l.done || l.stage === 'done')) || t > 45000 || (!l && t > 3000)) goto('done'); } },
    { id: 'done', ex: 'happy', title: '落成啦！', text: '哇！它们真的把茶壶穿上了毛衣，改成了暖房——这就是金圈的魔法。以后看到金圈，就试试把东西放进去！', clear: true, low: true, live: true, next: '太棒了',
      go() { env.cheer(); env.send({ type: 'lenia', act: 'celebrate', id: S.cid }); } },
    { id: 'dex', ex: 'smile', title: '还有很多搭配', text: '储物箱里的旧物还有很多种搭配，图鉴里能看到你拼出过的。慢慢试，常常出乎意料哦！', clear: true, low: true, live: true, next: '开始吧', last: true },
    { id: 'bye', ex: 'smile', title: '金圈的用法', text: '手里的旧物和地上某件合得来，放进它旁边的金圈，就会拼在一起。储物箱里的旧物还有很多种搭配，图鉴里能看到你拼出过的。', clear: true, low: true, live: true, next: '开始吧', last: true },
    { ...OUTRO('金圈的用法很简单：地上有一件旧物时，拿另一件合得来的放到它旁边亮起的金圈里，它们就会拼在一起。储物箱里的旧物有很多种搭配，图鉴里能看到你拼出过的。'), id: 'outro_none' },
    { ...OUTRO('这里实在有点挤，金圈放不下。不要紧，金圈的用法记住就好：地上有一件旧物时，拿另一件合得来的放进它旁边亮起的金圈里，它们就会拼在一起。', 'thinking'), id: 'outro_ring' },
  ];
  const first = force || !seen(OLD) ? 'full' : seen(V2) ? 'tip' : 'oldtip';
  const STEPS = first === 'tip' ? [TIP] : first === 'oldtip' ? [...INTRO, TIP] : [...INTRO, ...TOUR];
  const el = document.createElement('div'); el.id = 'guide';
  el.innerHTML = `<div class="gblk"></div><div class="gblk"></div><div class="gblk"></div><div class="gblk"></div><div class="hole"></div><div class="gcard paper"><div class="ghead"><span class="lbadge"></span><b class="ttlf">Lenia</b><span class="gstep"></span></div><h3 class="ttlf"></h3><p></p><div class="gbtns"><button class="woodbtn gskip">跳过</button><button class="woodbtn green gnext">下一步</button></div></div>`;
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('on'));
  const hole = el.querySelector('.hole'), card = el.querySelector('.gcard'), blk = [...el.querySelectorAll('.gblk')], badge = card.querySelector('.lbadge');
  let i = 0, raf = 0, last400 = 0, ended = false;
  const cur = () => STEPS[i];
  const holeRect = () => {
    const s = cur();
    if (s.ring) { const h = env.goldHole(); return h ? { left: h.x - h.r - 10, top: h.y - h.r - 10, width: 2 * h.r + 20, height: 2 * h.r + 20, circle: true, pad: 0 } : null; }
    if (s.sel) { const t = document.querySelector(s.sel); if (!t) return null; const r = t.getBoundingClientRect(); return r.width ? { left: r.left, top: r.top, width: r.width, height: r.height, pad: 8 } : null; }
    if (s.circle) return { left: innerWidth / 2 - 70, top: innerHeight * 0.42 - 70, width: 140, height: 140, circle: true, pad: 8 };
    return null;
  };
  const place = () => {
    const s = cur(); const W = innerWidth, H = innerHeight; const r = holeRect(); const pad = r ? r.pad : 0;
    el.classList.toggle('live', !!s.live); el.classList.toggle('clear', !!s.clear); hole.classList.toggle('soft', !!s.soft); hole.classList.toggle('trk', !!s.track);
    if (r) { hole.style.left = (r.left - pad) + 'px'; hole.style.top = (r.top - pad) + 'px'; hole.style.width = (r.width + pad * 2) + 'px'; hole.style.height = (r.height + pad * 2) + 'px'; hole.style.borderRadius = r.circle ? '50%' : '18px'; }
    hole.classList.toggle('none', !r);
    // 互动步骤：洞以外的地方挡住（免得点到别的东西），洞里放行
    const b = blk; if (s.block) { const L = r ? r.left - pad : 0, T = r ? r.top - pad : 0, R = r ? r.left + r.width + pad : W, B = r ? r.top + r.height + pad : H;
      const rects = r ? [[0, 0, W, T], [0, B, W, H - B], [0, T, L, B - T], [R, T, W - R, B - T]] : [[0, 0, W, H], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      b.forEach((d, k) => { const q = rects[k]; d.style.cssText = `display:block;left:${q[0]}px;top:${q[1]}px;width:${Math.max(0, q[2])}px;height:${Math.max(0, q[3])}px`; }); } else b.forEach(d => { d.style.display = 'none'; });
    const ch = card.offsetHeight, cw = Math.min(360, W - 32); card.style.width = cw + 'px';
    const cx = r ? r.left + r.width / 2 : W / 2; card.style.left = Math.max(16, Math.min(W - cw - 16, cx - cw / 2)) + 'px';
    const below = r ? r.top + r.height + pad + 14 : 0, above = r ? r.top - pad - 14 - ch : 0;
    card.style.top = s.top ? 'calc(env(safe-area-inset-top,0px) + 20px)' : s.low ? Math.max(16, H - ch - (W < 700 ? 128 : 40)) + 'px' : !r ? Math.round(H * 0.5 - ch / 2) + 'px' : ((r.top + r.height / 2 > H / 2 ? Math.max(16, above) : Math.min(H - ch - 16, below)) + 'px');
  };
  const show = () => {
    const s = cur(); s.go && s.go(); if (ended || cur() !== s) return;
    card.querySelector('.gstep').textContent = s.count ? `${s.count} / ${INTRO.length}` : '';
    badge.innerHTML = leniaFace(s.ex || 'smile');
    const h3 = card.querySelector('h3'); h3.textContent = s.title || ''; h3.style.display = s.title ? '' : 'none';
    const nb = card.querySelector('.gnext'); nb.style.display = s.noNext ? 'none' : '';
    const paint = () => { if (cur() !== s) return; card.querySelector('p').textContent = typeof s.text === 'function' ? s.text() : s.text; nb.textContent = s.nextLabel ? s.nextLabel() : s.last ? (s.next || '开始吧') : s.next || (s.sel || s.circle ? '下一步' : '嗯嗯'); };
    paint(); if (typeof s.text === 'function') setTimeout(() => { paint(); place(); }, 800); // 储物箱余量要等模拟回传，过一会儿再读一遍
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; place(); setTimeout(place, 480);
  };
  const goto = (id) => { const k = STEPS.findIndex(s => s.id === id); if (k < 0 || ended) return; i = k; show(); };
  function finish() {
    if (ended) return; ended = true; try { localStorage.setItem(KEY, '1'); localStorage.setItem(V2, '1'); localStorage.setItem(OLD, '1'); } catch (e) { }
    clearTimeout(S.holdTimer); cancelAnimationFrame(raf); removeEventListener('resize', place); removeEventListener('lenia-act', onAct); document.removeEventListener('click', onClick, true);
    env.hold = false; env.send({ type: 'lenia', act: 'holdOff' }); if (mode.kind === 'place' || mode.kind === 'move') env.endMode && env.endMode();
    el.classList.remove('on'); ui.close(); setTimeout(() => el.remove(), 350); onDone && onDone();
  }
  const end = finish;
  const onClick = (e) => { const s = cur(); s.click && s.click(e); };
  const onAct = (e) => { const s = cur(); s.act && s.act(e.detail); };
  const tick = (t) => { if (ended) return; const s = cur(); s.poll && s.poll(); if (!ended && (s.track || t - last400 > 400)) { last400 = t; place(); } raf = requestAnimationFrame(tick); };
  card.querySelector('.gskip').onclick = end;
  card.querySelector('.gnext').onclick = () => { const s = cur(); const nx = s.next && typeof s.next === 'function' ? s.next() : s.last ? null : STEPS[i + 1] && STEPS[i + 1].id; if (!nx) return end(); goto(nx); };
  addEventListener('resize', place); addEventListener('lenia-act', onAct); document.addEventListener('click', onClick, true); raf = requestAnimationFrame(tick); show();
  const handle = { end, get step() { return i; }, get id() { return cur().id; }, get steps() { return STEPS.length; }, get ended() { return ended; } };
  window.__guide = handle; return handle;
}
