export interface AdaptiveTicks {
  ticks: number[];
  step: number;
}

const MAX_TICK_COUNT = 128;

/** Returns ticks at a human-friendly 1/2/5 multiple without crossing the bounds. */
export function computeNiceTicks(min: number, max: number, targetCount = 7): number[] {
  return computeNiceTickSet(min, max, targetCount).ticks;
}

/**
 * Chooses the tick count from the rendered axis length. This keeps the grid
 * legible as the stage changes size or the model bounds become asymmetric.
 */
export function computeAdaptiveTicks(
  min: number,
  max: number,
  pixelSpan: number,
  minimumSpacing = 72
): number[] {
  if (!Number.isFinite(pixelSpan) || pixelSpan <= 0) {
    return [];
  }

  const targetCount = Math.min(
    MAX_TICK_COUNT,
    Math.max(2, Math.floor(pixelSpan / Math.max(minimumSpacing, 24)) + 1)
  );
  return computeNiceTicks(min, max, targetCount);
}

export function computeNiceTickSet(min: number, max: number, targetCount = 7): AdaptiveTicks {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) {
    return { ticks: [], step: Number.NaN };
  }

  const roughStep = span / Math.max(targetCount, 2);
  const step = niceStep(roughStep);
  if (!Number.isFinite(step) || step <= 0) {
    return { ticks: [], step: Number.NaN };
  }

  // Keep the tolerance local to one tick. A tolerance based on a large offset
  // can expand a narrow range into millions of nominal grid lines.
  const tolerance = Math.abs(step) * 1e-9;
  const startMultiple = Math.ceil((min - tolerance) / step);
  const endMultiple = Math.floor((max + tolerance) / step);
  const ticks: number[] = [];

  if (!Number.isFinite(startMultiple) || !Number.isFinite(endMultiple)) {
    return { ticks, step };
  }

  let previousMultiple: number | null = null;
  for (
    let index = 0;
    index < MAX_TICK_COUNT && startMultiple + index <= endMultiple;
    index += 1
  ) {
    const multiple = startMultiple + index;
    // Above 2^53, adding one may not advance the floating-point value.
    if (previousMultiple !== null && multiple <= previousMultiple) {
      break;
    }
    previousMultiple = multiple;

    const tick = normalizeTick(multiple * step, step);
    if (
      Number.isFinite(tick) &&
      tick >= min - tolerance &&
      tick <= max + tolerance &&
      (ticks.length === 0 || tick !== ticks[ticks.length - 1])
    ) {
      ticks.push(tick);
    }
  }

  return { ticks, step };
}

export function formatTick(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  const magnitude = Math.abs(normalized);

  if (magnitude >= 1_000 || (magnitude > 0 && magnitude < 0.01)) {
    return normalized
      .toExponential()
      .replace("e+", "e");
  }

  return `${Number(normalized.toPrecision(10))}`;
}

export function formatTickLatex(value: number): string {
  const formatted = formatTick(value);
  if (!formatted.includes("e")) {
    return formatted;
  }

  const [mantissa = "0", exponent = "0"] = formatted.split("e");
  return `${mantissa} \\times 10^{${Number(exponent)}}`;
}

function niceStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    return Number.NaN;
  }
  const exponent = Math.floor(Math.log10(step));
  const power = 10 ** exponent || Number.MIN_VALUE;
  const fraction = step / power;

  if (fraction <= 1) {
    return power;
  }
  if (fraction <= 2) {
    return 2 * power;
  }
  if (fraction <= 5) {
    return 5 * power;
  }
  return 10 * power;
}

function normalizeTick(value: number, step: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  if (value === 0) {
    return 0;
  }

  // Use the tick's magnitude relative to its step to retain enough significant
  // digits for adjacent ticks, independent of the decimal exponent.
  const multiplesFromZero = Math.abs(value / step);
  const precision = Math.min(
    17,
    Math.max(1, Math.ceil(Math.log10(Math.max(multiplesFromZero, 1))) + 2)
  );
  const normalized = Number(value.toPrecision(precision));
  return Object.is(normalized, -0) ? 0 : normalized;
}
