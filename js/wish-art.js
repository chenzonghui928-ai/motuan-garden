// 小镇愿望纸签上的小插画：手绘感 SVG（深棕描边、圆头线、纸色底、淡彩），和花园工具房的界面同一套颜色
// wishArt(key) → '<svg …>'；没有专门插画的愿望用一张小花园
const OL = 'stroke="#5a3a1e" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';
const OLt = 'stroke="#5a3a1e" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
let N = 0; // 同一页里有好几张插画，渐变的 id 不能重名
const sky = (top = '#d7ecf2', bot = '#f4ead2') => { const id = 'wsk' + (++N); return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs><rect width="160" height="100" fill="url(#${id})"/>`; };
const hill = (c = '#b9d88c', c2 = '#9cc570') => `<path d="M0 78 Q40 66 80 74 T160 70 V100 H0Z" fill="${c}"/><path d="M0 86 Q50 78 100 86 T160 84 V100 H0Z" fill="${c2}"/>`;
const grass = (xs) => xs.map(x => `<path d="M${x} 92 q-2 -6 -5 -8 M${x} 92 q0 -7 1 -10 M${x} 92 q3 -5 6 -7" fill="none" stroke="#5f9a4c" stroke-width="1.6" stroke-linecap="round"/>`).join('');
const cloud = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 8 q0 -7 8 -7 q3 -6 11 -3 q8 -2 9 6 q6 1 5 6 H2 q-4 0 -2 -2z" fill="#fffaf0" ${OLt} stroke-opacity=".45"/></g>`;
const daisy = (x, y, r = 4, c = '#fffaf0', m = '#f2c23a') => `<g transform="translate(${x} ${y})">${[0, 1, 2, 3, 4, 5].map(k => `<ellipse cx="${(Math.cos(k * 1.047) * r * 0.75).toFixed(1)}" cy="${(Math.sin(k * 1.047) * r * 0.75).toFixed(1)}" rx="${(r * 0.5).toFixed(1)}" ry="${(r * 0.32).toFixed(1)}" transform="rotate(${k * 60} ${(Math.cos(k * 1.047) * r * 0.75).toFixed(1)} ${(Math.sin(k * 1.047) * r * 0.75).toFixed(1)})" fill="${c}" stroke="#5a3a1e" stroke-width=".8"/>`).join('')}<circle r="${(r * 0.36).toFixed(1)}" fill="${m}" stroke="#5a3a1e" stroke-width=".8"/></g>`;
const flag = (x, y, c) => `<path d="M${x} ${y} l7 0 l-3.5 9z" fill="${c}" ${OLt}/>`;
const S = (body) => `<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${body}</svg>`;
const ART = {
  // 面包窑：砖砌圆顶、拱口里火光、烟囱冒烟、木铲上一条面包
  bakery: () => S(`${sky('#f6e2bf', '#f4ead2')}${cloud(18, 14, 0.9)}${hill('#d9c08a', '#c9a96a')}
    <path d="M44 84 Q44 38 80 36 Q116 38 116 84Z" fill="#d9774c" ${OL}/>
    ${[[52, 74], [66, 74], [94, 74], [108, 74], [58, 64], [100, 64], [64, 54], [96, 54], [74, 46], [86, 46]].map(([x, y]) => `<path d="M${x - 5} ${y} h10" stroke="#a8502e" stroke-width="1.6" stroke-linecap="round"/>`).join('')}
    <path d="M66 84 Q66 60 80 59 Q94 60 94 84Z" fill="#4a2a18" ${OL}/><path d="M71 84 Q72 70 80 68 Q88 70 89 84Z" fill="#ffb347"/><path d="M75 84 Q77 74 80 72 Q83 74 85 84Z" fill="#ffe28a"/>
    <rect x="98" y="26" width="9" height="16" rx="1.5" fill="#b85e3a" ${OL}/><path d="M102 22 q-6 -6 0 -10 q6 -4 0 -10" fill="none" stroke="#fffaf0" stroke-width="3" stroke-linecap="round" opacity=".9"/>
    <path d="M118 88 L146 70" stroke="#8a5530" stroke-width="3" stroke-linecap="round"/><ellipse cx="134" cy="76" rx="12" ry="6" transform="rotate(-32 134 76)" fill="#e0a55a" ${OL}/><path d="M128 76 l3 -4 M133 74 l3 -4 M138 71 l3 -4" stroke="#a8622a" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M24 90 q2 -16 4 -24 M24 78 l-5 -4 M25 72 l-5 -4 M25 78 l5 -4 M26 72 l5 -4" fill="none" stroke="#c99a3e" stroke-width="1.8" stroke-linecap="round"/>`),
  // 花丛：雏菊、郁金香、向日葵、一只小蝴蝶
  flowers: () => S(`${sky()}${cloud(110, 12)}${hill()}
    <path d="M30 88 Q30 64 52 62 Q64 50 80 58 Q98 50 108 62 Q130 64 130 88Z" fill="#6fae52" ${OL}/>
    ${[[44, 66, 7], [62, 60, 6], [98, 60, 6], [116, 68, 7], [76, 70, 5]].map(([x, y, r]) => daisy(x, y, r)).join('')}
    ${[[54, 74, '#ff6f61'], [90, 72, '#ff8fb1'], [106, 78, '#c77dff']].map(([x, y, c]) => `<path d="M${x} ${y + 12} V${y + 2}" stroke="#4f8a3c" stroke-width="2"/><path d="M${x - 5} ${y + 2} q0 -9 5 -10 q5 1 5 10 q-5 3 -10 0z" fill="${c}" ${OLt}/>`).join('')}
    <path d="M80 60 V30" stroke="#4f8a3c" stroke-width="2.4"/><path d="M80 44 q8 -4 10 2 q-6 4 -10 -2z" fill="#6fae52" ${OLt}/>${[...Array(10)].map((_, k) => { const a = k * 0.628; return `<ellipse cx="${(80 + Math.cos(a) * 8).toFixed(1)}" cy="${(26 + Math.sin(a) * 8).toFixed(1)}" rx="4.5" ry="2.4" transform="rotate(${(a * 57.3).toFixed(0)} ${(80 + Math.cos(a) * 8).toFixed(1)} ${(26 + Math.sin(a) * 8).toFixed(1)})" fill="#ffc928" stroke="#5a3a1e" stroke-width=".8"/>`; }).join('')}<circle cx="80" cy="26" r="5.5" fill="#7a4a1e" ${OLt}/>
    <g transform="translate(130 34)"><path d="M0 0 q-8 -9 -11 -1 q2 6 11 1z M0 0 q8 -9 11 -1 q-2 6 -11 1z" fill="#ffd23f" ${OLt}/><path d="M0 -4 v7" stroke="#5a3a1e" stroke-width="1.6"/></g>
    ${grass([18, 142, 150])}`),
  // 树枝上的秋千（毛线绳）、地上一个毛线球
  play: () => S(`${sky()}${cloud(96, 10, 0.8)}${hill()}
    <path d="M0 18 Q40 10 92 16 Q120 18 160 12" fill="none" stroke="#8a5530" stroke-width="7" stroke-linecap="round"/><path d="M0 18 Q40 10 92 16 Q120 18 160 12" fill="none" stroke="#5a3a1e" stroke-width="1.4" stroke-dasharray="0" opacity=".6"/>
    ${[[18, 14], [34, 10], [118, 16], [140, 12], [150, 18]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="5" fill="#6fae52" ${OLt}/>`).join('')}
    <path d="M62 16 L58 66 M98 16 L102 66" stroke="#d9443a" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="52" y="64" width="56" height="8" rx="3" fill="#c99a5e" ${OL}/><path d="M58 68 h44" stroke="#a8783e" stroke-width="1.2"/>
    <circle cx="126" cy="84" r="9" fill="#d9443a" ${OL}/><path d="M119 80 q7 4 14 0 M118 86 q8 3 16 -1 M122 77 q-1 7 2 15" fill="none" stroke="#b8302a" stroke-width="1.4"/><path d="M134 88 q8 6 14 2" fill="none" stroke="#d9443a" stroke-width="1.8" stroke-linecap="round"/>
    ${grass([20, 40, 72, 100])}`),
  // 溪上的小木桥
  bridge: () => S(`${sky()}${cloud(20, 12, 0.9)}${cloud(118, 18, 0.7)}
    <path d="M0 62 Q40 56 80 60 T160 58 V100 H0Z" fill="#b9d88c"/>
    <path d="M0 76 Q40 70 80 76 T160 74 V92 Q120 88 80 92 T0 90Z" fill="#8fc6e8" ${OLt} stroke-opacity=".5"/>
    <path d="M14 82 q6 -2 12 0 M60 86 q6 -2 12 0 M108 80 q6 -2 12 0 M136 86 q5 -2 10 0" fill="none" stroke="#fffaf0" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M30 80 Q80 40 130 80" fill="none" stroke="#8a5530" stroke-width="9" stroke-linecap="round"/><path d="M30 80 Q80 40 130 80" fill="none" stroke="#c99a5e" stroke-width="5" stroke-linecap="round"/>
    ${[40, 52, 64, 80, 96, 108, 120].map(x => { const t = (x - 30) / 100; const y = 80 - 4 * 20 * t * (1 - t) * 2; return `<path d="M${x} ${(y - 2).toFixed(1)} v-14" stroke="#8a5530" stroke-width="2.4" stroke-linecap="round"/>`; }).join('')}
    <path d="M38 64 Q80 28 122 64" fill="none" stroke="#8a5530" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M10 70 v-14 M14 72 v-18 M150 70 v-16 M146 68 v-12" stroke="#5f9a4c" stroke-width="2" stroke-linecap="round"/><ellipse cx="14" cy="53" rx="2" ry="4" fill="#8a5a34"/><ellipse cx="150" cy="53" rx="2" ry="4" fill="#8a5a34"/>`),
  // 自己的家：圆门小屋、烟囱、门前小花
  home: () => S(`${sky()}${cloud(24, 12)}${hill()}
    <path d="M50 86 V52 L80 30 L110 52 V86Z" fill="#f4e6c4" ${OL}/><path d="M42 56 L80 26 L118 56" fill="none" stroke="#c8613a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M42 56 L80 26 L118 56" fill="none" ${OLt}/>
    <rect x="96" y="28" width="9" height="14" fill="#b85e3a" ${OLt}/><path d="M100 24 q-5 -5 0 -9 q5 -4 0 -9" fill="none" stroke="#fffaf0" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M70 86 V70 Q70 60 80 60 Q90 60 90 70 V86Z" fill="#b0703c" ${OL}/><circle cx="86" cy="74" r="1.6" fill="#e2bf62"/>
    <circle cx="62" cy="62" r="6" fill="#ffe39a" ${OLt}/><path d="M56 62 h12 M62 56 v12" stroke="#6b4426" stroke-width="1.4"/><circle cx="98" cy="62" r="6" fill="#ffe39a" ${OLt}/><path d="M92 62 h12 M98 56 v12" stroke="#6b4426" stroke-width="1.4"/>
    <path d="M80 50 q-4 -4 -6 -1 q-2 3 6 7 q8 -4 6 -7 q-2 -3 -6 1z" fill="#e0393a" ${OLt}/>
    ${daisy(40, 84, 4)}${daisy(122, 84, 4, '#ff8fb1')}${daisy(130, 88, 3)}${grass([20, 140])}`),
  // 变个戏法：茶壶和毛线球，周围冒小星星
  combo: () => S(`${sky('#e6dcf4', '#f4ead2')}${hill('#c9d89c', '#b4c880')}
    <path d="M44 80 Q36 54 62 50 Q88 46 92 66 Q96 82 70 86 Q50 88 44 80Z" fill="#5cc0b5" ${OL}/><path d="M60 50 q6 -8 14 -2" fill="#5cc0b5" ${OLt}/><circle cx="67" cy="45" r="3" fill="#e2bf62" ${OLt}/>
    <path d="M90 62 q12 -4 14 -14" fill="none" stroke="#5cc0b5" stroke-width="6" stroke-linecap="round"/><path d="M90 62 q12 -4 14 -14" fill="none" ${OLt}/><path d="M44 62 q-12 2 -8 14" fill="none" stroke="#5a3a1e" stroke-width="3" stroke-linecap="round"/>
    ${daisy(58, 66, 4)}${daisy(76, 72, 3.5)}
    <circle cx="118" cy="78" r="12" fill="#d9443a" ${OL}/><path d="M108 74 q10 5 20 0 M107 81 q11 4 22 -1 M113 68 q-2 10 3 21" fill="none" stroke="#b8302a" stroke-width="1.4"/><path d="M96 70 Q104 58 112 68" fill="none" stroke="#d9443a" stroke-width="2" stroke-dasharray="3 3"/>
    ${[[100, 30, 6], [124, 46, 4.5], [40, 34, 4], [138, 24, 3.5], [84, 22, 3]].map(([x, y, r]) => `<path d="M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3}Z" fill="#ffd23f" ${OLt}/>`).join('')}`),
  // 晚上的灯：夜空、月亮、挂着的玻璃罐萤火虫灯
  lamp: () => { const n = ++N; return S(`<defs><linearGradient id="wsn${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4f7a"/><stop offset="1" stop-color="#6b6f9a"/></linearGradient><radialGradient id="wgl${n}"><stop offset="0" stop-color="#fff3a0" stop-opacity=".9"/><stop offset="1" stop-color="#fff3a0" stop-opacity="0"/></radialGradient></defs><rect width="160" height="100" fill="url(#wsn${n})"/>
    ${[[20, 16], [44, 30], [130, 14], [146, 34], [104, 24], [70, 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#fffaf0"/>`).join('')}<path d="M138 20 a10 10 0 1 0 8 14 a8 8 0 1 1 -8 -14z" fill="#ffe08a"/>
    <path d="M0 84 Q40 76 80 82 T160 80 V100 H0Z" fill="#4f6a4a"/>
    <path d="M10 8 Q40 6 74 12" fill="none" stroke="#5a3a26" stroke-width="5" stroke-linecap="round"/><path d="M66 11 V30" stroke="#d9443a" stroke-width="1.8"/>
    <circle cx="66" cy="50" r="26" fill="url(#wgl${n})"/>
    <path d="M56 32 h20 v4 h-20z" fill="#c9c2b4" ${OLt}/><path d="M54 36 Q52 40 52 46 V62 Q52 68 58 68 H74 Q80 68 80 62 V46 Q80 40 78 36Z" fill="#dff4f0" fill-opacity=".55" ${OL}/>
    ${[[60, 46], [70, 52], [64, 58], [74, 44], [58, 60]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff48a"/><circle cx="${x}" cy="${y}" r="5" fill="#fff48a" opacity=".3"/>`).join('')}
    ${[[100, 60], [118, 70], [30, 64]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#fff48a"/><circle cx="${x}" cy="${y}" r="4.5" fill="#fff48a" opacity=".3"/>`).join('')}`); },
  // 热水澡：茶杯澡盆冒热气、泡泡、小黄鸭
  bath: () => S(`${sky('#d7ecf2', '#f4ead2')}${hill('#b9d88c', '#a6cc7a')}
    <path d="M34 54 H112 Q112 86 73 88 Q34 86 34 54Z" fill="#fbf8f1" ${OL}/><path d="M38 60 q35 8 70 0" fill="none" stroke="#f2a3b6" stroke-width="3"/>${[[50, 72], [72, 76], [94, 72]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#f2a3b6" stroke="#d8607e" stroke-width="1"/>`).join('')}
    <path d="M112 60 q16 0 14 12 q-2 10 -16 8" fill="none" stroke="#5a3a1e" stroke-width="5" stroke-linecap="round"/><path d="M112 60 q16 0 14 12 q-2 10 -16 8" fill="none" stroke="#fbf8f1" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse cx="73" cy="54" rx="39" ry="6" fill="#9fd8e6" ${OL}/>
    ${[[50, 50, 4], [58, 47, 3], [92, 49, 3.5], [100, 51, 2.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fffaf0" ${OLt} stroke-opacity=".5"/>`).join('')}
    <g transform="translate(76 46)"><ellipse cx="0" cy="2" rx="9" ry="5" fill="#ffd23f" ${OLt}/><circle cx="5" cy="-4" r="4.5" fill="#ffd23f" ${OLt}/><path d="M9 -4 l5 1 l-5 2z" fill="#f08a24" ${OLt}/><circle cx="6" cy="-5" r=".9" fill="#2a1a10"/></g>
    <path d="M52 40 q-5 -6 0 -12 q5 -6 0 -12 M74 36 q-5 -6 0 -12 q5 -6 0 -12 M96 40 q-5 -6 0 -12 q5 -6 0 -12" fill="none" stroke="#fffaf0" stroke-width="3" stroke-linecap="round" opacity=".95"/>`),
  // 丰收节：彩旗、南瓜、一篮菜、小舞台
  harvest: () => S(`${sky('#f6e2bf', '#f4ead2')}${hill('#d9c08a', '#c9a96a')}
    <path d="M0 10 Q80 34 160 10" fill="none" stroke="#8a6a4a" stroke-width="1.6"/>${[8, 22, 36, 50, 64, 78, 92, 106, 120, 134, 148].map((x, k) => { const t = x / 160; const y = 10 + 4 * 24 * t * (1 - t); return flag(x - 3.5, y.toFixed(1), ['#d9473b', '#ffd23f', '#5fa1d9', '#7cb85a', '#ff9aa8'][k % 5]); }).join('')}
    <rect x="52" y="58" width="56" height="10" rx="2" fill="#c99a5e" ${OL}/><path d="M56 68 v18 M104 68 v18" stroke="#8a5530" stroke-width="3"/>
    <ellipse cx="34" cy="80" rx="15" ry="11" fill="#f08a24" ${OL}/><path d="M26 72 q-2 8 0 16 M34 69 v22 M42 72 q2 8 0 16" fill="none" stroke="#c8611a" stroke-width="1.4"/><path d="M34 69 q0 -6 4 -8" fill="none" stroke="#4f8a3c" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M114 72 h34 l-4 16 h-26z" fill="#c98a4e" ${OL}/><path d="M118 72 q13 -14 26 0" fill="none" stroke="#8a5530" stroke-width="2.4"/><circle cx="124" cy="70" r="5" fill="#e0392f" ${OLt}/><circle cx="134" cy="68" r="5.5" fill="#ffc928" ${OLt}/><path d="M140 70 l6 -8 l2 9z" fill="#ff8a3d" ${OLt}/><path d="M144 62 l2 -4 M146 62 l4 -2" stroke="#4f8a3c" stroke-width="1.6"/>
    <g transform="translate(80 46)"><circle r="7" fill="#fffaf0" ${OLt}/><path d="M-2 -1 v4 M2 -1 v4" stroke="#5a3a1e" stroke-width="1.4"/><path d="M-3 5 q3 2 6 0" fill="none" stroke="#5a3a1e" stroke-width="1.2"/><path d="M-5 -6 l-3 -4 l5 2z M5 -6 l3 -4 l-5 2z" fill="#fffaf0" ${OLt}/></g>
    <path d="M68 52 l4 -6 M92 52 l-4 -6" stroke="#5a3a1e" stroke-width="1.4"/><path d="M64 44 q2 -4 6 -2 M96 44 q-2 -4 -6 -2" fill="none" stroke="#d9473b" stroke-width="1.4"/>`),
};
export function wishArt(k) { return (ART[k] || ART.flowers)(); }
export const WISH_ART_KEYS = Object.keys(ART);
