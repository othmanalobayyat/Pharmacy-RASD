import { describe, it, expect } from "vitest";
import { moveItem } from "./categoryOrder";

const list = (ids) => ids.map((id) => ({ id, name: id }));

describe("moveItem()", () => {
  it("moves an item forward to occupy another item's position", () => {
    const result = moveItem(list(["a", "b", "c", "d"]), "a", "c");
    expect(result.map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item backward to occupy an earlier item's position", () => {
    const result = moveItem(list(["a", "b", "c", "d"]), "d", "b");
    expect(result.map((x) => x.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("moving an item to its own position is a no-op", () => {
    const original = list(["a", "b", "c"]);
    expect(moveItem(original, "b", "b")).toBe(original);
  });

  it("an unknown fromId returns the list unchanged", () => {
    const original = list(["a", "b", "c"]);
    expect(moveItem(original, "x", "b")).toBe(original);
  });

  it("an unknown toId returns the list unchanged", () => {
    const original = list(["a", "b", "c"]);
    expect(moveItem(original, "a", "x")).toBe(original);
  });

  it("does not mutate the original array", () => {
    const original = list(["a", "b", "c"]);
    const originalCopy = [...original];
    moveItem(original, "a", "c");
    expect(original).toEqual(originalCopy);
  });
});
