import * as THREE from "three";
import { WorldBuilder, rectPoly } from "./WorldBuilder.js";
import { THEMES } from "./themes.js";
import { STORY } from "./story.js";
import { Avatar, randomNpcLook } from "./Avatar.js";
import { Controls } from "./Controls.js";
import { Effects } from "./Effects.js";
import {
  buildEiffelTower, buildTowerSparkles, buildHomeMarker, buildBench, buildPicnic,
  buildGatehouse, buildBeacon, buildLiftKiosk, buildSphFront, buildSphGrounds,
  buildCarPark,
} from "./landmarks.js";
import { makeDriveCar, modelParts } from "./cars.js";
import { RealWorld, PHOTOREAL_AVAILABLE, CITY_COORDS } from "./RealWorld.js";
import { RestaurantWorld } from "./RestaurantWorld.js";
import { CampusWorld, CAMPUSES } from "./CampusWorld.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Net } from "../net.js";
import * as UI from "./ui.js";

// Champ de Mars axis (tower → École Militaire), unit vector in world coords
const CHAMP_AXIS = { x: 0.62, z: 0.78 };

// Google photogrammetry looks melted at street level — the polished stylized
// world is the look. Flip to true if you ever want the photoreal experiment back.
const USE_PHOTOREAL = false;

export class Game {
  constructor({ container, role, name, outfit = 0 }) {
    this.role = role;
    this.name = name;
    this.outfit = outfit;
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.camera.position.set(0, 6, 12);

    // cinematic bloom — makes lit windows, sparkles and fireworks glow
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.65, 0.85
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.controls = new Controls(this.camera, this.renderer.domElement);
    this.effects = new Effects(this.scene);

    this.avatar = new Avatar(role, name, { outfit });
    this.scene.add(this.avatar.group);

    // soft key light that follows the couple so they read clearly at dusk
    this.avatarLight = new THREE.PointLight(0xffe8d0, 30, 14, 2);
    this.scene.add(this.avatarLight);

    this.remote = null;          // { avatar, target:{...}, state }
    this.remoteState = null;     // latest known partner state (any world)

    this.worldKey = null;
    this.world = null;           // WorldBuilder
    this.extras = [];            // ticking landmark objects
    this.portals = [];           // {x, z, to}
    this.interactables = [];     // {x, z, prompt, onInteract}
    this.eiffel = null;
    this.towerCenter = null;
    this.togetherAtTower = false;
    this.fireworkTimer = 0;
    this.moveTimer = 0;
    this.clock = new THREE.Clock();
    this.dataCache = {};
    this.groundY = 0;          // terrain height under the avatar (photoreal)
    this.extraSettleTimer = 0; // re-seat landmarks on streaming terrain
    this.drive = null;         // we're in a car {spot, group, wheels, spec, seat, ...}
    this.remoteCar = null;     // the partner's car, rendered locally
    this.remoteCarState = null; // their latest car on/off event
    this.liveCars = [];        // every woken-up car group (cleaned on travel)
    this.carMemory = {};       // city → {spotIndex: {x,z,ry}} — cars stay where you parked them

    window.addEventListener("resize", () => {
      if (window.innerWidth < 2 || window.innerHeight < 2) return; // minimized/hidden
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });

    this._bindNet();
    this._bindKeys();
  }

  // ------------------------------------------------------------- network
  _bindNet() {
    Net.on("players", (others) => {
      // it's just the two of you — track the first other player
      const partner = others.find((o) => o.role !== this.role) || others[0] || null;
      this.remoteState = partner;
      if (!partner) {
        UI.setPartnerStatus("walking alone for now 🌙");
        this._removeRemote();
        return;
      }
      if (partner.world === this.worldKey) {
        UI.setPartnerStatus(`💞 ${partner.name} is here with you`);
        if (!this.remote) this._spawnRemote(partner);
        if (this.remote && this.remote.name !== partner.name) {
          this.remote.avatar.setName(partner.name);
          this.remote.name = partner.name;
        }
        this.remote.target = partner;
      } else {
        UI.setPartnerStatus(STORY.partnerWorld(partner.name, this._worldLabel(partner.world)));
        this._removeRemote();
      }
    });

    Net.on("event", (m) => {
      if (m.id === Net.sessionId) return;
      if (m.kind === "topic" && this.world?.isInterior && m.data) {
        this.world.showTopicFromPartner(m.data.i, m.data.n);
      }
      if (m.kind === "car" && m.data) {
        this.remoteCarState = m.data.on ? m.data : null;
        this._syncRemoteCar(m.data);
      }
      if (m.kind === "hello") {
        // partner just arrived somewhere — if we're driving, let them see it
        if (this.drive) {
          Net.sendEvent("car", {
            i: this.drive.spot.index, on: true, seat: this.drive.seat, world: this.worldKey,
          });
        }
      }
    });

    Net.on("chat", (m) => {
      if (m.id === Net.sessionId) return;
      UI.addChat(m.name, m.text, m.role);
      if (this.remote) this.remote.avatar.say(m.text);
    });

    Net.on("emote", (m) => {
      if (m.id === Net.sessionId) {
        return; // we already showed our own
      }
      if (this.remote) {
        this.effects.emote(this.remote.avatar.group.position, m.kind);
        if (m.kind === "wave") this.remote.avatar.wave(this.clock.elapsedTime);
      }
    });
  }

  _spawnRemote(state) {
    const avatar = new Avatar(state.role, state.name, { outfit: state.outfit ?? 0 });
    avatar.group.position.set(state.x, state.y, state.z);
    this.scene.add(avatar.group);
    this.remote = { avatar, target: state, name: state.name, heading: state.ry };
  }

  _removeRemote() {
    if (!this.remote) return;
    this.scene.remove(this.remote.avatar.group);
    this.remote.avatar.dispose();
    this.remote = null;
  }

  _worldLabel(w) {
    if (!w) return "";
    if (w.startsWith("r:")) {
      const [, city, idx] = w.split(":");
      const poi = this.dataCache[city]?.pois?.[Number(idx)];
      return poi ? `${poi.n} 🍽` : "a little restaurant 🍽";
    }
    if (w.startsWith("c:")) {
      const key = w.split(":")[2];
      return CAMPUSES[key] ? `${CAMPUSES[key].name} 🎓` : "campus 🎓";
    }
    return THEMES[w]?.title ?? w;
  }

  // ---------------------------------------------------------------- keys
  _bindKeys() {
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (UI.dineOpen()) return; // menu/bill/card overlays are mouse-driven
      if (UI.dialogOpen()) {
        if (e.code === "Space" || e.code === "KeyE" || e.code === "Enter") {
          e.preventDefault();
          UI.advanceDialog();
        }
        return;
      }
      if (e.code === "KeyE") this._tryInteract();
      if (e.code === "KeyT" && this.world?.isInterior) this.world.drawTopic();
      if (e.code === "KeyM") {
        if (this.world?.isInterior) {
          UI.addSystem(this.worldKey?.startsWith("c:")
            ? "head outside first 😄 — the world can wait"
            : "finish dinner first 😄 — the world can wait");
        } else {
          UI.openTravel(this.worldKey, (to) => this.travel(to));
        }
      }
      if (e.code === "Digit1") this.emote("heart");
      if (e.code === "Digit2") this.emote("wave");
      if (e.code === "Digit3") this.emote("sparkle");
      if (e.code === "Digit4") this.emote("kiss");
    });
    window.addEventListener("click", () => { if (UI.dialogOpen()) UI.advanceDialog(); });
  }

  emote(kind) {
    this.effects.emote(this.avatar.group.position, kind);
    if (kind === "wave") this.avatar.wave(this.clock.elapsedTime);
    Net.sendEmote(kind);
  }

  _tryInteract() {
    const p = this.controls.pos;
    if (this.drive) {
      this.exitCar();
      return;
    }
    if (this.world?.isInterior) {
      this.world.interact(p);
      return;
    }
    if (this.seatedAt?.bench) {
      this.standUp();
      return;
    }
    if (this.summit) {
      this.exitSummit();
      return;
    }
    for (const it of this.interactables) {
      if (Math.hypot(it.x - p.x, it.z - p.z) < it.range) {
        it.onInteract();
        return;
      }
    }
    // cars — every parked car is drivable
    const spot = this._nearCarSpot(2.8);
    if (spot) {
      const partnerDriving = this.remoteCarState?.on &&
        this.remoteCarState.seat === "driver" && this.remoteCarState.i === spot.index &&
        this.remoteCarState.world === this.worldKey;
      if (partnerDriving) this.enterCar(spot, "passenger");
      else if (!spot.taken) this.enterCar(spot, "driver");
    }
  }

  _nearCarSpot(range) {
    if (!this.world?.carSpots) return null;
    const p = this.controls.pos;
    let best = null, bd = range;
    for (const s of this.world.carSpots) {
      const d = Math.hypot(s.x - p.x, s.z - p.z) - modelParts(s.model).spec.dims[1] / 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // -------------------------------------------------------------- worlds
  async loadData(key) {
    if (!this.dataCache[key]) {
      const res = await fetch(`/data/${key}.json`);
      if (!res.ok) throw new Error(`failed to load map data for ${key}`);
      this.dataCache[key] = await res.json();
    }
    return this.dataCache[key];
  }

  async travel(to) {
    if (to === this.worldKey) return;
    UI.fadeIn(`✈️ flying to ${THEMES[to].title}…`);
    await new Promise((r) => setTimeout(r, 750));
    try {
      await this.loadWorld(to);
    } catch (err) {
      console.error("[game] travel failed:", err);
      UI.fadeIn(`💔 couldn't load ${THEMES[to].title} — ${String(err.message || err)}`);
      setTimeout(() => UI.fadeOut(), 4000);
      return;
    }
    UI.fadeOut();
  }

  async loadWorld(key) {
    const theme = THEMES[key];

    // tear down old world
    if (this.drive) { this.drive.speed = 0; this.exitCar(); } // park + tell the partner
    this.remoteCar = null;
    for (const g of this.liveCars) this.scene.remove(g);
    this.liveCars = [];
    this.effects.clear();
    this._removeRemote();
    for (const e of this.extras) this.scene.remove(e.group);
    this.extras = [];
    this.portals = [];
    this.interactables = [];
    this.eiffel = null;
    this.towerCenter = null;
    this.summit = false;
    if (this.world) this.world.dispose();
    this.world = null;
    this.groundY = 0;

    this.worldKey = key;
    let data = null;
    if (USE_PHOTOREAL && PHOTOREAL_AVAILABLE && CITY_COORDS[key]?.photoreal) {
      // real Google photogrammetry, with the stylized world as fallback
      try {
        this.world = new RealWorld(this.scene, theme, { key, ...CITY_COORDS[key] }, this.camera, this.renderer);
        await this.world.build((pct, label) => UI.setLoading(pct, label));
      } catch (err) {
        console.warn(`[world] photoreal failed for ${key}, falling back to stylized:`, err);
        try { this.world.dispose(); } catch { /* already broken */ }
        this.world = null;
      }
    }
    if (!this.world) {
      data = await this.loadData(key);
      this.world = new WorldBuilder(this.scene, theme, data);
      await this.world.build((pct, label) => UI.setLoading(pct, label));
      this.renderer.toneMappingExposure = 1.18;
      this.scene.fog = null;
    }

    UI.setAttribution(this.world.isPhotoreal ? "Google · " + (this.world.attributions() || "Photorealistic 3D Tiles") : "map data © OpenStreetMap");

    // night Paris glows softly — strong bloom blew the windows out
    if (theme.night) {
      this.bloom.strength = 0.42;
      this.bloom.threshold = 0.66;
      this.avatarLight.intensity = 30;
    } else {
      this.bloom.strength = 0.28;
      this.bloom.threshold = 0.88;
      this.avatarLight.intensity = 9; // daylight: just a gentle fill
    }

    this._setupExtras(key, data);
    this._restoreMovedCars(key);

    // spawn
    const spawn = this._spawnPoint(key);
    this.controls.pos.set(spawn[0], 0, spawn[1]);
    this.controls.yaw = spawn[2] ?? Math.PI;
    if (this.world.isPhotoreal) {
      this.groundY = this.world.groundHeight(spawn[0], spawn[1]) ?? this.world.groundHeight(0, 0) ?? 0;
    }
    this.camera.position.set(
      spawn[0] + Math.sin(this.controls.yaw) * 9,
      this.groundY + 5,
      spawn[1] + Math.cos(this.controls.yaw) * 9
    );

    UI.setLocation(theme.title, theme.subtitle);
    Net.sendWorld({ world: key, x: spawn[0], z: spawn[1] });

    // re-evaluate partner presence in this world
    if (this.remoteState) {
      if (this.remoteState.world === key) {
        this._spawnRemote(this.remoteState);
        UI.setPartnerStatus(`💞 ${this.remoteState.name} is here with you`);
      } else {
        UI.setPartnerStatus(STORY.partnerWorld(this.remoteState.name, THEMES[this.remoteState.world]?.title ?? ""));
      }
    }

    // ask the partner to repeat anything we missed (like "I'm driving")
    Net.sendEvent?.("hello", { world: key });
    if (this.remoteCarState?.on) this._syncRemoteCar(this.remoteCarState);
  }

  _spawnPoint(key) {
    if (key === "paris") {
      const c = this.towerCenter || { x: 0, z: 0 };
      // photoreal: spawn on the open Champ de Mars, clear of the base fencing
      const d = this.world.isPhotoreal ? 185 : 95;
      const sx = c.x + CHAMP_AXIS.x * d, sz = c.z + CHAMP_AXIS.z * d;
      const [x, z] = this.world.findClearSpot(sx, sz);
      // face the tower
      const yaw = Math.atan2(c.x - x, c.z - z) + Math.PI;
      return [x, z, yaw];
    }
    // spawn a few steps away from the home marker, facing it
    const h = this.homePos || { x: 0, z: 0 };
    const [x, z] = this.world.findClearSpot(h.x + 4, h.z + 9, 3);
    const yaw = Math.atan2(h.x - x, h.z - z) + Math.PI;
    return [x, z, yaw];
  }

  _setupExtras(key, data) {
    const addExtra = (obj) => {
      this.scene.add(obj.group);
      this.extras.push(obj);
    };

    // --- Eiffel tower (paris) ---
    if (key === "paris") {
      let cx = 0, cz = 0;
      if (this.world.isPhotoreal) {
        // the world is centered exactly on the real tower — add only the magic
        this.towerCenter = { x: 0, z: 0 };
        const sparkles = buildTowerSparkles();
        addExtra(sparkles);
        this.eiffel = sparkles;
      } else {
        const towerB = data.buildings.find((b) => b.tower && b.h > 100);
        if (towerB) {
          for (const [x, z] of towerB.p) { cx += x; cz += z; }
          cx /= towerB.p.length; cz /= towerB.p.length;
        }
        this.towerCenter = { x: cx, z: cz };
        const eiffel = buildEiffelTower();
        eiffel.group.position.set(cx, 0, cz);
        // align tower base diagonals with the Seine-ish orientation
        const towerYaw = Math.atan2(CHAMP_AXIS.x, CHAMP_AXIS.z);
        eiffel.group.rotation.y = towerYaw;
        addExtra(eiffel);
        this.eiffel = eiffel;
        // the four iron legs are solid — you walk under the arches, not through them
        if (this.world.addCollider) {
          for (const [lx, lz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const px = 27.5 * lx, pz = 27.5 * lz;
            const wx = cx + px * Math.cos(towerYaw) + pz * Math.sin(towerYaw);
            const wz = cz - px * Math.sin(towerYaw) + pz * Math.cos(towerYaw);
            this.world.addCollider(rectPoly(wx, wz, 6, 6, towerYaw), 60);
          }
        }
      }

      // plaque at the base (photoreal: just outside the real security fence)
      const plaqueD = this.world.isPhotoreal ? 125 : 42;
      this.interactables.push({
        x: this.towerCenter.x + CHAMP_AXIS.x * plaqueD,
        z: this.towerCenter.z + CHAMP_AXIS.z * plaqueD,
        range: 8,
        prompt: "press E · read the plaque 🗼",
        onInteract: () => UI.showDialog(STORY.eiffel.speaker, STORY.eiffel.pages),
      });

      // the lift to the summit — a real kiosk + light beam so it's findable
      if (!this.world.isPhotoreal) {
        const liftX = this.towerCenter.x - CHAMP_AXIS.x * 30;
        const liftZ = this.towerCenter.z - CHAMP_AXIS.z * 30;
        addExtra(buildLiftKiosk(liftX, liftZ, Math.atan2(CHAMP_AXIS.x, CHAMP_AXIS.z)));
        addExtra(buildBeacon(liftX, liftZ, "🛗", 0xffd27a, 55));
        this.interactables.push({
          x: liftX, z: liftZ,
          range: 7,
          prompt: "press E · ride to the summit 🛗",
          onInteract: () => this.enterSummit(),
        });
      }

      // bench + picnic on the Champ de Mars
      const bx = cx + CHAMP_AXIS.x * 175, bz = cz + CHAMP_AXIS.z * 175;
      const [bcx, bcz] = this.world.findClearSpot(bx, bz);
      const benchYaw = Math.atan2(cx - bcx, cz - bcz);
      const bench = buildBench(bcx, bcz, benchYaw);
      addExtra(bench);
      this.interactables.push({
        x: bcx, z: bcz, range: 3.2,
        prompt: "press E · sit a while 🪑",
        onInteract: () => UI.showDialog(STORY.bench.speaker, STORY.bench.pages),
      });

      const [pcx, pcz] = this.world.findClearSpot(bcx - CHAMP_AXIS.z * 14, bcz + CHAMP_AXIS.x * 14);
      addExtra(buildPicnic(pcx, pcz));
    }

    // --- home markers ---
    if (key === "boston" || key === "tangerang") {
      const home = STORY.homes[key];
      let hx, hz;
      if (key === "tangerang") {
        // the real Taman Beverly Golf entrance: gate island sits in the
        // divided driveway just south of Jl. Jend. Sudirman, signs face the
        // avenue; the home marker waits inside the cluster
        addExtra(buildGatehouse(-0.5, 14, 0));
        this.world.addCollider?.(rectPoly(-0.5, 14, 3.4, 3.4, 0), 4);

        // the schools — walk in through the real campuses
        this.campusDoors = {
          sph: (([dx, dz]) => ({ x: dx, z: dz }))(this.world.findClearSpot(743, 1548, 3)),
          uph: (([dx, dz]) => ({ x: dx, z: dz }))(this.world.findClearSpot(1115, 280, 3)),
        };
        for (const [ck, door] of Object.entries(this.campusDoors)) {
          addExtra(buildBeacon(door.x, door.z, "🎓", 0x8fd0ff, 28));
          this.interactables.push({
            x: door.x, z: door.z, range: 5,
            prompt: `press E · visit ${CAMPUSES[ck].name} 🎓`,
            onInteract: () => this.enterCampus(ck),
          });
        }
        // the road out to Gading Serpong — drive southeast to her café
        const [sgx, sgz] = this.world.findClearSpot(1010, 2030, 4);
        addExtra(buildBeacon(sgx, sgz, "☕", 0xffd27a, 34));
        this.interactables.push({
          x: sgx, z: sgz, range: 8,
          prompt: "press E · drive on to Gading Serpong · her café ☕",
          onInteract: () => this.travel("serpong"),
        });

        // the real SPH campus: clock tower, lattice pavilion, lawn, pool,
        // tennis courts, field, playground — placed from the satellite
        addExtra(buildSphFront(740, 1524, 0));
        this.world.addCollider?.(rectPoly(746.5, 1546, 2.2, 2.2, 0), 16); // clock tower
        this.world.addCollider?.(rectPoly(737, 1548, 3.8, 3.8, 0), 6);    // pavilion
        const sphGrounds = buildSphGrounds();
        sphGrounds.group.position.set(676, 0, 1620);
        addExtra(sphGrounds);
        [hx, hz] = this.world.findClearSpot(2, 44, 4);
      } else {
        [hx, hz] = this.world.findClearSpot(0, 0, 4);
      }
      this.homePos = { x: hx, z: hz };
      const marker = buildHomeMarker(hx, hz, home.label);
      addExtra(marker);
      this.interactables.push({
        x: hx, z: hz, range: 4,
        prompt: "press E · 💌",
        onInteract: () => UI.showDialog(home.speaker, home.pages),
      });
    }

    // --- Gading Serpong: the café she just bought (CARS LAND block) ---
    if (key === "serpong") {
      const [mx, mz] = this.world.findClearSpot(10, 14, 3);
      this.homePos = { x: mx, z: mz };
      addExtra(buildHomeMarker(mx, mz, "her café ☕"));
      this.interactables.push({
        x: mx, z: mz, range: 4,
        prompt: "press E · 💌",
        onInteract: () => UI.showDialog("her café ☕", [
          "this exact corner of CARS LAND — she just signed for it 💕",
          "one day soon: her own café, right here in Gading Serpong.",
          "the door with the glowing sign already works — go have a coffee inside ☕",
        ]),
      });
      // the CARS LAND forecourt lot across the street (in the Street View:
      // open asphalt, painted bays, white post-and-rail fence, parked MPVs)
      const lot = buildCarPark(86, 60);
      lot.group.position.set(-86, 0, -16);
      addExtra(lot);
      let li = 0;
      for (const spot of this.world.carSpots) { // park a few of the fleet in the bays
        if (li >= 10) break;
        if (Math.hypot(spot.x + 86, spot.z + 16) > 220) continue;
        const car = makeDriveCar(spot.model, spot.paint);
        car.headlight.intensity = 0;
        const bayX = -86 - 38 + (li % 5) * 16, bayZ = -16 + (li < 5 ? -15 : 15);
        car.group.position.set(bayX, 0.05, bayZ);
        car.group.rotation.y = li < 5 ? 0 : Math.PI;
        this.scene.add(car.group);
        this.liveCars.push(car.group);
        this.world.addCollider?.(rectPoly(bayX, bayZ, 1.1, 2.5, car.group.rotation.y), 1.7);
        li++;
      }

      // the road back home
      const [ggx, ggz] = this.world.findClearSpot(-580, -560, 4);
      addExtra(buildBeacon(ggx, ggz, "🛣️", 0xffd27a, 32));
      this.interactables.push({
        x: ggx, z: ggz, range: 8,
        prompt: "press E · drive home to Lippo Village 🛣️",
        onInteract: () => this.travel("tangerang"),
      });
    }

    // --- sittable park benches: sit together and just enjoy ---
    if (this.world.benchSpots?.length) {
      for (const b of this.world.benchSpots) {
        this.interactables.push({
          x: b.x, z: b.z, range: 2.2,
          prompt: "press E · sit together 🪑",
          onInteract: () => this.sitOnBench(b),
        });
      }
    }

    // --- restaurant doors: every real café/restaurant is enterable ---
    if (this.world.restaurantDoors?.length) {
      for (const door of this.world.restaurantDoors) {
        this.interactables.push({
          x: door.x, z: door.z, range: 2.8,
          prompt: `press E · dine at ${door.poi.n} 🍽`,
          onInteract: () => this.enterRestaurant(door),
        });
      }
    }

    // (the old glowing travel rings are gone — sci-fi portals standing in
    // real streets broke the realism. press M to fly between cities.)

    // --- a local who tells you where everything is ---
    if (!this.world.isPhotoreal) {
      const guideDefs = {
        boston: { name: "Sam", pages: [
          "welcome to Kendall Square 💙 every glowing restaurant sign is a real place — walk to its door and press E for a dinner date.",
          "see a car you like? walk up to ANY parked car and press E to drive it. W/S is gas and brake, A/D steers — and your favorite person can hop in beside you 🚗",
          "press M whenever you want to fly to Paris or Tangerang ✈️ — no airport queues here.",
        ] },
        tangerang: { name: "Maya", pages: [
          "selamat datang di Lippo Village 🩷 the white gatehouse on the avenue is Taman Beverly — her home is just inside.",
          "any parked car can be driven: stand next to one and press E. take the Alphard, it's very Tangerang 😄 one of you drives, the other rides along.",
          "follow a 🎓 beam to visit her schools — SPH Lippo Village is south past the golf course, UPH is east by the big towers. you can walk every floor.",
          "drive north and you'll hit the Jakarta–Merak toll road, gerbang tol and all 🛣️ — and press M any time to fly to Boston or Paris ✈️",
        ] },
        paris: { name: "Léa", pages: [
          "bienvenue à Paris 💛 see the golden beam at the tower's foot? that's the summit lift — press E there and ride up 276 meters.",
          "the plaque, the green benches on the Champ de Mars, the cafés — anything glowing can be pressed with E. you can even sit together and watch the tower.",
          "fancy a drive along the Seine? any parked car starts with E — the Mini is very Paris 😉",
        ] },
      };
      const def = guideDefs[key];
      if (def) {
        const sp = this._spawnPoint(key);
        const [gx, gz] = this.world.findClearSpot(sp[0] + 6, sp[1] - 4, 2);
        let seed = key.length * 2654435761 + 97;
        const grng = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        const look = randomNpcLook(grng);
        const role = look.hairstyle === "long" || look.hairstyle === "bun" ? "her" : "you";
        const guide = new Avatar(role, `🧭 ${def.name}`, { npcLook: look });
        const faceRy = Math.atan2(sp[0] - gx, sp[1] - gz);
        guide.group.position.set(gx, this.world.surfaceY ? this.world.surfaceY(gx, gz) : 0, gz);
        guide.group.rotation.y = faceRy;
        this.scene.add(guide.group);
        this.extras.push({ group: guide.group, tick: (t, dt) => {
          guide.group.rotation.y = faceRy + Math.sin(t * 0.4) * 0.35;
          guide.animate(dt ?? 0.016, 0, t);
        } });
        addExtra(buildBeacon(gx, gz, "🧭", 0x8fd0ff, 13));
        this.interactables.push({
          x: gx, z: gz, range: 3.4,
          prompt: `press E · ask ${def.name} what's around 🧭`,
          onInteract: () => UI.showDialog(`🧭 ${def.name}`, def.pages),
        });
      }
    }
  }

  // --------------------------------------------------------------- summit
  async enterSummit() {
    const tc = this.towerCenter;
    UI.fadeIn("🛗 going up… 276 meters");
    await new Promise((r) => setTimeout(r, 900));
    this.summit = true;
    this.controls.pos.set(tc.x + 1.6, 0, tc.z + 1.6);
    this.groundY = 277.6;
    this.controls.pitch = 0.12;
    this.controls.dist = 9;
    this.camera.position.set(tc.x + 6, 283, tc.z + 6);
    UI.addSystem("the whole city, just for you two ✨ — press E to ride back down");
    UI.fadeOut();
  }

  async exitSummit() {
    const tc = this.towerCenter;
    UI.fadeIn("🛗 coming back down…");
    await new Promise((r) => setTimeout(r, 700));
    this.summit = false;
    const [x, z] = this.world.findClearSpot(tc.x + CHAMP_AXIS.x * 45, tc.z + CHAMP_AXIS.z * 45, 3);
    this.controls.pos.set(x, 0, z);
    this.groundY = 0;
    this.controls.dist = 9;
    UI.fadeOut();
  }

  // -------------------------------------------------------------- benches
  sitOnBench(b) {
    // each of you gets a side of the bench, sitting shoulder to shoulder
    const side = this.role === "her" ? -0.45 : 0.45;
    const sx = b.x + Math.cos(b.ry) * side;
    const sz = b.z - Math.sin(b.ry) * side;
    this.controls.pos.set(sx, 0, sz);
    this.seatedAt = { x: sx, z: sz, ry: b.ry, y: 0.27, bench: true };
    this.avatar.group.position.set(sx, 0.27, sz);
    this.avatar.group.rotation.y = b.ry;
    // camera settles behind the bench, looking where you're looking
    this.controls.yaw = b.ry + Math.PI;
    this.controls.pitch = 0.22;
    this.controls.dist = 5.5;
    UI.addSystem("just the two of you and the view 🌙 — press E to stand up");
  }

  standUp() {
    const s = this.seatedAt;
    this.seatedAt = null;
    if (s) {
      this.controls.pos.set(s.x + Math.sin(s.ry) * 0.9, 0, s.z + Math.cos(s.ry) * 0.9);
    }
  }

  // ------------------------------------------------------------------ cars
  enterCar(spot, seat = "driver") {
    let car;
    if (seat === "passenger") {
      if (!this.remoteCar) return;
      car = this.remoteCar; // ride in the partner's car
    } else {
      car = spot.parkedCar;
      spot.parkedCar = null;
      if (!car) {
        car = makeDriveCar(spot.model, spot.paint);
        car.group.position.set(spot.x, spot.y ?? 0, spot.z);
        car.group.rotation.y = spot.ry;
        this.scene.add(car.group);
        this.liveCars.push(car.group);
      }
      this.world.takeCar(spot);
      if (spot.collider) spot.collider.off = true;
      car.headlight.intensity = THEMES[this.worldKey]?.night ? 5 : 1.4;
    }
    this.drive = { ...car, spot, seat, speed: 0, steer: 0, heading: car.group.rotation.y };
    // the follow-light at full power blooms white paint out — the car lights itself
    this.avatarLight.intensity = THEMES[this.worldKey]?.night ? 6 : 4;
    this.controls.pos.set(car.group.position.x, 0, car.group.position.z);
    this.controls.yaw = car.group.rotation.y + Math.PI;
    this.controls.pitch = 0.3;
    this.controls.dist = 10;
    if (!car.spec.openTop) this.avatar.group.visible = false;
    UI.addSystem(seat === "driver"
      ? `🚗 ${car.spec.name} — W/S gas & brake, A/D steer, E to park`
      : `💕 riding along in the ${car.spec.name} — E to hop out`);
    Net.sendEvent("car", { i: spot.index, on: true, seat, world: this.worldKey });
  }

  exitCar(silent = false) {
    const d = this.drive;
    if (!d) return;
    if (d.seat === "driver" && Math.abs(d.speed) > 2.5 && !silent) {
      UI.addSystem("slow down a little first 😅");
      return;
    }
    this.drive = null;
    this.avatar.group.visible = true;
    this.avatarLight.intensity = THEMES[this.worldKey]?.night ? 30 : 9;
    const g = d.group;
    if (d.seat === "driver") {
      d.headlight.intensity = 0;
      // the car stays parked right here — re-enterable, and solid again
      const s = d.spot;
      s.x = g.position.x; s.z = g.position.z; s.ry = g.rotation.y; s.y = g.position.y;
      s.parkedCar = { group: g, wheels: d.wheels, spec: d.spec, headlight: d.headlight };
      s.taken = false;
      s.collider = this.world.addCollider(
        rectPoly(s.x, s.z, d.spec.dims[0] / 2 + 0.12, d.spec.dims[1] / 2 + 0.18, s.ry), 1.7);
      // remember where it's parked — surviving restaurant/campus visits
      if (!this.worldKey.includes(":")) {
        (this.carMemory[this.worldKey] ??= {})[s.index] = { x: s.x, z: s.z, ry: s.ry };
      }
      if (!silent) Net.sendEvent("car", {
        i: s.index, on: false, x: +s.x.toFixed(2), z: +s.z.toFixed(2), ry: +s.ry.toFixed(3),
        world: this.worldKey,
      });
    } else if (!silent) {
      Net.sendEvent("car", { i: d.spot.index, on: false, seat: "passenger", world: this.worldKey });
    }
    // step out beside the car
    const side = d.seat === "driver" ? -1 : 1;
    const ox = g.position.x + Math.cos(g.rotation.y) * side * 1.7;
    const oz = g.position.z - Math.sin(g.rotation.y) * side * 1.7;
    const [cx, cz] = this.world.findClearSpot ? this.world.findClearSpot(ox, oz, 1.5) : [ox, oz];
    this.controls.pos.set(cx, 0, cz);
  }

  // the city is rebuilt fresh after every restaurant/campus visit — put the
  // cars back where they were actually parked
  _restoreMovedCars(key) {
    const mem = this.carMemory[key];
    if (!mem || !this.world?.carSpots) return;
    for (const [idx, pose] of Object.entries(mem)) {
      const spot = this.world.carSpots[idx];
      if (!spot) continue;
      this.world.takeCar(spot); // hide the freshly-rebuilt parked instance
      const car = makeDriveCar(spot.model, spot.paint);
      car.headlight.intensity = 0;
      spot.x = pose.x; spot.z = pose.z; spot.ry = pose.ry;
      spot.y = this.world.surfaceY ? this.world.surfaceY(pose.x, pose.z) : 0;
      car.group.position.set(spot.x, spot.y, spot.z);
      car.group.rotation.y = spot.ry;
      this.scene.add(car.group);
      this.liveCars.push(car.group);
      spot.parkedCar = { group: car.group, wheels: car.wheels, spec: car.spec, headlight: car.headlight };
      spot.taken = false;
      spot.collider = this.world.addCollider(
        rectPoly(spot.x, spot.z, car.spec.dims[0] / 2 + 0.12, car.spec.dims[1] / 2 + 0.18, spot.ry), 1.7);
    }
  }

  // render/clear the partner's car from their events
  _syncRemoteCar(data) {
    if (!this.world || this.world.isInterior || !this.world.carSpots) return;
    if (data.on && data.seat === "driver" && data.world === this.worldKey) {
      const spot = this.world.carSpots[data.i];
      if (!spot || this.remoteCar) return;
      let car = spot.parkedCar;
      spot.parkedCar = null;
      if (!car) {
        car = makeDriveCar(spot.model, spot.paint);
        car.group.position.set(spot.x, spot.y ?? 0, spot.z);
        car.group.rotation.y = spot.ry;
        this.scene.add(car.group);
        this.liveCars.push(car.group);
      }
      this.world.takeCar(spot);
      if (spot.collider) spot.collider.off = true;
      car.headlight.intensity = THEMES[this.worldKey]?.night ? 5 : 1.4;
      this.remoteCar = { ...car, spot };
    } else if (!data.on && data.seat !== "passenger") {
      if (this.remoteCar) {
        const car = this.remoteCar;
        const s = car.spot;
        if (data.x !== undefined) {
          car.group.position.set(data.x, this.world.surfaceY ? this.world.surfaceY(data.x, data.z) : 0, data.z);
          car.group.rotation.y = data.ry;
          s.x = data.x; s.z = data.z; s.ry = data.ry; s.y = car.group.position.y;
        }
        car.headlight.intensity = 0;
        s.parkedCar = { group: car.group, wheels: car.wheels, spec: car.spec, headlight: car.headlight };
        s.taken = false;
        s.collider = this.world.addCollider(
          rectPoly(s.x, s.z, car.spec.dims[0] / 2 + 0.12, car.spec.dims[1] / 2 + 0.18, s.ry), 1.7);
        if (!this.worldKey.includes(":")) {
          (this.carMemory[this.worldKey] ??= {})[s.index] = { x: s.x, z: s.z, ry: s.ry };
        }
        this.remoteCar = null;
      }
      if (this.remote) this.remote.avatar.group.visible = true;
      // our driver left while we were riding shotgun — hop out too
      if (this.drive?.seat === "passenger") this.exitCar(true);
    }
  }

  // seat an avatar inside a car (open tops show you, closed cars hide you)
  _seatAvatarInCar(avatar, car, seat) {
    const spec = car.spec;
    if (!spec.openTop) { avatar.group.visible = false; return; }
    avatar.group.visible = true;
    const heading = car.group.rotation.y;
    const lx = (seat === "driver" ? -1 : 1) * (spec.seatX ?? 0.4);
    const lz = spec.seatZ ?? -0.35;
    const sin = Math.sin(heading), cos = Math.cos(heading);
    avatar.group.position.set(
      car.group.position.x + lx * cos + lz * sin,
      car.group.position.y + (spec.seatY ?? 0.7) - 0.34,
      car.group.position.z - lx * sin + lz * cos
    );
    avatar.group.rotation.y = heading;
  }

  // car physics + chase camera for the frame we're driving
  _driveFrame(dt) {
    const d = this.drive;
    const p = this.controls.pos;
    if (d.seat === "passenger") {
      if (!this.remoteCar) { this.exitCar(true); return; }
      const g = this.remoteCar.group;
      p.set(g.position.x, 0, g.position.z);
      this._seatAvatarInCar(this.avatar, this.remoteCar, "passenger");
      return;
    }
    const k = this.controls.keys;
    const ok = this.controls.enabled;
    const fwd = ok ? ((k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0)) : 0;
    const steerIn = ok ? ((k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0)) : 0;
    const accel = fwd > 0 ? 9 : fwd < 0 ? (d.speed > 0.5 ? -14 : -6) : 0;
    d.speed += accel * dt;
    if (!fwd) d.speed *= Math.exp(-dt * 1.6);
    d.speed = Math.max(-6, Math.min(16, d.speed));
    d.steer += (steerIn * 0.55 - d.steer) * Math.min(1, dt * 7);
    d.heading -= d.steer * dt * Math.max(-1.7, Math.min(1.7, d.speed * 0.24));

    const nx = p.x + Math.sin(d.heading) * d.speed * dt;
    const nz = p.z + Math.cos(d.heading) * d.speed * dt;
    const hw = d.spec.dims[0] / 2 - 0.08, hl = d.spec.dims[1] / 2 - 0.08;
    const sin = Math.sin(d.heading), cos = Math.cos(d.heading);
    let hit = false;
    for (const [lx, lz] of [[hw, hl], [-hw, hl], [hw, -hl], [-hw, -hl]]) {
      if (this.world.blocked(nx + lx * cos + lz * sin, nz - lx * sin + lz * cos)) { hit = true; break; }
    }
    if (!hit && Math.hypot(nx, nz) < this.world.data.radius + 25) {
      p.x = nx; p.z = nz;
    } else if (hit) {
      d.speed = -d.speed * 0.25; // soft bump
    } else {
      d.speed = 0;
    }

    const sy = this.world.surfaceY ? this.world.surfaceY(p.x, p.z) : 0;
    d.group.position.set(p.x, sy, p.z);
    d.group.rotation.y = d.heading;
    for (const w of d.wheels) {
      w.spin.rotation.x += (d.speed / w.r) * dt;
      if (w.front) w.pivot.rotation.y += (-d.steer * 1.1 - w.pivot.rotation.y) * Math.min(1, dt * 8);
    }
    // chase camera settles behind the car once you're moving
    if (Math.abs(d.speed) > 1.2) {
      let dy = d.heading + Math.PI - this.controls.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.controls.yaw += dy * Math.min(1, dt * 1.7);
    }
    this._seatAvatarInCar(this.avatar, d, "driver");
  }

  // ---------------------------------------------------------- restaurants
  async enterRestaurant(door) {
    const city = this.worldKey;
    this.returnSpot = { city, x: door.x, z: door.z };
    UI.fadeIn(`🍽 stepping into ${door.poi.n}…`);
    await new Promise((r) => setTimeout(r, 650));

    this.effects.clear();
    this._removeRemote();
    this.remoteCar = null;
    for (const g of this.liveCars) this.scene.remove(g);
    this.liveCars = [];
    for (const e of this.extras) this.scene.remove(e.group);
    this.extras = [];
    this.portals = [];
    this.interactables = [];
    this.eiffel = null;
    this.towerCenter = null;
    if (this.world) this.world.dispose();
    this.world = null;
    this.groundY = 0;

    const rid = `r:${city}:${door.poiIndex}`;
    this.worldKey = rid;
    try {
      this.world = new RestaurantWorld(this.scene, door.poi, city, this);
      await this.world.build((pct, label) => UI.setLoading(pct, label));
    } catch (err) {
      console.error("[restaurant] failed to open:", err);
      try { this.world?.dispose(); } catch { /* already broken */ }
      this.world = null;
      await this.loadWorld(city);
      UI.fadeOut();
      UI.addSystem(`hmm, ${door.poi.n} seems closed tonight 😅`);
      return;
    }

    // spawn just inside the door
    const sx = 0, sz = this.world.D / 2 - 2.2;
    this.controls.pos.set(sx, 0, sz);
    this.controls.yaw = 0;
    this.controls.pitch = 0.3;
    this.controls.dist = 7;
    this.camera.position.set(sx, 3, sz + 5);

    this.bloom.strength = 0.22;
    this.bloom.threshold = 0.9;
    this.renderer.toneMappingExposure = 1.0; // candlelit, not floodlit
    this.avatarLight.intensity = 0; // the room lights itself — this was washing out the table
    UI.setLocation(door.poi.n, `${this.world.cuisine} · a table for two`);
    UI.setAttribution("");
    Net.sendWorld({ world: rid, x: sx, z: sz });
    if (this.remoteState?.world === rid) this._spawnRemote(this.remoteState);
    UI.fadeOut();
  }

  // ------------------------------------------------------------- campuses
  async enterCampus(key) {
    const city = this.worldKey;
    const cfg = CAMPUSES[key];
    this.returnSpot = { city, ...this.campusDoors?.[key] };
    UI.fadeIn(`🎓 walking into ${cfg.name}…`);
    await new Promise((r) => setTimeout(r, 650));

    if (this.drive) { this.drive.speed = 0; this.exitCar(); }
    this.remoteCar = null;
    for (const g of this.liveCars) this.scene.remove(g);
    this.liveCars = [];
    this.effects.clear();
    this._removeRemote();
    for (const e of this.extras) this.scene.remove(e.group);
    this.extras = [];
    this.portals = [];
    this.interactables = [];
    this.eiffel = null;
    this.towerCenter = null;
    if (this.world) this.world.dispose();
    this.world = null;
    this.groundY = 0;

    const cid = `c:${city}:${key}`;
    this.worldKey = cid;
    try {
      this.world = new CampusWorld(this.scene, key, this);
      await this.world.build((pct, label) => UI.setLoading(pct, label));
    } catch (err) {
      console.error("[campus] failed to open:", err);
      try { this.world?.dispose(); } catch { /* already broken */ }
      this.world = null;
      await this.loadWorld(city);
      UI.fadeOut();
      UI.addSystem(`hmm, ${cfg.name} seems closed today 😅`);
      return;
    }

    const sx = 0, sz = this.world.D / 2 - 2.4;
    this.controls.pos.set(sx, 0, sz);
    this.controls.yaw = 0;
    this.controls.pitch = 0.3;
    this.controls.dist = 8;
    this.camera.position.set(sx, 3, sz + 5);
    this.bloom.strength = 0.18;
    this.bloom.threshold = 0.92;
    this.renderer.toneMappingExposure = 1.05; // bright tropical daylight inside
    this.avatarLight.intensity = 0;
    UI.setLocation(cfg.name, cfg.sub);
    UI.setAttribution("");
    Net.sendWorld({ world: cid, x: sx, z: sz });
    if (this.remoteState?.world === cid) this._spawnRemote(this.remoteState);
    UI.fadeOut();
  }

  async exitCampus() {
    const back = this.returnSpot;
    this.seatedAt = null;
    this.controls.enabled = true;
    UI.fadeIn("🌴 back out into the heat…");
    await new Promise((r) => setTimeout(r, 600));
    await this.loadWorld(back.city);
    const [x, z] = this.world.findClearSpot(back.x ?? 0, back.z ?? 0, 3);
    this.controls.pos.set(x, 0, z);
    Net.sendWorld({ world: back.city, x, z });
    UI.fadeOut();
  }

  async exitRestaurant() {
    const back = this.returnSpot;
    this.seatedAt = null;
    this.controls.enabled = true;
    UI.fadeIn("🌙 back out into the evening…");
    await new Promise((r) => setTimeout(r, 600));
    await this.loadWorld(back.city);
    const [x, z] = this.world.findClearSpot(back.x, back.z, 3);
    this.controls.pos.set(x, 0, z);
    Net.sendWorld({ world: back.city, x, z });
    UI.fadeOut();
  }

  // ---------------------------------------------------------------- loop
  start() {
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (!this.world) return; // mid-travel: old world disposed, new one still loading

    // local movement — in photoreal mode a steep rise in terrain is a wall
    const photoreal = !!this.world.isPhotoreal;
    const headY = this.groundY + 2.5;
    let speed = 0;
    if (this.drive) {
      this._driveFrame(dt); // car physics owns the position this frame
    } else {
      const blocked = this.summit
        ? (x, z) => Math.hypot(x - this.towerCenter.x, z - this.towerCenter.z) > 3.6 // stay on the platform
        : photoreal
          ? (x, z) => {
              const gy = this.world.groundHeight(x, z, true, headY);
              return gy !== null && gy - this.groundY > 2.0;
            }
          : (x, z) => this.world.blocked(x, z);
      speed = this.controls.update(dt, blocked, this.world.data.radius);
    }
    this.controls.enabled = !UI.dialogOpen() && !UI.chatOpen() && !UI.travelOpen() &&
      !UI.dineOpen() && !this.seatedAt;

    const p = this.controls.pos;
    if (photoreal) {
      // cast from head height so bridges/arches overhead don't grab the avatar
      let gy = this.world.groundHeight(p.x, p.z, true, headY);
      if (gy === null) gy = this.world.groundHeight(p.x, p.z); // fresh terrain: try from the sky
      // a wild jump is almost always a stale/coarse-LOD reading — re-verify
      if (gy !== null && Math.abs(gy - this.groundY) > 25) {
        gy = this.world.groundHeight(p.x, p.z, true);
      }
      if (gy !== null) {
        // snap down fast, climb smoothly
        const k = gy < this.groundY ? Math.min(1, dt * 14) : Math.min(1, dt * 9);
        this.groundY += (gy - this.groundY) * k;
      }
    } else if (this.summit) {
      this.groundY = 277.6; // the top platform of the tower
    } else if (this.world.surfaceY) {
      // stylized city: stand on whatever surface is underfoot (road/sidewalk)
      const sy = this.world.surfaceY(p.x, p.z);
      this.groundY += (sy - this.groundY) * Math.min(1, dt * 14);
    } else {
      this.groundY = 0;
    }
    if (this.seatedAt) {
      // seated (dinner chair or park bench): park the avatar
      this.avatar.group.position.set(this.seatedAt.x, this.seatedAt.y ?? 0.22, this.seatedAt.z);
      this.avatar.group.rotation.y = this.seatedAt.ry;
      this.controls.yaw += dt * (this.seatedAt.bench ? 0.025 : 0.04); // slow cinematic drift
    } else if (!this.drive) { // driving: _driveFrame already seated us in the car
      this.avatar.group.position.set(p.x, this.groundY + p.y, p.z);
    }
    this.avatarLight.position.set(p.x, this.groundY + p.y + 3.2, p.z);
    // smooth heading turn — but never fight the chair (or the car) while seated
    if (!this.seatedAt && !this.drive) {
      let dh = this.controls.heading - this.avatar.group.rotation.y;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.avatar.group.rotation.y += dh * Math.min(1, dt * 12);
    }
    this.avatar.animate(dt, this.seatedAt || this.drive ? 0 : speed, t);

    this.controls.updateCamera(
      dt,
      photoreal
        // "inside a building" = below the top surface at that spot, with a pass
        // for being under the tower/bridges (surface far above ≈ open air)
        ? (x, z, y) => {
            const s = this.world.groundHeight(x, z);
            return s !== null && s > y + 1.2 && s - y < 40;
          }
        : (x, z, y) => this.world.blockedAt(x, z, y),
      this.groundY,
      photoreal ? (origin, dir, far) => this.world.rayDistance(origin, dir, far) : null
    );
    if (this.world.isInterior) {
      // keep the camera INSIDE the room — never above the ceiling or
      // through a wall looking back in
      this.controls.pitch = Math.min(this.controls.pitch, 0.6);
      this.controls.dist = Math.min(this.controls.dist, 7.5);
      const cp = this.camera.position;
      const hw = this.world.W / 2 - 0.7, hd = this.world.D / 2 - 0.7;
      const fy = (this.world.floor ?? 0) * 3.8;
      cp.x = Math.max(-hw, Math.min(hw, cp.x));
      cp.z = Math.max(-hd, Math.min(hd, cp.z));
      cp.y = Math.max(fy + 0.7, Math.min(fy + 3.05, cp.y));
      this.camera.lookAt(p.x, this.groundY + 1.4, p.z);
    }
    this.world.updateSun(p);
    this.world.tick(t, dt);
    for (const e of this.extras) e.tick?.(t, dt);
    this.effects.update(dt);

    // photogrammetry streams in over time — keep landmarks seated on it
    if (photoreal) {
      this.extraSettleTimer -= dt;
      if (this.extraSettleTimer <= 0) {
        this.extraSettleTimer = 2;
        for (const e of this.extras) {
          const g = e.group;
          // low origin so the tower sparkles seat at the tower BASE, not on a platform
          const gy = this.world.groundHeight(g.position.x, g.position.z, true, this.groundY + 20)
            ?? this.world.groundHeight(g.position.x, g.position.z);
          if (gy !== null) g.position.y = gy;
        }
        UI.setAttribution("Google · " + (this.world.attributions() || "Photorealistic 3D Tiles"));
      }
    }

    // remote interpolation
    if (this.remote) {
      const r = this.remote;
      const tgt = r.target;
      const g = r.avatar.group;
      // in photoreal mode trust OUR terrain for their feet (different clients
      // can stream different LODs; the bot doesn't know terrain at all)
      let ty = tgt.y;
      if (photoreal) {
        // smooth out LOD differences between clients, but never override the
        // sender by more than a few meters — their own ground truth wins
        const rg = this.world.groundHeight(tgt.x, tgt.z, true, tgt.y + 3);
        if (rg !== null && Math.abs(rg - tgt.y) < 6) {
          ty = rg + Math.max(0, Math.min(3, tgt.y - rg));
        }
      }
      g.position.x += (tgt.x - g.position.x) * Math.min(1, dt * 10);
      g.position.y += (ty - g.position.y) * Math.min(1, dt * 10);
      g.position.z += (tgt.z - g.position.z) * Math.min(1, dt * 10);
      let rdh = tgt.ry - g.rotation.y;
      while (rdh > Math.PI) rdh -= Math.PI * 2;
      while (rdh < -Math.PI) rdh += Math.PI * 2;
      g.rotation.y += rdh * Math.min(1, dt * 10);
      r.avatar.animate(dt, tgt.speed, t);

      // partner in a car: their car follows them, they sit inside it
      const cs = this.remoteCarState;
      if (cs?.on && cs.world === this.worldKey) {
        if (cs.seat === "driver" && this.remoteCar) {
          const car = this.remoteCar.group;
          const prevX = car.position.x, prevZ = car.position.z;
          car.position.set(
            g.position.x,
            this.world.surfaceY ? this.world.surfaceY(g.position.x, g.position.z) : 0,
            g.position.z
          );
          car.rotation.y = g.rotation.y;
          const moved = Math.hypot(car.position.x - prevX, car.position.z - prevZ);
          for (const w of this.remoteCar.wheels) w.spin.rotation.x += moved / w.r;
          this._seatAvatarInCar(r.avatar, this.remoteCar, "driver");
        } else if (cs.seat === "passenger" && this.drive?.seat === "driver") {
          this._seatAvatarInCar(r.avatar, this.drive, "passenger");
        }
      }
    }

    // network: send our position ~10x/s
    this.moveTimer += dt;
    if (this.moveTimer > 0.1) {
      this.moveTimer = 0;
      Net.sendMove({
        x: +p.x.toFixed(2),
        y: +this.avatar.group.position.y.toFixed(2), // absolute, includes terrain
        z: +p.z.toFixed(2),
        ry: +this.avatar.group.rotation.y.toFixed(3),
        speed: +speed.toFixed(2),
      });
    }

    // interaction prompt
    let prompt = null;
    if (this.drive) {
      prompt = this.drive.seat === "passenger"
        ? "press E · hop out 💕"
        : Math.abs(this.drive.speed) < 2.5 ? "press E · park & step out 🚗" : null;
    } else if (this.world.isInterior) {
      prompt = this.world.prompt(p);
    } else if (this.seatedAt?.bench) {
      prompt = "press E · stand up 🌙";
    } else if (this.summit) {
      prompt = "press E · ride back down 🛗";
    }
    if (!this.drive) {
      for (const it of this.interactables) {
        if (prompt) break;
        if (Math.hypot(it.x - p.x, it.z - p.z) < it.range) { prompt = it.prompt; break; }
      }
      if (!prompt && !this.world.isInterior && !this.seatedAt && !this.summit) {
        const spot = this._nearCarSpot(2.8);
        if (spot) {
          const partnerDriving = this.remoteCarState?.on &&
            this.remoteCarState.seat === "driver" && this.remoteCarState.i === spot.index &&
            this.remoteCarState.world === this.worldKey;
          if (partnerDriving) prompt = `press E · hop in with ${this.remote?.name ?? "them"} 💕`;
          else if (!spot.taken) prompt = `press E · drive the ${modelParts(spot.model).spec.name} 🚗`;
        }
      }
    }
    UI.setPrompt(prompt);

    // the Eiffel moment 💞
    if (this.worldKey === "paris" && this.towerCenter) {
      const nearR = this.world.isPhotoreal ? 230 : 110; // photoreal: the whole tower end of the Champ
      const near = Math.hypot(p.x - this.towerCenter.x, p.z - this.towerCenter.z) < nearR;
      const partnerNear = this.remote &&
        Math.hypot(this.remote.avatar.group.position.x - this.towerCenter.x,
                   this.remote.avatar.group.position.z - this.towerCenter.z) < nearR;
      const together = near && partnerNear;
      if (together !== this.togetherAtTower) {
        this.togetherAtTower = together;
        this.eiffel?.setSparkleBoost(together ? 1.6 : 0.45);
        UI.setBanner(together ? STORY.togetherBanner : null);
      }
      if (together) {
        this.fireworkTimer -= dt;
        if (this.fireworkTimer <= 0) {
          this.fireworkTimer = 0.9 + Math.random() * 0.9;
          this.effects.firework({ ...this.towerCenter, y: this.groundY });
        }
      }
    } else if (this.togetherAtTower) {
      this.togetherAtTower = false;
      UI.setBanner(null);
    }

    this.composer.render();
  }
}
