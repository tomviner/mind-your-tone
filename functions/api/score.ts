import { DIMENSIONS, type DimensionKey } from "../../src/dimensions";

interface AiRunner {
  run(model: string, input: unknown): Promise<unknown>;
}

interface ScoreContext {
  request: Request;
  env: { AI: AiRunner };
}

interface ScoreRequest {
  phrase: string;
  dimensions: DimensionKey[];
}

interface ScoreValue {
  score: number;
  confidence: number | null;
}

export interface ScoreResponse {
  model: string | null;
  scores: Partial<Record<DimensionKey, ScoreValue>>;
}

const isDimensionKey = (value: unknown): value is DimensionKey =>
  typeof value === "string" && value in DIMENSIONS;

const isScoreRequest = (value: unknown): value is ScoreRequest => {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ScoreRequest>;
  if (
    typeof request.phrase !== "string" ||
    request.phrase.trim().length === 0 ||
    request.phrase.length > 120
  ) {
    return false;
  }
  if (
    !Array.isArray(request.dimensions) ||
    request.dimensions.length < 1 ||
    request.dimensions.length > 3 ||
    !request.dimensions.every(isDimensionKey)
  ) {
    return false;
  }
  return new Set(request.dimensions).size === request.dimensions.length;
};

export const buildJevInput = (
  phrase: string,
  keys: DimensionKey[],
): Record<string, unknown> => ({
  state: phrase,
  questions: Object.fromEntries(
    keys.map((key) => [
      key,
      {
        type: "score",
        instructions: DIMENSIONS[key].instructions,
        criteria: DIMENSIONS[key].criteria,
      },
    ]),
  ),
});

export const scoresFromJevResponse = (
  value: unknown,
  keys: DimensionKey[],
): ScoreResponse => {
  const envelope = value as { result?: unknown };
  const response = (
    envelope?.result && typeof envelope.result === "object"
      ? envelope.result
      : value
  ) as {
    model?: unknown;
    answers?: Record<string, { score?: unknown; confidence?: unknown }>;
  };

  const scores: Partial<Record<DimensionKey, ScoreValue>> = {};
  for (const key of keys) {
    const answer = response?.answers?.[key];
    if (
      typeof answer?.score !== "number" ||
      !Number.isFinite(answer.score) ||
      answer.score < 0 ||
      answer.score > 4
    ) {
      throw new Error(`Jev returned an invalid score for ${key}`);
    }
    scores[key] = {
      score: answer.score,
      confidence:
        typeof answer.confidence === "number" &&
        Number.isFinite(answer.confidence)
          ? answer.confidence
          : null,
    };
  }

  return {
    model: typeof response.model === "string" ? response.model : null,
    scores,
  };
};

const json = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

export async function onRequestPost(context: ScoreContext): Promise<Response> {
  const requestUrl = new URL(context.request.url);
  const origin = context.request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== requestUrl.origin) {
        return json({ error: "Cross-origin requests are not allowed" }, 403);
      }
    } catch {
      return json({ error: "Cross-origin requests are not allowed" }, 403);
    }
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isScoreRequest(body)) {
    return json({ error: "Invalid scoring request" }, 400);
  }

  try {
    const result = await context.env.AI.run(
      "typesafe/jev",
      buildJevInput(body.phrase, body.dimensions),
    );
    return json(scoresFromJevResponse(result, body.dimensions));
  } catch (error) {
    console.error({
      event: "jev_inference_failed",
      error: error instanceof Error ? error.message : "unknown",
    });
    return json({ error: "Jev could not score that phrase" }, 502);
  }
}

const generatedBindingTypeCheck: PagesFunction<Env> = onRequestPost;
void generatedBindingTypeCheck;
