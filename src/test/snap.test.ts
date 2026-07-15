import { describe, expect, it } from "vitest";

import { numberToExactRational, snapPlotPoint } from "../plot/snap";

const bounds = { xMin: -4, xMax: 4, yMin: -4, yMax: 4 };

describe("snapPlotPoint", () => {
  it("snaps to the closest major-grid intersection within ten pixels", () => {
    const result = snapPlotPoint(
      { x: 1.08, y: -1.94 },
      {
        bounds,
        scaleX: 100,
        scaleY: 100,
        xTicks: [-4, -2, 0, 1, 2, 4],
        yTicks: [-4, -2, 0, 2, 4]
      }
    );

    expect(result.point).toEqual({ x: 1, y: -2 });
    expect(result.snappedX).toBe(true);
    expect(result.snappedY).toBe(true);
    expect(result.vector).toEqual({
      x: {
        kind: "exact",
        value: { numerator: 1n, denominator: 1n },
        source: "snap"
      },
      y: {
        kind: "exact",
        value: { numerator: -2n, denominator: 1n },
        source: "snap"
      }
    });
  });

  it("always makes a visible axis an exact snap target", () => {
    const result = snapPlotPoint(
      { x: 0.04, y: 1.37 },
      {
        bounds,
        scaleX: 150,
        scaleY: 100,
        xTicks: [-4, -2, 2, 4],
        yTicks: [-4, -2, 2, 4]
      }
    );

    expect(result.point).toEqual({ x: 0, y: 1.37 });
    expect(result.vector.x.kind).toBe("exact");
    expect(result.vector.y).toEqual({
      kind: "approximate",
      value: 1.37,
      source: "click"
    });
  });

  it("does not snap outside the pixel threshold and rounds free clicks", () => {
    const result = snapPlotPoint(
      { x: 1.101, y: -0.123456 },
      {
        bounds,
        scaleX: 100,
        scaleY: 100,
        xTicks: [0, 1, 2],
        yTicks: [-1, 0, 1]
      }
    );

    expect(result.point).toEqual({ x: 1.101, y: -0.1235 });
    expect(result.snappedX).toBe(false);
    expect(result.snappedY).toBe(false);
    expect(result.vector.x.kind).toBe("approximate");
  });

  it("does not partially snap to a non-axis grid line", () => {
    const result = snapPlotPoint(
      { x: 2.04, y: 1.37 },
      {
        bounds,
        scaleX: 100,
        scaleY: 100,
        xTicks: [-2, 0, 2],
        yTicks: [-2, 0, 2]
      }
    );

    expect(result.point).toEqual({ x: 2.04, y: 1.37 });
    expect(result.snappedX).toBe(false);
    expect(result.snappedY).toBe(false);
  });

  it("uses rendered CSS scale rather than view-box size", () => {
    const result = snapPlotPoint(
      { x: 1.15, y: 3 },
      {
        bounds,
        scaleX: 50,
        scaleY: 50,
        xTicks: [1],
        yTicks: [3]
      }
    );

    expect(result.point.x).toBe(1);
    expect(result.snappedX).toBe(true);
  });
});

describe("numberToExactRational", () => {
  it("normalizes terminating and scientific decimal spellings", () => {
    expect(numberToExactRational(0.25)).toEqual({ numerator: 1n, denominator: 4n });
    expect(numberToExactRational(1e-7)).toEqual({
      numerator: 1n,
      denominator: 10_000_000n
    });
  });
});
