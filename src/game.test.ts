import { describe, expect, test } from "vitest";

import {
  CHALLENGE_DIMENSION_COUNTS,
  CHALLENGE_WIDTHS,
  createChallenge,
  createPracticeRound,
  pointsForSuccess,
  targetWidth,
} from "./game";

describe("challenge generation", () => {
  test("repeats the same ten targets for the same seed", () => {
    expect(createChallenge("same-room")).toEqual(createChallenge("same-room"));
    expect(createChallenge("same-room")).not.toEqual(
      createChallenge("other-room"),
    );
  });

  test("starts wide and narrows bumpily to twenty percent", () => {
    expect(CHALLENGE_WIDTHS).toEqual([
      0.4, 0.4, 0.36, 0.38, 0.34, 0.3, 0.32, 0.27, 0.23, 0.2,
    ]);
    expect(
      Array.from({ length: 10 }, (_, index) => targetWidth(index + 1)),
    ).toEqual(CHALLENGE_WIDTHS);
  });

  test("teaches with one dimension before adding two and three", () => {
    const rounds = createChallenge("gentle-start");

    expect(CHALLENGE_DIMENSION_COUNTS).toEqual([1, 1, 2, 2, 2, 3, 3, 3, 3, 3]);
    expect(rounds.map((round) => round.dimensions.length)).toEqual(
      CHALLENGE_DIMENSION_COUNTS,
    );
  });

  test("never repeats a dimension within a level", () => {
    for (const round of createChallenge("no-clones")) {
      const keys = round.dimensions.map((dimension) => dimension.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  test("keeps every target inside the zero-to-four score scale", () => {
    for (const round of createChallenge("keep-it-on-the-road")) {
      for (const dimension of round.dimensions) {
        expect(dimension.target.min).toBeGreaterThanOrEqual(0);
        expect(dimension.target.max).toBeLessThanOrEqual(4);
        expect(dimension.target.max - dimension.target.min).toBeCloseTo(
          round.width * 4,
          1,
        );
      }
    }
  });
});

describe("round scoring", () => {
  test("floors expired and fractional clock values at zero", () => {
    expect(pointsForSuccess(-1)).toBe(0);
    expect(pointsForSuccess(0)).toBe(0);
    expect(pointsForSuccess(12.9)).toBe(12);
  });

  test("makes a wide one-dimension practice target for the chosen rubric", () => {
    const round = createPracticeRound("practice-seed", "playfulness");

    expect(round.width).toBe(0.4);
    expect(round.dimensions).toHaveLength(1);
    expect(round.dimensions[0].key).toBe("playfulness");
  });
});
