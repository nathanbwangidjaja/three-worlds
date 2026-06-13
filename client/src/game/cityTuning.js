// Hand-tuned, per-building looks — matched against real Street View.
// Each rule matches OSM building names (string = exact, RegExp = pattern;
// first match wins) and routes the building to a custom architectural style.
//
// Styles reference real Kendall Square:
//   protoTower   – Proto (88 Ames): white precast grid, dark spandrels, bronze accent
//   glassStone   – Stanley/Broad: blue-green curtain wall + stone core
//   bronzeBands  – Merkin Building: bronze precast ribbons + window strips
//   blueGlass    – Google/325 Main: full glass curtain
//   hotelBrick   – Residence Inn: red-brown brick, punched windows
//   marriott     – Marriott: red brick grid + concrete banding
//   firehouse    – The Kendall Hotel: 1890s red-brick firehouse, white trim
//   garage       – parking structures: gray open louver bands
//   mitLimestone – MIT main-campus buff limestone/concrete
//   greenPiers   – MIT Green Building: tan concrete vertical piers
//   kochGlass    – Koch Institute: glass + warm terracotta verticals
//   techSquare   – Technology Square: gray precast grid
//   labRibbons   – generic lab/office: precast ribbon bands
//   stataMix     – Stata Center: silver curtain + orange accents

export const STYLE_DEFS = {
  protoTower: {
    factory: "panel",
    opts: { panel: "#dcdcd6", pier: "#cacac2", spandrel: "#383d44", glassTop: "#b4c8d4", glassBottom: "#42596a", pierWidth: 0.2, accent: "#7a5a38", seed: 201 },
    storefront: true,
  },
  glassStone: {
    factory: "curtain",
    opts: { glassTop: "#a4c6d4", glassBottom: "#3a5462", mullion: "rgba(40,48,54,0.9)", seed: 203 },
    storefront: true,
  },
  bronzeBands: {
    factory: "ribbon",
    opts: { band: "#7e6a52", glassTop: "#92aab8", glassBottom: "#36464e", bandRatio: 0.46, seed: 207 },
    storefront: true,
  },
  blueGlass: {
    factory: "curtain",
    opts: { glassTop: "#9cc2dc", glassBottom: "#2e4a60", mullion: "rgba(28,36,44,0.92)", seed: 211 },
    storefront: true,
  },
  hotelBrick: {
    factory: "facade",
    opts: { base: "#8a4a3a", brick: { mortar: "rgba(220,205,190,0.25)", rows: 44 }, glassTop: "#c4d4dc", glassBottom: "#4a5a64", seed: 213 },
    storefront: true,
  },
  marriott: {
    factory: "facade",
    opts: { base: "#94503c", brick: { mortar: "rgba(225,210,195,0.22)", rows: 48 }, glassTop: "#b8c8d0", glassBottom: "#42525c", frame: "rgba(220,214,205,0.85)", seed: 217 },
    storefront: true,
  },
  firehouse: {
    factory: "facade",
    opts: { base: "#76362c", brick: { mortar: "rgba(230,220,205,0.32)", rows: 36 }, glassTop: "#d4dce0", glassBottom: "#5a6a72", frame: "rgba(240,236,228,0.95)", shutters: false, seed: 219 },
    storefront: false,
  },
  garage: {
    factory: "garage",
    opts: { base: "#9aa0a2", seed: 223 },
    storefront: false,
  },
  // MIT main-group limestone: large windows, buff Bedford stone, soft stone
  // coursing — three subtly different cuts so the core isn't one stamped wall
  mitLimestone: {
    factory: "facade",
    opts: { base: "#d8d1c0", stone: true, bigWindows: true, glassTop: "#aebfc6", glassBottom: "#52707e", frame: "rgba(72,68,58,0.85)", noise: 0.05, seed: 227 },
    storefront: false,
  },
  mitLime2: {
    factory: "facade",
    opts: { base: "#cfc7b2", stone: true, bigWindows: true, glassTop: "#a4b8c2", glassBottom: "#4c6776", frame: "rgba(64,60,52,0.85)", noise: 0.045, seed: 271 },
    storefront: false,
  },
  mitLime3: {
    factory: "facade",
    opts: { base: "#ded7c6", stone: true, bigWindows: true, glassTop: "#b4c4cc", glassBottom: "#586e78", frame: "rgba(80,74,64,0.8)", noise: 0.05, seed: 283 },
    storefront: false,
  },
  greenPiers: {
    factory: "panel",
    opts: { panel: "#b5a88e", pier: "#a89a80", spandrel: "#5a5246", glassTop: "#8aa0ac", glassBottom: "#323e46", pierWidth: 0.42, seed: 229 },
    storefront: false,
  },
  kochGlass: {
    factory: "panel",
    opts: { panel: "#a86a44", pier: "#965a3c", spandrel: "#2e3a42", glassTop: "#a8c4d2", glassBottom: "#3a5260", pierWidth: 0.14, seed: 233 },
    storefront: false,
  },
  techSquare: {
    factory: "panel",
    opts: { panel: "#b6b4ae", pier: "#a8a6a0", spandrel: "#44484c", glassTop: "#a0b4c0", glassBottom: "#3e4e58", pierWidth: 0.24, seed: 239 },
    storefront: false,
  },
  labRibbons: {
    factory: "ribbon",
    opts: { band: "#a89a86", glassTop: "#9cb2c0", glassBottom: "#3c4c56", bandRatio: 0.44, seed: 241 },
    storefront: false,
  },
  stataMix: {
    factory: "panel",
    opts: { panel: "#c4c6c8", pier: "#b04c28", spandrel: "#3a3e42", glassTop: "#b0c6d2", glassBottom: "#42525c", pierWidth: 0.18, accent: "#d87a34", seed: 251 },
    storefront: false,
  },

  // ---- Lippo Village, Tangerang ----
  mall: {            // Supermal Karawaci: long cream box, teal glass bands
    factory: "ribbon",
    opts: { band: "#e4d8c0", bandDark: "rgba(120,100,80,0.25)", glassTop: "#7ec4c4", glassBottom: "#2e6468", bandRatio: 0.58, seed: 301 },
    storefront: true,
  },
  condoTower: {      // Fairview/Hillcrest: cream towers, balcony shadows
    factory: "panel",
    opts: { panel: "#ecdfd0", pier: "#dcccb8", spandrel: "#8a7060", glassTop: "#a8c0c8", glassBottom: "#48626a", pierWidth: 0.3, seed: 307 },
    storefront: false,
  },
  towerGlass: {      // Lippo Village Tower / Menara: blue curtain wall
    factory: "curtain",
    opts: { glassTop: "#8cb8cc", glassBottom: "#27485a", mullion: "rgba(30,40,48,0.92)", seed: 311 },
    storefront: true,
  },
  mosque: {          // Masjid: white walls, deep-green trim
    factory: "facade",
    opts: { base: "#f4f1e6", frame: "rgba(28,84,52,0.95)", glassTop: "#cfdcd4", glassBottom: "#5e7468", stone: true, noise: 0.03, seed: 313 },
    storefront: false,
  },
  vihara: {          // Buddhist temple: deep red walls, gold trim
    factory: "facade",
    opts: { base: "#8a2e22", frame: "rgba(212,168,68,0.95)", glassTop: "#d8c8a8", glassBottom: "#6a5838", brick: { mortar: "rgba(60,20,15,0.4)", rows: 30 }, seed: 317 },
    storefront: false,
  },
  fastfood: {        // McDonald's / KFC: white box, red band
    factory: "panel",
    opts: { panel: "#f0ece4", pier: "#e4ded2", spandrel: "#b8362a", glassTop: "#c8dce4", glassBottom: "#52707c", pierWidth: 0.12, seed: 331 },
    storefront: true,
  },
  ruko: {            // pastel 3-story shophouse strips
    factory: "facade",
    opts: { base: "#e8d4b8", glassTop: "#c4d8da", glassBottom: "#54707a", frame: "rgba(70,60,48,0.9)", seed: 337 },
    storefront: true,
  },
  hospital: {        // Siloam: white slab, teal glass ribbons
    factory: "ribbon",
    opts: { band: "#f0efe8", bandDark: "rgba(90,110,120,0.25)", glassTop: "#7ab8c8", glassBottom: "#2c5662", bandRatio: 0.5, seed: 341 },
    storefront: false,
  },
  sphCampus: {       // SPH Lippo Village: red-brick colonnades, white fascia bands
    factory: "ribbon",
    opts: { band: "#9a4a34", glassTop: "#e8e4da", glassBottom: "#7a4534", bandRatio: 0.62, seed: 347 },
    storefront: false,
  },
  uphGlass: {        // Universitas Pelita Harapan: dark glass towers
    factory: "curtain",
    opts: { glassTop: "#5a7484", glassBottom: "#1c2e3a", mullion: "rgba(18,24,30,0.95)", seed: 349 },
    storefront: false,
  },
};

export const TUNING = {
  boston: [
    { match: "Proto", style: "protoTower" },
    { match: "Stanley Building", style: "glassStone" },
    { match: "Richard N. Merkin Building", style: "bronzeBands" },
    { match: "Residence Inn Cambridge", style: "hotelBrick" },
    { match: /Garage|garage/, style: "garage" },
    { match: "Whitehead Institute", style: "labRibbons" },
    { match: "Google", style: "blueGlass" },
    { match: "Boston Marriott Cambridge", style: "marriott" },
    { match: "The Kendall Hotel", style: "firehouse" },
    { match: "76 Koch Institute", style: "kochGlass" },
    { match: /Green Building/, style: "greenPiers" },     // keep the slab; radome added in code
    { match: /Technology Square/, style: "techSquare" },
    { match: /Draper/, style: "labRibbons" },
    // Great Dome (Building 10): fully custom in mitCampus.js — hide the OSM box
    { match: "10", hide: true },
    { match: "7 Rogers Building", hide: true }, // Lobby 7 / 77 Mass Ave (custom)
    // the Maclaurin wings directly framing Killian Court are ~5-story
    // limestone — capped so the Great Dome rises above them, as in real life
    { match: "3", style: "mitLimestone", h: 20 },
    { match: "4", style: "mitLime2", h: 20 },
    { match: "5", style: "mitLime3", h: 20 },
    { match: "8", style: "mitLimestone", h: 20 },
    // --- hand-built MIT landmarks: hide the OSM box, mitCampus.js draws it ---
    { match: /Stata Center/, hide: true },
    { match: "W16 Kresge Auditorium", hide: true },
    { match: "W15 MIT Chapel", hide: true },
    { match: "E14 Media Lab", hide: true },
    { match: "E15 Wiesner Building", hide: true },
    { match: "W79 Simmons Hall", hide: true },
    { match: "E62", hide: true },                          // MIT Sloan (custom)
    { match: /E52|Chang Building/, hide: true },           // Sloan Chang (custom)
    // MIT east-campus halls: buff limestone & concrete
    { match: /^(E1[789]|E2[358]|E3[38]|E5[123]|E60|E62)\b|Koch Biology|Landau|Mudd|Ford Building|Whitaker|Parsons|Walker Memorial|Stratton|Tang Center|Hermann|Chang Building|Arthur D\. Little|Dreyfus|Sloan/, style: "mitLimestone" },
    // remaining big offices near Main St read as labs
    { match: /Broad Institute|Pfizer|Novartis|Biogen|Akamai|Amgen/, style: "labRibbons" },
    // the Maclaurin group + Infinite Corridor frame Killian Court — every
    // numbered building here is buff limestone, not the default blue glass.
    // (named rules above win; this catches the unnamed/numeric remainder)
    { at: [-305, 405], r: 235, styleVary: ["mitLimestone", "mitLime2", "mitLime3"] },
    // Sloan cluster (Amherst/Wadsworth/Memorial) reads limestone-and-brick too
    { at: [330, 270], r: 170, styleVary: ["mitLimestone", "mitLime2", "mitLime3"] },
  ],
  // Rules may also match by location: { at: [x, z], r, cat?, minArea? } —
  // used where OSM has the building but no name (Siloam, SPH, UPH...).
  tangerang: [
    { match: /Supermal|Supermall Karawaci/, style: "mall", h: 17 },
    { match: /Fairview House|Hillcrest House|Amartapura|Aryaduta|The Medina|Hotel /, style: "condoTower" },
    { match: "Lippo Village Tower", style: "towerGlass" },
    { match: /Menara Matahari|Menara CIMB|Menara Dynaplast/, style: "towerGlass" }, // the CBD towers by UPH
    { match: /Benton Junction|MaxxBox|Living Plaza/, style: "mall" },
    { match: /Masjid/, style: "mosque" },
    { match: /VIHARA|Vihara/, style: "vihara" },
    { match: /McDonald|KFC|Helen's/, style: "fastfood" },
    { match: /Rumah Buah/, style: "ruko" },
    { match: "Suzuki", style: "towerGlass" },              // glass showroom
    { match: /Universitas|Sekolah Tinggi/, style: "uphGlass" },
    { match: /Sekolah Pelita Harapan/, style: "sphCampus" },
    // re-anchored against the 2400m bake (the old guesses landed in kampung)
    { at: [1330, 830], r: 150, minArea: 300, style: "hospital", label: "Siloam Hospitals" },  // off Jl. Imam Bonjol, SE of the golf
    { at: [743, 1584], r: 260, cat: "school", style: "sphCampus", label: "SPH Lippo Village" },
    { at: [1250, 300], r: 330, cat: "school", style: "uphGlass", label: "UPH campus" },       // towers across from Benton Junction
    { at: [0, 0], r: 2400, cat: "school", style: "sphCampus" }, // schools everywhere read institutional white-blue
    { at: [0, 0], r: 520, cat: "retail", style: "ruko" },  // shophouse strips near home
  ],
  paris: [],
};
