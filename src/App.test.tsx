import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import App from "./App";
import { createChallenge, createPracticeRound, type GameRound } from "./game";

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

const finishSuccessDelay = () => {
  act(() => vi.advanceTimersByTime(5_000));
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
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

  test("exposes the challenge seed as a real shareable link", () => {
    render(<App initialSeed={SEED} />);

    const link = screen.getByRole("link", { name: "share challenge" });
    const url = new URL(link.getAttribute("href")!, window.location.href);
    expect(url.searchParams.get("seed")).toBe(SEED);
    expect(url.hash).toBe("");
  });

  test("links the footer to the public source repository", () => {
    render(<App initialSeed={SEED} />);

    const link = screen.getByRole("link", { name: "source" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/tomviner/mind-your-tone",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  test("hands the current phrase and target to the alternate game", () => {
    window.history.replaceState(null, "", "/?text=Handed%20back%20phrase");
    render(<App initialSeed={SEED} />);

    const link = within(screen.getByRole("banner")).getByRole("link", {
      name: "tone your mind",
    });
    const url = new URL(link.getAttribute("href")!);
    const { key, target } = createChallenge(SEED)[0].dimensions[0];

    expect(screen.getByLabelText("Your phrase")).toHaveValue(
      "Handed back phrase",
    );
    expect(link).toHaveTextContent("tone your mind →");
    expect(url.origin).toBe("https://tone-jev.tomv.uk");
    expect(url.searchParams.get("text")).toBe("Handed back phrase");
    expect(url.searchParams.get("dimension")).toBe(key);
    expect(url.searchParams.get("target")).toBe(
      String(Math.round(((target.min + target.max) / 8) * 100)),
    );
  });

  test("truncates an oversized handed-off phrase to the input contract", () => {
    const supplied = "x".repeat(140);
    window.history.replaceState(
      null,
      "",
      `/?text=${encodeURIComponent(supplied)}`,
    );

    render(<App initialSeed={SEED} />);

    expect(screen.getByLabelText("Your phrase")).toHaveValue("x".repeat(120));
  });

  test("credits Jev's role beside the game name", () => {
    render(<App initialSeed={SEED} />);

    expect(
      within(screen.getByRole("banner")).getByText("you write · Jev scores"),
    ).toBeInTheDocument();
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

  test("labels a scored phrase as the player's attempt", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(scoreBody(round, false))),
    );
    render(<App initialSeed={SEED} />);

    expect(screen.queryByText("your attempt")).not.toBeInTheDocument();
    typePhrase();
    await finishDebounce();

    expect(screen.getByText("your attempt")).toBeInTheDocument();
  });

  test("marks the previous score stale while an edited phrase is rescored", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    const { key, target } = round.dimensions[0];
    const firstScore = target.min > 0 ? 0 : 4;
    const secondScore = target.min > 0 ? target.min / 2 : (target.max + 4) / 2;
    const bodyWithScore = (score: number) => ({
      model: "jev-1.13.0",
      scores: { [key]: { score, confidence: 0.9 } },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(bodyWithScore(firstScore)))
        .mockResolvedValueOnce(Response.json(bodyWithScore(secondScore))),
    );
    render(<App initialSeed={SEED} />);

    typePhrase("First draft");
    await finishDebounce();
    const meters = screen.getByLabelText("Tone targets");
    const scoredMeter = screen.getByRole("meter");
    const previousScore = scoredMeter.getAttribute("aria-valuenow");
    expect(meters).toHaveAttribute("aria-busy", "false");
    expect(meters).not.toHaveClass("has-stale-scores");

    typePhrase("Edited draft");
    expect(meters).toHaveAttribute("aria-busy", "true");
    expect(meters).toHaveClass("has-stale-scores");
    expect(scoredMeter).toHaveAttribute("aria-valuenow", previousScore);
    expect(scoredMeter).toHaveAttribute(
      "aria-valuetext",
      expect.stringContaining("Update pending"),
    );

    await finishDebounce();
    expect(meters).toHaveAttribute("aria-busy", "false");
    expect(meters).not.toHaveClass("has-stale-scores");
    expect(scoredMeter).toHaveAttribute("aria-valuenow", String(secondScore));

    fireEvent.click(screen.getByRole("link", { name: /inspect api/i }));
    expect(
      within(
        screen.getByRole("region", { name: /api inspector/i }),
      ).getAllByText("POST /api/score"),
    ).toHaveLength(2);
  });

  test("keeps an unsuccessful refresh visibly and accessibly stale", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(scoreBody(round, false)))
        .mockResolvedValueOnce(
          Response.json({ error: "unavailable" }, { status: 502 }),
        ),
    );
    render(<App initialSeed={SEED} />);

    typePhrase("First draft");
    await finishDebounce();
    typePhrase("Edited draft");
    await finishDebounce();

    const meters = screen.getByLabelText("Tone targets");
    expect(meters).toHaveAttribute("aria-busy", "false");
    expect(meters).toHaveClass("has-stale-scores");
    expect(screen.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      expect.stringContaining("Update failed"),
    );

    fireEvent.click(screen.getByRole("link", { name: /inspect api/i }));
    const inspector = screen.getByRole("region", { name: /api inspector/i });
    expect(within(inspector).getByText("502")).toBeInTheDocument();
    expect(within(inspector).getByText(/unavailable/)).toBeInTheDocument();
  });

  test("shows the earned score and auto-advances after a five-second success pause", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(scoreBody(round, true))),
    );
    render(<App initialSeed={SEED} />);

    typePhrase();
    await finishDebounce();

    expect(screen.getByText("level 1 / 10")).toBeInTheDocument();
    expect(screen.getByText("30 total")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /next level; advances automatically in 5 seconds/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("enter · auto in 5s")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.getByText("level 1 / 10")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));

    expect(screen.getByText("level 2 / 10")).toBeInTheDocument();
    expect(screen.getByText("30 total")).toBeInTheDocument();
    expect(screen.getByText("New target.")).toBeInTheDocument();
  });

  test("keeps the winning work visible and lets the player advance early", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    const winningScore =
      (round.dimensions[0].target.min + round.dimensions[0].target.max) / 2;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(scoreBody(round, true))),
    );
    render(<App initialSeed={SEED} />);

    typePhrase();
    await finishDebounce();

    expect(screen.getByText("level 1 / 10")).toBeInTheDocument();
    expect(screen.getByText(winningScore.toFixed(1))).toBeInTheDocument();
    expect(screen.getByText("Nailed it.")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      expect.stringContaining("Inside target"),
    );

    act(() => vi.advanceTimersByTime(1_500));
    expect(screen.getByText("level 1 / 10")).toBeInTheDocument();
    expect(screen.getByText(winningScore.toFixed(1))).toBeInTheDocument();
    expect(screen.getByText("Nailed it.")).toBeInTheDocument();
    expect(screen.getByText("30 points left")).toBeInTheDocument();
    expect(screen.getByLabelText("Your phrase")).not.toHaveAttribute(
      "readonly",
    );
    expect(
      screen.getByRole("link", { name: "share challenge" }),
    ).toBeInTheDocument();

    const advanceButton = screen.getByRole("button", { name: /next level/i });
    advanceButton.focus();
    fireEvent.click(advanceButton);
    expect(screen.getByText("level 2 / 10")).toBeInTheDocument();
    expect(screen.getByLabelText("Your phrase")).toHaveFocus();
  });

  test("keeps auto-advance running for typing during the one-second grace period", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    const fetchMock = vi.fn(async () => Response.json(scoreBody(round, true)));
    vi.stubGlobal("fetch", fetchMock);
    render(<App initialSeed={SEED} />);

    typePhrase("Half a sentence");
    await finishDebounce();
    act(() => vi.advanceTimersByTime(500));
    typePhrase("Half a sentence that I was still finishing");

    await act(async () => {
      vi.advanceTimersByTime(4_499);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("level 1 / 10")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("level 2 / 10")).toBeInTheDocument();
    expect(screen.getByText("30 total")).toBeInTheDocument();
  });

  test("pauses auto-advance for later edits while keeping the level secured", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(scoreBody(round, true)))
      .mockResolvedValueOnce(Response.json(scoreBody(round, false)));
    vi.stubGlobal("fetch", fetchMock);
    render(<App initialSeed={SEED} />);

    typePhrase("An accidental early hit");
    await finishDebounce();
    act(() => vi.advanceTimersByTime(1_001));
    typePhrase("An accidental early hit, now with my intended ending");

    expect(screen.getByText("paused · enter to continue")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /automatic advance paused; press Enter to continue/i,
      }),
    ).toBeInTheDocument();

    await finishDebounce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText(/Level secured.*version misses/i),
    ).toBeInTheDocument();
    expect(screen.getByText("30 total")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("level 1 / 10")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next level/i }));
    expect(screen.getByText("level 2 / 10")).toBeInTheDocument();
  });

  test("advances a winning round when Enter is pressed", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(scoreBody(round, true))),
    );
    render(<App initialSeed={SEED} />);

    typePhrase();
    await finishDebounce();

    expect(screen.getByRole("button", { name: /next level/i })).toHaveAttribute(
      "aria-keyshortcuts",
      "Enter",
    );
    fireEvent.keyDown(screen.getByLabelText("Your phrase"), { key: "Enter" });

    expect(screen.getByText("level 2 / 10")).toBeInTheDocument();
    expect(screen.getByLabelText("Your phrase")).toHaveFocus();

    fireEvent.keyDown(screen.getByLabelText("Your phrase"), { key: "Enter" });
    expect(screen.getByText("level 2 / 10")).toBeInTheDocument();
  });

  test("freezes the winning view and controls during a practice flourish", async () => {
    vi.useFakeTimers();
    fireEvent.click(
      render(<App initialSeed={SEED} />).getByRole("button", {
        name: "practice",
      }),
    );
    const practiceRound = createPracticeRound(`${SEED}:0`, "urgency");
    const fetchMock = vi.fn(async () =>
      Response.json(scoreBody(practiceRound, true)),
    );
    vi.stubGlobal("fetch", fetchMock);

    const picker = screen.getByLabelText("Pick a dimension");
    typePhrase();
    await finishDebounce();

    expect(picker).toBeDisabled();
    expect(screen.getByText("Nailed it.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /next target/i }),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.getByText("Nailed it.")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      expect.stringContaining("Inside target"),
    );

    act(() => vi.advanceTimersByTime(1));
    expect(picker).not.toBeDisabled();
    expect(screen.getByText("Fresh target.")).toBeInTheDocument();
  });

  test("shows the final winning score before revealing the completed run", async () => {
    vi.useFakeTimers();
    const challenge = createChallenge(SEED);
    let roundIndex = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(scoreBody(challenge[roundIndex++], true)),
      ),
    );
    render(<App initialSeed={SEED} />);

    for (let index = 0; index < challenge.length; index += 1) {
      typePhrase(`Winning phrase ${index + 1}`);
      await finishDebounce();
      expect(screen.getByText(`level ${index + 1} / 10`)).toBeInTheDocument();
      expect(screen.getByText("Nailed it.")).toBeInTheDocument();

      if (index < challenge.length - 1) finishSuccessDelay();
    }

    expect(
      screen.getByRole("button", { name: /see results/i }),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.getByText("level 10 / 10")).toBeInTheDocument();
    expect(screen.getByText("Nailed it.")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("run complete")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "300 points" })).toHaveFocus();
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

  test("opens a session inspector that shows the real API and Jev exchange", async () => {
    vi.useFakeTimers();
    const round = createChallenge(SEED)[0];
    const response = {
      ...scoreBody(round, false),
      inspection: {
        request: {
          model: "typesafe/jev",
          input: {
            state: "A traceable phrase",
            questions: {
              [round.dimensions[0].key]: {
                type: "score",
                instructions: "Judge the requested tone.",
                criteria: { 0: "low", 4: "high" },
              },
            },
          },
        },
        response: scoreBody(round, false),
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(response)),
    );
    render(<App initialSeed={SEED} />);

    typePhrase("A traceable phrase");
    await finishDebounce();
    fireEvent.click(screen.getByRole("link", { name: /inspect api/i }));

    const inspector = screen.getByRole("region", { name: /api inspector/i });
    expect(within(inspector).getByText("POST /api/score")).toBeInTheDocument();
    expect(within(inspector).getByText("Jev request")).toBeInTheDocument();
    expect(within(inspector).getByText("API response")).toBeInTheDocument();
    expect(
      within(inspector).getAllByText(/A traceable phrase/),
    ).not.toHaveLength(0);
    expect(within(inspector).getAllByText(/typesafe\/jev/)).not.toHaveLength(0);
    expect(within(inspector).getAllByText(/jev-1\.13\.0/)).not.toHaveLength(0);
    expect(
      within(inspector).getByText(/Browser session only/),
    ).toBeInTheDocument();
  });

  test("records network and malformed-response failures in the inspector", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("private browser detail"))
        .mockResolvedValueOnce(new Response("not json", { status: 502 })),
    );
    render(<App initialSeed={SEED} />);

    typePhrase("First request");
    await finishDebounce();
    typePhrase("Second request");
    await finishDebounce();
    fireEvent.click(screen.getByRole("link", { name: /inspect api/i }));

    const inspector = screen.getByRole("region", { name: /api inspector/i });
    expect(within(inspector).getByText("502")).toBeInTheDocument();
    expect(
      within(inspector).getByText(/Response was not valid JSON/),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText(/Network request failed/),
    ).toBeInTheDocument();
    expect(within(inspector).queryByText(/private browser detail/)).toBeNull();
  });

  test("keeps the linked inspector in sync with the URL and restores focus", () => {
    render(<App initialSeed={SEED} />);

    act(() => {
      window.location.hash = "#inspect-api";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    const link = screen.getByRole("link", { name: /inspect api/i });
    expect(
      screen.getByRole("region", { name: /api inspector/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.queryByRole("region", { name: /api inspector/i })).toBeNull();
    expect(window.location.hash).toBe("");
    expect(link).toHaveFocus();

    act(() => {
      window.location.hash = "#inspect-api";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(
      screen.getByRole("region", { name: /api inspector/i }),
    ).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.queryByRole("region", { name: /api inspector/i })).toBeNull();
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
    const scoringStatus = screen.getByText("Jev is scoring…");
    expect(scoringStatus.querySelector(".status-spinner")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

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
    finishSuccessDelay();

    expect(screen.getByText("level 2 / 10")).toBeInTheDocument();
    expect(screen.getByText("0 total")).toBeInTheDocument();
  });
});
