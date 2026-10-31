import { describe, expect, test } from "bun:test";
import { normalizeRun, parseHumanizeRequest } from "../server/stealth";
import { humanizeWordCount, preservationMarkers } from "../src/lib/preservation";

describe("preservation markers and estimates", () => {
  const settings = { preservation: true };
  const markers = (text: string) => preservationMarkers(text, settings).map(({ start, end }) => text.slice(start, end));

  test("recognizes adjacent, repeated, empty and boundary-length markers in order", () => {
    const text = "[[T1]][[/a]] Text [[T1]] [[]] [[1234567890]] [[12345678901]] [[unclosed";
    expect(markers(text)).toEqual(["[[T1]]", "[[/a]]", "[[T1]]", "[[]]", "[[1234567890]]"]);
  });

  test("custom delimiters are literal and respect the lookahead", () => {
    const p = { preservation: true, preservationOpen: "${", preservationClose: ".*", preservationMaxLookahead: 1 };
    const text = "${X.* ${XY.*";
    expect(preservationMarkers(text, p)).toEqual([{ start: 0, end: 5 }]);
    expect(preservationMarkers("[[x]]", {})).toEqual([]);
    expect(preservationMarkers("text", { preservation: true, preservationOpen: "" })).toEqual([]);
  });

  test("only recognized markers are removed from estimated billable words", () => {
    const text = "Hello [[two words]] and [[T2]] goodbye";
    expect(humanizeWordCount(text, settings)).toBe(3);
    expect(humanizeWordCount(text, {})).toBe(6);
    expect(humanizeWordCount("[[T1]][[T2]]", settings)).toBe(0);
    expect(humanizeWordCount("Hello [[this is too long]]", settings)).toBe(5);
    expect(humanizeWordCount("before ${two words} after", { preservation: true, preservationOpen: "${", preservationClose: "}" })).toBe(2);
  });
});

describe("preservation API compatibility", () => {
  test("old requests stay opt-in, while boundary values are accepted", () => {
    expect(parseHumanizeRequest({ model: "lite" }, "text")).not.toHaveProperty("preservation");
    for (const preservationMaxLookahead of [1, 64]) {
      expect(parseHumanizeRequest({ model: "super", preservation: true, preservationOpen: "1234567890", preservationClose: "!", preservationMaxLookahead }, "text")).toMatchObject({ preservation: true, preservationMaxLookahead });
    }
  });

  test("flat and nested results retain fallback metadata; old and malformed results remain usable", () => {
    const preservation = { frozenCount: 2, preservedCount: 2, mode: "inline", fallbackUsed: true } as const;
    expect(normalizeRun({ status: "completed", result: "[[T1]][[T2]]", preservation }).preservation).toEqual(preservation);
    expect(normalizeRun({ status: "completed", result: { text: "[[T1]][[T2]]", preservation } }).preservation).toEqual(preservation);
    expect(normalizeRun({ status: "queued" })).not.toHaveProperty("preservation");
    expect(normalizeRun({ status: "completed", result: "Hi", preservation: true })).toMatchObject({ text: "Hi", done: true });
    expect(normalizeRun({ preservation: { ...preservation, frozenCount: "2" } })).not.toHaveProperty("preservation");
    expect(normalizeRun({ status: "failed", error: { message: "Markers could not be preserved" } })).toMatchObject({ done: true, text: null, error: "Markers could not be preserved" });
  });
});
