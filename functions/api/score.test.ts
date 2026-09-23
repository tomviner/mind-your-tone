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
    red_alert: { type: "score", score: 3.25, confidence: 0.91 },
    receipts: { type: "score", score: 1.4, confidence: 0.78 },
  },
};

describe("Jev score contract", () => {
  test("uses the exact phrase as sole state with parallel Score questions", () => {
    expect(
      buildJevInput("Send the signed copy by noon.", ["red_alert", "receipts"]),
    ).toEqual({
      state: "Send the signed copy by noon.",
      questions: {
        red_alert: {
          type: "score",
          instructions: DIMENSIONS.red_alert.instructions,
          criteria: DIMENSIONS.red_alert.criteria,
        },
        receipts: {
          type: "score",
          instructions: DIMENSIONS.receipts.instructions,
          criteria: DIMENSIONS.receipts.criteria,
        },
      },
    });
  });

  test("parses direct and Workers AI envelope responses", () => {
    const expected = {
      model: "jev-1.13.0",
      scores: {
        red_alert: { score: 3.25, confidence: 0.91 },
        receipts: { score: 1.4, confidence: 0.78 },
      },
    };

    expect(
      scoresFromJevResponse(aiResponse, ["red_alert", "receipts"]),
    ).toEqual(expected);
    expect(
      scoresFromJevResponse({ result: aiResponse }, ["red_alert", "receipts"]),
    ).toEqual(expected);
  });

  test("rejects missing and out-of-range model scores", () => {
    expect(() =>
      scoresFromJevResponse(
        { answers: { red_alert: { type: "score", score: 4.1 } } },
        ["red_alert"],
      ),
    ).toThrow("invalid score");
    expect(() => scoresFromJevResponse({ answers: {} }, ["red_alert"])).toThrow(
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
        dimensions: ["red_alert", "receipts"],
      }),
      env: { AI: { run } },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      model: "jev-1.13.0",
      scores: {
        red_alert: { score: 3.25, confidence: 0.91 },
        receipts: { score: 1.4, confidence: 0.78 },
      },
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      "typesafe/jev",
      buildJevInput("Send the signed copy by noon.", ["red_alert", "receipts"]),
      { gateway: { id: "mind-your-tone-jev" } },
    );
  });

  test("rejects cross-origin requests before inference", async () => {
    const run = vi.fn();
    const response = await onRequestPost({
      request: scoreRequest(
        { phrase: "Hello", dimensions: ["jazz_hands"] },
        "https://attacker.example",
      ),
      env: { AI: { run } },
    });

    expect(response.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  test.each([
    [{ phrase: "", dimensions: ["red_alert"] }, "empty phrase"],
    [{ phrase: "x".repeat(121), dimensions: ["red_alert"] }, "long phrase"],
    [
      { phrase: "Hello", dimensions: ["red_alert", "red_alert"] },
      "duplicate dimensions",
    ],
    [{ phrase: "Hello", dimensions: ["made_up"] }, "unknown dimension"],
    [{ phrase: "Hello", dimensions: [] }, "no dimensions"],
    [
      {
        phrase: "Hello",
        dimensions: ["red_alert", "receipts", "jazz_hands", "knife_out"],
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
