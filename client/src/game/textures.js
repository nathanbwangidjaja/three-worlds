// Procedural canvas textures: building facades with real window grids,
// roofs, asphalt with lane markings, sidewalks, grass, clouds.
// One facade tile = 4 window columns × 4 floors, repeated across walls
// with meter-scaled UVs. facadeTexture returns {map, emissive} — the
// emissive map holds only the warmly lit windows so night cities glow.
import * as THREE from "three";

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}

function finish(c, { repeat = true } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

const rngFactory = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------------------------------------------------------------- facades
export function facadeTexture({
  base = "#9a6a4e",
  noise = 0.06,
  brick = null,            // {mortar?, rows?}
  stone = false,           // horizontal banding (haussmann)
  glassTop = "#cfe4f2",
  glassBottom = "#5a7488",
  frame = "rgba(40,32,28,0.9)",
  lit = 0,                 // 0..1 chance a window is warmly lit
  shutters = false,
  balconies = false,
  bigWindows = false,      // office/glassy style
  seed = 7,
} = {}) {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const [ec, ectx] = canvas(S, S);
  const rnd = rngFactory(seed);

  // base wall
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, S, S);

  // subtle grime/noise
  for (let i = 0; i < 2600; i++) {
    const v = (rnd() - 0.5) * 2 * noise;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 2 + rnd() * 3);
  }

  // brick courses
  if (brick) {
    ctx.strokeStyle = brick.mortar || "rgba(225,215,205,0.30)";
    ctx.lineWidth = 1.5;
    const rows = brick.rows || 40;
    const rh = S / rows;
    for (let r = 0; r < rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * rh); ctx.lineTo(S, r * rh); ctx.stroke();
      const off = (r % 2) * rh * 1.6;
      for (let x = off; x < S; x += rh * 3.2) {
        ctx.beginPath(); ctx.moveTo(x, r * rh); ctx.lineTo(x, (r + 1) * rh); ctx.stroke();
      }
    }
  }

  // haussmann stone banding + cornice line per floor
  if (stone) {
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.lineWidth = 2;
    for (let y = 0; y < S; y += S / 18) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    for (let r = 0; r < 4; r++) ctx.fillRect(0, r * (S / 4) + S / 4 - 7, S, 4);
  }

  // window grid: 4 cols × 4 floors per tile
  const COLS = 4, ROWS = 4;
  const cw = S / COLS, rh2 = S / ROWS;
  const ww = cw * (bigWindows ? 0.62 : 0.44);
  const wh = rh2 * (bigWindows ? 0.62 : 0.55);
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const x = col * cw + (cw - ww) / 2;
      const y = row * rh2 + rh2 * 0.20;
      const isLit = rnd() < lit;

      // recessed shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x - 3, y - 3, ww + 6, wh + 8);

      if (isLit) {
        const g = ctx.createLinearGradient(0, y, 0, y + wh);
        g.addColorStop(0, "#ffeec2");
        g.addColorStop(1, "#f4b46a");
        ctx.fillStyle = g;
      } else {
        const g = ctx.createLinearGradient(0, y, 0, y + wh);
        g.addColorStop(0, glassTop);
        g.addColorStop(1, glassBottom);
        ctx.fillStyle = g;
      }
      ctx.fillRect(x, y, ww, wh);

      // emissive: only lit windows, slightly inset so the frame stays dark
      if (isLit) {
        const eg = ectx.createLinearGradient(0, y, 0, y + wh);
        eg.addColorStop(0, "#ffdf9e");
        eg.addColorStop(1, "#e89a4e");
        ectx.fillStyle = eg;
        ectx.fillRect(x + 1, y + 1, ww - 2, wh - 2);
      }

      // mullions
      ctx.strokeStyle = frame;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, ww, wh);
      ctx.beginPath();
      ctx.moveTo(x + ww / 2, y); ctx.lineTo(x + ww / 2, y + wh);
      if (!bigWindows) { ctx.moveTo(x, y + wh * 0.45); ctx.lineTo(x + ww, y + wh * 0.45); }
      ctx.stroke();

      // sill highlight
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(x - 4, y + wh + 2, ww + 8, 3);

      if (shutters) {
        ctx.fillStyle = "rgba(72,82,86,0.6)";
        ctx.fillRect(x - 8, y, 6, wh);
        ctx.fillRect(x + ww + 2, y, 6, wh);
      }
      if (balconies) {
        ctx.strokeStyle = "rgba(22,22,26,0.85)";
        ctx.lineWidth = 1.5;
        for (let bx = x - 6; bx <= x + ww + 6; bx += 4) {
          ctx.beginPath(); ctx.moveTo(bx, y + wh + 4); ctx.lineTo(bx, y + wh + 13); ctx.stroke();
        }
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x - 8, y + wh + 4); ctx.lineTo(x + ww + 8, y + wh + 4); ctx.stroke();
      }
    }
  }
  return { map: finish(c), emissive: lit > 0 ? finish(ec) : null };
}

// ground-floor storefront band: big glass windows, doors, sign boards and
// awnings in varied colors. One tile = 2 shopfronts (~12 m).
export function storefrontTexture({
  wall = "#5a5048",
  signColors = ["#7a3a36", "#2e4a5e", "#3a5a3c", "#6e5430", "#52384e"],
  awningColors = ["#a8443c", "#3e6048", "#44587a", "#8a6a34"],
  glassTop = "#cfe0e8",
  glassBottom = "#3c4a54",
  night = false,
  seed = 51,
} = {}) {
  const S = 512, H = 256;
  const [c, ctx] = canvas(S, H);
  const [ec, ectx] = canvas(S, H);
  const rnd = rngFactory(seed);

  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, S, H);
  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, S, H);
  for (let i = 0; i < 900; i++) {
    const v = (rnd() - 0.5) * 0.1;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * S, rnd() * H, 2, 3);
  }

  // two shopfronts per tile
  for (let s = 0; s < 2; s++) {
    const x0 = s * S / 2;
    const w = S / 2;
    // sign band
    const sign = signColors[Math.floor(rnd() * signColors.length)];
    ctx.fillStyle = sign;
    ctx.fillRect(x0 + 8, 18, w - 16, 42);
    ctx.fillStyle = "rgba(255,245,225,0.85)";
    // fake lettering blocks
    let lx = x0 + 26;
    while (lx < x0 + w - 40) {
      const lw = 8 + rnd() * 22;
      ctx.fillRect(lx, 32, lw, 13);
      lx += lw + 9;
    }
    if (night) {
      ectx.fillStyle = "rgba(255,220,160,0.7)";
      ectx.fillRect(x0 + 8, 18, w - 16, 42);
    }

    // awning (striped)
    const aw = awningColors[Math.floor(rnd() * awningColors.length)];
    ctx.fillStyle = aw;
    ctx.fillRect(x0 + 4, 62, w - 8, 26);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    for (let st = x0 + 4; st < x0 + w - 8; st += 22) ctx.fillRect(st, 62, 11, 26);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(x0 + 4, 84, w - 8, 4);

    // big glass window + door
    const gy = 96, gh = H - gy - 14;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x0 + 10, gy - 3, w - 20, gh + 8);
    const g = ctx.createLinearGradient(0, gy, 0, gy + gh);
    if (night) {
      g.addColorStop(0, "#ffe2ae");
      g.addColorStop(1, "#c98e4e");
    } else {
      g.addColorStop(0, glassTop);
      g.addColorStop(1, glassBottom);
    }
    ctx.fillStyle = g;
    ctx.fillRect(x0 + 12, gy, w - 24, gh);
    if (night) {
      const eg = ectx.createLinearGradient(0, gy, 0, gy + gh);
      eg.addColorStop(0, "#e8c084");
      eg.addColorStop(1, "#9a6a36");
      ectx.fillStyle = eg;
      ectx.fillRect(x0 + 12, gy, w - 24, gh);
    }
    // mullions + door
    ctx.strokeStyle = "rgba(25,22,20,0.9)";
    ctx.lineWidth = 4;
    ctx.strokeRect(x0 + 12, gy, w - 24, gh);
    ctx.beginPath();
    ctx.moveTo(x0 + 12 + (w - 24) * 0.62, gy);
    ctx.lineTo(x0 + 12 + (w - 24) * 0.62, gy + gh);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x0 + 12, gy + gh * 0.5);
    ctx.lineTo(x0 + 12 + (w - 24) * 0.62, gy + gh * 0.5);
    ctx.stroke();
  }
  return { map: finish(c), emissive: night ? finish(ec) : null };
}

// plaster wall with door + small windows + base trim (tropical homes).
// One tile ≈ one story of a small house.
export function houseWallTexture({ base = "#ece2cc", trim = "#b8a888", seed = 3 } = {}) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rnd = rngFactory(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const v = (rnd() - 0.5) * 0.12;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(80,60,40,${-v})`;
    ctx.fillRect(rnd() * S, rnd() * S, 3, 3);
  }
  const win = (x, y, w, h) => {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x - 2, y - 2, w + 4, h + 6);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#b8c8c0"); g.addColorStop(1, "#5c6e64");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(60,45,30,0.9)";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
  };
  win(28, 110, 54, 66);
  win(174, 110, 54, 66);
  // door
  ctx.fillStyle = "#6b4a2e";
  ctx.fillRect(106, 100, 46, 112);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 3;
  ctx.strokeRect(106, 100, 46, 112);
  // base trim
  ctx.fillStyle = trim;
  ctx.fillRect(0, 214, S, 42);
  return { map: finish(c), emissive: null };
}

// --------------------------------------------------- architectural styles
// modern panel grid: precast vertical piers + glass + dark spandrel bands
// (Proto, Tech Square, gray residential towers)
export function panelGridTexture({
  panel = "#d8d8d2",
  pier = "#c8c8c0",
  spandrel = "#3a3f45",
  glassTop = "#b8ccd8",
  glassBottom = "#46606e",
  pierWidth = 0.16,          // fraction of each bay that is solid pier
  accent = null,             // e.g. bronze stripe color
  lit = 0,
  seed = 101,
} = {}) {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const [ec, ectx] = canvas(S, S);
  const rnd = rngFactory(seed);
  ctx.fillStyle = panel;
  ctx.fillRect(0, 0, S, S);
  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) {
    const v = (rnd() - 0.5) * 0.06;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * S, rnd() * S, 2, 3);
  }
  const COLS = 4, ROWS = 4;
  const cw = S / COLS, rh = S / ROWS;
  const pw = cw * pierWidth;
  for (let col = 0; col < COLS; col++) {
    // pier stripes
    ctx.fillStyle = pier;
    ctx.fillRect(col * cw, 0, pw / 2, S);
    ctx.fillRect((col + 1) * cw - pw / 2, 0, pw / 2, S);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(col * cw + pw / 2 - 2, 0, 2, S);
    ctx.fillRect((col + 1) * cw - pw / 2, 0, 2, S);
    if (accent && col % 2 === 1) {
      ctx.fillStyle = accent;
      ctx.fillRect(col * cw + pw / 2 - 6, 0, 4, S);
    }
    for (let row = 0; row < ROWS; row++) {
      const x = col * cw + pw / 2 + 3;
      const w = cw - pw - 6;
      const y = row * rh;
      // spandrel band
      ctx.fillStyle = spandrel;
      ctx.fillRect(x, y + rh * 0.74, w, rh * 0.26);
      // window
      const wy = y + rh * 0.06, wh = rh * 0.64;
      const isLit = rnd() < lit;
      const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
      if (isLit) { g.addColorStop(0, "#ffeec2"); g.addColorStop(1, "#f0b066"); }
      else { g.addColorStop(0, glassTop); g.addColorStop(1, glassBottom); }
      ctx.fillStyle = g;
      ctx.fillRect(x, wy, w, wh);
      if (isLit) {
        ectx.fillStyle = "#f4c684";
        ectx.fillRect(x, wy, w, wh);
      }
      ctx.strokeStyle = "rgba(20,24,28,0.85)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, wy, w, wh);
      ctx.beginPath();
      ctx.moveTo(x + w / 2, wy); ctx.lineTo(x + w / 2, wy + wh);
      ctx.stroke();
    }
  }
  return { map: finish(c), emissive: lit > 0 ? finish(ec) : null };
}

// full glass curtain wall with fine mullion grid + sky reflection streaks
export function curtainWallTexture({
  glassTop = "#a8c8da",
  glassBottom = "#3c5868",
  mullion = "rgba(30,38,44,0.9)",
  tintBands = true,
  lit = 0,
  seed = 113,
} = {}) {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const [ec, ectx] = canvas(S, S);
  const rnd = rngFactory(seed);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, glassTop);
  g.addColorStop(1, glassBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, S, S);
  // diagonal sky reflections
  if (tintBands) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 5; i++) {
      const x = rnd() * S;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 90, 0);
      ctx.lineTo(x - 60, S);
      ctx.lineTo(x - 150, S);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  const ROWS = 4, COLS = 8;
  const rh = S / ROWS, cw = S / COLS;
  for (let row = 0; row <= ROWS; row++) {
    ctx.fillStyle = mullion;
    ctx.fillRect(0, row * rh - 2.5, S, 5);
    // spandrel shadow under each floor line
    ctx.fillStyle = "rgba(15,20,25,0.32)";
    ctx.fillRect(0, row * rh - 12, S, 10);
  }
  for (let col = 0; col <= COLS; col++) {
    ctx.fillStyle = mullion;
    ctx.fillRect(col * cw - 1.5, 0, 3, S);
  }
  // some lit offices
  if (lit > 0) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (rnd() < lit) {
          const eg = ectx.createLinearGradient(0, row * rh, 0, (row + 1) * rh);
          eg.addColorStop(0, "#f8d294");
          eg.addColorStop(1, "#c08a4a");
          ectx.fillStyle = eg;
          ectx.fillRect(col * cw + 2, row * rh + 3, cw - 4, rh - 14);
          ctx.fillStyle = "rgba(255,220,150,0.55)";
          ctx.fillRect(col * cw + 2, row * rh + 3, cw - 4, rh - 14);
        }
      }
    }
  }
  return { map: finish(c), emissive: lit > 0 ? finish(ec) : null };
}

// horizontal ribbon bands: precast strips alternating with window strips
// (Merkin/Broad, Whitehead, lab buildings)
export function ribbonBandTexture({
  band = "#9a8870",
  bandDark = "rgba(0,0,0,0.18)",
  glassTop = "#9cb4c2",
  glassBottom = "#3a4e58",
  bandRatio = 0.42,
  seed = 127,
} = {}) {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rnd = rngFactory(seed);
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2200; i++) {
    const v = (rnd() - 0.5) * 0.1;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  const ROWS = 4;
  const rh = S / ROWS;
  for (let row = 0; row < ROWS; row++) {
    const gy = row * rh, gh = rh * (1 - bandRatio);
    const g = ctx.createLinearGradient(0, gy, 0, gy + gh);
    g.addColorStop(0, glassTop);
    g.addColorStop(1, glassBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, gy, S, gh);
    // window verticals
    ctx.strokeStyle = "rgba(25,30,34,0.7)";
    ctx.lineWidth = 2;
    for (let x = 0; x < S; x += S / 14) {
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + gh); ctx.stroke();
    }
    // band shadows
    ctx.fillStyle = bandDark;
    ctx.fillRect(0, gy + gh, S, 4);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(0, gy + gh + 4, S, 3);
  }
  return { map: finish(c), emissive: null };
}

// parking garage: open horizontal slots with thin slat lines + columns
export function garageTexture({ base = "#9aa0a2", slot = "#23282c", seed = 131 } = {}) {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rnd = rngFactory(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) {
    const v = (rnd() - 0.5) * 0.08;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  const ROWS = 4;
  const rh = S / ROWS;
  for (let row = 0; row < ROWS; row++) {
    const gy = row * rh + rh * 0.16, gh = rh * 0.52;
    ctx.fillStyle = slot;
    ctx.fillRect(0, gy, S, gh);
    // slat lines
    ctx.strokeStyle = "rgba(160,166,168,0.5)";
    ctx.lineWidth = 2;
    for (let y = gy + 6; y < gy + gh; y += 9) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }
    // edge highlight
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(0, gy + gh, S, 4);
  }
  // columns
  for (let x = 0; x < S; x += S / 4) {
    ctx.fillStyle = base;
    ctx.fillRect(x - 7, 0, 14, S);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(x + 5, 0, 3, S);
  }
  return { map: finish(c), emissive: null };
}

// ------------------------------------------------------------------ roofs
export function roofTexture({ tile = "#a8503a", dark = "#7e3826", rows = 16, seed = 5 } = {}) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rnd = rngFactory(seed);
  ctx.fillStyle = tile;
  ctx.fillRect(0, 0, S, S);
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = `rgba(0,0,0,${0.18 + rnd() * 0.1})`;
    ctx.fillRect(0, r * rh + rh * 0.7, S, rh * 0.3);
    const off = (r % 2) * rh;
    for (let x = off; x < S; x += rh * 2) {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, r * rh); ctx.lineTo(x, (r + 1) * rh); ctx.stroke();
    }
  }
  return finish(c);
}

export function flatRoofTexture({ base = "#6e6862", seed = 11 } = {}) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rnd = rngFactory(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) {
    const v = (rnd() - 0.5) * 0.14;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  // a few AC units / vents as darker squares
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    const x = rnd() * S * 0.8, y = rnd() * S * 0.8, s = 10 + rnd() * 16;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + 2, y + 2, s - 4, 3);
  }
  return finish(c);
}

// ------------------------------------------------------------------ roads
// u runs along the road (1 tile ≈ 12 m), v across.
export function asphaltTexture({ base = "#3c3e44", line = "rgba(225,215,185,0.6)", centerLine = true } = {}) {
  const W = 256, H = 128;
  const [c, ctx] = canvas(W, H);
  const rnd = rngFactory(17);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2400; i++) {
    const v = (rnd() - 0.5) * 0.12;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  if (centerLine) {
    ctx.fillStyle = line;
    ctx.fillRect(W * 0.08, H / 2 - 2, W * 0.5, 4); // dashed
  }
  // edge wear
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(0, 0, W, 7);
  ctx.fillRect(0, H - 7, W, 7);
  return finish(c);
}

export function sidewalkTexture({ base = "#969188" } = {}) {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rnd = rngFactory(23);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 800; i++) {
    const v = (rnd() - 0.5) * 0.1;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
  return finish(c);
}

// ----------------------------------------------------------------- ground
export function grassTexture({ base = "#5f7c44", blade = "#6f9050" } = {}) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rnd = rngFactory(31);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 5600; i++) {
    ctx.fillStyle = rnd() > 0.5 ? blade : `rgba(0,0,0,${0.05 + rnd() * 0.07})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1.5, 2 + rnd() * 3);
  }
  return finish(c);
}

// iron fence: thin vertical pickets with transparent gaps + rails
export function fenceTexture({ color = "#2c3530" } = {}) {
  const W = 256, H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = color;
  // top + bottom rails
  ctx.fillRect(0, 2, W, 5);
  ctx.fillRect(0, H - 10, W, 5);
  // pickets
  for (let x = 4; x < W; x += 11) {
    ctx.fillRect(x, 0, 3, H);
  }
  return finish(c);
}

// ------------------------------------------------------------ tower lattice
// X-braced iron truss with transparent gaps.
export function latticeTexture({ color = "#4a3c2c", thickness = 7 } = {}) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = thickness * 1.6;
  ctx.strokeRect(2, 2, S - 4, S - 4);
  ctx.lineWidth = thickness;
  for (let gx = 0; gx < 2; gx++) {
    for (let gy = 0; gy < 2; gy++) {
      const x0 = gx * S / 2, y0 = gy * S / 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + S / 2, y0 + S / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0 + S / 2, y0); ctx.lineTo(x0, y0 + S / 2); ctx.stroke();
    }
  }
  ctx.lineWidth = thickness * 1.2;
  ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
  return finish(c);
}

// ------------------------------------------------------------------ misc
export function cloudTexture(seed = 41) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rnd = rngFactory(seed);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = S * 0.18 + rnd() * S * 0.64;
    const y = S * 0.38 + rnd() * S * 0.26;
    const r = 16 + rnd() * 44;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return finish(c, { repeat: false });
}

export function glowTexture(inner = "rgba(255,240,200,0.95)", outer = "rgba(255,200,120,0)") {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, "0.45)"));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c, { repeat: false });
}
