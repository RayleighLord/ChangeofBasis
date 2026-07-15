import type { PlotBounds, PlotLayout, Vector2 } from "../types";

export const PLOT_VIEWBOX_SIZE = 800;

export const DEFAULT_PLOT_LAYOUT: PlotLayout = {
  width: PLOT_VIEWBOX_SIZE,
  height: PLOT_VIEWBOX_SIZE,
  padding: {
    top: 48,
    right: 48,
    bottom: 68,
    left: 68
  }
};

export interface SvgPoint {
  x: number;
  y: number;
}

/**
 * A reversible mapping between mathematical coordinates and SVG view-box units.
 * `inner*` describes the actual plotting frame after any centered letterboxing.
 */
export interface CoordinateSystem {
  innerLeft: number;
  innerTop: number;
  innerWidth: number;
  innerHeight: number;
  scale: number;
  /** Aliases retained for callers that treat the axes independently. */
  scaleX: number;
  scaleY: number;
  modelToSvg: (point: Vector2<number>) => SvgPoint;
  svgToModel: (point: SvgPoint) => Vector2<number>;
  containsSvgPoint: (point: SvgPoint) => boolean;
}

/**
 * Fits the requested Cartesian bounds into the padded layout without stretching
 * either axis. If the aspect ratios differ, the plotting frame is centered in
 * the available area and the remaining space becomes letterboxing.
 */
export function createCoordinateSystem(
  layout: PlotLayout,
  bounds: PlotBounds
): CoordinateSystem {
  assertValidLayout(layout);
  assertValidBounds(bounds);

  const availableWidth = layout.width - layout.padding.left - layout.padding.right;
  const availableHeight = layout.height - layout.padding.top - layout.padding.bottom;
  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const scale = Math.min(availableWidth / xSpan, availableHeight / ySpan);
  const innerWidth = xSpan * scale;
  const innerHeight = ySpan * scale;
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(innerWidth) ||
    !Number.isFinite(innerHeight) ||
    innerWidth <= 0 ||
    innerHeight <= 0
  ) {
    throw new RangeError("Plot bounds must have renderable spans.");
  }
  const innerLeft = layout.padding.left + (availableWidth - innerWidth) / 2;
  const innerTop = layout.padding.top + (availableHeight - innerHeight) / 2;
  const edgeTolerance = 1e-9;

  return {
    innerLeft,
    innerTop,
    innerWidth,
    innerHeight,
    scale,
    scaleX: scale,
    scaleY: scale,
    modelToSvg(point) {
      return {
        x: innerLeft + (point.x - bounds.xMin) * scale,
        y: innerTop + (bounds.yMax - point.y) * scale
      };
    },
    svgToModel(point) {
      return {
        x: bounds.xMin + (point.x - innerLeft) / scale,
        y: bounds.yMax - (point.y - innerTop) / scale
      };
    },
    containsSvgPoint(point) {
      return (
        point.x >= innerLeft - edgeTolerance &&
        point.x <= innerLeft + innerWidth + edgeTolerance &&
        point.y >= innerTop - edgeTolerance &&
        point.y <= innerTop + innerHeight + edgeTolerance
      );
    }
  };
}

function assertValidBounds(bounds: PlotBounds): void {
  const values = [bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax];
  if (!values.every(Number.isFinite) || bounds.xMin >= bounds.xMax || bounds.yMin >= bounds.yMax) {
    throw new RangeError("Plot bounds must be finite and strictly increasing.");
  }

  if (
    !Number.isFinite(bounds.xMax - bounds.xMin) ||
    !Number.isFinite(bounds.yMax - bounds.yMin)
  ) {
    throw new RangeError("Plot bounds must have finite spans.");
  }


  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  if (
    !Number.isFinite(1 / xSpan) ||
    !Number.isFinite(1 / ySpan) ||
    !Number.isFinite(Math.max(xSpan, ySpan) / Math.min(xSpan, ySpan))
  ) {
    throw new RangeError("Plot bounds must have renderable spans.");
  }
}

function assertValidLayout(layout: PlotLayout): void {
  const { padding } = layout;
  const values = [
    layout.width,
    layout.height,
    padding.top,
    padding.right,
    padding.bottom,
    padding.left
  ];
  const availableWidth = layout.width - padding.left - padding.right;
  const availableHeight = layout.height - padding.top - padding.bottom;

  if (
    !values.every(Number.isFinite) ||
    values.some((value) => value < 0) ||
    availableWidth <= 0 ||
    availableHeight <= 0
  ) {
    throw new RangeError("Plot layout must have finite dimensions and positive inner space.");
  }
}
