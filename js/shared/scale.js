// 统一度量衡：比例尺 1 世界单位 = 2.2 厘米（小动物约 3.5～4 厘米 = 1.6～2.1 单位；花盆、浇水壶早就是按这把尺子做的）。
// 每件旧物 / 组合 / 房子 / 环境物登记它的真实尺寸（厘米），占地半径 r、房子缩放、高度都从这里推出，不再手写大 / 中 / 小三档。
// 新增旧物时：在 PROP_CM 里写 [最长边, 高]（厘米）、在 PROP_NAT 里写模型在 r=1 时的 [最长边, 高]（node tools/scalecheck.mjs --dump 量），其余自动算出。
// tools/scalecheck.mjs 会实测每个模型的包围盒和这里的登记值对比，偏离超过 25% 报错。纯数学，主线程与 Worker 共用。
export const CM_PER_U = 2.2;
export const cm2u = (cm) => cm / CM_PER_U;
export const u2cm = (u) => u * CM_PER_U;
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------- 小动物（尺子的基准，不改；站高含头顶 / 耳朵，厘米）
export const ANIMAL_CM = { chick: 3.0, rabbit: 4.4, cat: 4.0, dog: 4.2, duck: 3.8, bear: 4.7 };

// ---------------------------------------------------------------- 旧物（没有房子模板的）：[最长边, 高]，厘米
export const PROP_CM = {
  cookietin: [17,8.4], yarn: [8.1,6], button: [5,0.8], toycar: [11,6.5], spool: [5.9,3.8], pencil: [18,4.1], rubberduck: [9,7.6], matchbox: [5.9,1.7],
  thimble: [3.5,2.9], glassjar: [8.8,9.3], oldbook: [18,3.8], kettle: [19.8,13.7], flowerpot: [11,6.1], toaster: [26.4,17.4], umbrella: [13.2,11.3],
  kite: [17.6,7.2], trowel: [22,27.4], strawhat: [40,15.4], popsicle: [11.4,1.1], shell: [8.2,0.9], rake: [17.6,3.8], pumpkin: [23.1,18.9],
  chestnut: [4.4,2.8], mittens: [22,3.6], beanie: [22,18.5], hotbottle: [26.4,5.8], jinglebell: [3.7,4.4],
};
// 组合惊喜（有自己造型的）：[最长边, 高]，厘米。拼在房子模板上的（毛线茶壶暖房、纽扣靴子邮局、茶杯温泉、蜂蜜茶摊、毛线蛋壳摇篮）的尺寸跟着底座房子走，这里登记的是单独的预览造型
export const COMBO_CM = {
  cozytea: [23.1,15.1], bootpost: [34.1,34.1], musicbox: [18.8,19.6], teabath: [27.2,21.1], firefly: [10,16], train: [15.4,6.1],
  thimblegarden: [13.2,8.1], library: [22,21.6], duckboat: [39.6,20.4], toastbake: [27.5,30.6], honeytea: [19.8,12], yarncradle: [17.6,13.1],
  tinwell: [14.3,11.6], glasshouse: [13.2,10.4], umbrellatea: [17.6,16.7], kiteflag: [14.6,22], strawhome: [39.6,26.4], popseesaw: [13.2,8.8],
  pumpkinstore: [26.4,12.8], bellboot: [19.4,37.4], mittenhome: [26.4,18.3],
};
// 房子模板（含店铺版，同尺寸）：[最长边, 高]，厘米。雨靴屋、旧靴子屋放大了（真实的成人雨靴 35 厘米、皮靴 28 厘米），门不跟着放大，保持小动物能进的尺寸
export const HOUSE_CM = {
  egg: [16.8,13.9], tea: [18.8,10.3], fish: [15,10.7], boot: [28.7,30], rboot: [33,33.3], cup: [15.1,8.7], honey: [15.5,15], leaf: [11.7,8.2],
  mush: [13.9,10.9], pine: [10.2,10],
};

// ---------------------------------------------------------------- 模型在“单位尺寸”下的实测大小（旧物 / 组合：r=1；房子：缩放 1）：[最长边, 高]，单位。造型改了就重量（--dump）
export const PROP_NAT = {
  cookietin: [2.15,1.066], yarn: [2.449,1.82], button: [2,0.313], toycar: [2.09,1.234], spool: [2.345,1.5], pencil: [2.399,0.543],
  rubberduck: [2.346,1.982], matchbox: [2.16,0.62], thimble: [1.69,1.4], glassjar: [1.66,1.76], oldbook: [2.23,0.466], kettle: [2.505,1.725],
  flowerpot: [2,1.1], toaster: [2.004,1.32], umbrella: [2.252,1.925], kite: [2.535,1.03], trowel: [1.284,1.598], strawhat: [2.06,0.79],
  popsicle: [2.234,0.22], shell: [2.479,0.26], rake: [2.955,0.635], pumpkin: [2,1.64], chestnut: [1.5,0.96], mittens: [1.875,0.303],
  beanie: [1.85,1.558], hotbottle: [1.905,0.42], jinglebell: [1.116,1.34],
};
export const COMBO_NAT = {
  cozytea: [3.128,2.05], bootpost: [1.99,1.99], musicbox: [2.245,2.35], teabath: [2.814,2.18], firefly: [1.627,2.602], train: [2.193,0.864],
  thimblegarden: [2.07,1.268], library: [1.919,1.884], duckboat: [2.311,1.189], toastbake: [2.15,2.394], honeytea: [3.421,2.081],
  yarncradle: [3.468,2.58], tinwell: [3.07,2.498], glasshouse: [2.575,2.026], umbrellatea: [3.311,3.141], kiteflag: [2.415,3.638],
  strawhome: [2.472,1.648], popseesaw: [2.978,1.992], pumpkinstore: [3.434,1.64], bellboot: [1.819,3.511], mittenhome: [2.573,1.78],
};
export const HOUSE_NAT = {
  egg: [10.608,8.756], tea: [13.36,7.29], fish: [10.301,7.4], boot: [11.64,12.175], rboot: [12.08,12.175], cup: [11.45,6.61], honey: [9.497,9.195],
  leaf: [5.3,3.742], mush: [6.3,4.97], pine: [5.167,5.061],
};
// 门窗 / 招牌等附件按“高度参考 h”摆放，h = r × 这里的系数（沿用原来大 / 中 / 小三档的摆放比例，造型的相对位置不变）
export const H_PER_R = {
  cookietin: 1.667, yarn: 1.333, button: 1.333, toycar: 1.25, spool: 1.333, pencil: 1.25, rubberduck: 1.25, matchbox: 1.333, thimble: 1.333,
  glassjar: 1.25, oldbook: 1.25, kettle: 1.667, flowerpot: 1.333, toaster: 1.667, umbrella: 1.25, kite: 1.25, trowel: 1.333, strawhat: 1.25,
  popsicle: 1.333, shell: 1.333, rake: 1.25, pumpkin: 1.667, chestnut: 1.333, mittens: 1.25, beanie: 1.25, hotbottle: 1.25, jinglebell: 1.333,
  combo_cozytea: 1.196, combo_bootpost: 1.5, combo_musicbox: 1.316, combo_teabath: 1.136, combo_firefly: 1.786, combo_train: 0.938,
  combo_thimblegarden: 0.962, combo_library: 1.25, combo_duckboat: 1.111, combo_toastbake: 1.684, combo_honeytea: 1.136, combo_yarncradle: 1.19,
  combo_tinwell: 1.923, combo_glasshouse: 1.286, combo_umbrellatea: 1.875, combo_kiteflag: 2.038, combo_strawhome: 1.769, combo_popseesaw: 1.333,
  combo_pumpkinstore: 1.563, combo_bellboot: 3.333, combo_mittenhome: 1.733,
};

// 占地半径（模型缩放）：让模型最长边正好等于登记的厘米数
export const propR = (k) => r2(cm2u(PROP_CM[k][0]) / PROP_NAT[k][0]);
export const comboR = (id) => r2(cm2u(COMBO_CM[id][0]) / COMBO_NAT[id][0]);
export const propH = (k) => r2(propR(k) * H_PER_R[k]);
export const comboH = (id) => r2(comboR(id) * H_PER_R['combo_' + id]);
// 房子模板缩放：houses.js 的 KIND_SCALE
export const houseK = (k) => r3(cm2u(HOUSE_CM[k][0]) / HOUSE_NAT[k][0]);

// ---------------------------------------------------------------- 环境植物（小人世界的“树”）：[最长边, 高]，厘米；量的是 plants.js 里单株的样本（envProbe）
// 蒲公英 25～30 厘米、三叶草 10 厘米、狗尾草 30～40 厘米；远景的人类世界巨物（白篱笆、花盆、浇水壶、巨型雏菊）故意比小动物大几十倍，不在这里登记
export const ENV_CM = { dandelion: [20, 28], clover: [14, 11], foxtail: [14, 33] };
