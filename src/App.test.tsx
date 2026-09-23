import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import App from "./App";
import { createChallenge, type GameRound } from "./game";

const SEED = "friendly-test-seed";

const scoreBody = (round: GameRound, hit: boolean) => ({
  model: "jev-1.13.0",
  scores: Object.fromEntries(
    round.dimensions.map(({ key, target }) => {
      const score = hit
        ? (target.min + target.max) / 2
        : target.min > 0
          ? 0
          : 4;
      return [key, { score, confidence: 0.9 }];
    }),
  ),
});

const typePhrase = (phrase = "Please send the signed copy by noon.") => {
  fireEvent.change(screen.getByLabelText("Your phrase"), {
    target: { value: phrase },
  });
};

const finishDebounce = async () => {
  await act(async () => {
    vi.advanceTimersByTime(650);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("live challenge play", () => {
  test("opens on a forgiving one-dimension level without a submit button", () => {
    render(<App initialSeed={SEED} />);

    expect(screen.getByText("level 1 / 10")).toBeInTheDocument();
    expect(screen.getAllByRole("meter")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /check my tone/i }),
    ).not.toBeInTheDocument();
  });

  test("scores automatically after typing pauses and keeps a missed level", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json(scoreBody(round, false)),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App initialSeed={SEED} />);

    typePhrase();
    expect(fetchMock).not.toHaveBeenCalled();
    await finishDebounce();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Closer.")).toBeInTheDocument();
    expect(screen.getByText("level 1 / 10")).toBeInTheDocument();
  });

  test("awards the live clock and advances when live scores hit every target", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(scoreBody(round, true))),
    );
    render(<App initialSeed={SEED} />);

    typePhrase();
    await finishDebounce();

    expect(screen.getByText("level 2 / 10")).toBeInTheDocument();
    expect(screen.getByText("30 total")).toBeInTheDocument();
    expect(screen.getByText("Nailed it. New target.")).toBeInTheDocument();
  });

  test("cancels a pending evaluation when the phrase changes again", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json(scoreBody(round, false)),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App initialSeed={SEED} />);

    typePhrase("First draft");
    act(() => vi.advanceTimersByTime(300));
    typePhrase("Second draft");
    await finishDebounce();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).phrase).toBe(
      "Second draft",
    );
  });

  test("clears an in-flight evaluation when the textarea is emptied", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App initialSeed={SEED} />);

    typePhrase("First draft");
    await finishDebounce();
    expect(screen.getByText("Jev is scoring…")).toBeInTheDocument();

    typePhrase("");
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(
      screen.getByText("Type to score. Hit every target."),
    ).toBeInTheDocument();
    expect(screen.getByText("live")).toBeInTheDocument();

    await act(async () => {
      resolveRequest?.(Response.json(scoreBody(round, true)));
      await Promise.resolve();
    });
    expect(screen.getByText("level 1 / 10")).toBeInTheDocument();
  });

  test("still scores and advances after the clock reaches zero", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(scoreBody(round, true))),
    );
    render(<App initialSeed={SEED} />);

    act(() => vi.advanceTimersByTime(31_000));
    expect(screen.getByText("0 points left")).toBeInTheDocument();
    typePhrase();
    await finishDebounce();

    expect(screen.getByText("level 2 / 10")).toBeInTheDocument();
    expect(screen.getByText("0 total")).toBeInTheDocument();
  });
});
