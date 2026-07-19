import { describe, expect, it } from "vitest";

import { stableSeededOrder } from "./seeded-order";

const VALUES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

describe("stableSeededOrder", () => {
  it("returns every value exactly once", () => {
    const result = stableSeededOrder(VALUES, "2026-07-19", (value) => value);

    expect([...result].sort()).toEqual([...VALUES].sort());
    expect(result).toHaveLength(VALUES.length);
  });

  it("produces the same order for the same seed", () => {
    const first = stableSeededOrder(VALUES, "2026-07-19", (value) => value);
    const second = stableSeededOrder(VALUES, "2026-07-19", (value) => value);

    expect(second).toEqual(first);
  });

  it("produces a different order for a different seed", () => {
    const first = stableSeededOrder(VALUES, "2026-07-19", (value) => value);
    const second = stableSeededOrder(VALUES, "2026-07-20", (value) => value);

    expect(second).not.toEqual(first);
  });

  it("does not depend on the input array's original order", () => {
    const shuffled = ["e", "c", "a", "j", "b", "i", "d", "h", "f", "g"];

    const fromOriginal = stableSeededOrder(VALUES, "seed", (value) => value);
    const fromShuffled = stableSeededOrder(shuffled, "seed", (value) => value);

    expect(fromShuffled).toEqual(fromOriginal);
  });

  it("orders by the key function, not object identity", () => {
    const entries = VALUES.map((value) => ({ id: value }));

    const result = stableSeededOrder(entries, "seed", (entry) => entry.id);

    expect(result.map((entry) => entry.id).sort()).toEqual([...VALUES].sort());
  });
});
