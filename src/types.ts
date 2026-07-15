export interface Rational {
  numerator: bigint;
  denominator: bigint;
}

export interface Vector2<T = number> {
  x: T;
  y: T;
}

export type Matrix2<T> = readonly [
  readonly [T, T],
  readonly [T, T]
];

export interface Basis2D {
  first: Vector2<Rational>;
  second: Vector2<Rational>;
}

export type ScalarValue =
  | {
      kind: "exact";
      value: Rational;
      source: "input" | "snap";
    }
  | {
      kind: "approximate";
      value: number;
      source: "click";
    };

export interface SelectedVector {
  x: ScalarValue;
  y: ScalarValue;
}

export interface PlotBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface PlotPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PlotLayout {
  width: number;
  height: number;
  padding: PlotPadding;
}

export interface BasisAnalysis {
  basis: Basis2D;
  determinant: Rational;
  toStandard: Matrix2<Rational>;
  toPrime: Matrix2<Rational> | null;
  isBasis: boolean;
}

export interface VectorCoordinates {
  standard: SelectedVector;
  prime: SelectedVector | null;
}

export interface AppState {
  basis: Basis2D;
  bounds: PlotBounds;
  selectedVector: SelectedVector | null;
  showStandardComponents: boolean;
  showPrimeComponents: boolean;
  boundsError: string | null;
}

export type NoticeTone = "info" | "warning" | "error";

export interface AppNotice {
  tone: NoticeTone;
  text: string;
}

export interface ViewModel {
  state: AppState;
  basisAnalysis: BasisAnalysis;
  coordinates: VectorCoordinates | null;
  notices: AppNotice[];
}
