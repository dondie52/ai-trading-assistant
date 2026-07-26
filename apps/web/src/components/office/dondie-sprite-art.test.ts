import { describe, expect, it } from "vitest";
import {
  composeGrid,
  gridToRects,
  resolveSpriteMode,
  resolveSpriteView,
  SEATED_HEIGHT,
  SPRITE_LAYERS,
  SPRITE_PALETTE,
  SPRITE_WIDTH,
  STANDING_HEIGHT,
  type SpriteLayer
} from "./dondie-sprite-art";
import type { OfficePose } from "./office-pose";
import type { OfficeAgentStatus } from "./office-types";

const layers = Object.entries(SPRITE_LAYERS);

describe("dondie sprite art data", () => {
  it("keeps every layer row exactly one sprite wide", () => {
    for (const [name, layer] of layers) {
      for (const [index, row] of layer.rows.entries()) {
        expect(row.length, `${name} row ${index}`).toBe(SPRITE_WIDTH);
      }
    }
  });

  it("only uses characters that exist in the palette", () => {
    const known = new Set([".", ...Object.keys(SPRITE_PALETTE)]);
    for (const [name, layer] of layers) {
      for (const row of layer.rows) {
        for (const char of row) {
          expect(known.has(char), `${name} uses "${char}"`).toBe(true);
        }
      }
    }
  });

  it("keeps every layer inside the frame it is used in", () => {
    for (const [name, layer] of layers) {
      const bottom = layer.top + layer.rows.length;
      expect(layer.top, `${name} top`).toBeGreaterThanOrEqual(0);
      expect(bottom, `${name} bottom`).toBeLessThanOrEqual(STANDING_HEIGHT);
    }
  });
});

describe("composeGrid", () => {
  const stripe: SpriteLayer = { top: 1, rows: ["KK......................"] };
  const patch: SpriteLayer = { top: 1, rows: [".S......................"] };

  it("paints later layers over earlier ones and skips transparent cells", () => {
    const grid = composeGrid([stripe, patch], 3);
    expect(grid).toHaveLength(3);
    expect(grid[0]).toBe(".".repeat(SPRITE_WIDTH));
    expect(grid[1]?.slice(0, 3)).toBe("KS.");
  });

  it("drops rows that fall outside the frame height", () => {
    const grid = composeGrid([{ top: 5, rows: ["KKKKKKKKKKKKKKKKKKKKKKKK"] }], 3);
    expect(grid.every((row) => row === ".".repeat(SPRITE_WIDTH))).toBe(true);
  });
});

describe("gridToRects", () => {
  it("merges runs horizontally", () => {
    const rects = gridToRects(["KKK.....................", ".".repeat(SPRITE_WIDTH)]);
    expect(rects).toEqual([{ x: 0, y: 0, w: 3, h: 1, fill: SPRITE_PALETTE.K }]);
  });

  it("merges identical runs vertically into one rect", () => {
    const rects = gridToRects([
      "KKK.....................",
      "KKK.....................",
      "KKK....................."
    ]);
    expect(rects).toEqual([{ x: 0, y: 0, w: 3, h: 3, fill: SPRITE_PALETTE.K }]);
  });

  it("does not merge runs of different colours or offsets", () => {
    const rects = gridToRects([
      "KKK.....................",
      "SSS.....................",
      ".KKK...................."
    ]);
    expect(rects).toHaveLength(3);
    expect(rects.map((rect) => rect.h)).toEqual([1, 1, 1]);
  });
});

describe("resolveSpriteMode", () => {
  const cases: readonly [OfficePose, OfficeAgentStatus, string][] = [
    ["sleep", "offline", "sleep"],
    ["sit", "offline", "sleep"],
    ["alert", "alert", "panic"],
    ["alert", "error", "panic"],
    ["execute", "working", "type"],
    ["think", "working", "type"],
    ["think", "waiting", "ponder"],
    ["think", "idle", "ponder"],
    ["stand", "idle", "stand"],
    ["walk", "idle", "stand"],
    ["sit", "idle", "rest"]
  ];

  it.each(cases)("maps %s/%s to %s", (pose, status, expected) => {
    expect(resolveSpriteMode(pose, status)).toBe(expected);
  });
});

describe("resolveSpriteView", () => {
  it("gives typing two frames and idle a single frame", () => {
    expect(resolveSpriteView("think", "working").frames).toHaveLength(2);
    expect(resolveSpriteView("sit", "idle").frames).toHaveLength(1);
  });

  it("moves the hands between typing frames", () => {
    const view = resolveSpriteView("execute", "working");
    const [first, second] = view.frames;
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
  });

  it("uses the seated frame for desk work and the tall frame when standing", () => {
    expect(resolveSpriteView("think", "working").height).toBe(SEATED_HEIGHT);
    expect(resolveSpriteView("stand", "idle").height).toBe(STANDING_HEIGHT);
  });

  it("stops blinking when asleep or panicking", () => {
    expect(resolveSpriteView("sleep", "offline").blink).toBeNull();
    expect(resolveSpriteView("alert", "alert").blink).toBeNull();
    expect(resolveSpriteView("sit", "idle").blink).not.toBeNull();
  });

  it("returns the cached view for a repeated pose", () => {
    expect(resolveSpriteView("think", "working")).toBe(resolveSpriteView("think", "working"));
  });

  it("draws pixels for every state without leaving the frame", () => {
    const poses: readonly OfficePose[] = [
      "sit",
      "stand",
      "walk",
      "think",
      "execute",
      "sleep",
      "alert"
    ];
    for (const pose of poses) {
      const view = resolveSpriteView(pose, "working");
      for (const frame of view.frames) {
        expect(frame.length).toBeGreaterThan(20);
        for (const rect of frame) {
          expect(rect.x + rect.w).toBeLessThanOrEqual(SPRITE_WIDTH);
          expect(rect.y + rect.h).toBeLessThanOrEqual(view.height);
        }
      }
    }
  });
});
