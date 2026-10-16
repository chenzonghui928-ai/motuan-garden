// 世界布局：纯数据 + 纯数学，主线程与 Worker 共用（不依赖 three.js）
export const PI = Math.PI, TAU = PI * 2;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); const qx = ax + dx * t - px, qz = az + dz * t - pz; return Math.sqrt(qx * qx + qz * qz); }
export function segProj(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; return clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); }

// ---------------------------------------------------------------- world constants
export const DAY = 1500;           // 一个游戏日 = 1500 模拟秒（x1 时 25 分钟；老板 10-15 定的挂机节奏方案 A）
export const TIME_K = DAY / 600;   // 相对旧节奏（10 分钟一天）拉长的倍数：饥饿、精力、心情等“按天算”的变化都除以它；走路和干活的速度不变
export const WORLD_R = 52;         // 小镇可建造半径（再往外是人类花园的草坪）
export const EDGE_R = 62;          // 远方：人类遗落物件出现的半径
export const PLAZA_R = 10;         // 祭坛广场
export const RING_R = 22;          // 环镇小路的平均半径
export const ROAD_HALF = { 1: 1.3, 2: 0.8, 3: 1.0 };   // 路宽一半：1 环路/主路 2 门前小径 3 去资源点/村口的小土路
export const STORE_POS = [5.2, 6.4];   // 祭坛旁的公共粮筐
export const WOOD_POS = [31, -21];     // 木枝堆（天然材料）

// ---------------------------------------------------------------- stream (uniform Catmull-Rom sampled, shared by sim + render)
const STREAM_CTRL = [[-40, 86], [-22, 62], [-6, 47], [12, 37], [26, 25], [36, 10], [50, -2], [84, -10]];
function catmull(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
export const STREAM = (() => {
  const P = STREAM_CTRL, out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 40; k++) { const t = k / 40; out.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]); }
  }
  out.push(P[P.length - 1]); return out;
})();
export function streamDist(x, z) { let m = 1e9; const S = STREAM; for (let i = 0; i < S.length - 1; i++) { const a = S[i], b = S[i + 1]; if (Math.abs(a[0] - x) > 14 || Math.abs(a[1] - z) > 14) continue; m = Math.min(m, segDist(x, z, a[0], a[1], b[0], b[1])); } return m; }
function bankPoint(nx, nz, off) { // 岸边点：离 (nx,nz) 最近的溪流点，向广场方向偏移 off
  let bi = 0, bd = 1e9; STREAM.forEach((p, i) => { const d = Math.hypot(p[0] - nx, p[1] - nz); if (d < bd) { bd = d; bi = i; } });
  const p = STREAM[bi], len = Math.hypot(p[0], p[1]); return [p[0] - p[0] / len * off, p[1] - p[1] / len * off, Math.atan2(p[0] / len, p[1] / len)];
}

// ---------------------------------------------------------------- species / objects / uses
export const SPECIES = ['chick', 'rabbit', 'cat', 'dog', 'duck', 'bear'];
export const SP_NAME = { chick: '小鸡', rabbit: '兔子', cat: '猫', dog: '小狗', duck: '鸭子', bear: '小熊' };
export const SPEED = { chick: 1.2, rabbit: 1.4, cat: 1.4, dog: 1.5, duck: 1.15, bear: 1.0 };
export const HOME_OF = { chick: 'egg', rabbit: 'tea', cat: 'fish', dog: 'boot', duck: 'cup', bear: 'honey' };
export const OBJ_KINDS = ['egg', 'tea', 'fish', 'boot', 'cup', 'honey'];
export const KINDS = ['egg', 'tea', 'fish', 'boot', 'cup', 'honey', 'leaf', 'mush', 'pine', 'rboot']; // rboot = Lenia 的红雨靴（远方拾得的 boot 是棕色旧皮靴）
export const NATURAL = { leaf: '树叶棚', mush: '蘑菇屋', pine: '松果屋' };
// 渲染用造型：店铺是同一个物件 + 门前桌椅、招牌（"S" 后缀）
export const RKINDS = [...KINDS, 'teaS', 'fishS', 'cupS', 'honeyS'];
export const OBJ_NAME = { egg: '大蛋壳', tea: '旧茶壶', fish: '鱼罐头', boot: '旧靴子', cup: '大茶杯', honey: '蜂蜜罐', rboot: '雨靴' };
export const TEAM = { egg: 2, cup: 3, honey: 3, tea: 4, fish: 4, boot: 5, rboot: 5 };   // 拖运所需人数（物件越大越多）
export const SHOP = {
  tea: { name: '茶馆', act: '喝茶', verb: '喝了一杯热茶' },
  food: { name: '小食堂', act: '吃饭', verb: '吃了一顿热饭' },
};
// 每件物件 2～3 种用途；home 后面是住进去的物种，shop 后面是店的种类
export const USES = {
  egg: [{ use: 'home', sp: 'chick', name: '蛋壳屋' }, { use: 'home', sp: 'duck', name: '蛋壳水边屋' }],
  tea: [{ use: 'home', sp: 'rabbit', name: '茶壶屋' }, { use: 'shop', shop: 'tea', name: '茶壶茶馆' }],
  fish: [{ use: 'home', sp: 'cat', name: '鱼罐头屋' }, { use: 'shop', shop: 'food', name: '罐头小食堂' }],
  boot: [{ use: 'home', sp: 'dog', name: '靴子屋' }, { use: 'home', sp: 'bear', name: '靴子木屋' }],
  rboot: [{ use: 'home', sp: 'dog', name: '雨靴屋' }, { use: 'home', sp: 'bear', name: '雨靴木屋' }],
  cup: [{ use: 'home', sp: 'duck', name: '茶杯屋' }, { use: 'shop', shop: 'tea', name: '茶杯茶座' }, { use: 'home', sp: 'rabbit', name: '茶杯小屋' }],
  honey: [{ use: 'home', sp: 'bear', name: '蜂蜜罐屋' }, { use: 'shop', shop: 'food', name: '蜂蜜点心铺' }, { use: 'home', sp: 'chick', name: '蜂蜜罐暖屋' }],
};
// 翻新升级：房子随入住天数和主人心情，分 3 档多出生活痕迹（不是把物件放大）
export const TIER_DAYS = [2, 7, 15];
export const TIER_NAME = ['', '门前摆了花盆、铺了小路', '拉起了晾衣绳、立了小信箱', '窗台摆上小物、屋顶插了小旗'];
export const CAP = { egg: 3, tea: 3, fish: 3, boot: 3, rboot: 3, cup: 3, honey: 3, leaf: 2, mush: 2, pine: 2 };
export const POP_CAP = 13, START_POP = 6, MAX_OBJ_LOTS = 9;
// 小材料：天然材料 + 零碎小物
export const MATS = ['twig', 'stone', 'grass', 'button', 'cap', 'thread', 'nail'];
export const MAT_NAME = { twig: '木枝', stone: '小石头', grass: '干草', button: '纽扣', cap: '瓶盖', thread: '线头', nail: '钉子' };
export const MAT_NATURAL = ['twig', 'stone', 'grass'], MAT_TRINKET = ['button', 'cap', 'thread', 'nail'];
// 改造三个阶段各要的材料：1 门和台阶 2 窗和灯 3 烟囱、招牌、花盆
export const STAGE_COST = [{ twig: 2, nail: 1 }, { stone: 1, button: 1 }, { grass: 1, cap: 1, thread: 1 }];
export const STAGE_NAME = ['开门、搭台阶', '开窗、挂灯', '接烟囱、摆花盆'];
// 默认尺寸（主线程会在启动时用造型实测值覆盖后发给 Worker）：r=占地半径，door=门口本地坐标(已含缩放)，h=高度
export const KIND_DEFAULT = {
  egg: { r: 3.6, door: [0, 4.2], h: 7 }, tea: { r: 4.6, door: [0, 4.0], h: 5 }, fish: { r: 4.2, door: [-0.6, 3.9], h: 4 },
  boot: { r: 4.3, door: [1.0, 3.8], h: 8 }, rboot: { r: 4.3, door: [0.9, 3.4], h: 8 }, cup: { r: 3.8, door: [0, 3.4], h: 4 }, honey: { r: 3.4, door: [0, 3.6], h: 6 },
  leaf: { r: 3.0, door: [0, 2.8], h: 3 }, mush: { r: 2.9, door: [0, 2.6], h: 4 }, pine: { r: 2.9, door: [0, 2.7], h: 5 },
};
// 店铺门前的两张小桌（本地坐标，相对门口；x 横向，z 朝外），每张桌两个座位
export const SHOP_TABLES = [[-2.5, 0.2], [2.5, 0.2]];
export function shopSpots(lot, K) { // 返回 { tables:[[x,z]], seats:[[x,z,faceX,faceZ]], counter:[x,z] } 世界坐标
  const c = Math.cos(lot.rot), s = Math.sin(lot.rot); const d = K.door;
  const W = (lx, lz) => [lot.x + lx * c + lz * s, lot.z - lx * s + lz * c];
  const tables = SHOP_TABLES.map(([tx, tz]) => W(d[0] + tx, d[1] + tz));
  const seats = []; SHOP_TABLES.forEach(([tx, tz], i) => { for (const o of [-0.85, 0.85]) { const p = W(d[0] + tx + o, d[1] + tz); seats.push([p[0], p[1], tables[i][0], tables[i][1]]); } });
  return { tables, seats, counter: W(d[0] + 1.0, d[1] + 0.7) };
}

// ---------------------------------------------------------------- resources & road graph
export const FISH1 = bankPoint(19, 30, 4.4), FISH2 = bankPoint(40, 5, 4.4);
export const RESOURCES = [
  { type: 'berry', name: '东边的莓果丛', x: -31, z: -21, r: 3.2, max: 30, regen: 0.013 },
  { type: 'berry', name: '南坡的莓果丛', x: 7, z: -36, r: 3.2, max: 30, regen: 0.013 },
  { type: 'veg', name: '菜田', x: -35, z: 9, r: 6.5, hx: 5.5, hz: 3.6, max: 40, regen: 0.02 },
  { type: 'fish', name: '柳树下的钓点', x: FISH1[0], z: FISH1[1], r: 2.2, ang: FISH1[2], max: 36, regen: 0.013 },
  { type: 'fish', name: '小桥边的钓点', x: FISH2[0], z: FISH2[1], r: 2.2, ang: FISH2[2], max: 36, regen: 0.013 },
  { type: 'wood', name: '木枝堆', x: WOOD_POS[0], z: WOOD_POS[1], r: 3.0, max: 1e9, regen: 0 },
];
export const GATES = [[-50, -9], [-9, -50], [36, -37], [-38, 33]];
// 起始路网：广场环（不画）+ 弯弯的环镇小路（一个圈）+ 四条连到广场的小路 + 通往资源点和村口的弯曲土路
// 每条路按 ~3 单位切成小段，节点带少量侧向弯曲；之后房子沿路长出来
export function startGraph(seed = 1015) {
  const rnd = mulberry32(seed * 7 + 3); const R_ = (a, b) => a + (b - a) * rnd();
  const nodes = [], edges = [];
  const N = (x, z, k = 'path') => { nodes.push({ x, z, k }); return nodes.length - 1; };
  const E = (a, b, d = 1) => edges.push([a, b, d]);
  const avoid = (x, z) => { // 离溪流和资源点远一点
    for (let it = 0; it < 6; it++) {
      const sd = streamDist(x, z); if (sd < 5.5) { const l = Math.hypot(x, z) || 1; x -= x / l * (5.6 - sd); z -= z / l * (5.6 - sd); }
      for (const s of RESOURCES) { const rr = (s.type === 'veg' ? Math.hypot(s.hx, s.hz) : s.r) + 2.6; const d = Math.hypot(x - s.x, z - s.z); if (d < rr && d > 0.01) { x += (x - s.x) / d * (rr - d); z += (z - s.z) / d * (rr - d); } }
    }
    return [x, z];
  };
  // 弯曲连线：从节点 a 到点 (bx,bz)，返回终点节点
  const link = (a, bx, bz, d, wig, k = 'path', endNode = -1) => {
    const A = nodes[a]; const L = Math.hypot(bx - A.x, bz - A.z) || 1; const n = Math.max(1, Math.round(L / 3.2));
    const tx = (bx - A.x) / L, tz = (bz - A.z) / L; const ph = R_(0, TAU), fr = R_(0.8, 1.6), amp = wig * Math.min(1, L / 14);
    let prev = a;
    for (let i = 1; i <= n; i++) {
      const t = i / n; if (i === n && endNode >= 0) { E(prev, endNode, d); return endNode; }
      let x = lerp(A.x, bx, t), z = lerp(A.z, bz, t); const off = Math.sin(PI * t) * Math.sin(PI * t * fr + ph) * amp; x += -tz * off; z += tx * off;
      if (i < n) [x, z] = avoid(x, z);
      const id = N(x, z, i === n ? k : 'path'); E(prev, id, d); prev = id;
    }
    return prev;
  };
  const plaza = []; for (let k = 0; k < 8; k++) { const a = k * PI / 4; plaza.push(N(Math.cos(a) * 10.6, Math.sin(a) * 10.6, 'plaza')); }
  for (let k = 0; k < 8; k++) E(plaza[k], plaza[(k + 1) % 8], 0);
  // 环镇小路
  const RN = 20, ring = []; const p1 = R_(0, TAU), p2 = R_(0, TAU);
  for (let k = 0; k < RN; k++) { const a = k / RN * TAU; const R = RING_R + 1.7 * Math.sin(3 * a + p1) + 1.0 * Math.sin(5 * a + p2); let x = Math.cos(a) * R, z = Math.sin(a) * R; [x, z] = avoid(x, z); ring.push(N(x, z)); }
  for (let k = 0; k < RN; k++) E(ring[k], ring[(k + 1) % RN], 1);
  const nearRing = (x, z) => { let b = ring[0], bd = 1e9; for (const i of ring) { const d = Math.hypot(nodes[i].x - x, nodes[i].z - z); if (d < bd) { bd = d; b = i; } } return b; };
  // 广场连到环路（四条，不正对，像踩出来的）
  for (const k of [0, 2, 4, 6]) { const r = nearRing(Math.cos(k * PI / 4 + 0.15) * RING_R, Math.sin(k * PI / 4 + 0.15) * RING_R); link(plaza[k], nodes[r].x, nodes[r].z, 1, 1.6, 'path', r); }
  // 资源点和村口的小土路
  const spur = (tx, tz, k = 'path', wig = 2.2) => { const r = nearRing(tx, tz); return link(r, tx, tz, 3, wig, k); };
  const ends = {};
  RESOURCES.forEach((s, i) => {
    let tx = s.x, tz = s.z;
    if (s.type === 'veg') { tz = s.z + s.hz + 1.8; } else if (s.type === 'fish') { tx = s.x - Math.sin(s.ang) * 2.4; tz = s.z - Math.cos(s.ang) * 2.4; } else { const l = Math.hypot(s.x, s.z); tx = s.x - s.x / l * (s.r + 2.2); tz = s.z - s.z / l * (s.r + 2.2); }
    ends['r' + i] = spur(tx, tz);
  });
  // 去村口的路从离得最近的已有路点岔出去（多半是去资源点的土路），不再每条都从环路单独拉一根
  GATES.forEach(([x, z], i) => { let b = -1, bd = 1e9; nodes.forEach((n, j) => { if (n.k === 'plaza' || Math.hypot(n.x, n.z) < RING_R - 3) return; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; b = j; } }); ends['g' + i] = link(b, x, z, 3, 3, 'gate'); });
  // 外圈一小段把南边莓果丛和木枝堆的土路连起来，形成第二个环
  link(ends.r1, nodes[ends.r5].x, nodes[ends.r5].z, 3, 2.5, 'path', ends.r5);
  return { nodes, edges };
}
export const NIGHT0 = 0.885, NIGHT1 = 0.195; // 夜里（大约 21:15 到次日 4:40）
export function isNight(dayT, late = 0) { return dayT > NIGHT0 + late || dayT < NIGHT1 - late * 0.5; }
export function hm(dayT) { const h = Math.floor(dayT * 24), m = Math.floor((dayT * 24 - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
