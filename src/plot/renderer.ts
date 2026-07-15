import {
  selectedVectorToNumeric
} from "../math/changeOfBasis";
import { formatRational, multiply, toNumber } from "../math/rational";
import type {
  PlotBounds,
  PlotLayout,
  Rational,
  ScalarValue,
  Vector2,
  ViewModel
} from "../types";
import {
  createCoordinateSystem,
  DEFAULT_PLOT_LAYOUT,
  type CoordinateSystem,
  type SvgPoint
} from "./coordinates";
import { snapPlotPoint, type PlotSnapResult } from "./snap";
import { computeAdaptiveTicks, formatTick } from "./ticks";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const ZERO_LENGTH_TOLERANCE = 1e-8;

export const PLOT_COLORS = {
  standardFirst: "#1B7F5A",
  standardSecond: "#C4454D",
  primeFirst: "#2F6FDB",
  primeSecond: "#7B4DB3",
  selected: "#111827"
} as const;

export interface PlotRendererOptions {
  layout?: PlotLayout;
  /** Defaults to the SVG's parent. Pass `null` to keep all labels inside SVG. */
  annotationHost?: HTMLElement | null;
}

interface AnnotationEntry {
  element: HTMLDivElement;
  svgPoint: SvgPoint;
}

interface ArrowOptions {
  color: string;
  markerId: string;
  dataName: string;
  width?: number;
  opacity?: number;
  dashed?: boolean;
  showZeroMarker?: boolean;
  zeroRadius?: number;
}

let rendererSequence = 0;

/**
 * Retained-layer renderer for the Cartesian change-of-basis diagram. Layers
 * keep a stable identity while their contents are updated on each state change.
 */
export class ChangeOfBasisPlotRenderer {
  private readonly svg: SVGSVGElement;
  private readonly layout: PlotLayout;
  private readonly instanceId: string;
  private readonly description: SVGDescElement;
  private readonly clipRect: SVGRectElement;
  private readonly gridLayer: SVGGElement;
  private readonly tickLayer: SVGGElement;
  private readonly axisLayer: SVGGElement;
  private readonly standardBasisLayer: SVGGElement;
  private readonly primeBasisLayer: SVGGElement;
  private readonly standardComponentLayer: SVGGElement;
  private readonly primeComponentLayer: SVGGElement;
  private readonly vectorLayer: SVGGElement;
  private readonly fallbackLabelLayer: SVGGElement;
  private readonly annotationLayer: HTMLDivElement | null;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly annotations: AnnotationEntry[] = [];
  private readonly occupiedAnnotationPoints: SvgPoint[] = [];
  private lastViewModel: ViewModel | null = null;
  private lastRenderedCssScale = Number.NaN;

  constructor(svg: SVGSVGElement, options: PlotRendererOptions = {}) {
    this.svg = svg;
    this.layout = options.layout ?? DEFAULT_PLOT_LAYOUT;
    this.instanceId = `change-basis-plot-${rendererSequence += 1}`;

    const title = createSvgElement("title", { id: `${this.instanceId}-title` });
    title.textContent = "Change of basis Cartesian plane";
    this.description = createSvgElement("desc", { id: `${this.instanceId}-description` });
    this.description.textContent =
      "The standard basis B is green and red. The user-defined basis B prime is blue and purple.";

    const definitions = createSvgElement("defs");
    const clipPath = createSvgElement("clipPath", { id: `${this.instanceId}-clip` });
    this.clipRect = createSvgElement("rect");
    clipPath.append(this.clipRect);
    definitions.append(
      clipPath,
      createArrowMarker(`${this.instanceId}-standard-first`, PLOT_COLORS.standardFirst),
      createArrowMarker(`${this.instanceId}-standard-second`, PLOT_COLORS.standardSecond),
      createArrowMarker(`${this.instanceId}-prime-first`, PLOT_COLORS.primeFirst),
      createArrowMarker(`${this.instanceId}-prime-second`, PLOT_COLORS.primeSecond),
      createArrowMarker(`${this.instanceId}-selected`, PLOT_COLORS.selected)
    );

    this.gridLayer = createLayer("grid");
    this.tickLayer = createLayer("tick-labels");
    this.axisLayer = createLayer("axes");
    this.standardBasisLayer = createLayer("basis-standard", `${this.instanceId}-clip`);
    this.primeBasisLayer = createLayer("basis-prime", `${this.instanceId}-clip`);
    this.standardComponentLayer = createLayer(
      "components-standard",
      `${this.instanceId}-clip`
    );
    this.primeComponentLayer = createLayer("components-prime", `${this.instanceId}-clip`);
    this.vectorLayer = createLayer("selected-vector", `${this.instanceId}-clip`);
    this.fallbackLabelLayer = createLayer("vector-labels");

    this.svg.setAttribute("viewBox", `0 0 ${this.layout.width} ${this.layout.height}`);
    this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.svg.setAttribute("role", "img");
    this.svg.setAttribute(
      "aria-labelledby",
      `${this.instanceId}-title ${this.instanceId}-description`
    );
    this.svg.replaceChildren(
      title,
      this.description,
      definitions,
      createSvgElement("rect", {
        x: 0,
        y: 0,
        width: this.layout.width,
        height: this.layout.height,
        fill: "var(--plot-surface, #fffdf8)",
        "data-plot-background": "true"
      }),
      this.gridLayer,
      this.tickLayer,
      this.axisLayer,
      this.standardBasisLayer,
      this.primeBasisLayer,
      this.standardComponentLayer,
      this.primeComponentLayer,
      // This is deliberately the final clipped SVG layer: v stays above both decompositions.
      this.vectorLayer,
      this.fallbackLabelLayer
    );

    const annotationHost = options.annotationHost === undefined
      ? this.svg.parentElement
      : options.annotationHost;
    this.annotationLayer = annotationHost ? this.createAnnotationLayer(annotationHost) : null;

    if (typeof ResizeObserver === "undefined") {
      this.resizeObserver = null;
    } else {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.svg);
    }
  }

  render(viewModel: ViewModel): void {
    this.lastViewModel = viewModel;
    this.annotations.length = 0;
    this.occupiedAnnotationPoints.length = 0;
    this.annotationLayer?.replaceChildren();
    this.fallbackLabelLayer.replaceChildren();

    const coordinates = this.getCoordinateSystem(viewModel.state.bounds);
    this.updateClip(coordinates);
    const cssScale = this.viewBoxCssScale();
    this.lastRenderedCssScale = cssScale;
    const xTicks = computeAdaptiveTicks(
      viewModel.state.bounds.xMin,
      viewModel.state.bounds.xMax,
      coordinates.innerWidth * cssScale
    );
    const yTicks = computeAdaptiveTicks(
      viewModel.state.bounds.yMin,
      viewModel.state.bounds.yMax,
      coordinates.innerHeight * cssScale
    );

    this.renderGrid(coordinates, viewModel.state.bounds, xTicks, yTicks, cssScale);
    this.renderAxes(coordinates, viewModel.state.bounds, cssScale);
    this.renderBases(coordinates, viewModel);
    this.renderComponents(coordinates, viewModel);
    this.renderSelectedVector(coordinates, viewModel);
    this.updateDescription(viewModel);
    this.positionAnnotations();
  }

  /** Repositions the HTML label overlay after any responsive stage resize. */
  resize(): void {
    const cssScale = this.viewBoxCssScale();
    if (
      this.lastViewModel &&
      (!Number.isFinite(this.lastRenderedCssScale) ||
        Math.abs(cssScale - this.lastRenderedCssScale) > 1e-4)
    ) {
      this.render(this.lastViewModel);
      return;
    }
    this.positionAnnotations();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.annotationLayer?.remove();
  }

  getCoordinateSystem(bounds: PlotBounds): CoordinateSystem {
    return createCoordinateSystem(this.layout, bounds);
  }

  clientPointToModel(
    clientX: number,
    clientY: number,
    bounds: PlotBounds
  ): Vector2<number> | null {
    const svgPoint = this.clientPointToSvg(clientX, clientY);
    if (!svgPoint) {
      return null;
    }

    const coordinates = this.getCoordinateSystem(bounds);
    return coordinates.containsSvgPoint(svgPoint) ? coordinates.svgToModel(svgPoint) : null;
  }

  snapModelPoint(
    point: Vector2<number>,
    bounds: PlotBounds,
    options: { snapPixels?: number; clickPrecision?: number } = {}
  ): PlotSnapResult {
    const coordinates = this.getCoordinateSystem(bounds);
    const cssScale = this.viewBoxCssScale();
    const xTicks = computeAdaptiveTicks(
      bounds.xMin,
      bounds.xMax,
      coordinates.innerWidth * cssScale
    );
    const yTicks = computeAdaptiveTicks(
      bounds.yMin,
      bounds.yMax,
      coordinates.innerHeight * cssScale
    );

    return snapPlotPoint(point, {
      bounds,
      scaleX: coordinates.scaleX * cssScale,
      scaleY: coordinates.scaleY * cssScale,
      xTicks,
      yTicks,
      snapPixels: options.snapPixels,
      clickPrecision: options.clickPrecision
    });
  }

  /** Maps and snaps a client click in one step for event-handler convenience. */
  clientPointToVector(
    clientX: number,
    clientY: number,
    bounds: PlotBounds
  ): PlotSnapResult | null {
    const modelPoint = this.clientPointToModel(clientX, clientY, bounds);
    return modelPoint ? this.snapModelPoint(modelPoint, bounds) : null;
  }

  private renderGrid(
    coordinates: CoordinateSystem,
    bounds: PlotBounds,
    xTicks: readonly number[],
    yTicks: readonly number[],
    cssScale: number
  ): void {
    const gridCommands: string[] = [];
    const tickNodes: SVGElement[] = [];
    const tickFontSize = Math.min(44, Math.max(17, 13 / Math.max(cssScale, 0.1)));

    xTicks.forEach((tick) => {
      const point = coordinates.modelToSvg({ x: tick, y: bounds.yMin });
      gridCommands.push(
        `M ${formatCoordinate(point.x)} ${formatCoordinate(coordinates.innerTop)} ` +
          `L ${formatCoordinate(point.x)} ${formatCoordinate(coordinates.innerTop + coordinates.innerHeight)}`
      );
      const label = createSvgElement("text", {
        x: point.x,
        y: coordinates.innerTop + coordinates.innerHeight + 27,
        "text-anchor": "middle",
        class: "plot-tick-label",
        style: `font-size:${tickFontSize}px`,
        "aria-hidden": "true"
      });
      label.textContent = formatTick(tick);
      tickNodes.push(label);
    });

    yTicks.forEach((tick) => {
      const point = coordinates.modelToSvg({ x: bounds.xMin, y: tick });
      gridCommands.push(
        `M ${formatCoordinate(coordinates.innerLeft)} ${formatCoordinate(point.y)} ` +
          `L ${formatCoordinate(coordinates.innerLeft + coordinates.innerWidth)} ${formatCoordinate(point.y)}`
      );
      const label = createSvgElement("text", {
        x: coordinates.innerLeft - 13,
        y: point.y + 4,
        "text-anchor": "end",
        class: "plot-tick-label",
        style: `font-size:${tickFontSize}px`,
        "aria-hidden": "true"
      });
      label.textContent = formatTick(tick);
      tickNodes.push(label);
    });

    const grid = createSvgElement("path", {
      d: gridCommands.join(" "),
      fill: "none",
      stroke: "var(--grid-stroke, #d9e1e8)",
      "stroke-width": 1
    });
    const frame = createSvgElement("rect", {
      x: coordinates.innerLeft,
      y: coordinates.innerTop,
      width: coordinates.innerWidth,
      height: coordinates.innerHeight,
      rx: 14,
      fill: "transparent",
      stroke: "var(--frame-stroke, #aebbc7)",
      "stroke-width": 1.5,
      "data-plot-frame": "true"
    });

    this.gridLayer.replaceChildren(grid, frame);
    this.tickLayer.replaceChildren(...tickNodes);
  }

  private renderAxes(
    coordinates: CoordinateSystem,
    bounds: PlotBounds,
    cssScale: number
  ): void {
    const nodes: SVGElement[] = [];
    const axisFontSize = Math.min(52, Math.max(21, 15 / Math.max(cssScale, 0.1)));

    if (bounds.yMin <= 0 && bounds.yMax >= 0) {
      const y = coordinates.modelToSvg({ x: bounds.xMin, y: 0 }).y;
      nodes.push(
        createSvgElement("line", {
          x1: coordinates.innerLeft,
          y1: y,
          x2: coordinates.innerLeft + coordinates.innerWidth,
          y2: y,
          stroke: "var(--axis-stroke, #647282)",
          "stroke-width": 1.8
        })
      );
      const xLabel = createSvgElement("text", {
        x: coordinates.innerLeft + coordinates.innerWidth - 10,
        y: y - 10,
        class: "plot-axis-label",
        style: `font-size:${axisFontSize}px`,
        "text-anchor": "end",
        "aria-hidden": "true"
      });
      xLabel.textContent = "x";
      nodes.push(xLabel);
    }

    if (bounds.xMin <= 0 && bounds.xMax >= 0) {
      const x = coordinates.modelToSvg({ x: 0, y: bounds.yMin }).x;
      nodes.push(
        createSvgElement("line", {
          x1: x,
          y1: coordinates.innerTop,
          x2: x,
          y2: coordinates.innerTop + coordinates.innerHeight,
          stroke: "var(--axis-stroke, #647282)",
          "stroke-width": 1.8
        })
      );
      const yLabel = createSvgElement("text", {
        x: x + 11,
        y: coordinates.innerTop + 18,
        class: "plot-axis-label",
        style: `font-size:${axisFontSize}px`,
        "aria-hidden": "true"
      });
      yLabel.textContent = "y";
      nodes.push(yLabel);
    }

    if (
      bounds.xMin <= 0 &&
      bounds.xMax >= 0 &&
      bounds.yMin <= 0 &&
      bounds.yMax >= 0
    ) {
      const origin = coordinates.modelToSvg({ x: 0, y: 0 });
      nodes.push(
        createSvgElement("circle", {
          cx: origin.x,
          cy: origin.y,
          r: 3.2,
          fill: "var(--axis-stroke, #647282)"
        })
      );
    }

    this.axisLayer.replaceChildren(...nodes);
  }

  private renderBases(coordinates: CoordinateSystem, viewModel: ViewModel): void {
    const origin = { x: 0, y: 0 };
    const standardFirst = { x: 1, y: 0 };
    const standardSecond = { x: 0, y: 1 };
    const primeFirst = rationalVectorToNumeric(viewModel.state.basis.first);
    const primeSecond = rationalVectorToNumeric(viewModel.state.basis.second);
    const coincidentPrime = sameNumericPoint(primeFirst, primeSecond);
    const standardFirstOverlapCount = [primeFirst, primeSecond].filter((prime) =>
      sameNumericPoint(prime, standardFirst)
    ).length;
    const standardSecondOverlapCount = [primeFirst, primeSecond].filter((prime) =>
      sameNumericPoint(prime, standardSecond)
    ).length;
    const primeFirstMatchesStandard =
      sameNumericPoint(primeFirst, standardFirst) || sameNumericPoint(primeFirst, standardSecond);
    const primeSecondMatchesStandard =
      sameNumericPoint(primeSecond, standardFirst) || sameNumericPoint(primeSecond, standardSecond);

    this.standardBasisLayer.replaceChildren();
    const drewStandardFirst = this.drawArrow(this.standardBasisLayer, coordinates, origin, standardFirst, {
      color: PLOT_COLORS.standardFirst,
      markerId: `${this.instanceId}-standard-first`,
      dataName: "basis-e1",
      width: overlapUnderlayWidth(standardFirstOverlapCount),
      showZeroMarker: true,
      zeroRadius: overlapZeroRadius(standardFirstOverlapCount)
    });
    const drewStandardSecond = this.drawArrow(this.standardBasisLayer, coordinates, origin, standardSecond, {
      color: PLOT_COLORS.standardSecond,
      markerId: `${this.instanceId}-standard-second`,
      dataName: "basis-e2",
      width: overlapUnderlayWidth(standardSecondOverlapCount),
      showZeroMarker: true,
      zeroRadius: overlapZeroRadius(standardSecondOverlapCount)
    });

    this.primeBasisLayer.replaceChildren();
    const drewPrimeFirst = this.drawArrow(this.primeBasisLayer, coordinates, origin, primeFirst, {
      color: PLOT_COLORS.primeFirst,
      markerId: `${this.instanceId}-prime-first`,
      dataName: "basis-prime-e1",
      width: coincidentPrime ? 7 : 4.4,
      dashed: !coincidentPrime && primeFirstMatchesStandard,
      showZeroMarker: true,
      zeroRadius: coincidentPrime ? 8 : 6
    });
    const drewPrimeSecond = this.drawArrow(this.primeBasisLayer, coordinates, origin, primeSecond, {
      color: PLOT_COLORS.primeSecond,
      markerId: `${this.instanceId}-prime-second`,
      dataName: "basis-prime-e2",
      width: 4.4,
      dashed: coincidentPrime || primeSecondMatchesStandard,
      showZeroMarker: true,
      zeroRadius: coincidentPrime ? 4 : 6
    });

    if (drewStandardFirst) {
      this.queueEndpointLabel(coordinates, standardFirst, "e₁", PLOT_COLORS.standardFirst);
    }
    if (drewStandardSecond) {
      this.queueEndpointLabel(coordinates, standardSecond, "e₂", PLOT_COLORS.standardSecond);
    }
    if (drewPrimeFirst) {
      this.queueEndpointLabel(coordinates, primeFirst, "e′₁", PLOT_COLORS.primeFirst);
    }
    if (drewPrimeSecond) {
      this.queueEndpointLabel(coordinates, primeSecond, "e′₂", PLOT_COLORS.primeSecond);
    }
  }

  private renderComponents(coordinates: CoordinateSystem, viewModel: ViewModel): void {
    this.standardComponentLayer.replaceChildren();
    this.primeComponentLayer.replaceChildren();

    if (!viewModel.state.selectedVector || !viewModel.coordinates) {
      return;
    }

    const vector = selectedVectorToNumeric(viewModel.state.selectedVector);
    const origin = { x: 0, y: 0 };

    if (viewModel.state.showStandardComponents) {
      const firstEndpoint = { x: vector.x, y: 0 };
      const drewFirst = this.drawArrow(
        this.standardComponentLayer,
        coordinates,
        origin,
        firstEndpoint,
        {
          color: PLOT_COLORS.standardFirst,
          markerId: `${this.instanceId}-standard-first`,
          dataName: "component-standard-e1",
          width: 4,
          opacity: 0.78
        }
      );
      const drewSecond = this.drawArrow(
        this.standardComponentLayer,
        coordinates,
        firstEndpoint,
        vector,
        {
          color: PLOT_COLORS.standardSecond,
          markerId: `${this.instanceId}-standard-second`,
          dataName: "component-standard-e2",
          width: 4,
          opacity: 0.78
        }
      );

      if (drewFirst) {
        this.queueSegmentLabel(
          coordinates,
          origin,
          firstEndpoint,
          `${formatScalar(viewModel.coordinates.standard.x)} e₁`,
          PLOT_COLORS.standardFirst
        );
      }
      if (drewSecond) {
        this.queueSegmentLabel(
          coordinates,
          firstEndpoint,
          vector,
          `${formatScalar(viewModel.coordinates.standard.y)} e₂`,
          PLOT_COLORS.standardSecond
        );
      }
    }

    if (viewModel.state.showPrimeComponents && viewModel.coordinates.prime) {
      const firstEndpoint = scaleRationalVectorForRendering(
        viewModel.coordinates.prime.x,
        viewModel.state.basis.first
      );
      const drewFirst = this.drawArrow(
        this.primeComponentLayer,
        coordinates,
        origin,
        firstEndpoint,
        {
          color: PLOT_COLORS.primeFirst,
          markerId: `${this.instanceId}-prime-first`,
          dataName: "component-prime-e1",
          width: 4,
          opacity: 0.78,
          dashed: true
        }
      );
      const drewSecond = this.drawArrow(
        this.primeComponentLayer,
        coordinates,
        firstEndpoint,
        vector,
        {
          color: PLOT_COLORS.primeSecond,
          markerId: `${this.instanceId}-prime-second`,
          dataName: "component-prime-e2",
          width: 4,
          opacity: 0.78,
          dashed: true
        }
      );

      if (drewFirst) {
        this.queueSegmentLabel(
          coordinates,
          origin,
          firstEndpoint,
          `${formatScalar(viewModel.coordinates.prime.x)} e′₁`,
          PLOT_COLORS.primeFirst
        );
      }
      if (drewSecond) {
        this.queueSegmentLabel(
          coordinates,
          firstEndpoint,
          vector,
          `${formatScalar(viewModel.coordinates.prime.y)} e′₂`,
          PLOT_COLORS.primeSecond
        );
      }
    }
  }

  private renderSelectedVector(coordinates: CoordinateSystem, viewModel: ViewModel): void {
    this.vectorLayer.replaceChildren();
    if (!viewModel.state.selectedVector) {
      return;
    }

    const vector = selectedVectorToNumeric(viewModel.state.selectedVector);
    this.drawArrow(this.vectorLayer, coordinates, { x: 0, y: 0 }, vector, {
      color: PLOT_COLORS.selected,
      markerId: `${this.instanceId}-selected`,
      dataName: "selected-vector",
      width: 5,
      showZeroMarker: true
    });
    this.queueEndpointLabel(coordinates, vector, "v", PLOT_COLORS.selected);
  }

  private drawArrow(
    layer: SVGGElement,
    coordinates: CoordinateSystem,
    modelStart: Vector2<number>,
    modelEnd: Vector2<number>,
    options: ArrowOptions
  ): boolean {
    const start = coordinates.modelToSvg(modelStart);
    const end = coordinates.modelToSvg(modelEnd);
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const isMathematicalZero = sameNumericPoint(modelStart, modelEnd);

    if (!Number.isFinite(length) || length <= ZERO_LENGTH_TOLERANCE) {
      if (isMathematicalZero && options.showZeroMarker && coordinates.containsSvgPoint(start)) {
        layer.append(
          createSvgElement("circle", {
            cx: start.x,
            cy: start.y,
            r: options.zeroRadius ?? 6,
            fill: options.color,
            stroke: "var(--plot-surface, #fffdf8)",
            "stroke-width": 2,
            "data-arrow": options.dataName,
            "data-zero-vector": "true"
          })
        );
        return true;
      }
      return false;
    }

    if (!clipSegmentToFrame(start, end, coordinates)) {
      return false;
    }

    layer.append(
      createSvgElement("line", {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        fill: "none",
        stroke: options.color,
        "stroke-width": options.width ?? 4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: options.opacity ?? 1,
        "stroke-dasharray": options.dashed ? "10 7" : undefined,
        "marker-end": `url(#${options.markerId})`,
        "data-arrow": options.dataName
      })
    );
    return true;
  }

  private queueEndpointLabel(
    coordinates: CoordinateSystem,
    endpoint: Vector2<number>,
    text: string,
    color: string
  ): void {
    if (!Number.isFinite(endpoint.x) || !Number.isFinite(endpoint.y)) {
      return;
    }

    const origin = coordinates.modelToSvg({ x: 0, y: 0 });
    const end = coordinates.modelToSvg(endpoint);
    const visibleSegment = clipSegmentToFrame(origin, end, coordinates);
    if (!visibleSegment) {
      return;
    }
    const directionX = visibleSegment.end.x - visibleSegment.start.x;
    const directionY = visibleSegment.end.y - visibleSegment.start.y;
    const length = Math.hypot(directionX, directionY);
    const unitX = length > ZERO_LENGTH_TOLERANCE ? directionX / length : 1;
    const unitY = length > ZERO_LENGTH_TOLERANCE ? directionY / length : -1;
    this.queueAnnotation(
      text,
      color,
      clampAnnotationPoint(
        {
          x: visibleSegment.end.x + unitX * 17 - unitY * 5,
          y: visibleSegment.end.y + unitY * 17 + unitX * 5
        },
        coordinates
      ),
      coordinates
    );
  }

  private queueSegmentLabel(
    coordinates: CoordinateSystem,
    start: Vector2<number>,
    end: Vector2<number>,
    text: string,
    color: string
  ): void {
    if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) {
      return;
    }

    const svgStart = coordinates.modelToSvg(start);
    const svgEnd = coordinates.modelToSvg(end);
    const visibleSegment = clipSegmentToFrame(svgStart, svgEnd, coordinates);
    if (!visibleSegment) {
      return;
    }
    const deltaX = visibleSegment.end.x - visibleSegment.start.x;
    const deltaY = visibleSegment.end.y - visibleSegment.start.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length <= ZERO_LENGTH_TOLERANCE) {
      return;
    }

    this.queueAnnotation(
      text,
      color,
      clampAnnotationPoint(
        {
          x: (visibleSegment.start.x + visibleSegment.end.x) / 2 - (deltaY / length) * 15,
          y: (visibleSegment.start.y + visibleSegment.end.y) / 2 + (deltaX / length) * 15
        },
        coordinates
      ),
      coordinates
    );
  }

  private queueAnnotation(
    text: string,
    color: string,
    svgPoint: SvgPoint,
    coordinates: CoordinateSystem
  ): void {
    const resolvedPoint = this.resolveAnnotationPoint(svgPoint, coordinates);
    if (!this.annotationLayer) {
      const fallback = createSvgElement("text", {
        x: resolvedPoint.x,
        y: resolvedPoint.y,
        fill: color,
        class: "plot-vector-label",
        "text-anchor": "middle",
        "dominant-baseline": "central",
        "data-annotation": text,
        "aria-hidden": "true"
      });
      fallback.textContent = text;
      this.fallbackLabelLayer.append(fallback);
      return;
    }

    const element = document.createElement("div");
    element.className = "plot-annotation";
    element.dataset.annotation = text;
    element.textContent = text;
    element.setAttribute("aria-hidden", "true");
    element.style.position = "absolute";
    element.style.pointerEvents = "none";
    element.style.transform = "translate(-50%, -50%)";
    element.style.color = color;
    element.style.whiteSpace = "nowrap";
    element.style.fontWeight = "700";
    element.style.fontSize = "0.88rem";
    element.style.lineHeight = "1";
    element.style.padding = "0.2rem 0.36rem";
    element.style.borderRadius = "999px";
    element.style.background = "color-mix(in srgb, var(--plot-surface, #fffdf8) 88%, transparent)";
    this.annotationLayer.append(element);
    this.annotations.push({ element, svgPoint: resolvedPoint });
  }

  private resolveAnnotationPoint(
    svgPoint: SvgPoint,
    coordinates: CoordinateSystem
  ): SvgPoint {
    const cssScale = Math.max(this.viewBoxCssScale(), 0.1);
    const separation = 26 / cssScale;
    const offsets = [0, -1, 1, -2, 2, -3, 3];

    for (const offset of offsets) {
      const candidate = clampAnnotationPoint(
        { x: svgPoint.x, y: svgPoint.y + offset * separation },
        coordinates
      );
      const overlaps = this.occupiedAnnotationPoints.some(
        (occupied) => Math.hypot(candidate.x - occupied.x, candidate.y - occupied.y) < separation
      );
      if (!overlaps) {
        this.occupiedAnnotationPoints.push(candidate);
        return candidate;
      }
    }

    const fallback = clampAnnotationPoint(
      { x: svgPoint.x + separation, y: svgPoint.y },
      coordinates
    );
    this.occupiedAnnotationPoints.push(fallback);
    return fallback;
  }

  private createAnnotationLayer(host: HTMLElement): HTMLDivElement {
    if (typeof getComputedStyle === "function" && getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }

    const layer = document.createElement("div");
    layer.className = "plot-annotation-layer";
    layer.dataset.plotOwner = this.instanceId;
    layer.setAttribute("aria-hidden", "true");
    layer.style.position = "absolute";
    layer.style.inset = "0";
    layer.style.pointerEvents = "none";
    layer.style.overflow = "visible";
    host.append(layer);
    return layer;
  }

  private positionAnnotations(): void {
    if (!this.annotationLayer || this.annotations.length === 0) {
      return;
    }

    const svgRect = this.svg.getBoundingClientRect();
    const hostRect = this.annotationLayer.parentElement?.getBoundingClientRect();
    if (!hostRect || svgRect.width <= 0 || svgRect.height <= 0) {
      return;
    }

    const scale = Math.min(svgRect.width / this.layout.width, svgRect.height / this.layout.height);
    const renderedWidth = this.layout.width * scale;
    const renderedHeight = this.layout.height * scale;
    const leftOffset = svgRect.left - hostRect.left + (svgRect.width - renderedWidth) / 2;
    const topOffset = svgRect.top - hostRect.top + (svgRect.height - renderedHeight) / 2;

    this.annotations.forEach(({ element, svgPoint }) => {
      element.style.left = `${leftOffset + svgPoint.x * scale}px`;
      element.style.top = `${topOffset + svgPoint.y * scale}px`;
    });
  }

  private updateClip(coordinates: CoordinateSystem): void {
    setAttributes(this.clipRect, {
      x: coordinates.innerLeft,
      y: coordinates.innerTop,
      width: coordinates.innerWidth,
      height: coordinates.innerHeight,
      rx: 14
    });
  }

  private updateDescription(viewModel: ViewModel): void {
    const selected = viewModel.state.selectedVector;
    this.description.textContent = selected
      ? `The standard basis B is green and red; B prime is blue and purple. ` +
        `The selected black vector ends at (${formatScalar(selected.x)}, ${formatScalar(selected.y)}).`
      : "The standard basis B is green and red. The user-defined basis B prime is blue and purple. No vector is selected.";
  }

  private clientPointToSvg(clientX: number, clientY: number): SvgPoint | null {
    const screenMatrix = typeof this.svg.getScreenCTM === "function"
      ? this.svg.getScreenCTM()
      : null;
    if (screenMatrix && typeof this.svg.createSVGPoint === "function") {
      try {
        const point = this.svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        const transformed = point.matrixTransform(screenMatrix.inverse());
        return { x: transformed.x, y: transformed.y };
      } catch {
        // Fall through to the view-box calculation used by light DOM test environments.
      }
    }

    const rect = this.svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const scale = Math.min(rect.width / this.layout.width, rect.height / this.layout.height);
    const renderedWidth = this.layout.width * scale;
    const renderedHeight = this.layout.height * scale;
    const left = rect.left + (rect.width - renderedWidth) / 2;
    const top = rect.top + (rect.height - renderedHeight) / 2;
    return {
      x: (clientX - left) / scale,
      y: (clientY - top) / scale
    };
  }

  private viewBoxCssScale(): number {
    const rect = this.svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return 1;
    }
    return Math.min(rect.width / this.layout.width, rect.height / this.layout.height);
  }
}

/** Short alias for application code. */
export { ChangeOfBasisPlotRenderer as PlotRenderer };

function createLayer(name: string, clipId?: string): SVGGElement {
  return createSvgElement("g", {
    "data-layer": name,
    "clip-path": clipId ? `url(#${clipId})` : undefined
  });
}

function createArrowMarker(id: string, color: string): SVGMarkerElement {
  const marker = createSvgElement("marker", {
    id,
    viewBox: "0 0 10 10",
    refX: 8.4,
    refY: 5,
    markerWidth: 11,
    markerHeight: 11,
    markerUnits: "userSpaceOnUse",
    orient: "auto-start-reverse"
  });
  marker.append(
    createSvgElement("path", {
      d: "M 0 0 L 10 5 L 0 10 z",
      fill: color,
      stroke: color,
      "stroke-linejoin": "round"
    })
  );
  return marker;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number | undefined> = {}
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  setAttributes(element, attributes);
  return element;
}

function setAttributes(
  element: Element,
  attributes: Record<string, string | number | undefined>
): void {
  Object.entries(attributes).forEach(([name, value]) => {
    if (value !== undefined) {
      element.setAttribute(name, `${value}`);
    }
  });
}

function rationalVectorToNumeric(vector: {
  x: { numerator: bigint; denominator: bigint };
  y: { numerator: bigint; denominator: bigint };
}): Vector2<number> {
  return { x: toNumber(vector.x), y: toNumber(vector.y) };
}

function sameNumericPoint(left: Vector2<number>, right: Vector2<number>): boolean {
  return left.x === right.x && left.y === right.y;
}

function overlapUnderlayWidth(overlapCount: number): number {
  if (overlapCount >= 2) {
    return 10;
  }
  return overlapCount === 1 ? 7 : 4.4;
}

function overlapZeroRadius(overlapCount: number): number {
  if (overlapCount >= 2) {
    return 11;
  }
  return overlapCount === 1 ? 8 : 6;
}

/**
 * Scales an exact basis vector at the SVG boundary. Exact coefficients are
 * multiplied as rationals before either factor is converted to a number, so
 * reciprocal extreme magnitudes cancel instead of becoming `0 * Infinity`.
 */
export function scaleRationalVectorForRendering(
  coefficient: ScalarValue,
  vector: Vector2<Rational>
): Vector2<number> {
  if (coefficient.kind === "exact") {
    return rationalVectorToNumeric({
      x: multiply(coefficient.value, vector.x),
      y: multiply(coefficient.value, vector.y)
    });
  }

  const numericVector = rationalVectorToNumeric(vector);
  return {
    x: coefficient.value * numericVector.x,
    y: coefficient.value * numericVector.y
  };
}

function formatScalar(value: ScalarValue): string {
  if (value.kind === "exact") {
    return formatRational(value.value);
  }

  const normalized = Object.is(value.value, -0) ? 0 : value.value;
  return `≈${Number(normalized.toFixed(4))}`;
}

function clampAnnotationPoint(point: SvgPoint, coordinates: CoordinateSystem): SvgPoint {
  const inset = 14;
  return {
    x: Math.min(
      coordinates.innerLeft + coordinates.innerWidth - inset,
      Math.max(coordinates.innerLeft + inset, point.x)
    ),
    y: Math.min(
      coordinates.innerTop + coordinates.innerHeight - inset,
      Math.max(coordinates.innerTop + inset, point.y)
    )
  };
}

function clipSegmentToFrame(
  start: SvgPoint,
  end: SvgPoint,
  coordinates: CoordinateSystem
): { start: SvgPoint; end: SvgPoint } | null {
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) {
    return null;
  }

  const xMin = coordinates.innerLeft;
  const xMax = coordinates.innerLeft + coordinates.innerWidth;
  const yMin = coordinates.innerTop;
  const yMax = coordinates.innerTop + coordinates.innerHeight;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  let entry = 0;
  let exit = 1;

  const edges: [number, number][] = [
    [-deltaX, start.x - xMin],
    [deltaX, xMax - start.x],
    [-deltaY, start.y - yMin],
    [deltaY, yMax - start.y]
  ];

  for (const [direction, distance] of edges) {
    if (direction === 0) {
      if (distance < 0) {
        return null;
      }
      continue;
    }

    const ratio = distance / direction;
    if (direction < 0) {
      entry = Math.max(entry, ratio);
    } else {
      exit = Math.min(exit, ratio);
    }
    if (entry > exit) {
      return null;
    }
  }

  return {
    start: { x: start.x + entry * deltaX, y: start.y + entry * deltaY },
    end: { x: start.x + exit * deltaX, y: start.y + exit * deltaY }
  };
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}
