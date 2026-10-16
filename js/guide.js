// 第一次打开：由 Lenia 来带——先讲开场（她发现花园角落住着小动物，邀请你一起照顾，4 句），再带你走一遍：储物箱 → 挑一件放进花园 → 看它们把它变成什么。
// 可以随时跳过，只出现一次（localStorage 记一下）。老玩家（看过旧版 3 步引导的）只听开场那 4 句。
import { leniaFace } from './lenia-talk.js';
const KEY = 'lenia-intro-v2', OLD = 'lenia-guide-v1';
const seen = (k) => { try { return !!localStorage.getItem(k); } catch (e) { return true; } };
export function guideSeen() { return seen(KEY); }
export function startGuide(ui, { force = false, onDone = null } = {}) {
  if (!force && guideSeen()) { onDone && onDone(); return null; }
  const INTRO = [
    { text: '嘿，你来啦！跟你说个秘密——我家花园的角落里，住着一群小动物。' },
    { text: '小鸡、兔子、猫、小狗、鸭子，还有小熊……它们捡我们不要的旧东西搭房子，认真得不得了。' },
    { text: '它们不知道我们是谁，只当是天上掉下来的礼物，还管我们叫“大好人”。' },
    { text: '我一个人照顾不过来。你愿意跟我一起，悄悄照顾它们吗？', next: '好呀' },
  ];
  const TOUR = [
    { sel: '#toolbar [data-tab="box"]', title: '我的储物箱', text: '这是我从家里翻出来的旧东西：旧茶壶、雨靴、饼干盒、毛线球……都交给你啦。', go: () => ui.close() },
    { sel: '#sheetB [data-act="place"]', title: '挑一件，放进花园', text: '点一件旧物，再点「放进花园」，把它拖到喜欢的空地上放下。', top: true, go: () => { ui.state.boxTab = 'items'; ui.setTab('box'); } },
    { sel: null, circle: true, title: '然后我们躲远一点', text: '看看它们会把它变成什么——茶壶可能变成家，也可能变成澡堂，常常出乎意料哦！', go: () => ui.close() },
  ];
  const STEPS = force || !seen(OLD) ? [...INTRO, ...TOUR] : INTRO;
  const el = document.createElement('div'); el.id = 'guide';
  el.innerHTML = `<div class="hole"></div><div class="gcard paper"><div class="ghead"><span class="lbadge">${leniaFace()}</span><b class="ttlf">Lenia</b><span class="gstep"></span></div><h3 class="ttlf"></h3><p></p><div class="gbtns"><button class="woodbtn gskip">跳过</button><button class="woodbtn green gnext">下一步</button></div></div>`;
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('on'));
  const hole = el.querySelector('.hole'), card = el.querySelector('.gcard'); let i = 0, timer = 0;
  const place = () => {
    const s = STEPS[i]; const t = s.sel && document.querySelector(s.sel); const W = innerWidth, H = innerHeight;
    let r = t ? t.getBoundingClientRect() : s.circle ? { left: W / 2 - 70, top: H * 0.42 - 70, width: 140, height: 140 } : { left: W / 2, top: H * 0.42, width: 0, height: 0 };
    const pad = t || s.circle ? 8 : 0; hole.style.left = (r.left - pad) + 'px'; hole.style.top = (r.top - pad) + 'px'; hole.style.width = (r.width + pad * 2) + 'px'; hole.style.height = (r.height + pad * 2) + 'px'; hole.style.borderRadius = t ? '18px' : '50%';
    hole.classList.toggle('none', !t && !s.circle);
    const ch = card.offsetHeight, cw = Math.min(360, W - 32); card.style.width = cw + 'px'; card.style.left = Math.max(16, Math.min(W - cw - 16, r.left + r.width / 2 - cw / 2)) + 'px';
    const below = r.top + r.height + pad + 14, above = r.top - pad - 14 - ch;
    card.style.top = s.top ? 'calc(env(safe-area-inset-top,0px) + 20px)' : !t && !s.circle ? Math.round(H * 0.5 - ch / 2) + 'px' : (r.top + r.height / 2 > H / 2 ? Math.max(16, above) : Math.min(H - ch - 16, below)) + 'px';
  };
  const show = () => { const s = STEPS[i]; s.go && s.go(); card.querySelector('.gstep').textContent = `${i + 1} / ${STEPS.length}`; const h3 = card.querySelector('h3'); h3.textContent = s.title || ''; h3.style.display = s.title ? '' : 'none'; card.querySelector('p').textContent = s.text;
    card.querySelector('.gnext').textContent = i === STEPS.length - 1 ? '开始吧' : s.next || (s.sel || s.circle ? '下一步' : '嗯嗯'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; place(); setTimeout(place, 480); };
  let ended = false;
  const end = () => { if (ended) return; ended = true; try { localStorage.setItem(KEY, '1'); localStorage.setItem(OLD, '1'); } catch (e) { } clearInterval(timer); removeEventListener('resize', place); el.classList.remove('on'); ui.close(); setTimeout(() => el.remove(), 350); onDone && onDone(); };
  card.querySelector('.gskip').onclick = end;
  card.querySelector('.gnext').onclick = () => { if (++i >= STEPS.length) end(); else show(); };
  addEventListener('resize', place); timer = setInterval(place, 400); show();
  return { end, get step() { return i; }, get steps() { return STEPS.length; } };
}
