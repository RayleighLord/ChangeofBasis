import { rationalFromNumber } from "../math/rational";
import type { PlotBounds, Rational, ScalarValue, SelectedVector, Vector2 } from "../types";
import { computeAdaptiveTicks } from "./ticks";

const DEFAULT_SNAP_PIXELS = 10;
const DEFAULT_CLICK_PRECISION = 4;

export interface PlotSnapOptions {
  bounds: PlotBounds;
  /** Rendered CSS pixels per model unit. */
  scaleX: number;
  /** Rendered CSS pixels per model unit. */
  scaleY: number;
  xTicks?: readonly number[];
  yTicks?: readonly number[];
  snapPixels?: number;
  clickPrecision?: number;
}

export interface PlotSnapResult {
  point: Vector2<number>;
  vector: SelectedVector;
  snappedX: boolean;
  snappedY: boolean;
}

/**
 * Snaps to a visible axis projection or to a rendered major-grid intersection.
 * A lone non-axis grid line never partially snaps a point. Snapped values are
 * exact; free click values are rounded and deliberately marked approximate.
 */
export function snapPlotPoint(
  point: Vector2<number>,
  options: PlotSnapOptions
): PlotSnapResult {
  const snapPixels = options.snapPixels ?? DEFAULT_SNAP_PIXELS;
  const clickPrecision = options.clickPrecision ?? DEFAULT_CLICK_PRECISION;
  const xTicks = options.xTicks ?? computeAdaptiveTicks(options.bounds.xMin, options.bounds.xMax, 640);
  const yTicks = options.yTicks ?? computeAdaptiveTicks(options.bounds.yMin, options.bounds.yMax, 640);
  const xCandidates = visibleCandidates(xTicks, options.bounds.xMin, options.bounds.xMax);
  const yCandidates = visibleCandidates(yTicks, options.bounds.yMin, options.bounds.yMax);

  const nearestX = closestCandidate(point.x, xCandidates, options.scaleX);
  const nearestY = closestCandidate(point.y, yCandidates, options.scaleY);
  const nearIntersection =
    nearestX !== null &&
    nearestY !== null &&
    Math.hypot(nearestX.pixelDistance, nearestY.pixelDistance) <= snapPixels + 1e-9;

  const xAxisVisible = options.bounds.yMin <= 0 && options.bounds.yMax >= 0;
  const yAxisVisible = options.bounds.xMin <= 0 && options.bounds.xMax >= 0;
  const snappedX = nearIntersection
    ? nearestX.value
    : yAxisVisible && Math.abs(point.x) * options.scaleX <= snapPixels + 1e-9
      ? 0
      : null;
  const snappedY = nearIntersection
    ? nearestY.value
    : xAxisVisible && Math.abs(point.y) * options.scaleY <= snapPixels + 1e-9
      ? 0
      : null;
  const x = snappedX ?? roundClickValue(point.x, clickPrecision);
  const y = snappedY ?? roundClickValue(point.y, clickPrecision);

  return {
    point: { x, y },
    vector: {
      x: scalarForCoordinate(x, snappedX !== null),
      y: scalarForCoordinate(y, snappedY !== null)
    },
    snappedX: snappedX !== null,
    snappedY: snappedY !== null
  };
}

/** A concise alias for callers that think of snapping as grid snapping. */
export const snapPointToGrid = snapPlotPoint;

export function numberToExactRational(value: number): Rational {
  return rationalFromNumber(value);
}

function scalarForCoordinate(value: number, snapped: boolean): ScalarValue {
  return snapped
    ? { kind: "exact", value: numberToExactRational(value), source: "snap" }
    : { kind: "approximate", value, source: "click" };
}

function visibleCandidates(candidates: readonly number[], min: number, max: number): number[] {
  const withAxis = min <= 0 && max >= 0 ? [...candidates, 0] : [...candidates];
  const tolerance = Math.max(Math.abs(min), Math.abs(max), 1) * 1e-10;
  const sorted = withAxis
    .filter((candidate) => Number.isFinite(candidate) && candidate >= min - tolerance && candidate <= max + tolerance)
    .sort((left, right) => left - right);

  return sorted.filter(
    (candidate, index) => index === 0 || Math.abs(candidate - (sorted[index - 1] ?? candidate)) > tolerance
  );
}

function closestCandidate(
  value: number,
  candidates: readonly number[],
  pixelsPerUnit: number
): { value: number; pixelDistance: number } | null {
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) {
    return null;
  }

  let closest: { value: number; pixelDistance: number } | null = null;
  let closestPixelDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const pixelDistance = Math.abs(candidate - value) * pixelsPerUnit;
    if (pixelDistance < closestPixelDistance) {
      closest = { value: candidate, pixelDistance };
      closestPixelDistance = pixelDistance;
    }
  }

  return closest;
}

function roundClickValue(value: number, precision: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("A clicked plot coordinate must be finite.");
  }

  const safePrecision = Math.min(12, Math.max(0, Math.trunc(precision)));
  const rounded = Number(value.toFixed(safePrecision));
  return Object.is(rounded, -0) ? 0 : rounded;
}
