import { DIMENSION_KEYS, type DimensionKey } from "./dimensions";

export const CHALLENGE_WIDTHS = [
  0.4, 0.4, 0.36, 0.38, 0.34, 0.3, 0.32, 0.27, 0.23, 0.2,
] as const;

export const CHALLENGE_DIMENSION_COUNTS = [
  1, 1, 2, 2, 2, 3, 3, 3, 3, 3,
] as const;

export interface Target {
  min: number;
  max: number;
}

export interface RoundDimension {
  key: DimensionKey;
  target: Target;
}

export interface GameRound {
  level: number;
  width: number;
  dimensions: RoundDimension[];
}

const hashSeed = (seed: string): (() => number) => {
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
};

const seededRandom = (seed: string): (() => number) => {
  let state = hashSeed(seed)();
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const rounded = (value: number): number => Math.round(value * 10) / 10;

const makeTarget = (width: number, random: () => number): Target => {
  const span = width * 4;
  const min = rounded(random() * (4 - span));
  return { min, max: rounded(Math.min(4, min + span)) };
};

const shuffledKeys = (random: () => number): DimensionKey[] => {
  const keys = [...DIMENSION_KEYS];
  for (let index = keys.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [keys[index], keys[other]] = [keys[other], keys[index]];
  }
  return keys;
};

export const targetWidth = (level: number): number =>
  CHALLENGE_WIDTHS[
    Math.max(0, Math.min(CHALLENGE_WIDTHS.length - 1, level - 1))
  ];

export const createChallenge = (seed: string): GameRound[] => {
  const random = seededRandom(seed || "mind-your-tone");
  return CHALLENGE_WIDTHS.map((width, index) => ({
    level: index + 1,
    width,
    dimensions: shuffledKeys(random)
      .slice(0, CHALLENGE_DIMENSION_COUNTS[index])
      .map((key) => ({ key, target: makeTarget(width, random) })),
  }));
};

export const createPracticeRound = (
  seed: string,
  key: DimensionKey,
): GameRound => {
  const random = seededRandom(`${seed}:${key}`);
  return {
    level: 0,
    width: 0.4,
    dimensions: [{ key, target: makeTarget(0.4, random) }],
  };
};

export const pointsForSuccess = (seconds: number): number =>
  Math.max(0, Math.min(30, Math.floor(seconds)));

export const isInsideTarget = (score: number, target: Target): boolean =>
  score >= target.min && score <= target.max;
