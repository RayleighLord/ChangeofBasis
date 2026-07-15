import { describe, expect, it } from "vitest";

import { normalizeRational } from "../math/rational";
import {
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

describe("integer Cartesian grid", () => {
  it("uses every integer in the fixed default range", () => {
    expect(computeIntegerGridTicks(-4, 4)).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
  });

  it("never introduces fractional grid coordinates", () => {
    const ticks = computeIntegerGridTicks(-2.75, 3.4);

    expect(ticks).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(ticks.every(Number.isInteger)).toBe(true);
  });

  it("stays bounded and finite for enormous ranges", () => {
    const ticks = computeIntegerGridTicks(-1e308, 1e308, 17);

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length).toBeLessThanOrEqual(17);
    expect(ticks.every((tick) => Number.isFinite(tick) && Number.isInteger(tick))).toBe(true);
  });

  it("returns no lines when a range contains no integer", () => {
    expect(computeIntegerGridTicks(0.1, 0.9)).toEqual([]);
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
