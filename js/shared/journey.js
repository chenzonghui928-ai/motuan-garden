// 远行探险：目的地、行囊加成、游记文案。纯数据 + 文案生成，主线程（远行地图）与 Worker（模拟）共用。
// 远行的结果不是后台跑模拟，而是按时长、行囊和成员性格“生成”出来（DECISIONS 第 2 条）。
import { SP_NAME } from './layout.js';

export const TRIP_H = [2, 6];          // 远行时长（真实小时）
export const TRIP_CD_H = 1;            // 回来后歇多久（真实小时）才能再出发
// 目的地：hours 时长范围；unlock 要先完成几次远行；gate 从哪个村口出发（layout.GATES 序号）；map 远行地图上的位置（0～100）
export const DESTS = {
  picnic: { name: '人类的野餐地', hours: [2, 3], unlock: 0, gate: 0, map: [16, 30], icon: 'picnic',
    desc: '红白格子的大野餐布，常有掉下来的小东西。', items: ['button', 'spool', 'thimble', 'matchbox', 'cookietin', 'strawhat', 'kite', 'popsicle', 'chestnut', 'umbrella'], seeds: ['sunflower', 'poppy'],
    road: '走出村口，草越来越高，像一片绿色的森林。翻过一根倒下的树枝，眼前忽然亮了——一块红白格子的大布铺在草地上，那就是人类的野餐地。' },
  sill: { name: '厨房窗台', hours: [3, 4], unlock: 0, gate: 1, map: [38, 12], icon: 'window',
    desc: '要顺着葡萄藤爬上去，窗台上摆满了杯子罐子。', items: ['teacup', 'glassjar', 'kettle', 'honeyjar', 'teapot', 'toaster', 'thimble'], seeds: ['bluebell', 'lavender'],
    road: '大家顺着墙根走了好久，又抓着葡萄藤一点一点往上爬。爬到厨房窗台上往下一看，花园小得像一块绿手帕，大家的腿都软了。' },
  puddle: { name: '雨后的大水洼', hours: [2, 3], unlock: 0, gate: 2, map: [78, 34], icon: 'puddle',
    desc: '下过雨就会出现的“大湖”，岸边常冲来漂亮的东西。', items: ['rubberduck', 'pencil', 'boot', 'umbrella', 'shell', 'button'], seeds: ['daisy', 'moonflower'],
    road: '大水洼大得像一片湖，水面上倒映着天上的云。岸边的泥巴软软的，一踩一个小坑，水里还漂着几片叶子小船。' },
  alley: { name: '花店后巷', hours: [3, 5], unlock: 1, gate: 3, map: [12, 66], icon: 'flower',
    desc: '花店倒掉的花泥和旧花盆都堆在这里，香得让人打喷嚏。', items: ['flowerpot', 'trowel', 'spool', 'glassjar', 'rake'], seeds: ['tulip', 'lavender', 'poppy', 'moonflower'],
    road: '穿过篱笆的缝隙，就到了花店后巷。墙边堆着一摞摞旧花盆，空气里全是花香，大家一连打了好几个喷嚏。' },
  atticbox: { name: '阁楼的旧箱子', hours: [4, 5], unlock: 2, gate: 1, map: [68, 10], icon: 'attic',
    desc: '要从排水管爬进阁楼的小窗，箱子里全是旧玩具和旧衣服。', items: ['oldbook', 'toycar', 'yarn', 'toaster', 'mittens', 'beanie', 'jinglebell', 'hotbottle'], seeds: ['bluebell'],
    road: '大家顺着排水管爬进阁楼的小窗。屋里暗暗的，灰尘在一道阳光里慢慢飘，墙角那只大箱子的盖子开着一条缝。' },
  pond: { name: '池塘边', hours: [5, 6], unlock: 3, gate: 2, map: [80, 72], icon: 'pond',
    desc: '最远的地方。荷叶比房子还大，青蛙会唱歌。', items: ['eggshell', 'rubberduck', 'shell', 'teacup', 'kettle'], seeds: ['moonflower', 'lavender', 'poppy'],
    road: '走了很久很久，终于听见了青蛙的歌声。池塘边的荷叶比房子还大，大家坐在一片荷叶上，看小鱼从脚底下游过去。' },
};
export const DEST_KEYS = Object.keys(DESTS);
// 行囊：不同旧物给不同的加成。speed 时长倍数（小于 1 更快）、finds 多带回几件、seeds 多几颗花种、luck 更容易遇到稀有的、wet 不怕水、cold 不怕冷、mood 心情
export const PACKS = {
  kettle: { finds: 1, short: '装满了水', desc: '路上不口渴，能走得更远（多带回一件）' },
  teacup: { mood: 8, short: '能泡茶', desc: '走累了就停下来喝杯茶（大家回来心情更好）' },
  teapot: { mood: 6, finds: 0.5, short: '装着热茶', desc: '一路都有热茶喝' },
  oldbook: { speed: 0.8, short: '书里夹着旧地图', desc: '少走冤枉路（时间短一些）' },
  toycar: { finds: 1, short: '能推着走', desc: '推着小车，能多装一件东西回来' },
  yarn: { luck: 0.3, short: '可以一路放线', desc: '回来不会迷路，更容易找到稀奇东西' },
  glassjar: { seeds: 3, short: '专门装花种', desc: '多带回一些花种' },
  cookietin: { mood: 10, finds: 0.5, short: '装满了饼干', desc: '干粮管够，大家走得高高兴兴' },
  boot: { wet: true, short: '能蹚水', desc: '水洼和池塘也不怕（去水边多带回一件）' },
  rubberduck: { wet: true, short: '能当小船', desc: '过水的时候坐在上面（去水边多带回一件）' },
  umbrella: { speed: 0.9, wet: true, short: '能挡雨', desc: '下雨也不用停下来' },
  strawhat: { speed: 0.9, short: '能遮太阳', desc: '戴着不怕晒，走得快一点' },
  kite: { luck: 0.3, short: '能飞得高高的', desc: '从高处看得远，宝贝藏不住' },
  mittens: { cold: true, short: '暖暖和和', desc: '冬天也能走远路' },
  beanie: { cold: true, short: '暖暖和和', desc: '冬天也能走远路' },
  hotbottle: { cold: true, mood: 4, short: '揣在怀里很暖', desc: '冬天也能走远路' },
  matchbox: { luck: 0.15, short: '天黑能点亮', desc: '晚上不怕黑' },
  spool: { finds: 0.5, short: '线够长', desc: '能把大东西绑回来' },
  pencil: { luck: 0.2, short: '能画记号', desc: '一路画记号，好东西都记下来' },
  button: { luck: 0.1, short: '亮晶晶的', desc: '当护身符，大家心里踏实' },
};
export const packOf = (k) => PACKS[k] || { luck: 0.1, short: '沉甸甸的', desc: '带着它，大家心里踏实' };
export const WET_DEST = new Set(['puddle', 'pond']);
// 预计时长（小时，0.5 一档）：目的地基础 × 行囊 × 慢性子 × 冬天不暖和
export function tripHours(dest, item, traits, season, r01 = 0.5) {
  const D = DESTS[dest], pk = packOf(item); let h = D.hours[0] + (D.hours[1] - D.hours[0]) * r01;
  h *= pk.speed || 1; if (traits.some(t => t.includes('easy'))) h *= 1.1; if (traits.some(t => t.includes('diligent'))) h *= 0.95;
  if (season === 'winter') h *= pk.cold ? 0.85 : 1.1;
  return Math.max(TRIP_H[0], Math.min(TRIP_H[1], Math.round(h * 2) / 2));
}

// ---------------------------------------------------------------- 游记（3～5 段）
const SEASON_LINE = { spring: '路边的蒲公英开了一大片，风一吹，小伞飞得到处都是。', summer: '太阳晒得石头发烫，大家专挑树叶的影子走。', autumn: '落叶在脚底下沙沙响，大家比赛谁踩得最响。', winter: '雪地上留下了一串歪歪扭扭的小脚印，回头一看，像一条小路。' };
const TRAIT_LINE = {
  curious: (n) => `${n}这里摸摸、那里闻闻，差点钻进一只空饮料瓶里出不来。`,
  brave: (n) => `${n}自告奋勇爬到最高的地方去看路，站在上面像个小将军。`,
  timid: (n, o) => `${n}一路上紧紧拉着${o}的手，有风吹草动就往${o}身后躲。`,
  foodie: (n) => `${n}还没走到一半，就把自己那份干粮吃掉了。`,
  chatty: (n) => `${n}的嘴一路没停过，连路过的蚂蚁都被搭了好几句话。`,
  diligent: (n) => `${n}把路上能用的小石子、细木枝都捡进了口袋，口袋鼓得像两个小包子。`,
  easy: (n) => `${n}走几步就要坐下来看看云，大家只好停下来等。`,
  generous: (n) => `${n}把自己的点心掰了一半，分给了路边一只饿肚子的小蜗牛。`,
};
const MISHAPS = [
  { when: (c) => c.wet, t: (c) => `半路下起了雨。幸好带着${c.item}——${c.pk.short}，大家一个也没淋着，还在水洼边玩了好一会儿。` },
  { t: (c) => `半路下起了雨，大家躲在一朵大蘑菇下面，听雨点“嗒嗒”地敲了好久，${c.a}说这是蘑菇在打鼓。` },
  { when: (c) => c.item === 'yarn', t: (c) => `回来的路上大家走岔了，绕着一块大石头转了三圈。最后顺着一路放出去的毛线，才找到回家的路。` },
  { t: (c) => `回来的路上大家走岔了，绕着一块大石头转了三圈。最后是${c.a}闻着家里的炊烟味，才找到了路。` },
  { when: (c) => c.trait('brave'), t: (c) => `一只大喜鹊落在旁边，歪着头盯着${c.item}看。${c.trait('brave')}张开双手大喊一声，喜鹊扑棱棱地飞走了。` },
  { when: (c) => c.trait('timid'), t: (c) => `${c.trait('timid')}被一个好大的影子吓了一跳，后来才发现，那只是人类晾在绳子上的一只袜子。` },
  { when: (c) => c.trait('foodie'), t: (c) => `${c.trait('foodie')}偷偷尝了一口人类掉在地上的饼干渣，说这是这辈子吃过最好吃的东西。` },
  { t: (c) => `前面横着一条小水沟。${c.b}找来一根冰棍棍搭成桥，大家排着队，一个一个晃晃悠悠地走了过去。` },
  { t: (c) => `中午太热，大家在一片大树叶底下睡了个午觉。醒来时，${c.a}的脸上印满了叶子的纹路。` },
  { t: (c) => `路上遇到一队搬家的蚂蚁。大家让它们先走，等了好一会儿，${c.b}还帮最后一只蚂蚁扛了一粒米。` },
  { t: (c) => `一阵大风吹来，差点把${c.a}吹跑，幸好大家手拉着手，像一串小风铃。` },
  { when: (c) => c.hours >= 4, t: (c) => `天黑前没赶到地方，大家挤在一起数星星。${c.b}说，这是他看过最多星星的一个晚上。` },
];
// ctx: { dest, item, itemName, members:[{name, sp, traits}], hours, season, finds:[文字], rnd() }
export function writeJourney(ctx) {
  const D = DESTS[ctx.dest], pk = packOf(ctx.item), M = ctx.members, rnd = ctx.rnd; const pick = (a) => a[Math.floor(rnd() * a.length)];
  const names = M.map(m => m.name).join('、'); const lead = M.find(m => m.traits.includes('brave')) || M[0]; const last = M[M.length - 1];
  const trait = (t) => { const m = M.find(m => m.traits.includes(t)); return m ? m.name : null; };
  const c = { item: ctx.itemName, pk, a: pick(M).name, b: pick(M).name, wet: pk.wet && true, hours: ctx.hours, trait };
  const P = [];
  P.push(pick([`${names}一大早就在村口集合了。${lead.name}背着${ctx.itemName}走在最前面，${last.name}一步三回头地跟大家挥手。`,
    `${names}出发去${D.name}了。${ctx.itemName}${pk.short}，${lead.name}拍拍它说：“有它在，什么都不怕。”`,
    `天刚亮，${names}就背上了${ctx.itemName}。他们要去一个很远的地方——${D.name}。`]));
  P.push(`${SEASON_LINE[ctx.season] || ''}${D.road}`);
  const tl = []; for (const m of M) { const t = m.traits.find(t => TRAIT_LINE[t]); if (t && tl.length < 2) tl.push(TRAIT_LINE[t](m.name, M.find(o => o !== m).name)); }
  if (tl.length) P.push(tl.join(''));
  const mis = MISHAPS.filter(x => !x.when || x.when(c)); const special = mis.filter(x => x.when); P.push((special.length && rnd() < 0.7 ? pick(special) : pick(mis)).t(c));
  const finder = pick(M).name; const list = ctx.finds.join('、');
  P.push(`在${D.name}，${finder}${pick(['眼尖，', '第一个', '在草堆里'])}发现了${list}。大家把东西捆好，一路喊着号子带回了家。${M.length > 2 || ctx.hours >= 4 ? `回到村口时，${last.name}小声说：“下次还想去。”` : ''}`);
  return { title: `游记：${D.name}`, paras: P.slice(0, 5) };
}
export const SP_N = SP_NAME;
