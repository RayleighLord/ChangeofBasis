import type {
  Basis2D,
  BasisAnalysis,
  Matrix2,
  Rational,
  ScalarValue,
  SelectedVector,
  Vector2,
  VectorCoordinates,
} from "../types";
import {
  add,
  divide,
  formatRationalTex,
  isZero,
  multiply,
  negate,
  subtract,
  toNumber,
} from "./rational";

/** Builds P_(B <- B') with the B' basis vectors as columns. */
export function basisMatrix(basis: Basis2D): Matrix2<Rational> {
  return [
    [basis.first.x, basis.second.x],
    [basis.first.y, basis.second.y],
  ];
}

/** Computes the exact determinant of a 2x2 rational matrix. */
export function determinant2(matrix: Matrix2<Rational>): Rational {
  return subtract(
    multiply(matrix[0][0], matrix[1][1]),
    multiply(matrix[0][1], matrix[1][0]),
  );
}

/**
 * Computes an exact 2x2 inverse. A singular matrix has no inverse and returns
 * `null`; singularity is decided exactly rather than with a tolerance.
 */
export function inverse2(
  matrix: Matrix2<Rational>,
): Matrix2<Rational> | null {
  const determinant = determinant2(matrix);
  if (isZero(determinant)) {
    return null;
  }

  return [
    [divide(matrix[1][1], determinant), divide(negate(matrix[0][1]), determinant)],
    [divide(negate(matrix[1][0]), determinant), divide(matrix[0][0], determinant)],
  ];
}

/** Applies a rational matrix to a rational column vector. */
export function multiplyMatrixVector(
  matrix: Matrix2<Rational>,
  vector: Vector2<Rational>,
): Vector2<Rational> {
  return {
    x: add(
      multiply(matrix[0][0], vector.x),
      multiply(matrix[0][1], vector.y),
    ),
    y: add(
      multiply(matrix[1][0], vector.x),
      multiply(matrix[1][1], vector.y),
    ),
  };
}

/** Applies an exact rational matrix at the numeric SVG/UI boundary. */
export function multiplyMatrixVectorNumeric(
  matrix: Matrix2<Rational>,
  vector: Vector2<number>,
): Vector2<number> {
  return {
    x: toNumber(matrix[0][0]) * vector.x + toNumber(matrix[0][1]) * vector.y,
    y: toNumber(matrix[1][0]) * vector.x + toNumber(matrix[1][1]) * vector.y,
  };
}

export function matrixToNumeric(matrix: Matrix2<Rational>): Matrix2<number> {
  return [
    [toNumber(matrix[0][0]), toNumber(matrix[0][1])],
    [toNumber(matrix[1][0]), toNumber(matrix[1][1])],
  ];
}

/** Derives both change-of-basis matrices and exact validity metadata. */
export function analyzeBasis(basis: Basis2D): BasisAnalysis {
  const toStandard = basisMatrix(basis);
  const determinant = determinant2(toStandard);
  const toPrime = inverse2(toStandard);

  return {
    basis,
    determinant,
    toStandard,
    toPrime,
    isBasis: toPrime !== null,
  };
}

/** Converts B' coordinates to standard B coordinates exactly. */
export function primeToStandard(
  coordinates: Vector2<Rational>,
  basis: Basis2D,
): Vector2<Rational> {
  return multiplyMatrixVector(basisMatrix(basis), coordinates);
}

/** Converts standard B coordinates to B' coordinates exactly. */
export function standardToPrime(
  vector: Vector2<Rational>,
  basis: Basis2D,
): Vector2<Rational> | null {
  const inverse = inverse2(basisMatrix(basis));
  return inverse === null ? null : multiplyMatrixVector(inverse, vector);
}

/** Converts approximate B' coordinates to standard B coordinates. */
export function primeToStandardNumeric(
  coordinates: Vector2<number>,
  basis: Basis2D,
): Vector2<number> {
  return multiplyMatrixVectorNumeric(basisMatrix(basis), coordinates);
}

/** Converts approximate standard B coordinates to B' coordinates. */
export function standardToPrimeNumeric(
  vector: Vector2<number>,
  basis: Basis2D,
): Vector2<number> | null {
  const inverse = inverse2(basisMatrix(basis));
  return inverse === null ? null : multiplyMatrixVectorNumeric(inverse, vector);
}

export function scalarToNumber(value: ScalarValue): number {
  return value.kind === "exact" ? toNumber(value.value) : value.value;
}

export function selectedVectorToNumeric(
  vector: SelectedVector,
): Vector2<number> {
  return {
    x: scalarToNumber(vector.x),
    y: scalarToNumber(vector.y),
  };
}

function exactSource(vector: SelectedVector): "input" | "snap" {
  return vector.x.source === "snap" && vector.y.source === "snap"
    ? "snap"
    : "input";
}

function exactSelectedVector(
  vector: Vector2<Rational>,
  source: "input" | "snap",
): SelectedVector {
  return {
    x: { kind: "exact", value: vector.x, source },
    y: { kind: "exact", value: vector.y, source },
  };
}

function approximateSelectedVector(vector: Vector2<number>): SelectedVector {
  return {
    x: { kind: "approximate", value: vector.x, source: "click" },
    y: { kind: "approximate", value: vector.y, source: "click" },
  };
}

/**
 * Computes a selected vector's displayed coordinates in B and B'. Exact
 * inputs stay exact; if either component came from an unsnapped click, the
 * derived B' pair is consistently approximate. A singular B' yields `null`.
 */
export function coordinatesForSelectedVector(
  vector: SelectedVector,
  analysis: BasisAnalysis,
): VectorCoordinates {
  if (analysis.toPrime === null) {
    return { standard: vector, prime: null };
  }

  if (vector.x.kind === "exact" && vector.y.kind === "exact") {
    const prime = multiplyMatrixVector(analysis.toPrime, {
      x: vector.x.value,
      y: vector.y.value,
    });

    return {
      standard: vector,
      prime: exactSelectedVector(prime, exactSource(vector)),
    };
  }

  const prime = multiplyMatrixVectorNumeric(
    analysis.toPrime,
    selectedVectorToNumeric(vector),
  );

  return {
    standard: vector,
    prime: approximateSelectedVector(prime),
  };
}

/** Formats a 2x2 rational matrix as a KaTeX `bmatrix` expression. */
export function formatMatrixTex(matrix: Matrix2<Rational>): string {
  return `\\begin{bmatrix}${formatRationalTex(matrix[0][0])} & ${formatRationalTex(matrix[0][1])} \\\\ ${formatRationalTex(matrix[1][0])} & ${formatRationalTex(matrix[1][1])}\\end{bmatrix}`;
}
