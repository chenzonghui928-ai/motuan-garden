// 居民头顶的气泡：全镇只有这一个样式（就是聊天时那个舒服的“…”气泡），换的只是中间的符号。
// 所有冒气泡的地方（围观的 ？！、哼歌的 ♪、聊天的 …、找材料的 ？……）都走 createBubbles 这一个公用函数：
//   每帧 begin() → 每个冒泡的居民 put(...) → end()；没再 put 的会缩一下消失。点击也靠它：hit() 找屏幕上离手指最近的气泡。
// 气泡本体：白色椭圆 + 左下一个小尾巴，尾巴尖正好指着头顶；出现时弹一下，之后轻轻上下晃；一直朝着屏幕（DOM，天然朝镜头）。
export const BUB_SYM = {
  1: { s: '？', c: 'q' },   // 看到新东西、在找什么
  2: { s: '！', c: 'w' },   // 吃惊、高兴
  3: { s: '♪', c: 'n' },   // 哼歌、玩得开心
  4: { s: '…', c: 't' },   // 聊天、商量（三个点）
};
const DOTS = '<i></i><i></i><i></i>';
export function createBubbles(root) {
  const map = new Map(); const seen = new Set();
  function make(key) {
    const el = document.createElement('div'); el.className = 'bub in'; el.innerHTML = '<div class="bb"><span class="bs"></span></div>'; root.appendChild(el);
    const e = { key, el, bs: el.querySelector('.bs'), sym: null, w: 0, x: 0, y: 0, out: 0, tm: 0 }; map.set(key, e); return e;
  }
  return {
    begin() { seen.clear(); },
    // key：谁（居民编号等）；(x, y)：头顶的屏幕坐标（尾巴尖落在这里）；code：1～4 选符号；w：气泡宽度（像素）
    put(key, x, y, code, w = 40) {
      const sy = BUB_SYM[code] || BUB_SYM[2]; let e = map.get(key); if (!e) e = make(key);
      if (e.out) { e.out = 0; clearTimeout(e.tm); e.el.classList.remove('out'); e.el.classList.add('in'); }
      seen.add(key);
      if (e.sym !== sy) { e.sym = sy; e.bs.className = 'bs ' + sy.c; if (sy.c === 't') e.bs.innerHTML = DOTS; else e.bs.textContent = sy.s; }
      w = Math.round(w); if (e.w !== w) { e.w = w; e.el.style.setProperty('--w', w + 'px'); }
      e.x = x; e.y = y; e.el.style.transform = `translate(${(x - w * 0.22).toFixed(1)}px,${(y - w * 0.74 - w * 0.1).toFixed(1)}px)`;
    },
    end() {
      for (const e of map.values()) if (!seen.has(e.key) && !e.out) { e.out = 1; e.el.classList.remove('in'); e.el.classList.add('out'); e.tm = setTimeout(() => { if (e.out) { e.el.remove(); map.delete(e.key); } }, 240); }
    },
    // 屏幕上 (sx, sy) 附近点中的气泡（点击区比气泡本身大一圈，手机好点中）
    hit(sx, sy, pad = 30) {
      let best = null, bd = 1e9; for (const e of map.values()) { if (e.out) continue; const cx = e.x + e.w * 0.28, cy = e.y - e.w * 0.45; const d = Math.hypot(cx - sx, cy - sy); if (d < bd && d < e.w * 0.5 + pad) { bd = d; best = e.key; } }
      return best;
    },
    has(key) { const e = map.get(key); return !!e && !e.out; },
    pos(key) { const e = map.get(key); return e ? { x: e.x, y: e.y, w: e.w, code: e.sym && e.sym.c } : null; },
    clear() { for (const e of map.values()) e.el.remove(); map.clear(); },
  };
}
