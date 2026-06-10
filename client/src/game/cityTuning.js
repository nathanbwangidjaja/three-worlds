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
  mitLimestone: {
    factory: "facade",
    opts: { base: "#c9bfa8", stone: true, glassTop: "#aebec6", glassBottom: "#48565e", frame: "rgba(60,58,50,0.9)", noise: 0.04, seed: 227 },
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
  sphCampus: {       // Sekolah Pelita Harapan: warm cream halls, red accents
    factory: "facade",
    opts: { base: "#e2cfae", stone: true, frame: "rgba(122,48,38,0.9)", glassTop: "#b8ccd4", glassBottom: "#4c646e", noise: 0.04, seed: 347 },
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
    { match: /Green Building/, style: "greenPiers" },
    { match: /Technology Square/, style: "techSquare" },
    { match: /Stata Center/, style: "stataMix" },
    { match: /Draper/, style: "labRibbons" },
    { match: /Media Lab|E14|E15 Wiesner/, style: "glassStone" },
    // MIT east-campus halls: buff limestone & concrete
    { match: /^(E1[789]|E2[358]|E3[38]|E5[123]|E60|E62)\b|Koch Biology|Landau|Mudd|Ford Building|Whitaker|Parsons|Walker Memorial|Stratton|Tang Center|Hermann|Chang Building|Arthur D\. Little|Dreyfus|Sloan/, style: "mitLimestone" },
    // remaining big offices near Main St read as labs
    { match: /Broad Institute|Pfizer|Novartis|Biogen|Akamai|Amgen/, style: "labRibbons" },
  ],
  // Rules may also match by location: { at: [x, z], r, cat?, minArea? } —
  // used where OSM has the building but no name (Siloam, SPH, UPH...).
  tangerang: [
    { match: /Supermal|Supermall Karawaci/, style: "mall", h: 17 },
    { match: /Fairview House|Hillcrest House/, style: "condoTower" },
    { match: "Lippo Village Tower", style: "towerGlass" },
    { match: /Masjid/, style: "mosque" },
    { match: /VIHARA|Vihara/, style: "vihara" },
    { match: /McDonald|KFC|Helen's/, style: "fastfood" },
    { match: /Rumah Buah/, style: "ruko" },
    { match: "Suzuki", style: "towerGlass" },              // glass showroom
    { at: [78, -281], r: 130, minArea: 400, style: "hospital", label: "Siloam Hospitals" },   // Siloam Lippo Village
    { at: [-287, -737], r: 190, minArea: 250, style: "sphCampus", label: "SPH Lippo Village" }, // Sekolah Pelita Harapan
    { at: [-641, -203], r: 230, minArea: 300, style: "uphGlass", label: "UPH campus" },         // Universitas Pelita Harapan
    { at: [0, 0], r: 520, cat: "retail", style: "ruko" },  // shophouse strips near home
  ],
  paris: [],
};
