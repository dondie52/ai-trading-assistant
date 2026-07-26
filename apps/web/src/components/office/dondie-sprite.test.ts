import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DondieSprite } from "./dondie-sprite";
import { SEATED_HEIGHT, SPRITE_WIDTH } from "./dondie-sprite-art";
import type { OfficePose } from "./office-pose";
import type { OfficeAgentStatus } from "./office-types";

const render = (pose: OfficePose, status: OfficeAgentStatus): string =>
  renderToStaticMarkup(createElement(DondieSprite, { pose, status }));

const countRects = (markup: string): number => markup.split("<rect").length - 1;

describe("DondieSprite", () => {
  it("renders a crisp seated sprite sized from the art grid", () => {
    const markup = render("sit", "idle");
    expect(markup).toContain(`viewBox="0 0 ${SPRITE_WIDTH} ${SEATED_HEIGHT}"`);
    expect(markup).toContain('shape-rendering="crispEdges"');
    expect(markup).toContain('aria-hidden="true"');
    expect(countRects(markup)).toBeGreaterThan(20);
  });

  it("exposes the mode and frame count so CSS can time the animation", () => {
    const markup = render("execute", "working");
    expect(markup).toContain('data-mode="type"');
    expect(markup).toContain('data-frames="2"');
    expect(markup).toContain('data-frame="0"');
    expect(markup).toContain('data-frame="1"');
  });

  it("themes the shirt from the office accent variable", () => {
    expect(render("sit", "idle")).toContain("var(--office-shirt)");
  });

  it("drops the blink layer for states that should hold still", () => {
    expect(render("sit", "idle")).toContain("office-sprite__blink");
    expect(render("sleep", "offline")).not.toContain("office-sprite__blink");
  });
});
