import { describe, expect, it } from "vitest";

import { createCoordinateSystem } from "../plot/coordinates";
import type { PlotBounds, PlotLayout } from "../types";

const squareLayout: PlotLayout = {
  width: 800,
  height: 800,
  padding: { top: 0, right: 0, bottom: 0, left: 0 }
};

describe("createCoordinateSystem", () => {
  it("round-trips model points through SVG space", () => {
    const bounds: PlotBounds = { xMin: -4, xMax: 4, yMin: -4, yMax: 4 };
    const coordinates = createCoordinateSystem(squareLayout, bounds);
    const point = { x: 1.25, y: -0.75 };

    const roundTrip = coordinates.svgToModel(coordinates.modelToSvg(point));

    expect(roundTrip.x).toBeCloseTo(point.x, 10);
    expect(roundTrip.y).toBeCloseTo(point.y, 10);
  });

  it("uses one scale for both axes and centers unequal ranges", () => {
    const coordinates = createCoordinateSystem(squareLayout, {
      xMin: -4,
      xMax: 4,
      yMin: -2,
      yMax: 2
    });

    expect(coordinates.scaleX).toBe(100);
    expect(coordinates.scaleY).toBe(100);
    expect(coordinates.innerLeft).toBe(0);
    expect(coordinates.innerTop).toBe(200);
    expect(coordinates.innerWidth).toBe(800);
    expect(coordinates.innerHeight).toBe(400);
  });

  it("treats centered letterboxing as outside the clickable frame", () => {
    const coordinates = createCoordinateSystem(squareLayout, {
      xMin: -4,
      xMax: 4,
      yMin: -2,
      yMax: 2
    });

    expect(coordinates.containsSvgPoint({ x: 400, y: 100 })).toBe(false);
    expect(coordinates.containsSvgPoint({ x: 400, y: 200 })).toBe(true);
    expect(coordinates.containsSvgPoint({ x: 800, y: 600 })).toBe(true);
  });

  it("rejects non-increasing bounds", () => {
    expect(() =>
      createCoordinateSystem(squareLayout, {
        xMin: 1,
        xMax: 1,
        yMin: -1,
        yMax: 1
      })
    ).toThrow(/strictly increasing/i);
  });

  it("rejects finite endpoints whose span overflows", () => {
    expect(() =>
      createCoordinateSystem(squareLayout, {
        xMin: -1e308,
        xMax: 1e308,
        yMin: -1,
        yMax: 1
      })
    ).toThrow(/finite spans/i);
  });

  it("rejects spans that cannot produce a finite unit scale", () => {
    expect(() =>
      createCoordinateSystem(squareLayout, {
        xMin: 0,
        xMax: Number.MIN_VALUE,
        yMin: -1,
        yMax: 1
      })
    ).toThrow(/renderable spans/i);
    expect(() =>
      createCoordinateSystem(squareLayout, {
        xMin: 0,
        xMax: 1e-307,
        yMin: 0,
        yMax: 1e-307
      })
    ).toThrow(/renderable spans/i);
  });
});
