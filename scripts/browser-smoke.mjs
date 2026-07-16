import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const host = "127.0.0.1";
const port = Number(process.env.BROWSER_SMOKE_PORT ?? 30_000 + (process.pid % 20_000));
const repositoryPath = "/ChangeofBasis/";
const baseUrl = `http://${host}:${port}${repositoryPath}`;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const artifactDir = new URL("../output/playwright/", import.meta.url);
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const requestedChromePath = process.env.CHROME_PATH;
const systemChromePath = "/usr/bin/google-chrome";
const executablePath =
  requestedChromePath ?? (existsSync(systemChromePath) ? systemChromePath : undefined);

await mkdir(artifactDir, { recursive: true });

const preview = spawn(
  process.execPath,
  [
    viteBin,
    "preview",
    "--base",
    repositoryPath,
    "--host",
    host,
    "--port",
    `${port}`,
    "--strictPort"
  ],
  { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] }
);

let browser;

try {
  await waitForServer(baseUrl, preview);
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {})
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await assertMinimalInitialRender(page);
  await assertThemeWorkflow(page);
  await assertVectorWorkflow(page);
  await assertClickReplacementAndSnapping(page);
  await assertIntegerBasisAndSingularStates(page);
  await assertResponsiveCanvas(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await restoreDefaultBasis(page);
  await page.locator("#clear-vector-button").click();
  await page.screenshot({
    path: new URL("browser-smoke.png", artifactDir).pathname,
    fullPage: true
  });

  assert.deepEqual(browserErrors, [], `Browser errors:\n${browserErrors.join("\n")}`);
  console.log("Browser smoke checks passed.");
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
  await waitForExit(preview);
}

async function assertMinimalInitialRender(page) {
  assert.equal(await page.title(), "Change of Basis Explorer");
  assert.equal(await page.locator("#basis-status").textContent(), "Valid basis");
  assert.equal(await page.locator("#standard-components-toggle").isChecked(), true);
  assert.equal(await page.locator("#prime-components-toggle").isChecked(), true);
  assert.equal(
    (await page.locator("#plot-prompt").textContent())?.trim(),
    "Click on the grid to generate a vector"
  );
  assert.equal(await page.locator("#plot-prompt").isVisible(), true);
  assert.equal(await page.locator("#vector-coordinates-card").count(), 1);
  assert.equal(
    await page.locator("#vector-coordinates-card").isVisible(),
    false,
    "The coordinate card should stay out of the way until a vector is selected."
  );
  assert.equal(await page.locator("#vector-coordinate-standard").count(), 1);
  assert.equal(await page.locator("#vector-coordinate-prime").count(), 1);
  assert.equal(await page.locator('[data-arrow="basis-e1"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="basis-e2"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="basis-prime-e1"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="basis-prime-e2"]').count(), 1);
  assert.equal(await page.locator('[data-layer="selected-vector"] > *').count(), 0);
  assert.equal(
    await page.locator("html").getAttribute("data-theme"),
    "dark",
    "A fresh browser context must start in dark mode."
  );
  assert.equal(await page.locator("#theme-toggle").count(), 1);
  assert.equal(await page.locator("#theme-toggle").isVisible(), true);

  assert.equal(await page.locator("#bounds-form").count(), 0);
  assert.equal(await page.locator("#reset-button").count(), 0);
  assert.equal(await page.locator(".plot-legend").count(), 0);
  assert.equal(await page.locator("#determinant-output").count(), 0);
  assert.equal(await page.locator("#standard-coordinate-output").count(), 0);
  assert.equal(await page.locator('[data-layer="tick-labels"] > *').count(), 0);
  assert.equal(await page.locator('[data-layer="axes"] text').count(), 0);

  const toStandardText = normalizeMath(await page.locator("#matrix-to-standard").textContent());
  const toPrimeText = normalizeMath(await page.locator("#matrix-to-prime").textContent());
  assert.ok(toStandardText.includes("P") && /[−-]1/.test(toStandardText));
  assert.ok(toPrimeText.includes("P") && toPrimeText.includes("2") && /[−-]/.test(toPrimeText));
  assert.match(normalizeMath(await page.locator("#mapping-to-standard").textContent()), /P/);
  assert.match(normalizeMath(await page.locator("#mapping-to-prime").textContent()), /P/);
  for (const selector of ["#matrix-to-standard", "#matrix-to-prime"]) {
    const matrixFontSize = await page
      .locator(`${selector} .katex`)
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    assert.ok(matrixFontSize >= 19, `${selector} must use the enlarged matrix typography.`);
  }

  const canvas = await page.locator("#basis-plot").boundingBox();
  const rail = await page.locator(".control-rail").boundingBox();
  assert.ok(canvas && rail);
  assert.ok(Math.abs(canvas.width - 1440) <= 2 && Math.abs(canvas.height - 900) <= 2);
  assert.ok(rail.x < 24 && rail.width < 380, "The controls must remain a compact left rail.");
  assert.equal(await page.locator(".control-section").count(), 4);
  const railChrome = await page.locator(".control-rail").evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, border: style.borderTopWidth };
  });
  assert.equal(railChrome.background, "rgba(0, 0, 0, 0)");
  assert.equal(railChrome.border, "0px");

  const e1 = await readArrow(page, "basis-e1");
  const e2 = await readArrow(page, "basis-e2");
  assert.ok(
    Math.abs(Math.abs(e1.x2 - e1.x1) - Math.abs(e2.y2 - e2.y1)) < 0.01,
    "The full-screen canvas must preserve equal unit scale."
  );
  assert.ok(Math.abs(e1.x2 - e1.x1) <= 70, "The default integer grid cells must be compact.");
  await assertHalfUnitGridGeometry(page);

  assert.equal(await page.locator("#basis-first-x").getAttribute("inputmode"), "numeric");
  assert.equal(await page.locator("#vector-x").getAttribute("inputmode"), "numeric");
  assert.equal(await page.locator("#vector-x").getAttribute("pattern"), "[+-]?[0-9]+");
  await page.locator("#set-vector-button").focus();
  const focusStyle = await page.locator("#set-vector-button").evaluate((node) => {
    const style = getComputedStyle(node);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  assert.equal(focusStyle.style, "solid");
  assert.ok(focusStyle.width >= 2);
}

async function assertThemeWorkflow(page) {
  const root = page.locator("html");
  const toggle = page.locator("#theme-toggle");
  const initialLabel = (await toggle.textContent())?.trim();
  const darkPalette = await readThemePalette(page);

  assert.equal(await root.getAttribute("data-theme"), "dark");
  assert.equal(await toggle.getAttribute("aria-pressed"), "true");
  assert.match(initialLabel ?? "", /light/i, "Dark mode must offer a clear light-mode action.");
  assert.match(
    await root.evaluate((node) => getComputedStyle(node).colorScheme),
    /dark/,
    "The default theme must expose the dark color scheme to native controls."
  );
  assert.deepEqual(darkPalette, {
    plotBackground: "rgb(10, 17, 25)",
    controlBackground: "rgba(15, 25, 36, 0.82)",
    inputBackground: "rgba(6, 12, 18, 0.72)",
    minorGridStroke: "rgba(128, 153, 175, 0.13)",
    gridStroke: "rgba(88, 197, 189, 0.22)"
  });

  await toggle.click();
  assert.equal(await root.getAttribute("data-theme"), "light");
  assert.equal(await toggle.getAttribute("aria-pressed"), "false");
  const lightLabel = (await toggle.textContent())?.trim();
  assert.notEqual(lightLabel, initialLabel, "The theme toggle label must describe the next theme.");
  assert.match(lightLabel ?? "", /dark/i);
  assert.match(await root.evaluate((node) => getComputedStyle(node).colorScheme), /light/);
  await page.waitForTimeout(180);
  const lightPalette = await readThemePalette(page);
  assert.deepEqual(lightPalette, {
    plotBackground: "rgb(251, 250, 246)",
    controlBackground: "rgba(255, 255, 252, 0.86)",
    inputBackground: "rgba(247, 249, 248, 0.96)",
    minorGridStroke: "rgba(66, 88, 103, 0.12)",
    gridStroke: "rgba(25, 127, 121, 0.2)"
  });
  assert.notEqual(
    lightPalette.plotBackground,
    darkPalette.plotBackground,
    "Changing themes must visibly update the plot surface."
  );
  assert.notEqual(
    lightPalette.controlBackground,
    darkPalette.controlBackground,
    "Changing themes must visibly update the control cards."
  );

  await toggle.click();
  assert.equal(await root.getAttribute("data-theme"), "dark");
  assert.equal(await toggle.getAttribute("aria-pressed"), "true");
  assert.equal((await toggle.textContent())?.trim(), initialLabel);
}

async function readThemePalette(page) {
  return page.evaluate(() => ({
    plotBackground: getComputedStyle(document.querySelector(".plot-stage")).backgroundColor,
    controlBackground: getComputedStyle(document.querySelector(".control-section")).backgroundColor,
    inputBackground: getComputedStyle(document.querySelector('input[type="text"]')).backgroundColor,
    minorGridStroke: getComputedStyle(document.querySelector('[data-grid-level="minor"]')).stroke,
    gridStroke: getComputedStyle(document.querySelector('[data-grid-level="major"]')).stroke
  }));
}

async function assertVectorWorkflow(page) {
  await page.locator("#vector-x").fill("3");
  await page.locator("#vector-y").fill("1");
  await page.locator("#vector-y").press("Enter");

  assert.equal(await page.locator('[data-arrow="selected-vector"]').count(), 1);
  assert.equal(await page.locator("#plot-prompt").isVisible(), false);
  assert.equal(await page.locator('[data-arrow="component-standard-e1"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="component-standard-e2"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="component-prime-e1"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="component-prime-e2"]').count(), 1);
  const componentDashPatterns = await page
    .locator('[data-arrow^="component-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("stroke-dasharray")));
  assert.deepEqual(
    componentDashPatterns,
    ["10 7", "10 7", "10 7", "10 7"],
    "Both standard- and prime-basis decompositions must use the same dashed style."
  );
  const arrowLineCaps = await page
    .locator('line[data-arrow]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("stroke-linecap")));
  assert.ok(arrowLineCaps.length > 0);
  assert.equal(
    arrowLineCaps.every((lineCap) => lineCap === "butt"),
    true,
    "Arrow shafts must stop cleanly beneath their tips."
  );
  assert.match(await page.locator("#interaction-status").textContent(), /Vector set/);
  await assertCoordinateCard(page, { standard: ["3", "1"], prime: ["2", "-1"] });

  for (const annotation of ["e₁", "e₂", "e′₁", "e′₂", "v"]) {
    const label = page.locator(`[data-annotation="${annotation}"]`);
    assert.equal(await label.count(), 1);
    assert.equal(await label.locator(".katex").count(), 1, `${annotation} must be rendered by KaTeX.`);
    assert.ok(await label.locator(".accent").count(), `${annotation} must carry a vector arrow accent.`);
  }
  const labelFontSize = await page
    .locator('[data-annotation="v"]')
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  assert.ok(labelFontSize >= 16, "Plotted vector labels must be visually prominent.");

  const selectedBeforeInvalidInput = await readArrow(page, "selected-vector");
  await page.locator("#vector-x").fill("3/2");
  await page.locator("#vector-y").fill("-2");
  await page.locator("#vector-y").press("Enter");
  assert.equal(await page.locator("#vector-x").getAttribute("aria-invalid"), "true");
  assert.match(await page.locator("#vector-x-error").textContent(), /integer/i);
  assert.deepEqual(
    await readArrow(page, "selected-vector"),
    selectedBeforeInvalidInput,
    "Invalid manual coordinates must retain the previously selected vector."
  );

  await page.locator("#vector-x").fill("0");
  await page.locator("#vector-y").fill("1");
  await page.locator("#vector-y").press("Enter");
  assert.equal(await page.locator('[data-arrow="component-standard-e1"]').count(), 0);
  assert.equal(await page.locator('[data-arrow="component-standard-e2"]').count(), 1);
  assert.equal(await page.locator("#vector-x").inputValue(), "0");

  await page.locator("#clear-vector-button").click();
  assert.equal(await page.locator('[data-layer="selected-vector"] > *').count(), 0);
  assert.equal(await page.locator("#standard-components-toggle").isChecked(), true);
  assert.equal(await page.locator("#prime-components-toggle").isChecked(), true);
  assert.equal(await page.locator("#plot-prompt").isVisible(), true);
  assert.equal(await page.locator("#vector-coordinates-card").isVisible(), false);
}

async function assertClickReplacementAndSnapping(page) {
  const clickGeometry = await page.locator("#basis-plot").evaluate((svg) => {
    const e1 = svg.querySelector('[data-arrow="basis-e1"]');
    const e2 = svg.querySelector('[data-arrow="basis-e2"]');
    const matrix = svg.getScreenCTM();
    if (!e1 || !e2 || !matrix || !(svg instanceof SVGSVGElement)) {
      return null;
    }
    const transform = (x, y) => {
      const point = svg.createSVGPoint();
      point.x = x;
      point.y = y;
      return point.matrixTransform(matrix);
    };
    const origin = transform(Number(e1.getAttribute("x1")), Number(e1.getAttribute("y1")));
    const oneX = transform(Number(e1.getAttribute("x2")), Number(e1.getAttribute("y2")));
    const oneY = transform(Number(e2.getAttribute("x2")), Number(e2.getAttribute("y2")));
    const xOffset = {
      x: oneX.x - origin.x,
      y: oneX.y - origin.y
    };
    const yOffset = {
      x: oneY.x - origin.x,
      y: oneY.y - origin.y
    };
    return {
      x: origin.x + 2.42 * xOffset.x - 1.37 * yOffset.x,
      y: origin.y + 2.42 * xOffset.y - 1.37 * yOffset.y,
      legacySnapDistance: Math.hypot(0.42 * Math.hypot(xOffset.x, xOffset.y), 0.37 * Math.hypot(yOffset.x, yOffset.y))
    };
  });
  assert.ok(clickGeometry);
  assert.ok(
    clickGeometry.legacySnapDistance > 10,
    "The smoke click must exercise a point beyond the former ten-pixel threshold."
  );
  await page.mouse.click(clickGeometry.x, clickGeometry.y);
  assert.equal(await page.locator("#vector-x").inputValue(), "2");
  assert.equal(await page.locator("#vector-y").inputValue(), "-1");
  assert.equal(await page.locator('[data-arrow="selected-vector"]').count(), 1);
  assert.equal(await page.locator("#plot-prompt").isVisible(), false);
  assert.equal(await page.locator("#vector-coordinates-card").isVisible(), true);

  await page.evaluate(() => {
    window.__plotContextMenuPrevented = false;
    document.addEventListener(
      "contextmenu",
      (event) => {
        window.__plotContextMenuPrevented = event.defaultPrevented;
      },
      { once: true }
    );
  });
  await page.mouse.click(clickGeometry.x, clickGeometry.y, { button: "right" });
  assert.equal(
    await page.evaluate(() => window.__plotContextMenuPrevented),
    true,
    "Right-clicking the plot must suppress the native context menu."
  );
  assert.equal(await page.locator('[data-arrow="selected-vector"]').count(), 0);
  assert.equal(await page.locator('[data-arrow="basis-e1"]').count(), 1);
  assert.equal(await page.locator("#vector-x").inputValue(), "");
  assert.equal(await page.locator("#vector-y").inputValue(), "");
  assert.equal(await page.locator("#plot-prompt").isVisible(), true);
  assert.equal(await page.locator("#vector-coordinates-card").isVisible(), false);
  assert.match(await page.locator("#interaction-status").textContent(), /removed/i);
}

async function assertIntegerBasisAndSingularStates(page) {
  const originalPrimeX = (await readArrow(page, "basis-prime-e1")).x2;
  await page.locator("#basis-first-x").fill("1/2");
  await page.locator('#basis-form button[type="submit"]').click();
  assert.equal(await page.locator("#basis-first-x").getAttribute("aria-invalid"), "true");
  assert.match(await page.locator("#basis-first-x-error").textContent(), /integer/i);
  assert.equal((await readArrow(page, "basis-prime-e1")).x2, originalPrimeX);

  await setBasis(page, ["2", "1", "-1", "2"]);
  assert.equal(await page.locator("#basis-status").textContent(), "Valid basis");
  assert.match(normalizeMath(await page.locator("#matrix-to-prime").textContent()), /5/);

  await setVector(page, "3", "1");
  await assertCoordinateCard(page, { standard: ["3", "1"] });

  await setBasis(page, ["1", "1", "1", "1"]);
  assert.equal(await page.locator("#basis-status").textContent(), "Not a basis");
  assert.equal(await page.locator("#prime-components-toggle").isDisabled(), true);
  assert.equal(await page.locator("#prime-components-toggle").isChecked(), false);
  assert.equal(await page.locator("#standard-components-toggle").isChecked(), true);
  assert.match(await page.locator("#matrix-to-prime").textContent(), /does not exist/);
  assert.ok(await page.locator('[data-arrow="basis-prime-e2"]').getAttribute("stroke-dasharray"));
  await assertCoordinateCard(page, { standard: ["3", "1"], primeUnavailable: true });

  await setBasis(page, ["0", "0", "0", "1"]);
  assert.equal(await page.locator('[data-arrow="basis-prime-e1"][data-zero-vector="true"]').count(), 1);
  assert.equal(await page.locator('[data-annotation="e′₁"]').count(), 1);

  await restoreDefaultBasis(page);
  assert.equal(await page.locator("#basis-status").textContent(), "Valid basis");
  assert.equal(await page.locator("#prime-components-toggle").isDisabled(), false);
  if (!(await page.locator("#prime-components-toggle").isChecked())) {
    await page.locator('label[for="prime-components-toggle"]').click();
  }
}

async function assertResponsiveCanvas(page) {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 980, height: 700 },
    { width: 641, height: 900 },
    { width: 640, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 800 }
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      const canvas = document.querySelector("#basis-plot")?.getBoundingClientRect();
      const rail = document.querySelector(".control-rail")?.getBoundingClientRect();
      const frame = document.querySelector('[data-plot-frame="true"]')?.getBoundingClientRect();
      const coordinateCard = document.querySelector("#vector-coordinates-card")?.getBoundingClientRect();
      const themeToggle = document.querySelector("#theme-toggle")?.getBoundingClientRect();
      return canvas && rail && frame && coordinateCard && themeToggle
        ? {
            canvas: { width: canvas.width, height: canvas.height },
            rail: { x: rail.x, y: rail.y, width: rail.width, height: rail.height },
            frame: { width: frame.width, height: frame.height },
            coordinateCard: {
              x: coordinateCard.x,
              y: coordinateCard.y,
              width: coordinateCard.width,
              height: coordinateCard.height
            },
            themeToggle: {
              x: themeToggle.x,
              y: themeToggle.y,
              width: themeToggle.width,
              height: themeToggle.height
            },
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight
          }
        : null;
    });
    assert.ok(layout);
    assert.ok(Math.abs(layout.canvas.width - viewport.width) <= 2);
    assert.ok(Math.abs(layout.canvas.height - viewport.height) <= 2);
    assert.ok(layout.rail.x >= 0 && layout.rail.width <= viewport.width);
    assert.ok(layout.rail.height <= viewport.height + 1);
    assert.ok(layout.scrollWidth <= viewport.width + 1);
    assert.ok(layout.scrollHeight <= viewport.height + 1);
    assert.ok(
      layout.coordinateCard.width <= Math.min(340, viewport.width - 6),
      "The enlarged coordinate card must still fit within the viewport."
    );
    assert.ok(layout.coordinateCard.height <= 190, "The coordinate card must remain compact.");
    assert.ok(
      layout.coordinateCard.x + layout.coordinateCard.width >= viewport.width - 24,
      "The coordinate card must stay in the top-right corner."
    );
    assert.ok(layout.coordinateCard.y <= 24, "The coordinate card must stay near the top edge.");
    assert.equal(
      rectanglesOverlap(layout.rail, layout.coordinateCard),
      false,
      "The coordinate card must not obstruct the controls."
    );
    assert.ok(layout.themeToggle.x >= 0 && layout.themeToggle.x <= 24);
    assert.ok(
      viewport.height - (layout.themeToggle.y + layout.themeToggle.height) <= 24,
      "The theme toggle must stay in the bottom-left corner."
    );
    assert.ok(layout.themeToggle.width <= 180 && layout.themeToggle.height <= 58);
    assert.equal(
      rectanglesOverlap(layout.rail, layout.themeToggle),
      false,
      "The theme toggle must not obstruct the controls."
    );
    assert.equal(
      rectanglesOverlap(layout.coordinateCard, layout.themeToggle),
      false,
      "The theme toggle must not obstruct the coordinate card."
    );
    if (viewport.width > viewport.height) {
      assert.ok(layout.frame.width > layout.frame.height, "A landscape grid must fill horizontally.");
    } else {
      assert.ok(layout.frame.height > layout.frame.width, "A portrait grid must fill vertically.");
    }

    const e1 = await readArrow(page, "basis-e1");
    const e2 = await readArrow(page, "basis-e2");
    assert.ok(Math.abs(Math.abs(e1.x2 - e1.x1) - Math.abs(e2.y2 - e2.y1)) < 0.01);

    if (viewport.width === 320) {
      await page.locator(".control-rail").screenshot({
        path: new URL("browser-smoke-mobile.png", artifactDir).pathname
      });
    }
  }
}

async function assertHalfUnitGridGeometry(page) {
  const result = await page.locator("#basis-plot").evaluate((svg) => {
    const grids = [...svg.querySelectorAll('[data-layer="grid"] path[data-grid-level]')];
    const e1 = svg.querySelector('[data-arrow="basis-e1"]');
    const e2 = svg.querySelector('[data-arrow="basis-e2"]');
    if (grids.length !== 2 || !e1 || !e2) {
      return null;
    }
    const originX = Number(e1.getAttribute("x1"));
    const originY = Number(e1.getAttribute("y1"));
    const unitX = Number(e1.getAttribute("x2")) - originX;
    const unitY = Number(e2.getAttribute("y2")) - Number(e2.getAttribute("y1"));
    const commands = grids.flatMap((grid) =>
      [...(grid.getAttribute("d") ?? "").matchAll(
        /M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)/g
      )].map((match) => ({
        level: grid.getAttribute("data-grid-level"),
        points: match.slice(1).map(Number)
      }))
    );
    const coordinateOf = ({ points: [x1, y1, x2, y2] }) =>
      x1 === x2 ? (x1 - originX) / unitX : (y1 - originY) / unitY;
    return {
      count: commands.length,
      halfIntegral: commands.every((command) => {
        const coordinate = coordinateOf(command);
        return Math.abs(coordinate * 2 - Math.round(coordinate * 2)) < 1e-3;
      }),
      minorClassified: commands
        .filter(({ level }) => level === "minor")
        .every((command) => {
          const coordinate = coordinateOf(command);
          return Math.abs(coordinate - Math.round(coordinate)) > 1e-3;
        }),
      majorClassified: commands
        .filter(({ level }) => level === "major")
        .every((command) => {
          const coordinate = coordinateOf(command);
          return Math.abs(coordinate - Math.round(coordinate)) < 1e-3;
        }),
      minorCount: commands.filter(({ level }) => level === "minor").length,
      majorCount: commands.filter(({ level }) => level === "major").length,
      minorWidth: Number(grids.find((grid) => grid.getAttribute("data-grid-level") === "minor")
        ?.getAttribute("stroke-width")),
      majorWidth: Number(grids.find((grid) => grid.getAttribute("data-grid-level") === "major")
        ?.getAttribute("stroke-width"))
    };
  });
  assert.ok(result && result.count > 20);
  assert.equal(result.halfIntegral, true, "Every rendered grid line must use half-unit spacing.");
  assert.ok(result.minorCount > 0 && result.majorCount > 0);
  assert.equal(result.minorClassified, true, "Minor grid lines must represent half-integers.");
  assert.equal(result.majorClassified, true, "Major grid lines must represent integers.");
  assert.ok(result.majorWidth > result.minorWidth, "Integer grid lines must remain stronger.");
}

async function setBasis(page, [firstX, firstY, secondX, secondY]) {
  await page.locator("#basis-first-x").fill(firstX);
  await page.locator("#basis-first-y").fill(firstY);
  await page.locator("#basis-second-x").fill(secondX);
  await page.locator("#basis-second-y").fill(secondY);
  await page.locator('#basis-form button[type="submit"]').click();
}

async function restoreDefaultBasis(page) {
  await setBasis(page, ["1", "1", "-1", "1"]);
}

async function setVector(page, x, y) {
  await page.locator("#vector-x").fill(x);
  await page.locator("#vector-y").fill(y);
  await page.locator("#vector-form").evaluate((form) => form.requestSubmit());
}

async function assertCoordinateCard(page, { standard, prime, primeUnavailable = false }) {
  const card = page.locator("#vector-coordinates-card");
  assert.equal(await card.isVisible(), true);
  await assertKatexColumn(page, "#vector-coordinate-standard", standard, {
    basis: "B",
    colors: ["#1B7F5A", "#C4454D"],
    renderedColors: ["rgb(27, 127, 90)", "rgb(196, 69, 77)"]
  });
  const coordinateFontSize = await page
    .locator("#vector-coordinate-standard .katex")
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  assert.ok(coordinateFontSize >= 19, "The enlarged coordinate card must remain readable.");

  const primeOutput = page.locator("#vector-coordinate-prime");
  if (primeUnavailable) {
    assert.equal(
      await primeOutput.locator(".katex").count(),
      1,
      "The unavailable B' coordinate must retain its KaTeX basis notation."
    );
    assert.match((await primeOutput.textContent()) ?? "", /unavailable/i);
  } else if (prime) {
    await assertKatexColumn(page, "#vector-coordinate-prime", prime, {
      basis: "B'",
      colors: ["#2F6FDB", "#7B4DB3"],
      renderedColors: ["rgb(47, 111, 219)", "rgb(123, 77, 179)"]
    });
  }
}

async function assertKatexColumn(
  page,
  selector,
  [x, y],
  { basis, colors, renderedColors }
) {
  const output = page.locator(selector);
  assert.equal(await output.locator(".katex").count(), 1, `${selector} must be rendered by KaTeX.`);
  const source = normalizeMath(await output.locator(".katex-mathml annotation").textContent());
  const expectedColumn =
    `\\begin{bmatrix}\\color{${colors[0]}}{${x}}` +
    `\\\\[0.4em]\\color{${colors[1]}}{${y}}\\end{bmatrix}_{${basis}}`;
  assert.ok(
    source.includes(expectedColumn),
    `${selector} must contain the colored, basis-labeled column ${expectedColumn}; received ${source}.`
  );
  const computedColors = await output.locator(".katex-html *").evaluateAll((nodes) => [
    ...new Set(nodes.map((node) => getComputedStyle(node).color))
  ]);
  renderedColors.forEach((color) => {
    assert.ok(computedColors.includes(color), `${selector} must render the component color ${color}.`);
  });
}

function rectanglesOverlap(first, second) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function readArrow(page, name) {
  return page.locator(`[data-arrow="${name}"]`).evaluate((node) => ({
    x1: Number(node.getAttribute("x1") ?? node.getAttribute("cx")),
    y1: Number(node.getAttribute("y1") ?? node.getAttribute("cy")),
    x2: Number(node.getAttribute("x2") ?? node.getAttribute("cx")),
    y2: Number(node.getAttribute("y2") ?? node.getAttribute("cy"))
  }));
}

function normalizeMath(value) {
  return (value ?? "").replace(/\s+/g, " ").replace(/\s/g, "").trim();
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Preview server exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function waitForExit(child) {
  if (child.exitCode !== null) {
    return;
  }
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 2_000);
  });
}
