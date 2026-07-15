import { describe, expect, it } from "vitest";

import { normalizeRational } from "../math/rational";
import { scaleRationalVectorForRendering } from "../plot/renderer";

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
