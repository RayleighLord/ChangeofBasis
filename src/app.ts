import katex from "katex";

import {
  formatMatrixTex,
} from "./math/changeOfBasis";
import {
  formatRational,
  formatRationalTex,
  parseRational
} from "./math/rational";
import { ChangeOfBasisPlotRenderer } from "./plot/renderer";
import type {
  Basis2D,
  PlotBounds,
  Rational,
  ScalarValue,
  SelectedVector,
  ViewModel
} from "./types";
import { AppController, validateBounds } from "./ui/controller";

const BASIS_STATIC_MATH: Record<string, string> = {
  "hero-bases": "B=(e_1,e_2),\\qquad B'=(e'_1,e'_2)",
  "basis-form-title": "B'=(e'_1,e'_2)",
  "basis-first-label": "e'_1",
  "basis-second-label": "e'_2",
  "vector-form-title": "v=(v_x,v_y)",
  "standard-toggle-math": "B",
  "prime-toggle-math": "B'",
  "standard-coordinate-label": "B",
  "prime-coordinate-label": "B'",
  "to-standard-heading": "B'\\to B",
  "to-prime-heading": "B\\to B'",
  "plot-vector-symbol": "v",
  "legend-e1": "e_1",
  "legend-e2": "e_2",
  "legend-e1-prime": "e'_1",
  "legend-e2-prime": "e'_2",
  "legend-v": "v"
};

interface FieldErrorTarget {
  input: HTMLInputElement;
  error: HTMLElement;
}

export function startApp(): void {
  renderStaticMath();

  const plot = getElement<SVGSVGElement>("basis-plot");
  const basisForm = getElement<HTMLFormElement>("basis-form");
  const vectorForm = getElement<HTMLFormElement>("vector-form");
  const boundsForm = getElement<HTMLFormElement>("bounds-form");
  const basisInputs = {
    firstX: fieldTarget("basis-first-x"),
    firstY: fieldTarget("basis-first-y"),
    secondX: fieldTarget("basis-second-x"),
    secondY: fieldTarget("basis-second-y")
  };
  const vectorInputs = {
    x: fieldTarget("vector-x"),
    y: fieldTarget("vector-y")
  };
  const boundsInputs = {
    xMin: getElement<HTMLInputElement>("x-min-input"),
    xMax: getElement<HTMLInputElement>("x-max-input"),
    yMin: getElement<HTMLInputElement>("y-min-input"),
    yMax: getElement<HTMLInputElement>("y-max-input")
  };
  const standardToggle = getElement<HTMLInputElement>("standard-components-toggle");
  const primeToggle = getElement<HTMLInputElement>("prime-components-toggle");
  const clearVectorButton = getElement<HTMLButtonElement>("clear-vector-button");
  const resetButton = getElement<HTMLButtonElement>("reset-button");
  const basisFormError = getElement<HTMLElement>("basis-form-error");
  const vectorFormError = getElement<HTMLElement>("vector-form-error");
  const boundsFormError = getElement<HTMLElement>("bounds-form-error");
  const interactionStatus = getElement<HTMLElement>("interaction-status");

  const controller = new AppController();
  const renderer = new ChangeOfBasisPlotRenderer(plot);
  let basisInputsDirty = false;
  let vectorInputsDirty = false;
  let boundsInputsDirty = false;
  let syncedBounds: PlotBounds | null = null;

  Object.values(basisInputs).forEach(({ input }) => {
    input.addEventListener("input", () => {
      basisInputsDirty = true;
      clearFieldError({ input, error: getErrorForInput(input) });
      basisFormError.textContent = "";
    });
  });
  Object.values(vectorInputs).forEach(({ input }) => {
    input.addEventListener("input", () => {
      vectorInputsDirty = true;
      clearFieldError({ input, error: getErrorForInput(input) });
      vectorFormError.textContent = "";
    });
  });
  Object.values(boundsInputs).forEach((input) => {
    input.addEventListener("input", () => {
      boundsInputsDirty = true;
      input.removeAttribute("aria-invalid");
      boundsFormError.textContent = "";
    });
  });

  controller.subscribe((viewModel) => {
    if (!basisInputsDirty) {
      syncBasisInputs(viewModel.state.basis, basisInputs);
    }
    if (!vectorInputsDirty) {
      syncVectorInputs(viewModel.state.selectedVector, vectorInputs);
    }
    if (!boundsInputsDirty && syncedBounds !== viewModel.state.bounds) {
      syncBoundsInputs(viewModel.state.bounds, boundsInputs);
      syncedBounds = viewModel.state.bounds;
    }

    standardToggle.checked = viewModel.state.showStandardComponents;
    primeToggle.checked = viewModel.state.showPrimeComponents;
    primeToggle.disabled = !viewModel.basisAnalysis.isBasis;
    boundsFormError.textContent = viewModel.state.boundsError ?? "";
    renderResults(viewModel);
    renderer.render(viewModel);
  });

  basisForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const firstX = parseField(basisInputs.firstX);
    const firstY = parseField(basisInputs.firstY);
    const secondX = parseField(basisInputs.secondX);
    const secondY = parseField(basisInputs.secondY);

    if (!firstX || !firstY || !secondX || !secondY) {
      basisFormError.textContent = "The graph still uses the last applied basis.";
      return;
    }

    basisInputsDirty = false;
    basisFormError.textContent = "";
    controller.setBasis({
      first: { x: firstX, y: firstY },
      second: { x: secondX, y: secondY }
    });
    const analysis = controller.getViewModel().basisAnalysis;
    announce(
      interactionStatus,
      analysis.isBasis
        ? `Basis B prime updated. Valid basis with determinant ${formatRational(analysis.determinant)}.`
        : "Basis B prime updated. The candidate is not a basis because its determinant is zero."
    );
  });

  vectorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const x = parseField(vectorInputs.x);
    const y = parseField(vectorInputs.y);

    if (!x || !y) {
      vectorFormError.textContent = "The selected vector was not changed.";
      return;
    }

    vectorInputsDirty = false;
    vectorFormError.textContent = "";
    controller.setVector({
      x: { kind: "exact", value: x, source: "input" },
      y: { kind: "exact", value: y, source: "input" }
    });
    announce(interactionStatus, "Vector set. Coordinate results updated.");
  });

  boundsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const parsedBounds = parseBoundsInputs(boundsInputs);
    if (!parsedBounds) {
      boundsFormError.textContent = "Enter a finite number in each plot-limit field.";
      return;
    }

    const nextBounds: PlotBounds = parsedBounds;
    const error = validateBounds(nextBounds);

    if (error) {
      markInvalidBounds(boundsInputs, nextBounds);
      boundsFormError.textContent = error;
      return;
    }

    Object.values(boundsInputs).forEach((input) => input.removeAttribute("aria-invalid"));
    boundsInputsDirty = false;
    boundsFormError.textContent = "";
    controller.applyBounds(nextBounds);
    announce(interactionStatus, "Plot view updated.");
  });

  standardToggle.addEventListener("change", () => {
    controller.setShowStandardComponents(standardToggle.checked);
    announce(
      interactionStatus,
      `Standard-basis components ${standardToggle.checked ? "shown" : "hidden"}.`
    );
  });

  primeToggle.addEventListener("change", () => {
    controller.setShowPrimeComponents(primeToggle.checked);
    announce(
      interactionStatus,
      `B prime components ${primeToggle.checked ? "shown" : "hidden"}.`
    );
  });

  clearVectorButton.addEventListener("click", () => {
    vectorInputsDirty = false;
    clearAllFieldErrors(Object.values(vectorInputs));
    vectorFormError.textContent = "";
    controller.clearVector();
    announce(interactionStatus, "Vector cleared.");
  });

  resetButton.addEventListener("click", () => {
    basisInputsDirty = false;
    vectorInputsDirty = false;
    boundsInputsDirty = false;
    syncedBounds = null;
    clearAllFieldErrors([...Object.values(basisInputs), ...Object.values(vectorInputs)]);
    Object.values(boundsInputs).forEach((input) => input.removeAttribute("aria-invalid"));
    basisFormError.textContent = "";
    vectorFormError.textContent = "";
    boundsFormError.textContent = "";
    controller.reset();
    announce(interactionStatus, "Example reset to the default basis and view.");
  });

  plot.addEventListener("click", (event) => {
    const viewModel = controller.getViewModel();
    const point = renderer.clientPointToModel(
      event.clientX,
      event.clientY,
      viewModel.state.bounds
    );
    if (!point) {
      return;
    }

    const snapped = renderer.snapModelPoint(point, viewModel.state.bounds);
    vectorInputsDirty = false;
    clearAllFieldErrors(Object.values(vectorInputs));
    vectorFormError.textContent = "";
    controller.setVector(snapped.vector);
    announce(interactionStatus, "Vector selected from the plot. Coordinate results updated.");
  });

  const resizeObserver = new ResizeObserver(() => renderer.resize());
  if (plot.parentElement) {
    resizeObserver.observe(plot.parentElement);
  }
}

function renderStaticMath(): void {
  Object.entries(BASIS_STATIC_MATH).forEach(([id, tex]) => {
    renderMath(getElement<HTMLElement>(id), tex);
  });
}

function renderResults(viewModel: ViewModel): void {
  const { basisAnalysis, coordinates } = viewModel;
  const status = getElement<HTMLElement>("basis-status");
  status.textContent = basisAnalysis.isBasis ? "Valid basis" : "Not a basis";
  status.className = `status-chip ${basisAnalysis.isBasis ? "is-valid" : "is-invalid"}`;

  renderMath(
    getElement<HTMLElement>("determinant-output"),
    `\\det([e'_1\\ e'_2])=${formatRationalTex(basisAnalysis.determinant)}`
  );

  if (coordinates) {
    renderMath(
      getElement<HTMLElement>("standard-coordinate-output"),
      formatCoordinateTex("B", coordinates.standard)
    );
    renderMath(
      getElement<HTMLElement>("prime-coordinate-output"),
      coordinates.prime
        ? formatCoordinateTex("B'", coordinates.prime)
        : "[v]_{B'}\\text{ is unavailable}"
    );
  } else {
    renderMath(getElement<HTMLElement>("standard-coordinate-output"), "\\text{Select }v");
    renderMath(getElement<HTMLElement>("prime-coordinate-output"), "\\text{Select }v");
  }

  if (basisAnalysis.isBasis) {
    renderMath(
      getElement<HTMLElement>("matrix-to-standard"),
      `P_{B\\leftarrow B'}=${formatMatrixTex(basisAnalysis.toStandard)}`,
      true
    );
    renderMath(
      getElement<HTMLElement>("mapping-to-standard"),
      "[v]_B=P_{B\\leftarrow B'}[v]_{B'}"
    );
  } else {
    renderMath(
      getElement<HTMLElement>("matrix-to-standard"),
      `A=[e'_1\\ e'_2]=${formatMatrixTex(basisAnalysis.toStandard)}`,
      true
    );
    renderMath(
      getElement<HTMLElement>("mapping-to-standard"),
      "\\text{Candidate column matrix; not a change-of-basis matrix.}"
    );
  }

  if (basisAnalysis.toPrime) {
    renderMath(
      getElement<HTMLElement>("matrix-to-prime"),
      `P_{B'\\leftarrow B}=${formatMatrixTex(basisAnalysis.toPrime)}`,
      true
    );
    renderMath(
      getElement<HTMLElement>("mapping-to-prime"),
      "[v]_{B'}=P_{B'\\leftarrow B}[v]_B"
    );
  } else {
    renderMath(getElement<HTMLElement>("matrix-to-prime"), "P_{B'\\leftarrow B}\\text{ does not exist}");
    renderMath(getElement<HTMLElement>("mapping-to-prime"), "\\det([e'_1\\ e'_2])=0");
  }

  const noticeList = getElement<HTMLUListElement>("notice-list");
  noticeList.replaceChildren(
    ...viewModel.notices.map((notice) => {
      const item = document.createElement("li");
      item.className = `notice-item tone-${notice.tone}`;
      item.textContent = notice.text;
      return item;
    })
  );
}

function formatCoordinateTex(basis: "B" | "B'", vector: SelectedVector): string {
  const approximate = vector.x.kind === "approximate" || vector.y.kind === "approximate";
  const relation = approximate ? "\\approx" : "=";
  return `[v]_{${basis}}${relation}\\begin{bmatrix}${formatScalarTex(vector.x)}\\\\${formatScalarTex(vector.y)}\\end{bmatrix}`;
}

function formatScalarTex(value: ScalarValue): string {
  return value.kind === "exact" ? formatRationalTex(value.value) : formatApproximate(value.value);
}

function formatApproximate(value: number): string {
  if (!Number.isFinite(value)) {
    return "\\text{undefined}";
  }
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 10000 || magnitude < 0.0001)) {
    const [coefficient, exponent] = value.toExponential(3).split("e");
    return `${Number(coefficient)}\\times 10^{${Number(exponent)}}`;
  }
  return `${Number(value.toFixed(4))}`;
}

function parseField(target: FieldErrorTarget): Rational | null {
  try {
    const value = parseRational(target.input.value);
    clearFieldError(target);
    return value;
  } catch (error) {
    target.input.setAttribute("aria-invalid", "true");
    target.error.textContent = error instanceof Error ? error.message : "Enter an exact number.";
    return null;
  }
}

function clearFieldError(target: FieldErrorTarget): void {
  target.input.removeAttribute("aria-invalid");
  target.error.textContent = "";
}

function clearAllFieldErrors(targets: FieldErrorTarget[]): void {
  targets.forEach(clearFieldError);
}

function parseBoundsInputs(
  inputs: Record<"xMin" | "xMax" | "yMin" | "yMax", HTMLInputElement>
): PlotBounds | null {
  const parsed: Partial<PlotBounds> = {};
  let valid = true;

  (Object.entries(inputs) as [keyof PlotBounds, HTMLInputElement][]).forEach(
    ([name, input]) => {
      const value = input.value.trim() === "" ? Number.NaN : input.valueAsNumber;
      if (!Number.isFinite(value)) {
        input.setAttribute("aria-invalid", "true");
        valid = false;
      } else {
        input.removeAttribute("aria-invalid");
        parsed[name] = value;
      }
    }
  );

  return valid ? (parsed as PlotBounds) : null;
}

function markInvalidBounds(
  inputs: Record<"xMin" | "xMax" | "yMin" | "yMax", HTMLInputElement>,
  bounds: PlotBounds
): void {
  Object.values(inputs).forEach((input) => input.removeAttribute("aria-invalid"));
  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const invalidX =
    bounds.xMin >= bounds.xMax || !Number.isFinite(xSpan) || !Number.isFinite(1024 / xSpan);
  const invalidY =
    bounds.yMin >= bounds.yMax || !Number.isFinite(ySpan) || !Number.isFinite(1024 / ySpan);

  if (invalidX) {
    inputs.xMin.setAttribute("aria-invalid", "true");
    inputs.xMax.setAttribute("aria-invalid", "true");
  }
  if (invalidY) {
    inputs.yMin.setAttribute("aria-invalid", "true");
    inputs.yMax.setAttribute("aria-invalid", "true");
  }
  if (!invalidX && !invalidY) {
    Object.values(inputs).forEach((input) => input.setAttribute("aria-invalid", "true"));
  }
}

function announce(region: HTMLElement, message: string): void {
  region.textContent = "";
  queueMicrotask(() => {
    region.textContent = message;
  });
}

function syncBasisInputs(
  basis: Basis2D,
  inputs: Record<"firstX" | "firstY" | "secondX" | "secondY", FieldErrorTarget>
): void {
  setInputValue(inputs.firstX.input, formatRational(basis.first.x));
  setInputValue(inputs.firstY.input, formatRational(basis.first.y));
  setInputValue(inputs.secondX.input, formatRational(basis.second.x));
  setInputValue(inputs.secondY.input, formatRational(basis.second.y));
}

function syncVectorInputs(
  vector: SelectedVector | null,
  inputs: Record<"x" | "y", FieldErrorTarget>
): void {
  if (!vector) {
    setInputValue(inputs.x.input, "");
    setInputValue(inputs.y.input, "");
    return;
  }
  setInputValue(inputs.x.input, formatScalarInput(vector.x));
  setInputValue(inputs.y.input, formatScalarInput(vector.y));
}

function formatScalarInput(value: ScalarValue): string {
  return value.kind === "exact" ? formatRational(value.value) : `${Number(value.value.toFixed(4))}`;
}

function syncBoundsInputs(
  bounds: PlotBounds,
  inputs: Record<"xMin" | "xMax" | "yMin" | "yMax", HTMLInputElement>
): void {
  setInputValue(inputs.xMin, `${bounds.xMin}`);
  setInputValue(inputs.xMax, `${bounds.xMax}`);
  setInputValue(inputs.yMin, `${bounds.yMin}`);
  setInputValue(inputs.yMax, `${bounds.yMax}`);
}

function setInputValue(input: HTMLInputElement, value: string): void {
  if (input.value !== value) {
    input.value = value;
  }
}

function renderMath(element: HTMLElement, tex: string, displayMode = false): void {
  if (element.dataset.tex === `${displayMode}:${tex}`) {
    return;
  }
  katex.render(tex, element, {
    displayMode,
    throwOnError: false,
    output: "htmlAndMathml"
  });
  element.dataset.tex = `${displayMode}:${tex}`;
}

function fieldTarget(inputId: string): FieldErrorTarget {
  return {
    input: getElement<HTMLInputElement>(inputId),
    error: getElement<HTMLElement>(`${inputId}-error`)
  };
}

function getErrorForInput(input: HTMLInputElement): HTMLElement {
  return getElement<HTMLElement>(`${input.id}-error`);
}

function getElement<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element with id "${id}".`);
  }
  return element as unknown as T;
}
