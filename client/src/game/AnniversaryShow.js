// The anniversary finale — fired from the top of the Eiffel Tower (press Y).
// A plane sweeps across the night sky with a doppler jet roar, then fireworks
// bloom over Paris and spell out HAPPY 5TH ANNIVERSARY in the air. Built so
// it reads beautifully from the summit and from the ground, and so the
// partner sees the same show over the wire.
import * as THREE from "three";

const TWO_PI = Math.PI * 2;

// sample text into normalised points centred on (0,0); +y is up
function sampleText(lines, fontPx = 150) {
  const W = 1280, lineH = Math.round(fontPx * 1.55);
  const H = lineH * lines.length;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `900 ${fontPx}px "Arial Black", Arial, sans-serif`;
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, lineH * (i + 0.5)));
  const data = ctx.getImageData(0, 0, W, H).data;
  const pts = [];
  const stride = 6;
  for (let y = 0; y < H; y += stride) {
    for (let x = 0; x < W; x += stride) {
      if (data[(y * W + x) * 4] > 120) {
        pts.push([x / W - 0.5, 0.5 - y / H]); // [-0.5..0.5] x [-0.5..0.5]*(H/W)
      }
    }
  }
  return { pts, aspect: H / W };
}

export class AnniversaryShow {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.t = 0;
    this.group = null;
    this.plane = null;
    this.contrail = null;
    this.trailHead = 0;
    this.bursts = [];   // exploded particle spheres
    this.comets = [];   // rising streaks that turn into bursts
    this.textPts = null;
    this.textMeta = [];
    this.audioCtx = null;
    this._nextLaunch = 0;
  }

  // facingDir: unit vector pointing FROM the text TOWARD the viewer (the tower)
  start(textCenter, facingDir) {
    this.clear();
    this.active = true;
    this.t = 0;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const up = new THREE.Vector3(0, 1, 0);
    const fwd = facingDir.clone().setY(0).normalize(); // toward viewer
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    this.center = textCenter.clone();
    this.up = up; this.fwd = fwd; this.right = right;

    this._buildText();
    this._buildPlane();
    this._planeRoar();
    this._nextLaunch = 4.3; // fireworks begin as the plane clears the view
  }

  // ---------------------------------------------------------------- text
  // The letters are written by FIREWORKS: the text is split into vertical
  // regions; each region's shell bursts in turn and its sparks fly out then
  // home into the letter shapes, then glow and twinkle like settling embers.
  _buildText() {
    const { pts, aspect } = sampleText(["HAPPY 5TH", "ANNIVERSARY"]);
    const TW = 150;                 // text width in metres
    const N = pts.length;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    this.textMeta = new Array(N);
    const xs = pts.map((p) => p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    // bright, varied firework colours, one per region
    const fwCols = [
      [1.0, 0.82, 0.32], [1.0, 0.35, 0.55], [0.42, 0.78, 1.0], [0.55, 1.0, 0.62],
      [0.78, 0.5, 1.0], [1.0, 0.62, 0.28], [1.0, 1.0, 0.85], [1.0, 0.45, 0.45],
      [0.5, 0.9, 1.0], [1.0, 0.78, 0.4],
    ];
    const NR = 9;                   // regions burst left→right
    this.regionBursts = [];
    for (let r = 0; r < NR; r++) {
      this.regionBursts.push({
        t: 4.7 + r * 0.5,           // staggered burst times
        col: fwCols[r % fwCols.length],
        origin: this.center.clone()
          .addScaledVector(this.right, ((r + 0.5) / NR - 0.5) * TW)
          .addScaledVector(this.up, 6),
        launched: false,
      });
    }
    for (let i = 0; i < N; i++) {
      const [u, v] = pts[i];
      const target = this.center.clone()
        .addScaledVector(this.right, u * TW)
        .addScaledVector(this.up, v * TW * aspect + 6);
      const frac = (u - minX) / (maxX - minX || 1);
      const region = Math.min(NR - 1, Math.floor(frac * NR));
      const rb = this.regionBursts[region];
      // scatter: where this spark flies on the initial explosion (decays to 0)
      const u2 = Math.random() * 2 - 1, th = Math.random() * TWO_PI, rr = Math.sqrt(1 - u2 * u2);
      const spread = 9 + Math.random() * 7;
      const scatter = new THREE.Vector3(rr * Math.cos(th) * spread, u2 * spread, rr * Math.sin(th) * spread);
      this.textMeta[i] = {
        target, origin: rb.origin, scatter,
        ignite: rb.t + Math.random() * 0.1,
        form: 0.75 + Math.random() * 0.35,
        col: rb.col,
        tw: Math.random() * TWO_PI,
        rest: target.y,
        drift: 1.5 + Math.random() * 2,
      };
      positions.set([rb.origin.x, rb.origin.y, rb.origin.z], i * 3);
      colors.set([0, 0, 0], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.1, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.textPts = new THREE.Points(geo, mat);
    this.group.add(this.textPts);
  }

  // --------------------------------------------------------------- plane
  _buildPlane() {
    const p = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: 0xf0f2f5, emissive: 0x223044, emissiveIntensity: 0.4 });
    const fuse = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 9, 6, 12).rotateZ(Math.PI / 2), body);
    p.add(fuse);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 12).rotateZ(-Math.PI / 2), body);
    nose.position.x = 6.2; p.add(nose);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 17), body);
    p.add(wing);
    const tailW = new THREE.Mesh(new THREE.BoxGeometry(2, 0.25, 7), body);
    tailW.position.x = -5; p.add(tailW);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 0.25), body);
    fin.position.set(-5, 1.6, 0); p.add(fin);
    // blinking nav lights
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
    red.position.set(0, 0, -8.5); p.add(red);
    const grn = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0x39ff7a }));
    grn.position.set(0, 0, 8.5); p.add(grn);
    this.planeLights = [red, grn];
    p.scale.setScalar(1.6);
    this.plane = p;
    this.group.add(p);

    // flight path: sweep across the view (along right), slightly nearer the
    // viewer than the text, a bit above it
    const span = 360;
    this.planeFrom = this.center.clone()
      .addScaledVector(this.right, -span)
      .addScaledVector(this.fwd, 60)
      .addScaledVector(this.up, 26);
    this.planeTo = this.center.clone()
      .addScaledVector(this.right, span)
      .addScaledVector(this.fwd, 60)
      .addScaledVector(this.up, 26);
    this.planeDur = 6.0;
    // contrail: a fading ribbon of points behind the plane
    const TN = 90;
    const tp = new Float32Array(TN * 3);
    const tc = new Float32Array(TN * 3);
    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute("position", new THREE.BufferAttribute(tp, 3));
    tgeo.setAttribute("color", new THREE.BufferAttribute(tc, 3));
    this.contrail = new THREE.Points(tgeo, new THREE.PointsMaterial({
      size: 2.2, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.contrailN = TN;
    this.group.add(this.contrail);
  }

  // ---------------------------------------------------------- jet sound
  _planeRoar() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.audioCtx = ctx;
      const now = ctx.currentTime;
      const dur = 6.0;
      // turbulent noise → bandpass that doppler-shifts as the plane passes
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(190, now);
      bp.frequency.linearRampToValueAtTime(560, now + dur * 0.46); // approach (higher)
      bp.frequency.linearRampToValueAtTime(150, now + dur);        // recede (lower)
      const rumble = ctx.createOscillator(); rumble.type = "sawtooth";
      rumble.frequency.setValueAtTime(70, now);
      rumble.frequency.linearRampToValueAtTime(120, now + dur * 0.46);
      rumble.frequency.linearRampToValueAtTime(52, now + dur);
      const rg = ctx.createGain(); rg.gain.value = 0.12;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0008, now);
      gain.gain.exponentialRampToValueAtTime(0.55, now + dur * 0.46); // loudest at closest pass
      gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);
      src.connect(bp); bp.connect(gain);
      rumble.connect(rg); rg.connect(gain);
      gain.connect(ctx.destination);
      src.start(now); src.stop(now + dur);
      rumble.start(now); rumble.stop(now + dur);
    } catch { /* audio optional */ }
  }

  // ----------------------------------------------------------- fireworks
  _launchBurst(at, big = false) {
    const colors = [0xff6b9d, 0xffd76b, 0x7bdcff, 0xc77bff, 0xff9d6b, 0x8dffb0, 0xffffff];
    const color = colors[(Math.random() * colors.length) | 0];
    const N = big ? 180 : 120;
    const pos = new Float32Array(N * 3);
    const vels = [];
    for (let i = 0; i < N; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      const u = Math.random() * 2 - 1;
      const th = Math.random() * TWO_PI;
      const r = Math.sqrt(1 - u * u);
      const sp = (big ? 20 : 14) + Math.random() * (big ? 16 : 12);
      vels.push(new THREE.Vector3(r * Math.cos(th) * sp, u * sp, r * Math.sin(th) * sp));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color, size: big ? 2.4 : 1.9, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    this.bursts.push({ points, vels, mat, life: 0, ttl: 2.6 });
  }

  // a comet that rises from below then bursts at its apex
  _launchComet() {
    const target = this.center.clone()
      .addScaledVector(this.right, (Math.random() - 0.5) * 180)
      .addScaledVector(this.up, 20 + Math.random() * 45)
      .addScaledVector(this.fwd, (Math.random() - 0.5) * 50);
    const from = target.clone();
    from.y = (this.center.y - 220) + Math.random() * 40; // launch from well below
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([from.x, from.y, from.z]), 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfff1c4, size: 3, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const head = new THREE.Points(geo, mat);
    this.group.add(head);
    this.comets.push({ head, mat, from, target, life: 0, dur: 0.9 + Math.random() * 0.3 });
  }

  // ------------------------------------------------------------- update
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t;

    // --- plane sweep + contrail ---
    if (this.plane) {
      const k = Math.min(1, t / this.planeDur);
      const pos = this.planeFrom.clone().lerp(this.planeTo, k);
      this.plane.position.copy(pos);
      this.plane.rotation.y = Math.atan2(this.right.x, this.right.z) - Math.PI / 2;
      this.plane.visible = k < 1;
      // blink nav lights
      const blink = (Math.sin(t * 7) > 0.4) ? 1 : 0.15;
      this.planeLights[0].material.opacity = blink;
      this.planeLights[1].material.opacity = blink;
      // push a contrail sample behind the plane
      if (k < 1) {
        const ap = this.contrail.geometry.attributes.position;
        const ac = this.contrail.geometry.attributes.color;
        const tail = pos.clone().addScaledVector(this.right, -6);
        this.trailHead = (this.trailHead + 1) % this.contrailN;
        ap.setXYZ(this.trailHead, tail.x, tail.y, tail.z);
        ac.setXYZ(this.trailHead, 0.9, 0.95, 1.0);
        // fade the whole trail
        for (let i = 0; i < this.contrailN; i++) {
          ac.setXYZ(i, ac.getX(i) * 0.97, ac.getY(i) * 0.97, ac.getZ(i) * 0.97);
        }
        ap.needsUpdate = true; ac.needsUpdate = true;
      }
    }

    // --- a steady barrage of celebratory fireworks around the text ---
    if (t > 3.8 && t < 17) {
      this._nextLaunch -= dt;
      if (this._nextLaunch <= 0) {
        this._nextLaunch = 0.32 + Math.random() * 0.32;
        this._launchComet();
        if (Math.random() < 0.6) this._launchComet();
        if (Math.random() < 0.3) this._launchComet();
      }
    }

    // --- comets rising → burst at apex ---
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      c.life += dt;
      const k = c.life / c.dur;
      const p = c.from.clone().lerp(c.target, Math.min(1, k));
      p.y += Math.sin(Math.min(1, k) * Math.PI) * 6; // gentle arc
      c.head.geometry.attributes.position.setXYZ(0, p.x, p.y, p.z);
      c.head.geometry.attributes.position.needsUpdate = true;
      c.mat.opacity = 1;
      if (k >= 1) {
        this._launchBurst(c.target, Math.random() < 0.35);
        this.group.remove(c.head);
        c.head.geometry.dispose(); c.mat.dispose();
        this.comets.splice(i, 1);
      }
    }

    // --- exploded bursts: gravity + drag + fade ---
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const f = this.bursts[i];
      f.life += dt;
      const pa = f.points.geometry.attributes.position;
      for (let p = 0; p < f.vels.length; p++) {
        const v = f.vels[p];
        v.y -= 9 * dt;
        v.multiplyScalar(1 - dt * 0.9);
        pa.setXYZ(p, pa.getX(p) + v.x * dt, pa.getY(p) + v.y * dt, pa.getZ(p) + v.z * dt);
      }
      pa.needsUpdate = true;
      f.mat.opacity = Math.max(0, 1 - (f.life / f.ttl) ** 1.5);
      if (f.life >= f.ttl) {
        this.group.remove(f.points);
        f.points.geometry.dispose(); f.mat.dispose();
        this.bursts.splice(i, 1);
      }
    }

    // --- per-region launch shells: a comet rises to each region just before
    // its letters burst into being ---
    if (this.regionBursts) {
      for (const rb of this.regionBursts) {
        if (!rb.launched && t >= rb.t - 0.9 && t < rb.t) {
          rb.launched = true;
          const from = rb.origin.clone(); from.y = this.center.y - 200;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([from.x, from.y, from.z]), 3));
          const mat = new THREE.PointsMaterial({
            color: new THREE.Color(rb.col[0], rb.col[1], rb.col[2]), size: 3.2,
            transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
          });
          const head = new THREE.Points(geo, mat);
          this.group.add(head);
          this.comets.push({ head, mat, from, target: rb.origin.clone(), life: 0, dur: 0.85 });
        }
      }
    }

    // --- the text: each spark explodes out of its region shell, homes into
    // its letter, then glows + twinkles; finally drifts down and fades ---
    if (this.textPts) {
      const ca = this.textPts.geometry.attributes.color;
      const pa = this.textPts.geometry.attributes.position;
      const FADE_START = 15.5, FADE_DUR = 3.5;
      const tmp = new THREE.Vector3();
      let anyLit = false;
      for (let i = 0; i < this.textMeta.length; i++) {
        const m = this.textMeta[i];
        let b = 0;
        if (t >= m.ignite) {
          const age = t - m.ignite;
          if (age < m.form) {
            // EXPLODE → FORM: ease from the burst origin out (scatter) and in
            // to the letter target
            const k = age / m.form;
            const ease = 1 - Math.pow(1 - k, 3);            // easeOutCubic
            tmp.copy(m.origin).lerp(m.target, ease);
            tmp.addScaledVector(m.scatter, Math.sin(k * Math.PI) * (1 - ease)); // bloom then snap in
            pa.setXYZ(i, tmp.x, tmp.y, tmp.z);
            b = 1.6;                                          // bright spark while forming
          } else {
            // settled ember: soft glow + firework twinkle
            const sa = age - m.form;
            const glow = 0.55 + Math.exp(-sa * 3) * 0.5;
            const twinkle = 0.72 + 0.28 * Math.sin(t * 6.2 + m.tw);
            b = glow * twinkle;
            let y = m.rest;
            if (t > FADE_START) {
              const fk = Math.min(1, (t - FADE_START) / FADE_DUR);
              b *= 1 - fk;
              y = m.rest - fk * m.drift * 7; // embers drift down as they die
            }
            pa.setXYZ(i, m.target.x, y, m.target.z);
          }
          if (b > 0.02) anyLit = true;
        }
        ca.setXYZ(i, m.col[0] * b, m.col[1] * b, m.col[2] * b);
      }
      ca.needsUpdate = true;
      pa.needsUpdate = true;
      if (t > FADE_START + FADE_DUR && !anyLit && !this.bursts.length && !this.comets.length) {
        this.clear();
      }
    }
  }

  clear() {
    if (this.group) {
      this.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => m.dispose());
        }
      });
      this.scene.remove(this.group);
    }
    if (this.audioCtx) { try { this.audioCtx.close(); } catch { /* */ } this.audioCtx = null; }
    this.group = null; this.plane = null; this.contrail = null;
    this.textPts = null; this.textMeta = [];
    this.bursts = []; this.comets = [];
    this.active = false;
    this.t = 0;
  }
}
