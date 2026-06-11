// Cuisine inference + per-cuisine interior themes and menus.
// Every restaurant's look and menu comes from its REAL name and type,
// so CAVA feels like CAVA and Madame Brasserie feels like Paris.

const RULES = [
  { re: /sea\s?food|fish|lobster|oyster|legal/i, c: "seafood" },
  { re: /sushi|ramen|izakaya|tokyo|sakura/i, c: "japanese" },
  { re: /pizza|pizz|trattoria|pasta|italian/i, c: "italian" },
  { re: /taco|burrito|mexican|cantina/i, c: "mexican" },
  { re: /burger|grill|diner|shake/i, c: "burger" },
  { re: /kfc|mcdonald|fried|fast|domino/i, c: "fastfood" },
  { re: /cava|sweetgreen|bowl|salad|organic|alive/i, c: "bowls" },
  { re: /coffee|café|cafe|espresso|blue bottle|starbucks|dunkin|maxx|kopi|ripple/i, c: "cafe" },
  { re: /boulangerie|bakery|patisserie|pâtisserie|donut|roti/i, c: "bakery" },
  { re: /brasserie|bistro|chez|maison|jules|madame|français/i, c: "french" },
  { re: /bar|pub|tavern|brew|sheep/i, c: "bar" },
  { re: /warung|bakso|sate|padang|nasi|ayam|mie|es teler|helen/i, c: "indonesian" },
  { re: /ice cream|gelato|scoop/i, c: "dessert" },
  { re: /thai|pho|viet|banh/i, c: "thai" },
  { re: /flour|tatte|cafeteria/i, c: "cafe" },
];

const TYPE_FALLBACK = {
  cafe: "cafe", fast_food: "fastfood", bar: "bar", pub: "bar",
  bakery: "bakery", ice_cream: "dessert", restaurant: null, // null → by city
};

const CITY_FALLBACK = { boston: "american", tangerang: "indonesian", paris: "french" };

export function inferCuisine(name, type, city) {
  for (const r of RULES) if (r.re.test(name)) return r.c;
  return TYPE_FALLBACK[type] ?? CITY_FALLBACK[city] ?? "american";
}

export function isRestaurant(poiType) {
  return /^(restaurant|cafe|fast_food|bar|pub|bakery|ice_cream)$/.test(poiType);
}

// Interior themes: wall/floor/accent colors, lighting mood, decor flags.
export const CUISINE_THEMES = {
  french:     { wall: 0x6e4f3c, wainscot: 0x4a3528, floor: "checker", floorA: 0x2a2624, floorB: 0xd8cfc0, accent: 0x7a2e34, light: 0xffd9a8, tablecloth: 0xf4efe2, candles: true, art: "frames" },
  cafe:       { wall: 0xe8ddc8, wainscot: 0x9a7e5e, floor: "wood", floorA: 0x9a7450, accent: 0x4a6a5a, light: 0xffe8c4, tablecloth: null, candles: false, art: "menuboard", counter: true },
  seafood:    { wall: 0x35506b, wainscot: 0xe8e2d4, floor: "wood", floorA: 0x8a6a4c, accent: 0xc9a227, light: 0xfff2d8, tablecloth: 0xffffff, candles: true, art: "fish" },
  italian:    { wall: 0xdfd2b8, wainscot: 0x8a4a38, floor: "checker", floorA: 0x8a4a38, floorB: 0xe8dcc4, accent: 0x4a6a3c, light: 0xffe2b0, tablecloth: 0xb83a32, candles: true, art: "frames" },
  japanese:   { wall: 0xe4dcc8, wainscot: 0x2e2a26, floor: "wood", floorA: 0x6a5440, accent: 0xb83a32, light: 0xfff0d8, tablecloth: null, candles: false, art: "noren" },
  mexican:    { wall: 0xd8783c, wainscot: 0x8a3a2e, floor: "tile", floorA: 0xc9b8a0, accent: 0x3e8a6a, light: 0xffd9a0, tablecloth: null, candles: true, art: "frames" },
  burger:     { wall: 0xb8352e, wainscot: 0xe8e4da, floor: "checker", floorA: 0x1e1e22, floorB: 0xe8e4da, accent: 0xffc83c, light: 0xfff4e0, tablecloth: null, candles: false, art: "menuboard", counter: true },
  fastfood:   { wall: 0xf0ebe0, wainscot: 0xb8352e, floor: "tile", floorA: 0xd8d2c4, accent: 0xffc83c, light: 0xffffff, tablecloth: null, candles: false, art: "menuboard", counter: true },
  bowls:      { wall: 0xf2eee4, wainscot: 0x7a9a6a, floor: "wood", floorA: 0xb89a72, accent: 0x5a8a4a, light: 0xfff8e8, tablecloth: null, candles: false, art: "menuboard", counter: true },
  bakery:     { wall: 0xf4e8d8, wainscot: 0xc9a884, floor: "tile", floorA: 0xe2d4be, accent: 0xb87a9a, light: 0xffeed4, tablecloth: null, candles: false, art: "menuboard", counter: true },
  bar:        { wall: 0x3a3230, wainscot: 0x241f1c, floor: "wood", floorA: 0x5a4434, accent: 0xc9a227, light: 0xff9d5c, tablecloth: null, candles: true, art: "bottles", counter: true },
  indonesian: { wall: 0xe8d8b8, wainscot: 0x8a5e3a, floor: "tile", floorA: 0xc9a87e, accent: 0x3e7d3a, light: 0xffe2b0, tablecloth: 0xd8485f, candles: false, art: "batik" },
  thai:       { wall: 0x7a3a4a, wainscot: 0xc9a227, floor: "wood", floorA: 0x8a6a4c, accent: 0xc9a227, light: 0xffd9a8, tablecloth: null, candles: true, art: "frames" },
  dessert:    { wall: 0xf8e8ee, wainscot: 0xe8b8cc, floor: "checker", floorA: 0xf0d8e2, floorB: 0xffffff, accent: 0x7adcdc, light: 0xfff4f8, tablecloth: null, candles: false, art: "menuboard", counter: true },
  american:   { wall: 0x8a5e46, wainscot: 0x5e4434, floor: "wood", floorA: 0x7a5a40, accent: 0x35506b, light: 0xffe2b8, tablecloth: 0xe8e2d4, candles: true, art: "frames" },
};

// Menus: [name, price]. Food look: {shape, color} used to build the plate.
export const CUISINE_MENUS = {
  french: [
    ["Soupe à l'oignon", 14, { shape: "bowl", color: 0xc98a4a }],
    ["Steak frites", 29, { shape: "steak", color: 0x6a3a2a }],
    ["Confit de canard", 31, { shape: "steak", color: 0x8a5a34 }],
    ["Ratatouille", 22, { shape: "bowl", color: 0xb84a34 }],
    ["Crème brûlée", 12, { shape: "dessert", color: 0xe8c878 }],
    ["Vin rouge", 11, { shape: "drink", color: 0x6a1f2e }],
  ],
  cafe: [
    ["Latte", 6, { shape: "drink", color: 0xc9a070 }],
    ["Cappuccino", 5.5, { shape: "drink", color: 0xb88e5e }],
    ["Avocado toast", 12, { shape: "flat", color: 0x8aa84a }],
    ["Croissant", 4.5, { shape: "dessert", color: 0xd8a85a }],
    ["Matcha latte", 6.5, { shape: "drink", color: 0x8aac6a }],
    ["Berry tart", 7, { shape: "dessert", color: 0xb83a5e }],
  ],
  seafood: [
    ["Clam chowder", 13, { shape: "bowl", color: 0xe8dcc0 }],
    ["Lobster roll", 32, { shape: "flat", color: 0xd87a5a }],
    ["Grilled salmon", 28, { shape: "steak", color: 0xe8825e }],
    ["Oysters (6)", 24, { shape: "flat", color: 0xc9c2b0 }],
    ["Fish & chips", 19, { shape: "flat", color: 0xd8a85a }],
    ["White wine", 10, { shape: "drink", color: 0xe8d8a0 }],
  ],
  italian: [
    ["Margherita", 18, { shape: "flat", color: 0xd8584a }],
    ["Cacio e pepe", 21, { shape: "bowl", color: 0xe8d8a8 }],
    ["Lasagna", 22, { shape: "steak", color: 0xb85a3a }],
    ["Tiramisu", 10, { shape: "dessert", color: 0xc9a87e }],
    ["Chianti", 11, { shape: "drink", color: 0x6a1f2e }],
  ],
  japanese: [
    ["Salmon nigiri set", 26, { shape: "flat", color: 0xe8825e }],
    ["Tonkotsu ramen", 18, { shape: "bowl", color: 0xe8d0a8 }],
    ["Chicken katsu", 19, { shape: "flat", color: 0xc9924a }],
    ["Edamame", 7, { shape: "bowl", color: 0x6a9a4a }],
    ["Matcha ice cream", 7, { shape: "dessert", color: 0x8aac6a }],
  ],
  mexican: [
    ["Tacos al pastor", 14, { shape: "flat", color: 0xd8843c }],
    ["Burrito bowl", 13, { shape: "bowl", color: 0x8a6a3a }],
    ["Quesadilla", 12, { shape: "flat", color: 0xe8c878 }],
    ["Churros", 8, { shape: "dessert", color: 0xc9924a }],
    ["Horchata", 5, { shape: "drink", color: 0xe8dcc8 }],
  ],
  burger: [
    ["Smash burger", 15, { shape: "burger", color: 0x8a5a34 }],
    ["Double cheeseburger", 18, { shape: "burger", color: 0x8a5a34 }],
    ["Crispy fries", 6, { shape: "bowl", color: 0xe8c45a }],
    ["Chocolate shake", 7, { shape: "drink", color: 0x8a6048 }],
    ["Onion rings", 7, { shape: "bowl", color: 0xd8a85a }],
  ],
  fastfood: [
    ["Fried chicken (2pc)", 9, { shape: "flat", color: 0xc9924a }],
    ["Chicken sandwich", 8, { shape: "burger", color: 0xc9924a }],
    ["Fries", 4, { shape: "bowl", color: 0xe8c45a }],
    ["Sundae", 4, { shape: "dessert", color: 0xf0e0d0 }],
    ["Cola", 3, { shape: "drink", color: 0x4a2e22 }],
  ],
  bowls: [
    ["Harvest grain bowl", 14, { shape: "bowl", color: 0x9aa84a }],
    ["Greens + grains", 13, { shape: "bowl", color: 0x6a9a4a }],
    ["Spicy chicken bowl", 15, { shape: "bowl", color: 0xc9763a }],
    ["Pita + hummus", 8, { shape: "flat", color: 0xe8d8b0 }],
    ["Fresh lemonade", 5, { shape: "drink", color: 0xf0e8a0 }],
  ],
  bakery: [
    ["Pain au chocolat", 5, { shape: "dessert", color: 0xb8824a }],
    ["Sourdough toast", 8, { shape: "flat", color: 0xd8b87e }],
    ["Eclair", 6, { shape: "dessert", color: 0x6a4a36 }],
    ["Fruit danish", 6, { shape: "dessert", color: 0xd8a04a }],
    ["Hot chocolate", 5, { shape: "drink", color: 0x8a6048 }],
  ],
  bar: [
    ["House old fashioned", 14, { shape: "drink", color: 0xb87830 }],
    ["Local IPA", 9, { shape: "drink", color: 0xd8a23c }],
    ["Truffle fries", 11, { shape: "bowl", color: 0xe8c45a }],
    ["Sliders (3)", 15, { shape: "burger", color: 0x8a5a34 }],
    ["Negroni", 13, { shape: "drink", color: 0xc94a30 }],
  ],
  indonesian: [
    ["Nasi goreng spesial", 6, { shape: "bowl", color: 0xb8843c }],
    ["Sate ayam (10)", 5, { shape: "flat", color: 0xa8682e }],
    ["Mie ayam bakso", 4, { shape: "bowl", color: 0xe8d0a8 }],
    ["Gado-gado", 4, { shape: "bowl", color: 0x8aa84a }],
    ["Es teler", 3, { shape: "dessert", color: 0xf0d8c0 }],
    ["Es teh manis", 1.5, { shape: "drink", color: 0xc9762e }],
  ],
  thai: [
    ["Pad thai", 16, { shape: "bowl", color: 0xd8a05a }],
    ["Green curry", 17, { shape: "bowl", color: 0x8aac6a }],
    ["Mango sticky rice", 9, { shape: "dessert", color: 0xf0c45a }],
    ["Thai iced tea", 5, { shape: "drink", color: 0xd8843c }],
  ],
  dessert: [
    ["Two-scoop gelato", 7, { shape: "dessert", color: 0xf0c0d2 }],
    ["Hot fudge sundae", 9, { shape: "dessert", color: 0x8a6048 }],
    ["Affogato", 8, { shape: "drink", color: 0xc9a070 }],
    ["Waffle + berries", 11, { shape: "flat", color: 0xd8a85a }],
  ],
  american: [
    ["Roast chicken", 24, { shape: "steak", color: 0xc9924a }],
    ["Mac & cheese", 14, { shape: "bowl", color: 0xe8b84a }],
    ["Caesar salad", 13, { shape: "bowl", color: 0x8aa84a }],
    ["Apple pie", 9, { shape: "dessert", color: 0xd8a85a }],
    ["House red", 10, { shape: "drink", color: 0x6a1f2e }],
  ],
};
