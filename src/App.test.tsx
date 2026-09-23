import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

const setPhrase = (phrase = "Please send the signed copy by noon.") => {
  fireEvent.change(screen.getByLabelText("Your phrase"), {
    target: { value: phrase },
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("challenge play", () => {
  test("opens on a forgiving one-dimension level", () => {
    render(<App initialSeed={SEED} />);

    expect(screen.getByText("level 1 / 10")).toBeInTheDocument();
    expect(screen.getAllByRole("meter")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "check my tone" }),
    ).toBeDisabled();
  });

  test("keeps the same level after a missed target", async () => {
    const round = createChallenge(SEED)[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(scoreBody(round, false))),
    );
    render(<App initialSeed={SEED} />);

    setPhrase();
    fireEvent.click(screen.getByRole("button", { name: "check my tone" }));

    expect(await screen.findByText("Closer.")).toBeInTheDocument();
    expect(screen.getByText("level 1 / 10")).toBeInTheDocument();
  });

  test("awards the live clock and advances after hitting every target", async () => {
    const round = createChallenge(SEED)[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(scoreBody(round, true))),
    );
    render(<App initialSeed={SEED} />);

    setPhrase();
    fireEvent.click(screen.getByRole("button", { name: "check my tone" }));

    expect(await screen.findByText("level 2 / 10")).toBeInTheDocument();
    expect(screen.getByText("30 total")).toBeInTheDocument();
    expect(screen.getByText("Nailed it. New target.")).toBeInTheDocument();
  });

  test("allows only one scoring request while a submission is in flight", () => {
    const fetchPromise = new Promise<Response>(() => undefined);
    const fetchMock = vi.fn(() => fetchPromise);
    vi.stubGlobal("fetch", fetchMock);
    render(<App initialSeed={SEED} />);

    setPhrase();
    const button = screen.getByRole("button", { name: "check my tone" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  test("still scores and advances after the clock reaches zero", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(scoreBody(round, true))),
    );
    render(<App initialSeed={SEED} />);

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(screen.getByText("0 points left")).toBeInTheDocument();

    setPhrase();
    fireEvent.click(screen.getByRole("button", { name: "check my tone" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("level 2 / 10")).toBeInTheDocument();
    expect(screen.getByText("0 total")).toBeInTheDocument();
  });

  test("surfaces a retryable fixed message when scoring fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 502 })),
    );
    render(<App initialSeed={SEED} />);

    setPhrase();
    fireEvent.click(screen.getByRole("button", { name: "check my tone" }));

    await waitFor(() =>
      expect(screen.getByText("Jev blinked. Try again.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "check my tone" })).toBeEnabled();
  });
});
