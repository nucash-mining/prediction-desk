// 3D data-flow view: the bot's 8 pipeline stages as glowing nodes on a track.
// Every pipeline event sends a light particle from the previous stage to its stage
// (feed data falls in from the sky), and the stage it lands on flares up.
import * as THREE from './vendor/three.module.min.js';

const BG = 0x05070b;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// stage positions: one wavy line on wide screens, a snake of two rows on narrow ones
function layout(n, narrow) {
  if (!narrow) return Array.from({length: n}, (_, i) =>
    new THREE.Vector3(-14 + i * 4, Math.sin(i * 0.9) * 1.1, Math.cos(i * 0.75) * 2.2));
  const half = Math.ceil(n / 2);
  return Array.from({length: n}, (_, i) => {
    const row = i < half ? 0 : 1, k = row ? n - 1 - i : i;
    return new THREE.Vector3(-5.4 + k * 3.6, row ? -2.4 : 2.4, Math.sin(k * 1.3) * 1.2);
  });
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
  scene.fog = new THREE.Fog(BG, 22, 60);
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 200);
  const tex = glowTexture();
  const world = new THREE.Group(); scene.add(world);

  // floor grid + stars (built once)
  const grid = new THREE.GridHelper(90, 60, 0x1d2a40, 0x111a28);
  grid.position.y = -4.2; grid.material.transparent = true; grid.material.opacity = 0.55; scene.add(grid);
  const sp = new Float32Array(900 * 3);
  for (let i = 0; i < sp.length; i += 3) { sp[i] = (Math.random() - .5) * 120; sp[i + 1] = Math.random() * 40 - 6; sp[i + 2] = -Math.random() * 60 - 8; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({color: 0x6b7a93, size: 0.08, transparent: true, opacity: 0.6})));

  // labels (HTML, projected each frame)
  const labels = stages.map(s => {
    const d = document.createElement('div'); d.className = 'f3l';
    d.innerHTML = `<b>${s.lbl}</b><i>0</i><u></u>`; d.style.setProperty('--k', s.hex); host.appendChild(d); return d;
  });

  let nodes = [], curve = null, track = null, narrow = null, pts = [];
  const trackMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {time: {value: 0}, cols: {value: stages.map(s => new THREE.Color(s.hex))}},
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; uniform vec3 cols[${stages.length}]; varying vec2 vUv;
      void main(){
        float f = vUv.x * ${(stages.length - 1).toFixed(1)}; int i = int(floor(f));
        vec3 c = mix(cols[i], cols[min(i + 1, ${stages.length - 1})], fract(f));
        float dash = smoothstep(0.55, 1.0, fract(vUv.x * 60.0 - time * 0.9));
        gl_FragColor = vec4(c, 0.10 + 0.55 * dash);
      }`,
  });

  function build(isNarrow) {
    narrow = isNarrow;
    for (const n of nodes) world.remove(n.g);
    if (track) world.remove(track);
    pts = layout(stages.length, narrow);
    curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    track = new THREE.Mesh(new THREE.TubeGeometry(curve, 400, 0.07, 8, false), trackMat);
    world.add(track);
    nodes = stages.map((s, i) => {
      const col = new THREE.Color(s.hex), g = new THREE.Group(); g.position.copy(pts[i]);
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshBasicMaterial({color: col}));
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, 1),
        new THREE.MeshBasicMaterial({color: col, wireframe: true, transparent: true, opacity: 0.35}));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.022, 8, 72),
        new THREE.MeshBasicMaterial({color: col, transparent: true, opacity: 0.55}));
      ring.rotation.x = Math.PI / 2;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, color: col, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false}));
      glow.scale.setScalar(3.4);
      const beamH = pts[i].y + 4.2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, beamH, 6),
        new THREE.MeshBasicMaterial({color: col, transparent: true, opacity: 0.18}));
      beam.position.y = -beamH / 2;
      g.add(core, shell, ring, glow, beam); world.add(g);
      return {g, core, shell, ring, glow, heat: 0, spin: 0.3 + Math.random() * 0.4};
    });
  }

  // particle pool: head + fading tail sprites
  const TAIL = 5, MAX = 140;
  const pool = [];
  for (let i = 0; i < MAX; i++) {
    const parts = [];
    for (let k = 0; k < TAIL; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0}));
      s.visible = false; s.scale.setScalar(0.62 - k * 0.09); world.add(s); parts.push(s);
    }
    pool.push({parts, on: false});
  }
  const tmp = new THREE.Vector3();
  function spawn(stage, colorHex) {
    const p = pool.find(x => !x.on); if (!p) return;
    const end = pts[stage].clone();
    let path;
    if (stage === 0) {  // data falls in from the sky
      const a = end.clone().add(new THREE.Vector3((Math.random() - .5) * 14, 7 + Math.random() * 5, (Math.random() - .5) * 10));
      const mid = a.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 2, 0));
      path = new THREE.QuadraticBezierCurve3(a, mid, end);
    } else {
      const n = stages.length - 1, u0 = (stage - 1) / n, u1 = stage / n;
      path = {getPoint: t => curve.getPoint(u0 + (u1 - u0) * t, tmp.clone())};
    }
    Object.assign(p, {on: true, path, t0: performance.now(), dur: stage === 0 ? 1100 : 750 + Math.random() * 250, stage});
    p.parts.forEach((s, k) => { s.material.color.set(colorHex); s.material.opacity = 0.95 - k * 0.17; s.visible = true; });
  }

  // drag to turn the scene; it drifts back to a slow sway
  let yaw = 0, pitch = 0, dragging = false, lx = 0, ly = 0, lastDrag = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    yaw += (e.clientX - lx) * 0.006; pitch = Math.max(-0.35, Math.min(0.5, pitch + (e.clientY - ly) * 0.004));
    lx = e.clientX; ly = e.clientY; lastDrag = performance.now();
  });
  el.addEventListener('pointerup', () => dragging = false);

  function resize() {
    const w = host.clientWidth || 300, h = host.clientHeight || 200, aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    const isNarrow = aspect < 1.5;
    if (isNarrow !== narrow) build(isNarrow);
    const halfW = isNarrow ? 7.6 : 15.2, halfH = isNarrow ? 4.8 : 3.6;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(halfW / (t * aspect), halfH / t) + 4;
    camera.position.set(0, isNarrow ? 2.5 : 4.2, dist);
    camera.lookAt(0, isNarrow ? -0.2 : 0.2, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  const clock = new THREE.Clock();
  const proj = new THREE.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1), now = performance.now(), time = clock.elapsedTime;
    trackMat.uniforms.time.value = time;
    if (!dragging && now - lastDrag > 4000) { yaw *= 0.985; pitch *= 0.985; }
    world.rotation.y = yaw + Math.sin(time * 0.12) * 0.16;
    world.rotation.x = pitch + Math.sin(time * 0.09) * 0.03;
    for (const n of nodes) {
      n.heat = Math.max(0, n.heat - dt * 1.6);
      n.shell.rotation.y += dt * n.spin * (1 + n.heat * 4); n.shell.rotation.x += dt * 0.15;
      n.ring.rotation.z -= dt * 0.5 * (1 + n.heat * 3);
      const s = 1 + n.heat * 0.45; n.core.scale.setScalar(s); n.shell.scale.setScalar(1 + n.heat * 0.25);
      n.glow.material.opacity = 0.38 + n.heat * 0.62; n.glow.scale.setScalar(3.2 + n.heat * 2.6);
      n.g.position.y = pts[nodes.indexOf(n)].y + Math.sin(time * 1.2 + n.spin * 9) * 0.08;
    }
    for (const p of pool) {
      if (!p.on) continue;
      const t = (now - p.t0) / p.dur;
      if (t >= 1) { p.on = false; p.parts.forEach(s => s.visible = false); if (nodes[p.stage]) nodes[p.stage].heat = 1; continue; }
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      p.parts.forEach((s, k) => s.position.copy(p.path.getPoint(Math.max(0, e - k * 0.035))));
    }
    renderer.render(scene, camera);
    const w = host.clientWidth, h = host.clientHeight;
    nodes.forEach((n, i) => {
      n.g.getWorldPosition(proj); proj.y -= 1.25; proj.project(camera);
      labels[i].style.transform = `translate(-50%,0) translate(${(proj.x * .5 + .5) * w}px,${(-proj.y * .5 + .5) * h}px)`;
    });
  }
  frame();

  return {
    // an event reached `stage`: fly a particle in (unless asked not to) and update its label
    hit(stage, count, sub, fly = true) {
      if (!nodes[stage]) return;
      if (fly) spawn(stage, stages[stage].hex); else nodes[stage].heat = Math.max(nodes[stage].heat, 0.6);
      labels[stage].querySelector('i').textContent = count.toLocaleString();
      if (sub) labels[stage].querySelector('u').textContent = sub;
    },
  };
}
