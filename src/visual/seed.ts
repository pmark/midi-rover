import type { SeedConfig } from '../core/types';

const hashString = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

export const createSeedConfig = (sourceHash: string, override: string): SeedConfig => {
  const normalizedInput = override.trim().length > 0 ? override.trim() : sourceHash;
  const normalizedSeed = hashString(normalizedInput) || 1;
  return {
    displaySeed: normalizedInput,
    normalizedSeed,
  };
};

export const createDeterministicRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashValue = (value: string): number => hashString(value);
