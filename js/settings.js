// 玩家设置（存在这台设备的 localStorage）：音乐、环境音、音量、Lenia 说话
const KEY = 'lenia-settings-v1';
const DEF = { music: true, amb: true, vol: 0.5, talk: true };
let cur = null;
export function settings() {
  if (!cur) { cur = { ...DEF }; try { Object.assign(cur, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { } }
  return cur;
}
export function setSetting(k, v) { settings()[k] = v; try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { } for (const f of subs) f(k, v); }
const subs = new Set();
export function onSetting(f) { subs.add(f); return () => subs.delete(f); }
