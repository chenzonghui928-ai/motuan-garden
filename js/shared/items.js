// 「你和 Lenia 一起照顾小动物」：储物箱旧物、用途、组合、回礼、花种、小镇愿望、摆放检查。纯数据 + 纯数学，主线程与 Worker 共用。
// 载入时会把新物件的尺寸 / 拖运人数 / 床位 / 名字补进 layout.js 的共享表（TEAM、CAP、KIND_DEFAULT、OBJ_NAME、SHOP），sim-core 原有流程直接可用。
import { TEAM, CAP, KIND_DEFAULT, OBJ_NAME, SHOP, STREAM, streamDist, segDist, WORLD_R, PLAZA_R, EDGE_R } from './layout.js';
import { footOf, circleFoot, prepFit, fitCheck, bodyGap, COMBO_GAP } from './footprint.js';
import { propR, propH, comboR, comboH } from './scale.js';

// 房子造型（程序化模板）对应的旧物；其余旧物由 render/props.js 画
export const TEMPLATE_OF = { teapot: 'tea', boot: 'rboot', fishtin: 'fish', teacup: 'cup', honeyjar: 'honey', eggshell: 'egg' };
export const TEMPLATE_KINDS = new Set(['egg', 'tea', 'fish', 'boot', 'rboot', 'cup', 'honey', 'leaf', 'mush', 'pine']);
export const renderKindOf = (item) => TEMPLATE_OF[item] || item;
// 储物箱里哪些旧物能直接拆成某种小材料（施工牌「补材料」用）：[[旧物, 能拆出几个], ...]，拆得多的在前
export function matSources(box, m) { const out = []; for (const k in box || {}) { if (!(box[k] > 0) || !ITEMS[k]) continue; const u = ITEMS[k].uses.find(u => u.u === 'mat' && u.mat === m); if (u) out.push([k, u.n]); } return out.sort((a, b) => b[1] - a[1]); }

// size: big 大件（要组队拖）、mid、small 小件（一两个人就能搬，常做装饰/材料/组合件）
// uses: home(sp=物种, 空=谁没家给谁) / shop(shop=店种) / fac(fac=设施种类) / deco / mat(mat=拆成什么材料,n) / bridge
//   water:true 放在溪边才会这么用；plaza:true 离广场近更可能
export const ITEMS = {
  teapot: { mat: 'ceramic', name: '旧茶壶', size: 'big', cost: 0, desc: '壶嘴还能倒水，盖子有点松。', uses: [{ u: 'home', sp: 'rabbit', name: '茶壶屋' }, { u: 'shop', shop: 'tea', name: '茶壶茶馆' }, { u: 'shop', shop: 'bath', name: '茶壶澡堂', water: true }] },
  boot: { mat: 'rubber', name: '雨靴', size: 'big', cost: 0, desc: '左脚那只，鞋底还沾着去年的泥。', uses: [{ u: 'home', sp: 'dog', name: '雨靴屋' }, { u: 'home', sp: 'bear', name: '雨靴木屋' }, { u: 'fac', fac: 'dock', name: '雨靴码头', water: true }] },
  cookietin: { mat: 'tin', name: '饼干盒', size: 'big', cost: 0, desc: '蓝色铁皮盒，闻起来还有黄油味。', uses: [{ u: 'shop', shop: 'bakery', name: '饼干盒面包房' }, { u: 'fac', fac: 'stage', name: '饼干盒小舞台', plaza: true }, { u: 'fac', fac: 'shed', name: '饼干盒储物间' }] },
  yarn: { mat: 'cloth', name: '毛线球', size: 'small', cost: 0, desc: '红色的，线头总是跑出来。', uses: [{ u: 'fac', fac: 'play', name: '毛线秋千' }, { u: 'mat', mat: 'thread', n: 4, name: '一大团线头' }, { u: 'deco', name: '毛线小地毯' }] },
  fishtin: { mat: 'tin', name: '鱼罐头', size: 'big', cost: 4, desc: '早就吃空了，罐身上画着一条胖鱼。', uses: [{ u: 'home', sp: 'cat', name: '鱼罐头屋' }, { u: 'shop', shop: 'food', name: '罐头小食堂' }, { u: 'fac', fac: 'dock', name: '罐头渡船', water: true }] },
  teacup: { mat: 'ceramic', name: '大茶杯', size: 'big', cost: 4, desc: '杯沿缺了个小口，花纹还很好看。', uses: [{ u: 'home', sp: 'duck', name: '茶杯屋' }, { u: 'shop', shop: 'tea', name: '茶杯茶座' }, { u: 'shop', shop: 'bath', name: '茶杯澡堂', water: true }] },
  honeyjar: { mat: 'glass', name: '蜂蜜罐', size: 'big', cost: 5, desc: '罐底还剩一点点蜂蜜。', uses: [{ u: 'home', sp: 'bear', name: '蜂蜜罐屋' }, { u: 'shop', shop: 'food', name: '蜂蜜点心铺' }, { u: 'home', sp: 'chick', name: '蜂蜜罐暖屋' }] },
  eggshell: { mat: 'shell', name: '大蛋壳', size: 'big', cost: 3, desc: '复活节剩下的，画了一半的彩蛋。', uses: [{ u: 'home', sp: 'chick', name: '蛋壳屋' }, { u: 'home', sp: 'duck', name: '蛋壳水边屋' }, { u: 'fac', fac: 'play', name: '蛋壳滑梯', plaza: true }] },
  button: { mat: 'plastic', name: '大纽扣', size: 'small', cost: 2, desc: '外套上掉下来的，四个小孔。', uses: [{ u: 'fac', fac: 'table', name: '纽扣野餐桌' }, { u: 'deco', name: '纽扣踏脚石' }, { u: 'mat', mat: 'button', n: 3, name: '几颗小纽扣' }] },
  toycar: { mat: 'tin', name: '玩具车', size: 'mid', cost: 4, desc: '发条坏了，轮子还转得动。', uses: [{ u: 'fac', fac: 'train', name: '玩具车货运站' }, { u: 'fac', fac: 'play', name: '玩具车滑梯', plaza: true }, { u: 'deco', name: '路边的玩具车' }] },
  spool: { mat: 'wood', name: '线轴', size: 'small', cost: 2, desc: '木头线轴，缠着半圈蓝线。', uses: [{ u: 'fac', fac: 'well', name: '线轴水井' }, { u: 'fac', fac: 'table', name: '线轴小圆桌' }, { u: 'mat', mat: 'thread', n: 3, name: '一卷蓝线' }] },
  pencil: { mat: 'wood', name: '长铅笔', size: 'mid', cost: 3, desc: '削得很尖，另一头有块橡皮。', uses: [{ u: 'bridge', name: '铅笔小桥', water: true }, { u: 'fac', fac: 'flag', name: '铅笔旗杆', plaza: true }, { u: 'mat', mat: 'twig', n: 5, name: '一捆木条' }] },
  rubberduck: { mat: 'rubber', name: '小黄鸭', size: 'mid', cost: 4, desc: '捏一下会“叽”一声。', uses: [{ u: 'fac', fac: 'dock', name: '小黄鸭渡船', water: true }, { u: 'fac', fac: 'play', name: '小黄鸭滑梯' }, { u: 'deco', name: '小黄鸭雕像' }] },
  matchbox: { mat: 'paper', name: '火柴盒', size: 'small', cost: 3, desc: '里面的火柴早就没了。', uses: [{ u: 'home', sp: null, name: '火柴盒小床铺' }, { u: 'fac', fac: 'post', name: '火柴盒邮局' }, { u: 'mat', mat: 'nail', n: 2, name: '几根小钉子' }] },
  thimble: { mat: 'metal', name: '顶针', size: 'small', cost: 2, desc: '黄铜的，表面全是小坑，下沿有一圈小红花。', uses: [{ u: 'fac', fac: 'bell', name: '顶针钟' , plaza: true }, { u: 'deco', name: '顶针花盆' }, { u: 'mat', mat: 'cap', n: 2, name: '亮晶晶的小盖子' }] },
  glassjar: { mat: 'glass', name: '玻璃罐', size: 'mid', cost: 5, desc: '空果酱罐，盖子早丢了，洗得亮晶晶的。', uses: [{ u: 'fac', fac: 'lamp', name: '萤火虫灯' }, { u: 'fac', fac: 'garden', name: '玻璃罐温室' }, { u: 'deco', name: '玻璃罐小景' }] },
  oldbook: { mat: 'paper', name: '旧书', size: 'mid', cost: 4, desc: '童话书，最后几页被雨泡皱了。', uses: [{ u: 'bridge', name: '旧书拱桥', water: true }, { u: 'fac', fac: 'school', name: '旧书图书角' }, { u: 'deco', name: '旧书小凉亭' }] },
  kettle: { mat: 'metal', name: '旧水壶', size: 'big', cost: 5, desc: '搪瓷的，磕掉了一块漆。', uses: [{ u: 'shop', shop: 'bath', name: '水壶澡堂', water: true }, { u: 'fac', fac: 'well', name: '水壶水塔' }, { u: 'shop', shop: 'tea', name: '水壶茶摊' }] },
  flowerpot: { mat: 'ceramic', name: '花盆', size: 'small', cost: 2, desc: '陶土的，边上有一圈白霜和青苔。', uses: [{ u: 'fac', fac: 'garden', name: '花盆花坛' }, { u: 'deco', name: '花盆小景' }, { u: 'mat', mat: 'stone', n: 3, name: '一堆碎陶片' }] },
  toaster: { mat: 'metal', name: '吐司机', size: 'big', cost: 5, desc: '奶油色的，侧面画着番茄藤，拨杆还能按下去。', uses: [{ u: 'shop', shop: 'bakery', name: '吐司机面包房' }, { u: 'fac', fac: 'shed', name: '吐司机储物间' }, { u: 'deco', name: '吐司机小景' }] },
  // ---- 季节限定（season：只在这个季节进阁楼/储物箱）
  umbrella: { mat: 'plastic', season: 'spring', name: '鸡尾酒小纸伞', size: 'mid', cost: 3, desc: '红白条的小纸伞，本来插在冰饮杯子里，撑开还是圆圆的，细细的竹签当伞柄。', uses: [{ u: 'fac', fac: 'table', name: '小纸伞凉亭', plaza: true }, { u: 'shop', shop: 'tea', name: '小纸伞茶亭' }, { u: 'deco', name: '小纸伞蘑菇' }] },
  kite: { mat: 'paper', season: 'spring', name: '小纸风筝', size: 'mid', cost: 3, desc: '燕子形状的小纸风筝，翅膀上一个红圆点，尾巴上系着三个小蝴蝶结。', uses: [{ u: 'fac', fac: 'flag', name: '风筝瞭望台', plaza: true }, { u: 'fac', fac: 'play', name: '风筝滑翔坡' }, { u: 'mat', mat: 'thread', n: 3, name: '一卷风筝线' }] },
  trowel: { mat: 'metal', season: 'spring', name: '小花铲', size: 'small', cost: 2, desc: '绿柄的小铁铲，铲尖还粘着一点去年的泥。', uses: [{ u: 'fac', fac: 'garden', name: '花铲苗圃' }, { u: 'fac', fac: 'well', name: '花铲小水渠' }, { u: 'mat', mat: 'nail', n: 2, name: '两颗铁铆钉' }] },
  strawhat: { mat: 'straw', season: 'summer', name: '草帽', size: 'mid', cost: 3, desc: '宽檐草帽，系着一条红丝带，晒得暖烘烘的。', uses: [{ u: 'home', sp: null, name: '草帽小屋' }, { u: 'fac', fac: 'table', name: '草帽凉棚', plaza: true }, { u: 'shop', shop: 'tea', name: '草帽冷饮铺' }] },
  popsicle: { mat: 'wood', season: 'summer', name: '冰棍棍', size: 'small', cost: 2, desc: '一小把吃完的冰棍棍，闻起来还有一点点橘子味。', uses: [{ u: 'fac', fac: 'flag', name: '冰棍棍路牌' }, { u: 'fac', fac: 'table', name: '冰棍棍小板凳' }, { u: 'mat', mat: 'twig', n: 4, name: '一把小木条' }] },
  shell: { mat: 'shell', season: 'summer', name: '贝壳', size: 'small', cost: 3, desc: '海边捡来的扇贝壳，里面是淡淡的粉色。', uses: [{ u: 'shop', shop: 'bath', name: '贝壳澡堂', water: true }, { u: 'fac', fac: 'bell', name: '贝壳风铃', plaza: true }, { u: 'deco', name: '贝壳小景' }] },
  rake: { mat: 'wood', season: 'autumn', name: '玩具小耙子', size: 'mid', cost: 3, desc: '给小朋友玩沙子的小耙子，绿漆木柄掉了几块漆，竹子做的耙齿弯弯的。', uses: [{ u: 'fac', fac: 'shed', name: '小耙子储物架' }, { u: 'fac', fac: 'play', name: '小耙子秋千' }, { u: 'mat', mat: 'twig', n: 5, name: '一捆小竹条' }] },
  pumpkin: { mat: 'veg', season: 'autumn', name: '南瓜', size: 'big', cost: 4, desc: '圆滚滚的大南瓜，顶上的藤还弯着一个卷儿。', uses: [{ u: 'home', sp: null, name: '南瓜屋' }, { u: 'shop', shop: 'food', name: '南瓜点心铺' }, { u: 'fac', fac: 'lamp', name: '南瓜灯', plaza: true }] },
  chestnut: { mat: 'veg', season: 'autumn', name: '栗子壳', size: 'small', cost: 2, desc: '毛刺刺的栗子壳，裂开的口子里还躺着三颗栗子。', uses: [{ u: 'fac', fac: 'table', name: '栗子壳小茶几' }, { u: 'deco', name: '栗子壳刺猬' }, { u: 'mat', mat: 'stone', n: 3, name: '一把栗子' }] },
  mittens: { mat: 'cloth', season: 'winter', name: '毛线手套', size: 'mid', cost: 3, desc: '红色的毛线手套，手背上织着白雪花，拇指那里有个小洞。', uses: [{ u: 'home', sp: null, name: '手套暖窝' }, { u: 'fac', fac: 'play', name: '手套滑梯' }, { u: 'deco', name: '手套小景' }] },
  beanie: { mat: 'cloth', season: 'winter', name: '毛线帽', size: 'mid', cost: 3, desc: '绿白条纹的毛线帽，顶上一个圆滚滚的绒球。', uses: [{ u: 'home', sp: null, name: '毛线帽小屋' }, { u: 'shop', shop: 'tea', name: '毛线帽茶室' }, { u: 'mat', mat: 'thread', n: 4, name: '一团毛线' }] },
  hotbottle: { mat: 'rubber', season: 'winter', name: '暖水袋', size: 'mid', cost: 4, desc: '红色橡胶暖水袋，外面套着一件格子小毛衣。', uses: [{ u: 'shop', shop: 'bath', name: '暖水袋汤屋' }, { u: 'fac', fac: 'table', name: '暖水袋暖桌' }, { u: 'deco', name: '暖水袋靠垫' }] },
  jinglebell: { mat: 'metal', season: 'winter', name: '圣诞铃铛', size: 'small', cost: 3, desc: '金色的小铃铛，系着红丝带和两片冬青叶，一碰就叮当响。', uses: [{ u: 'fac', fac: 'bell', name: '铃铛钟楼', plaza: true }, { u: 'deco', name: '铃铛小景' }, { u: 'mat', mat: 'cap', n: 3, name: '亮晶晶的小铃片' }] },
};
// 淋雨太久“变旧”以后：名字和能做的用途变了（没写的旧物不怕雨）
export const WORN = {
  yarn: { name: '淋湿的毛线球', uses: [{ u: 'deco', name: '湿毛线小窝' }, { u: 'mat', mat: 'thread', n: 2, name: '几根旧线头' }] },
  spool: { name: '泡胀的线轴', uses: [{ u: 'fac', fac: 'table', name: '旧线轴矮桌' }, { u: 'mat', mat: 'twig', n: 2, name: '几片旧木片' }] },
  pencil: { name: '泡软的铅笔', uses: [{ u: 'deco', name: '铅笔篱笆' }, { u: 'mat', mat: 'twig', n: 3, name: '几根旧木条' }] },
  matchbox: { name: '泡烂的火柴盒', uses: [{ u: 'deco', name: '纸盒花槽' }, { u: 'mat', mat: 'nail', n: 1, name: '一根小钉子' }] },
  oldbook: { name: '泡皱的旧书', uses: [{ u: 'deco', name: '旧书铺路石' }] },
  kite: { name: '泡破的小风筝', uses: [{ u: 'deco', name: '破风筝稻草人' }, { u: 'mat', mat: 'twig', n: 2, name: '几根风筝骨' }] },
  strawhat: { name: '淋塌的草帽', uses: [{ u: 'deco', name: '草帽鸟窝' }, { u: 'mat', mat: 'grass', n: 4, name: '一捆旧草' }] },
  popsicle: { name: '发霉的冰棍棍', uses: [{ u: 'mat', mat: 'twig', n: 3, name: '几根旧木条' }] },
  rake: { name: '泡旧的小耙子', uses: [{ u: 'deco', name: '旧耙子篱笆' }, { u: 'mat', mat: 'twig', n: 4, name: '几根旧竹条' }] },
  mittens: { name: '湿透的手套', uses: [{ u: 'deco', name: '手套晾衣绳' }, { u: 'mat', mat: 'thread', n: 3, name: '一把毛线头' }] },
  beanie: { name: '湿透的毛线帽', uses: [{ u: 'deco', name: '湿毛线帽小窝' }, { u: 'mat', mat: 'thread', n: 4, name: '一团旧毛线' }] },
};
export const ITEM_KEYS = Object.keys(ITEMS);
export const START_BOX = { teapot: 1, boot: 1, cookietin: 1, yarn: 2 };
export const START_UNLOCK = ['teapot', 'boot', 'cookietin', 'yarn'];
// 新物件的占地 / 门 / 高（render 用 props 画；门在本地 +z 方向）
// r（占地半径 = 模型缩放）和 h 不再手写大中小三档，从 shared/scale.js 登记的真实厘米尺寸推出；size 只管拖运要几个人
export const ITEM_K = {}; export const ITEM_TEAM = {};
for (const k of ITEM_KEYS) {
  const it = ITEMS[k];
  ITEM_TEAM[k] = it.size === 'big' ? (TEAM[TEMPLATE_OF[k]] || 4) : it.size === 'mid' ? 2 : 1;
  if (!TEMPLATE_OF[k]) { const r = propR(k); ITEM_K[k] = { r, door: [0, r + 0.2], h: propH(k) }; }
}
// 组合惊喜：两件旧物放得很近（6 格以内）就有可能合成特别的东西
export const COMBOS = [
  { id: 'cozytea', sign: '毛线茶馆', a: 'teapot', b: 'yarn', base: 'tea', name: '毛线茶壶暖房', u: 'shop', shop: 'tea', story: '它们把毛线一圈圈织在茶壶外面，给茶壶穿了件毛衣。冬天坐在里面喝茶，连壶嘴都是暖的。' },
  { id: 'bootpost', sign: '靴子邮局', a: 'boot', b: 'button', base: 'rboot', name: '纽扣靴子邮局', u: 'fac', fac: 'post', story: '靴子立起来当邮局，纽扣钉在门口当门铃，一按就“咚”一声。从此大家给大好人写纸条更勤了。' },
  { id: 'musicbox', sign: '音乐台', a: 'cookietin', b: 'spool', name: '饼干盒音乐台', u: 'fac', fac: 'stage', story: '线轴装在饼干盒上当摇把，一摇，盒子里就叮叮当当地响。傍晚大家都围过来跳舞。' },
  { id: 'teabath', sign: '茶杯温泉', a: 'teacup', b: 'kettle', base: 'cup', name: '茶杯温泉', u: 'shop', shop: 'bath', story: '水壶烧水，茶杯当浴池，热气一冒，整个小镇都闻到了茶香。' },
  { id: 'firefly', sign: '萤火灯', a: 'glassjar', b: 'yarn', name: '萤火虫吊灯', u: 'fac', fac: 'lamp', story: '用毛线把玻璃罐吊在树枝上，里面住进了几只萤火虫。夜里走夜路的小动物再也不怕黑了。' },
  { id: 'train', sign: '小火车', a: 'toycar', b: 'matchbox', name: '火柴盒小火车', u: 'fac', fac: 'train', story: '火柴盒挂在玩具车后面当车厢，大家推着它运东西，拖大物件快多了。' },
  { id: 'thimblegarden', sign: '顶针花园', a: 'flowerpot', b: 'thimble', name: '顶针花园', u: 'fac', fac: 'garden', story: '顶针扣在花盆边上当小水桶，接住的雨水刚好够浇一圈花。' },
  { id: 'library', sign: '图书馆', a: 'oldbook', b: 'pencil', name: '小小图书馆', u: 'fac', fac: 'school', story: '旧书立起来当墙，铅笔横过去当房梁。现在每天下午都有人在里面念故事。' },
  { id: 'duckboat', sign: '鸭子拖船', a: 'rubberduck', b: 'boot', name: '小黄鸭拖船', u: 'fac', fac: 'dock', story: '小黄鸭在前面拉，雨靴在后面装货，小镇有了第一条船。' },
  // ---- 第二批 12 对（模型见 render/props.js 的 COMBO_MODEL）
  { id: 'toastbake', sign: '吐司烘焙坊', a: 'toaster', b: 'cookietin', name: '吐司饼干烘焙坊', u: 'shop', shop: 'bakery', story: '吐司机稳稳地坐在饼干盒上，拨杆一按，金黄的吐司片就“嘣”地弹出来。整个小镇都被烤面包的香味叫醒了，大家排着队来买。' },
  { id: 'honeytea', sign: '蜂蜜茶摊', a: 'honeyjar', b: 'teacup', base: 'cup', name: '蜂蜜茶摊', u: 'shop', shop: 'tea', story: '大茶杯里倒满热茶，再淋上一大勺蜂蜜罐里的蜂蜜。小熊趴在摊子上，一口气喝了三杯，嘴边全是甜甜的蜂蜜。' },
  { id: 'yarncradle', sign: '蛋壳摇篮', a: 'eggshell', b: 'yarn', base: 'egg', name: '毛线蛋壳摇篮', u: 'home', sp: 'chick', story: '大蛋壳里铺满软软的毛线，边上还系了一圈红毛线领子，像一只暖暖的小摇篮。小鸡们说，钻进去就像回到了蛋里，睡得特别香。' },
  { id: 'tinwell', sign: '罐头辘轳井', a: 'fishtin', b: 'spool', name: '罐头辘轳井', u: 'fac', fac: 'well', story: '线轴当辘轳架在鱼罐头上，摇一摇，蓝线放下去，小水桶就咕噜咕噜打上水来。罐头里的水清清凉凉，附近的花喝得饱饱的，长得更快了。' },
  { id: 'glasshouse', sign: '玻璃温室', a: 'glassjar', b: 'flowerpot', name: '玻璃罐温室', u: 'fac', fac: 'garden', story: '玻璃罐倒扣在花盆上，里面暖烘烘、湿漉漉的。种子还没来得及伸懒腰就发了芽，附近的花也跟着长得更快。' },
  { id: 'umbrellatea', sign: '雨伞茶座', a: 'umbrella', b: 'teacup', name: '雨伞茶座', u: 'fac', fac: 'table', story: '撑开的小纸伞当遮阳棚，大茶杯当圆桌。春雨淅淅沥沥，饿了的小家伙都挤到伞底下，围着圆桌吃点心、聊闲天。' },
  { id: 'kiteflag', sign: '风筝旗杆', a: 'kite', b: 'pencil', name: '风筝旗杆', u: 'fac', fac: 'flag', story: '长铅笔立在草地上当旗杆，风筝系在线上飞得高高的。风一吹，远处的小动物一眼就看见了小镇，新邻居来得也更快了。' },
  { id: 'strawhome', sign: '草帽贝壳屋', a: 'strawhat', b: 'shell', name: '草帽贝壳小屋', u: 'home', story: '草帽扣在小圆屋上当屋顶，屋顶上再立一枚大贝壳。夏天屋里凉飕飕的，贴着墙还能听见海的声音。' },
  { id: 'popseesaw', sign: '冰棍跷跷板', a: 'popsicle', b: 'button', name: '冰棍跷跷板', u: 'fac', fac: 'play', story: '一把冰棍棍拼成长长的木板，架在立起来的大纽扣上。这头翘起来，那头“咚”地落下，小家伙们排着队抢着玩，玩着玩着就更要好了。' },
  { id: 'pumpkinstore', sign: '南瓜储藏室', a: 'pumpkin', b: 'rake', name: '南瓜储藏室', u: 'fac', fac: 'shed', story: '南瓜掏空了，里面又干燥又凉快。玩具小耙子靠在门边，扫来的栗子、干草和小材料都堆进去，能多放不少。' },
  { id: 'bellboot', sign: '铃铛钟楼', a: 'jinglebell', b: 'boot', name: '铃铛靴子钟楼', u: 'fac', fac: 'bell', story: '雨靴立在草地上，顶上搭了个小亭子，挂起一只金铃铛。风一吹就叮叮当当，大家听着钟声起床，整个冬天都有了盼头。' },
  { id: 'mittenhome', sign: '手套暖暖屋', a: 'mittens', b: 'hotbottle', name: '手套暖暖屋', u: 'home', story: '暖水袋当屋子，毛线手套守在门口两边。一进门就暖烘烘的，外面雪下得再大，里面也一点儿都不冷。' },
];
for (const c of COMBOS) { const r = comboR(c.id); ITEM_K['combo_' + c.id] = { r, door: [0, r + 0.2], h: comboH(c.id) }; }
for (const k in ITEM_K) { ITEM_TEAM[k] = ITEM_TEAM[k] || 2; TEAM[k] = ITEM_TEAM[k]; CAP[k] = 2; KIND_DEFAULT[k] = ITEM_K[k]; }
for (const k of ITEM_KEYS) if (!TEMPLATE_OF[k]) OBJ_NAME[k] = ITEMS[k].name;
for (const c of COMBOS) OBJ_NAME['combo_' + c.id] = c.name;
CAP.matchbox = 2;
export function comboOf(a, b) { return COMBOS.find(c => (c.a === a && c.b === b) || (c.a === b && c.b === a)) || null; }
export const COMBO_R = 6.5;
// 新店种
Object.assign(SHOP, {
  bath: { name: '澡堂', act: '泡澡', verb: '泡了个热水澡' },
  bakery: { name: '面包房', act: '买面包', verb: '吃了块刚出炉的面包' },
});
export const FOODISH = new Set(['food', 'bakery']);
// 木牌上的名字（2～5 个字）：去掉旧物名前缀（「饼干盒小舞台」→「小舞台」），组合用短名
export function signName(l) {
  if (l.combo) { const c = COMBOS.find(c => c.id === l.combo); if (c && c.sign) return c.sign; }
  let n = l.name || ''; const it = ITEMS[l.item]; for (const pre of ['路边的', it && it.name, it && WORN[l.item] && WORN[l.item].name]) if (pre && n.startsWith(pre) && n.length - pre.length >= 2) n = n.slice(pre.length);
  return n.length > 5 ? n.slice(-5) : n;
}
// 设施：放在镇上的东西，让附近的居民开心，有些还有特别作用
export const FAC = {
  play: { name: '游乐', verb: '玩了一会儿', fx: '小狗和好奇的小家伙最爱来玩，一起玩的会更要好' },
  table: { name: '野餐桌', verb: '坐着聊了会儿天', fx: '饿了的小家伙会来这儿吃点东西，围着桌子一起吃更开心' },
  stage: { name: '舞台', verb: '跳了一支舞', fx: '傍晚有人上台跳舞，跳完心情特别好' },
  shed: { name: '储物', verb: '整理了一下材料', fx: '小材料能多放 20 份' },
  dock: { name: '码头', verb: '在水边吹了会儿风', fx: '溪里的鱼长得更快，钓鱼更容易' },
  well: { name: '水井', verb: '打了一桶水', fx: '附近的花长得快一半，来打水的小家伙顺便解解渴' },
  flag: { name: '旗杆', verb: '看了一会儿旗子', fx: '远处的小动物更容易找到小镇，新邻居来得更快' },
  post: { name: '邮局', verb: '寄了一张小纸条', fx: '窗台上每天多一份回礼' },
  bell: { name: '钟', verb: '敲了一下钟', fx: '听着钟声起床，大家早上精神更好' },
  lamp: { name: '灯', verb: '借着灯光坐了一会儿', fx: '夜里在附近走的小家伙心情更好' },
  garden: { name: '花园', verb: '闻了闻花', fx: '附近的花长得快一半，落成时还开出一圈花' },
  school: { name: '学堂', verb: '听了一段故事', fx: '在这儿听故事的小家伙会成为朋友，全镇交朋友更快' },
  train: { name: '货运', verb: '推着车跑了一圈', fx: '拖大物件走得更快' },
  pond: { name: '池塘', verb: '蹲在池塘边看水黾划水', fx: '鸭子和小鸡最喜欢来这儿玩水' },
  boat: { name: '小船', verb: '划着小船在水洼里转了一圈', fx: '大家轮流划船，划完心情很好' },
};

// ---------------------------------------------------------------- 回礼与花
export const GIFTS = {
  wreath: { name: '花环', heart: 3 }, pebble: { name: '漂亮石子', heart: 1 }, leafpack: { name: '叶子包', heart: 2 },
  note: { name: '小纸条', heart: 2 }, acorn: { name: '橡果', heart: 1 }, feather: { name: '羽毛', heart: 1 },
};
export const SEEDS = {
  daisy: { name: '雏菊', col: '#ffffff', mid: '#ffd23f', cost: 0 },
  sunflower: { name: '向日葵', col: '#ffc928', mid: '#7a4a1e', cost: 3 },
  tulip: { name: '郁金香', col: '#ff6f61', mid: '#ffd8c8', cost: 3 },
  bluebell: { name: '风铃草', col: '#7f9cf0', mid: '#e3ecff', cost: 4 },
  // 远行才带得回来的稀有花种（rare：花种页里只有拿到过才显示）
  poppy: { name: '虞美人', col: '#e8433a', mid: '#2a1a1a', cost: 5, rare: true },
  lavender: { name: '薰衣草', col: '#9b7fd6', mid: '#efe6ff', cost: 5, rare: true },
  moonflower: { name: '月光花', col: '#f4f7ff', mid: '#cfe0ff', cost: 6, rare: true },
};
export const START_SEEDS = { daisy: 6 };
export const FLOWER_DAY = 0.55;  // 浇过水的花大约 0.55 天开花
export const MAX_FLOWERS = 60, MAX_SILL = 8;

// 小纸条：小动物口吻
export function noteText(kind, c) {
  const L = {
    thanks: [`谢谢大好人的${c.item}！我们把它改成了${c.what}，${c.n}第一个进去的。`, `大好人，你的${c.item}我们收下啦，现在叫「${c.what}」。——${c.n}`, `${c.item}好大好大！我们推了一下午才推动。谢谢你。——${c.n}`],
    flower: [`窗外的${c.flower}开了，${c.n}偷偷闻了好几次。`, `谢谢你种的花，${c.n}编了一个花环送给你。`],
    daily: [`今天天气很好，${c.n}想跟大好人说声早上好。`, `${c.n}捡到一颗很圆的石子，放在你的窗台上了。`, `大好人，你是不是住在那个很高很高的房子里？——${c.n}`, `${c.n}昨天梦见你了，梦里你有一双很大很暖的手。`, `我们不知道你是谁，但是谢谢你。——${c.n}`, `${c.n}说，好像看见了两个大好人，一个还戴着发夹。是真的吗？`],
    wish: [`我们的愿望「${c.wish}」实现了！大家说要谢谢大好人。——${c.n}`],
  }[kind];
  return L[Math.abs(c.seed | 0) % L.length];
}

// ---------------------------------------------------------------- 小镇愿望（文案；判定在 sim/lenia.js）
export const TOWN_WISHES = {
  bakery: { say: '它们好像很想要一家面包店。我们找找家里有没有饼干盒、吐司机这样的大盒子？', items: ['cookietin', 'toaster'], title: '想要一家面包店', need: '一个饼干盒或吐司机（大盒子都行），放在小路边', who: 'rabbit', reward: { item: { glassjar: 1 }, heart: 3 } },
  flowers: { say: '小鸡们说想要更多花。我们多种几棵，记得浇水哦。', items: [], title: '想要更多花', need: '花园里开出 6 朵花', who: 'chick', reward: { seeds: { sunflower: 3, tulip: 3 }, heart: 2 } },
  play: { say: '小狗们闲得直转圈……家里的毛线球、玩具车，拿给它们玩吧？', items: ['yarn', 'toycar'], title: '想有个玩的地方', need: '一件能玩的东西（毛线球、玩具车……）', who: 'dog', reward: { item: { spool: 1, button: 1 }, heart: 3 } },
  bridge: { say: '它们好像想过小溪，我们找找家里有没有长长的东西？', items: ['pencil', 'oldbook'], title: '想过小溪去看看', need: '一件长长的东西（铅笔、旧书），放在溪边', who: 'duck', reward: { item: { rubberduck: 1 }, heart: 3 } },
  home: { say: '{sp}们还没有自己的家。我们找件够大的旧东西，给它们改成家吧。', items: ['teapot', 'boot'], title: '想要自己的家', need: '一件够大的旧物，给它们改成家', who: null, reward: { item: { button: 1 }, heart: 2 } },
  harvest: { say: '丰收节快到了！我们多种点花，再给它们一个能跳舞的台子。', season: 'autumn', items: ['cookietin', 'pumpkin'], title: '想把丰收节办得热热闹闹', need: '开 8 朵花，还要有个舞台、音乐台或南瓜灯', who: 'bear', reward: { heart: 8, seeds: { bluebell: 3 } } },
  // 季节愿望：只在那个季节出现，季节过了没实现就悄悄收起来，明年再来
  kite: { say: '春天就该放风筝！阁楼里那只小纸风筝，我们拿出来吧。', season: 'spring', items: ['kite', 'umbrella'], title: '想在花朝节放风筝', need: '一只小纸风筝（春天阁楼里有），放进花园', who: 'chick', reward: { seeds: { tulip: 3 }, heart: 4 } },
  firefly: { say: '它们想看萤火虫……玻璃罐能当灯，夏天的草帽、贝壳也行。', season: 'summer', items: ['glassjar', 'strawhat'], title: '想在萤火夜看萤火虫', need: '一盏萤火虫灯，或者一样夏天的东西（草帽、贝壳……）', who: 'cat', reward: { item: { glassjar: 1 }, heart: 4 } },
  snowlamp: { say: '它们想办雪灯节！先等它们堆两个雪人，我们再放点冬天的东西。', season: 'winter', items: ['mittens', 'beanie'], title: '想办一场雪灯节', need: '堆起 2 个雪人，再放一样冬天的东西（手套、毛线帽……）', who: 'bear', reward: { heart: 6, seeds: { bluebell: 3 } } },
  lamp: { say: '晚上路太黑了，猫咪们想要一盏灯。我家的玻璃罐行不行？', items: ['glassjar'], title: '晚上想要一盏灯', need: '一个玻璃罐，或者会发光的东西', who: 'cat', reward: { item: { matchbox: 1, thimble: 1 }, heart: 3 } },
  bath: { say: '鸭子们想泡热水澡！茶杯或者水壶，放在溪边试试？', items: ['teacup', 'kettle'], title: '想泡个热水澡', need: '一个茶杯或水壶，放在溪边', who: 'duck', reward: { item: { kettle: 1 }, heart: 4 } },
  combo: { say: '它们想看大好人变戏法——我们把两样东西挨着放，看看会变出什么！', items: ['teapot', 'yarn'], title: '想看大好人变个戏法', need: '把两样东西放在一起（比如茶壶和毛线球）', who: 'cat', reward: { item: { oldbook: 1 }, heart: 3 } },
};
export const WISH_ORDER = ['bakery', 'flowers', 'play', 'bridge', 'home', 'combo', 'lamp', 'bath', 'harvest', 'kite', 'firefly', 'snowlamp'];
export const inSeason = (k, season) => !ITEMS[k].season || ITEMS[k].season === season;
// 放进雨后的水洼：变成小池塘 / 澡堂 / 小船 / 码头（每件旧物按形状有不同的水洼用法）
const BATHY = new Set(['teapot', 'teacup', 'kettle', 'hotbottle', 'shell', 'honeyjar', 'flowerpot', 'thimble']);
const BOATY = new Set(['boot', 'rubberduck', 'cookietin', 'fishtin', 'toycar', 'strawhat', 'pumpkin', 'matchbox', 'beanie', 'umbrella', 'eggshell', 'toaster', 'mittens']);
const DOCKY = new Set(['pencil', 'oldbook', 'popsicle', 'rake', 'spool', 'button', 'kite', 'trowel', 'chestnut']);
export function puddleUses(k) {
  const n = ITEMS[k] ? ITEMS[k].name : '旧物'; const out = [{ u: 'fac', fac: 'pond', name: `${n}小池塘` }];
  if (BATHY.has(k)) out.push({ u: 'shop', shop: 'bath', name: `${n}水洼澡堂` });
  if (BOATY.has(k)) out.push({ u: 'fac', fac: 'boat', name: `${n}小船` });
  if (DOCKY.has(k)) out.push({ u: 'fac', fac: 'dock', name: `${n}小码头` });
  return out;
}

// ---------------------------------------------------------------- 摆放检查（放置模式实时显示绿 / 红；模拟落地时再查一次）
// 溪流把世界分成两边：小镇在 (0,0) 那一边；没有桥时对岸不能放
const S0 = STREAM;
export function streamSide(x, z) { // 找最近线段，用叉积判断在哪一侧
  let bi = 0, bd = 1e9; for (let i = 0; i < S0.length - 1; i++) { const a = S0[i], b = S0[i + 1]; const d = segDist(x, z, a[0], a[1], b[0], b[1]); if (d < bd) { bd = d; bi = i; } }
  const a = S0[bi], b = S0[bi + 1]; return Math.sign((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) || 1;
}
export const TOWN_SIDE = streamSide(0, 0);
export const TOWN_R = WORLD_R + 4;  // 小镇范围；再往外是花园外圈的草坪（也能放，只是要拖好一阵子）
export const PLACE_R = EDGE_R + 12; // 花园草坪的外沿（再往外是远处的大树、巨型雏菊和白栅栏）
// st: { lots:[lot], nodes:[[x,z,k]], edges:[[a,b,d]], bridges:n, flowers:[[x,z]], puddles:[[x,z,r,id]], snowmen? }
// cand: { item, rot } —— 放旧物时传上，按这件东西所有可能样子的真实占地（js/shared/footprint.js）检查；不传就当成半径 r 的小圆（花、水洼、雪人）
function groundCheck(x, z, st, kind) { // 不看占地的基本条件：太远、水里、对岸没桥、祭坛广场
  const R0 = Math.hypot(x, z);
  if (R0 > PLACE_R) return { ok: false, why: '再往外就出了花园草坪啦' };
  const sd = streamDist(x, z);
  if (sd < 3.3) return { ok: false, why: '这里是水里' };
  if (streamSide(x, z) !== TOWN_SIDE && !(st.bridges > 0)) return { ok: false, why: '在小溪对岸，还没有桥过不去' };
  if (R0 < PLAZA_R + (kind === 'flower' ? 0.5 : 1)) return { ok: false, why: '这里是祭坛广场' };
  return null;
}
// ---------------------------------------------------------------- 金圈（组合惊喜）
// 手里拿着的旧物能和地上哪件“还在等大家商量”的旧物拼在一起：那件旁边有一个金圈（圆心 + 半径 + 朝向）。
// 金圈画在哪、绿红判定、Worker 落地时拼不拼，全部只用这一个函数；放进金圈（手里旧物的中心落在圈内）就会对齐到圈心落下并立刻拼起来。
export const goldTarget = (l) => !!(l && l.stage === 'landed' && !l.carry && !l.up && !l.upTo && l.item && ITEMS[l.item] && !l.pond);
export function goldRings(item, r, st) {
  if (!ITEMS[item]) return [];
  const cache = st.gold || (st.gold = new Map()); const key = item + '|' + r; if (cache.has(key)) return cache.get(key);
  const out = []; const kind = renderKindOf(item); const ctx = st.fit || (st.fit = prepFit(st));
  for (const T of st.lots || []) {
    if (!goldTarget(T)) continue; const c = comboOf(item, T.item); if (!c) continue;
    const G = footOf(T); const ign = new Set([T.id]); const a0 = Math.atan2(-T.z, -T.x); let ring = null; // 从朝着广场的那一侧开始找，左右交替
    for (let d = 1.5; d <= G.R + r + COMBO_GAP && !ring; d += 0.5) for (let k = 0; k < 16 && !ring; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 8; const x = T.x + Math.cos(a) * d, z = T.z + Math.sin(a) * d;
      if (groundCheck(x, z, st, 'item') || st.puddles && st.puddles.some(p => Math.hypot(x - p[0], z - p[1]) < p[2] + r)) continue;
      for (const rot of [T.rot || 0, (T.rot || 0) + Math.PI / 2, (T.rot || 0) - Math.PI / 2, (T.rot || 0) + Math.PI]) {
        const F = footOf({ id: -1, kind, item, x, z, rot, r, stage: 'landed', done: false }); const gap = bodyGap(F, G);
        if (gap < 0.3 || gap > COMBO_GAP) continue;
        if (!fitCheck(F, ctx, { ignore: ign, water: 2.4, plaza: 0.6, rsc: 0.6, road: 0.3 }).ok) continue;
        ring = { id: T.id, combo: c.id, x, z, rot, r: Math.max(1.4, Math.min(2.2, r * 0.7)), tx: T.x, tz: T.z, tr: G.R }; break;
      }
    }
    if (ring) out.push(ring);
  }
  cache.set(key, out); return out;
}
export function goldAt(item, r, st, x, z) { return goldRings(item, r, st).find(g => Math.hypot(x - g.x, z - g.z) <= g.r) || null; }
export function placeCheck(x, z, r, st, kind = 'item', cand = null) {
  const gold = cand && cand.item ? goldAt(cand.item, r, st, x, z) : null;
  if (gold) return { ok: true, why: '放进金圈会有惊喜', gold };
  const sd = streamDist(x, z);
  const g0 = groundCheck(x, z, st, kind); if (g0) return g0;
  if (kind === 'flower') for (const f of st.flowers || []) if (Math.hypot(x - f[0], z - f[1]) < 0.9) return { ok: false, why: '这里已经种了花' };
  const pd = (st.puddles || []).find(p => Math.hypot(x - p[0], z - p[1]) < p[2] + 0.3);
  if (pd && kind === 'flower') return { ok: false, why: '这里是一汪水洼' };
  const ctx = st.fit || (st.fit = prepFit(st)); // 同一份 st 反复检查时只算一次已有东西的占地
  const F = cand && cand.item && ITEMS[cand.item] ? footOf({ id: -1, kind: renderKindOf(cand.item), item: cand.item, x, z, rot: cand.rot || 0, r, stage: 'landed', done: false, pond: pd ? Math.max(pd[2], r + 0.6) : 0 }) : circleFoot(x, z, r, kind === 'flower' ? 0.05 : 0.3);
  const fc = fitCheck(F, ctx, kind === 'flower' ? { flower: true } : { water: 2.4, plaza: 0.6, rsc: 0.6, road: 0.3 });
  if (!fc.ok) return fc;
  if (pd) return { ok: true, why: '放进水洼里，也许会变成小池塘、小船或码头', puddle: pd[3] };
  if (Math.hypot(x, z) > TOWN_R) return { ok: true, why: '有点远，它们要拖好一阵子', far: true };
  return { ok: true, why: sd < 9 ? '溪边，可能会有水边的用法' : '可以放在这里' };
}

// ---------------------------------------------------------------- 挪一挪 / 搬家：已经放下的东西换个地方（主线程绿红 + Worker 落地用同一个判定）
// l：struct 或模拟里的 lot（带 use/fac/shop/combo/done/stage 等，占地按它现在的样子算）；node：它门口小径接的路点（自己的小径不算挡路）
export function movable(l) {
  if (!l || l.stage === 'far') return { ok: false, why: '还在远方草坪上' };
  if (l.use === 'bridge') return { ok: false, why: '桥架在小溪上，挪不动' };
  if (l.up || l.upTo) return { ok: false, why: '大家要把它拆开翻新别的房子' };
  if (l.stage === 'haul') return { ok: false, why: '大家正拖着它上路呢' };
  if (l.carry) return { ok: false, why: '有小家伙正抱着它躲雨' };
  if (l.moving) return { ok: false, why: '正在搬家' };
  return { ok: true };
}
export function moveCheck(l, x, z, rot, st) {
  const m = movable(l); if (!m.ok) return m;
  const g0 = groundCheck(x, z, st, 'item'); if (g0) return g0;
  if (l.done && Math.hypot(x, z) > TOWN_R) return { ok: false, why: '搬出小镇太远了，离开小路大家没法串门' };
  if (!l.pond && (st.puddles || []).some(p => Math.hypot(x - p[0], z - p[1]) < p[2] + 0.3)) return { ok: false, why: '这里是一汪水洼' };
  const ctx = st.fit || (st.fit = prepFit(st));
  const fc = fitCheck(footOf({ ...l, x, z, rot }), ctx, { ignore: new Set([l.id]), skipNode: l.node >= 0 ? l.node : null, water: 2.4, plaza: 0.6, rsc: 0.6, road: 0.3 });
  if (!fc.ok) return fc;
  return { ok: true, why: l.done ? '搬到这里吧' : Math.hypot(x, z) > TOWN_R ? '有点远，它们要拖好一阵子' : '挪到这里吧' };
}
