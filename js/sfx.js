// 按键音效库（全部 Web Audio 程序合成，不加载任何音频文件）。
// 风格和 audio.js 里小动物的欢呼一致：短、软、圆润，像木头玩具和小铃铛，音量克制。
// 用法：audio.js 启动 AudioContext 后调用 bindSfx({ ctx, out, hidden })；其他地方 play('名字') 即可。
//   - 设置里“按键音效”(sfx) 关掉、音量(vol) 为 0、页面隐藏、AudioContext 还没创建时，play 什么都不做（不报错）。
//   - 每个音效都有“最短间隔”（默认 40ms），同一个音快速连按只响一次；统计在 stats() 里，测试用。
//   - 每个音效函数都是 (ctx, 出口节点, 开始时间, 参数) → 所以能直接拿 OfflineAudioContext 渲染成 wav 试听（tools/sfxrender.mjs）。
import { settings } from './settings.js';

const host = { ctx: () => null, out: () => null, hidden: () => false };
const last = {}; const stat = { played: {}, throttled: {}, blocked: 0, voices: 0 };
export const SFX_GAIN = 1.8; // 音效总线相对 vol 的增益（单个音很轻，整体抬一点，仍低于音乐的听感）
export function bindSfx(h) { Object.assign(host, h); }

// ---------------------------------------------------------------- 合成小积木
const NOISE = new WeakMap();
function noiseBuf(c) { let b = NOISE.get(c); if (!b) { b = c.createBuffer(1, Math.floor(c.sampleRate * 0.6), c.sampleRate); const d = b.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; } NOISE.set(c, b); } return b; }
function lp(c, f, q = 0.7, type = 'lowpass') { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
// 一个音：起音 a 秒，指数衰减到 dur；f→f2 滑音；vib=[频率, 深度(占 f 的比例)]；cut 低通
function tone(c, o, t, { f, f2, dur = 0.12, type = 'sine', vol = 0.12, a = 0.006, cut = 0, vib = null, glide = 0.8 }) {
  const osc = c.createOscillator(), g = c.createGain(); osc.type = type; osc.frequency.setValueAtTime(f, t);
  if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t + dur * glide);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  let node = osc; if (cut) { const l = lp(c, cut); osc.connect(l); node = l; } node.connect(g); g.connect(o);
  const end = t + a + dur + 0.04; osc.start(t); osc.stop(end);
  if (vib) { const v = c.createOscillator(), vg = c.createGain(); v.frequency.value = vib[0]; vg.gain.value = f * vib[1]; v.connect(vg).connect(osc.frequency); v.start(t); v.stop(end); }
  return osc;
}
// 一小撮带通噪声（沙沙、咔哒）
function puff(c, o, t, { f = 3000, q = 1, dur = 0.05, vol = 0.05, a = 0.004, f2 = 0 }) {
  const s = c.createBufferSource(); s.buffer = noiseBuf(c); const b = lp(c, f, q, 'bandpass'); if (f2) { b.frequency.setValueAtTime(f, t); b.frequency.exponentialRampToValueAtTime(f2, t + dur); }
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  s.connect(b).connect(g).connect(o); s.start(t, 0.05); s.stop(t + a + dur + 0.05);
}
// 小铃铛 / 钟琴：基音 + 两个泛音，圆润衰减
function bell(c, o, t, f, vol = 0.1, dur = 0.5) {
  tone(c, o, t, { f, dur, vol, a: 0.003 }); tone(c, o, t, { f: f * 2.01, dur: dur * 0.45, vol: vol * 0.32, a: 0.003 }); tone(c, o, t, { f: f * 3.98, dur: dur * 0.2, vol: vol * 0.1, a: 0.002 });
}
const semi = (f, n) => f * Math.pow(2, n / 12);

// ---------------------------------------------------------------- 各个音效
// 普通按钮：软软的“啵”（木头小鼓 + 气泡），三种音高
const pop = (f0, f1, vol = 0.14) => (c, o, t) => { tone(c, o, t, { f: f0, f2: f1, dur: 0.085, vol, a: 0.004, cut: 1800 }); puff(c, o, t, { f: 900, q: 0.8, dur: 0.02, vol: 0.02 }); };
const FN = {
  tool: pop(300, 520),                                                             // 工具栏 / 一般按钮：气泡上扬
  ok: (c, o, t) => { pop(400, 640)(c, o, t); tone(c, o, t + 0.07, { f: 960, f2: 1100, dur: 0.1, vol: 0.07, a: 0.004, cut: 2600 }); }, // 确认绿色按钮：啵 + 一点亮
  cancel: pop(330, 190, 0.13),                                                     // 取消 / 关闭：往下落
  xpop: pop(520, 330, 0.08),                                                       // 通知上的小叉：更小的啵
  open: (c, o, t) => { puff(c, o, t, { f: 2600, q: 1.5, dur: 0.018, vol: 0.07 }); tone(c, o, t, { f: 210, f2: 160, dur: 0.06, vol: 0.1, cut: 900 }); bell(c, o, t + 0.07, 1046, 0.08, 0.42); }, // 木盒打开：咔哒 + 叮
  close: (c, o, t) => { tone(c, o, t, { f: 280, f2: 170, dur: 0.07, vol: 0.12, cut: 800 }); puff(c, o, t, { f: 1800, q: 1.2, dur: 0.015, vol: 0.03 }); },  // 轻轻“嗒”
  page: (c, o, t) => { puff(c, o, t, { f: 3000, f2: 5200, q: 0.9, dur: 0.11, vol: 0.05, a: 0.02 }); puff(c, o, t + 0.07, { f: 4200, f2: 2600, q: 1.1, dur: 0.07, vol: 0.03, a: 0.012 }); }, // 翻纸：沙
  speed: (c, o, t, p) => { const lv = Math.max(0, Math.min(1, +p || 0)); const base = semi(587, lv * 10); [0, 4, 7].forEach((n, i) => bell(c, o, t + i * 0.055, semi(base, n), 0.075, 0.2)); }, // 上扬小音阶，档位越高越高
  pickup: (c, o, t) => { tone(c, o, t, { f: 250, f2: 520, dur: 0.18, vol: 0.12, a: 0.02, cut: 1500, vib: [14, 0.02] }); },        // 噗~
  drop: (c, o, t) => { tone(c, o, t, { f: 190, f2: 85, dur: 0.11, vol: 0.2, a: 0.003, cut: 700 }); puff(c, o, t, { f: 500, q: 0.7, dur: 0.04, vol: 0.03 }); bell(c, o, t + 0.09, 1760, 0.06, 0.3); bell(c, o, t + 0.15, 2349, 0.05, 0.35); }, // 咚 + 叮铃
  reject: (c, o, t) => { [[640, 470], [520, 380], [400, 290]].forEach(([a, b], i) => tone(c, o, t + i * 0.075, { f: a, f2: b, dur: 0.1, type: 'triangle', vol: 0.1, a: 0.008, cut: 1600, vib: [26, 0.04] })); }, // 俏皮的下行嘟噜
  combo: (c, o, t) => { const n = [0, 4, 7, 12, 16, 19, 24]; n.forEach((k, i) => bell(c, o, t + i * 0.075, semi(784, k), i === n.length - 1 ? 0.1 : 0.08, i === n.length - 1 ? 1.1 : 0.4)); puff(c, o, t + 0.45, { f: 7000, f2: 9000, q: 2, dur: 0.5, vol: 0.012, a: 0.1 }); }, // 钟琴琶音
  coin: (c, o, t) => { bell(c, o, t, 1568, 0.07, 0.16); bell(c, o, t + 0.06, 2093, 0.08, 0.34); },                                 // 小硬币叮
  notice: (c, o, t) => { bell(c, o, t, 1319, 0.075, 0.4); },                                                                        // 通知纸条：轻轻一声叮
  // 小动物叫声（p = 物种）
  chick: (c, o, t) => { [0, 0.09, 0.18].forEach((d, i) => tone(c, o, t + d, { f: 2500 + i * 150, f2: 3500 + i * 150, dur: 0.06, vol: 0.09, a: 0.008, vib: [40, 0.03] })); },
  duck: (c, o, t) => { [0, 0.15].forEach((d, i) => { const ts = t + d; tone(c, o, ts, { f: 360 - i * 30, f2: 270, dur: 0.1, type: 'sawtooth', vol: 0.08, a: 0.014, cut: 1100 }); }); },
  cat: (c, o, t) => { tone(c, o, t, { f: 520, f2: 880, dur: 0.14, vol: 0.09, a: 0.02, cut: 2200, vib: [7, 0.015] }); tone(c, o, t + 0.14, { f: 880, f2: 560, dur: 0.22, vol: 0.09, a: 0.004, cut: 1800, vib: [7, 0.02] }); },
  dog: (c, o, t) => { [0, 0.13].forEach((d, i) => { tone(c, o, t + d, { f: 320 - i * 25, f2: 190, dur: 0.07, type: 'sawtooth', vol: i ? 0.07 : 0.095, a: 0.006, cut: 900 }); puff(c, o, t + d, { f: 700, q: 0.8, dur: 0.025, vol: 0.02 }); }); },
  rabbit: (c, o, t) => { tone(c, o, t, { f: 330, f2: 390, dur: 0.22, vol: 0.1, a: 0.03, cut: 1200, vib: [6, 0.025], glide: 0.5 }); },
  bear: (c, o, t) => { tone(c, o, t, { f: 195, f2: 235, dur: 0.3, vol: 0.12, a: 0.05, cut: 650, vib: [5, 0.02], glide: 0.4 }); tone(c, o, t, { f: 390, dur: 0.25, vol: 0.02, a: 0.05, cut: 700 }); },
};
// 音效清单：中文名（试听文件名用）、最短间隔(ms)
const META = {
  tool: ['按钮·工具栏', 40], ok: ['按钮·确认', 40], cancel: ['按钮·取消关闭', 40], xpop: ['通知小叉', 40], open: ['打开面板储物箱', 120], close: ['关闭面板', 120], page: ['切页签翻纸', 90],
  speed: ['倍速', 60], pickup: ['拿起旧物', 200], drop: ['放下旧物', 200], reject: ['放不下回箱', 200], combo: ['金圈拼合成功', 400], coin: ['收下心意硬币', 70], notice: ['通知纸条', 150],
  chick: ['小鸡啾', 180], duck: ['鸭子嘎', 180], cat: ['猫喵', 180], dog: ['小狗汪', 180], rabbit: ['兔子嗯', 180], bear: ['小熊嗯', 180],
};
export const SFX_LIST = Object.keys(META);
export const SFX_LABEL = Object.fromEntries(Object.entries(META).map(([k, v]) => [k, v[0]]));
export const SFX_FN = FN; // 渲染试听用：FN[name](offlineCtx, offlineCtx.destination, 0, 参数)

// ---------------------------------------------------------------- 播放
export function canPlay() {
  const S = settings(); if (S.sfx === false || !(S.vol > 0)) return false; if (host.hidden() || (typeof document !== 'undefined' && document.hidden)) return false;
  const c = host.ctx(); return !!(c && host.out() && c.state !== 'closed');
}
export function play(name, p, opt = {}) {
  const fn = FN[name]; if (!fn) return false;
  if (!canPlay()) { stat.blocked++; return false; }
  const key = name + (name === 'speed' ? ':' + p : ''); const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()); const gap = opt.gap ?? META[name][1];
  if (last[key] != null && now - last[key] < gap) { stat.throttled[name] = (stat.throttled[name] || 0) + 1; return false; }
  last[key] = now; last['*' + name] = now;
  try { fn(host.ctx(), host.out(), host.ctx().currentTime + 0.005, p); stat.played[name] = (stat.played[name] || 0) + 1; return true; } catch (e) { stat.errors = (stat.errors || 0) + 1; return false; }
}
export const animal = (sp) => FN[sp] && ['chick', 'duck', 'cat', 'dog', 'rabbit', 'bear'].includes(sp) ? play(sp) : false;
export const sinceMs = (name) => { const t = last['*' + name]; return t == null ? Infinity : performance.now() - t; } // 距离上次响这个音多少毫秒
export function stats() { return { played: { ...stat.played }, throttled: { ...stat.throttled }, blocked: stat.blocked, errors: stat.errors || 0 }; }
export function resetStats() { stat.played = {}; stat.throttled = {}; stat.blocked = 0; stat.errors = 0; for (const k of Object.keys(last)) delete last[k]; }

// ---------------------------------------------------------------- 统一监听：按钮点击（事件委托，不用改具体按钮代码）
// 工具栏 .tool 的开关面板声音由 ui.js 的 setTab 管；倍速、确认、取消、普通按钮在这里按类别分。
const CANCEL_ACT = new Set(['close', 'letterOk']);
const OK_ACT = new Set(['place', 'plant', 'giftOk', 'giftAll', 'gift', 'drGo', 'tpGo', 'letterKeep', 'unlock', 'buySeed', 'collect', 'siteDream', 'siteFill', 'siteRecall', 'siteMove', 'thingMove', 'siteEnter', 'follow']);
const PAGE_ACT = new Set(['boxTab', 'sub', 'spTab']);
export function classify(el) {
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
  if (el.closest('#spdRow, #panel')) { if (el.closest('#panel')) return null; const row = [...el.closest('#spdRow').querySelectorAll('[data-spd]')]; const i = Math.max(0, row.indexOf(el)); return ['speed', row.length > 1 ? i / (row.length - 1) : 0]; }
  if (el.id === 'placeOk' || el.id === 'placeRot' || el.closest('#toolbar')) return null; // 放下的音由放置逻辑发；工具栏由 setTab 发
  const act = el.dataset && el.dataset.act;
  if (act === 'toastX' || act === 'thoughtX') return ['xpop'];
  if (act === 'toastChip' || act === 'toastMore' || act === 'toastLess' || act === 'toastAll') return ['tool'];
  if (el.id === 'placeNo' || el.id === 'tankExit' || el.id === 'intBack' || CANCEL_ACT.has(act) || el.classList.contains('x') || el.classList.contains('x2') || el.classList.contains('backbtn') || el.classList.contains('red')) return ['cancel'];
  if (PAGE_ACT.has(act) || el.closest('.tabs, .sidetabs')) return ['page'];
  if (OK_ACT.has(act) || el.classList.contains('green')) return ['ok'];
  return ['tool'];
}
let wired = false;
export function wireClicks() {
  if (wired || typeof document === 'undefined') return; wired = true;
  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return; // 程序里代点的（例如拖放松手时代点“放这里”）不响
    const el = e.target.closest && e.target.closest('button, .tool, [data-act], .woodbtn, .enamel, .tchip, .tmore'); if (!el) return;
    if (el.matches('.slot') && (sinceMs('drop') < 500 || sinceMs('reject') < 500 || sinceMs('pickup') < 800)) return; // 拖完旧物松手时的那一下 click 不响
    const r = classify(el); if (r) play(r[0], r[1]);
  }, true);
}
