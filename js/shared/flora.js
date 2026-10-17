// 花园外圈的植物丛（蒲公英 / 三叶草 / 狗尾草）：布局是确定的，渲染（render/flora.js）、模拟（sim/flora.js）、放置判定（items.js）共用这一份。
// 模拟里每丛植物有自己的状态：ok 完好 → clearing 正在被小动物清 → cleared 已清掉（一块平地）→ regrow 正在长回来（小苗，进度 g）→ ok。
import { mulberry32, TAU, streamDist, GATES } from './layout.js';
import { ptObb } from './footprint.js';

export const FLORA_SEED = 20261016;            // 布局种子：固定，所以每次打开、每个存档植物都长在同一个地方
export const FLORA_N = 14;                     // 一共多少丛
export const ST = { ok: 0, clearing: 1, cleared: 2, regrow: 3 };
export const ST_NAME = ['ok', 'clearing', 'cleared', 'regrow'];
// rad：占地半径（世界单位，旧物压到这个圈里就算压在植物上）；mat/n：清下来变成的小材料和数量范围；work：干活总量（一只小动物干这么多秒；2～3 只一起干就快几倍）
export const FLORA = {
  dandelion: { name: '蒲公英', big: '大蒲公英', q: '棵', rad: 3.0, mat: 'twig', n: [2, 3], work: 80, tool: '锯倒了', cut: '劈成了', unit: '根' },
  clover: { name: '三叶草', big: '三叶草', q: '丛', rad: 2.2, mat: 'grass', n: [1, 2], work: 36, tool: '割下来了', cut: '捆成了', unit: '把' },
  foxtail: { name: '狗尾草', big: '狗尾草', q: '丛', rad: 2.2, mat: 'grass', n: [2, 3], work: 56, tool: '割倒了', cut: '捆成了', unit: '把' },
};
export const FLORA_KINDS = Object.keys(FLORA);

// 布局：[{ id, kind, x, z, size(株高，世界单位), yaw }]。外圈草坪半径 54～59.5 一圈，避开溪流、村口、彼此太近
export function floraLayout(seed = FLORA_SEED) {
  const rnd = mulberry32(seed); const out = []; const R_ = (a, b) => a + (b - a) * rnd();
  const gateOk = (x, z) => GATES.every(([gx, gz]) => { const a = Math.atan2(gz, gx), b = Math.atan2(z, x); return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > 0.22; });
  for (let i = 0; i < FLORA_N * 40 && out.length < FLORA_N; i++) {
    const a = R_(0, TAU), r = R_(54, 59.5); const x = Math.round(Math.cos(a) * r * 100) / 100, z = Math.round(Math.sin(a) * r * 100) / 100;
    if (streamDist(x, z) < 8 || !gateOk(x, z) || out.some(o => Math.hypot(o.x - x, o.z - z) < 6.5)) continue;
    const t = out.length % 4; const kind = t < 2 ? 'dandelion' : t === 2 ? 'clover' : 'foxtail';
    const size = Math.round((kind === 'dandelion' ? R_(10, 12) : kind === 'clover' ? R_(4.2, 5) : R_(11, 13)) * 100) / 100;
    out.push({ id: out.length + 1, kind, x, z, size, yaw: Math.round(R_(0, TAU) * 100) / 100 });
  }
  return out;
}

// 旧物（占地 F，footprint.js 的 footOf / circleFoot）压到了哪些完好的植物丛：st.flora = [[id, kind, x, z, size], ...]（只含完好 / 正在被清的）
export function floraHits(st, F) {
  const L = st && st.flora; if (!L || !L.length || !F) return [];
  const b = F.body; const out = [];
  for (const q of L) { const rad = FLORA[q[1]].rad; const d = b.t === 'b' ? ptObb(q[2], q[3], b) : Math.hypot(q[2] - b.x, q[3] - b.z) - b.r; if (d < rad) out.push(q); }
  return out;
}
export function floraWhy(hits) {
  const names = [...new Set(hits.map(q => FLORA[q[1]].name))];
  return hits.length === 1 ? `这里长着一丛${names[0]}，小动物会先把它清掉` : `这里长着 ${hits.length} 丛${names.join('、')}，小动物会先把它们清掉`;
}
