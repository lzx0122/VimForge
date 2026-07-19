/**
 * A small, fast, deterministic string hash (djb2 plus a Murmur3-style
 * finalizer). Not cryptographic - but the finalizer's avalanche step
 * matters: without it, keys sharing a long common prefix (e.g. the same
 * seed with only the last character differing) hash to values that are
 * merely offset by a constant, so sorting them reproduces the input's
 * natural character-code order regardless of seed. The finalizer scrambles
 * that away so seed changes actually reshuffle the order.
 */
function hashString(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash;
}

/**
 * Order `values` deterministically from `seed` combined with each value's
 * `key`. The same seed always reproduces the same order; a different seed
 * (e.g. a different calendar day) changes it - giving repeat selections
 * day-to-day variety without real randomness, so results stay reproducible
 * and testable.
 */
export function stableSeededOrder<T>(
  values: readonly T[],
  seed: string,
  key: (value: T) => string,
): T[] {
  return values
    .map((value, index) => ({
      value,
      index,
      hash: hashString(`${seed}:${key(value)}`),
    }))
    .sort((a, b) => a.hash - b.hash || a.index - b.index)
    .map(({ value }) => value);
}
