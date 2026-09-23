import { describe, expect, test, vi } from "vitest";

import { DIMENSIONS } from "../../src/dimensions";
import { buildJevInput, onRequestPost, scoresFromJevResponse } from "./score";

const scoreRequest = (
  body: unknown,
  origin = "https://jev-tone.tomv.uk",
): Request =>
  new Request("https://jev-tone.tomv.uk/api/score", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });

const aiResponse = {
  model: "jev-1.13.0",
  answers: {
    urgency: { type: "score", score: 3.25, confidence: 0.91 },
    specificity: { type: "score", score: 1.4, confidence: 0.78 },
  },
};

describe("Jev score contract", () => {
  test("uses the exact phrase as sole state with parallel Score questions", () => {
    expect(
      buildJevInput("Send the signed copy by noon.", [
        "urgency",
        "specificity",
      ]),
    ).toEqual({
      state: "Send the signed copy by noon.",
      questions: {
        urgency: {
          type: "score",
          instructions: DIMENSIONS.urgency.instructions,
          criteria: DIMENSIONS.urgency.criteria,
        },
        specificity: {
          type: "score",
          instructions: DIMENSIONS.specificity.instructions,
          criteria: DIMENSIONS.specificity.criteria,
        },
      },
    });
  });

  test("parses direct and Workers AI envelope responses", () => {
    const expected = {
      model: "jev-1.13.0",
      scores: {
        urgency: { score: 3.25, confidence: 0.91 },
        specificity: { score: 1.4, confidence: 0.78 },
      },
    };

    expect(
      scoresFromJevResponse(aiResponse, ["urgency", "specificity"]),
    ).toEqual(expected);
    expect(
      scoresFromJevResponse({ result: aiResponse }, ["urgency", "specificity"]),
    ).toEqual(expected);
  });

  test("rejects missing and out-of-range model scores", () => {
    expect(() =>
      scoresFromJevResponse(
        { answers: { urgency: { type: "score", score: 4.1 } } },
        ["urgency"],
      ),
    ).toThrow("invalid score");
    expect(() => scoresFromJevResponse({ answers: {} }, ["urgency"])).toThrow(
      "invalid score",
    );
  });
});

describe("POST /api/score", () => {
  test("runs Jev once and returns all active scores without caching", async () => {
    const run = vi.fn(async () => aiResponse);
    const response = await onRequestPost({
      request: scoreRequest({
        phrase: "Send the signed copy by noon.",
        dimensions: ["urgency", "specificity"],
      }),
      env: { AI: { run } },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      model: "jev-1.13.0",
      scores: {
        urgency: { score: 3.25, confidence: 0.91 },
        specificity: { score: 1.4, confidence: 0.78 },
      },
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      "typesafe/jev",
      buildJevInput("Send the signed copy by noon.", [
        "urgency",
        "specificity",
      ]),
    );
  });

  test("rejects cross-origin requests before inference", async () => {
    const run = vi.fn();
    const response = await onRequestPost({
      request: scoreRequest(
        { phrase: "Hello", dimensions: ["playfulness"] },
        "https://attacker.example",
      ),
      env: { AI: { run } },
    });

    expect(response.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  test("rejects a different origin scheme before inference", async () => {
    const run = vi.fn();
    const response = await onRequestPost({
      request: scoreRequest(
        { phrase: "Hello", dimensions: ["playfulness"] },
        "http://jev-tone.tomv.uk",
      ),
      env: { AI: { run } },
    });

    expect(response.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  test.each([
    [{ phrase: "", dimensions: ["urgency"] }, "empty phrase"],
    [{ phrase: "x".repeat(121), dimensions: ["urgency"] }, "long phrase"],
    [
      { phrase: "Hello", dimensions: ["urgency", "urgency"] },
      "duplicate dimensions",
    ],
    [{ phrase: "Hello", dimensions: ["made_up"] }, "unknown dimension"],
    [{ phrase: "Hello", dimensions: [] }, "no dimensions"],
    [
      {
        phrase: "Hello",
        dimensions: ["urgency", "specificity", "playfulness", "formality"],
      },
      "too many dimensions",
    ],
  ])("rejects %s before inference (%s)", async (body) => {
    const run = vi.fn();
    const response = await onRequestPost({
      request: scoreRequest(body),
      env: { AI: { run } },
    });

    expect(response.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });
});
