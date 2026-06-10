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
  tangerang: [],
  paris: [],
};
