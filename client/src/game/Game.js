import * as THREE from "three";
import { WorldBuilder, rectPoly } from "./WorldBuilder.js";
import { THEMES } from "./themes.js";
import { STORY } from "./story.js";
import { C, fmt } from "./copy.js";
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
import { CafeWorld } from "./CafeWorld.js";
import { Radio } from "./Radio.js";
import { Minimap } from "./Minimap.js";
import { buildMitExtras } from "./mitCampus.js";
import { AnniversaryShow } from "./AnniversaryShow.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Net } from "../net.js";
import * as UI from "./ui.js";

// Champ de Mars axis (tower → École Militaire), unit vector in world coords
const CHAMP_AXIS = { x: 0.62, z: 0.78 };

// The Tangerang and Gading Serpong maps cover the SAME real geography 5.1km
// apart, and the real road between them exists in both bakes: Jalan Raya
// Legok–Karawaci runs off the Tangerang map exactly where Jalan Scientia
// Boulevard runs off the Serpong map. Drive to the end of one and you roll
// onto the other — same car, same passengers, no teleporting.
const SEAMS = {
  tangerang: {
    to: "serpong",
    dir: [0.4413, 0.8973], cone: 0.984, extend: 280, // drive past the map edge along the corridor
    gate: [1182.5, 2351.6], gateR: 42,               // where this world hands the wheel over
    entryRy: -1.817,                                  // heading when you arrive here from the other side
    label: C.corridor.tangerang,
    walkPoint: [605, 2300],
  },
  serpong: {
    to: "tangerang",
    dir: [-0.4413, -0.8973], cone: 0.984, extend: 180,
    gate: [-388.6, -955.7], gateR: 38,
    entryRy: -0.37,
    label: C.corridor.serpong,
    walkPoint: [-358, -690],
  },
};

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
    this.remoteBench = null;     // partner's bench seat {x,z,ry} while sitting
    this.remoteSummit = false;   // partner is up the Eiffel summit
    this.remoteFloor = null;     // partner's campus floor (interiors)

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
    this._carryCar = null;     // {model, paint, speed} — the car crossing the seam with us
    this._autoRide = false;    // passenger riding through a seam: hop back in on arrival

    // the car radio — their playlist, synced between driver and passenger
    this.radio = new Radio();
    this.radio.load();
    UI.initRadio(this.radio);

    // the anniversary finale fired from the top of the Eiffel Tower
    this.annivShow = new AnniversaryShow(this.scene);

    // minimap + GPS to her café
    this.minimap = new Minimap();
    this._mmDests = [null];
    this._mmIdx = 0;
    document.getElementById("minimap")?.addEventListener("click", () => {
      if (!this._mmDests.length) return;
      this._mmIdx = (this._mmIdx + 1) % this._mmDests.length;
      this.minimap.setDest(this._mmDests[this._mmIdx]);
    });

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
        // (re)spawn only when there's no avatar or the partner is a new session
        if (!this.remote || this.remote.id !== partner.id) this._spawnRemote(partner);
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
      if (m.kind === "radio" && m.data && this.drive && m.data.w === this.worldKey) {
        this.radio.onRemote(m.data);
      }
      if (m.kind === "cafe" && m.data && this.world?.isCafe) {
        this.world.apply(m.data);
      }
      if (m.kind === "dine" && m.data && this.world?.isRestaurant) {
        this.world.apply(m.data);
      }
      if (m.kind === "bench" && m.data) {
        this.remoteBench = m.data.a === "sit" ? { x: m.data.x, z: m.data.z, ry: m.data.ry } : null;
      }
      if (m.kind === "summit" && m.data) {
        this.remoteSummit = !!m.data.up;
      }
      if (m.kind === "campusFloor" && m.data && m.data.world === this.worldKey) {
        this.remoteFloor = m.data.floor;
      }
      if (m.kind === "anniv" && this.worldKey === "paris") {
        // the partner set off the fireworks — share the moment
        this.startAnniversary(false);
      }
      if (m.kind === "convoy" && m.data) {
        // our driver just crossed into the next city — ride along
        if (this.drive?.seat === "passenger" && m.data.from === this.worldKey) {
          this._followConvoy(m.data.to);
        }
      }
      if (m.kind === "hello") {
        // partner just arrived somewhere — if we're driving, let them see it
        if (this.drive && this.drive.seat === "driver") {
          const g = this.drive.group;
          const s = this.drive.spot;
          Net.sendEvent("car", {
            i: s.index, on: true, seat: "driver", world: this.worldKey,
            m: s.model, pt: s.paint,
            x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2), ry: +g.rotation.y.toFixed(3),
          });
        } else if (this.drive) {
          Net.sendEvent("car", {
            i: this.drive.spot.index, on: true, seat: this.drive.seat, world: this.worldKey,
          });
        }
        if (this.world?.isCafe && m.data?.world === this.worldKey) {
          // they walked into the café mid-shift — hand them the state
          this.world.apply({ a: "hello" });
        }
        if (this.world?.isRestaurant && m.data?.world === this.worldKey) {
          // they walked into the restaurant mid-dinner — catch them up
          this.world.apply({ a: "hello" });
        }
        if (this.world?.isCampus && m.data?.world === this.worldKey) {
          // tell the newcomer which storey we're on
          Net.sendEvent?.("campusFloor", { world: this.worldKey, floor: this.world.floor });
        }
        if (this.summit) {
          // tell the newcomer we're up the tower
          Net.sendEvent?.("summit", { up: true });
        }
        if (this.annivShow?.active && this.worldKey === "paris") {
          // the fireworks are already going — start them for the newcomer too
          Net.sendEvent?.("anniv", { world: "paris" });
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
    // ALWAYS clear any existing remote first, or a previously-spawned avatar
    // gets orphaned in the scene (a "ghost" that never moves). This can happen
    // if a `players` update arrives during loadWorld's async build and spawns
    // the partner before loadWorld re-spawns them.
    this._removeRemote();
    const avatar = new Avatar(state.role, state.name, { outfit: state.outfit ?? 0 });
    avatar.group.position.set(state.x, state.y, state.z);
    this.scene.add(avatar.group);
    this.remote = { avatar, target: state, name: state.name, heading: state.ry, id: state.id };
  }

  _removeRemote() {
    // clear partner presence overrides so they never leak across worlds
    this.remoteBench = null;
    this.remoteSummit = false;
    this.remoteFloor = null;
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
    if (w.startsWith("f:")) return "her café ☕";
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
      if (e.code === "KeyR" && this.drive) this.radio.toggle();
      if (e.code === "KeyN" && this.drive) this.radio.next();
      if (e.code === "KeyT" && this.world?.isInterior) this.world.drawTopic();
      // the anniversary surprise — fired by Him from the top of the tower
      if (e.code === "KeyY" && this.summit && this.worldKey === "paris" && this.role === "you") {
        this.startAnniversary(true);
      }
      if (e.code === "KeyM") {
        if (this.world?.isInterior) {
          UI.addSystem(this.worldKey?.startsWith("c:")
            ? C.system.travelBlockedCampus
            : C.system.travelBlockedDinner);
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
      const res = await fetch(`/data/${key}.json`, { cache: "no-cache" }); // revalidate — city bakes change
      if (!res.ok) throw new Error(`failed to load map data for ${key}`);
      this.dataCache[key] = await res.json();
    }
    return this.dataCache[key];
  }

  async travel(to) {
    if (to === this.worldKey) return;
    UI.fadeIn(fmt(C.system.flyingTo, { city: THEMES[to].title }));
    await new Promise((r) => setTimeout(r, 750));
    try {
      await this.loadWorld(to);
    } catch (err) {
      console.error("[game] travel failed:", err);
      UI.fadeIn(fmt(C.system.loadFailed, { city: THEMES[to].title, error: String(err.message || err) }));
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
    this.annivShow.clear();
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

    // minimap: roads of this city + GPS destinations (click the map to cycle)
    if (data) {
      this._mmDests = this._minimapDests(key);
      this._mmIdx = 0;
      this.minimap.setWorld(data, theme, this._mmDests[0]);
    } else {
      this.minimap.hide();
    }

    // spawn — arriving through the road seam puts you at the corridor mouth.
    // this world's own gate is the SAME spot, so it stays disarmed until
    // you've driven clear of it (no ping-ponging between cities).
    const seamIn = (this._carryCar || this._autoRide) && SEAMS[key];
    if (seamIn && key === "tangerang") {
      // arriving home by road — the GPS should point home, not back at the gate
      this._mmIdx = 1;
      this.minimap.setDest(this._mmDests[1]);
    }
    this._seamLock = seamIn
      ? { x: SEAMS[key].gate[0], z: SEAMS[key].gate[1], r: SEAMS[key].gateR + 35 }
      : null;
    const spawn = seamIn
      ? [SEAMS[key].gate[0], SEAMS[key].gate[1], SEAMS[key].entryRy + Math.PI]
      : this._spawnPoint(key);
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
        // a `players` update during the async build above may have already
        // spawned them — only spawn if missing or it's a different session
        if (!this.remote || this.remote.id !== this.remoteState.id) this._spawnRemote(this.remoteState);
        UI.setPartnerStatus(`💞 ${this.remoteState.name} is here with you`);
      } else {
        this._removeRemote(); // partner isn't here — make sure no ghost lingers
        UI.setPartnerStatus(STORY.partnerWorld(this.remoteState.name, THEMES[this.remoteState.world]?.title ?? ""));
      }
    }

    // ask the partner to repeat anything we missed (like "I'm driving")
    Net.sendEvent?.("hello", { world: key });
    if (this.remoteCarState?.on) this._syncRemoteCar(this.remoteCarState);

    // we crossed the seam IN a car — roll straight onto this city's corridor
    if (this._carryCar && SEAMS[key]) {
      const seam = SEAMS[key];
      const carry = this._carryCar;
      this._carryCar = null;
      const idx = this.world.carSpots ? this.world.carSpots.length : 0;
      const sy = this.world.surfaceY ? this.world.surfaceY(seam.gate[0], seam.gate[1]) : 0;
      const spot = {
        x: seam.gate[0], z: seam.gate[1], y: sy, ry: seam.entryRy,
        model: carry.model, paint: carry.paint, index: idx, taken: false,
        collider: this.world.addCollider?.(
          rectPoly(seam.gate[0], seam.gate[1], 1.1, 2.6, seam.entryRy), 1.7),
      };
      (this.world.carSpots ??= []).push(spot);
      this.enterCar(spot, "driver");
      if (this.drive) this.drive.speed = carry.speed;
    }
  }

  // GPS destinations per city — first one is the default
  _minimapDests(key) {
    if (key === "tangerang") return [
      { x: SEAMS.tangerang.gate[0], z: SEAMS.tangerang.gate[1], label: C.minimap.tangerangCafe },
      { x: this.homePos?.x ?? 2, z: this.homePos?.z ?? 44, label: C.minimap.tangerangHome },
      null,
    ];
    if (key === "serpong") return [
      { x: 20, z: -38.6, label: C.minimap.serpongCafe },
      { x: SEAMS.serpong.gate[0], z: SEAMS.serpong.gate[1], label: C.minimap.serpongHome },
      null,
    ];
    if (key === "paris" && this.towerCenter) return [
      { x: this.towerCenter.x, z: this.towerCenter.z, label: C.minimap.parisTower },
      null,
    ];
    return [null];
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
        prompt: C.prompts.plaque,
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
          prompt: C.prompts.summitLift,
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
        prompt: C.prompts.bench,
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
            prompt: fmt(C.prompts.campus, { school: CAMPUSES[ck].name }),
            onInteract: () => this.enterCampus(ck),
          });
        }
        // the road out to Gading Serpong — KEEP DRIVING southeast down
        // Jl. Raya Legok–Karawaci and you roll straight into Serpong.
        // (the beacon is for walkers; drivers just follow the GPS)
        const [sgx, sgz] = this.world.findClearSpot(SEAMS.tangerang.walkPoint[0], SEAMS.tangerang.walkPoint[1], 4);
        addExtra(buildBeacon(sgx, sgz, "☕", 0xffd27a, 34));
        this.interactables.push({
          x: sgx, z: sgz, range: 8,
          prompt: C.prompts.rideToSerpong,
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
        // Boston: the whole MIT campus, hand-built — Great Dome, Stata,
        // Kresge, Chapel, Media Lab, Simmons, Sloan, Killian Court, the
        // sculptures and courts (mitCampus.js, anchored to the OSM bake)
        buildMitExtras(this, addExtra);
        [hx, hz] = this.world.findClearSpot(0, 0, 4);
      }
      this.homePos = { x: hx, z: hz };
      const marker = buildHomeMarker(hx, hz, home.label);
      addExtra(marker);
      this.interactables.push({
        x: hx, z: hz, range: 4,
        prompt: C.prompts.loveNote,
        onInteract: () => UI.showDialog(home.speaker, home.pages),
      });
    }

    // --- Gading Serpong: the café she just bought (CARS LAND block) ---
    if (key === "serpong") {
      const [mx, mz] = this.world.findClearSpot(27, -32, 3);
      this.homePos = { x: mx, z: mz };
      addExtra(buildHomeMarker(mx, mz, C.love.cafeMarkerSpeaker));
      this.interactables.push({
        x: mx, z: mz, range: 4,
        prompt: C.prompts.loveNote,
        onInteract: () => UI.showDialog(C.love.cafeMarkerSpeaker, C.love.cafeMarkerPages),
      });
      // parking apron in front of her row, like the Street View: bays + MPVs
      // (kept clear of the north-south lane at x≈45 — the rail used to
      // cross the road there, which made no sense)
      const lot = buildCarPark(26, 18);
      lot.group.position.set(25, 0, -66);
      lot.group.rotation.y = -0.14; // aligned with the tilted ruko grid
      addExtra(lot);
      let li = 0;
      for (const spot of this.world.carSpots) {
        if (li >= 4) break;
        const car = makeDriveCar(spot.model, spot.paint);
        car.headlight.intensity = 0;
        const bayX = 25 - 9 + li * 6, bayZ = -70 + (25 - 9 + li * 6 - 25) * -0.14;
        car.group.position.set(bayX, 0.05, bayZ);
        car.group.rotation.y = -0.14;
        this.scene.add(car.group);
        this.liveCars.push(car.group);
        this.world.addCollider?.(rectPoly(bayX, bayZ, 1.1, 2.5, -0.14), 1.7);
        li++;
      }

      // the road back home — Scientia Boulevard north, or press E to ride
      const [ggx, ggz] = this.world.findClearSpot(SEAMS.serpong.walkPoint[0], SEAMS.serpong.walkPoint[1], 4);
      addExtra(buildBeacon(ggx, ggz, "🛣️", 0xffd27a, 32));
      this.interactables.push({
        x: ggx, z: ggz, range: 8,
        prompt: C.prompts.rideHome,
        onInteract: () => this.travel("tangerang"),
      });
    }

    // --- sittable park benches: sit together and just enjoy ---
    if (this.world.benchSpots?.length) {
      for (const b of this.world.benchSpots) {
        this.interactables.push({
          x: b.x, z: b.z, range: 2.2,
          prompt: C.prompts.benchTogether,
          onInteract: () => this.sitOnBench(b),
        });
      }
    }

    // --- restaurant doors: every real café/restaurant is enterable ---
    if (this.world.restaurantDoors?.length) {
      for (const door of this.world.restaurantDoors) {
        // HER café is not a restaurant — it's a shift behind the counter 💛
        if (key === "serpong" && door.poi.n === "Her Café") {
          this.interactables.push({
            x: door.x, z: door.z, range: 3.2,
            prompt: C.prompts.enterHerCafe,
            onInteract: () => this.enterCafe(door),
          });
          continue;
        }
        this.interactables.push({
          x: door.x, z: door.z, range: 2.8,
          prompt: fmt(C.prompts.dine, { restaurant: door.poi.n }),
          onInteract: () => this.enterRestaurant(door),
        });
      }
    }

    // (the old glowing travel rings are gone — sci-fi portals standing in
    // real streets broke the realism. press M to fly between cities.)

    // --- a local who tells you where everything is ---
    if (!this.world.isPhotoreal) {
      const def = C.guides[key];
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
          prompt: fmt(C.prompts.askGuide, { name: def.name }),
          onInteract: () => UI.showDialog(`🧭 ${def.name}`, def.pages),
        });
      }
    }
  }

  // --------------------------------------------------------------- summit
  async enterSummit() {
    const tc = this.towerCenter;
    UI.fadeIn(C.system.summitGoingUp);
    await new Promise((r) => setTimeout(r, 900));
    this.summit = true;
    this.controls.pos.set(tc.x + 1.6, 0, tc.z + 1.6);
    this.groundY = 277.6;
    this.controls.pitch = 0.12;
    this.controls.dist = 9;
    this.camera.position.set(tc.x + 6, 283, tc.z + 6);
    UI.addSystem(this.role === "you"
      ? C.anniversary.summitHim
      : C.anniversary.summitHer);
    Net.sendEvent?.("summit", { up: true });
    UI.fadeOut();
  }

  // ✈️🎆 the anniversary finale: a plane sweeps the night sky, then fireworks
  // bloom over Paris and spell out HAPPY 5TH ANNIVERSARY. Visible from the
  // summit and from the ground; the partner sees the same show.
  startAnniversary(broadcast) {
    if (this.worldKey !== "paris" || !this.towerCenter || this.annivShow.active) return;
    // place the show out along the Champ de Mars axis, up in the sky
    const tc = this.towerCenter;
    const textCenter = new THREE.Vector3(
      tc.x + CHAMP_AXIS.x * 165,
      300,
      tc.z + CHAMP_AXIS.z * 165,
    );
    const facing = new THREE.Vector3(-CHAMP_AXIS.x, 0, -CHAMP_AXIS.z); // toward the tower
    this.annivShow.start(textCenter, facing);
    // turn the player to face the show so they see it straight away
    const px = this.controls.pos.x, pz = this.controls.pos.z;
    this.controls.yaw = Math.atan2(px - textCenter.x, pz - textCenter.z);
    this.controls.pitch = 0.04;
    // (no text banner — the fireworks themselves spell it out 🎆)
    UI.setBanner(C.anniversary.lookUpBanner);
    setTimeout(() => UI.setBanner(null), 6000);
    if (broadcast) Net.sendEvent("anniv", { world: "paris" });
  }

  async exitSummit() {
    const tc = this.towerCenter;
    UI.fadeIn(C.system.summitComingDown);
    await new Promise((r) => setTimeout(r, 700));
    this.summit = false;
    const [x, z] = this.world.findClearSpot(tc.x + CHAMP_AXIS.x * 45, tc.z + CHAMP_AXIS.z * 45, 3);
    this.controls.pos.set(x, 0, z);
    this.groundY = 0;
    this.controls.dist = 9;
    Net.sendEvent?.("summit", { up: false });
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
    UI.addSystem(C.system.benchSitting);
    // let the partner see us sitting on this exact spot
    Net.sendEvent?.("bench", { a: "sit", x: sx, z: sz, ry: b.ry });
  }

  standUp() {
    const s = this.seatedAt;
    this.seatedAt = null;
    if (s) {
      this.controls.pos.set(s.x + Math.sin(s.ry) * 0.9, 0, s.z + Math.cos(s.ry) * 0.9);
    }
    Net.sendEvent?.("bench", { a: "stand" });
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
      ? fmt(C.system.carDriver, { car: car.spec.name })
      : fmt(C.system.carPassenger, { car: car.spec.name }));
    this.radio.worldKey = this.worldKey;
    this.radio.show(seat === "driver");
    Net.sendEvent("car", {
      i: spot.index, on: true, seat, world: this.worldKey,
      m: spot.model, pt: spot.paint,
      x: +car.group.position.x.toFixed(2), z: +car.group.position.z.toFixed(2),
      ry: +car.group.rotation.y.toFixed(3),
    });
  }

  exitCar(silent = false) {
    const d = this.drive;
    if (!d) return;
    if (d.seat === "driver" && Math.abs(d.speed) > 2.5 && !silent) {
      UI.addSystem(C.system.slowDownToExit);
      return;
    }
    this.drive = null;
    this.avatar.group.visible = true;
    this.avatarLight.intensity = THEMES[this.worldKey]?.night ? 30 : 9;
    this.radio.hide();
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
      if (pose === "gone") {
        // this car was driven away down the corridor — it's in the other city now
        this.world.takeCar(spot);
        spot.taken = true;
        continue;
      }
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
      let spot = this.world.carSpots[data.i];
      if (!spot && data.m) {
        // a car they carried over the seam — it has no spot here, build one
        const sy = this.world.surfaceY ? this.world.surfaceY(data.x ?? 0, data.z ?? 0) : 0;
        spot = {
          x: data.x ?? 0, z: data.z ?? 0, y: sy, ry: data.ry ?? 0,
          model: data.m, paint: data.pt ?? 0xd8d8d8, index: data.i, taken: false,
          collider: this.world.addCollider?.(
            rectPoly(data.x ?? 0, data.z ?? 0, 1.1, 2.6, data.ry ?? 0), 1.7),
        };
        this.world.carSpots[data.i] = spot;
      }
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
      // we rode the seam with them — hop straight back into the passenger seat
      if (this._autoRide) {
        this._autoRide = false;
        this.enterCar(spot, "passenger");
      }
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
    // every model has its own legs — the 911 genuinely outruns the Alphard
    const top = d.spec.top ?? 16;
    const acc = d.spec.acc ?? 9;
    const accel = fwd > 0 ? acc * (1 - 0.6 * Math.max(0, d.speed) / top) : fwd < 0 ? (d.speed > 0.5 ? -16 : -7) : 0;
    d.speed += accel * dt;
    if (!fwd) d.speed *= Math.exp(-dt * 1.6);
    d.speed = Math.max(-7, Math.min(top, d.speed));
    d.steer += (steerIn * 0.55 - d.steer) * Math.min(1, dt * 7);
    // steering authority tapers at speed so high-speed driving stays stable
    const yawRate = Math.max(-1.7, Math.min(1.7, d.speed * 0.24)) * (1 / (1 + Math.max(0, d.speed - 16) * 0.045));
    d.heading -= d.steer * dt * yawRate;

    const nx = p.x + Math.sin(d.heading) * d.speed * dt;
    const nz = p.z + Math.cos(d.heading) * d.speed * dt;
    const hw = d.spec.dims[0] / 2 - 0.08, hl = d.spec.dims[1] / 2 - 0.08;
    const sin = Math.sin(d.heading), cos = Math.cos(d.heading);
    // swept test: fast cars cover >1m per frame — check the midpoint too so
    // thin colliders (fence rails) can't be tunneled through
    const subSteps = Math.hypot(nx - p.x, nz - p.z) > 0.45 ? 2 : 1;
    let hit = false;
    for (let si = 1; si <= subSteps && !hit; si++) {
      const mx = p.x + ((nx - p.x) * si) / subSteps;
      const mz = p.z + ((nz - p.z) * si) / subSteps;
      for (const [lx, lz] of [[hw, hl], [-hw, hl], [hw, -hl], [-hw, -hl]]) {
        if (this.world.blocked(mx + lx * cos + lz * sin, mz - lx * sin + lz * cos)) { hit = true; break; }
      }
    }
    // the world ends at the bake radius — except along the corridor to the
    // next city, where the real road keeps going to the hand-over point
    let maxR = this.world.data.radius + 25;
    const seam = SEAMS[this.worldKey];
    if (seam) {
      const dn = Math.hypot(nx, nz) || 1;
      if ((nx * seam.dir[0] + nz * seam.dir[1]) / dn > seam.cone) {
        maxR = this.world.data.radius + seam.extend;
      }
    }
    if (!hit && Math.hypot(nx, nz) < maxR) {
      p.x = nx; p.z = nz;
    } else if (hit) {
      d.speed = -d.speed * 0.25; // soft bump
    } else {
      d.speed = 0;
    }

    // rolled up to the seam gate → the next city takes over, mid-drive
    if (this._seamLock) {
      if (Math.hypot(p.x - this._seamLock.x, p.z - this._seamLock.z) > this._seamLock.r) {
        this._seamLock = null; // clear of the arrival gate — it's armed again
      }
    } else if (seam && !this._seaming &&
        Math.hypot(p.x - seam.gate[0], p.z - seam.gate[1]) < seam.gateR) {
      this._seamTravel(seam);
      return;
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

  // ------------------------------------------------------------ the seam
  // Driving off the end of one city's corridor rolls you onto the other's.
  // The car comes with you; the passenger's client follows automatically.
  async _seamTravel(seam) {
    if (this._seaming) return;
    this._seaming = true;
    const d = this.drive;
    const carry = {
      model: d.spot.model, paint: d.spot.paint,
      speed: Math.max(7, Math.abs(d.speed)),
    };
    // the car leaves this city for good — its old spot stays empty
    if (!this.worldKey.includes(":")) {
      (this.carMemory[this.worldKey] ??= {})[d.spot.index] = "gone";
    }
    Net.sendEvent("convoy", { to: seam.to, from: this.worldKey });
    this.drive = null; // don't park it — it's coming with us
    // (the radio keeps playing — the song carries you across)
    this.avatar.group.visible = true;
    this._carryCar = carry;
    UI.fadeIn(seam.label);
    await new Promise((r) => setTimeout(r, 650));
    try {
      await this.loadWorld(seam.to);
    } catch (err) {
      console.error("[seam] crossing failed:", err);
      this._carryCar = null;
      this.radio.hide();
      UI.fadeIn(fmt(C.system.roadBackClosed, { error: String(err.message || err) }));
      setTimeout(() => UI.fadeOut(), 4000);
      this._seaming = false;
      return;
    }
    UI.fadeOut();
    this._seaming = false;
  }

  // the passenger's side of the seam: ride along into the next city
  async _followConvoy(to) {
    if (this._seaming) return;
    this._seaming = true;
    this.drive = null;
    this.avatar.group.visible = true;
    this._autoRide = true; // the radio rides along too
    UI.fadeIn(SEAMS[this.worldKey]?.label ?? C.system.ridingAlong);
    await new Promise((r) => setTimeout(r, 500));
    try {
      await this.loadWorld(to);
    } catch (err) {
      console.error("[seam] convoy failed:", err);
      this._autoRide = false;
    }
    UI.fadeOut();
    this._seaming = false;
  }

  // ---------------------------------------------------------- restaurants
  async enterRestaurant(door) {
    const city = this.worldKey;
    this.returnSpot = { city, x: door.x, z: door.z };
    UI.fadeIn(fmt(C.system.enteringRestaurant, { restaurant: door.poi.n }));
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
    this.minimap.hide();

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
      UI.addSystem(fmt(C.system.restaurantClosed, { restaurant: door.poi.n }));
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
    if (this.remoteState?.world === rid && (!this.remote || this.remote.id !== this.remoteState.id)) {
      this._spawnRemote(this.remoteState);
    }
    // if the partner is already inside mid-dinner, ask them to catch us up
    Net.sendEvent?.("hello", { world: rid });
    UI.fadeOut();
  }

  // ------------------------------------------------------------- campuses
  async enterCampus(key) {
    const city = this.worldKey;
    const cfg = CAMPUSES[key];
    this.returnSpot = { city, ...this.campusDoors?.[key] };
    UI.fadeIn(fmt(C.system.enteringCampus, { school: cfg.name }));
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
    this.minimap.hide();

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
      UI.addSystem(fmt(C.system.campusClosed, { school: cfg.name }));
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
    if (this.remoteState?.world === cid && (!this.remote || this.remote.id !== this.remoteState.id)) {
      this._spawnRemote(this.remoteState);
    }
    // if the partner is already inside on an upper floor, learn which one
    Net.sendEvent?.("hello", { world: cid });
    UI.fadeOut();
  }

  async exitCampus() {
    const back = this.returnSpot;
    this.seatedAt = null;
    this.controls.enabled = true;
    UI.fadeIn(C.system.backOutsideHeat);
    await new Promise((r) => setTimeout(r, 600));
    await this.loadWorld(back.city);
    const [x, z] = this.world.findClearSpot(back.x ?? 0, back.z ?? 0, 3);
    this.controls.pos.set(x, 0, z);
    Net.sendWorld({ world: back.city, x, z });
    UI.fadeOut();
  }

  // ------------------------------------------------------------ her café
  async enterCafe(door) {
    const city = this.worldKey;
    this.returnSpot = { city, x: door.x, z: door.z };
    UI.fadeIn(C.system.tyingAprons);
    await new Promise((r) => setTimeout(r, 650));

    if (this.drive) { this.drive.speed = 0; this.exitCar(); }
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
    this.minimap.hide();

    const fid = `f:${city}`;
    this.worldKey = fid;
    try {
      this.world = new CafeWorld(this.scene, door.poi, city, this);
      await this.world.build((pct, label) => UI.setLoading(pct, label));
    } catch (err) {
      console.error("[cafe] failed to open:", err);
      try { this.world?.dispose(); } catch { /* already broken */ }
      this.world = null;
      await this.loadWorld(city);
      UI.fadeOut();
      UI.addSystem(C.system.cafeStuck);
      return;
    }

    const sx = 0, sz = this.world.D / 2 - 2.2;
    this.controls.pos.set(sx, 0, sz);
    this.controls.yaw = 0;
    this.controls.pitch = 0.3;
    this.controls.dist = 8;
    this.camera.position.set(sx, 3, sz + 5);
    this.bloom.strength = 0.2;
    this.bloom.threshold = 0.92;
    this.renderer.toneMappingExposure = 1.12; // bright, milky café daylight
    this.avatarLight.intensity = 0;
    UI.setLocation(door.poi.n, "hers · the two of you on shift ☕");
    UI.setAttribution("");
    Net.sendWorld({ world: fid, x: sx, z: sz });
    if (this.remoteState?.world === fid && (!this.remote || this.remote.id !== this.remoteState.id)) {
      this._spawnRemote(this.remoteState);
    }
    // ask whoever's already on shift for the current floor state (customers,
    // earnings) — the café "hello" handler makes the leader send a snapshot
    Net.sendEvent?.("hello", { world: fid });
    UI.fadeOut();
  }

  async exitCafe() {
    const back = this.returnSpot;
    this.seatedAt = null;
    this.controls.enabled = true;
    UI.fadeIn(C.system.cafeClosingSign);
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
    UI.fadeIn(C.system.backOutsideEvening);
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
      // Interior camera: small rooms make a normal chase boom collapse into
      // the player at a back wall. Instead of snapping (which jitters and
      // flips between angles), drive a dedicated, smoothly-lerped camera:
      // keep the player's view azimuth, back up as far as the room allows,
      // and rise + look down over the shoulder when boxed in.
      this.controls.pitch = Math.min(this.controls.pitch, 0.6);
      this.controls.dist = Math.min(this.controls.dist, 7.5);
      const hw = this.world.W / 2 - 0.7, hd = this.world.D / 2 - 0.7;
      const fy = (this.world.floor ?? 0) * 3.8;
      const azi = this.controls.yaw;                 // camera sits behind the player here
      const sinA = Math.sin(azi), cosA = Math.cos(azi);
      const hitsWall = (x, z) => Math.abs(x) > hw || Math.abs(z) > hd ||
        (this.world.blockedAt ? this.world.blockedAt(x, z, fy + 1.4) : this.world.blocked(x, z));
      // how far the boom can back up along the azimuth before a wall/counter
      const want = Math.min(this.controls.dist, 6.5);
      let avail = want;
      for (let d = 1.2; d <= want; d += 0.35) {
        if (hitsWall(p.x + sinA * d, p.z + cosA * d)) { avail = Math.max(1.3, d - 0.5); break; }
      }
      // rate-limit how fast the standoff distance can change, so a wall edge
      // sweeping across the boom glides the camera in/out instead of stepping
      const targetStandoff = Math.max(avail, 1.3);
      if (this._interiorStandoff === undefined) this._interiorStandoff = targetStandoff;
      const step = 6 * dt; // ≤ 6 m/s
      this._interiorStandoff += Math.max(-step, Math.min(step, targetStandoff - this._interiorStandoff));
      const standoff = this._interiorStandoff;
      const cramp = Math.max(0, Math.min(1, (2.6 - standoff) / 1.6)); // 0 roomy … 1 boxed in
      const tx = p.x + sinA * standoff;
      const tz = p.z + cosA * standoff;
      const ty = Math.min(fy + 3.05, fy + 1.5 + cramp * 1.5 + Math.sin(this.controls.pitch) * standoff * 0.6);
      // smoothed state — lerping toward the target removes any per-frame jump
      if (!this._interiorCam) this._interiorCam = new THREE.Vector3(tx, ty, tz);
      const ic = this._interiorCam;
      const k = Math.min(1, dt * 9);
      ic.x += (tx - ic.x) * k; ic.y += (ty - ic.y) * k; ic.z += (tz - ic.z) * k;
      ic.x = Math.max(-hw, Math.min(hw, ic.x));
      ic.z = Math.max(-hd, Math.min(hd, ic.z));
      ic.y = Math.max(fy + 0.8, Math.min(fy + 3.05, ic.y));
      this.camera.position.copy(ic);
      this.camera.lookAt(p.x, this.groundY + 1.4, p.z);
    } else if (this._interiorCam) {
      this._interiorCam = null; // reset when we leave the room
      this._interiorStandoff = undefined;
    }
    this.world.updateSun(p);
    this.world.tick(t, dt);
    for (const e of this.extras) e.tick?.(t, dt);
    this.effects.update(dt);
    this.annivShow.update(dt);
    this.radio.tick(dt);

    // minimap: rotate so "up" is the way you're facing/driving
    if (!this.world.isInterior && this.minimap.world) {
      const rot = this.drive
        ? (this.drive.seat === "passenger" && this.remoteCar
            ? this.remoteCar.group.rotation.y
            : this.drive.heading) + Math.PI
        : Math.atan2(p.x - this.camera.position.x, p.z - this.camera.position.z) + Math.PI;
      const partnerPos = this.remote ? {
        x: this.remote.avatar.group.position.x,
        z: this.remote.avatar.group.position.z,
      } : null;
      this.minimap.update(dt, p.x, p.z, rot, !!this.drive, partnerPos);
    }

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
      // partner sitting on a bench: pin them to the seat in an idle pose
      const benched = this.remoteBench && this.worldKey === "paris";
      if (benched) {
        g.position.set(this.remoteBench.x, 0.27, this.remoteBench.z);
        g.rotation.y = this.remoteBench.ry;
      } else {
        g.position.x += (tgt.x - g.position.x) * Math.min(1, dt * 10);
        g.position.y += (ty - g.position.y) * Math.min(1, dt * 10);
        g.position.z += (tgt.z - g.position.z) * Math.min(1, dt * 10);
        let rdh = tgt.ry - g.rotation.y;
        while (rdh > Math.PI) rdh -= Math.PI * 2;
        while (rdh < -Math.PI) rdh += Math.PI * 2;
        g.rotation.y += rdh * Math.min(1, dt * 10);
      }
      r.avatar.animate(dt, benched ? 0 : tgt.speed, t);

      // hide the partner avatar when we're on different "levels" so they
      // never float in the sky or clip through a floor: one of us up the
      // Eiffel summit, or on a different campus storey
      let coLocated = true;
      if (this.summit !== this.remoteSummit) coLocated = false;
      if (this.world?.isCampus && this.remoteFloor !== null && this.remoteFloor !== this.world.floor) coLocated = false;
      if (g.visible !== coLocated) g.visible = coLocated;

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
        ? C.prompts.hopOut
        : Math.abs(this.drive.speed) < 2.5 ? C.prompts.parkCar : null;
    } else if (this.world.isInterior) {
      prompt = this.world.prompt(p);
    } else if (this.seatedAt?.bench) {
      prompt = C.prompts.standUp;
    } else if (this.summit) {
      prompt = C.prompts.rideDown;
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
          if (partnerDriving) prompt = fmt(C.prompts.hopIn, { name: this.remote?.name ?? "them" });
          else if (!spot.taken) prompt = fmt(C.prompts.driveCar, { car: modelParts(spot.model).spec.name });
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

    // during the anniversary finale on the summit, take the camera off the
    // chase rig (which sits where the tower mast is) and frame the sky show
    if (this.annivShow.active && this.summit && this.annivShow.center) {
      const tc = this.towerCenter, c = this.annivShow.center;
      this.camera.position.set(
        tc.x + CHAMP_AXIS.x * 3, 282, tc.z + CHAMP_AXIS.z * 3,
      );
      this.camera.lookAt(c.x, 288, c.z);
    }

    this.composer.render();
  }
}
