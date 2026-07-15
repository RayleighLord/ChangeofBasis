import { describe, expect, it, vi } from "vitest";

import {
  analyzeBasis,
  coordinatesForSelectedVector
} from "../math/changeOfBasis";
import { normalizeRational } from "../math/rational";
import type { Basis2D, SelectedVector } from "../types";
import {
  AppController,
  createDefaultState,
  validateBounds
} from "../ui/controller";

function exactVector(x: bigint, y: bigint): SelectedVector {
  return {
    x: { kind: "exact", value: normalizeRational(x), source: "input" },
    y: { kind: "exact", value: normalizeRational(y), source: "input" }
  };
}

function approximateVector(x: number, y: number): SelectedVector {
  return {
    x: { kind: "approximate", value: x, source: "click" },
    y: { kind: "approximate", value: y, source: "click" }
  };
}

function singularBasis(): Basis2D {
  return {
    first: { x: normalizeRational(1n), y: normalizeRational(1n) },
    second: { x: normalizeRational(2n), y: normalizeRational(2n) }
  };
}

describe("AppController defaults and subscriptions", () => {
  it("starts with the requested B' basis, square bounds, no vector, and both decompositions on", () => {
    const state = createDefaultState();

    expect(state).toEqual({
      basis: {
        first: {
          x: normalizeRational(1n),
          y: normalizeRational(1n)
        },
        second: {
          x: normalizeRational(-1n),
          y: normalizeRational(1n)
        }
      },
      bounds: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
      selectedVector: null,
      showStandardComponents: true,
      showPrimeComponents: true,
      boundsError: null
    });

    const viewModel = new AppController().getViewModel();
    expect(viewModel.basisAnalysis.isBasis).toBe(true);
    expect(viewModel.basisAnalysis.determinant).toEqual(normalizeRational(2n));
    expect(viewModel.coordinates).toBeNull();
    expect(viewModel.notices).toContainEqual({
      tone: "info",
      text: "Click the plane or enter coordinates to select a vector."
    });
  });

  it("immediately calls subscribers, publishes one final view model per update, and unsubscribes", () => {
    const controller = new AppController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(controller.getViewModel());

    controller.applyUpdate({
      bounds: { xMin: -6, xMax: 6, yMin: -3, yMax: 3 },
      selectedVector: exactVector(3n, 1n),
      showStandardComponents: true,
      showPrimeComponents: true
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(controller.getViewModel());

    unsubscribe();
    controller.clearVector();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not publish or re-analyze an unchanged basis", () => {
    const analyzeSpy = vi.fn(analyzeBasis);
    const coordinateSpy = vi.fn(coordinatesForSelectedVector);
    const controller = new AppController(createDefaultState(), {
      analyzeBasis: analyzeSpy,
      coordinatesForSelectedVector: coordinateSpy
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    listener.mockClear();
    analyzeSpy.mockClear();

    controller.setBasis(createDefaultState().basis);

    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(coordinateSpy).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("AppController vector coordinates and decomposition state", () => {
  it("derives exact B' coordinates for exact vector input", () => {
    const controller = new AppController();

    controller.setVector(exactVector(3n, 1n));

    const coordinates = controller.getViewModel().coordinates;
    expect(coordinates?.standard).toEqual(exactVector(3n, 1n));
    expect(coordinates?.prime).toEqual(exactVector(2n, -1n));
  });

  it("derives approximate B' coordinates when either standard component is approximate", () => {
    const controller = new AppController();
    const vector = approximateVector(0.5, -1.25);

    controller.setVector(vector);

    const coordinates = controller.getViewModel().coordinates;
    expect(coordinates?.standard).toBe(vector);
    expect(coordinates?.prime?.x.kind).toBe("approximate");
    expect(coordinates?.prime?.y.kind).toBe("approximate");
    if (
      coordinates?.prime?.x.kind === "approximate" &&
      coordinates.prime.y.kind === "approximate"
    ) {
      expect(coordinates.prime.x.value).toBeCloseTo(-0.375);
      expect(coordinates.prime.y.value).toBeCloseTo(-0.875);
    }
  });

  it("allows both decomposition toggles to be active and keeps them when clearing the vector", () => {
    const controller = new AppController();
    controller.applyUpdate({
      selectedVector: exactVector(2n, 3n),
      showStandardComponents: true,
      showPrimeComponents: true
    });

    expect(controller.getViewModel().state.showStandardComponents).toBe(true);
    expect(controller.getViewModel().state.showPrimeComponents).toBe(true);

    controller.clearVector();

    expect(controller.getViewModel().state.selectedVector).toBeNull();
    expect(controller.getViewModel().state.showStandardComponents).toBe(true);
    expect(controller.getViewModel().state.showPrimeComponents).toBe(true);
  });

  it("accepts a singular candidate but disables only the B' decomposition", () => {
    const controller = new AppController();
    controller.applyUpdate({
      selectedVector: exactVector(3n, 1n),
      showStandardComponents: true,
      showPrimeComponents: true,
      basis: singularBasis()
    });

    const viewModel = controller.getViewModel();
    expect(viewModel.state.basis).toEqual(singularBasis());
    expect(viewModel.state.showStandardComponents).toBe(true);
    expect(viewModel.state.showPrimeComponents).toBe(false);
    expect(viewModel.basisAnalysis.isBasis).toBe(false);
    expect(viewModel.basisAnalysis.determinant).toEqual(normalizeRational(0n));
    expect(viewModel.basisAnalysis.toPrime).toBeNull();
    expect(viewModel.coordinates?.standard).toEqual(exactVector(3n, 1n));
    expect(viewModel.coordinates?.prime).toBeNull();
    expect(viewModel.notices.some((notice) => notice.tone === "warning")).toBe(true);
  });

  it("keeps the standard decomposition on when a singular candidate is applied", () => {
    const controller = new AppController();
    controller.setShowStandardComponents(false);

    controller.setBasis(singularBasis());

    expect(controller.getViewModel().state.showStandardComponents).toBe(true);
    expect(controller.getViewModel().state.showPrimeComponents).toBe(false);
  });

  it("does not automatically re-enable B' decomposition after recovering from singular input", () => {
    const controller = new AppController();
    controller.applyUpdate({ basis: singularBasis(), showPrimeComponents: true });
    controller.setBasis(createDefaultState().basis);

    expect(controller.getViewModel().basisAnalysis.isBasis).toBe(true);
    expect(controller.getViewModel().state.showPrimeComponents).toBe(false);

    controller.setShowPrimeComponents(true);
    expect(controller.getViewModel().state.showPrimeComponents).toBe(true);
  });

  it("normalizes an initially singular state before its first publication", () => {
    const initialState = {
      ...createDefaultState(),
      basis: singularBasis(),
      showStandardComponents: true,
      showPrimeComponents: true
    };
    const controller = new AppController(initialState);

    expect(controller.getViewModel().state.showStandardComponents).toBe(true);
    expect(controller.getViewModel().state.showPrimeComponents).toBe(false);
  });
});

describe("AppController bounds and reset", () => {
  it("validates finite, increasing plot limits", () => {
    expect(validateBounds({ xMin: -1, xMax: 1, yMin: -2, yMax: 2 })).toBeNull();
    expect(
      validateBounds({ xMin: Number.NaN, xMax: 1, yMin: -2, yMax: 2 })
    ).toBe("Plot limits must be finite numbers.");
    expect(validateBounds({ xMin: 1, xMax: 1, yMin: -2, yMax: 2 })).toBe(
      "The x-range must satisfy x min < x max."
    );
    expect(validateBounds({ xMin: -1, xMax: 1, yMin: 2, yMax: -2 })).toBe(
      "The y-range must satisfy y min < y max."
    );
    expect(validateBounds({ xMin: -1e308, xMax: 1e308, yMin: -2, yMax: 2 })).toBe(
      "Plot ranges must have finite spans."
    );
    expect(validateBounds({ xMin: 0, xMax: Number.MIN_VALUE, yMin: -1, yMax: 1 })).toBe(
      "Plot ranges are too small or disproportionate to render."
    );
    expect(validateBounds({ xMin: 0, xMax: 1e-307, yMin: 0, yMax: 1e-307 })).toBe(
      "Plot ranges are too small or disproportionate to render."
    );
  });

  it("retains applied bounds on invalid input while committing other intents once", () => {
    const controller = new AppController();
    const originalBounds = controller.getViewModel().state.bounds;
    const listener = vi.fn();
    controller.subscribe(listener);
    listener.mockClear();

    controller.applyUpdate({
      bounds: { xMin: 4, xMax: -4, yMin: -4, yMax: 4 },
      selectedVector: exactVector(1n, 2n),
      showStandardComponents: true
    });

    const viewModel = controller.getViewModel();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(viewModel.state.bounds).toBe(originalBounds);
    expect(viewModel.state.selectedVector).toEqual(exactVector(1n, 2n));
    expect(viewModel.state.showStandardComponents).toBe(true);
    expect(viewModel.state.boundsError).toBe(
      "The x-range must satisfy x min < x max."
    );
    expect(viewModel.notices[0]).toEqual({
      tone: "error",
      text: "The x-range must satisfy x min < x max."
    });
  });

  it("clears a previous bounds error when a valid window is applied", () => {
    const controller = new AppController();
    controller.applyBounds({ xMin: 2, xMax: 1, yMin: -4, yMax: 4 });
    controller.applyBounds({ xMin: -5, xMax: 5, yMin: -3, yMax: 3 });

    expect(controller.getViewModel().state.bounds).toEqual({
      xMin: -5,
      xMax: 5,
      yMin: -3,
      yMax: 3
    });
    expect(controller.getViewModel().state.boundsError).toBeNull();
    expect(controller.getViewModel().notices.some((notice) => notice.tone === "error")).toBe(
      false
    );
  });

  it("restores all defaults from a modified or invalid state", () => {
    const controller = new AppController();
    controller.applyUpdate({
      basis: singularBasis(),
      bounds: { xMin: 2, xMax: 1, yMin: 1, yMax: -1 },
      selectedVector: exactVector(8n, -3n),
      showStandardComponents: true,
      showPrimeComponents: true
    });

    controller.reset();

    expect(controller.getViewModel().state).toEqual(createDefaultState());
    expect(controller.getViewModel().basisAnalysis.isBasis).toBe(true);
    expect(controller.getViewModel().coordinates).toBeNull();
  });
});
