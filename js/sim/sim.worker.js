// 模拟 Worker：每 0.2 秒（真实时间）推进 speed 个 0.2 秒的模拟步，发一份精简快照给主线程；每秒发一份“可读信息”给界面
import { Sim } from './sim-core.js';
import { DAY } from '../shared/layout.js';

const TICK_MS = 200, DT = 0.2;
let sim = null, speed = 1, paused = false, kinds = null, lastVer = -1, logN = 0, avg = 0, timer = 0, tickN = 0, lastCardVer = -1, realLast = 0;

function postStruct() { const st = sim.structure(); lastVer = st.ver; postMessage({ type: 'struct', st }); }
function postInfo(force = false) {
  const info = sim.info();
  if (force || info.cardVer !== lastCardVer) { info.cards = sim.cards; info.album = sim.album; lastCardVer = info.cardVer; }
  postMessage({ type: 'info', info });
}
function tick() {
  if (!sim || paused) return;
  const t0 = performance.now();
  const w0 = sim.wall, nowR = Date.now(); const realDt = realLast ? Math.min(Math.max(nowR - realLast, 0), 1000) : TICK_MS; realLast = nowR;
  for (let i = 0; i < speed; i++) sim.step(DT);
  sim.wall = w0 + realDt; // 远行/离开礼物按真实时间：倍速只加快小镇日子，不加快 wall
  const ms = performance.now() - t0; avg = avg ? avg * 0.9 + ms * 0.1 : ms;
  if (sim.ver !== lastVer) postStruct();
  const s = sim.snapshot();
  const log = sim.log.slice(logN); logN = sim.log.length; if (sim.log.length > 200) { sim.log.splice(0, 150); logN = sim.log.length; }
  postMessage({ type: 'snap', ...s, tickMs: ms, tickAvg: avg, speed, log }, [s.buf.buffer]);
  if (++tickN % 5 === 0) postInfo();
}
function save(reason) { postMessage({ type: 'save', data: sim.serialize(Date.now()), reason }); }
onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'init': kinds = m.kinds; sim = new Sim({ save: m.save, kinds, now: Date.now(), seed: m.seed }); logN = 0; postStruct(); postInfo(true); if (sim.gift) save('gift'); if (!timer) timer = setInterval(tick, TICK_MS); tick(); break;
    case 'speed': speed = m.v; break;
    case 'pause': paused = true; break;
    case 'resume': paused = false; realLast = 0; if (sim) sim.wall = Math.max(sim.wall || 0, Date.now()); break; // 切回来：把切走期间的真实时间补给远行
    case 'reset': sim = new Sim({ kinds, seed: (Math.random() * 1e6) | 0, now: Date.now() }); logN = 0; postStruct(); postInfo(true); tick(); break;
    case 'save': save(m.reason); break;
    case 'collect': sim.collect(m.id, m.on !== false); postInfo(true); save('collect'); break;
    case 'dream': { const r = sim.dream(m.rid, m.target); postMessage({ type: 'dreamResult', ...r }); postInfo(true); save('dream'); break; }
    case 'giftSeen': if (sim.gift) sim.gift.seen = true; postInfo(true); save('gift'); break;
    case 'advance': { const t0 = performance.now(); const n = Math.round(m.sec / DT); for (let i = 0; i < n; i++) sim.step(DT); postMessage({ type: 'advanced', ms: performance.now() - t0, steps: n }); postStruct(); postInfo(true); tick(); break; }
    case 'setTime': { const day = Math.floor(sim.t / DAY); sim.t = (day + (m.next ? 1 : 0)) * DAY + m.dayT * DAY; postInfo(true); tick(); break; }
    case 'away': { sim.savedAt = Date.now() - m.ms; sim.gift = null; sim.makeGift(Date.now()); postInfo(true); save('gift'); break; }
    case 'stress': sim.stress(m.n || 40); postStruct(); postInfo(true); tick(); break;
    case 'lenia': { // 玩家（Lenia 的好朋友）的动作：放东西 / 种花 / 浇水 / 收回礼 / 解锁旧物 / 买花种
      let r;
      if (m.act === 'drop') r = sim.dropItem(m.item, m.x, m.z, m.rot || 0, !!m.hold);
      else if (m.act === 'holdOff') r = sim.releaseHold();
      else if (m.act === 'celebrate') r = sim.celebrate(m.id);
      else if (m.act === 'plant') r = sim.addFlower(m.x, m.z, m.seed);
      else if (m.act === 'water') r = sim.waterAt(m.x, m.z, m.r || 4);
      else if (m.act === 'gift') r = sim.takeGift(m.id);
      else if (m.act === 'unlock') r = sim.unlockItem(m.item);
      else if (m.act === 'seed') r = sim.buySeed(m.seed);
      else if (m.act === 'trip') r = sim.startTrip(m);
      else if (m.act === 'siteFill') r = sim.siteFill(m.id);
      else if (m.act === 'siteRecall') r = sim.siteRecall(m.id);
      else if (m.act === 'mascot') r = sim.mascotGift(m.who, m.x, m.z);
      else if (m.act === 'movePrep') r = sim.movePrep(m.id);
      else if (m.act === 'move') r = sim.moveLot(m.id, m.x, m.z, m.rot || 0);
      else if (m.act === 'siteDream') { const d = sim.siteDream(m.id); r = { ok: d.ok, why: d.msg, rid: d.rid }; }
      else if (m.act === 'letter') { const L = sim.letters.find(l => l.id === m.id); if (L) L.seen = true; r = { ok: true }; }
      else r = { ok: false, why: '不认识的动作' };
      postMessage({ type: 'leniaResult', act: m.act, req: m.req, id: m.id, ...r }); if (sim.ver !== lastVer) postStruct(); postInfo(true); save('lenia'); break;
    }
    case 'dbgInside': sim.dbgInside(m.lot, m.what); postInfo(true); tick(); break; // 测试/截图用：住户马上进屋吃饭/睡觉
    case 'dbgFood': { const r = sim.dbgFood(m); postMessage({ type: 'dbgFoodResult', ...r }); postInfo(true); tick(); break; } // 测试/截图用：设粮筐库存、让谁饿了/吃东西、让面包房马上开烤
    case 'dbgStation': { const r = sim.dbgStation(m); postMessage({ type: 'dbgStationResult', ...r }); postStruct(); postInfo(true); tick(); break; }
    case 'dbgHaul': sim.dbgHaul(); postStruct(); postInfo(true); tick(); break;
    case 'dbgCar': sim.dbgCar(m); postInfo(true); tick(); break; // 测试/截图用：让玩具车载人兜风 / 抛锚
    case 'dbgShop': sim.dbgShop(m.lot, m.n || 3); postInfo(true); tick(); break; // 测试/截图用：店里马上来客人
    case 'dbgStall': { const l = sim.lotById(m.lot); if (l && l.paid < 3) { for (const k in sim.mats) sim.mats[k] = 0; l.prog = Math.max(l.prog, l.paid / 3); } postInfo(true); tick(); break; } // 测试/截图用：让一栋改造中的房子缺料停工
    case 'dbgEmo': { const ws = [[1, { k: 'gawk', a: '毛线球' }], [2, { k: 'made', a: '毛线球', b: '毛线秋千' }], [3, { k: 'fac', a: '毛线秋千', b: '玩了一会儿' }], [4, { k: 'talk', a: '毛线球', b: '阿旺' }], [1, { k: 'mat', a: '木枝', b: '树叶棚', c: '木枝堆' }]]; const ids = m.ids || sim.res.slice(0, 5).map(r => r.id); ids.forEach((id, i) => { const r = sim.rById(id); if (r && ws[i]) sim.emo(r, ws[i][0], 600, ws[i][1]); }); postInfo(true); tick(); break; } // 测试/截图用：几位居民头顶同时冒各种气泡
    case 'give': sim.giveItem(m.item, m.n || 1, 'attic'); postInfo(true); break; // 测试/截图用
    case 'tripNow': if (sim.exp) { sim.exp.t0 = sim.wall - sim.exp.dur - 1; } postInfo(true); break; // 测试/截图用：让远行小队马上回来
    case 'weather': { const c = sim.cal(); sim.nextWeather(c, m.k); if (m.cover != null) sim.cover = m.cover; if (m.wet != null) sim.wet = m.wet; postStruct(); postInfo(true); tick(); break; } // 测试/截图用
    case 'debug': postMessage({ type: 'debug', id: m.id, data: { stats: sim.stats, projects: sim.projects.map(p => ({ id: p.id, stage: p.stage, kind: p.kind, s: p.s, team: p.team.length })) } }); break;
  }
};
