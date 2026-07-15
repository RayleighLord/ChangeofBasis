import katex from "katex";

import { formatMatrixTex } from "./math/changeOfBasis";
import { formatRational, formatRationalTex, parseRational } from "./math/rational";
import { ChangeOfBasisPlotRenderer } from "./plot/renderer";
import type {
  Basis2D,
  Rational,
  ScalarValue,
  SelectedVector,
  ViewModel
} from "./types";
import { AppController } from "./ui/controller";

const BASIS_STATIC_MATH: Record<string, string> = {
  "basis-form-title": "B'=(\\vec e'_1,\\vec e'_2)",
  "basis-first-label": "\\vec e'_1",
  "basis-second-label": "\\vec e'_2",
  "vector-form-title": "\\vec v=(v_x,v_y)",
  "standard-toggle-math": "B",
  "prime-toggle-math": "B'",
  "to-standard-heading": "B'\\to B",
  "to-prime-heading": "B\\to B'"
};

type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "change-of-basis-theme";

interface FieldErrorTarget {
  input: HTMLInputElement;
  error: HTMLElement;
}

export function startApp(): void {
  renderStaticMath();

  const themeToggle = getElement<HTMLButtonElement>("theme-toggle");
  const themeToggleLabel = getElement<HTMLElement>("theme-toggle-label");
  const themeToggleIcon = getElement<HTMLElement>("theme-toggle-icon");
  let activeTheme = readStoredTheme();
  applyTheme(activeTheme, themeToggle, themeToggleLabel, themeToggleIcon);

  const plot = getElement<SVGSVGElement>("basis-plot");
  const basisForm = getElement<HTMLFormElement>("basis-form");
  const vectorForm = getElement<HTMLFormElement>("vector-form");
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
  const standardToggle = getElement<HTMLInputElement>("standard-components-toggle");
  const primeToggle = getElement<HTMLInputElement>("prime-components-toggle");
  const clearVectorButton = getElement<HTMLButtonElement>("clear-vector-button");
  const basisFormError = getElement<HTMLElement>("basis-form-error");
  const vectorFormError = getElement<HTMLElement>("vector-form-error");
  const plotPrompt = getElement<HTMLElement>("plot-prompt");
  const interactionStatus = getElement<HTMLElement>("interaction-status");

  const controller = new AppController();
  const renderer = new ChangeOfBasisPlotRenderer(plot);
  let basisInputsDirty = false;
  let vectorInputsDirty = false;

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

  themeToggle.addEventListener("click", () => {
    activeTheme = activeTheme === "dark" ? "light" : "dark";
    applyTheme(activeTheme, themeToggle, themeToggleLabel, themeToggleIcon);
    storeTheme(activeTheme);
    announce(interactionStatus, `${activeTheme === "dark" ? "Dark" : "Light"} mode enabled.`);
  });

  controller.subscribe((viewModel) => {
    if (!basisInputsDirty) {
      syncBasisInputs(viewModel.state.basis, basisInputs);
    }
    if (!vectorInputsDirty) {
      syncVectorInputs(viewModel.state.selectedVector, vectorInputs);
    }

    standardToggle.checked = viewModel.state.showStandardComponents;
    primeToggle.checked = viewModel.state.showPrimeComponents;
    primeToggle.disabled = !viewModel.basisAnalysis.isBasis;
    plotPrompt.hidden = !shouldShowPlotPrompt(viewModel);
    renderResults(viewModel);
    renderer.render(viewModel);
  });

  basisForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const firstX = parseBasisIntegerField(basisInputs.firstX);
    const firstY = parseBasisIntegerField(basisInputs.firstY);
    const secondX = parseBasisIntegerField(basisInputs.secondX);
    const secondY = parseBasisIntegerField(basisInputs.secondY);

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
    const x = parseVectorIntegerField(vectorInputs.x);
    const y = parseVectorIntegerField(vectorInputs.y);

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
    announce(interactionStatus, "Vector set.");
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
    announce(interactionStatus, "Vector selected from the plot.");
  });

  plot.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    vectorInputsDirty = false;
    clearAllFieldErrors(Object.values(vectorInputs));
    vectorFormError.textContent = "";
    controller.clearVector();
    announce(interactionStatus, "Vector removed.");
  });

  const resizeObserver = new ResizeObserver(() => renderer.resize());
  if (plot.parentElement) {
    resizeObserver.observe(plot.parentElement);
  }
}

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme switching still works when storage is unavailable.
  }
}

function applyTheme(
  theme: Theme,
  toggle: HTMLButtonElement,
  label: HTMLElement,
  icon: HTMLElement
): void {
  const destination = theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  toggle.setAttribute("aria-pressed", `${theme === "dark"}`);
  toggle.setAttribute("aria-label", `Switch to ${destination} mode`);
  label.textContent = `${destination === "dark" ? "Dark" : "Light"} mode`;
  icon.textContent = destination === "dark" ? "☾" : "☀";
}

function renderStaticMath(): void {
  Object.entries(BASIS_STATIC_MATH).forEach(([id, tex]) => {
    renderMath(getElement<HTMLElement>(id), tex);
  });
}

function renderResults(viewModel: ViewModel): void {
  renderVectorCoordinates(viewModel);

  const { basisAnalysis } = viewModel;
  const status = getElement<HTMLElement>("basis-status");
  status.textContent = basisAnalysis.isBasis ? "Valid basis" : "Not a basis";
  status.className = `status-chip ${basisAnalysis.isBasis ? "is-valid" : "is-invalid"}`;

  if (basisAnalysis.isBasis) {
    renderMath(
      getElement<HTMLElement>("matrix-to-standard"),
      `P_{B\\leftarrow B'}=${formatMatrixTex(basisAnalysis.toStandard)}`,
      true
    );
    renderMath(
      getElement<HTMLElement>("mapping-to-standard"),
      "[\\vec v]_B=P_{B\\leftarrow B'}[\\vec v]_{B'}"
    );
  } else {
    renderMath(
      getElement<HTMLElement>("matrix-to-standard"),
      `A=[\\vec e'_1\\ \\vec e'_2]=${formatMatrixTex(basisAnalysis.toStandard)}`,
      true
    );
    renderMath(
      getElement<HTMLElement>("mapping-to-standard"),
      "\\text{Candidate columns only; }B'\\text{ is not a basis.}"
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
      "[\\vec v]_{B'}=P_{B'\\leftarrow B}[\\vec v]_B"
    );
  } else {
    renderMath(
      getElement<HTMLElement>("matrix-to-prime"),
      "P_{B'\\leftarrow B}\\text{ does not exist}",
      true
    );
    renderMath(
      getElement<HTMLElement>("mapping-to-prime"),
      "\\text{Unavailable because }B'\\text{ is not a basis.}"
    );
  }
}

function renderVectorCoordinates(viewModel: ViewModel): void {
  const card = getElement<HTMLElement>("vector-coordinates-card");
  const coordinates = viewModel.coordinates;
  card.hidden = coordinates === null;
  if (!coordinates) {
    return;
  }

  renderMath(
    getElement<HTMLElement>("vector-coordinate-standard"),
    `[\\vec v]_B${formatCoordinateColumnTex(coordinates.standard, "standard")}`
  );

  const primeOutput = getElement<HTMLElement>("vector-coordinate-prime");
  if (coordinates.prime) {
    renderMath(
      primeOutput,
      `[\\vec v]_{B'}${formatCoordinateColumnTex(coordinates.prime, "prime")}`
    );
  } else {
    renderMath(primeOutput, "[\\vec v]_{B'}\\text{ unavailable}");
  }
}

function formatCoordinateColumnTex(
  vector: SelectedVector,
  basis: "standard" | "prime"
): string {
  const relation = vector.x.kind === "exact" && vector.y.kind === "exact" ? "=" : "\\approx";
  const colors =
    basis === "standard"
      ? ["#1B7F5A", "#C4454D"]
      : ["#2F6FDB", "#7B4DB3"];
  const basisTex = basis === "standard" ? "B" : "B'";
  return (
    `${relation}\\begin{bmatrix}` +
    `\\color{${colors[0]}}{${formatCoordinateScalarTex(vector.x)}} \\\\[0.4em] ` +
    `\\color{${colors[1]}}{${formatCoordinateScalarTex(vector.y)}}` +
    `\\end{bmatrix}_{${basisTex}}`
  );
}

function formatCoordinateScalarTex(value: ScalarValue): string {
  if (value.kind === "exact") {
    return formatRationalTex(value.value);
  }
  const normalized = Object.is(value.value, -0) ? 0 : value.value;
  return `${Number(normalized.toFixed(4))}`;
}

/** The plot hint is useful only until an endpoint has been selected. */
export function shouldShowPlotPrompt(viewModel: ViewModel): boolean {
  return viewModel.state.selectedVector === null;
}

/** Parses the signed-integer literals accepted by the B' input fields. */
export function parseBasisIntegerLiteral(text: string): Rational {
  const literal = text.trim();
  if (!/^[+-]?\d+$/.test(literal)) {
    throw new SyntaxError("Enter an integer, such as -2, 0, or 3.");
  }
  return parseRational(literal);
}

/** Parses the signed-integer literals accepted by the selected-vector fields. */
export function parseVectorIntegerLiteral(text: string): Rational {
  const literal = text.trim();
  if (!/^[+-]?\d+$/.test(literal)) {
    throw new SyntaxError("Enter an integer, such as -2, 0, or 3.");
  }
  return parseRational(literal);
}

function parseBasisIntegerField(target: FieldErrorTarget): Rational | null {
  return parseField(target, parseBasisIntegerLiteral);
}

function parseVectorIntegerField(target: FieldErrorTarget): Rational | null {
  return parseField(target, parseVectorIntegerLiteral);
}

function parseField(
  target: FieldErrorTarget,
  parser: (text: string) => Rational
): Rational | null {
  try {
    const value = parser(target.input.value);
    clearFieldError(target);
    return value;
  } catch (error) {
    target.input.setAttribute("aria-invalid", "true");
    target.error.textContent = error instanceof Error ? error.message : "Enter a valid number.";
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
