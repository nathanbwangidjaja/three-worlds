// Programmatic tilemap composer. Builds 2D arrays of tile indices for
// Phaser.Tilemap, with helpers for painting regions, paths, and decorations.
// Uses the Kenney Tiny Town tileset (12 cols × 11 rows = 132 tiles, 16x16 each).

// Identified tile indices in Tiny Town
export const T = {
  // Ground
  GRASS:           0,
  GRASS_DEC:       1,
  GRASS_FLOWER:    2,
  PATH_TL:        12, PATH_TOP:      13, PATH_TR:    14,
  PATH_L:         24, PATH:          25, PATH_R:     26,
  PATH_BL:        36, PATH_BOT:      37, PATH_BR:    38,
  PATH_SMALL:     39,
  PATH_PATCH:     40,
  GRAVEL:         43,

  // Decorations
  TREE_PINE_S:     4,
  TREE_GREEN_S:    5,        // small bush
  BUSH:            5,
  TREE_PINE_BIG_TL:    6,
  TREE_PINE_BIG_TR:    7,
  TREE_PINE_BIG_BL:   18,
  TREE_PINE_BIG_BR:   19,
  TREE_BIG_GREEN_T:   16, TREE_BIG_GREEN_B: 28,
  TREE_YELLOW_T:      15, TREE_YELLOW_B: 27,
  MUSHROOMS:          29,
  FENCE:              44,
  STONE_PATCH:        43,
  FENCE_VERTICAL_TOP: 44,

  // Building roofs (blue and red variants — 3 wide x 2 tall)
  ROOF_B_TL: 48, ROOF_B_T: 49, ROOF_B_TR: 50,
  ROOF_B_BL: 60, ROOF_B_B: 61, ROOF_B_BR: 62,
  ROOF_R_TL: 52, ROOF_R_T: 53, ROOF_R_TR: 54,
  ROOF_R_BL: 64, ROOF_R_B: 65, ROOF_R_BR: 66,

  // Walls / doors
  DOOR_BLUE:   51,
  DOOR_RED:    55,
  WALL_BROWN:  72,
  WALL_DOOR:   74,    // arched doorway

  // Castle (large grey stone)
  CASTLE_WALL:    77,
  CASTLE_ARCH:    78,

  // Props / signs
  SIGN:           109,
  LAMP:           120,
};

export class TileMapBuilder {
  constructor(cols, rows, fillTile = T.GRASS) {
    this.cols = cols;
    this.rows = rows;
    this.data = Array.from({ length: rows }, () => Array(cols).fill(fillTile));
  }

  set(x, y, tile) {
    if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
      this.data[y][x] = tile;
    }
  }

  rect(x, y, w, h, tile) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.set(x + dx, y + dy, tile);
      }
    }
  }

  // Draw a rectangular dirt path with proper corner tiles around the border
  pathRect(x, y, w, h) {
    if (w < 2 || h < 2) { this.rect(x, y, w, h, T.PATH); return; }
    // interior
    this.rect(x + 1, y + 1, w - 2, h - 2, T.PATH);
    // edges
    for (let dx = 1; dx < w - 1; dx++) {
      this.set(x + dx, y, T.PATH_TOP);
      this.set(x + dx, y + h - 1, T.PATH_BOT);
    }
    for (let dy = 1; dy < h - 1; dy++) {
      this.set(x, y + dy, T.PATH_L);
      this.set(x + w - 1, y + dy, T.PATH_R);
    }
    // corners
    this.set(x, y, T.PATH_TL);
    this.set(x + w - 1, y, T.PATH_TR);
    this.set(x, y + h - 1, T.PATH_BL);
    this.set(x + w - 1, y + h - 1, T.PATH_BR);
  }

  // Horizontal path strip (1 tile tall)
  pathH(x, y, w) {
    if (w < 1) return;
    for (let dx = 0; dx < w; dx++) this.set(x + dx, y, T.PATH);
  }
  // Vertical path strip
  pathV(x, y, h) {
    if (h < 1) return;
    for (let dy = 0; dy < h; dy++) this.set(x, y + dy, T.PATH);
  }

  // Place a 3-wide x 2-tall house with the given roof color (red/blue)
  // The "door" tile is at house base center; the player can walk near it.
  house(x, y, color = "red") {
    const r = color === "blue" ? T.ROOF_B_TL : T.ROOF_R_TL;
    const offset = color === "blue" ? 0 : 4;
    // roof
    this.set(x, y,     T.ROOF_B_TL + offset);
    this.set(x + 1, y, T.ROOF_B_T  + offset);
    this.set(x + 2, y, T.ROOF_B_TR + offset);
    this.set(x, y + 1,     T.ROOF_B_BL + offset);
    this.set(x + 1, y + 1, T.ROOF_B_B  + offset);
    this.set(x + 2, y + 1, T.ROOF_B_BR + offset);
  }

  // A 2x2 tall pine tree
  bigPine(x, y) {
    this.set(x, y, T.TREE_PINE_BIG_TL);
    this.set(x + 1, y, T.TREE_PINE_BIG_TR);
    this.set(x, y + 1, T.TREE_PINE_BIG_BL);
    this.set(x + 1, y + 1, T.TREE_PINE_BIG_BR);
  }

  // A 1x2 tall green tree
  bigGreen(x, y) {
    this.set(x, y, T.TREE_BIG_GREEN_T);
    this.set(x, y + 1, T.TREE_BIG_GREEN_B);
  }

  // A 1x2 yellow autumn tree
  yellowTree(x, y) {
    this.set(x, y, T.TREE_YELLOW_T);
    this.set(x, y + 1, T.TREE_YELLOW_B);
  }

  // Border of trees around the map (for visual edge)
  borderTrees(thickness = 1) {
    for (let x = 0; x < this.cols; x += 2) {
      this.bigPine(x, 0);
      this.bigPine(x, this.rows - 2);
    }
    for (let y = 0; y < this.rows; y += 2) {
      this.bigPine(0, y);
      this.bigPine(this.cols - 2, y);
    }
  }

  // Scatter random small trees/bushes/flowers in a region
  scatter(x, y, w, h, density = 0.1, tiles = [T.TREE_PINE_S, T.BUSH, T.MUSHROOMS, T.GRASS_FLOWER]) {
    // Deterministic seeded "random" so the map is stable
    let seed = 1337 + x * 31 + y * 71;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (rand() < density) {
          this.set(x + dx, y + dy, tiles[Math.floor(rand() * tiles.length)]);
        }
      }
    }
  }

  toArray() { return this.data; }
}
