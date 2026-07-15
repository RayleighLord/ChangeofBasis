import { rationalFromNumber } from "../math/rational";
import type { PlotBounds, Rational, SelectedVector, Vector2 } from "../types";

export interface PlotSnapOptions {
  bounds: PlotBounds;
}

export interface PlotSnapResult {
  point: Vector2<number>;
  vector: SelectedVector;
  snappedX: boolean;
  snappedY: boolean;
}

/** Snaps every plot selection to the nearest visible integer-grid intersection. */
export function snapPlotPoint(
  point: Vector2<number>,
  options: PlotSnapOptions
): PlotSnapResult {
  const x = nearestVisibleInteger(point.x, options.bounds.xMin, options.bounds.xMax);
  const y = nearestVisibleInteger(point.y, options.bounds.yMin, options.bounds.yMax);

  return {
    point: { x, y },
    vector: {
      x: { kind: "exact", value: numberToExactRational(x), source: "snap" },
      y: { kind: "exact", value: numberToExactRational(y), source: "snap" }
    },
    snappedX: true,
    snappedY: true
  };
}

/** A concise alias for callers that think of snapping as grid snapping. */
export const snapPointToGrid = snapPlotPoint;

export function numberToExactRational(value: number): Rational {
  return rationalFromNumber(value);
}

function nearestVisibleInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("A clicked plot coordinate must be finite.");
  }
  const first = Math.ceil(min);
  const last = Math.floor(max);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first > last) {
    throw new RangeError("The visible plot must contain an integer grid point.");
  }
  const nearest = Math.min(last, Math.max(first, Math.round(value)));
  return Object.is(nearest, -0) ? 0 : nearest;
}
