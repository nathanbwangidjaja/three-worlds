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
    ],
    roof: { type: "flat", base: "#5c544c" },
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
      { type: "facade", weight: 1, opts: { base: "#d8cdb8", glassTop: "#cfdcd4", glassBottom: "#5e7468", seed: 17 } },
    ],
    roof: { type: "hip", tile: "#a8503a", dark: "#7e3826", maxArea: 420, height: 2.6 },
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
    ],
    roof: { type: "flat", base: "#3c4254" }, // zinc
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
