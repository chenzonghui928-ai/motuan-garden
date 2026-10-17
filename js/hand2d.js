// Lenia（玩家）的 2D 手：画在 3D 画布上方的一层图（assets/hand2d/*.png，米色针织袖口 + 手），不挡点击。
// 放置/挪动时捏着旧物虚影的顶；打理时拿喷壶 / 撒种；点小动物、托梦时轻点一下。
// 每个姿势一张图，锚点（图里的“捏点/壶嘴/指尖”，按 512 图的像素）对准屏幕上的目标点；袖口在图的上边缘被裁掉，所以从屏幕上方伸入。
// 胳膊只留一点点袖口：目标点离屏幕上沿较远时也只显示图本身，图顶边缘用 CSS 蒙版柔和渐隐（约 26px），不露硬边。

// 锚点 [x, y]（512 图像素）、手机/电脑占屏幕宽度的比例
const POSES = {
  hover: { f: 'place-hover', a: [238, 332.5], m: 0.53, d: 0.23 },
  pinch: { f: 'place-pinch', a: [221.5, 347.5], m: 0.53, d: 0.23 },
  release: { f: 'place-release', a: [221.5, 347.5], m: 0.53, d: 0.23 },
  push: { f: 'move-push', a: [167.5, 382.5], m: 0.47, d: 0.21 },
  waterT: { f: 'water-tilted', a: [117.5, 332.5], m: 0.63, d: 0.275 },
  waterU: { f: 'water-upright', a: [92.5, 274], m: 0.63, d: 0.275 },
  sow: { f: 'sow-seeds', a: [235, 317.5], m: 0.53, d: 0.23 },
  tap: { f: 'tap-point', a: [172.5, 353.5], m: 0.47, d: 0.21 },
};
const NAT = 512, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = (u) => 1 - (1 - u) ** 3;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || !!window.__reduceMotion; } catch (e) { return false; } };

function makeActor(root, tapOnly) {
  const el = document.createElement('div'); el.className = 'h2a'; const fl = document.createElement('div'); fl.className = 'h2f'; el.appendChild(fl);
  const sh = document.createElement('div'); sh.className = 'h2s'; root.appendChild(sh); root.appendChild(el);
  const W = {}; // 姿势 → { w: 外框, img, ext }
  for (const k in POSES) {
    if (tapOnly && k !== 'tap') continue; const P = POSES[k];
    const w = document.createElement('div'); w.className = 'h2p'; w.dataset.pose = k;     const img = new Image(); img.draggable = false; img.alt = ''; img.src = `assets/hand2d/${P.f}.png`; img.dataset.ax = P.a[0]; img.dataset.ay = P.a[1];
    w.appendChild(img); fl.appendChild(w); W[k] = { w, img };
  }
  return { el, fl, sh, W, pose: null, s: 0, flip: 1 };
}

export function createHand2D(root) {
  const A = makeActor(root, false), T = makeActor(root, true);
  const S = { on: false, pose: 'hover', x: 0, y: 0, tx: 0, ty: 0, gx: 0, gy: 0, hasG: false, fit: 1, vis: 0, enter: 0, leave: 0, dip: 0, t: 0, idle: 0, autoHide: 0, pending: 0, hold: 0, holdPose: null, size: 0, flip: 1, water: false, seen: false, tap: { t: 9, x: 0, y: 0 } };

  function sizeOf(k, fit) { const P = POSES[k], m = innerWidth < 700; return clamp(innerWidth * (m ? P.m : P.d) * fit, 90, 520); }
  function layoutActor(Ac, k, s) { // 这个姿势的图在锚点 P 周围摆好（只在尺寸变了时算）
    const W = Ac.W[k]; if (!W) return; const P = POSES[k]; const key = Math.round(s); if (W.s === key) return; W.s = key;
    W.w.style.left = (-P.a[0] / NAT * s).toFixed(1) + 'px'; W.w.style.top = (-P.a[1] / NAT * s).toFixed(1) + 'px'; W.w.style.width = W.w.style.height = s.toFixed(1) + 'px';
  }
  function setPose(Ac, k, instant) {
    if (Ac.pose === k) return; const old = Ac.pose; Ac.pose = k;
    for (const n in Ac.W) { const w = Ac.W[n].w; if (instant) w.style.transition = 'none'; else w.style.transition = ''; w.classList.toggle('on', n === k); }
    if (instant) void Ac.el.offsetWidth, [...Object.values(Ac.W)].forEach(o => { o.w.style.transition = ''; });
    return old;
  }
  function pose(k, instant) { if (S.pose !== k) { S.pose = k; if (!reduced() && !instant && S.vis > 0.5) S.dip = k === 'pinch' ? 4 : k === 'release' ? -2 : 3; } }

  const api = {
    get on() { return S.on; }, S, A, T,
    // 开始显示：k = 初始姿势；enter = 从袖口方向滑入
    show(k = 'hover') { S.on = true; S.leave = 0; S.autoHide = 0; S.seen = false; S.vis = 0; S.enter = 1; S.pose = k; S.hold = 0; setPose(A, k, true); A.el.style.display = ''; },
    pose, point(x, y, opt = {}) { // 目标点（屏幕）：opt.smooth 平滑速度（每帧在 update 里追）；opt.fit 按旧物大小缩放；opt.ground 影子的位置
      if (!S.seen || opt.snap) { S.x = x; S.y = y; S.seen = true; }
      S.tx = x; S.ty = y; S.sm = opt.smooth || 0; if (opt.fit) S.fit = opt.fit; S.hasG = !!opt.ground; if (opt.ground) { S.gx = opt.ground[0]; S.gy = opt.ground[1]; } S.idle = 0; },
    release() { if (!S.on || S.leave) return; S.leave = 1e-4; pose('release'); },
    hide() { S.on = false; S.leave = 0; S.vis = 0; A.el.style.display = 'none'; A.sh.style.opacity = 0; },
    fadeOut() { if (S.on && !S.leave) { S.leave = 1e-4; S.holdPose = null; } },
    tap(x, y) { const n = performance.now(); if (n - (S.tapAt || 0) < 900) return; S.tapAt = n; S.tap = { t: 0, x, y }; T.el.style.display = ''; setPose(T, 'tap', true); layoutActor(T, 'tap', sizeOf('tap', 1)); },
    // 水壶/撒种：点按时短暂切成倾斜/撒的姿势
    act(k, ms = 700) { if (!S.on) return; S.hold = ms / 1000; S.holdPose = k; if (!reduced()) S.dip = 5; },
    // 测试用：当前姿势、图上锚点在屏幕上的位置、是否可见
    probe() { const tapShown = T.el.style.display !== 'none' ? +T.el.style.opacity : 0;
      const k = A.pose, W = A.W[k]; if (!W || !S.on) return { on: false, pose: k, tapShown };
      const r = W.img.getBoundingClientRect(); const fx = S.flip < 0; const ax = +W.img.dataset.ax / NAT, ay = +W.img.dataset.ay / NAT;
      return { on: true, tapShown, pose: k, vis: +getComputedStyle(A.el).opacity, ax: fx ? r.right - ax * r.width : r.left + ax * r.width, ay: r.top + ay * r.height, w: r.width, flip: fx, rect: [r.left, r.top, r.right, r.bottom] };
    },
    update(dt) {
      S.t += dt; const rm = reduced();
      // 轻点小手
      if (S.tap.t < 0.6) { S.tap.t += dt; const u = S.tap.t / 0.4, fade = u < 0.2 ? u / 0.2 : u < 0.6 ? 1 : clamp(1 - (u - 0.6) / 0.4, 0, 1); const s = sizeOf('tap', 1); layoutActor(T, 'tap', s);
        const dip = rm ? 0 : Math.sin(clamp(u, 0, 1) * Math.PI) * 6, enter = rm ? 0 : (1 - ease(clamp(u / 0.3, 0, 1))) * 30, fx = S.tap.x < innerWidth * 0.5 && innerWidth < 700 ? -1 : 1; T.flip = fx;
        T.el.style.transform = `translate3d(${(S.tap.x + fx * enter).toFixed(1)}px,${(S.tap.y + dip - enter).toFixed(1)}px,0)`; T.fl.style.transform = fx < 0 ? 'scaleX(-1)' : ''; T.el.style.opacity = (fade * 0.97).toFixed(2);
        T.sh.style.opacity = 0; if (S.tap.t >= 0.6) { T.el.style.opacity = 0; T.el.style.display = 'none'; } }
      if (!S.on) return;
      if (S.sm) { const k = 1 - Math.exp(-S.sm * dt); S.x += (S.tx - S.x) * k; S.y += (S.ty - S.y) * k; } else { S.x = S.tx; S.y = S.ty; }
      // 点按动作结束后回到平常姿势
      let k = S.pose; if (S.hold > 0) { S.hold -= dt; k = S.holdPose; if (S.hold <= 0) S.holdPose = null; }
      if (k !== A.pose) setPose(A, k);
      const s = sizeOf(k, S.fit); S.size = s; layoutActor(A, k, s);
      // 左右：手机上手指在屏幕左半边（水壶在右半边）用水平翻转版；加一点滞后，免得在中线上来回跳
      const w = innerWidth, water = k === 'waterT' || k === 'waterU';
      if (w < 700) { const m = w * 0.5, band = 22; if (water) { if (S.x > m + band) S.flip = -1; else if (S.x < m - band) S.flip = 1; } else { if (S.x < m - band) S.flip = -1; else if (S.x > m + band) S.flip = 1; } }
      else if (water) { const need = POSES[k].a[0] < 200 ? (1 - POSES[k].a[0] / NAT) * s : s * 0.5; if (S.x + need > w + 8) S.flip = -1; else if (S.x + need < w - 40) S.flip = 1; } else S.flip = 1;
      // 淡入 / 离开 / 闲置淡出
      if (S.enter > 0) S.enter = Math.max(0, S.enter - dt / (rm ? 0.01 : 0.16));
      let alpha = 1, ox = 0, oy = 0; const fl = S.flip;
      if (!S.leave) { S.vis = Math.min(1, S.vis + dt / (rm ? 0.08 : 0.14)); if (S.autoHide) { S.idle += dt; if (S.idle > S.autoHide) { S.leave = 1e-4; S.holdPose = null; } } }
      else { S.leave += dt; const d0 = rm ? 0 : 0.14, u = clamp((S.leave - d0) / (rm ? 0.12 : 0.24), 0, 1); S.vis = 1 - u; if (!rm) { oy = -ease(u) * 90; ox = ease(u) * 40 * fl; } if (u >= 1) { api.hide(); return; } }
      const e = S.enter > 0 ? 1 - ease(1 - S.enter) : 0; // 进场：从袖口那边（右上）滑进来
      if (!rm) { ox += e * 50 * fl; oy -= e * 70; }
      alpha = S.vis * (S.enter > 0 ? 1 - e * 0.6 : 1);
      S.dip += (0 - S.dip) * Math.min(1, dt * 9); const breathe = rm || S.leave || k === 'release' ? 0 : Math.sin(S.t * Math.PI * 2 / 1.8) * (k === 'hover' ? 2 : 1);
      const rot = k === 'release' && !rm ? Math.min(1, S.leave / 0.14) * 6 * -fl : 0;
      const px = S.x + ox, py = S.y + oy + S.dip + breathe;
      A.el.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)`; A.fl.style.transform = `${fl < 0 ? 'scaleX(-1) ' : ''}${rot ? `rotate(${(rot * -fl).toFixed(1)}deg)` : ''}`; A.el.style.opacity = alpha.toFixed(2);
      // 地上一块柔和的椭圆影子（手不带影子）：悬着时大一点淡一点，捏着时小一点深一点
      if (S.hasG) { const hv = k === 'hover' ? 1 : 0, sw = s * 0.21 * (hv ? 1.25 : 1) * (k === 'waterU' || k === 'waterT' ? 0.8 : 1); A.sh.style.width = sw.toFixed(0) + 'px'; A.sh.style.height = (sw * 0.3).toFixed(0) + 'px';
        A.sh.style.transform = `translate3d(${(S.gx - sw / 2 + fl * s * 0.03).toFixed(1)}px,${(S.gy - sw * 0.15).toFixed(1)}px,0)`; A.sh.style.opacity = (S.vis * (hv ? 0.11 : 0.17) * (S.leave ? 0.5 : 1)).toFixed(3); A.sh.style.filter = `blur(${innerWidth < 700 ? 8 : 11}px)`; }
      else A.sh.style.opacity = 0;
    },
  };
  A.el.style.display = 'none'; T.el.style.display = 'none';
  return api;
}
