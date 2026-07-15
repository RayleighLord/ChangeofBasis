import { describe, expect, it } from "vitest";

import {
  computeAdaptiveTicks,
  computeNiceTicks,
  formatTick,
  formatTickLatex
} from "../plot/ticks";

describe("computeNiceTicks", () => {
  it("keeps nice ticks inside non-integer bounds", () => {
    expect(computeNiceTicks(-2.5, 2.5, 8)).toEqual([-2, -1, 0, 1, 2]);
  });

  it("includes a range edge when it is an exact tick", () => {
    expect(computeNiceTicks(0, 0.3, 7)).toEqual([
      0,
      0.05,
      0.1,
      0.15,
      0.2,
      0.25,
      0.3
    ]);
  });

  it("returns no ticks for an invalid range", () => {
    expect(computeNiceTicks(2, 2)).toEqual([]);
    expect(computeNiceTicks(Number.NaN, 2)).toEqual([]);
  });

  it("stays bounded when a narrow interval has a huge offset", () => {
    const ticks = computeNiceTicks(1e20, 1e20 + 16_384);

    expect(ticks.length).toBeLessThanOrEqual(128);
    expect(ticks.every(Number.isFinite)).toBe(true);
  });

  it("retains distinct ticks for very small renderable windows", () => {
    const ticks = computeNiceTicks(-5e-200, 5e-200);

    expect(ticks.length).toBeGreaterThan(2);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks.some((tick) => tick < 0)).toBe(true);
    expect(ticks.some((tick) => tick > 0)).toBe(true);
  });
});

describe("computeAdaptiveTicks", () => {
  it("uses fewer grid lines for a shorter rendered axis", () => {
    const compact = computeAdaptiveTicks(-10, 10, 240);
    const spacious = computeAdaptiveTicks(-10, 10, 800);

    expect(compact.length).toBeLessThan(spacious.length);
    expect(compact).toContain(0);
    expect(spacious).toContain(0);
  });
});

describe("tick formatting", () => {
  it("formats ordinary values without floating-point debris", () => {
    expect(formatTick(-0)).toBe("0");
    expect(formatTick(1.5)).toBe("1.5");
  });

  it("provides readable text and LaTeX for scientific values", () => {
    expect(formatTick(0.0012)).toBe("1.2e-3");
    expect(formatTickLatex(0.0012)).toBe("1.2 \\times 10^{-3}");
    expect(formatTickLatex(12_000)).toBe("1.2 \\times 10^{4}");
    expect(formatTick(1_000_000_001_000)).not.toBe(formatTick(1_000_000_000_000));
  });
});
