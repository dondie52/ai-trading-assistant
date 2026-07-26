/**
 * Pixel-art frame data for the Dondie desk sprite.
 *
 * Every layer row must be exactly SPRITE_WIDTH characters wide; the column
 * ruler below is the only way to keep the art aligned when editing by hand.
 *
 *            000000000011111111112222
 *            012345678901234567890123
 */

import type { OfficePose } from "./office-pose";
import type { OfficeAgentStatus } from "./office-types";

export const SPRITE_WIDTH = 24;
export const SEATED_HEIGHT = 22;
export const STANDING_HEIGHT = 28;

const TRANSPARENT = ".";

export const SPRITE_PALETTE: Readonly<Record<string, string>> = {
  K: "#0a0f18",
  H: "#2b2118",
  h: "#48372a",
  S: "#d0a074",
  s: "#a97a52",
  E: "#10161f",
  W: "#eef3ff",
  M: "#8f4a44",
  B: "var(--office-shirt)",
  b: "var(--office-shirt-shade)",
  C: "#e8eef8",
  T: "#1d2736",
  P: "#2a3548",
  O: "#12171f",
  G: "#4a5670"
};

export type SpriteLayer = {
  readonly top: number;
  readonly rows: readonly string[];
};

const layer = (top: number, rows: readonly string[]): SpriteLayer => ({ top, rows });

const HEAD = layer(1, [
  "........KKKKKKKK........",
  "......KKHHHHHHHHKK......",
  ".....KHHhhHHHHHHHHK.....",
  ".....KHHHHHHHHHHHHK.....",
  ".....KHHHHSSSSSSHHK.....",
  ".....KHHSSSSSSSSHHK.....",
  ".....KHWESSSSSSEWHK.....",
  ".....KHSSSSssSSSSHK.....",
  ".....KSSSSSSSSSSSSK.....",
  ".....KSSSSMMMMSSSSK.....",
  ".....KKssssssssssKK....."
]);

/** Headband arcs over the hair and the cups clamp onto the outside of the head. */
const HEADSET = layer(0, [
  ".......GGGGGGGGGG.......",
  ".....GG..........GG.....",
  "....GG............GG....",
  "...GG..............GG...",
  "...GG..............GG...",
  "..KGGK............KGGK..",
  "..KGGK............KGGK..",
  "..KGGK............KGGK..",
  "..KKKK............KKKK.."
]);

const TORSO = layer(12, [
  ".........KssssK.........",
  "...KKKKKKKssssKKKKKKK...",
  "...KBBBBBCCTTCCBBBBBK...",
  "...KBBBBBBCTTCBBBBBBK...",
  "...KBBBBBBBTTBBBBBBBK...",
  "...KBBBBBBBTTBBBBBBBK...",
  "...KBBBBBBBTTBBBBBBBK...",
  "...KBBBBBBBbbBBBBBBBK...",
  "....KbbbbbbbbbbbbbbK...."
]);

const LEGS = layer(21, [
  "....KPPPPPPPPPPPPPPK....",
  "....KPPPPPPKKPPPPPPK....",
  "....KPPPPPPKKPPPPPPK....",
  "....KPPPPPPKKPPPPPPK....",
  "....KPPPPPPKKPPPPPPK....",
  "....KOOOOOOKKOOOOOOK....",
  "....KKKKKKKKKKKKKKKK...."
]);

const ARMS_REST = layer(14, [
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KCCK............KCCK..",
  "..KSSK............KSSK..",
  "..KSSK............KSSK..",
  "..KKKK............KKKK.."
]);

const ARMS_TYPE_A = layer(14, [
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KBBK............KCCK..",
  "..KCCK............KSSK..",
  "..KSSK............KSSK..",
  "..KSSK............KKKK..",
  "..KKKK.................."
]);

const ARMS_TYPE_B = layer(14, [
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KCCK............KBBK..",
  "..KSSK............KCCK..",
  "..KSSK............KSSK..",
  "..KKKK............KSSK..",
  "..................KKKK.."
]);

const ARMS_PONDER = layer(10, [
  "......KSSK..............",
  "......KSSK..............",
  "......KCCK..............",
  ".....KBBK...............",
  "....KBBK..........KBBK..",
  "...KBBK...........KBBK..",
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KBBK............KCCK..",
  "..KKKK............KSSK..",
  "..................KSSK..",
  "..................KKKK.."
]);

const ARMS_RAISED = layer(8, [
  "..KSSK............KSSK..",
  "..KSSK............KSSK..",
  "..KCCK............KCCK..",
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KBBK............KBBK..",
  "..KBBK............KBBK.."
]);

const ZZZ = layer(2, [
  "...................WWW..",
  "....................W...",
  "...................WWW.."
]);

const EYES_FOCUSED = layer(7, [".......EE......EE......."]);

const EYES_WIDE = layer(6, [
  ".......WW......WW.......",
  ".......EE......EE......."
]);

const EYES_SHUT = layer(7, [".......KK......KK......."]);

const EYES_BLINK = layer(7, [".......ss......ss......."]);

const MOUTH_OPEN = layer(10, [
  "..........MMMM..........",
  "..........MMMM.........."
]);

const SWEAT = layer(3, [
  "......................W.",
  "......................W."
]);

export const SPRITE_LAYERS = {
  HEAD,
  HEADSET,
  TORSO,
  LEGS,
  ARMS_REST,
  ARMS_TYPE_A,
  ARMS_TYPE_B,
  ARMS_PONDER,
  ARMS_RAISED,
  EYES_FOCUSED,
  EYES_WIDE,
  EYES_SHUT,
  EYES_BLINK,
  MOUTH_OPEN,
  SWEAT,
  ZZZ
} as const;

export type SpriteRect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fill: string;
};

/** Flattens layers back-to-front into a single character grid. */
export const composeGrid = (
  layers: readonly SpriteLayer[],
  height: number
): readonly string[] => {
  const grid: string[][] = Array.from({ length: height }, () =>
    Array.from({ length: SPRITE_WIDTH }, () => TRANSPARENT)
  );

  for (const item of layers) {
    item.rows.forEach((row, index) => {
      const y = item.top + index;
      const target = grid[y];
      if (!target) {
        return;
      }
      for (let x = 0; x < SPRITE_WIDTH; x += 1) {
        const char = row[x];
        if (char && char !== TRANSPARENT) {
          target[x] = char;
        }
      }
    });
  }

  return grid.map((row) => row.join(""));
};

type MutableRect = { x: number; y: number; w: number; h: number; fill: string };

/**
 * Turns a character grid into rectangles, merging runs horizontally and then
 * vertically so a frame stays a few dozen SVG nodes instead of ~500.
 */
export const gridToRects = (grid: readonly string[]): readonly SpriteRect[] => {
  const rects: MutableRect[] = [];
  const open = new Map<string, MutableRect>();

  grid.forEach((row, y) => {
    let x = 0;
    while (x < SPRITE_WIDTH) {
      const char = row[x];
      const fill = char ? SPRITE_PALETTE[char] : undefined;
      if (!char || char === TRANSPARENT || !fill) {
        x += 1;
        continue;
      }

      let w = 1;
      while (row[x + w] === char) {
        w += 1;
      }

      const key = `${x}:${w}:${char}`;
      const previous = open.get(key);
      if (previous && previous.y + previous.h === y) {
        previous.h += 1;
      } else {
        const rect: MutableRect = { x, y, w, h: 1, fill };
        rects.push(rect);
        open.set(key, rect);
      }

      x += w;
    }
  });

  return rects;
};

/** Animation intent for the sprite, also used to drive CSS timing. */
export type SpriteMode = "type" | "ponder" | "rest" | "panic" | "sleep" | "stand";

export const resolveSpriteMode = (pose: OfficePose, status: OfficeAgentStatus): SpriteMode => {
  if (pose === "sleep" || status === "offline") {
    return "sleep";
  }
  if (pose === "alert") {
    return "panic";
  }
  if (pose === "execute") {
    return "type";
  }
  if (pose === "think") {
    // Waiting on something reads as pondering; actually working reads as typing.
    return status === "waiting" || status === "idle" ? "ponder" : "type";
  }
  if (pose === "stand" || pose === "walk") {
    return "stand";
  }
  return "rest";
};

export type SpriteView = {
  readonly mode: SpriteMode;
  readonly height: number;
  readonly frames: readonly (readonly SpriteRect[])[];
  /** Blink eyelids, drawn on top of every frame on its own slow cycle. */
  readonly blink: readonly SpriteRect[] | null;
};

const SEATED_BASE: readonly SpriteLayer[] = [HEAD, HEADSET, TORSO];
const STANDING_BASE: readonly SpriteLayer[] = [HEAD, HEADSET, TORSO, LEGS];

const shift = (item: SpriteLayer, rows: number): SpriteLayer => ({
  top: item.top + rows,
  rows: item.rows
});

const buildView = (
  mode: SpriteMode,
  frameLayers: readonly (readonly SpriteLayer[])[],
  height: number,
  blinkable: boolean
): SpriteView => ({
  mode,
  height,
  frames: frameLayers.map((layers) => gridToRects(composeGrid(layers, height))),
  blink: blinkable ? gridToRects(composeGrid([EYES_BLINK], height)) : null
});

const viewFor = (mode: SpriteMode): SpriteView => {
  switch (mode) {
    case "sleep":
      // Head drops a pixel onto the shoulders instead of rotating the sprite,
      // which would smear the pixel grid.
      return buildView(
        mode,
        [
          [
            TORSO,
            ARMS_REST,
            shift(HEAD, 1),
            shift(HEADSET, 1),
            shift(EYES_SHUT, 1),
            ZZZ
          ]
        ],
        SEATED_HEIGHT,
        false
      );
    case "panic": {
      const base = [...SEATED_BASE, ARMS_RAISED, EYES_WIDE, MOUTH_OPEN];
      return buildView(mode, [[...base, SWEAT], base], SEATED_HEIGHT, false);
    }
    case "type": {
      const base = [...SEATED_BASE, EYES_FOCUSED];
      return buildView(
        mode,
        [
          [...base, ARMS_TYPE_A],
          [...base, ARMS_TYPE_B]
        ],
        SEATED_HEIGHT,
        true
      );
    }
    case "ponder":
      return buildView(mode, [[...SEATED_BASE, ARMS_PONDER]], SEATED_HEIGHT, true);
    case "stand":
      return buildView(mode, [[...STANDING_BASE, ARMS_REST]], STANDING_HEIGHT, true);
    case "rest":
    default:
      return buildView("rest", [[...SEATED_BASE, ARMS_REST]], SEATED_HEIGHT, true);
  }
};

const cache = new Map<SpriteMode, SpriteView>();

/** Memoised because the office re-renders on every poll tick. */
export const resolveSpriteView = (pose: OfficePose, status: OfficeAgentStatus): SpriteView => {
  const mode = resolveSpriteMode(pose, status);
  const cached = cache.get(mode);
  if (cached) {
    return cached;
  }
  const view = viewFor(mode);
  cache.set(mode, view);
  return view;
};
