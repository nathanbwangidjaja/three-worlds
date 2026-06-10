// Photorealistic mode: streams Google Photorealistic 3D Tiles
// (real photogrammetry of each city) re-centered so the city's special
// coordinate sits at the world origin. Same interface as WorldBuilder
// so Game.js can use either.
import * as THREE from "three";
import { TilesRenderer } from "3d-tiles-renderer";
import {
  GoogleCloudAuthPlugin,
  ReorientationPlugin,
  TilesFadePlugin,
  TileCompressionPlugin,
  GLTFExtensionsPlugin,
} from "3d-tiles-renderer/plugins";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
export const PHOTOREAL_AVAILABLE = !!API_KEY;

const DEG2RAD = Math.PI / 180;

// the exact coordinates each world is centered on (his home, her home, the tower)
// `photoreal: false` → Google has no 3D building mesh there (only blurry
// satellite-draped terrain), so the stylized OSM world looks far better.
export const CITY_COORDS = {
  boston: { lat: 42.3633093, lon: -71.0880085, photoreal: true },
  tangerang: { lat: -6.2263205, lon: 106.5995936, photoreal: false },
  paris: { lat: 48.8583701, lon: 2.2944813, photoreal: true },
};

// per-city sky/fog/light grading layered over the photogrammetry
const GRADES = {
  boston: {
    sky: { top: 0x4a7db8, bottom: 0xf7d9ac },
    fog: { color: 0xe8d4b0, near: 500, far: 2600 },
    exposure: 1.45,
    ambient: 3.2,
    ambientColor: 0xfff2dd,
    sunTint: { color: 0xffe2b0, intensity: 1.2, position: [-400, 300, 200] },
    stars: false,
  },
  tangerang: {
    sky: { top: 0x7a4f96, bottom: 0xffae6a },
    fog: { color: 0xf2b482, near: 450, far: 2400 },
    exposure: 1.2,
    ambient: 2.4,
    ambientColor: 0xffe0c4,
    sunTint: { color: 0xffb070, intensity: 1.4, position: [400, 180, -260] },
    stars: false,
  },
  paris: {
    // dusk — photogrammetry is daytime, so we grade it blue-gold instead of full night
    sky: { top: 0x1c2350, bottom: 0x8a5e7a },
    fog: { color: 0x3a3552, near: 420, far: 2400 },
    exposure: 0.82,
    ambient: 1.7,
    ambientColor: 0xbcc4f0,
    sunTint: { color: 0xffd9a8, intensity: 0.5, position: [300, 350, -200] },
    stars: true,
  },
};

export class RealWorld {
  constructor(scene, theme, cityCfg, camera, renderer) {
    this.scene = scene;
    this.theme = theme;
    this.city = cityCfg;            // { key, lat, lon }
    this.camera = camera;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.isPhotoreal = true;
    this.data = { radius: 700 };    // walkable radius, same as stylized mode
    this.animated = [];
    this._raycaster = new THREE.Raycaster();
    this._down = new THREE.Vector3(0, -1, 0);
    this._groundCache = new Map();
  }

  async build(onProgress) {
    const grade = GRADES[this.city.key];
    onProgress?.(0.05, "contacting google earth");

    const tiles = new TilesRenderer();
    this.tiles = tiles;
    tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: API_KEY, autoRefreshToken: true }));

    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
    tiles.registerPlugin(new TileCompressionPlugin());
    tiles.registerPlugin(new TilesFadePlugin());
    tiles.registerPlugin(new ReorientationPlugin({
      lat: this.city.lat * DEG2RAD,
      lon: this.city.lon * DEG2RAD,
      height: 0,
      recenter: true,
    }));

    tiles.setCamera(this.camera);
    tiles.setResolutionFromRenderer(this.camera, this.renderer);
    tiles.errorTarget = 6; // quality/perf balance (lower = sharper)

    // The library schedules downloads/parsing on requestAnimationFrame, which
    // freezes in background tabs (and setTimeout is throttled to 1 Hz there).
    // Use rAF when visible for frame pacing, MessageChannel (unthrottled)
    // when hidden so the city keeps streaming in the background.
    const channel = new MessageChannel();
    const pendingJobs = new Set();
    channel.port1.onmessage = () => {
      const fns = [...pendingJobs];
      pendingJobs.clear();
      fns.forEach((f) => f());
    };
    const schedule = (func) => {
      if (document.visibilityState === "visible") {
        requestAnimationFrame(func);
      } else {
        pendingJobs.add(func);
        channel.port2.postMessage(null);
      }
    };
    for (const q of [tiles.downloadQueue, tiles.parseQueue, tiles.processNodeQueue]) {
      if (q) q._schedulingCallback = schedule;
    }
    this.group.add(tiles.group);

    this.buildSky(grade);
    this.buildLights(grade);
    this.scene.fog = new THREE.Fog(grade.fog.color, grade.fog.near, grade.fog.far);
    this.renderer.toneMappingExposure = grade.exposure;

    this.scene.add(this.group);

    // Wait for the root tileset. Pump with a timer (NOT requestAnimationFrame:
    // rAF freezes in hidden/background tabs and would deadlock loading).
    await new Promise((resolve, reject) => {
      const pump = setInterval(() => { if (this.tiles) tiles.update(); }, 33);
      const timeout = setTimeout(() => { cleanup(); reject(new Error("Google 3D Tiles timed out")); }, 30000);
      const cleanup = () => { clearInterval(pump); clearTimeout(timeout); };
      tiles.addEventListener("load-tileset", function onLoad() {
        tiles.removeEventListener("load-tileset", onLoad);
        cleanup();
        resolve();
      });
      tiles.addEventListener("load-error", (e) => { cleanup(); reject(e.error ?? new Error("tile load error")); });
      tiles.update(); // first call kicks off the root request immediately
    });
    onProgress?.(0.35, "streaming the real world");

    // keep streaming until there's ground to stand on at the origin (or timeout)
    const t0 = performance.now();
    while (performance.now() - t0 < 20000) {
      if (!this.tiles) return this; // disposed mid-load (player traveled away)
      this.tiles.update();
      await new Promise((r) => setTimeout(r, 60));
      const h = this.groundHeight(0, 0, true);
      if (h !== null) break;
      onProgress?.(0.35 + 0.6 * Math.min(1, (performance.now() - t0) / 20000), "streaming the real world");
    }
    onProgress?.(1, "done");
    return this;
  }

  buildSky(grade) {
    const geo = new THREE.SphereGeometry(2800, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(grade.sky.top) },
        bottom: { value: new THREE.Color(grade.sky.bottom) },
      },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
        void main(){ float h = clamp(vPos.y/1400.0, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.6)),1.0); }`,
    });
    this.group.add(new THREE.Mesh(geo, mat));

    if (grade.stars) {
      const N = 700, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(1 - Math.random() * 0.8);
        pos[i * 3] = 2600 * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = 2600 * Math.cos(ph) + 80;
        pos[i * 3 + 2] = 2600 * Math.sin(ph) * Math.sin(th);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.group.add(new THREE.Points(g, new THREE.PointsMaterial({
        color: 0xe8eeff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8,
      })));
    }
  }

  buildLights(grade) {
    this.group.add(new THREE.AmbientLight(grade.ambientColor, grade.ambient));
    const sun = new THREE.DirectionalLight(grade.sunTint.color, grade.sunTint.intensity);
    sun.position.set(...grade.sunTint.position);
    this.group.add(sun);
  }

  // ----------------------------------------------------------- queries
  // Raycast down onto the photogrammetry. Returns ground y or null.
  // `fromY` matters under structures: casting from just above the player's
  // head finds the street under a bridge/the tower arches, not the deck above.
  groundHeight(x, z, fresh = false, fromY = 500) {
    if (!this.tiles) return null;
    if (fromY !== 500) fresh = true; // custom origins bypass the cache
    if (!fresh) {
      const key = `${Math.round(x * 2)},${Math.round(z * 2)}`;
      const hit = this._groundCache.get(key);
      if (hit !== undefined) return hit;
    }
    this._raycaster.set(new THREE.Vector3(x, fromY, z), this._down);
    this._raycaster.far = 1200;
    const hits = this._raycaster.intersectObject(this.tiles.group, true);
    const y = hits.length ? hits[0].point.y : null;
    // never cache misses — tiles may simply not have streamed in yet
    if (!fresh && y !== null) {
      const key = `${Math.round(x * 2)},${Math.round(z * 2)}`;
      this._groundCache.set(key, y);
      if (this._groundCache.size > 600) {
        this._groundCache.delete(this._groundCache.keys().next().value);
      }
    }
    return y;
  }

  // generic ray for camera collision; returns distance to first hit or null
  rayDistance(origin, dir, far) {
    if (!this.tiles) return null;
    this._raycaster.set(origin, dir);
    this._raycaster.far = far;
    const hits = this._raycaster.intersectObject(this.tiles.group, true);
    return hits.length ? hits[0].distance : null;
  }

  // footprint collision is handled by the step-height rule in Game.js
  blocked() { return false; }
  blockedAt() { return false; }
  findClearSpot(x, z) { return [x, z]; }

  updateSun() {} // baked lighting

  attributions() {
    try {
      return (this.tiles?.getAttributions() ?? []).map((a) => a.value).join(" · ");
    } catch {
      return "";
    }
  }

  tick() {
    if (!this.tiles) return;
    this.tiles.setResolutionFromRenderer(this.camera, this.renderer);
    this.tiles.update();
    // ground cache goes stale as better LODs stream in
    const now = performance.now();
    if (now - this._cacheTime > 2500) { this._cacheTime = now; this._groundCache.clear(); }
  }
  _cacheTime = 0;

  dispose() {
    this.scene.remove(this.group);
    this.scene.fog = null;
    const tiles = this.tiles;
    this.tiles = null;
    tiles?.dispose();
  }
}
