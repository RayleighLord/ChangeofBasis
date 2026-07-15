import { describe, expect, it } from "vitest";
import {
  ZERO,
  add,
  divide,
  equals,
  formatRational,
  formatRationalTex,
  isZero,
  multiply,
  negate,
  normalizeRational,
  parseRational,
  rationalFromNumber,
  reciprocal,
  subtract,
  toNumber,
  tryParseRational,
} from "../math/rational";

describe("normalized rationals", () => {
  it("reduces fractions and keeps the denominator positive", () => {
    expect(normalizeRational(12n, 18n)).toEqual({
      numerator: 2n,
      denominator: 3n,
    });
    expect(normalizeRational(12n, -18n)).toEqual({
      numerator: -2n,
      denominator: 3n,
    });
    expect(normalizeRational(-12n, -18n)).toEqual({
      numerator: 2n,
      denominator: 3n,
    });
  });

  it("uses one canonical representation for zero", () => {
    expect(normalizeRational(0n, -999n)).toEqual(ZERO);
    expect(isZero(normalizeRational(0n, 12n))).toBe(true);
  });

  it("rejects a zero denominator", () => {
    expect(() => normalizeRational(1n, 0n)).toThrow(RangeError);
  });
});

describe("parseRational", () => {
  it.each([
    ["7", 7n, 1n],
    [" +007 ", 7n, 1n],
    ["-0", 0n, 1n],
    ["-3/2", -3n, 2n],
    [" 6 / -8 ", -3n, 4n],
    ["0.125", 1n, 8n],
    ["-.5", -1n, 2n],
    ["3.", 3n, 1n],
    ["+12.3400", 617n, 50n],
  ])("parses %s exactly", (literal, numerator, denominator) => {
    expect(parseRational(literal)).toEqual({ numerator, denominator });
  });

  it.each([
    "",
    " ",
    "1/0",
    "1.2.3",
    "1/2/3",
    "1e3",
    "Infinity",
    "NaN",
    "sqrt(2)",
    "--1",
  ])("rejects %s", (literal) => {
    expect(() => parseRational(literal)).toThrow();
    expect(tryParseRational(literal)).toBeNull();
  });
});

describe("rational arithmetic", () => {
  const oneHalf = normalizeRational(1n, 2n);
  const twoThirds = normalizeRational(2n, 3n);

  it("performs the four operations exactly", () => {
    expect(add(oneHalf, twoThirds)).toEqual(normalizeRational(7n, 6n));
    expect(subtract(oneHalf, twoThirds)).toEqual(normalizeRational(-1n, 6n));
    expect(multiply(oneHalf, twoThirds)).toEqual(normalizeRational(1n, 3n));
    expect(divide(oneHalf, twoThirds)).toEqual(normalizeRational(3n, 4n));
  });

  it("negates, reciprocates, compares, and detects invalid division", () => {
    expect(negate(oneHalf)).toEqual(normalizeRational(-1n, 2n));
    expect(reciprocal(normalizeRational(-2n, 3n))).toEqual(
      normalizeRational(-3n, 2n),
    );
    expect(equals(oneHalf, { numerator: 2n, denominator: 4n })).toBe(true);
    expect(() => reciprocal(ZERO)).toThrow(RangeError);
    expect(() => divide(oneHalf, ZERO)).toThrow(RangeError);
  });
});

describe("rational boundaries and formatting", () => {
  it("converts finite decimal spellings, including scientific notation", () => {
    expect(rationalFromNumber(0.125)).toEqual(normalizeRational(1n, 8n));
    expect(rationalFromNumber(1e-7)).toEqual(
      normalizeRational(1n, 10_000_000n),
    );
    expect(rationalFromNumber(1e21)).toEqual(
      normalizeRational(1_000_000_000_000_000_000_000n),
    );
    expect(rationalFromNumber(-0)).toEqual(ZERO);
    expect(() => rationalFromNumber(Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });

  it("converts to numbers only when requested", () => {
    expect(toNumber(normalizeRational(1n, 8n))).toBe(0.125);
  });

  it("converts ratios of huge BigInts without Infinity divided by Infinity", () => {
    const magnitude = 10n ** 400n;

    expect(toNumber(normalizeRational(magnitude + 1n, magnitude + 3n))).toBe(1);
    expect(
      toNumber(normalizeRational(magnitude + 1n, 10n ** 100n + 3n)),
    ).toBeCloseTo(1e300, 12);
    expect(
      toNumber(normalizeRational(-(2n * magnitude + 1n), magnitude + 1n)),
    ).toBeCloseTo(-2, 14);
  });

  it("rejects invalid rational objects at the numeric boundary", () => {
    expect(() => toNumber({ numerator: 1n, denominator: 0n })).toThrow(
      RangeError,
    );
  });

  it("formats reduced plain-text and KaTeX values", () => {
    expect(formatRational({ numerator: 6n, denominator: -8n })).toBe("-3/4");
    expect(formatRationalTex(normalizeRational(-3n, 4n))).toBe(
      "-\\frac{3}{4}",
    );
    expect(formatRationalTex(normalizeRational(6n, 3n))).toBe("2");
  });
});
