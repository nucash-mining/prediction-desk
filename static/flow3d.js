// 3D data-flow view: a solar system. The sun is CLV (closing line value): did the market move
// our way after each bet? It's the brains: it sets every stake and benches what loses to the
// market. The 8 pipeline stages orbit it as planets. Data hops planet to planet along curves bent
// by the sun's pull; every trade and exit sends a pulse back into the sun.
import * as THREE from './vendor/three.module.min.js';

const BG = 0x05070b;
const MOODS = {  // sun colour by verdict
  'beating the market': 0xffc23d, 'even with the market': 0xffa04d,
  'losing to the market': 0xff4d6d, 'no data': 0x8aa0c8,
};

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createFlow3D(host, stages) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'});
  } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(BG, 0);
  host.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y';

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 30, 80);
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 300);
  const tex = glowTexture();
  const world = new THREE.Group(); scene.add(world);

  // stars
  const sp = new Float32Array(1400 * 3);
  for (let i = 0; i < sp.length; i += 3) {
    const r = 40 + Math.random() * 60, a = Math.random() * Math.PI * 2, b = (Math.random() - .5) * Math.PI;
    sp[i] = r * Math.cos(a) * Math.cos(b); sp[i + 1] = r * Math.sin(b); sp[i + 2] = r * Math.sin(a) * Math.cos(b);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({color: 0x6b7a93, size: 0.12, transparent: true, opacity: 0.7})));

  // ---------- the sun ----------
  const sun = new THREE.Group(); world.add(sun);
  const sunCol = new THREE.Color(MOODS['no data']);
  const sunCore = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 3), new THREE.MeshBasicMaterial({color: sunCol}));
  const sunShell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1),
    new THREE.MeshBasicMaterial({color: sunCol, wireframe: true, transparent: true, opacity: 0.35}));
  const halos = [5.5, 8.5, 13].map((s, i) => {
    const h = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, color: sunCol, transparent: true,
      opacity: [0.75, 0.35, 0.14][i], blending: THREE.AdditiveBlending, depthWrite: false}));
    h.scale.setScalar(s); return h;
  });
  sun.add(sunCore, sunShell, ...halos);
  let sunHeat = 0, sunSize = 1, sunTarget = new THREE.Color(MOODS['no data']);
  const sunLabel = document.createElement('div'); sunLabel.className = 'f3l f3sun';
  sunLabel.innerHTML = '<b>CLV</b><i>—</i><u>waiting for scored bets</u>';
  sunLabel.style.setProperty('--k', '#ffc23d'); host.appendChild(sunLabel);

  // ---------- planets ----------
  const n = stages.length;
  const radius = i => 3.0 + i * 1.15;
  const planets = stages.map((s, i) => {
    const col = new THREE.Color(s.hex), g = new THREE.Group();
    const r = radius(i);
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
      Array.from({length: 160}, (_, k) => new THREE.Vector3(Math.cos(k / 160 * Math.PI * 2) * r, 0, Math.sin(k / 160 * Math.PI * 2) * r))),
      new THREE.LineBasicMaterial({color: col, transparent: true, opacity: 0.22}));
    world.add(ring);
    const size = 0.26 + (i % 3) * 0.05;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 2), new THREE.MeshBasicMaterial({color: col}));
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 1.7, 1),
      new THREE.MeshBasicMaterial({color: col, wireframe: true, transparent: true, opacity: 0.35}));
    const clvRing = new THREE.Mesh(new THREE.TorusGeometry(size * 2.3, 0.025, 8, 64),
      new THREE.MeshBasicMaterial({color: 0x8aa0c8, transparent: true, opacity: 0.0}));
    clvRing.rotation.x = Math.PI / 2.4;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, color: col, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false}));
    glow.scale.setScalar(size * 6);
    g.add(core, shell, clvRing, glow); world.add(g);
    // gravity tether: the sun holds every planet in orbit
    const tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({color: 0xffc23d, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending}));
    world.add(tether);
    const label = document.createElement('div'); label.className = 'f3l';
    label.innerHTML = `<b>${s.lbl}</b><i>0</i><u></u>`; label.style.setProperty('--k', s.hex); host.appendChild(label);
    return {g, core, shell, clvRing, glow, tether, label, r, phase: i * 2.399 + 0.3,
            speed: 0.55 * Math.pow(3.0 / r, 1.5), heat: 0, spin: 0.3 + Math.random() * 0.4, clv: null};
  });
  const pos = i => planets[i].g.position;

  // ---------- particles: head + fading tail ----------
  const TAIL = 5, MAX = 160, pool = [];
  for (let i = 0; i < MAX; i++) {
    const parts = [];
    for (let k = 0; k < TAIL; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0}));
      s.visible = false; s.scale.setScalar(0.5 - k * 0.07); world.add(s); parts.push(s);
    }
    pool.push({parts, on: false});
  }
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), vc = new THREE.Vector3(), tmp = new THREE.Vector3();
  // a path whose ends follow moving bodies, bowed toward the sun (its pull bends everything)
  function bezier(fromFn, toFn, pull) {
    return t => {
      fromFn(v0); toFn(v1);
      vc.copy(v0).add(v1).multiplyScalar(0.5).multiplyScalar(pull);
      vc.y += 0.6;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      return tmp.set(a * v0.x + b * vc.x + c * v1.x, a * v0.y + b * vc.y + c * v1.y, a * v0.z + b * vc.z + c * v1.z).clone();
    };
  }
  function spawn(getPoint, colorHex, dur, onDone) {
    const p = pool.find(x => !x.on); if (!p) return;
    Object.assign(p, {on: true, getPoint, t0: performance.now(), dur, onDone});
    p.parts.forEach((s, k) => { s.material.color.set(colorHex); s.material.opacity = 0.95 - k * 0.17; s.visible = true; });
  }
  function flyTo(stage) {
    const col = stages[stage].hex;
    if (stage === 0) {  // data arrives from deep space
      const a = Math.random() * Math.PI * 2, far = new THREE.Vector3(Math.cos(a) * 24, 6 + Math.random() * 6, Math.sin(a) * 24);
      spawn(bezier(o => o.copy(far), o => o.copy(pos(0)), 0.9), col, 1300, () => planets[0].heat = 1);
      return;
    }
    spawn(bezier(o => o.copy(pos(stage - 1)), o => o.copy(pos(stage)), 0.55), col, 800 + Math.random() * 250,
      () => planets[stage].heat = 1);
  }
  function toSun(stage) {  // a fill: energy back into the sun, which re-scores everything
    spawn(bezier(o => o.copy(pos(stage)), o => o.set(0, 0, 0), 0.9), stages[stage].hex, 1100, () => sunHeat = 1);
  }

  // ---------- drag to turn ----------
  let yaw = 0, pitch = 0, dragging = false, lx = 0, ly = 0, lastDrag = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    yaw += (e.clientX - lx) * 0.006; pitch = Math.max(-0.35, Math.min(0.6, pitch + (e.clientY - ly) * 0.004));
    lx = e.clientX; ly = e.clientY; lastDrag = performance.now();
  });
  el.addEventListener('pointerup', () => dragging = false);

  const R = radius(n - 1) + 0.8;
  function resize() {
    const w = host.clientWidth || 300, h = host.clientHeight || 200, aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // fit the outer orbit: full width, and the tilted (flattened) depth
    const dist = Math.max(R / (t * aspect), (R * 0.62) / t) * 1.02;
    const tilt = aspect < 1.5 ? 0.62 : 0.42;  // look down more on tall screens
    camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist);
    camera.lookAt(0, -0.3, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  const clock = new THREE.Clock(), proj = new THREE.Vector3();
  const place = (obj, label, dy) => {
    obj.getWorldPosition(proj); proj.y -= dy; proj.project(camera);
    const w = host.clientWidth, h = host.clientHeight;
    label.style.transform = `translate(-50%,0) translate(${(proj.x * .5 + .5) * w}px,${(-proj.y * .5 + .5) * h}px)`;
  };
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1), now = performance.now(), time = clock.elapsedTime;
    if (!dragging && now - lastDrag > 4000) { yaw *= 0.985; pitch *= 0.985; }
    world.rotation.y = yaw + time * 0.02;
    world.rotation.x = pitch;
    // sun: breathes, flares when a fill lands, colour eases toward its verdict
    sunHeat = Math.max(0, sunHeat - dt * 0.9);
    sunCol.lerp(sunTarget, 0.04);
    const pulse = 1 + Math.sin(time * 1.7) * 0.03 + sunHeat * 0.25;
    sunCore.scale.setScalar(sunSize * pulse); sunShell.scale.setScalar(sunSize * (1 + sunHeat * 0.15));
    sunShell.rotation.y += dt * 0.25; sunShell.rotation.x += dt * 0.1;
    halos.forEach((hh, i) => { hh.material.color.copy(sunCol); hh.scale.setScalar([5.5, 8.5, 13][i] * sunSize * (pulse + sunHeat * 0.2)); });
    sunCore.material.color.copy(sunCol); sunShell.material.color.copy(sunCol);
    planets.forEach((p, i) => {
      const a = p.phase + time * p.speed;
      p.g.position.set(Math.cos(a) * p.r, Math.sin(time * 0.8 + i) * 0.06, Math.sin(a) * p.r);
      p.heat = Math.max(0, p.heat - dt * 1.6);
      p.shell.rotation.y += dt * p.spin * (1 + p.heat * 4);
      p.core.scale.setScalar(1 + p.heat * 0.5);
      p.glow.material.opacity = 0.38 + p.heat * 0.62;
      p.tether.geometry.attributes.position.setXYZ(1, p.g.position.x, p.g.position.y, p.g.position.z);
      p.tether.geometry.attributes.position.needsUpdate = true;
      p.tether.material.color.copy(sunCol);
      p.tether.material.opacity = 0.05 + p.heat * 0.25 + (p.clv ? Math.min(0.2, p.clv.n / 200) : 0);
      p.clvRing.rotation.z += dt * 0.6;
    });
    for (const p of pool) {
      if (!p.on) continue;
      const t = (now - p.t0) / p.dur;
      if (t >= 1) { p.on = false; p.parts.forEach(s => s.visible = false); p.onDone && p.onDone(); continue; }
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      p.parts.forEach((s, k) => s.position.copy(p.getPoint(Math.max(0, e - k * 0.035))));
    }
    renderer.render(scene, camera);
    planets.forEach(p => place(p.g, p.label, 0.7));
    place(sun, sunLabel, 1.6 * sunSize);
  }
  frame();

  return {
    // an event reached `stage`: fly a particle in and update its label
    hit(stage, count, sub, fly = true) {
      const p = planets[stage]; if (!p) return;
      if (fly) flyTo(stage); else p.heat = Math.max(p.heat, 0.6);
      if (fly && (stages[stage].id === 'trades' || stages[stage].id === 'exits')) toSun(stage);
      p.label.querySelector('i').textContent = count.toLocaleString();
      if (sub) p.label.querySelector('u').textContent = sub;
    },
    // the sun: {clv_cents, n, t, mood, ...} from /api/state clv.sun
    setSun(s) {
      if (!s) return;
      sunTarget = new THREE.Color(MOODS[s.mood] || MOODS['no data']);
      sunSize = 0.85 + Math.min(0.7, Math.abs(s.t || 0) * 0.12) + Math.min(0.25, (s.n || 0) / 400);
      sunLabel.querySelector('i').textContent = s.n ? `${s.clv_cents >= 0 ? '+' : ''}${s.clv_cents.toFixed(1)}¢` : '—';
      sunLabel.querySelector('u').textContent = s.n ? `${s.mood} · ${s.n} bets · ${Math.round(s.beat * 100)}% beat it` : 'waiting for scored bets';
      sunLabel.style.setProperty('--k', '#' + sunTarget.getHexString());
    },
    // each planet's CLV ring: green when its bets beat the market, red when they don't
    setPlanets(byStage) {
      if (!byStage) return;
      stages.forEach((s, i) => {
        const c = byStage[s.id], p = planets[i]; p.clv = c;
        if (!c || !c.n) { p.clvRing.material.opacity = 0; return; }
        p.clvRing.material.color.set(c.clv_cents > 0 ? 0x22e39a : c.clv_cents < 0 ? 0xff4d6d : 0x8aa0c8);
        p.clvRing.material.opacity = 0.35 + Math.min(0.5, Math.abs(c.t) * 0.12);
      });
    },
  };
}
