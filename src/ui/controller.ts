import { analyzeBasis, coordinatesForSelectedVector } from "../math/changeOfBasis";
import type {
  AppNotice,
  AppState,
  Basis2D,
  BasisAnalysis,
  PlotBounds,
  SelectedVector,
  VectorCoordinates,
  ViewModel
} from "../types";

export interface AppControllerDependencies {
  analyzeBasis: typeof analyzeBasis;
  coordinatesForSelectedVector: typeof coordinatesForSelectedVector;
}

/**
 * A collection of UI intents that should be observed as one state transition.
 * Passing `selectedVector: null` and `clearVector: true` are equivalent; the
 * explicit flag is useful for form handlers that build update objects.
 */
export interface AppControllerUpdate {
  basis?: Basis2D;
  bounds?: PlotBounds;
  selectedVector?: SelectedVector | null;
  clearVector?: boolean;
  showStandardComponents?: boolean;
  showPrimeComponents?: boolean;
}

type Listener = (viewModel: ViewModel) => void;

const DEFAULT_BOUNDS: PlotBounds = {
  xMin: -8,
  xMax: 8,
  yMin: -8,
  yMax: 8
};
const RENDER_SCALE_PROBE = 1024;

const DEFAULT_DEPENDENCIES: AppControllerDependencies = {
  analyzeBasis,
  coordinatesForSelectedVector
};

export class AppController {
  private state: AppState;
  private basisAnalysis: BasisAnalysis;
  private viewModel: ViewModel;
  private readonly listeners = new Set<Listener>();
  private readonly dependencies: AppControllerDependencies;

  constructor(
    initialState: AppState = createDefaultState(),
    dependencies: Partial<AppControllerDependencies> = {}
  ) {
    this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
    this.basisAnalysis = this.dependencies.analyzeBasis(initialState.basis);
    this.state = this.basisAnalysis.isBasis
      ? initialState
      : {
          ...initialState,
          showStandardComponents: true,
          showPrimeComponents: false
        };
    this.viewModel = this.createViewModel();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.viewModel);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getViewModel(): ViewModel {
    return this.viewModel;
  }

  setBasis(basis: Basis2D): void {
    this.applyUpdate({ basis });
  }

  applyBounds(bounds: PlotBounds): void {
    this.applyUpdate({ bounds });
  }

  setVector(selectedVector: SelectedVector): void {
    this.applyUpdate({ selectedVector });
  }

  setSelectedVector(selectedVector: SelectedVector): void {
    this.setVector(selectedVector);
  }

  clearVector(): void {
    this.applyUpdate({ clearVector: true });
  }

  setShowStandardComponents(showStandardComponents: boolean): void {
    this.applyUpdate({ showStandardComponents });
  }

  setShowPrimeComponents(showPrimeComponents: boolean): void {
    this.applyUpdate({ showPrimeComponents });
  }

  /**
   * Applies related UI intents against one final state and publishes at most
   * once. Invalid bounds are the only recoverable partial failure: the prior
   * plot window is retained while all other valid intents still take effect.
   */
  applyUpdate(update: AppControllerUpdate): void {
    const previousState = this.state;
    const basis = update.basis ?? previousState.basis;
    const basisChanged = !sameBasis(basis, previousState.basis);
    const basisAnalysis = basisChanged
      ? this.dependencies.analyzeBasis(basis)
      : this.basisAnalysis;

    let bounds = previousState.bounds;
    let boundsError = previousState.boundsError;

    if (update.bounds !== undefined) {
      const error = validateBounds(update.bounds);
      if (error) {
        boundsError = error;
      } else {
        bounds = sameBounds(update.bounds, previousState.bounds)
          ? previousState.bounds
          : update.bounds;
        boundsError = null;
      }
    }

    let selectedVector = previousState.selectedVector;
    if (update.clearVector === true) {
      selectedVector = null;
    } else if (update.selectedVector !== undefined) {
      selectedVector = update.selectedVector;
    }

    const requestedStandardComponents =
      update.showStandardComponents ?? previousState.showStandardComponents;
    const showStandardComponents = basisAnalysis.isBasis
      ? requestedStandardComponents
      : true;
    const requestedPrimeComponents =
      update.showPrimeComponents ?? previousState.showPrimeComponents;
    const showPrimeComponents = basisAnalysis.isBasis
      ? requestedPrimeComponents
      : false;

    const nextState: AppState = {
      basis,
      bounds,
      selectedVector,
      showStandardComponents,
      showPrimeComponents,
      boundsError
    };

    if (sameState(nextState, previousState)) {
      return;
    }

    this.state = nextState;
    this.basisAnalysis = basisAnalysis;
    this.publish();
  }

  reset(): void {
    this.state = createDefaultState();
    this.basisAnalysis = this.dependencies.analyzeBasis(this.state.basis);
    this.publish();
  }

  private createViewModel(): ViewModel {
    let coordinates: VectorCoordinates | null = null;

    if (this.state.selectedVector) {
      coordinates = this.dependencies.coordinatesForSelectedVector(
        this.state.selectedVector,
        this.basisAnalysis
      );
    }

    const notices: AppNotice[] = [];

    if (this.state.boundsError) {
      notices.push({ tone: "error", text: this.state.boundsError });
    }

    if (!this.basisAnalysis.isBasis) {
      notices.push({
        tone: "warning",
        text:
          "The vectors e₁′ and e₂′ are linearly dependent, so B′ is not a basis. " +
          "The inverse matrix and B′ decomposition are unavailable."
      });
    }

    if (!this.state.selectedVector) {
      notices.push({
        tone: "info",
        text: "Click the plane or enter coordinates to select a vector."
      });
    }

    return {
      state: this.state,
      basisAnalysis: this.basisAnalysis,
      coordinates,
      notices
    };
  }

  private publish(): void {
    this.viewModel = this.createViewModel();
    this.listeners.forEach((listener) => listener(this.viewModel));
  }
}

export function createDefaultState(): AppState {
  return {
    basis: {
      first: {
        x: { numerator: 1n, denominator: 1n },
        y: { numerator: 1n, denominator: 1n }
      },
      second: {
        x: { numerator: -1n, denominator: 1n },
        y: { numerator: 1n, denominator: 1n }
      }
    },
    bounds: { ...DEFAULT_BOUNDS },
    selectedVector: null,
    showStandardComponents: true,
    showPrimeComponents: true,
    boundsError: null
  };
}

export function validateBounds(bounds: PlotBounds): string | null {
  const values = [bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax];

  if (values.some((value) => !Number.isFinite(value))) {
    return "Plot limits must be finite numbers.";
  }

  if (bounds.xMin >= bounds.xMax) {
    return "The x-range must satisfy x min < x max.";
  }

  if (bounds.yMin >= bounds.yMax) {
    return "The y-range must satisfy y min < y max.";
  }

  if (
    !Number.isFinite(bounds.xMax - bounds.xMin) ||
    !Number.isFinite(bounds.yMax - bounds.yMin)
  ) {
    return "Plot ranges must have finite spans.";
  }

  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const smallerSpan = Math.min(xSpan, ySpan);
  const largerSpan = Math.max(xSpan, ySpan);
  if (
    !Number.isFinite(RENDER_SCALE_PROBE / xSpan) ||
    !Number.isFinite(RENDER_SCALE_PROBE / ySpan) ||
    !Number.isFinite(largerSpan / smallerSpan)
  ) {
    return "Plot ranges are too small or disproportionate to render.";
  }

  return null;
}

function sameBasis(left: Basis2D, right: Basis2D): boolean {
  return (
    sameRational(left.first.x, right.first.x) &&
    sameRational(left.first.y, right.first.y) &&
    sameRational(left.second.x, right.second.x) &&
    sameRational(left.second.y, right.second.y)
  );
}

function sameRational(
  left: { numerator: bigint; denominator: bigint },
  right: { numerator: bigint; denominator: bigint }
): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

function sameBounds(left: PlotBounds, right: PlotBounds): boolean {
  return (
    left.xMin === right.xMin &&
    left.xMax === right.xMax &&
    left.yMin === right.yMin &&
    left.yMax === right.yMax
  );
}

function sameState(left: AppState, right: AppState): boolean {
  return (
    sameBasis(left.basis, right.basis) &&
    sameBounds(left.bounds, right.bounds) &&
    left.selectedVector === right.selectedVector &&
    left.showStandardComponents === right.showStandardComponents &&
    left.showPrimeComponents === right.showPrimeComponents &&
    left.boundsError === right.boundsError
  );
}
