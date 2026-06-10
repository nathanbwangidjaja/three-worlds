// All the content for your game lives here.
// Edit the text + image paths to tell your story.
// Each "memory" is a thing she can walk up to and interact with.
//
// image paths are optional — drop pngs into client/public/assets/memories/
// and reference them like "/assets/memories/year1-firstdate.png"

export const HUB = {
  key: "hub",
  title: "Home",
  bgColor: "#2a1a14",
  spawn: { x: 320, y: 240 },
  // Portal positions tuned to the generated hub.png illustration.
  // Years 1,2,3 are the 3 wooden doors on the back wall.
  // Years 4,5 are the framed paintings between the doors.
  // Finale is the heart door at the bottom.
  portals: [
    // Aligned to back wall items (3 doors + 2 paintings between them)
    { x: 232, y: 175, scene: "year", year: 1, label: "Year 1" },     // back-left door
    { x: 292, y: 175, scene: "year", year: 2, label: "Year 2" },     // left painting
    { x: 350, y: 175, scene: "year", year: 3, label: "Year 3" },     // back-center door
    { x: 408, y: 175, scene: "year", year: 4, label: "Year 4" },     // right painting
    { x: 466, y: 175, scene: "year", year: 5, label: "Year 5" },     // back-right door
    { x: 320, y: 415, scene: "finale", label: "❤ Finale" },          // heart door
  ],
  // Collision boxes for room walls + central coffee table
  walls: [
    { x: 0,   y: 0,   w: 640, h: 130 },   // back wall
    { x: 0,   y: 430, w: 640, h: 50  },   // front wall (heart door area below)
    { x: 0,   y: 0,   w: 90,  h: 480 },   // left wall
    { x: 550, y: 0,   w: 90,  h: 480 },   // right wall
    { x: 285, y: 315, w: 70,  h: 50  },   // central coffee table
  ],
  signs: [
    {
      x: 320, y: 240,
      speaker: "",
      pages: [
        { speaker: "", text: "Welcome home.\n\nFive years. Walk to a door and press Space to revisit that year.\n\nWhen you're ready, the heart door below will be waiting." },
      ],
    },
  ],
};

// Helper to make stub years — replace the contents with your real memories.
function stubYear(n, color, memories) {
  return {
    key: `year-${n}`,
    title: `Year ${n}`,
    year: n,
    bgColor: color,
    spawn: { x: 320, y: 420 }, // bottom of map
    exit: { x: 320, y: 440 },  // walk down to leave
    memories,
  };
}

// Helper: tile (col, row) → pixel center in Year 1 (16px tile × 2 scale = 32px/tile)
const TS = 32; // tileSize * scale for Year 1
const tx = (col) => col * TS + TS / 2;
const ty = (row) => row * TS + TS / 2;

export const YEARS = {
  1: {
    key: "year-1",
    title: "Year 1 · Disneyland LA",
    year: 1,
    bgColor: "#4a8a4a",
    // World size is auto-computed from YEAR1_MAP in YearScene
    spawn: { x: tx(40), y: ty(53) },
    memories: [
      { x: tx(25), y: ty(11), icon: "🏰", pages: [
        { speaker: "Year 1 · The Castle", text: "The castle.\n\n[What did we say when we first saw it?]" },
      ]},
      { x: tx(25), y: ty(17), icon: "✨", pages: [
        { speaker: "Year 1 · Partners Statue", text: "The statue.\n\n[Pose, photo, smile. Did we hug?]" },
      ]},
      { x: tx(22), y: ty(26), icon: "🍩", pages: [
        { speaker: "Year 1 · The Snack Cart", text: "The churros we shared.\n\n[Tiny detail only we remember.]" },
      ]},
      { x: tx(30), y: ty(26), icon: "🎡", pages: [
        { speaker: "Year 1 · The Carousel", text: "The carousel.\n\n[Which horse did she pick?]" },
      ]},
      { x: tx(13), y: ty(28), icon: "🎈", pages: [
        { speaker: "Year 1 · Main Street", text: "The balloon vendor.\n\n[The color she picked.]" },
      ]},
      { x: tx(37), y: ty(28), icon: "🍦", pages: [
        { speaker: "Year 1 · Ice Cream Parlor", text: "The ice cream shop.\n\n[Her flavor / my flavor.]" },
      ]},
      { x: tx(25), y: ty(37), icon: "🌸", pages: [
        { speaker: "Year 1 · The Entrance", text: "We took our entrance photo right here. Smiled until our cheeks hurt." },
      ]},
    ],
    zones: [
      { id: "castle",      type: "weather",  x: tx(20)-50, y: ty(4)-50, w: 320, h: 240, label: "✨ The Castle" },
      { id: "plaza",       type: "subtitle", x: tx(17),    y: ty(13),   w: 16*32, h: 8*32, text: "Castle Plaza" },
      { id: "main_street", type: "subtitle", x: tx(15),    y: ty(22),   w: 21*32, h: 16*32, text: "Main Street, USA" },
    ],
  },
  2: stubYear(2, "#4a3a2d", [
    {
      x: 200, y: 200, icon: "✈️",
      pages: [{ speaker: "Year 2", text: "Our first trip together.\n\n[Where we went, what happened.]" }],
    },
    {
      x: 440, y: 200, icon: "🏠",
      pages: [{ speaker: "Year 2", text: "The apartment / place we spent the most time.\n\n[A small detail only we'd remember.]" }],
    },
  ]),
  3: stubYear(3, "#2d3a4a", [
    {
      x: 200, y: 220, icon: "🎢",
      pages: [{ speaker: "Year 3", text: "[A big trip or shared experience this year.]" }],
    },
    {
      x: 440, y: 180, icon: "🎂",
      pages: [{ speaker: "Year 3", text: "[A birthday, holiday, or milestone.]" }],
    },
  ]),
  4: stubYear(4, "#4a2d3a", [
    {
      x: 200, y: 200, icon: "🌧️",
      pages: [{ speaker: "Year 4", text: "[A hard moment we got through together.]" }],
    },
    {
      x: 440, y: 220, icon: "🌟",
      pages: [{ speaker: "Year 4", text: "[Something that made you proud of her, or her of you.]" }],
    },
  ]),
  5: stubYear(5, "#3a2d4a", [
    {
      x: 320, y: 200, icon: "💫",
      pages: [
        { speaker: "Year 5", text: "This year.\n\n[Where we are now, and where we're going.]" },
      ],
    },
  ]),
};

export const FINALE = {
  key: "finale",
  title: "❤",
  bgColor: "#1a0a1a",
  spawn: { x: 320, y: 400 },
  pages: [
    { speaker: "", text: "Five years.\n\nWe argued about what to have for dinner more times than I can count.\nWe slept in on every weekend we got.\nWe laughed at things no one else would think were funny." },
    { speaker: "", text: "[Write whatever you want to say to her here. This is the moment.]" },
    { speaker: "", text: "Happy anniversary, [her name].\n\n— [your name]" },
  ],
};
