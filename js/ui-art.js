// 界面素材：assets/ui/ 里有就用（读 manifest.json），没有就用这里手绘的 SVG 和 CSS 近似。
// 图标统一写成 <span class="ic" data-ic="名字">，素材到了自动换成图片。
import { SP_NAME } from './shared/layout.js';

const S = (body, vb = '0 0 64 64') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const OL = 'stroke="#5a3a1e" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"';
export const ICON_SVG = {
  box: S(`<path d="M8 30h48v22a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="#c98a4e" ${OL}/><path d="M6 22h52v10H6z" fill="#b27242" ${OL}/><path d="M8 22l6-12h36l6 12" fill="#e0a564" ${OL}/><path d="M24 36c4 6 12 6 16 0" fill="none" stroke="#4f8f3e" stroke-width="4" stroke-linecap="round"/><path d="M30 40c-6-1-9 3-9 3s4 3 9-3zM34 40c6-1 9 3 9 3s-4 3-9-3z" fill="#5fa14c"/><rect x="18" y="14" width="10" height="9" rx="2" fill="#d47a4c" ${OL}/><rect x="34" y="12" width="12" height="11" rx="1.5" fill="#f4ead2" ${OL}/>`),
  'watering-can': S(`<path d="M14 26h28l-2 26H16z" fill="#d9473b" ${OL}/><path d="M42 32l14-10 3 3-15 15" fill="#d9473b" ${OL}/><path d="M56 20l5 5" stroke="#5a3a1e" stroke-width="4" stroke-linecap="round"/><path d="M18 26c0-10 20-10 20 0" fill="none" ${OL} stroke-width="4"/><path d="M8 34c-4 0-4 10 6 12" fill="none" ${OL} stroke-width="4"/><path d="M10 50c0 4 6 4 6 0 0-3-3-6-3-6s-3 3-3 6z" fill="#4f8ad0" ${OL} stroke-width="1.6"/><rect x="18" y="30" width="20" height="4" fill="#f4a08f"/>`),
  notes: S(`<rect x="12" y="10" width="34" height="42" rx="2" fill="#f4ead2" ${OL} transform="rotate(-8 29 31)"/><rect x="18" y="12" width="34" height="42" rx="2" fill="#fbf3de" ${OL} transform="rotate(5 35 33)"/><path d="M26 40c3-8 10-10 14-12" fill="none" stroke="#4f8f3e" stroke-width="3" stroke-linecap="round"/><path d="M34 26c-5 0-6 5-6 5s5 1 6-5zM38 30c5-2 8 1 8 1s-4 4-8-1z" fill="#5fa14c"/><path d="M14 46c10 2 26 4 38-2" fill="none" stroke="#b88d4f" stroke-width="3"/>`),
  album: S(`<rect x="12" y="8" width="40" height="48" rx="4" fill="#9a5c2c" ${OL}/><rect x="16" y="10" width="34" height="42" rx="2" fill="#c98a4e"/><rect x="22" y="18" width="24" height="22" rx="2" fill="#f4ead2" ${OL}/><circle cx="34" cy="29" r="4" fill="#ffd23f"/><g fill="#fff" stroke="#d9c7a4"><ellipse cx="34" cy="22" rx="3" ry="4"/><ellipse cx="34" cy="36" rx="3" ry="4"/><ellipse cx="27" cy="29" rx="4" ry="3"/><ellipse cx="41" cy="29" rx="4" ry="3"/></g><circle cx="34" cy="29" r="3.5" fill="#f2b632"/><rect x="40" y="48" width="6" height="12" fill="#d9473b"/>`),
  basket: S(`<path d="M14 30c0-18 36-18 36 0" fill="none" stroke="#8a5530" stroke-width="5"/><path d="M8 30h48l-6 24H14z" fill="#c98a4e" ${OL}/><path d="M12 38h40M14 46h36" stroke="#9a5c2c" stroke-width="2.4"/><path d="M20 30v24M32 30v24M44 30v24" stroke="#9a5c2c" stroke-width="2"/><rect x="22" y="18" width="20" height="14" rx="1" fill="#f4ead2" ${OL}/><path d="M32 18v14M22 24h20" stroke="#d9473b" stroke-width="3"/><path d="M32 18c-4-6-10-2-6 1zM32 18c4-6 10-2 6 1z" fill="#d9473b"/>`),
  heart: S(`<path d="M32 54C12 40 8 30 10 22c2-9 14-12 22-2 8-10 20-7 22 2 2 8-2 18-22 32z" fill="#e0393a" ${OL}/><path d="M18 22c1-4 5-6 8-4" stroke="#ffb3a8" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  eye: S(`<path d="M8 32c12-14 36-14 48 0-12 14-36 14-48 0z" fill="#fbf3de" ${OL}/><circle cx="32" cy="32" r="8" fill="#3b72b6" ${OL}/><circle cx="34" cy="30" r="2.4" fill="#fff"/>`),
  check: S(`<path d="M14 34l11 11 25-26" fill="none" stroke="#fff8e6" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`),
  cross: S(`<path d="M18 18l28 28M46 18L18 46" fill="none" stroke="#fff8e6" stroke-width="8" stroke-linecap="round"/>`),
  rotate: S(`<path d="M18 30a14 14 0 0 1 25-8" fill="none" stroke="#6e3f1c" stroke-width="5" stroke-linecap="round"/><path d="M46 13l-1 11-11-2" fill="none" stroke="#6e3f1c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 34a14 14 0 0 1-25 8" fill="none" stroke="#6e3f1c" stroke-width="5" stroke-linecap="round"/><path d="M18 51l1-11 11 2" fill="none" stroke="#6e3f1c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`),
  back: S(`<path d="M42 50c8-8 6-24-10-24H18" fill="none" stroke="#3e7d34" stroke-width="7" stroke-linecap="round"/><path d="M26 16L14 26l12 10" fill="none" stroke="#3e7d34" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`),
  close: S(`<path d="M20 20l24 24M44 20L20 44" fill="none" stroke="#fff8e6" stroke-width="7" stroke-linecap="round"/>`),
  hand: S(`<path d="M24 56c-6-6-12-14-12-20 0-3 4-4 6-1l4 5V12c0-4 6-4 6 0v16-4c0-4 6-4 6 0v4-2c0-4 6-4 6 0v4c0-3 6-3 6 0v12c0 8-4 14-8 14z" fill="#f6ead0" ${OL}/>`),
  'arrow-left': S(`<path d="M48 32H18M28 20L16 32l12 12" fill="none" stroke="#3e7d34" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`),
  'arrow-right': S(`<path d="M16 32h30M36 20l12 12-12 12" fill="none" stroke="#3e7d34" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`),
  moon: S(`<path d="M44 44A18 18 0 1 1 26 14a14 14 0 0 0 18 30z" fill="#ffd96a" ${OL}/><circle cx="46" cy="16" r="2.5" fill="#ffd96a"/><circle cx="52" cy="26" r="1.8" fill="#ffd96a"/>`),
  star: S(`<path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z" fill="#f2b632" ${OL}/>`),
  'star-o': S(`<path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z" fill="#f4ead2" ${OL}/>`),
  map: S(`<path d="M8 14l14-5 20 5 14-5v40l-14 5-20-5-14 5z" fill="#f4ead2" ${OL}/><path d="M22 9v40M42 14v40" stroke="#c9a46a" stroke-width="2"/><path d="M14 40c6-4 8-12 16-12s10 8 18-4" fill="none" stroke="#d9473b" stroke-width="2.6" stroke-dasharray="3 3" stroke-linecap="round"/><circle cx="48" cy="22" r="3.4" fill="#d9473b" ${OL} stroke-width="1.4"/><circle cx="14" cy="40" r="2.6" fill="#4f8f3e"/>`),
  'hud-weather-sun': S(`<circle cx="32" cy="32" r="12" fill="#ffd23f" ${OL}/>${[0, 1, 2, 3, 4, 5, 6, 7].map(k => { const a = k / 8 * 6.283; return `<path d="M${32 + Math.cos(a) * 17} ${32 + Math.sin(a) * 17}L${32 + Math.cos(a) * 24} ${32 + Math.sin(a) * 24}" stroke="#f2a33a" stroke-width="4" stroke-linecap="round"/>`; }).join('')}`),
  'hud-weather-cloud': S(`<circle cx="44" cy="22" r="9" fill="#ffd23f" ${OL}/><path d="M14 46c-6 0-7-10 0-11 0-9 12-11 15-4 3-7 15-5 14 3 8 0 8 12 0 12z" fill="#f6f1e6" ${OL}/>`),
  'hud-weather-rain': S(`<path d="M14 36c-6 0-7-10 0-11 0-9 12-11 15-4 3-7 15-5 14 3 8 0 8 12 0 12z" fill="#f6f1e6" ${OL}/><path d="M20 44l-3 8M32 44l-3 8M44 44l-3 8" stroke="#3b72b6" stroke-width="4" stroke-linecap="round"/>`),
  'hud-weather-snow': S(`<path d="M14 34c-6 0-7-10 0-11 0-9 12-11 15-4 3-7 15-5 14 3 8 0 8 12 0 12z" fill="#f6f1e6" ${OL}/>${[[20, 46], [32, 52], [44, 46]].map(([x, y]) => `<path d="M${x - 4} ${y}h8M${x} ${y - 4}v8M${x - 3} ${y - 3}l6 6M${x + 3} ${y - 3}l-6 6" stroke="#7fb8ec" stroke-width="2" stroke-linecap="round"/>`).join('')}`),
  musicbox: S(`<path d="M10 34h40v18a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3z" fill="#c98a4e" ${OL}/><path d="M10 34l4-14h32l4 14z" fill="#e0a564" ${OL}/><path d="M14 44h32" stroke="#9a5c2c" stroke-width="2.2"/><circle cx="30" cy="44" r="3.2" fill="#d6ac52" ${OL}/><path d="M50 42h5v-5" fill="none" stroke="#6e3f1c" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="55" cy="36" r="2.6" fill="#d9473b" ${OL}/><path d="M36 15V5l9 3v8" fill="none" stroke="#3b72b6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="33.5" cy="16" rx="3.4" ry="2.6" fill="#3b72b6"/><ellipse cx="42.5" cy="17" rx="3.4" ry="2.6" fill="#3b72b6"/>`),
  seedbag: S(`<path d="M14 12h36v42H14z" fill="#f4ead2" ${OL}/><path d="M14 12l4-6h28l4 6" fill="#e3d1aa" ${OL}/><circle cx="32" cy="32" r="9" fill="#ffd23f" ${OL}/>`),
};
const GIFT_SVG = {
  wreath: S(`<circle cx="32" cy="34" r="18" fill="none" stroke="#5fa14c" stroke-width="9"/>${[0, 1, 2, 3, 4, 5, 6, 7].map(k => { const a = k / 8 * 6.283; const x = 32 + Math.cos(a) * 18, y = 34 + Math.sin(a) * 18; return `<g><circle cx="${x}" cy="${y}" r="5.5" fill="#fff" stroke="#e8dcc0"/><circle cx="${x}" cy="${y}" r="2.2" fill="#f2b632"/></g>`; }).join('')}<path d="M24 52l8-6 8 6-4 8-4-6-4 6z" fill="#d9473b"/>`),
  pebble: S(`<ellipse cx="32" cy="38" rx="20" ry="14" fill="#3f73b8" ${OL}/><path d="M18 36c6-2 10 4 16 2s10-6 14-2M22 44c6 0 10-4 18 0" fill="none" stroke="#a8c8f0" stroke-width="2"/><ellipse cx="25" cy="31" rx="5" ry="2.5" fill="#cfe2fa"/>`),
  leafpack: S(`<path d="M10 40c4-18 40-20 44 0-6 14-38 14-44 0z" fill="#5fa14c" ${OL}/><path d="M14 38c10 4 26 4 36 0" fill="none" stroke="#3e7d34" stroke-width="2.4"/><path d="M32 22v26M20 28l24 16M44 28L20 44" stroke="#d8b278" stroke-width="3"/><circle cx="32" cy="36" r="3" fill="#b88d4f"/>`),
  note: S(`<path d="M12 14h40v36l-8 6H12z" fill="#fbf3de" ${OL}/><path d="M44 56v-6h8" fill="#e8d8b4" ${OL}/><path d="M18 24h22M18 31h28M18 38h18" stroke="#c9b48a" stroke-width="2.4" stroke-linecap="round"/><path d="M40 40c0-4 6-4 6 0 0 3-6 7-6 7s-6-4-6-7c0-4 6-4 6 0z" fill="#e0393a"/>`),
  acorn: S(`<path d="M18 30h28c0 16-6 24-14 24s-14-8-14-24z" fill="#c98a4e" ${OL}/><path d="M14 30c0-10 36-10 36 0z" fill="#7a5030" ${OL}/><path d="M32 18v-8" stroke="#5a3a1e" stroke-width="3" stroke-linecap="round"/>`),
  feather: S(`<path d="M50 10C30 14 14 34 16 52c18-2 34-22 34-42z" fill="#f4ead2" ${OL}/><path d="M14 56l30-38" stroke="#8a6a4a" stroke-width="2.4"/><path d="M40 24l-12 2M44 30l-14 4M38 40l-12 2" stroke="#d9c7a4" stroke-width="2"/>`),
};
const SPC = { chick: ['#ffd75e', '#f5b93a'], rabbit: ['#f7ede6', '#e9c9c0'], cat: ['#cfcfd6', '#9a9aa8'], dog: ['#e9c79c', '#a8683a'], duck: ['#ffffff', '#e8e2d6'], bear: ['#b98a63', '#8a5a36'] };
const AV_BG = { chick: '#7ab35a', rabbit: '#6aa74e', cat: '#d8875a', dog: '#4f84c2', duck: '#5fa6c8', bear: '#e0a564' };
export function avatarSVG(sp) {
  const [c, d] = SPC[sp] || SPC.chick; const bg = AV_BG[sp] || '#7ab35a'; let ears = '', extra = '';
  if (sp === 'rabbit') ears = `<ellipse cx="24" cy="12" rx="6" ry="15" fill="${c}" ${OL}/><ellipse cx="40" cy="12" rx="6" ry="15" fill="${c}" ${OL}/><ellipse cx="24" cy="13" rx="3" ry="10" fill="#f6b8b8"/><ellipse cx="40" cy="13" rx="3" ry="10" fill="#f6b8b8"/>`;
  if (sp === 'cat') ears = `<path d="M14 26l4-18 12 10zM50 26l-4-18-12 10z" fill="${c}" ${OL}/>`, extra = `<path d="M26 24l-2-5M32 23v-5M38 24l2-5" stroke="${d}" stroke-width="2.4" stroke-linecap="round"/>`;
  if (sp === 'dog') ears = `<path d="M14 22c-8 4-8 22 0 24 4-6 6-16 4-24zM50 22c8 4 8 22 0 24-4-6-6-16-4-24z" fill="${d}" ${OL}/>`;
  if (sp === 'bear') ears = `<circle cx="18" cy="18" r="7" fill="${c}" ${OL}/><circle cx="46" cy="18" r="7" fill="${c}" ${OL}/>`;
  if (sp === 'chick') ears = `<path d="M30 14c-2-6 2-8 3-4 1-5 5-3 3 2" fill="${d}" ${OL}/>`;
  const beak = sp === 'chick' ? `<path d="M28 38l4 5 4-5z" fill="#f08a24" ${OL} stroke-width="1.6"/>` : sp === 'duck' ? `<ellipse cx="32" cy="41" rx="8" ry="4" fill="#f5a03a" ${OL} stroke-width="1.6"/>` : `<ellipse cx="32" cy="40" rx="${sp === 'bear' ? 7 : 5}" ry="${sp === 'bear' ? 5 : 3.5}" fill="${sp === 'bear' ? '#e3c39c' : '#fff6ee'}"/><ellipse cx="32" cy="38" rx="2.6" ry="1.8" fill="#4a2a1a"/>`;
  return S(`<rect width="64" height="64" fill="${bg}"/><circle cx="32" cy="64" r="26" fill="rgba(255,255,255,.18)"/>${ears}<circle cx="32" cy="35" r="18" fill="${c}" ${OL}/>${extra}<circle cx="25" cy="33" r="2.6" fill="#2a1a10"/><circle cx="39" cy="33" r="2.6" fill="#2a1a10"/><ellipse cx="21" cy="40" rx="3" ry="1.8" fill="#f4a08f" opacity=".7"/><ellipse cx="43" cy="40" rx="3" ry="1.8" fill="#f4a08f" opacity=".7"/>${beak}`);
}
// ---------------------------------------------------------------- 素材存在检查（manifest.json）
export const ART = { files: new Set(), slice: {}, thumbs: {}, ready: false, base: '' };
// 素材位置：优先 assets/ui/（约定位置）；Codex 目前交付在 _handoff/images/assets/ui/（清单另存 _handoff/assets/ui/）
const PLACES = [['assets/ui/manifest.json', 'assets/ui/'], ['_handoff/images/assets/ui/manifest.json', '_handoff/images/assets/ui/'], ['_handoff/assets/ui/manifest.json', '_handoff/images/assets/ui/']];
function fileOf(base, state = '') { // 找名字最贴近的文件：base.png / base-normal.png / base-pressed.png
  const c = state ? [`${base}-${state}.png`, `${base}_${state}.png`, `${base}-${state === 'pressed' ? 'down' : state}.png`] : [`${base}.png`, `${base}-normal.png`, `${base}_normal.png`];
  return c.find(f => ART.files.has(f)) || null;
}
export const artUrl = (base, state) => { const f = fileOf(base, state); return f ? ART.base + f : null; };
export async function loadArt() {
  for (const [m, img] of PLACES) {
    try {
      const r = await fetch(m, { cache: 'no-cache' }); if (!r.ok) continue; const M = await r.json();
      const list = Array.isArray(M) ? M : Array.isArray(M.files) ? M.files : Array.isArray(M.assets) ? M.assets : Object.entries(M).map(([k, v]) => (typeof v === 'object' ? { file: k, ...v } : { file: k }));
      for (const e of list) {
        const f = String(e.path || e.file || e.name || e.filename || '').split('/').pop(); if (!f.endsWith('.png')) continue; ART.files.add(f);
        const sl = e.slice || e.nine || e.nineSlice || e['9slice'] || e.nine_slice; // 清单里的顺序是 左、上、右、下（2x 像素）→ 转成 CSS 的 上、右、下、左
        if (sl) ART.slice[f] = Array.isArray(sl) ? [sl[1], sl[2], sl[3], sl[0]] : [sl.top ?? sl.t ?? 0, sl.right ?? sl.r ?? 0, sl.bottom ?? sl.b ?? 0, sl.left ?? sl.l ?? 0];
      }
      ART.base = img; break;
    } catch (e) { /* 继续找下一个位置 */ }
  }
  ART.ready = true; applyArtCSS(); return ART;
}
function applyArtCSS() {
  const css = []; const u = (b, s) => artUrl(b, s); const B = document.body.classList;
  const nine = (sel, base, k = 0.25, extra = '') => { const url = u(base); if (!url) return; const f = url.split('/').pop(); const sl = ART.slice[f] || [96, 96, 96, 96]; const w = sl.map(v => Math.round(v * k) + 'px').join(' ');
    css.push(`${sel}{border-style:solid!important;border-width:${w}!important;border-image:url(${url}) ${sl.join(' ')} fill / ${w} stretch!important;background:none!important;box-shadow:none!important;${extra}}`); };
  nine('#placebar .bar,#tendbar .bar,#placebar .plaque', 'panel-wood', 0.2, 'padding:2px 10px!important');
  nine('.toast.paper,.polar.paper,#gift .box.paper,#placeHint.paper', 'panel-paper', 0.09);
  nine('.wtag.paper,.dexc.paper,.mini.paper', 'panel-paper', 0.06);
  nine('.detail .card.paper', 'panel-paper', 0.08, 'outline:0!important;padding:0 2px!important;min-height:0!important');
  nine('.crate .plank.paper', 'panel-paper', 0.06, 'padding:0!important');
  nine('.site .signboard', 'panel-wood', 0.2, 'padding:16px 8px 8px!important'); nine('.site .sp.paper,.site .smsg.paper', 'panel-paper', 0.08, 'padding:4px 6px!important');
  nine('#toolbar', 'toolbar-wood', 0.22, 'padding:0 2px!important');
  if (u('crate-open')) { B.add('art-crate'); css.push(`.crate .cbox{background:url(${u('crate-open')}) center/100% 100% no-repeat!important}`); }
  if (u('clipboard')) { B.add('art-board'); const f = u('clipboard').split('/').pop(); const sl = ART.slice[f]; css.push(`.board{background:none!important;box-shadow:none!important;border-style:solid;border-width:${sl.map(v => Math.round(v * 0.11) + 'px').join(' ')};border-image:url(${u('clipboard')}) ${sl.join(' ')} fill / ${sl.map(v => Math.round(v * 0.11) + 'px').join(' ')} stretch;padding:0!important}.board .brassclip{display:none}.board .sheet2.paper{background:none!important;box-shadow:none!important;padding:0 2px}`); }
  if (u('windowsill')) { B.add('art-sill'); css.push(`.sill .win{background:url(${u('windowsill')}) center top/100% 100% no-repeat!important}`); }
  if (u('rope')) css.push(`.rope{background:url(${u('rope')}) left center/auto 100% repeat-x!important;box-shadow:none!important;height:18px}`);
  if (u('clothespin')) css.push(`.pin{background:url(${u('clothespin')}) center/contain no-repeat!important;box-shadow:none!important;width:22px;height:36px}.pin:after{display:none}`);
  if (u('slot-wood')) css.push(`.slot{background:url(${u('slot-wood')}) center/100% 100% no-repeat!important;box-shadow:none!important}`);
  if (u('slot-wood-selected')) css.push(`.slot.sel{background-image:url(${u('slot-wood-selected')})!important;box-shadow:none!important}`);
  if (u('tab-wood-off')) css.push(`.tabs button{background:url(${u('tab-wood-off')}) center/100% 100% no-repeat!important;box-shadow:none!important;color:#5a3a1e}`);
  if (u('tab-wood-on')) css.push(`.tabs button.on{background-image:url(${u('tab-wood-on')})!important;color:#fff7e0;text-shadow:0 1px 0 rgba(30,60,20,.6)}`);
  for (const c of ['green', 'red', 'cream', 'blue']) { const n = u('btn-enamel-' + c), p = u('btn-enamel-' + c, 'pressed'); if (n) css.push(`.enamel.${c}{background:url(${n}) center/100% 100% no-repeat!important;border:0!important;box-shadow:0 5px 8px rgba(60,30,10,.3)!important}`); if (p) css.push(`.enamel.${c}:active,.enamel.${c}.down{background-image:url(${p})!important;box-shadow:0 1px 3px rgba(60,30,10,.3)!important}`); }
  if (u('hud-sun-clock')) css.push(`#sun .art{background-image:url(${u('hud-sun-clock')})}#sun .disc,#sun .rays,#sun .ring,#sun .face,#sun .pinc{display:none}`);
  if (u('hud-clock-hand')) css.push(`#sun .hand{left:0!important;top:0!important;width:100%!important;height:100%!important;margin:0!important;transform-origin:50% 50%!important;border-radius:0;background:url(${u('hud-clock-hand')}) center/100% 100% no-repeat!important;box-shadow:none}#sun .hand:after{display:none}`);
  if (u('progress-seed-empty') || u('progress-seed')) css.push(`.seed{background:url(${u('progress-seed-empty') || u('progress-seed')}) center/contain no-repeat!important;box-shadow:none!important;border-radius:0}`);
  if (u('progress-seed-full')) css.push(`.seed.on{background-image:url(${u('progress-seed-full')})!important}`);
  if (u('stamp-paw')) css.push(`.paw{background:url(${u('stamp-paw')}) center/contain no-repeat!important;box-shadow:none!important}.paw svg{display:none}`);
  if (u('check-tick')) css.push(`.stamp{border:0!important;background:url(${u('check-tick')}) center/contain no-repeat;color:transparent!important}`);
  if (ART.files.size) B.add('art');
  document.getElementById('assetCSS').textContent = css.join('\n');
  for (const el of document.querySelectorAll('.ic[data-ic]')) el._done = null; hydrate(document.body);
}
// 图标：<span class="ic" data-ic="box"> → 有素材用素材，没有用 SVG
const ICON_FILE = (n) => n === 'hud-basket' ? artUrl('hud-basket') || artUrl('icon-basket') : n.startsWith('hud-') ? artUrl(n) : artUrl('icon-' + n);
export function icon(name, cls = '') { return `<span class="ic ${cls}" data-ic="${name}"></span>`; }
export function hydrate(root) {
  for (const el of root.querySelectorAll('.ic[data-ic]')) {
    if (el._done === el.dataset.ic + ART.ready) continue; el._done = el.dataset.ic + ART.ready;
    const n = el.dataset.ic; let url = null, svg = '';
    if (n.startsWith('item:')) { const k = n.slice(5); url = artUrl('item-' + k) || ART.thumbs[k] || null; if (!url) svg = `<b style="font:800 12px var(--round)">${k}</b>`; }
    else if (n.startsWith('gift:')) { const k = n.slice(5); url = artUrl('gift-' + k); svg = GIFT_SVG[k] || ''; }
    else if (n.startsWith('av:')) { const k = n.slice(3); url = artUrl('avatar-' + k); svg = avatarSVG(k); }
    else if (n.startsWith('mat:')) { const k = n.slice(4); url = artUrl('mat-' + ({ cap: 'bottlecap', grass: 'hay' }[k] || k)); svg = `<b style="font:800 12px var(--round)">${k}</b>`; }
    else { url = ICON_FILE(n); svg = ICON_SVG[n === 'hud-basket' ? 'basket' : n] || ''; }
    if (url) { el.style.backgroundImage = `url(${url})`; el.classList.add('img'); el.innerHTML = ''; }
    else { el.style.backgroundImage = ''; el.classList.remove('img'); el.innerHTML = svg; }
  }
}
export function setThumbs(t) { Object.assign(ART.thumbs, t); for (const el of document.querySelectorAll('.ic[data-ic^="item:"]')) el._done = null; hydrate(document.body); }
export const spName = (sp) => SP_NAME[sp];
