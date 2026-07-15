import type { Rational } from "../types";

/** The canonical rational zero. */
export const ZERO: Rational = { numerator: 0n, denominator: 1n };

/** The canonical rational one. */
export const ONE: Rational = { numerator: 1n, denominator: 1n };

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);

  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

/**
 * Creates a rational in its unique normalized form.
 *
 * The denominator is always positive, numerator and denominator are coprime,
 * and every representation of zero is normalized to 0/1.
 */
export function normalizeRational(
  numerator: bigint,
  denominator: bigint = 1n,
): Rational {
  if (denominator === 0n) {
    throw new RangeError("A rational number cannot have a zero denominator.");
  }

  if (numerator === 0n) {
    return ZERO;
  }

  const sign = denominator < 0n ? -1n : 1n;
  const divisor = greatestCommonDivisor(numerator, denominator);

  return {
    numerator: (sign * numerator) / divisor,
    denominator: absolute(denominator) / divisor,
  };
}

function parseDecimalParts(
  signText: string,
  integerText: string | undefined,
  fractionalText: string | undefined,
): Rational {
  const sign = signText === "-" ? -1n : 1n;
  const integerPart = integerText && integerText.length > 0 ? integerText : "0";
  const fractionalPart = fractionalText ?? "";
  const denominator = 10n ** BigInt(fractionalPart.length);
  const digits = `${integerPart}${fractionalPart}`;
  return normalizeRational(sign * BigInt(digits || "0"), denominator);
}

/**
 * Parses an exact numeric literal.
 *
 * Accepted forms are signed integers (`-2`), terminating decimals (`.5`,
 * `2.75`, `3.`), and fractions whose numerator and denominator are integers
 * (`-3/2`). Surrounding whitespace, and whitespace around `/`, is allowed.
 * Symbolic expressions, exponents, repeating decimals, and zero denominators
 * are rejected.
 */
export function parseRational(text: string): Rational {
  const value = text.trim();

  if (value.length === 0) {
    throw new SyntaxError("Enter an integer, decimal, or fraction.");
  }

  const fractionMatch = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(value);
  if (fractionMatch) {
    const denominator = BigInt(fractionMatch[2]);
    if (denominator === 0n) {
      throw new RangeError("A rational number cannot have a zero denominator.");
    }

    return normalizeRational(BigInt(fractionMatch[1]), denominator);
  }

  const integerMatch = /^([+-]?)(\d+)$/.exec(value);
  if (integerMatch) {
    const sign = integerMatch[1] === "-" ? -1n : 1n;
    return normalizeRational(sign * BigInt(integerMatch[2]));
  }

  const decimalMatch = /^([+-]?)(?:(\d+)\.(\d*)|\.(\d+))$/.exec(value);
  if (decimalMatch) {
    return parseDecimalParts(
      decimalMatch[1],
      decimalMatch[2],
      decimalMatch[3] ?? decimalMatch[4],
    );
  }

  throw new SyntaxError(`"${text}" is not an exact numeric literal.`);
}

/** Returns a normalized rational, or `null` when the input is invalid. */
export function tryParseRational(text: string): Rational | null {
  try {
    return parseRational(text);
  } catch {
    return null;
  }
}

/**
 * Converts a finite JavaScript number through its shortest decimal spelling.
 * This is useful for exact grid snaps; unsnapped pointer coordinates should
 * remain approximate numbers instead.
 */
export function rationalFromNumber(value: number): Rational {
  if (!Number.isFinite(value)) {
    throw new RangeError("Only finite numbers can be converted to rationals.");
  }

  if (Object.is(value, -0) || value === 0) {
    return ZERO;
  }

  const spelling = value.toString();
  if (!/[eE]/.test(spelling)) {
    return parseRational(spelling);
  }

  const scientificMatch = /^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(
    spelling,
  );
  if (!scientificMatch) {
    throw new RangeError(`Unable to convert ${spelling} to a rational.`);
  }

  const sign = scientificMatch[1] === "-" ? -1n : 1n;
  const integerPart = scientificMatch[2];
  const fractionalPart = scientificMatch[3] ?? "";
  const exponent = Number.parseInt(scientificMatch[4], 10);
  const digits = BigInt(`${integerPart}${fractionalPart}`);
  const decimalPlaces = fractionalPart.length - exponent;

  if (decimalPlaces <= 0) {
    return normalizeRational(
      sign * digits * 10n ** BigInt(-decimalPlaces),
    );
  }

  return normalizeRational(
    sign * digits,
    10n ** BigInt(decimalPlaces),
  );
}

export function add(left: Rational, right: Rational): Rational {
  return normalizeRational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function subtract(left: Rational, right: Rational): Rational {
  return normalizeRational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function multiply(left: Rational, right: Rational): Rational {
  return normalizeRational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

export function divide(left: Rational, right: Rational): Rational {
  if (isZero(right)) {
    throw new RangeError("Cannot divide by zero.");
  }

  return normalizeRational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

export function negate(value: Rational): Rational {
  return normalizeRational(-value.numerator, value.denominator);
}

export function reciprocal(value: Rational): Rational {
  if (isZero(value)) {
    throw new RangeError("Zero has no reciprocal.");
  }

  return normalizeRational(value.denominator, value.numerator);
}

export function equals(left: Rational, right: Rational): boolean {
  return (
    left.numerator * right.denominator ===
    right.numerator * left.denominator
  );
}

export function isZero(value: Rational): boolean {
  return value.numerator === 0n;
}

export function toNumber(value: Rational): number {
  if (value.denominator === 0n) {
    throw new RangeError("A rational number cannot have a zero denominator.");
  }

  if (value.numerator === 0n) {
    return 0;
  }

  const numerator = Number(value.numerator);
  const denominator = Number(value.denominator);
  if (Number.isFinite(numerator) && Number.isFinite(denominator)) {
    return numerator / denominator;
  }

  // Converting the two BigInts separately can produce Infinity / Infinity even
  // when their ratio is ordinary (for example, two coprime 400-digit values).
  // Retain enough leading decimal digits to estimate the quotient, then let the
  // JavaScript parser apply the combined exponent in one step. This also keeps
  // a huge numerator divided by a merely large denominator from overflowing
  // before cancellation can occur.
  const isNegative = (value.numerator < 0n) !== (value.denominator < 0n);
  const numeratorText = absolute(value.numerator).toString();
  const denominatorText = absolute(value.denominator).toString();
  const significantDigits = 17;
  const numeratorMantissa = leadingDecimalMantissa(
    numeratorText,
    significantDigits,
  );
  const denominatorMantissa = leadingDecimalMantissa(
    denominatorText,
    significantDigits,
  );
  const quotientMantissa = numeratorMantissa / denominatorMantissa;
  const decimalExponent = numeratorText.length - denominatorText.length;

  return Number(
    `${isNegative ? "-" : ""}${quotientMantissa}e${decimalExponent}`,
  );
}

function leadingDecimalMantissa(text: string, digits: number): number {
  const leadingDigits = text.slice(0, digits);
  return Number(leadingDigits) / 10 ** (leadingDigits.length - 1);
}

/** Formats a rational as a reduced integer or `numerator/denominator`. */
export function formatRational(value: Rational): string {
  const normalized = normalizeRational(value.numerator, value.denominator);
  return normalized.denominator === 1n
    ? normalized.numerator.toString()
    : `${normalized.numerator}/${normalized.denominator}`;
}

/** Formats a rational for KaTeX without adding math delimiters. */
export function formatRationalTex(value: Rational): string {
  const normalized = normalizeRational(value.numerator, value.denominator);
  if (normalized.denominator === 1n) {
    return normalized.numerator.toString();
  }

  if (normalized.numerator < 0n) {
    return `-\\frac{${-normalized.numerator}}{${normalized.denominator}}`;
  }

  return `\\frac{${normalized.numerator}}{${normalized.denominator}}`;
}
