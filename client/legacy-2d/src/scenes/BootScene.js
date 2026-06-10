import Phaser from "phaser";

const DIRS = ["down", "up", "side"];
const ROLES = ["you", "her"];
const TARGET_SPRITE_HEIGHT = 96;

// Defensive: always normalize any incoming sprite canvas to TARGET_SPRITE_HEIGHT
// regardless of what removeBackgroundAndTrim returns.
function normalizeSize(canvasOrImg) {
  const srcW = canvasOrImg.width || canvasOrImg.naturalWidth;
  const srcH = canvasOrImg.height || canvasOrImg.naturalHeight;
  if (srcH <= TARGET_SPRITE_HEIGHT + 4) return canvasOrImg; // already small enough
  const scale = TARGET_SPRITE_HEIGHT / srcH;
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false; // crisp pixels
  ctx.drawImage(canvasOrImg, 0, 0, srcW, srcH, 0, 0, outW, outH);
  return out;
}

// Flood-fill remove the background color (connected from corners),
// then crop transparent borders. Returns a canvas element Phaser can use as a texture.
function removeBackgroundAndTrim(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const w = canvas.width, h = canvas.height;
  const id = ctx.getImageData(0, 0, w, h);
  const data = id.data;

  // Sample average corner color (skip transparent pixels)
  const samples = [];
  const cornerIndices = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  for (const ci of cornerIndices) {
    if (data[ci + 3] > 200) samples.push([data[ci], data[ci + 1], data[ci + 2]]);
  }
  if (samples.length === 0) return canvas; // already transparent
  const bg = [0, 0, 0];
  for (const s of samples) { bg[0] += s[0]; bg[1] += s[1]; bg[2] += s[2]; }
  bg[0] /= samples.length; bg[1] /= samples.length; bg[2] /= samples.length;

  // Skip processing if the background isn't near-uniform light/white (avoid breaking transparent images)
  // Heuristic: only treat as removable background if it's clearly opaque and not mid-tone
  const isLight = bg[0] > 220 && bg[1] > 220 && bg[2] > 220;
  if (!isLight) {
    // Still trim, but don't recolor
  }

  const tol = 24;
  const visited = new Uint8Array(w * h);
  // Seed BFS from every border pixel that matches the bg color
  const queue = [];
  let qi = 0;
  for (let x = 0; x < w; x++) {
    queue.push(x);
    queue.push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    queue.push(y * w);
    queue.push(y * w + (w - 1));
  }

  if (isLight) {
    while (qi < queue.length) {
      const idx = queue[qi++];
      if (visited[idx]) continue;
      const di = idx * 4;
      if (data[di + 3] < 10) { visited[idx] = 1; continue; }
      if (Math.abs(data[di] - bg[0]) > tol || Math.abs(data[di + 1] - bg[1]) > tol || Math.abs(data[di + 2] - bg[2]) > tol) continue;
      visited[idx] = 1;
      data[di + 3] = 0;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0) queue.push(idx - 1);
      if (x < w - 1) queue.push(idx + 1);
      if (y > 0) queue.push(idx - w);
      if (y < h - 1) queue.push(idx + w);
    }
    ctx.putImageData(id, 0, 0);
  }

  // Trim transparent borders
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas;
  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;

  // Pre-scale to target in-game size so Phaser doesn't have to scale at runtime
  // (which breaks physics body math). Target ~96px tall, width proportional.
  const TARGET_H = 96;
  const scale = TARGET_H / th;
  const finalW = Math.max(1, Math.round(tw * scale));
  const finalH = Math.max(1, Math.round(th * scale));
  const out = document.createElement("canvas");
  out.width = finalW;
  out.height = finalH;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = false; // crisp pixels
  octx.drawImage(canvas, minX, minY, tw, th, 0, 0, finalW, finalH);
  return out;
}

// Variant for landmarks: bg-flood-fill + trim, but NO scale-down.
// Phaser scales these via setDisplaySize, so we keep native resolution.
function removeBackgroundForLandmark(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const w = canvas.width, h = canvas.height;
  const id = ctx.getImageData(0, 0, w, h);
  const data = id.data;

  // Sample corner colors
  const samples = [];
  const cornerIndices = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  for (const ci of cornerIndices) {
    if (data[ci + 3] > 200) samples.push([data[ci], data[ci + 1], data[ci + 2]]);
  }
  if (samples.length === 0) {
    // Already transparent — just return as-is, no trim needed
    return canvas;
  }
  const bg = [0, 0, 0];
  for (const s of samples) { bg[0] += s[0]; bg[1] += s[1]; bg[2] += s[2]; }
  bg[0] /= samples.length; bg[1] /= samples.length; bg[2] /= samples.length;
  const isLight = bg[0] > 220 && bg[1] > 220 && bg[2] > 220;

  if (isLight) {
    const tol = 28;
    const visited = new Uint8Array(w * h);
    const queue = [];
    let qi = 0;
    for (let x = 0; x < w; x++) {
      queue.push(x);
      queue.push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      queue.push(y * w);
      queue.push(y * w + (w - 1));
    }
    while (qi < queue.length) {
      const idx = queue[qi++];
      if (visited[idx]) continue;
      const di = idx * 4;
      if (data[di + 3] < 10) { visited[idx] = 1; continue; }
      if (Math.abs(data[di] - bg[0]) > tol || Math.abs(data[di + 1] - bg[1]) > tol || Math.abs(data[di + 2] - bg[2]) > tol) continue;
      visited[idx] = 1;
      data[di + 3] = 0;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0) queue.push(idx - 1);
      if (x < w - 1) queue.push(idx + 1);
      if (y > 0) queue.push(idx - w);
      if (y < h - 1) queue.push(idx + w);
    }
    ctx.putImageData(id, 0, 0);
  }

  // Trim transparent borders
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas;
  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  out.getContext("2d").drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
  return out;
}

export class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }

  create() {
    // Always create placeholder textures synchronously.
    for (const r of ROLES) {
      const color = r === "you" ? 0x6ec1e4 : 0xffb6c1;
      for (const d of DIRS) {
        this.makePlaceholder(`${r}-${d}`, color);
      }
    }

    // Lazy-load room backgrounds (optional — game falls back to procedural floors if missing)
    this.tryLoadRoom("hub");
    for (let y = 1; y <= 5; y++) this.tryLoadRoom(`year-${y}`);
    this.tryLoadRoom("finale");

    // Lazy-load landmark sprites (overlay on tile maps)
    ["castle", "tomorrowland", "fantasyland", "western", "pirates", "statue", "churroCart"]
      .forEach((k) => this.tryLoadLandmark(k));

    // Preload the Tiny Town tileset (used for tile-based year zones)
    this.load.spritesheet("tt-tiles", "/assets/tilesets/tiny_town.png", {
      frameWidth: 16, frameHeight: 16,
    });
    // Kenney RPG Urban Pack — denser city-style tiles: cobblestone, fences,
    // lampposts, benches, fountains, modern NPCs. 27 cols × 18 rows = 486 tiles.
    this.load.spritesheet("urban-tiles", "/assets/tilesets/urban.png", {
      frameWidth: 16, frameHeight: 16,
    });
    // Themed NPCs from Kaetram (OPL license — credit added in hub)
    const npcs = ["king", "oldlady", "beachnpc", "fairynpc", "bluebikinigirlnpc", "boxingman"];
    npcs.forEach((n) => {
      this.load.image(`npc-${n}`, `/assets/npcs/${n}.png`);
    });
    this.load.once("complete", () => {
      window.dispatchEvent(new CustomEvent("tiles-loaded"));
    });
    this.load.start();

    // Memory point marker
    const g = this.add.graphics();
    g.fillStyle(0xfff4b0, 1);
    g.fillCircle(8, 8, 6);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeCircle(8, 8, 6);
    g.generateTexture("memory-dot", 16, 16);
    g.destroy();

    // Portal marker
    const p = this.add.graphics();
    p.fillStyle(0xffffff, 0.15);
    p.fillRect(0, 0, 48, 48);
    p.lineStyle(2, 0xfff4b0, 1);
    p.strokeRect(1, 1, 46, 46);
    p.generateTexture("portal", 48, 48);
    p.destroy();

    // Now try to load real sprites in the background. If they load, swap the texture.
    this.tryUpgradeSprites();

    this.scene.start("hub");
  }

  tryLoadRoom(key) {
    const img = new Image();
    img.onload = () => {
      try {
        if (this.textures.exists(`room-${key}`)) this.textures.remove(`room-${key}`);
        this.textures.addImage(`room-${key}`, img);
        window.dispatchEvent(new CustomEvent("room-loaded", { detail: { key } }));
      } catch (e) {}
    };
    img.onerror = () => {};
    img.src = `/assets/rooms/${key}.png`;
  }

  tryLoadLandmark(key) {
    const img = new Image();
    img.onload = () => {
      try {
        const tKey = `landmark-${key}`;
        // Flood-fill remove the white background but keep native resolution
        // (Phaser scales to display size).
        const processed = removeBackgroundForLandmark(img);
        if (this.textures.exists(tKey)) this.textures.remove(tKey);
        this.textures.addImage(tKey, processed);
        window.dispatchEvent(new CustomEvent("landmark-loaded", { detail: { key: tKey } }));
      } catch (e) { console.warn("landmark process failed", key, e); }
    };
    img.onerror = () => {};
    img.src = `/assets/landmarks/${key}.png`;
  }

  tryUpgradeSprites() {
    for (const r of ROLES) {
      for (const d of DIRS) {
        for (const variant of ["", "-step"]) {
          const key = `${r}-${d}${variant}`;
          const url = `/assets/sprites/${r}-${d}${variant}.png`;
          const img = new Image();
          img.onload = () => {
            try {
              const processed = removeBackgroundAndTrim(img);
              const normalized = normalizeSize(processed);
              if (this.textures.exists(key)) this.textures.remove(key);
              this.textures.addImage(key, normalized);
              window.dispatchEvent(new CustomEvent("texture-upgrade", { detail: { key } }));
            } catch (e) { console.warn("sprite process failed", key, e); }
          };
          img.onerror = () => {};
          img.src = url;
        }
      }
    }
  }

  makePlaceholder(key, color) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(4, 8, 16, 20, 4);
    g.fillStyle(0xffe0bd, 1);
    g.fillCircle(12, 8, 6);
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(6, 2, 12, 5);
    g.lineStyle(1, 0x000000, 0.4);
    g.strokeRoundedRect(4, 8, 16, 20, 4);
    g.generateTexture(key, 24, 32);
    g.destroy();
  }
}
