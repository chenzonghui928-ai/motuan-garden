// 文案：名字、性格、心愿、故事卡、离开期间的小故事。只负责“怎么说”，不决定“发生什么”。
// 心愿句子风格参考旧项目 jikuai-town（wish-flavor 分支 lib/wish-text.ts），部分句子直接借用。
import { SP_NAME, OBJ_NAME, MAT_NAME } from './layout.js';

export const NAMES = {
  chick: ['啾啾', '米粒', '小团', '豆芽'],
  rabbit: ['棉花糖', '萝卜丝', '团团', '小雪'],
  cat: ['年糕', '芝麻', '橘子', '汤圆'],
  dog: ['阿旺', '豆包', '栗子', '布丁'],
  duck: ['嘎嘎', '小波', '柚子', '菱角'],
  bear: ['蜜蜜', '大福', '松果', '可可'],
};
export const TRAITS = { curious: '好奇', diligent: '勤快', generous: '热心', timid: '胆小', foodie: '贪吃', chatty: '爱聊天', easy: '慢性子', brave: '勇敢' };
export const TRAIT_CLASH = { curious: [], diligent: ['easy'], easy: ['diligent'], timid: ['brave'], brave: ['timid'], generous: [], foodie: [], chatty: [] };
// 每个物种更容易有的性格（不是绝对）
export const SP_TRAITS = { chick: ['curious', 'chatty', 'diligent'], rabbit: ['generous', 'timid', 'foodie'], cat: ['curious', 'easy', 'brave'], dog: ['diligent', 'generous', 'brave'], duck: ['chatty', 'easy', 'foodie'], bear: ['foodie', 'easy', 'generous'] };

// 根据种子从候选句里挑一句；带条件的句子优先
function pick(list, c, seed) {
  const fit = list.filter(v => v.when && v.when(c)); const pool = fit.length ? [...fit, ...list.filter(v => !v.when)] : list.filter(v => !v.when);
  return pool[Math.abs(seed) % pool.length].t(c);
}
const has = (t) => (c) => c.traits.includes(t);
const isSp = (s) => (c) => c.sp === s;

const WISH = {
  home: [
    { when: isSp('chick'), t: c => `${c.n}想有一个软软的窝，好把脑袋埋进翅膀里睡个整觉` },
    { when: isSp('cat'), t: c => `${c.n}想在一个暖和的角落里蜷成一团，谁也别来打扰` },
    { when: isSp('dog'), t: c => `${c.n}想有一扇自己的门，睡前能安心地把门掩上` },
    { when: isSp('rabbit'), t: c => `${c.n}想住进一只圆圆的茶壶里，早上从壶嘴往外看太阳` },
    { when: isSp('duck'), t: c => `${c.n}想要一个离溪水近一点的家，推门就能下水` },
    { when: isSp('bear'), t: c => `${c.n}想住进一个甜甜的罐子里，连梦都是蜂蜜味的` },
    { when: has('timid'), t: c => `${c.n}想要一张属于自己的床，哪怕只是小小的一张` },
    { t: c => `${c.n}想有个遮风挡雨的小窝，不用再和别人挤在${c.hut || '小棚子'}里` },
    { t: c => `${c.n}想要一间属于自己的屋子，门口还能摆一盆花` },
  ],
  friend: [
    { when: has('chatty'), t: c => `${c.n}想约${c.o}一起晒太阳，什么也不干` },
    { when: has('curious'), t: c => `${c.n}想问问${c.o}最近都在琢磨些什么` },
    { when: has('generous'), t: c => `${c.n}想把自己的点心分给${c.o}一半` },
    { when: has('timid'), t: c => `${c.n}想慢慢熟悉${c.o}，再说几句心里话` },
    { when: has('brave'), t: c => `${c.n}想拉着${c.o}一起去村口外面探探险` },
    { t: c => `${c.n}想和${c.o}坐在一起，聊到太阳落山` },
  ],
  haul: [
    { when: isSp('dog'), t: c => `${c.n}想拉一回最粗的那根绳子，尾巴都摇起来了` },
    { when: isSp('bear'), t: c => `${c.n}觉得自己力气大，想帮大家拖一回大物件` },
    { when: has('generous'), t: c => `${c.n}想跟大家一起去远方，把一件大宝贝拖回家` },
    { t: c => `${c.n}一直想亲手参与一次拖运，看看远方到底有多远` },
  ],
  shop: [
    { when: c => c.shopKind === 'tea', t: c => `${c.n}想去${c.s}喝一杯热茶，捧着杯子发会儿呆` },
    { when: has('foodie'), t: c => `${c.n}想把${c.s}的菜单从头吃到尾` },
    { t: c => `${c.n}闻到${c.s}飘来的香味，忍不住也想去坐一坐` },
  ],
  fish: [
    { when: isSp('cat'), t: c => `${c.n}想要一条亲手钓的鱼，连刺都舍不得浪费` },
    { when: has('easy'), t: c => `${c.n}想在溪边坐一下午，等一条最大的鱼上钩` },
    { t: c => `${c.n}想去溪边钓一回鱼，听浮漂“咚”地一沉` },
  ],
  berry: [
    { when: isSp('bear'), t: c => `${c.n}想把爪子伸进莓果丛里，摘一大捧红果子` },
    { when: has('foodie'), t: c => `${c.n}想吃一大把熟透的莓果，甜得眯起眼睛` },
    { t: c => `${c.n}想去莓果丛摘一篮果子，回来分给大家` },
  ],
  find: [
    { when: has('curious'), t: c => `${c.n}脑子里冒出个念头：远方的草丛里，是不是藏着什么好东西？` },
    { when: has('brave'), t: c => `${c.n}想走到村口外面看看，人类的花园里又掉了什么` },
    { t: c => `${c.n}想去远方转一转，说不定能捡到宝贝` },
  ],
  build: [
    { when: isSp('dog'), t: c => `${c.n}想亲手钉上一排木板，帮新房子装上门` },
    { when: has('diligent'), t: c => `${c.n}手痒了，想帮忙把新房子再盖快一点` },
    { t: c => `${c.n}一直想亲手参与盖房子，看着它一点点立起来` },
  ],
};
export const WISH_ICON = { home: '家', friend: '友', haul: '拖', shop: '店', fish: '鱼', berry: '果', find: '寻', build: '造' };
export function wishText(type, c, seed) { return pick(WISH[type], c, seed); }

// ---------------------------------------------------------------- 离开期间的小故事（每条有“需要什么”的条件，由模拟按真实状态挑选）
export const AWAY = [
  { need: 'friends', t: (a, b) => `${a}和好朋友${b}在溪边钓了一下午鱼，最后谁也没钓到最大的那条，两个都笑了。` },
  { need: 'friends', t: (a, b) => `昨晚${a}睡不着，坐在祭坛边数星星，${b}也披着叶子出来陪着数，数到一百就都困了。` },
  { need: 'friends', t: (a, b) => `${a}帮${b}把晒干的草叶抱回了家，${b}回送了一颗最圆的莓果。` },
  { need: 'shop', t: (o, s, g) => `${o}的${s}来了好几位客人，${g}坐了很久，说下次还要来。` },
  { need: 'trait:diligent', t: (a) => `${a}一大早就去木枝堆捡了一捆细木枝，说是给下一栋房子留着。` },
  { need: 'trait:curious', t: (a, item) => `${a}在村口外的草丛里翻到了一枚${item}，高兴地举起来给大家看。` },
  { need: 'sp:bear', t: (a) => `${a}在莓果丛边打了个盹，醒来时鼻子上停着一只小蝴蝶，谁都没敢出声。` },
  { need: 'sp:chick', t: (a) => `${a}在菜田里追一条小虫子，追了半圈菜田，最后让它走掉了。` },
  { need: 'sp:duck', t: (a) => `${a}在溪水里扑腾了一个早上，回来时羽毛亮晶晶的。` },
  { need: 'sp:cat', t: (a) => `${a}趴在最高的那块石头上晒了半天太阳，尾巴一甩一甩的。` },
  { need: 'sp:dog', t: (a) => `${a}绕着小镇跑了一圈又一圈，说是在“巡逻”，其实是在找扔丢的小石子。` },
  { need: 'sp:rabbit', t: (a) => `${a}给菜田里的萝卜浇了水，还小声跟它们说了几句话。` },
  { need: 'house', t: (a, h) => `${a}给${h}门口的花盆换了新土，门前一下子亮堂了。` },
  { need: 'any', t: (a) => `${a}在广场边的长凳上发了好一会儿呆，后来被一阵风吹来的蒲公英逗笑了。` },
];
export function matName(k) { return MAT_NAME[k]; }
export function spName(sp) { return SP_NAME[sp]; }
export function objName(k) { return OBJ_NAME[k]; }

// ---------------------------------------------------------------- 吃了什么：最近记录里的一句话（按食物和在哪儿吃变化，不重复“在XX在XX”）
const EAT_VERB = { berry: ['抓了一把莓果，酸酸甜甜地吃光了', '剥着莓果一颗颗吃，嘴角红红的'], veg: ['咔嚓咔嚓啃了棵脆菜', '把水灵灵的菜叶嚼得清清爽爽'], fish: ['吃了条鲜鱼，连鱼尾都舍不得剩', '细细地吃了一条鱼，吃得满足'], bread: ['吃了块暖烘烘的面包', '捧着面包，一口一口咬得很香'] };
export function eatText(food, fav, where, seed = 0) {
  const L = EAT_VERB[food] || EAT_VERB.veg; const v = L[Math.abs(seed + (where ? where.length : 0)) % L.length]; const w = where && where !== '粮筐边' ? `在${where}` : '';
  return `${w}${v}${fav ? '——正好是最爱吃的！' : ''}`;
}
export const HUNGRY_LINES = [
  c => `肚子咕咕叫……好想吃${c.a}啊。${c.b ? `可粮筐里的${c.a}没有了，${c.b}也行吧。` : ''}`,
  c => `饿了饿了，现在要是有${c.a}就好了。${c.b ? `（${c.a}不够了，只好先吃点${c.b}。）` : ''}`,
  c => `好饿呀……我想吃${c.a}。${c.b ? `没有的话，${c.b}也可以凑合。` : '去粮筐看看还有没有。'}`,
];
export const FAV_LINES = [
  c => `${c.a}！这是我最爱吃的，真幸福♪`, c => `吃到${c.a}啦，整只都暖洋洋的♪`, c => `${c.b && c.b !== '粮筐边' ? c.b + '的' : ''}${c.a}最合我口味了！`,
];

// ---------------------------------------------------------------- 心声：点头顶有气泡的居民，弹出它此刻在想什么
// 只用真实状态填空：冒气泡的原因（r.bub.why，由模拟在冒泡那一刻写下）、正在做的事（doing）、心愿、聊天的对象和最近发生的事。
// 每种原因几句，按居民编号 + 天数挑一句（同一个气泡里不会来回换句子）。
const VOICE = { chick: '啾~', rabbit: '', cat: '喵~', dog: '汪！', duck: '嘎~', bear: '嗯……' };
const THOUGHT = {
  gawk: [c => `咦？天上掉下来一个${c.a}！它是干什么用的呀？`, c => `${c.a}……是大好人给我们的吗？我凑近看看。`, c => `哇，${c.a}！我还没见过这个呢。`],
  talk: [c => `${c.b ? `我和${c.b}在商量` : '我在想'}，这个${c.a}到底怎么用才好呢……`, c => `${c.a}可以做点什么呢？大家的意见好像都不一样……`],
  made: [c => `${c.a}变成「${c.b}」啦！好厉害！`, c => `我们一起把${c.a}改成了「${c.b}」，真的做成了。`],
  combo: [c => `${c.a}和${c.b}靠在一起，居然变成了${c.c}！我看呆了。`, c => `变戏法！${c.a}加${c.b}，变出了${c.c}。`],
  flyback: [c => `咦，${c.a}怎么又飞回天上去了？`, c => `${c.a}不见了……是大好人又收回去了吗？`],
  rain: [c => `下雨了！${c.a}别淋湿呀，我得赶紧去照看它。`, c => `雨点落下来了，${c.a}会被泡坏的，快去帮它躲雨。`],
  rainDone: [c => c.b ? `把${c.a}抱到${c.b}的屋檐下了，这样就淋不到雨啦。` : `给${c.a}盖了片大叶子，它不会淋雨了。`, c => `${c.a}躲好雨了，我松了口气。`],
  snow: [c => `雪人堆好啦，圆滚滚的真可爱♪`, c => `这个雪人是我堆的！鼻子是胡萝卜。`],
  fest: [c => `今天是${c.a}，大家都在广场上，我也想凑个热闹♪`, c => `${c.a}到了！我要去看看大家布置得怎么样了。`],
  fac: [c => `在${c.a}${c.b}，心情真好♪`, c => `${c.a}真不错，${c.b}以后还要再来。`],
  move: [c => c.b || `${c.a}要搬家啦！`],
  nugget: [c => `是那个白白软软的团子！它${c.a || '又跳过来了'}……`, c => `团子团子！你从哪儿来的呀？`, c => `那个白团子身上有好闻的味道，是大好人家的吗？`],
  lenia: [c => `那边……是不是有个好大好大的${c.a || '身影'}？`, c => `嘘——好像是大好人！我看见${c.a || '她'}了！`, c => `${c.a || '那个大大的影子'}……会不会就是给我们送东西的大好人？`],
  hungry: HUNGRY_LINES,
  favEat: FAV_LINES,
  clear: [c => c.m === 'mat' ? `${c.b}缺${c.c}，外圈那丛${c.a}又高又壮，砍下来正好当材料。` : `${c.b}要落在这丛${c.a}上，得先把它清掉，不然放不稳。`,
    c => c.m === 'mat' ? `嘿哟——${c.a}比我高多了！砍倒它，就有${c.c}送去工地啦。` : `大家一起上，把${c.a}清掉，给${c.b}腾块平地出来！`],
  mat: [c => `${c.b}还缺${c.a}，我得去${c.c}找找看……`, c => `${c.a}、${c.a}……${c.c}那边应该有，我去找找。`],
};
export function thoughtOf(r, day = 0) {
  const b = r.bub, w = b && b.why; const pickI = (n) => Math.abs(r.id * 7 + day) % n; const out = { main: '', doing: '', wish: '' };
  if (r.chatP) { const last = (r.recent[0] || '').replace(/^\d\d:\d\d\s*/, ''); out.main = last ? `我在和${r.chatP}聊天……刚才我${last}，正好说给它听。` : `我在和${r.chatP}聊天，聊得挺开心的……`; }
  else if (w && THOUGHT[w.k]) { const L = THOUGHT[w.k]; out.main = L[pickI(L.length)](w); }
  else if (b) out.main = `${b.code === 1 ? '咦？' : b.code === 3 ? '♪ ' : ''}我正在${r.doing || '看看周围'}。`;
  else out.main = '……';
  const v = VOICE[r.sp]; if (v && out.main.length < 30 && !/[！？♪~…]$/.test(out.main)) out.main += v;
  if (r.doing && !out.main.includes(r.doing)) out.doing = `现在：${r.doing}`;
  if (r.wish && r.wish.text) out.wish = `心愿：${r.wish.text}`;
  return out;
}
