import { describe, expect, it } from "vitest";

import { numberToExactRational, snapPlotPoint } from "../plot/snap";

const bounds = { xMin: -4, xMax: 4, yMin: -4, yMax: 4 };

describe("snapPlotPoint", () => {
  it("selects the nearest integer-grid intersection for every click", () => {
    const result = snapPlotPoint(
      { x: 1.41, y: -1.62 },
      {
        bounds
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

  it("returns exact integer coordinates for every selected grid point", () => {
    const result = snapPlotPoint(
      { x: -2.49, y: 0.49 },
      {
        bounds
      }
    );

    expect(result.point).toEqual({ x: -2, y: 0 });
    expect(result.snappedX).toBe(true);
    expect(result.snappedY).toBe(true);
    expect(result.vector).toEqual({
      x: {
        kind: "exact",
        value: { numerator: -2n, denominator: 1n },
        source: "snap"
      },
      y: {
        kind: "exact",
        value: { numerator: 0n, denominator: 1n },
        source: "snap"
      }
    });
  });

  it("keeps rounded selections on a visible lattice point at fractional plot edges", () => {
    const result = snapPlotPoint(
      { x: 4.4, y: -4.4 },
      { bounds: { xMin: -4.25, xMax: 4.25, yMin: -4.25, yMax: 4.25 } }
    );

    expect(result.point).toEqual({ x: 4, y: -4 });
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
