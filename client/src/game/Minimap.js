// Circular minimap (top-right) with a google-maps-style route line.
// Roads come straight from the city bake; the route is A* over the real
// road graph, so "turn left at Scientia Boulevard" is a real instruction.
export class Minimap {
  constructor() {
    this.el = document.getElementById("minimap");
    this.canvas = document.getElementById("minimap-canvas");
    this.label = document.getElementById("minimap-label");
    this.ctx = this.canvas.getContext("2d");
    this.size = this.canvas.width; // square, css-clipped to a circle
    this.world = null;
    this.base = null;        // offscreen canvas: all roads, north-up
    this.mpp = 3;            // meters per pixel of the base canvas
    this.view = 110;         // meters of world shown across the circle (walk)
    this.dest = null;        // {x, z, label}
    this.route = null;       // [[x,z], ...] polyline player → dest
    this.routeT = 0;
    this.graph = null;
    this.heading = 0;
  }

  // ------------------------------------------------------- world handling
  setWorld(data, theme, dest) {
    this.world = data;
    this.dest = dest ?? null;
    this.route = null;
    this.routeT = 0;
    this.graph = null;
    if (!data) { this.el.style.display = "none"; return; }
    this.el.style.display = "block";
    this._renderBase(theme);
    this._setLabel();
  }

  setDest(dest) {
    this.dest = dest;
    this.route = null;
    this.routeT = 0;
    this._setLabel();
  }

  _setLabel(extra = "") {
    this.label.textContent = this.dest ? `➤ ${this.dest.label}${extra}` : "";
  }

  _renderBase(theme) {
    const R = this.world.radius + 300;
    this.mpp = R > 1600 ? 4 : 2.5;
    const px = Math.ceil((R * 2) / this.mpp);
    const c = document.createElement("canvas");
    c.width = c.height = px;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#1c2620";          // ground
    ctx.fillRect(0, 0, px, px);
    // water
    ctx.fillStyle = "#1d3a4d";
    for (const w of this.world.water ?? []) {
      ctx.beginPath();
      w.p.forEach(([x, z], i) => {
        const [cx, cy] = this._toBase(x, z, R);
        i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy);
      });
      ctx.closePath(); ctx.fill();
    }
    // parks
    ctx.fillStyle = "#24402a";
    for (const g of this.world.green ?? []) {
      if (!g.p || g.p.length < 3) continue;
      ctx.beginPath();
      g.p.forEach(([x, z], i) => {
        const [cx, cy] = this._toBase(x, z, R);
        i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy);
      });
      ctx.closePath(); ctx.fill();
    }
    // buildings: faint blocks so neighborhoods read like a map
    ctx.fillStyle = "rgba(150,160,170,0.16)";
    for (const b of this.world.buildings ?? []) {
      if (!b.p || b.p.length < 3) continue;
      ctx.beginPath();
      b.p.forEach(([x, z], i) => {
        const [cx, cy] = this._toBase(x, z, R);
        i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy);
      });
      ctx.closePath(); ctx.fill();
    }
    // roads on top
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const pass of [0, 1]) {
      for (const r of this.world.roads ?? []) {
        const big = r.w >= 8;
        if ((pass === 0) !== !big) continue; // small roads first, big on top
        ctx.strokeStyle = big ? "#c8cdd4" : "#79818c";
        ctx.lineWidth = Math.max(1.1, r.w / this.mpp);
        ctx.beginPath();
        r.p.forEach(([x, z], i) => {
          const [cx, cy] = this._toBase(x, z, R);
          i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy);
        });
        ctx.stroke();
      }
    }
    this.base = c;
    this.baseR = R;
  }

  _toBase(x, z, R) { return [(x + R) / this.mpp, (z + R) / this.mpp]; }

  // ----------------------------------------------------------- routing
  _buildGraph() {
    // nodes are quantized road points; edges follow each polyline.
    const nodes = new Map(); // key → {x, z, adj: [{k, len}]}
    const keyOf = (x, z) => `${Math.round(x)},${Math.round(z)}`;
    const getNode = (x, z) => {
      const k = keyOf(x, z);
      let n = nodes.get(k);
      if (!n) { n = { k, x, z, adj: [] }; nodes.set(k, n); }
      return n;
    };
    for (const r of this.world.roads ?? []) {
      if (r.w < 3) continue; // footpaths clutter driving routes
      for (let i = 1; i < r.p.length; i++) {
        const a = getNode(r.p[i - 1][0], r.p[i - 1][1]);
        const b = getNode(r.p[i][0], r.p[i][1]);
        if (a === b) continue;
        const len = Math.hypot(a.x - b.x, a.z - b.z);
        a.adj.push({ k: b.k, len, w: r.w });
        b.adj.push({ k: a.k, len, w: r.w });
      }
    }
    this.graph = nodes;
  }

  _nearestNode(x, z) {
    let best = null, bd = Infinity;
    for (const n of this.graph.values()) {
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  _computeRoute(px, pz) {
    if (!this.dest) { this.route = null; return; }
    if (!this.graph) this._buildGraph();
    const start = this._nearestNode(px, pz);
    const goal = this._nearestNode(this.dest.x, this.dest.z);
    if (!start || !goal) { this.route = null; return; }
    // A* with a binary heap — recomputing mid-drive must never hitch a frame
    const g = new Map([[start.k, 0]]);
    const came = new Map();
    const h = (n) => Math.hypot(n.x - goal.x, n.z - goal.z);
    const heap = [[h(start), start.k]]; // [f, key]
    const push = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    // small streets are for the first/last mile only — never a shortcut
    // between main roads (a car can't thread a kampung alley)
    const nearEnds = (n) =>
      Math.hypot(n.x - px, n.z - pz) < 220 ||
      Math.hypot(n.x - this.dest.x, n.z - this.dest.z) < 220;
    const done = new Set();
    let found = false, guard = 0;
    while (heap.length && guard++ < 120000) {
      const [, curK] = pop();
      if (curK === goal.k) { found = true; break; }
      if (done.has(curK)) continue;
      done.add(curK);
      const curG = g.get(curK);
      const curN = this.graph.get(curK);
      for (const e of curN.adj) {
        const slow = e.w >= 8 ? 1 : e.w >= 5.5 ? 1.25 : nearEnds(curN) ? 1.6 : 30;
        const ng = curG + e.len * slow;
        if (ng < (g.get(e.k) ?? Infinity)) {
          came.set(e.k, curK);
          g.set(e.k, ng);
          push([ng + h(this.graph.get(e.k)), e.k]);
        }
      }
    }
    if (!found) { this.route = null; return; }
    const pts = [];
    let k = goal.k;
    while (k) { const n = this.graph.get(k); pts.push([n.x, n.z]); k = came.get(k); }
    pts.push([px, pz]);
    pts.reverse();
    pts.push([this.dest.x, this.dest.z]);
    this.route = pts;
  }

  // squared distance from the player to the route (checked against a few
  // nearest points — good enough to know "still on track")
  _offRoute(px, pz) {
    if (!this.route) return true;
    let best = Infinity;
    for (const [x, z] of this.route) {
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d < best) best = d;
    }
    return best > 45 * 45;
  }

  // drop route points already behind us so the line doesn't trail backwards
  _trimRoute(px, pz) {
    if (!this.route || this.route.length < 3) return;
    let bi = 0, bd = Infinity;
    const scan = Math.min(this.route.length, 30);
    for (let i = 0; i < scan; i++) {
      const [x, z] = this.route[i];
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi > 0) this.route.splice(0, bi);
  }

  routeDistance(px, pz) {
    if (!this.route) return null;
    let d = 0;
    for (let i = 1; i < this.route.length; i++) {
      d += Math.hypot(this.route[i][0] - this.route[i - 1][0], this.route[i][1] - this.route[i - 1][1]);
    }
    return d + Math.hypot(this.route[0][0] - px, this.route[0][1] - pz);
  }

  // ---------------------------------------------------------------- frame
  update(dt, px, pz, heading, driving, partner) {
    if (!this.base) return;
    // zoom out smoothly when driving
    const wantView = driving ? 300 : 120;
    this.view += (wantView - this.view) * Math.min(1, dt * 2);
    this.heading = heading;

    // follow the route cheaply; only re-run A* when we've left it
    this.routeT -= dt;
    if (this.dest && this.routeT <= 0) {
      this.routeT = 2;
      if (this._offRoute(px, pz)) this._computeRoute(px, pz);
      else this._trimRoute(px, pz);
      const d = this.routeDistance(px, pz);
      if (d !== null) {
        this._setLabel(d > 60 ? ` · ${d >= 950 ? (d / 1000).toFixed(1) + " km" : Math.round(d / 10) * 10 + " m"}` : " · you're here! ✨");
      } else {
        this._setLabel("");
      }
    }

    const { ctx, size } = this;
    const half = size / 2;
    const scale = size / this.view;            // px per meter on screen
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    // rotate so "up" is where you're heading
    ctx.translate(half, half);
    ctx.rotate(this.heading);                  // world yaw → screen
    const bs = scale * this.mpp;               // screen px per base px
    const bx = (px + this.baseR) / this.mpp, bz = (pz + this.baseR) / this.mpp;
    ctx.drawImage(
      this.base,
      bx - (half * 1.6) / bs, bz - (half * 1.6) / bs, (size * 1.6) / bs, (size * 1.6) / bs,
      -half * 1.6, -half * 1.6, size * 1.6, size * 1.6
    );

    const toScreen = (x, z) => [(x - px) * scale, (z - pz) * scale];

    // route line
    if (this.route) {
      ctx.strokeStyle = "#4da3ff";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      let started = false;
      for (const [x, z] of this.route) {
        const [sx, sz] = toScreen(x, z);
        if (!started) { ctx.moveTo(sx, sz); started = true; }
        else ctx.lineTo(sx, sz);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // destination pin (or edge chevron when out of view)
    if (this.dest) {
      const [dx, dz] = toScreen(this.dest.x, this.dest.z);
      const dd = Math.hypot(dx, dz);
      if (dd < half - 14) {
        ctx.fillStyle = "#ff6b9d";
        ctx.beginPath(); ctx.arc(dx, dz, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(dx, dz, 2.4, 0, Math.PI * 2); ctx.fill();
      } else {
        const a = Math.atan2(dz, dx);
        const ex = Math.cos(a) * (half - 12), ez = Math.sin(a) * (half - 12);
        ctx.save();
        ctx.translate(ex, ez); ctx.rotate(a);
        ctx.fillStyle = "#ff6b9d";
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-4, -6); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    // partner dot
    if (partner) {
      const [ox, oz] = toScreen(partner.x, partner.z);
      if (Math.hypot(ox, oz) < half - 10) {
        ctx.fillStyle = "#c9b8ff";
        ctx.beginPath(); ctx.arc(ox, oz, 4.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // you: fixed arrow at center pointing up
    ctx.save();
    ctx.translate(half, half);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // north tick
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(this.heading);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", 0, -half + 13);
    ctx.restore();
  }

  hide() { this.el.style.display = "none"; }
}
