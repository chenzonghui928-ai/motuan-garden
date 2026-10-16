// 旧物小图：界面素材（assets/ui/item-*.png）还没到时，用游戏里的 3D 造型现拍一张透明底小图当图标
import * as THREE from 'three';
import { ITEM_KEYS, TEMPLATE_OF, COMBOS } from '../shared/items.js';

function stage0(geo) { // 只留原始物件的三角形（去掉改造后才有的门窗烟囱）
  const g = geo.index ? geo.toNonIndexed() : geo; const st = g.attributes.aStg; if (!st) return g;
  const keep = []; for (let i = 0; i < st.count; i += 3) if (st.array[i] < 0.5) keep.push(i);
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) { const a = g.attributes[k]; if (!a) continue; const n = a.itemSize; const arr = new Float32Array(keep.length * 3 * n); keep.forEach((v, j) => { for (let q = 0; q < 3 * n; q++) arr[j * 3 * n + q] = a.array[v * n + q]; }); out.setAttribute(k, new THREE.BufferAttribute(arr, n)); }
  return out;
}
export function makeThumbs(renderer, town, props, size = 160) {
  const out = {}; const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight('#fff6e6', '#9a8a6a', 2.2)); const d = new THREE.DirectionalLight('#fff2dc', 3.2); d.position.set(-4, 7, 6); scene.add(d);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 }); const px = new Uint8Array(size * size * 4);
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const ctx = cv.getContext('2d'); const img = ctx.createImageData(size, size);
  const lut = new Uint8Array(256); for (let i = 0; i < 256; i++) { const l = Math.min(1, i / 255 * 1.12); lut[i] = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055)); }
  const shoot = (group) => {
    const b = new THREE.Box3().setFromObject(group); const c = b.getCenter(new THREE.Vector3()); const rad = b.getSize(new THREE.Vector3()).length() / 2;
    const dist = rad / Math.sin(15 * Math.PI / 180) * 0.93; const dir = new THREE.Vector3(0.35, 0.55, 1).normalize();
    cam.position.copy(c).addScaledVector(dir, dist); cam.lookAt(c); cam.updateProjectionMatrix();
    scene.add(group); const old = renderer.getRenderTarget(); const oc = renderer.getClearAlpha(); const col = new THREE.Color(); renderer.getClearColor(col);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    renderer.setRenderTarget(old); renderer.setClearColor(col, oc); scene.remove(group);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = ((size - 1 - y) * size + x) * 4, j = (y * size + x) * 4; const a = px[i + 3]; img.data[j] = lut[px[i]]; img.data[j + 1] = lut[px[i + 1]]; img.data[j + 2] = lut[px[i + 2]]; img.data[j + 3] = a; }
    ctx.putImageData(img, 0, 0); return cv.toDataURL('image/png');
  };
  const keys = [...ITEM_KEYS, ...COMBOS.map(c => 'combo_' + c.id)];
  for (const k of keys) {
    try {
      const g = new THREE.Group();
      if (TEMPLATE_OF[k]) { const T = town.sets[TEMPLATE_OF[k]].hi.T; for (const b of T.buckets) { const m = b.vc ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }) : b.src; g.add(new THREE.Mesh(stage0(b.geo), m)); } }
      else if (props.geos[k]) g.add(props.groupOf(k));
      else continue;
      g.rotation.y = -0.5; out[k] = shoot(g);
    } catch (e) { /* 拍不出来就用文字 */ }
  }
  rt.dispose(); return out;
}
