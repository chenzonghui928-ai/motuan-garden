// 食物：粮筐里按品种分开存，每种吃下去的效果不一样，每个物种有自己最爱吃的一种。
// 模拟（sim-core）、界面（ui）、渲染（environment、foodfx）、文案（text）共用这一份。
import { SP_NAME } from './layout.js';

export const FOOD_IDS = ['berry', 'veg', 'fish', 'bread'];
// full：饱腹加多少；mood：心情加多少；energy：精力加多少；eat：吃一份大概坐多久（模拟秒，只影响“快不快”）
export const FOODS = {
  berry: { name: '莓果', unit: '颗', full: 26, mood: 3, energy: 0, eat: 4, color: '#d9343a', note: '吃着快、甜甜的，可是不太顶饱' },
  veg: { name: '菜', unit: '棵', full: 46, mood: 2, energy: 3, eat: 7, color: '#6fae3f', note: '脆脆的，吃下去很稳，饱得扎实' },
  fish: { name: '鱼', unit: '条', full: 50, mood: 3, energy: 12, eat: 8, color: '#8fb4d0', note: '鲜鱼最顶饱，吃完精神也足' },
  bread: { name: '面包', unit: '块', full: 52, mood: 9, energy: 3, eat: 7, color: '#d9a04a', note: '暖烘烘的，吃了心情最好' },
};
// 口味：每个物种最爱的一种（吃到最爱的，心情再多加、饱腹也多一点）
export const FAV_FOOD = { chick: 'veg', rabbit: 'veg', cat: 'fish', dog: 'berry', duck: 'fish', bear: 'berry' };
// 卡片上多摆两格：蜂蜜、花草茶。现在还没有真实的采蜜和茶馆产出，所以只显示“暂无”，不凭空生成库存
export const FOOD_SHOW = [...FOOD_IDS, 'honey', 'tea'];
export const FOODS_NA = { honey: { name: '蜂蜜', note: '还没有人采蜜' }, tea: { name: '花草茶', note: '还没有茶馆做茶' } };
// 个别居民把面包当最爱（物种只是初始倾向）：出生时按 30% 的机会
export const BREAD_FAN = 0.3;
export const FOOD_PIC = { berry: 'berries', veg: 'vegetables', fish: 'fish', bread: 'bread', honey: 'honey', tea: 'tea' }; // assets/food/ 里的图标文件名
export const FAV_BONUS = { mood: 6, full: 4 };
export const RSC_FOOD = { berry: 'berry', veg: 'veg', fish: 'fish' };   // 野外资源点的类型 → 采到的食物
export const emptyStore = () => ({ berry: 0, veg: 0, fish: 0, bread: 0 });
export const storeSum = (s) => FOOD_IDS.reduce((a, k) => a + (s[k] || 0), 0);
// 旧档：只有一个总数。按“莓果 3、菜 4、鱼 3”拆开，面包从零开始（不补发）
export function splitOldStore(n) { n = Math.max(0, +n || 0); return { berry: n * 0.3, veg: n * 0.4, fish: n * 0.3, bread: 0 }; }
// 吃一份这种食物，这只小动物得到什么
export function eatEffect(favFood, food, portion = 1) { // favFood：这只小动物最爱吃的那一种
  const F = FOODS[food]; if (!F) return { full: 0, mood: 0, energy: 0, fav: false };
  const fav = favFood === food;
  return { full: (F.full + (fav ? FAV_BONUS.full : 0)) * portion, mood: (F.mood + (fav ? FAV_BONUS.mood : 0)) * portion, energy: F.energy * portion, fav };
}
export const favName = (fav) => FOODS[fav].name;
export const foodLine = (sp, fav) => `${SP_NAME[sp]}最爱吃${favName(fav || FAV_FOOD[sp])}`;
// 从粮筐里挑这一餐吃什么：最爱的有就吃最爱的；没有就拿库存最多的（顺便偏向效果更好的），都没有返回 null
export function chooseFood(f, store, need = 1) { // f：最爱吃的那一种
  if ((store[f] || 0) >= need) return f;
  let best = null, bs = -1;
  for (const k of FOOD_IDS) { const n = store[k] || 0; if (n < need) continue; const s = n + FOODS[k].full * 0.05; if (s > bs) { bs = s; best = k; } }
  return best;
}
