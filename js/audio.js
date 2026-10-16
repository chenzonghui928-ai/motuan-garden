// 背景音乐 + 环境音（全部 Web Audio）。
// 音乐：assets/music/ 的 17 首，按游戏内时段（早晨/白天/傍晚/夜晚）和天气（雨天优先「栗子色的雨天小屋」）自动选曲（当前曲放完才换下一首，只有刚下雨会提前换），
//       两个播放器交叉淡入淡出（4 秒），同组内随机不重复。音量走 GainNode（iOS 上 audio.volume 是只读的）。
// 环境音：不加载任何音频文件，程序化合成——风（滤波噪声，随天气）、溪水（滤波噪声 + 慢调制，离溪近更响）、雨、
//       白天偶尔的鸟叫（FM 啾啾，春夏多）、夏夜虫鸣、小动物的小欢呼（改造完成、节日等）。整体音量克制，像鱼缸。
// 浏览器自动播放限制：第一次点击/触摸后才创建 AudioContext 开始播放。页面隐藏时淡出暂停，回来淡入。
import { settings, setSetting, onSetting } from './settings.js';
import { icon, hydrate } from './ui-art.js';

export const TRACKS = {
  'morning-light': '晨光', 'morning-light-alt': '晨光（另一版）', 'suno-morning-light-1': '晨光小调 · 一', 'suno-morning-light-2': '晨光小调 · 二', 'morning-walk': '早上散步', 'bread-by-the-window': '窗边的面包',
  'lakeside-stroll': '湖边散步', 'lakeside-stroll-alt': '湖边散步（另一版）', 'apple-basket-waltz': '苹果篮圆舞曲', 'mossy-pot': '长青苔的花盆', 'whimsical-adventure': '奇妙小冒险', 'porchlight-groove': '门廊灯下',
  'suno-dusk-at-bakery-1': '面包店的黄昏 · 一', 'suno-dusk-at-bakery-2': '面包店的黄昏 · 二',
  'suno-creekside-moonlight': '溪边月光', 'paper-moon-drift': '纸月亮',
  'chestnut-rain-room': '栗子色的雨天小屋',
};
export const GROUPS = {
  morning: ['morning-light', 'morning-light-alt', 'suno-morning-light-1', 'suno-morning-light-2', 'morning-walk', 'bread-by-the-window'],
  day: ['lakeside-stroll', 'lakeside-stroll-alt', 'apple-basket-waltz', 'mossy-pot', 'whimsical-adventure', 'porchlight-groove'],
  dusk: ['suno-dusk-at-bakery-1', 'suno-dusk-at-bakery-2'],
  night: ['suno-creekside-moonlight', 'paper-moon-drift'],
  rain: ['chestnut-rain-room'],
};
export const GROUP_NAME = { morning: '早晨', day: '白天', dusk: '傍晚', night: '夜晚', rain: '雨天' };
export function groupFor(dayT, wx) { if (wx === 'rain') return 'rain'; const h = dayT * 24; return h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night'; }
const FADE = 4, BASE = 'assets/music/';
const rnd = (a, b) => a + (b - a) * Math.random();

export function createAudio() {
  const A = { ctx: null, master: null, music: null, amb: null, decks: [], active: 0, cur: null, lastWx: null, failed: false, recent: {}, hidden: false, amb2: null, nextBird: 0, nextCricket: 0, crickets: 0, st: { dayT: 0.3, wx: 'sun', season: 'spring', rain: 0, near: 0.3 }, errors: 0, started: false, switches: 0 };
  const S = settings();
  // ---------------------------------------------------------------- 启动（需要一次用户手势）
  function boot() {
    if (A.ctx) { if (A.ctx.state === 'suspended' && !A.hidden) A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = A.ctx = new AC();
    A.master = ctx.createGain(); A.master.gain.value = 0; A.master.connect(ctx.destination);
    A.music = ctx.createGain(); A.music.connect(A.master); A.amb = ctx.createGain(); A.amb.connect(A.master);
    for (let i = 0; i < 2; i++) {
      const el = new Audio(); el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.setAttribute('playsinline', '');
      const g = ctx.createGain(); g.gain.value = 0; let src = null;
      try { src = ctx.createMediaElementSource(el); src.connect(g); } catch (e) { }
      g.connect(A.music); el.addEventListener('error', () => { A.errors++; if (A.decks[A.active] && A.decks[A.active].el === el && A.cur) A.failed = true; });
      A.decks.push({ el, g, name: null });
    }
    buildAmbient();
    applyVol(0.01); A.master.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
    A.started = true; ctx.resume();
    if (S.music) tick(true);
    if (ui) ui.refresh();
  }
  const kick = () => boot();
  for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, kick, { capture: true, passive: true });
  // ---------------------------------------------------------------- 音量
  function applyVol(tc = 0.25) {
    if (!A.ctx) return; const t = A.ctx.currentTime; const v = S.vol;
    A.music.gain.setTargetAtTime(S.music ? v : 0, t, tc); A.amb.gain.setTargetAtTime(S.amb ? v * 0.8 : 0, t, tc);
  }
  onSetting((k, v) => {
    if (!A.ctx) return; applyVol();
    if (k === 'music') { if (v) { const d = A.decks[A.active]; if (d.name) d.el.play().catch(() => { }); else tick(true); } else setTimeout(() => { if (!S.music) for (const d of A.decks) d.el.pause(); }, 1200); }
    if (ui) ui.refresh();
  });
  // ---------------------------------------------------------------- 选曲、淡入淡出
  function pickIn(group) {
    const list = GROUPS[group]; const last = A.recent[group] || []; const cur = A.cur && A.cur.name;
    let pool = list.filter(n => !last.includes(n) && n !== cur); if (!pool.length) pool = list.filter(n => n !== cur); if (!pool.length) pool = list;
    const n = pool[Math.floor(Math.random() * pool.length)];
    const r = (A.recent[group] = [...last, n]); while (r.length > Math.max(0, list.length - 1)) r.shift();
    return n;
  }
  function crossTo(name, group, fade = FADE) {
    const ctx = A.ctx; const t = ctx.currentTime; const old = A.decks[A.active]; const nd = A.decks[1 - A.active];
    nd.name = name; nd.el.src = BASE + name + '.mp3'; try { nd.el.currentTime = 0; } catch (e) { }
    nd.g.gain.cancelScheduledValues(t); nd.g.gain.setValueAtTime(0.0001, t); nd.g.gain.linearRampToValueAtTime(1, t + fade);
    if (S.music && !A.hidden) nd.el.play().catch(() => { });
    old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0, t + fade);
    const oe = old.el; setTimeout(() => { if (A.decks[A.active].el !== oe) oe.pause(); }, fade * 1000 + 150);
    A.active = 1 - A.active; A.cur = { name, group, t0: performance.now() }; A.switches++;
    if (ui) ui.refresh();
  }
  // 选曲规则：当前曲目必须完整放完，再从“此刻应处的分组”选下一首；时段变化不打断。
  // 例外：天气从非雨变成雨 → 8～10 秒淡出当前曲换雨天曲；加载出错 → 直接下一首；“下一首”按钮立即切。
  function tick(now = false) {
    if (!A.ctx || !S.music) return;
    const want = groupFor(A.st.dayT, A.st.wx); const raining = A.st.wx === 'rain'; const rainStart = raining && A.lastWx !== 'rain'; A.lastWx = A.st.wx;
    if (!A.cur) { crossTo(pickIn(want), want, 3); return; }
    const age = performance.now() - A.cur.t0;
    if (A.failed) { if (age > 800) { A.failed = false; crossTo(pickIn(want), want, 1); } return; } // 加载失败：跳下一首
    if (rainStart && A.cur.group !== 'rain') { crossTo(pickIn('rain'), 'rain', rnd(8, 10)); return; } // 刚下雨：慢慢换雨天曲
    const el = A.decks[A.active].el;
    if (el.ended) { crossTo(pickIn(want), want, 2); return; }
    if (el.duration && isFinite(el.duration) && el.duration - el.currentTime < 3 && age > 6000) crossTo(pickIn(want), want, 3); // 最后 3 秒与下一首衔接
    else if (el.paused && !A.hidden && el.readyState >= 2 && age > 3000) el.play().catch(() => { });
  }
  function next() { if (!A.ctx) { boot(); return; } const g = groupFor(A.st.dayT, A.st.wx); crossTo(pickIn(g), g, 3); }
  // ---------------------------------------------------------------- 环境音
  function buildAmbient() {
    const ctx = A.ctx; const sr = ctx.sampleRate; const buf = ctx.createBuffer(1, sr * 3, sr); const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; }
    const src = (rate, off) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, off); return s; };
    const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const lfo = (f, depth, target) => { const o = ctx.createOscillator(); o.frequency.value = f; const g = gain(depth); o.connect(g).connect(target); o.start(); return o; };
    // 风：低通噪声，音量慢慢起伏
    const wf = filt('lowpass', 420, 0.6), wg = gain(0), wm = gain(0.8); src(0.55, 0.3).connect(wf).connect(wm).connect(wg).connect(A.amb); lfo(0.07, 0.35, wm.gain); lfo(0.05, 120, wf.frequency);
    // 溪水：带通噪声 + 两层慢调制（哗啦哗啦）
    const sf = filt('bandpass', 1300, 0.9), sm = gain(0.75), sg = gain(0); src(1.0, 1.1).connect(sf).connect(sm).connect(sg).connect(A.amb); lfo(0.31, 0.22, sm.gain); lfo(0.17, 260, sf.frequency);
    const sf2 = filt('bandpass', 3400, 2.2), sm2 = gain(0.4); src(1.27, 2.0).connect(sf2).connect(sm2).connect(sg); lfo(0.73, 0.3, sm2.gain);
    // 雨：高通 + 低通噪声
    const rf = filt('highpass', 900, 0.5), rf2 = filt('lowpass', 7500, 0.5), rg = gain(0); src(1.18, 0.7).connect(rf).connect(rf2).connect(rg).connect(A.amb);
    A.amb2 = { wg, sg, rg };
  }
  function pan(v) { if (!A.ctx.createStereoPanner) return null; const p = A.ctx.createStereoPanner(); p.pan.value = v; return p; }
  function out(node, p) { if (p) { node.connect(p); p.connect(A.amb); } else node.connect(A.amb); }
  function bird(t) { // FM 合成的啾啾：2～5 个短音
    const ctx = A.ctx; const n = 2 + Math.floor(Math.random() * 4); const f0 = rnd(2600, 4400); const p = pan(rnd(-0.8, 0.8)); const vol = rnd(0.025, 0.06);
    for (let i = 0; i < n; i++) {
      const dur = rnd(0.06, 0.13), tt = t + i * rnd(0.09, 0.17); const o = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      m.frequency.value = rnd(30, 70); mg.gain.value = rnd(250, 900); m.connect(mg).connect(o.frequency);
      const f = f0 * rnd(0.9, 1.15); o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * rnd(0.7, 1.35), tt + dur);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(vol, tt + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
      o.connect(g); out(g, p); o.start(tt); m.start(tt); o.stop(tt + dur + 0.02); m.stop(tt + dur + 0.02);
    }
  }
  function cricket(t) { // 夏夜虫鸣：一串 3 个短脉冲
    const ctx = A.ctx; const f = rnd(4200, 4900); const p = pan(rnd(-0.9, 0.9)); const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0;
    const v = rnd(0.008, 0.016); for (let i = 0; i < 3; i++) { const a = t + i * 0.045; g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(v, a + 0.006); g.gain.linearRampToValueAtTime(0, a + 0.026); }
    o.connect(g); out(g, p); o.start(t); o.stop(t + 0.16);
  }
  function cheer() { // 小动物的小欢呼：几声上扬的“噗依”
    if (!A.ctx || !S.amb || A.hidden) return; const ctx = A.ctx; const t0 = ctx.currentTime + 0.05; const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * rnd(0.07, 0.22); const o = ctx.createOscillator(); o.type = 'triangle'; const f = rnd(800, 1500); const g = ctx.createGain(); const p = pan(rnd(-0.6, 0.6));
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = rnd(18, 28); vg.gain.value = f * 0.03; vib.connect(vg).connect(o.frequency);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rnd(1.3, 1.7), t + 0.09); o.frequency.exponentialRampToValueAtTime(f * 1.1, t + 0.16);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); out(g, p); o.start(t); vib.start(t); o.stop(t + 0.2); vib.stop(t + 0.2);
    }
  }
  function ambUpdate(dt) {
    const ctx = A.ctx, st = A.st, t = ctx.currentTime; const N = A.amb2; if (!N) return;
    const windBase = { sun: 0.1, cloud: 0.2, rain: 0.22, snow: 0.18 }[st.wx] ?? 0.12;
    N.wg.gain.setTargetAtTime(windBase, t, 2); N.sg.gain.setTargetAtTime(0.07 + st.near * 0.2, t, 1.5); N.rg.gain.setTargetAtTime(st.rain * 0.26, t, 1.5);
    if (!S.amb) return;
    const h = st.dayT * 24, day = h > 5.2 && h < 18.5, night = h > 20.5 || h < 4.5, wet = st.wx === 'rain' || st.wx === 'snow';
    const birdEvery = { spring: 5, summer: 6, autumn: 11, winter: 22 }[st.season] || 8;
    if (day && !wet) { if (!A.nextBird) A.nextBird = t + rnd(1, birdEvery); if (t >= A.nextBird) { bird(t + 0.05); A.nextBird = t + rnd(birdEvery * 0.4, birdEvery * 1.6); } } else A.nextBird = 0;
    const crk = night && !wet && (st.season === 'summer' ? 1 : st.season === 'autumn' || st.season === 'spring' ? 0.3 : 0);
    if (crk > 0) { if (!A.nextCricket || A.nextCricket < t) A.nextCricket = t + 0.1; while (A.nextCricket < t + 0.35) { if (Math.random() < crk) cricket(A.nextCricket); A.nextCricket += rnd(0.35, 0.9) / (st.season === 'summer' ? 1.6 : 1); } }
  }
  // ---------------------------------------------------------------- 每帧（主线程循环里调用，节流到 4 次/秒）
  let acc = 0;
  function update(dt, st) {
    Object.assign(A.st, st); if (!A.ctx || A.hidden) return; acc += dt; if (acc < 0.25) return; acc = 0;
    tick(); ambUpdate(0.25); if (ui && ui.isOpen()) ui.refresh();
  }
  // ---------------------------------------------------------------- 页面隐藏：淡出暂停；回来：淡入
  document.addEventListener('visibilitychange', () => {
    if (!A.ctx) return; const ctx = A.ctx;
    if (document.hidden) { A.hidden = true; A.master.gain.setTargetAtTime(0, ctx.currentTime, 0.15); setTimeout(() => { if (A.hidden) { for (const d of A.decks) d.el.pause(); ctx.suspend(); } }, 650); }
    else { A.hidden = false; ctx.resume(); A.master.gain.cancelScheduledValues(ctx.currentTime); A.master.gain.setValueAtTime(0.0001, ctx.currentTime); A.master.gain.setTargetAtTime(1, ctx.currentTime, 0.8); const d = A.decks[A.active]; if (S.music && d.name) d.el.play().catch(() => { }); }
  });
  // ---------------------------------------------------------------- 音乐盒面板
  let ui = null;
  function mount() { ui = musicBox(api); return ui; }
  const api = {
    boot, update, next, cheer, mount, groupFor,
    async seekNearEnd(sec = 4) { // 测试用：快进到接近结尾（静态服务器不支持 Range 时改用 blob 载入才能 seek）
      const d = A.decks[A.active], el = d.el; if (!d.name) return;
      const blob = await (await fetch(BASE + d.name + '.mp3')).blob(); el.src = URL.createObjectURL(blob);
      await new Promise(r => el.addEventListener('loadedmetadata', r, { once: true }));
      el.currentTime = Math.max(0, el.duration - sec); await el.play().catch(() => { });
    },
    state() { const d = A.decks[A.active]; return { ctx: A.ctx ? A.ctx.state : 'none', started: A.started, track: A.cur ? A.cur.name : null, title: A.cur ? TRACKS[A.cur.name] : null, group: A.cur ? A.cur.group : null, want: groupFor(A.st.dayT, A.st.wx), playing: d ? !d.el.paused : false, time: d ? d.el.currentTime : 0, gain: d ? d.g.gain.value : 0, switches: A.switches, errors: A.errors, canAAC: d ? d.el.canPlayType('audio/mp4; codecs="mp4a.40.2"') : '', settings: { ...S } }; },
  };
  return api;
}

// 音乐盒：HUD 右上的搪瓷钮 + 木面板（开/关音乐、开/关环境音、音量、正在播放、下一首、Lenia 说话）
function musicBox(audio) {
  const S = settings(); const btn = document.getElementById('musicBtn');
  const el = document.createElement('div'); el.id = 'mbox'; el.className = 'wood'; document.body.appendChild(el);
  el.innerHTML = `<h3 class="ttlf">${icon('musicbox')}音乐盒</h3><button class="enamel cream sm press x" data-mb="close" title="关上">${icon('close')}</button>
    <div class="now paper"></div>
    <div class="row"><button class="woodbtn" data-mb="music"></button><button class="woodbtn" data-mb="amb"></button></div>
    <label class="vol">音量<input type="range" min="0" max="100" step="1" data-mb="vol"></label>
    <div class="row"><button class="woodbtn" data-mb="next">下一首</button><button class="woodbtn" data-mb="talk"></button></div>
    <div class="hint">曲子会跟着花园里的时间和天气自己换；下雨天换成雨天的曲子。</div>`;
  hydrate(el);
  const now = el.querySelector('.now'), vol = el.querySelector('[data-mb="vol"]');
  const B = (k) => el.querySelector(`[data-mb="${k}"]`);
  let open = false, lastNow = '';
  function refresh() {
    const st = audio.state();
    B('music').textContent = S.music ? '音乐：开' : '音乐：关'; B('music').classList.toggle('on', S.music);
    B('amb').textContent = S.amb ? '环境音：开' : '环境音：关'; B('amb').classList.toggle('on', S.amb);
    B('talk').textContent = S.talk ? 'Lenia 说话：开' : 'Lenia 说话：关'; B('talk').classList.toggle('on', S.talk);
    if (document.activeElement !== vol) vol.value = Math.round(S.vol * 100);
    const h = !st.started ? '点一下画面，音乐盒就开始转了。<small>（浏览器要先有一次点击才能出声）</small>' : !S.music ? '音乐关着。<small>环境音和小动物的声音还在。</small>' : st.title ? `正在播放：《${st.title}》<small>${GROUP_NAME[st.group]}的曲子${st.want !== st.group ? ' · 放完后换成' + GROUP_NAME[st.want] + '的' : ''}</small>` : '正在挑曲子……';
    if (h !== lastNow) { now.innerHTML = h; lastNow = h; }
    btn.classList.toggle('off', !S.music && !S.amb);
  }
  function setOpen(v) { open = v; el.classList.toggle('open', v); if (v) refresh(); }
  btn.addEventListener('click', () => { audio.boot(); setOpen(!open); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mb]'); if (!b) return; const k = b.dataset.mb;
    if (k === 'close') setOpen(false);
    else if (k === 'music' || k === 'amb' || k === 'talk') setSetting(k, !S[k]);
    else if (k === 'next') { if (!S.music) setSetting('music', true); audio.next(); }
    refresh();
  });
  vol.addEventListener('input', () => setSetting('vol', vol.value / 100));
  document.getElementById('c').addEventListener('pointerdown', () => { if (open) setOpen(false); });
  refresh();
  return { refresh, setOpen, isOpen: () => open, el };
}
