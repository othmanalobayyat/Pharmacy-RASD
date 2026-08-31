import { describe, it, expect } from "vitest";
import { sampleWord, formatSampleQty } from "./format";

describe("sampleWord / formatSampleQty — Arabic quantity pluralization", () => {
  it("uses the singular 'عينة' only for exactly 1", () => {
    expect(sampleWord(1)).toBe("عينة");
    expect(formatSampleQty(1)).toBe("1 عينة");
  });

  it("uses the plural 'عينات' for 0, 2, 3, and 10", () => {
    for (const n of [0, 2, 3, 10]) {
      expect(sampleWord(n)).toBe("عينات");
      expect(formatSampleQty(n)).toBe(`${n} عينات`);
    }
  });
});
