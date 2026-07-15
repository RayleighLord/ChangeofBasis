import { describe, expect, it } from "vitest";

import {
  parseBasisIntegerLiteral,
  parseVectorIntegerLiteral,
  shouldShowPlotPrompt
} from "../app";
import { normalizeRational } from "../math/rational";
import { AppController } from "../ui/controller";

describe("B' form integer parsing", () => {
  it.each([
    ["0", 0n],
    ["-12", -12n],
    [" +007 ", 7n]
  ])("parses %s exactly", (literal, expected) => {
    expect(parseBasisIntegerLiteral(literal)).toEqual(normalizeRational(expected));
  });

  it.each(["", "1.0", ".5", "3/2", "1e2", "--4", "Infinity"])(
    "rejects non-integer basis input %s",
    (literal) => {
      expect(() => parseBasisIntegerLiteral(literal)).toThrow(
        "Enter an integer, such as -2, 0, or 3."
      );
    }
  );
});

describe("selected-vector form integer parsing", () => {
  it.each([
    ["0", 0n],
    ["-12", -12n],
    [" +007 ", 7n]
  ])("parses %s exactly", (literal, expected) => {
    expect(parseVectorIntegerLiteral(literal)).toEqual(normalizeRational(expected));
  });

  it.each(["", "1.0", ".5", "3/2", "1e2", "--4", "Infinity"])(
    "rejects non-integer vector input %s",
    (literal) => {
      expect(() => parseVectorIntegerLiteral(literal)).toThrow(
        "Enter an integer, such as -2, 0, or 3."
      );
    }
  );
});

describe("plot prompt visibility", () => {
  it("is shown before selection, hidden for manual vectors, and restored by clear", () => {
    const controller = new AppController();
    expect(shouldShowPlotPrompt(controller.getViewModel())).toBe(true);

    controller.setVector({
      x: { kind: "exact", value: normalizeRational(3n), source: "input" },
      y: { kind: "exact", value: normalizeRational(1n), source: "input" }
    });
    expect(shouldShowPlotPrompt(controller.getViewModel())).toBe(false);

    controller.clearVector();
    expect(shouldShowPlotPrompt(controller.getViewModel())).toBe(true);

    controller.setVector({
      x: { kind: "approximate", value: 1.2345, source: "click" },
      y: { kind: "approximate", value: -0.75, source: "click" }
    });
    expect(shouldShowPlotPrompt(controller.getViewModel())).toBe(false);
  });
});
