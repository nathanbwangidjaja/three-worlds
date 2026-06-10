// Procedural canvas textures: building facades with real window grids,
// roofs, asphalt with lane markings, sidewalks. One tile = 4 window
// columns × 4 floors, repeated across walls with meter-scaled UVs.
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
  tex.anisotropy = 4;
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
// style: { base, brick?, mortarAlpha?, win:{frame, glassDay|glassNight}, litChance, balcony? }
export function facadeTexture({
  base = "#9a6a4e",
  noise = 0.06,
  brick = null,            // {color2, rows}
  stone = false,           // horizontal banding (haussmann)
  glassTop = "#cfe4f2",    // window glass gradient top
  glassBottom = "#5a7488",
  frame = "rgba(40,32,28,0.9)",
  lit = 0,                 // 0..1 chance a window is warmly lit (night cities)
  shutters = false,
  balconies = false,
  seed = 7,
} = {}) {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rnd = rngFactory(seed);

  // base wall
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // subtle per-pixel noise via random translucent specks
  for (let i = 0; i < 2600; i++) {
    const v = (rnd() - 0.5) * 2 * noise;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 2 + rnd() * 3);
  }

  // brick courses
  if (brick) {
    ctx.strokeStyle = brick.mortar || "rgba(225,215,205,0.35)";
    ctx.lineWidth = 1.5;
    const rows = brick.rows || 36;
    const rh = S / rows;
    for (let r = 0; r < rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * rh); ctx.lineTo(S, r * rh); ctx.stroke();
      const off = (r % 2) * rh * 1.6;
      for (let x = off; x < S; x += rh * 3.2) {
        ctx.beginPath(); ctx.moveTo(x, r * rh); ctx.lineTo(x, (r + 1) * rh); ctx.stroke();
      }
    }
  }

  // haussmann stone banding
  if (stone) {
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.lineWidth = 2;
    for (let y = 0; y < S; y += S / 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }
  }

  // window grid: 4 cols × 4 floors per tile
  const COLS = 4, ROWS = 4;
  const cw = S / COLS, rh2 = S / ROWS;
  const ww = cw * 0.44, wh = rh2 * 0.55; // window size
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const x = col * cw + (cw - ww) / 2;
      const y = row * rh2 + rh2 * 0.22;

      // shadow / reveal
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x - 3, y - 3, ww + 6, wh + 8);

      const isLit = rnd() < lit;
      if (isLit) {
        const g = ctx.createLinearGradient(0, y, 0, y + wh);
        g.addColorStop(0, "#ffe9b8");
        g.addColorStop(1, "#f4b46a");
        ctx.fillStyle = g;
      } else {
        const g = ctx.createLinearGradient(0, y, 0, y + wh);
        g.addColorStop(0, glassTop);
        g.addColorStop(1, glassBottom);
        ctx.fillStyle = g;
      }
      ctx.fillRect(x, y, ww, wh);

      // mullions
      ctx.strokeStyle = frame;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, ww, wh);
      ctx.beginPath();
      ctx.moveTo(x + ww / 2, y); ctx.lineTo(x + ww / 2, y + wh);
      ctx.moveTo(x, y + wh * 0.45); ctx.lineTo(x + ww, y + wh * 0.45);
      ctx.stroke();

      // sill
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(x - 4, y + wh + 2, ww + 8, 3);

      if (shutters) {
        ctx.fillStyle = "rgba(60,70,60,0.55)";
        ctx.fillRect(x - 7, y, 5, wh);
        ctx.fillRect(x + ww + 2, y, 5, wh);
      }
      if (balconies && row % 2 === 0) {
        ctx.strokeStyle = "rgba(20,20,24,0.8)";
        ctx.lineWidth = 1.5;
        for (let bx = x - 6; bx <= x + ww + 6; bx += 4) {
          ctx.beginPath(); ctx.moveTo(bx, y + wh + 5); ctx.lineTo(bx, y + wh + 14); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(x - 8, y + wh + 5); ctx.lineTo(x + ww + 8, y + wh + 5); ctx.stroke();
      }
    }
  }
  return finish(c);
}

// simple gable-end / plaster wall with door + small windows (tropical homes)
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
  // two windows + a door per tile
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
  win(30, 120, 52, 64);
  win(174, 120, 52, 64);
  // door
  ctx.fillStyle = "#6b4a2e";
  ctx.fillRect(108, 110, 44, 100);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.strokeRect(108, 110, 44, 100);
  // trim line at base
  ctx.fillStyle = trim;
  ctx.fillRect(0, 218, S, 38);
  return finish(c);
}

// ------------------------------------------------------------------ roofs
export function roofTexture({ tile = "#a8503a", dark = "#7e3826", rows = 18, seed = 5 } = {}) {
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
      ctx.lineWidth = 1.2;
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
  for (let i = 0; i < 1600; i++) {
    const v = (rnd() - 0.5) * 0.14;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  return finish(c);
}

// ------------------------------------------------------------------ roads
// u runs along the road (1 unit = ~12 m), v across.
export function asphaltTexture({ base = "#3c3e44", line = "rgba(220,210,180,0.55)", centerLine = true } = {}) {
  const W = 256, H = 128;
  const [c, ctx] = canvas(W, H);
  const rnd = rngFactory(17);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2200; i++) {
    const v = (rnd() - 0.5) * 0.12;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  if (centerLine) {
    ctx.fillStyle = line;
    ctx.fillRect(0, H / 2 - 2, W * 0.55, 4); // dashed: painted over 55% of tile
  }
  // edge wear
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, W, 6);
  ctx.fillRect(0, H - 6, W, 6);
  return finish(c);
}

export function sidewalkTexture({ base = "#8d8a82" } = {}) {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rnd = rngFactory(23);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) {
    const v = (rnd() - 0.5) * 0.1;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 2;
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
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = rnd() > 0.5 ? blade : `rgba(0,0,0,${0.05 + rnd() * 0.07})`;
    const x = rnd() * S, y = rnd() * S;
    ctx.fillRect(x, y, 1.5, 2 + rnd() * 3);
  }
  return finish(c);
}

// ------------------------------------------------------------ tower lattice
// X-braced iron truss with transparent gaps — the cheap trick that makes
// the Eiffel Tower read as real latticework.
export function latticeTexture({ color = "#3d3328", thickness = 7 } = {}) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  // frame
  ctx.lineWidth = thickness * 1.6;
  ctx.strokeRect(2, 2, S - 4, S - 4);
  // X braces, 2×2 per tile
  ctx.lineWidth = thickness;
  for (let gx = 0; gx < 2; gx++) {
    for (let gy = 0; gy < 2; gy++) {
      const x0 = gx * S / 2, y0 = gy * S / 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + S / 2, y0 + S / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0 + S / 2, y0); ctx.lineTo(x0, y0 + S / 2); ctx.stroke();
    }
  }
  // horizontal chords
  ctx.lineWidth = thickness * 1.2;
  ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
  const tex = finish(c);
  return tex;
}

// ------------------------------------------------------------------ misc
export function cloudTexture() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rnd = rngFactory(41);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = S * 0.2 + rnd() * S * 0.6;
    const y = S * 0.35 + rnd() * S * 0.3;
    const r = 18 + rnd() * 42;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return finish(c, { repeat: false });
}

export function glowTexture(inner = "rgba(255,240,200,0.9)", outer = "rgba(255,200,120,0)") {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c, { repeat: false });
}
