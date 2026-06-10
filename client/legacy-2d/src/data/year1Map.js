// Year 1 — Painted Disneyland map (1448 × 1086 image).
// The image IS the world. We define walls so the player walks only on the
// paved paths, plus memory interaction points and wandering NPCs.
//
// Coordinate system: pixel-based, matches the image dimensions directly.

export const YEAR1_MAP = {
  // World size matches the source image at native resolution
  worldSize: { w: 1448, h: 1086 },
  // Spawn = just inside the entrance gate (above the Mickey flower bed)
  spawn: { x: 724, y: 880 },
};

// === COLLISION WALLS ===
// Rectangles where the player CANNOT walk. Everything not covered = walkable.
// Numbers are in WORLD pixel coordinates of the year-1.png image.
export const YEAR1_WALLS = [
  // ── PERIMETER TREE BORDERS ──
  { x: 0,    y: 0,    w: 1448, h: 60   },   // top forest
  { x: 0,    y: 1026, w: 1448, h: 60   },   // bottom forest
  { x: 0,    y: 0,    w: 80,   h: 1086 },   // left forest
  { x: 1368, y: 0,    w: 80,   h: 1086 },   // right forest

  // ── CASTLE + MOAT (top center) ──
  // Big rectangle covering the castle, moat, and surrounding gardens
  { x: 460,  y: 50,   w: 530,  h: 220 },

  // ── PIRATE COVE / WATER (top-left) ──
  { x: 80,   y: 20,   w: 280,  h: 200 },

  // ── MOUNTAIN COASTER (top-right) ──
  { x: 1080, y: 20,   w: 290,  h: 280 },

  // ── CAROUSEL (mid-left) ──
  { x: 90,   y: 230,  w: 170,  h: 170 },

  // ── BUILDING CLUSTERS LEFT (3 zones) ──
  { x: 260,  y: 220,  w: 200,  h: 170 },    // top-left buildings
  { x: 110,  y: 380,  w: 350,  h: 200 },    // mid-left buildings
  { x: 90,   y: 580,  w: 380,  h: 200 },    // lower-left buildings
  { x: 130,  y: 790,  w: 340,  h: 170 },    // bottom-left buildings

  // ── BUILDING CLUSTERS RIGHT ──
  { x: 980,  y: 230,  w: 200,  h: 170 },    // top-right buildings
  { x: 980,  y: 380,  w: 380,  h: 200 },    // mid-right buildings
  { x: 980,  y: 580,  w: 380,  h: 200 },    // lower-right buildings
  { x: 980,  y: 790,  w: 350,  h: 170 },    // bottom-right buildings

  // ── ENTRANCE GATE STRUCTURES (with archways between them) ──
  // Left tower
  { x: 460,  y: 820,  w: 130,  h: 130 },
  // Middle building piece (between center arch and left arch)
  { x: 615,  y: 820,  w: 80,   h: 130 },
  // Middle building piece (between center arch and right arch)
  { x: 755,  y: 820,  w: 80,   h: 130 },
  // Right tower
  { x: 860,  y: 820,  w: 130,  h: 130 },
  // Mickey flower bed (decorative, not walkable through center)
  { x: 620,  y: 950,  w: 220,  h: 70  },

  // ── CENTER PLAZA STATUE PEDESTAL (small obstacle in plaza) ──
  { x: 700,  y: 410,  w: 50,   h: 50 },
];

// === MEMORY INTERACTION POINTS ===
// Player walks up to these, presses Space, dialogue plays.
// Positions chosen on/near the paved paths.
export const YEAR1_MEMORIES = [
  // Castle bridge — bottom of the moat bridge
  { x: 724, y: 280, icon: "🏰",
    pages: [
      { speaker: "Year 1 · The Castle", text: "The castle.\n\n[What did we say when we first saw it?]" },
    ],
  },
  // Partners statue at plaza center
  { x: 724, y: 440, icon: "✨",
    pages: [
      { speaker: "Year 1 · Partners Statue", text: "The bronze statue in the center of the plaza.\n\n[Did we take a photo here?]" },
    ],
  },
  // Carousel (mid-left)
  { x: 200, y: 320, icon: "🎡",
    pages: [
      { speaker: "Year 1 · Carousel", text: "The carousel.\n\n[Which horse did she pick?]" },
    ],
  },
  // Pirate ship (top-left)
  { x: 200, y: 200, icon: "🏴‍☠️",
    pages: [
      { speaker: "Year 1 · Pirate Cove", text: "The pirate ship ride.\n\n[The dark ride. Did you hold her hand?]" },
    ],
  },
  // Mountain coaster (top-right)
  { x: 1200, y: 200, icon: "🎢",
    pages: [
      { speaker: "Year 1 · Mountain Coaster", text: "Walk into the coaster zone for the romantic ride together." },
    ],
  },
  // Snack cart / mid-street (right side path)
  { x: 940, y: 480, icon: "🍩",
    pages: [
      { speaker: "Year 1 · Snack Cart", text: "The churros we shared.\n\n[Tiny detail only we remember.]" },
    ],
  },
  // Ice cream parlor (left side)
  { x: 510, y: 480, icon: "🍦",
    pages: [
      { speaker: "Year 1 · Ice Cream Parlor", text: "Her flavor.\n\n[mine vs hers — which was it?]" },
    ],
  },
  // Mickey flower bed at entrance
  { x: 724, y: 920, icon: "🌸",
    pages: [
      { speaker: "Year 1 · The Entrance", text: "We took our entrance photo right here. Cheeks hurt from smiling." },
    ],
  },
];

// === WANDERING NPCs ===
// Themed park visitors. Positions on the paved paths.
export const YEAR1_NPCS = [
  // Castle entrance guards / performers
  { x: 660, y: 300, key: "npc-king",                label: "Tour guide" },
  { x: 790, y: 300, key: "npc-fairynpc",            label: "Costumed performer" },
  // Plaza visitors
  { x: 610, y: 420, key: "npc-oldlady",             label: "Visitor" },
  { x: 830, y: 420, key: "npc-bluebikinigirlnpc",   label: "Visitor" },
  { x: 660, y: 510, key: "npc-beachnpc",            label: "Visitor" },
  { x: 790, y: 510, key: "npc-boxingman",           label: "Visitor" },
  // Mid-street walkers
  { x: 530, y: 600, key: "npc-king",                label: "Visitor" },
  { x: 920, y: 600, key: "npc-fairynpc",            label: "Visitor" },
  { x: 530, y: 700, key: "npc-oldlady",             label: "Visitor" },
  { x: 920, y: 700, key: "npc-bluebikinigirlnpc",   label: "Visitor" },
  // Entrance greeters
  { x: 640, y: 970, key: "npc-beachnpc",            label: "Greeter" },
  { x: 810, y: 970, key: "npc-boxingman",           label: "Greeter" },
];

// === ZONES (Kaetram-pattern subtitle/minigame zones) ===
export const YEAR1_ZONES = [
  { id: "castle",      type: "weather",  x: 460,  y: 50,   w: 530, h: 220, label: "✨ The Castle" },
  { id: "plaza",       type: "subtitle", x: 540,  y: 330,  w: 360, h: 220, text: "Castle Plaza" },
  { id: "main_street", type: "subtitle", x: 460,  y: 580,  w: 530, h: 250, text: "Main Street, USA" },
  // Mountain coaster minigame trigger
  {
    id: "coaster",
    type: "minigame",
    x: 1080, y: 20, w: 290, h: 280,
    label: "Ride the coaster together",
    onTrigger: (scene) => { scene.scene.start("coaster", { returnTo: { scene: "year", year: 1 } }); },
  },
];
