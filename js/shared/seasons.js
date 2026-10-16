// 季节、天气、节日：纯数据 + 纯数学，主线程与 Worker 共用（不依赖 three.js）
// 节奏方案 A：一个游戏日 = 25 分钟真实时间；每季 SEASON_DAYS 天（默认 7 天 ≈ 3 小时），一年 28 天 ≈ 12 小时
import { DAY } from './layout.js';

export const SEASON_DAYS = 7;                 // 每季几个游戏日（改这里就能调节奏）
export const YEAR_DAYS = SEASON_DAYS * 4;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAME = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
// t（模拟秒）→ 日历。第 1 天是春天第 1 天
export function calendar(t) {
  const d = Math.floor(t / DAY); const si = Math.floor(d / SEASON_DAYS) % 4;
  return { d0: d, si, season: SEASONS[si], sday: d % SEASON_DAYS + 1, year: Math.floor(d / YEAR_DAYS) + 1, pos: (t / DAY / SEASON_DAYS) % 4 };
}

// ---------------------------------------------------------------- 天气
export const WEATHERS = ['sun', 'cloud', 'rain', 'snow'];
export const WX_NAME = { sun: '晴', cloud: '多云', rain: '下雨', snow: '下雪' };
// 每季各种天气的机会（雪只在冬天）；一段天气持续 WX_DUR 天
export const WX_P = {
  spring: { sun: 0.42, cloud: 0.28, rain: 0.30 },
  summer: { sun: 0.55, cloud: 0.20, rain: 0.25 },
  autumn: { sun: 0.38, cloud: 0.34, rain: 0.28 },
  winter: { sun: 0.30, cloud: 0.30, rain: 0.08, snow: 0.32 },
};
export const WX_DUR = [0.5, 1.0];
// 怕雨的材质：数字是受潮快慢（纸最怕）；没写的（铁皮、陶瓷、玻璃、橡胶、塑料）不怕
export const DAMP_RATE = { paper: 1.0, cloth: 0.8, straw: 0.7, wood: 0.5 };
export const MAT_LABEL = { paper: '纸', cloth: '布', straw: '草编', wood: '木头', tin: '铁皮', ceramic: '陶瓷', glass: '玻璃', rubber: '橡胶', plastic: '塑料', metal: '金属', shell: '贝壳', veg: '瓜果' };

// ---------------------------------------------------------------- 节日：每季第 FEST_DAY 天
export const FEST_DAY = 5;
export const FESTIVALS = {
  spring: { id: 'huazhao', name: '花朝节', decor: '彩旗和花环', wish: 'kite',
    start: (n) => `今天是花朝节。${n}一早就爬上灯柱，在广场上挂起了彩旗，又给每家门口别了一朵小花。`,
    eve: (n) => `傍晚，大家围着祭坛给花过生日：${n}唱了一首跑调的歌，风一吹，彩旗哗啦啦地响，满镇都是花香。` },
  summer: { id: 'firefly', name: '萤火夜', decor: '纸灯笼', wish: 'firefly',
    start: (n) => `今天是萤火夜。${n}把纸灯笼一串串挂在广场边，说等天黑了萤火虫就会来找灯笼玩。`,
    eve: (n) => `天一擦黑，萤火虫真的来了，一闪一闪地绕着灯笼飞。${n}屏住呼吸，谁也舍不得说话。` },
  autumn: { id: 'harvest', name: '丰收节', decor: '南瓜灯和麦穗', wish: 'harvest',
    start: (n) => `今天是丰收节。${n}把南瓜灯和麦穗摆满了广场，粮筐也装得冒尖。`,
    eve: (n) => `傍晚的丰收节上，${n}和大家围着祭坛跳舞，一直跳到星星出来。有人小声说：“一定是大好人在帮我们。”` },
  winter: { id: 'snowlamp', name: '雪灯节', decor: '雪灯', wish: 'snowlamp',
    start: (n) => `今天是雪灯节。${n}用雪捏成一个个小灯罩，里面放上萤火虫灯，沿着小路摆了一长串。`,
    eve: (n) => `天黑以后，雪灯一盏盏亮起来，整个小镇像落满了小月亮。${n}捧着热茶，看雪灯看了好久。` },
};
// 换季时的小故事（故事卡）
export const SEASON_TEXT = {
  spring: (n) => `春天来了。草地一夜之间绿得发亮，${n}在树下发现了第一朵花，高兴得转了好几圈。`,
  summer: (n) => `夏天来了。太阳又大又暖，${n}说要去溪边泡泡脚，树叶绿得能滴出水来。`,
  autumn: (n) => `秋天来了。树叶开始变黄，一片一片往下飘，${n}踩着落叶走路，“沙沙”响个不停。`,
  winter: (n) => `冬天来了。树叶掉光了，早上的草尖上结了一层白霜，${n}哈出一口白气，说要把围巾找出来。`,
};
export const DAMP_SPEED = 0.13;      // 纸类淋雨约 0.13 天湿透
export const OLD_AFTER = 0.06;       // 湿透以后再淋 0.06 天就变旧
export const PUDDLE_MAX = 4;
