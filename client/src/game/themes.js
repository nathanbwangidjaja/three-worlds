// Per-city look & feel. Colors are hex numbers for three.js.

export const THEMES = {
  boston: {
    title: "Cambridge, Boston",
    subtitle: "his side of the world · 4:30 pm, golden hour",
    sky: { top: 0x3a6ea5, bottom: 0xf4c08a },     // crisp blue fading to gold
    fog: { color: 0xe8c9a0, near: 220, far: 950 },
    sun: { color: 0xffd9a0, intensity: 2.2, position: [-420, 280, 240] },
    ambient: { color: 0xbfd4e8, intensity: 1.15 },
    hemi: { sky: 0x9fc3e8, ground: 0x8a6f55, intensity: 0.85 },
    ground: 0x6b7a5e,
    road: 0x52555e,
    path: 0xa39a8c,
    water: 0x3a6285,
    green: 0x6a8d4f,
    treeFoliage: [0xc46a2e, 0xd98b32, 0x8f9e3a, 0x6f8c36], // autumn!
    treeKind: "deciduous",
    buildingPalette: [0x9e5b40, 0x8a4a38, 0xb07a52, 0x9c8676, 0x7d6b5d, 0xa8927e, 0x6e7b85],
    roofTint: 0.72,
    night: false,
    streetlights: false,
    // textured facade styles: brick rowhouse, brown brick, modern glass (MIT-ish)
    facadeStyles: [
      { type: "facade", weight: 4, opts: { base: "#94553e", brick: {}, glassTop: "#cfe0ec", glassBottom: "#4a5f70", seed: 11 } },
      { type: "facade", weight: 3, opts: { base: "#a87656", brick: { mortar: "rgba(235,225,210,0.28)" }, glassTop: "#d8e6ee", glassBottom: "#56707e", seed: 23 } },
      { type: "facade", weight: 3, opts: { base: "#8a93a0", bigWindows: true, frame: "rgba(28,32,38,0.95)", glassTop: "#dfeaf2", glassBottom: "#7a93a6", noise: 0.03, seed: 37 } },
      { type: "facade", weight: 2, opts: { base: "#6e5446", brick: { mortar: "rgba(60,45,35,0.4)", rows: 32 }, glassTop: "#c8d8e4", glassBottom: "#42525e", seed: 43 } },
      { type: "facade", weight: 2, opts: { base: "#c2a878", brick: { mortar: "rgba(255,250,235,0.3)" }, glassTop: "#d4e2ea", glassBottom: "#5a6e7a", seed: 53 } },
      { type: "facade", weight: 2, opts: { base: "#b8beb2", bigWindows: true, frame: "rgba(70,75,70,0.9)", glassTop: "#e4ecf0", glassBottom: "#88a0ae", noise: 0.02, seed: 59 } },
    ],
    roof: { type: "flat", base: "#5c544c" },
    storefront: {
      wall: "#564c44", night: false, bandH: 4.0,
      chance: { retail: 1, office: 0.7, apartments: 0.6, generic: 0.3, school: 0.15 },
    },
    clouds: { count: 10, color: 0xfff4e0, opacity: 0.5 },
    sunSprite: { color: "rgba(255,228,170,0.9)", size: 420 },
    cars: true,
  },

  tangerang: {
    title: "Tangerang",
    subtitle: "her side of the world · sunset, after the rain",
    sky: { top: 0x6b4a8f, bottom: 0xff9e5e },     // tropical sunset
    fog: { color: 0xf0a878, near: 200, far: 900 },
    sun: { color: 0xff9d5c, intensity: 2.4, position: [380, 140, -300] },
    ambient: { color: 0xffc9a8, intensity: 1.1 },
    hemi: { sky: 0xd9a0c4, ground: 0x7a6248, intensity: 0.8 },
    ground: 0x7d8a5c,
    road: 0x5c5650,
    path: 0xb0a084,
    water: 0x5a8a6e,
    green: 0x74974e,
    treeFoliage: [0x3e7d3a, 0x4f9143, 0x36703f, 0x5a9e4a], // lush tropical
    treeKind: "palm",
    buildingPalette: [0xe8dcc8, 0xd9c8b0, 0xc9b8a8, 0xe0d0b8, 0xb8a890, 0xd4c4ac],
    roofTint: 0.55,
    roofColor: 0xa84a32, // terracotta roofs
    night: false,
    streetlights: false,
    facadeStyles: [
      { type: "house", weight: 5, opts: { base: "#efe6d2", trim: "#b8a888", seed: 5 } },
      { type: "house", weight: 4, opts: { base: "#f4efe4", trim: "#9aa48e", seed: 9 } },
      { type: "house", weight: 2, opts: { base: "#e2d2b4", trim: "#a8845e", seed: 13 } },
      { type: "house", weight: 2, opts: { base: "#dcead8", trim: "#8aa284", seed: 21 } },
      { type: "house", weight: 2, opts: { base: "#cdd8dc", trim: "#7e94a0", seed: 27 } },
      { type: "house", weight: 1, opts: { base: "#f0dcc2", trim: "#bc8a60", seed: 33 } },
      { type: "facade", weight: 1, opts: { base: "#d8cdb8", glassTop: "#cfdcd4", glassBottom: "#5e7468", seed: 17 } },
    ],
    roof: {
      type: "hip", maxArea: 420, height: 2.6,
      // varied tile colors so the rows of houses don't look stamped
      tiles: [
        { tile: "#a8503a", dark: "#7e3826" },
        { tile: "#8a4438", dark: "#62302a" },
        { tile: "#6e463a", dark: "#4e322a" },
      ],
    },
    fillHouses: true, // OSM has the cluster streets but not the villas — generate them
    storefront: {
      wall: "#c9b89a", night: false, bandH: 3.1,
      signColors: ["#b8542e", "#3e6048", "#2e4a5e", "#8a6a34", "#a83a4a"],
      awningColors: ["#c25a32", "#3e7048", "#cfa238", "#44587a"],
      chance: { retail: 1, generic: 0.1, house: 0.05 },
    },
    clouds: { count: 14, color: 0xffc9a0, opacity: 0.65 },
    sunSprite: { color: "rgba(255,170,100,0.95)", size: 560 },
    cars: true,
  },

  paris: {
    title: "Paris",
    subtitle: "where we meet · midnight by the tower",
    sky: { top: 0x0a0e2a, bottom: 0x2a2348 },     // deep night blue
    fog: { color: 0x1a1832, near: 240, far: 1000 },
    sun: { color: 0xb8c4e8, intensity: 1.0, position: [300, 380, -200] }, // moonlight
    ambient: { color: 0x7a7fae, intensity: 1.0 },
    hemi: { sky: 0x4a4f7e, ground: 0x322c44, intensity: 0.8 },
    ground: 0x23283a,
    road: 0x1f2230,
    path: 0x3a3a4a,
    water: 0x121b30,
    green: 0x1f3326,
    treeFoliage: [0x1e3a28, 0x24452e, 0x1a3324],
    treeKind: "manicured",
    buildingPalette: [0x4a4458, 0x55506a, 0x484052, 0x5d5468, 0x3f3a4e],
    roofTint: 0.6,
    night: true,
    stars: true,
    streetlights: true,
    facadeStyles: [
      { type: "facade", weight: 5, opts: { base: "#6a6276", stone: true, balconies: true, shutters: true, lit: 0.42, glassTop: "#3a3f56", glassBottom: "#23283c", frame: "rgba(16,16,22,0.95)", seed: 7 } },
      { type: "facade", weight: 4, opts: { base: "#5d566c", stone: true, balconies: true, lit: 0.34, glassTop: "#363b50", glassBottom: "#202538", frame: "rgba(14,14,20,0.95)", seed: 19 } },
      { type: "facade", weight: 3, opts: { base: "#797088", stone: true, balconies: true, lit: 0.5, glassTop: "#3e4458", glassBottom: "#262b40", frame: "rgba(18,18,24,0.95)", seed: 29 } },
      { type: "facade", weight: 2, opts: { base: "#544e62", stone: true, shutters: true, lit: 0.28, glassTop: "#343950", glassBottom: "#1e2336", frame: "rgba(12,12,18,0.95)", seed: 31 } },
    ],
    roof: { type: "flat", base: "#3c4254" }, // zinc
    mansard: { color: "#2e3446", rise: 2.8, inset: 1.8, minH: 11 },
    storefront: {
      wall: "#4a4456", night: true, bandH: 4.0,
      signColors: ["#5e2c30", "#23383e", "#34292e", "#403420", "#252b40"],
      awningColors: ["#7a2e34", "#2e4a3a", "#2c3a56", "#6a5226"],
      chance: { retail: 1, apartments: 0.6, generic: 0.6, office: 0.6 },
    },
    clouds: null,
    sunSprite: null,
    cars: true,
  },
};

// Travel destinations shown in portals / travel menu
export const DESTINATIONS = {
  boston: [
    { to: "tangerang", label: "🏝 Fly to her — Tangerang" },
    { to: "paris", label: "🗼 Meet in Paris" },
  ],
  tangerang: [
    { to: "boston", label: "🍂 Fly to him — Boston" },
    { to: "paris", label: "🗼 Meet in Paris" },
  ],
  paris: [
    { to: "boston", label: "🍂 Back to Boston" },
    { to: "tangerang", label: "🏝 Back to Tangerang" },
  ],
};
