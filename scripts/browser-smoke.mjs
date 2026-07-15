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
  await assertHealthyInitialRender(page);
  await assertKeyboardAccessibility(page);
  await assertExactVectorAndDecompositions(page);
  await assertClickReplacementAndSnapping(page);
  await assertTransactionalAndSingularBasisBehavior(page);
  await assertBoundsValidation(page);
  await assertResponsiveResizeReflow(page);
  await assertResponsiveLayout(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("#reset-button").click();
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

async function assertHealthyInitialRender(page) {
  assert.equal(await page.title(), "Change of Basis Explorer");
  assert.equal(await page.locator("#basis-status").textContent(), "Valid basis");
  assert.equal(await page.locator('[data-arrow="basis-e1"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="basis-e2"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="basis-prime-e1"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="basis-prime-e2"]').count(), 1);
  assert.equal(await page.locator('[data-layer="selected-vector"] > *').count(), 0);
  const toStandardText = normalizeMath(await page.locator("#matrix-to-standard").textContent());
  const toPrimeText = normalizeMath(await page.locator("#matrix-to-prime").textContent());
  assert.ok(toStandardText.includes("P") && /[−-]1/.test(toStandardText));
  assert.ok(toPrimeText.includes("P") && toPrimeText.includes("2") && /[−-]/.test(toPrimeText));

  const square = await page.locator(".plot-square").boundingBox();
  assert.ok(square, "The plot square must have a browser bounding box.");
  assert.ok(Math.abs(square.width - square.height) <= 1, "The Cartesian stage must be square.");

  const e1 = await readArrow(page, "basis-e1");
  const e2 = await readArrow(page, "basis-e2");
  assert.ok(
    Math.abs(Math.abs(e1.x2 - e1.x1) - Math.abs(e2.y2 - e2.y1)) < 0.01,
    "One horizontal model unit and one vertical model unit must use the same SVG distance."
  );
}

async function assertExactVectorAndDecompositions(page) {
  await page.locator("#vector-x").fill("3");
  await page.locator("#vector-y").fill("1");
  await page.locator("#vector-y").press("Enter");

  assert.equal(await page.locator('[data-arrow="selected-vector"]').count(), 1);
  assert.match(await page.locator("#interaction-status").textContent(), /Coordinate results updated/);
  assert.match(normalizeMath(await page.locator("#standard-coordinate-output").textContent()), /3.*1/);
  assert.match(normalizeMath(await page.locator("#prime-coordinate-output").textContent()), /2.*−1/);

  await page.locator("#standard-components-toggle").focus();
  await page.keyboard.press("Space");
  await page.locator('label[for="prime-components-toggle"]').click();
  assert.equal(await page.locator("#standard-components-toggle").isChecked(), true);
  assert.equal(await page.locator("#prime-components-toggle").isChecked(), true);
  assert.equal(await page.locator('[data-arrow="component-standard-e1"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="component-standard-e2"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="component-prime-e1"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="component-prime-e2"]').count(), 1);

  const selectedLayerIndex = await page.locator('[data-layer="selected-vector"]').evaluate((node) =>
    Array.from(node.parentElement?.children ?? []).indexOf(node)
  );
  const primeLayerIndex = await page.locator('[data-layer="components-prime"]').evaluate((node) =>
    Array.from(node.parentElement?.children ?? []).indexOf(node)
  );
  assert.ok(selectedLayerIndex > primeLayerIndex, "The black vector must render above components.");
}

async function assertClickReplacementAndSnapping(page) {
  const frame = await page.locator('[data-plot-frame="true"]').boundingBox();
  assert.ok(frame, "The plot frame must be clickable.");

  // In the default [-4,4]^2 view this is exactly the major-grid point (2,-1).
  await page.mouse.click(frame.x + frame.width * 0.75, frame.y + frame.height * 0.625);
  assert.equal(await page.locator("#vector-x").inputValue(), "2");
  assert.equal(await page.locator("#vector-y").inputValue(), "-1");
  assert.match(normalizeMath(await page.locator("#standard-coordinate-output").textContent()), /2.*−1/);
  assert.equal(await page.locator('[data-arrow="selected-vector"]').count(), 1);
}

async function assertTransactionalAndSingularBasisBehavior(page) {
  const originalPrimeX = (await readArrow(page, "basis-prime-e1")).x2;
  await page.locator("#basis-first-x").fill("sqrt(2)");
  await page.locator('#basis-form button[type="submit"]').click();
  assert.equal(await page.locator("#basis-first-x").getAttribute("aria-invalid"), "true");
  assert.match(await page.locator("#basis-form-error").textContent(), /last applied basis/);
  assert.equal((await readArrow(page, "basis-prime-e1")).x2, originalPrimeX);
  assert.equal(await page.locator("#basis-status").textContent(), "Valid basis");

  await page.locator("#basis-first-x").fill("1/2");
  await page.locator("#basis-first-y").fill("1/3");
  await page.locator("#basis-second-x").fill("-2");
  await page.locator("#basis-second-y").fill("3/4");
  await page.locator('#basis-form button[type="submit"]').click();
  assert.equal(await page.locator("#basis-status").textContent(), "Valid basis");
  assert.match(normalizeMath(await page.locator("#determinant-output").textContent()), /25.*24/);

  await page.locator("#basis-second-x").fill("1/2");
  await page.locator("#basis-second-y").fill("1/3");
  await page.locator('#basis-form button[type="submit"]').click();
  assert.equal(await page.locator("#basis-status").textContent(), "Not a basis");
  assert.equal(await page.locator("#prime-components-toggle").isDisabled(), true);
  assert.equal(await page.locator("#prime-components-toggle").isChecked(), false);
  assert.equal(await page.locator("#standard-components-toggle").isChecked(), true);
  assert.match(await page.locator("#matrix-to-prime").textContent(), /does not exist/);
  assert.equal(await page.locator('[data-arrow="basis-prime-e1"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="basis-prime-e2"]').count(), 1);
  assert.equal(await page.locator('[data-arrow="component-standard-e1"]').count(), 1);
  assert.equal(await page.locator('[data-layer="components-prime"] > *').count(), 0);

  const firstPrimeLabel = await page.locator('[data-annotation="e′₁"]').boundingBox();
  const secondPrimeLabel = await page.locator('[data-annotation="e′₂"]').boundingBox();
  assert.ok(firstPrimeLabel && secondPrimeLabel, "Both dependent candidate labels must be visible.");
  assert.ok(
    Math.hypot(
      firstPrimeLabel.x + firstPrimeLabel.width / 2 -
        (secondPrimeLabel.x + secondPrimeLabel.width / 2),
      firstPrimeLabel.y + firstPrimeLabel.height / 2 -
        (secondPrimeLabel.y + secondPrimeLabel.height / 2)
    ) >= 16,
    "Coincident candidate vectors must retain distinguishable labels."
  );
  assert.ok(
    Number(await page.locator('[data-arrow="basis-prime-e1"]').getAttribute("stroke-width")) >
      Number(await page.locator('[data-arrow="basis-prime-e2"]').getAttribute("stroke-width"))
  );
  assert.ok(await page.locator('[data-arrow="basis-prime-e2"]').getAttribute("stroke-dasharray"));

  await page.locator("#reset-button").click();
  assert.equal(await page.locator("#basis-status").textContent(), "Valid basis");
  assert.equal(await page.locator("#prime-components-toggle").isDisabled(), false);
  assert.equal(await page.locator('[data-layer="selected-vector"] > *').count(), 0);

  for (const [id, value] of [
    ["#basis-first-x", "1"],
    ["#basis-first-y", "0"],
    ["#basis-second-x", "0"],
    ["#basis-second-y", "1"]
  ]) {
    await page.locator(id).fill(value);
  }
  await page.locator('#basis-form button[type="submit"]').click();
  assert.ok(
    Number(await page.locator('[data-arrow="basis-e1"]').getAttribute("stroke-width")) >
      Number(await page.locator('[data-arrow="basis-prime-e1"]').getAttribute("stroke-width"))
  );
  assert.ok(await page.locator('[data-arrow="basis-prime-e1"]').getAttribute("stroke-dasharray"));
  assert.ok(
    Number(await page.locator('[data-arrow="basis-e2"]').getAttribute("stroke-width")) >
      Number(await page.locator('[data-arrow="basis-prime-e2"]').getAttribute("stroke-width"))
  );
  assert.ok(await page.locator('[data-arrow="basis-prime-e2"]').getAttribute("stroke-dasharray"));
  await page.locator("#reset-button").click();
}

async function assertBoundsValidation(page) {
  const originalFrameWidth = Number(await page.locator('[data-plot-frame="true"]').getAttribute("width"));
  await page.locator("#x-min-input").fill("4");
  await page.locator("#x-max-input").fill("-4");
  await page.locator("#apply-bounds-button").click();
  assert.match(await page.locator("#bounds-form-error").textContent(), /x min < x max/);
  assert.equal(
    Number(await page.locator('[data-plot-frame="true"]').getAttribute("width")),
    originalFrameWidth,
    "Invalid bounds must retain the applied plot geometry."
  );

  await page.locator("#x-min-input").fill("-1e308");
  await page.locator("#x-max-input").fill("1e308");
  await page.locator("#apply-bounds-button").click();
  assert.match(await page.locator("#bounds-form-error").textContent(), /finite spans/);
  assert.equal(
    Number(await page.locator('[data-plot-frame="true"]').getAttribute("width")),
    originalFrameWidth,
    "Overflowing bounds must retain the applied plot geometry."
  );

  await page.locator("#x-min-input").fill("");
  await page.locator("#apply-bounds-button").click();
  assert.match(await page.locator("#bounds-form-error").textContent(), /finite number/);
  assert.equal(await page.locator("#x-min-input").getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator("#x-max-input").getAttribute("aria-invalid"), null);

  await page.locator("#x-min-input").fill("100000000000000000000");
  await page.locator("#x-max-input").fill("100000000000000016384");
  await page.locator("#y-min-input").fill("-1");
  await page.locator("#y-max-input").fill("1");
  await page.locator("#apply-bounds-button").click();
  assert.equal(await page.locator("#bounds-form-error").textContent(), "");
  assert.ok(
    (await page.locator('[data-layer="tick-labels"] text').count()) <= 128,
    "Large-offset ranges must keep tick generation bounded."
  );

  for (const [id, value] of [
    ["#x-min-input", "10"],
    ["#x-max-input", "20"],
    ["#y-min-input", "10"],
    ["#y-max-input", "20"]
  ]) {
    await page.locator(id).fill(value);
  }
  await page.locator("#apply-bounds-button").click();
  assert.equal(await page.locator('[data-annotation="e₁"]').count(), 0);
  assert.equal(await page.locator('[data-annotation="e₂"]').count(), 0);
  assert.equal(await page.locator('[data-annotation="e′₁"]').count(), 0);
  assert.equal(await page.locator('[data-annotation="e′₂"]').count(), 0);

  await page.locator("#reset-button").click();

  for (const [id, value] of [
    ["#x-min-input", "-1e300"],
    ["#x-max-input", "1e300"],
    ["#y-min-input", "-1e300"],
    ["#y-max-input", "1e300"]
  ]) {
    await page.locator(id).fill(value);
  }
  await page.locator("#apply-bounds-button").click();
  await page.locator("#vector-x").fill("1");
  await page.locator("#vector-y").fill("0");
  await page.locator("#vector-y").press("Enter");
  assert.equal(
    await page.locator('[data-arrow="selected-vector"][data-zero-vector="true"]').count(),
    0,
    "A nonzero subpixel vector must not be drawn as a zero vector."
  );
  await page.locator("#reset-button").click();

  await page.locator("#y-min-input").fill("-2");
  await page.locator("#y-max-input").fill("2");
  await page.locator("#apply-bounds-button").click();
  const letterboxedFrame = await page.locator('[data-plot-frame="true"]').evaluate((node) => ({
    width: Number(node.getAttribute("width")),
    height: Number(node.getAttribute("height")),
    y: Number(node.getAttribute("y"))
  }));
  assert.ok(Math.abs(letterboxedFrame.width / letterboxedFrame.height - 2) < 0.01);
  assert.ok(letterboxedFrame.y > 48, "Unequal ranges must be centered with letterboxing.");
  await page.locator("#reset-button").click();
}

async function assertResponsiveLayout(page) {
  const viewports = [
    { width: 1180, height: 780 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1536, height: 730 },
    { width: 641, height: 900 },
    { width: 640, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 800 }
  ];
  let tickHeightAt641 = null;

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(80);
    const measurements = await page.evaluate(() => {
      const square = document.querySelector(".plot-square")?.getBoundingClientRect();
      const documentWidth = document.documentElement.scrollWidth;
      const documentHeight = document.documentElement.scrollHeight;
      return square
        ? {
            squareWidth: square.width,
            squareHeight: square.height,
            documentWidth,
            documentHeight
          }
        : null;
    });
    assert.ok(measurements, "Responsive plot measurements must exist.");
    assert.ok(
      Math.abs(measurements.squareWidth - measurements.squareHeight) <= 1,
      `Plot must remain square at ${viewport.width}x${viewport.height}.`
    );
    assert.ok(
      measurements.documentWidth <= viewport.width + 1,
      `Layout must not overflow horizontally at ${viewport.width}x${viewport.height}.`
    );
    if (viewport.width > 980) {
      assert.ok(
        measurements.documentHeight <= viewport.height + 1,
        `Desktop page must stay within the viewport at ${viewport.width}x${viewport.height}.`
      );
    }
    if (viewport.width <= 641) {
      const tickBox = await page.locator('[data-layer="tick-labels"] text').first().boundingBox();
      assert.ok(tickBox && tickBox.height >= 10, "Ticks must remain legible after a viewport resize.");
      if (viewport.width === 641) {
        tickHeightAt641 = tickBox.height;
      }
      if (viewport.width === 640 && tickHeightAt641 !== null) {
        assert.ok(
          Math.abs(tickBox.height - tickHeightAt641) <= 2,
          "Tick typography must not jump at the 640px breakpoint."
        );
      }
    }

    if (viewport.width === 320) {
      for (const [id, value] of [
        ["#x-min-input", "-1000000"],
        ["#x-max-input", "1000000"],
        ["#y-min-input", "-1000000"],
        ["#y-max-input", "1000000"]
      ]) {
        await page.locator(id).fill(value);
      }
      await page.locator("#apply-bounds-button").click();
      const tickLabels = page.locator('[data-layer="tick-labels"] text');
      assert.ok((await tickLabels.count()) <= 10, "Mobile tick count must adapt to CSS size.");
      const firstTickBox = await tickLabels.first().boundingBox();
      assert.ok(firstTickBox && firstTickBox.height >= 10, "Mobile tick labels must remain legible.");
      await page.locator("#reset-button").click();
      await page.locator(".plot-panel").screenshot({
        path: new URL("browser-smoke-mobile.png", artifactDir).pathname
      });
    }
  }
}

async function assertResponsiveResizeReflow(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [id, value] of [
    ["#basis-first-x", "1"],
    ["#basis-first-y", "1"],
    ["#basis-second-x", "1"],
    ["#basis-second-y", "1"]
  ]) {
    await page.locator(id).fill(value);
  }
  await page.locator('#basis-form button[type="submit"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);

  const first = await page.locator('[data-annotation="e′₁"]').boundingBox();
  const second = await page.locator('[data-annotation="e′₂"]').boundingBox();
  assert.ok(first && second);
  assert.ok(
    Math.hypot(
      first.x + first.width / 2 - (second.x + second.width / 2),
      first.y + first.height / 2 - (second.y + second.height / 2)
    ) >= 16,
    "Coincident labels must be reflowed after resize."
  );
  const tickBox = await page.locator('[data-layer="tick-labels"] text').first().boundingBox();
  assert.ok(tickBox && tickBox.height >= 10, "Resize-only reflow must keep ticks legible.");

  await page.locator("#reset-button").click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(100);
}

async function assertKeyboardAccessibility(page) {
  assert.equal(await page.locator("#basis-first-x").getAttribute("inputmode"), "text");
  assert.equal(await page.locator("#plot-heading").evaluate((node) => node.tagName), "H2");
  await page.locator("#set-vector-button").focus();
  const focusStyle = await page.locator("#set-vector-button").evaluate((node) => {
    const style = getComputedStyle(node);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  assert.equal(focusStyle.style, "solid");
  assert.ok(Number.parseFloat(focusStyle.width) >= 3, "Keyboard focus must use a strong ring.");
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
