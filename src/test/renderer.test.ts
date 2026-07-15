import { describe, expect, it } from "vitest";

import { normalizeRational } from "../math/rational";
import {
  computeHalfUnitGridTicks,
  computeIntegerGridTicks,
  expandPlotBoundsToAspect,
  scaleRationalVectorForRendering
} from "../plot/renderer";
import { createCoordinateSystem } from "../plot/coordinates";
import type { PlotLayout } from "../types";

const rectangularLayout: PlotLayout = {
  width: 1200,
  height: 700,
  padding: { top: 50, right: 50, bottom: 50, left: 50 }
};

describe("responsive plotting bounds", () => {
  it("expands the horizontal range around its center for a wide viewport", () => {
    const expanded = expandPlotBoundsToAspect(
      { xMin: -4, xMax: 4, yMin: -4, yMax: 4 },
      rectangularLayout
    );
    const coordinates = createCoordinateSystem(rectangularLayout, expanded);

    expect(expanded.xMin).toBeCloseTo(-22 / 3, 10);
    expect(expanded.xMax).toBeCloseTo(22 / 3, 10);
    expect(expanded.yMin).toBe(-4);
    expect(expanded.yMax).toBe(4);
    expect(coordinates.innerWidth).toBeCloseTo(1100, 10);
    expect(coordinates.innerHeight).toBeCloseTo(600, 10);
    expect(coordinates.scaleX).toBe(coordinates.scaleY);
  });

  it("expands the vertical range around a nonzero center for a tall viewport", () => {
    const expanded = expandPlotBoundsToAspect(
      { xMin: -2, xMax: 6, yMin: 3, yMax: 7 },
      {
        width: 500,
        height: 900,
        padding: { top: 50, right: 50, bottom: 50, left: 50 }
      }
    );

    expect(expanded.xMin).toBe(-2);
    expect(expanded.xMax).toBe(6);
    expect((expanded.yMin + expanded.yMax) / 2).toBeCloseTo(5, 10);
    expect(expanded.yMax - expanded.yMin).toBeCloseTo(16, 10);
  });
});

describe("half-unit Cartesian grid", () => {
  it("places a minor half-unit line between every pair of integer lines", () => {
    expect(computeHalfUnitGridTicks(-2, 2)).toEqual([
      -2,
      -1.5,
      -1,
      -0.5,
      0,
      0.5,
      1,
      1.5,
      2
    ]);
  });

  it("never introduces coordinates finer than one half", () => {
    const ticks = computeHalfUnitGridTicks(-2.75, 3.4);

    expect(ticks).toEqual([-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3]);
    expect(ticks.every((tick) => Number.isInteger(tick * 2))).toBe(true);
  });

  it("stays bounded and finite for enormous ranges", () => {
    const ticks = computeHalfUnitGridTicks(-1e308, 1e308, 17);

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length).toBeLessThanOrEqual(17);
    expect(ticks.every((tick) => Number.isFinite(tick) && Number.isInteger(tick))).toBe(true);
  });

  it("falls back safely when half-unit indices exceed safe integer precision", () => {
    const ticks = computeHalfUnitGridTicks(1e16, 1e16 + 16, 17);

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length).toBeLessThanOrEqual(17);
    expect(ticks.every(Number.isFinite)).toBe(true);
  });

  it("retains a half-unit line in a range containing no integer", () => {
    expect(computeHalfUnitGridTicks(0.1, 0.9)).toEqual([0.5]);
  });

  it("retains the bounded integer helper used for wide-range fallback", () => {
    expect(computeIntegerGridTicks(-4, 4)).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
  });
});

describe("prime-component rendering geometry", () => {
  it("cancels reciprocal extreme magnitudes before numeric conversion", () => {
    const magnitude = 10n ** 400n;
    const endpoint = scaleRationalVectorForRendering(
      {
        kind: "exact",
        value: normalizeRational(magnitude),
        source: "input"
      },
      {
        x: normalizeRational(1n, magnitude),
        y: normalizeRational(-2n, magnitude)
      }
    );

    expect(endpoint).toEqual({ x: 1, y: -2 });
    expect(Object.values(endpoint).every(Number.isFinite)).toBe(true);
  });

  it("retains the numeric path for approximate click coordinates", () => {
    expect(
      scaleRationalVectorForRendering(
        { kind: "approximate", value: 1.5, source: "click" },
        {
          x: normalizeRational(2n),
          y: normalizeRational(-1n, 3n)
        }
      )
    ).toEqual({ x: 3, y: -0.5 });
  });
});
