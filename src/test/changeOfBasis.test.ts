import { describe, expect, it } from "vitest";
import type {
  Basis2D,
  Matrix2,
  Rational,
  SelectedVector,
  Vector2,
} from "../types";
import {
  analyzeBasis,
  basisMatrix,
  coordinatesForSelectedVector,
  determinant2,
  formatMatrixTex,
  inverse2,
  multiplyMatrixVector,
  primeToStandard,
  primeToStandardNumeric,
  standardToPrime,
  standardToPrimeNumeric,
} from "../math/changeOfBasis";
import { normalizeRational } from "../math/rational";

const q = (numerator: bigint, denominator: bigint = 1n): Rational =>
  normalizeRational(numerator, denominator);

const defaultBasis: Basis2D = {
  first: { x: q(1n), y: q(1n) },
  second: { x: q(-1n), y: q(1n) },
};

describe("basis analysis", () => {
  it("places basis vectors in columns and derives both default matrices", () => {
    const analysis = analyzeBasis(defaultBasis);

    expect(analysis.toStandard).toEqual([
      [q(1n), q(-1n)],
      [q(1n), q(1n)],
    ]);
    expect(analysis.determinant).toEqual(q(2n));
    expect(analysis.toPrime).toEqual([
      [q(1n, 2n), q(1n, 2n)],
      [q(-1n, 2n), q(1n, 2n)],
    ]);
    expect(analysis.isBasis).toBe(true);
  });

  it("handles fractional entries exactly", () => {
    const basis: Basis2D = {
      first: { x: q(1n, 2n), y: q(0n) },
      second: { x: q(0n), y: q(2n, 3n) },
    };
    const analysis = analyzeBasis(basis);

    expect(analysis.determinant).toEqual(q(1n, 3n));
    expect(analysis.toPrime).toEqual([
      [q(2n), q(0n)],
      [q(0n), q(3n, 2n)],
    ]);
  });

  it("preserves negative determinant orientation", () => {
    const swapped: Basis2D = {
      first: { x: q(0n), y: q(1n) },
      second: { x: q(1n), y: q(0n) },
    };

    expect(determinant2(basisMatrix(swapped))).toEqual(q(-1n));
    expect(inverse2(basisMatrix(swapped))).toEqual(basisMatrix(swapped));
  });

  it("identifies collinear vectors and the zero-vector case exactly", () => {
    const singularCases: Basis2D[] = [
      {
        first: { x: q(1n), y: q(2n) },
        second: { x: q(2n), y: q(4n) },
      },
      {
        first: { x: q(0n), y: q(0n) },
        second: { x: q(2n), y: q(-3n) },
      },
    ];

    for (const basis of singularCases) {
      const analysis = analyzeBasis(basis);
      expect(analysis.determinant).toEqual(q(0n));
      expect(analysis.toPrime).toBeNull();
      expect(analysis.isBasis).toBe(false);
    }
  });
});

describe("coordinate transformations", () => {
  it("finds [v]_B' = (2, -1) for [v]_B = (3, 1)", () => {
    const vector = { x: q(3n), y: q(1n) };
    const prime = standardToPrime(vector, defaultBasis);

    expect(prime).toEqual({ x: q(2n), y: q(-1n) });
    expect(prime && primeToStandard(prime, defaultBasis)).toEqual(vector);
  });

  it("multiplies a matrix by a vector with exact fractions", () => {
    const matrix: Matrix2<Rational> = [
      [q(1n, 2n), q(1n, 3n)],
      [q(-2n), q(3n, 4n)],
    ];
    const vector: Vector2<Rational> = { x: q(6n), y: q(12n) };

    expect(multiplyMatrixVector(matrix, vector)).toEqual({
      x: q(7n),
      y: q(-3n),
    });
  });

  it("returns null when standard coordinates cannot be resolved uniquely", () => {
    const singular: Basis2D = {
      first: { x: q(1n), y: q(2n) },
      second: { x: q(2n), y: q(4n) },
    };

    expect(standardToPrime({ x: q(3n), y: q(1n) }, singular)).toBeNull();
    expect(standardToPrimeNumeric({ x: 3, y: 1 }, singular)).toBeNull();
  });

  it("provides numeric variants for approximate pointer coordinates", () => {
    const prime = standardToPrimeNumeric({ x: 2.4, y: -0.2 }, defaultBasis);
    expect(prime).not.toBeNull();
    expect(prime?.x).toBeCloseTo(1.1, 12);
    expect(prime?.y).toBeCloseTo(-1.3, 12);

    const standard = primeToStandardNumeric(prime!, defaultBasis);
    expect(standard.x).toBeCloseTo(2.4, 12);
    expect(standard.y).toBeCloseTo(-0.2, 12);
  });
});

describe("selected-vector coordinates", () => {
  it("keeps manually entered values and derived coordinates exact", () => {
    const selected: SelectedVector = {
      x: { kind: "exact", value: q(3n), source: "input" },
      y: { kind: "exact", value: q(1n), source: "input" },
    };
    const coordinates = coordinatesForSelectedVector(
      selected,
      analyzeBasis(defaultBasis),
    );

    expect(coordinates.standard).toBe(selected);
    expect(coordinates.prime).toEqual({
      x: { kind: "exact", value: q(2n), source: "input" },
      y: { kind: "exact", value: q(-1n), source: "input" },
    });
  });

  it("marks both derived coordinates approximate when either input is approximate", () => {
    const selected: SelectedVector = {
      x: { kind: "exact", value: q(3n), source: "snap" },
      y: { kind: "approximate", value: 1.25, source: "click" },
    };
    const coordinates = coordinatesForSelectedVector(
      selected,
      analyzeBasis(defaultBasis),
    );

    expect(coordinates.prime?.x.kind).toBe("approximate");
    expect(coordinates.prime?.y.kind).toBe("approximate");
    if (
      coordinates.prime?.x.kind === "approximate" &&
      coordinates.prime.y.kind === "approximate"
    ) {
      expect(coordinates.prime.x.value).toBeCloseTo(2.125, 12);
      expect(coordinates.prime.y.value).toBeCloseTo(-0.875, 12);
    }
  });

  it("omits B' coordinates for a singular candidate", () => {
    const singular: Basis2D = {
      first: { x: q(1n), y: q(2n) },
      second: { x: q(2n), y: q(4n) },
    };
    const selected: SelectedVector = {
      x: { kind: "exact", value: q(3n), source: "input" },
      y: { kind: "exact", value: q(1n), source: "input" },
    };

    expect(
      coordinatesForSelectedVector(selected, analyzeBasis(singular)).prime,
    ).toBeNull();
  });
});

describe("matrix formatting", () => {
  it("renders reduced entries in a KaTeX bmatrix", () => {
    expect(formatMatrixTex(analyzeBasis(defaultBasis).toPrime!)).toBe(
      "\\begin{bmatrix}\\frac{1}{2} & \\frac{1}{2} \\\\ -\\frac{1}{2} & \\frac{1}{2}\\end{bmatrix}",
    );
  });
});
