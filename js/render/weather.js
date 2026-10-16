// 场景/渲染·天气：雨丝、雪花、春天的花瓣 / 秋天的落叶 / 夏夜的萤火虫，以及雨后的水洼和放了东西的小池塘
// 粒子全部在着色器里按时间算位置（CPU 每帧只改几个 uniform），世界坐标固定、在镜头附近的盒子里循环；手机和鱼缸模式按比例减少数量
import * as THREE from 'three';
import { LOW, PI, TAU, clamp, lerp } from '../lib/core.js';

const HASH = `float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }`;
const WRAP = `vec3 wrapBox(vec3 s, vec3 C, vec3 B){ vec3 p = s * B; p.xz = C.xz + mod(p.xz - C.xz + B.xz * 0.5, B.xz) - B.xz * 0.5; return p; }`;
function seeds(n, perVert) { const a = new Float32Array(n * perVert * 4); for (let i = 0; i < n; i++) { const s = [Math.random(), Math.random(), Math.random(), Math.random()]; for (let v = 0; v < perVert; v++) { a.set(s, (i * perVert + v) * 4); } } return a; }

export class WeatherFX {
  constructor(scene) {
    this.scene = scene; this.density = 1;
    const U = this.U = { uTime: { value: 0 }, uC: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3(80, 30, 80) }, uAmt: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uPx: { value: 600 } };
    // ---------------- 雨：每滴一条短线（两个顶点）
    this.NR = LOW ? 1800 : 3600;
    { const g = new THREE.BufferGeometry(); const sd = seeds(this.NR, 2); const end = new Float32Array(this.NR * 2); for (let i = 0; i < this.NR; i++) end[i * 2 + 1] = 1;
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.NR * 2 * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
      this.rainMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { ...U, uAmt: { value: 0 }, uLen: { value: 1.2 }, uWind: { value: new THREE.Vector2(0.18, 0.06) } },
        vertexShader: `attribute vec4 aSeed; attribute float aEnd; uniform float uTime, uAmt, uLen; uniform vec3 uC, uB; uniform vec2 uWind; varying float vA; ${WRAP}
          void main(){ vec3 p = wrapBox(aSeed.xyz, uC, uB); float h = mod(aSeed.y * uB.y - uTime * (24.0 + aSeed.w * 8.0), uB.y); p.y = uC.y + h; p.xz += uWind * h;
            p += vec3(uWind.x, 1.0, uWind.y) * uLen * (0.8 + aSeed.w * 0.4) * aEnd; float on = step(aSeed.w, uAmt);
            vA = on * mix(0.05, 0.8, aEnd) * smoothstep(0.0, 1.5, h) * (1.0 - smoothstep(uB.y * 0.8, uB.y, h));
            gl_Position = on > 0.5 ? projectionMatrix * viewMatrix * vec4(p, 1.0) : vec4(2.0, 2.0, 2.0, 1.0); }`,
        fragmentShader: `uniform vec3 uLight; varying float vA; void main(){ gl_FragColor = vec4(mix(vec3(0.8,0.88,0.98), vec3(1.0), 0.35) * max(uLight, vec3(0.45)), vA); }` });
      this.rain = new THREE.LineSegments(g, this.rainMat); this.rain.frustumCulled = false; this.rain.renderOrder = 5; scene.add(this.rain); }
    // ---------------- 雪：点精灵，慢慢飘
    this.NS = LOW ? 1400 : 2800;
    { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.NS * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seeds(this.NS, 1), 4));
      this.snowMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { ...U, uAmt: { value: 0 } },
        vertexShader: `attribute vec4 aSeed; uniform float uTime, uAmt, uPx; uniform vec3 uC, uB; varying float vA; ${WRAP}
          void main(){ vec3 p = wrapBox(aSeed.xyz, uC, uB); float h = mod(aSeed.y * uB.y - uTime * (1.6 + aSeed.w * 1.4), uB.y); p.y = uC.y + h;
            p.x += sin(uTime * 0.7 + aSeed.x * 40.0) * 0.8; p.z += cos(uTime * 0.53 + aSeed.z * 40.0) * 0.8; float on = step(aSeed.w, uAmt);
            vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = on * clamp((0.16 + aSeed.w * 0.14) * uPx / -mv.z, 2.0, 16.0); vA = on * smoothstep(0.0, 1.0, h); }`,
        fragmentShader: `uniform vec3 uLight; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(mix(max(uLight, vec3(0.5)), vec3(1.0), 0.65), vA * smoothstep(0.5, 0.12, d)); }` });
      this.snow = new THREE.Points(g, this.snowMat); this.snow.frustumCulled = false; this.snow.renderOrder = 5; scene.add(this.snow); }
    // ---------------- 花瓣 / 落叶（同一组粒子，按季节换颜色）和萤火虫
    this.NM = LOW ? 260 : 520;
    { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.NM * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seeds(this.NM, 1), 4));
      this.moteMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { ...U, uAmt: { value: 0 }, uMode: { value: 0 } },
        vertexShader: `attribute vec4 aSeed; uniform float uTime, uAmt, uPx, uMode; uniform vec3 uC, uB; varying float vA; varying vec3 vCol; varying float vRot; ${WRAP}
          void main(){ vec3 B = vec3(uB.x * 0.7, min(uB.y, 22.0), uB.z * 0.7); vec3 p = wrapBox(aSeed.xyz, uC, B); float h = mod(aSeed.y * B.y - uTime * (0.9 + aSeed.w * 0.8), B.y); p.y = uC.y + h + 0.2;
            p.x += sin(uTime * 0.9 + aSeed.x * 50.0) * 1.6 + uTime * 0.6; p.z += cos(uTime * 0.7 + aSeed.z * 50.0) * 1.2; p.xz = uC.xz + mod(p.xz - uC.xz + B.xz * 0.5, B.xz) - B.xz * 0.5; float on = step(aSeed.w, uAmt);
            vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = on * clamp((0.26 + aSeed.x * 0.16) * uPx / -mv.z, 3.0, 22.0); vA = on * smoothstep(0.0, 1.0, h) * (1.0 - smoothstep(B.y * 0.8, B.y, h)); vRot = uTime * (1.0 + aSeed.z * 2.0) + aSeed.x * 6.28;
            float k = fract(aSeed.z * 7.0); vCol = uMode < 0.5 ? mix(vec3(1.0, 0.72, 0.82), vec3(1.0, 0.95, 0.96), step(0.6, k)) : (k < 0.35 ? vec3(0.95, 0.55, 0.12) : k < 0.7 ? vec3(0.98, 0.78, 0.2) : vec3(0.82, 0.3, 0.12)); }`,
        fragmentShader: `uniform vec3 uLight; uniform float uMode; varying float vA; varying vec3 vCol; varying float vRot;
          void main(){ vec2 q = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot); q = vec2(c * q.x - s * q.y, s * q.x + c * q.y); q.x *= uMode < 0.5 ? 1.6 : 2.2; float d = length(q); if (d > 0.42) discard;
            float vein = uMode > 0.5 ? smoothstep(0.03, 0.0, abs(q.y)) * 0.25 : 0.0; gl_FragColor = vec4(vCol * (0.75 + 0.25 * uLight) * (1.0 - vein), vA * 0.95); }` });
      this.motes = new THREE.Points(g, this.moteMat); this.motes.frustumCulled = false; this.motes.renderOrder = 5; scene.add(this.motes);
      this.flyMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, uniforms: { ...U, uAmt: { value: 0 } },
        vertexShader: `attribute vec4 aSeed; uniform float uTime, uAmt, uPx; uniform vec3 uC, uB; varying float vA; ${WRAP}
          void main(){ vec3 B = vec3(uB.x * 0.6, 4.0, uB.z * 0.6); vec3 p = wrapBox(aSeed.xyz, uC, B); p.y = uC.y + 0.5 + aSeed.y * 3.0 + sin(uTime * 0.8 + aSeed.x * 30.0) * 0.6;
            p.x += sin(uTime * 0.35 + aSeed.z * 20.0) * 2.0; p.z += cos(uTime * 0.3 + aSeed.x * 20.0) * 2.0; float on = step(aSeed.w, uAmt);
            vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float bl = smoothstep(0.2, 1.0, sin(uTime * (1.5 + aSeed.w * 2.0) + aSeed.y * 40.0));
            gl_PointSize = on * 0.9 * uPx / -mv.z; vA = on * bl; }`,
        fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.95, 0.45) * vA * (smoothstep(0.5, 0.0, d) + smoothstep(0.12, 0.0, d)), 1.0); }` });
      this.flies = new THREE.Points(g, this.flyMat); this.flies.frustumCulled = false; this.flies.renderOrder = 6; scene.add(this.flies); }
    // ---------------- 水洼和小池塘：不规则的反光水面 + 一圈湿泥；下雨时有涟漪
    { const g = new THREE.CircleGeometry(1.3, 48).rotateX(-PI / 2); this.NP = 24;
      this.padMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
        uniforms: { uTime: U.uTime, uLight: U.uLight, uTop: { value: new THREE.Color('#78b8f2') }, uHor: { value: new THREE.Color('#eaf6ff') }, uRain: { value: 0 }, uSnow: { value: 0 } },
        vertexShader: `attribute vec4 aP; varying vec2 vL; varying vec4 vP; varying vec3 vW; void main(){ vL = position.xz; vP = aP; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform float uTime, uRain, uSnow; uniform vec3 uLight, uTop, uHor; varying vec2 vL; varying vec4 vP; varying vec3 vW; ${HASH}
          void main(){ float a = atan(vL.y, vL.x), s = vP.x * 31.0; float edge = 1.0 + 0.1 * sin(a * 3.0 + s) + 0.06 * sin(a * 5.0 + s * 1.7) + 0.04 * sin(a * 9.0 + s * 0.3);
            float r = length(vL) / edge; if (r > 1.28) discard; float life = vP.y; float pond = vP.z;
            vec3 V = normalize(cameraPosition - vW); float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 1.6);
            vec3 sky = mix(uTop, uHor, clamp(fres * 1.2, 0.0, 1.0)); vec3 water = mix(sky, mix(vec3(0.18, 0.42, 0.5), vec3(0.3, 0.55, 0.62), pond), 0.35 + 0.25 * (1.0 - fres));
            float rip = 0.0; vec2 gg = vW.xz * 1.1; for (int k = 0; k < 2; k++) { vec2 id = floor(gg + float(k) * 0.5); vec2 f = fract(gg + float(k) * 0.5) - 0.5; float hh = h1(id + float(k) * 7.0); float ph = fract(uTime * (0.7 + hh * 0.5) + hh); rip += smoothstep(0.045, 0.0, abs(length(f - (hh - 0.5) * 0.3) - ph * 0.48)) * (1.0 - ph); }
            water += rip * 0.4 * uRain * vec3(1.0);
            water += smoothstep(0.2, 0.0, abs(vL.x * 0.6 + vL.y * 0.8 + 0.25)) * smoothstep(0.95, 0.4, r) * 0.18 * (1.0 - uRain); water += smoothstep(0.55, 0.0, abs(r - 0.6 + 0.05 * sin(uTime * 0.6 + s))) * 0.06 * (1.0 - uRain);
            water = mix(water, vec3(0.86, 0.92, 0.98), uSnow * 0.55 * (1.0 - pond));
            float inW = smoothstep(1.0, 0.93, r); vec3 mud = vec3(0.3, 0.24, 0.15); vec3 col = mix(mud, water, inW) * uLight;
            float al = mix(smoothstep(1.28, 1.0, r) * 0.42, 0.88, inW) * life; gl_FragColor = vec4(col, al);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }` });
      g.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(this.NP * 4), 4));
      this.pads = new THREE.InstancedMesh(g, this.padMat, this.NP); this.pads.count = 0; this.pads.frustumCulled = false; this.pads.renderOrder = 1; scene.add(this.pads); }
    this.puddles = []; this.ponds = [];
  }
  setDensity(k) { this.density = k; }
  setStruct(st) { this.puddles = st.puddles || []; this.ponds = (st.lots || []).filter(l => l.pond > 0).map(l => [l.id, l.x, l.z, l.pond]); }
  // w: { rain, snow, petals, leaves, flies, light(Color), top, hor, cover }；simT：模拟秒（算水洼干了多少）
  update(dt, t, camera, target, w, simT) {
    const U = this.U; U.uTime.value = t; const dist = camera.position.distanceTo(target);
    const bx = clamp(dist * 1.15, 34, 150), by = clamp(dist * 0.55, 20, 60); U.uB.value.set(bx, by, bx); U.uC.value.set(target.x, 0, target.z);
    U.uPx.value = innerHeight * Math.min(devicePixelRatio || 1, 2) / (2 * Math.tan(camera.fov * PI / 360));
    U.uLight.value.copy(w.light);
    const d = this.density;
    // 下雨时整体数量按强度；手机、鱼缸少一半
    this.rainMat.uniforms.uAmt.value = w.rain; this.rainMat.uniforms.uLen.value = clamp(by * 0.07, 1.2, 3.6); this.rain.visible = w.rain > 0.01; this.rain.geometry.setDrawRange(0, Math.floor(this.NR * d) * 2);
    this.snowMat.uniforms.uAmt.value = w.snow; this.snow.visible = w.snow > 0.01; this.snow.geometry.setDrawRange(0, Math.floor(this.NS * d));
    const m = Math.max(w.petals, w.leaves); this.moteMat.uniforms.uAmt.value = m; this.moteMat.uniforms.uMode.value = w.leaves > w.petals ? 1 : 0; this.motes.visible = m > 0.01; this.motes.geometry.setDrawRange(0, Math.floor(this.NM * d));
    this.flyMat.uniforms.uAmt.value = w.flies; this.flies.visible = w.flies > 0.01;
    // 水洼：快干的时候慢慢缩小
    const P = this.padMat.uniforms; P.uTop.value.copy(w.top); P.uHor.value.copy(w.hor); P.uRain.value = w.rain; P.uSnow.value = w.cover;
    const aP = this.pads.geometry.attributes.aP; let n = 0; const o = this._o || (this._o = new THREE.Object3D());
    const put = (id, x, z, r, life, pond) => { if (n >= this.NP || life <= 0.01) return; o.position.set(x, 0.03, z); o.rotation.set(0, (id * 1.7) % TAU, 0); const s = r * (0.55 + 0.45 * life); o.scale.set(s, 1, s); o.updateMatrix(); this.pads.setMatrixAt(n, o.matrix); aP.setXYZW(n, (id * 0.6180339) % 1, Math.min(1, life * 1.3), pond, 0); n++; };
    for (const p of this.puddles) { const [id, x, z, r, t0, until] = p; const grow = clamp((simT - t0) / 60, 0, 1); const dry = clamp((until - simT) / ((until - t0) * 0.3 + 1), 0, 1); put(id, x, z, r, Math.min(grow, dry), 0); }
    for (const p of this.ponds) put(p[0] + 100, p[1], p[2], p[3] * 1.05, 1, 1);
    this.pads.count = n; this.pads.visible = n > 0; if (n) { this.pads.instanceMatrix.needsUpdate = true; aP.needsUpdate = true; }
  }
}
