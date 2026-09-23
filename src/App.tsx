import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ApiInspector, { type ApiLogEntry } from "./ApiInspector";
import ScoreMeter, { type ScoreFreshness } from "./ScoreMeter";
import { DIMENSIONS, DIMENSION_KEYS, type DimensionKey } from "./dimensions";
import {
  createChallenge,
  createPracticeRound,
  isInsideTarget,
  pointsForSuccess,
} from "./game";

type Mode = "challenge" | "practice";
type ScoreMap = Partial<
  Record<DimensionKey, { score: number; confidence: number | null }>
>;
type ScoreResponse = {
  error?: string;
  inspection?: {
    request?: unknown;
    response?: unknown;
  };
  model?: string | null;
  scores?: ScoreMap;
};

interface AppProps {
  initialSeed?: string;
}

const SUCCESS_HOLD_MS = 3_000;
const MAX_API_LOG_ENTRIES = 20;

const seedFromLocation = (): string => {
  const supplied = new URLSearchParams(window.location.search).get("seed");
  return supplied?.trim() || crypto.randomUUID().slice(0, 8);
};

const savedHighScore = (): number => {
  const value = Number(
    window.localStorage.getItem("mind-your-tone-high-score"),
  );
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
};

export default function App({ initialSeed }: AppProps) {
  const [seed, setSeed] = useState(() => initialSeed ?? seedFromLocation());
  const [mode, setMode] = useState<Mode>("challenge");
  const [levelIndex, setLevelIndex] = useState(0);
  const [practiceKey, setPracticeKey] = useState<DimensionKey>("urgency");
  const [practiceSerial, setPracticeSerial] = useState(0);
  const [phrase, setPhrase] = useState("");
  const [scores, setScores] = useState<ScoreMap>({});
  const [pointsLeft, setPointsLeft] = useState(30);
  const [total, setTotal] = useState(0);
  const [highScore, setHighScore] = useState(savedHighScore);
  const [status, setStatus] = useState("Type to score. Hit every target.");
  const [loading, setLoading] = useState(false);
  const [scoreFreshness, setScoreFreshness] =
    useState<ScoreFreshness>("current");
  const [celebrating, setCelebrating] = useState(false);
  const [complete, setComplete] = useState(false);
  const [apiInspectorOpen, setApiInspectorOpen] = useState(
    () => window.location.hash === "#inspect-api",
  );
  const [apiLog, setApiLog] = useState<ApiLogEntry[]>([]);
  const pointsLeftRef = useRef(pointsLeft);
  const totalRef = useRef(total);
  const highScoreRef = useRef(highScore);
  const apiRequestIdRef = useRef(0);
  const advancingRef = useRef(false);
  const phraseInputRef = useRef<HTMLTextAreaElement>(null);
  const finishHeadingRef = useRef<HTMLHeadingElement>(null);
  const inspectApiLinkRef = useRef<HTMLAnchorElement>(null);

  pointsLeftRef.current = pointsLeft;
  totalRef.current = total;
  highScoreRef.current = highScore;

  const challenge = useMemo(() => createChallenge(seed), [seed]);
  const practiceRound = useMemo(
    () => createPracticeRound(`${seed}:${practiceSerial}`, practiceKey),
    [practiceKey, practiceSerial, seed],
  );
  const round = mode === "challenge" ? challenge[levelIndex] : practiceRound;
  const advanceLabel =
    mode === "practice"
      ? "next target"
      : levelIndex === challenge.length - 1
        ? "see results"
        : "next level";

  const advanceFromSuccess = useCallback(() => {
    if (!celebrating || advancingRef.current) return;
    advancingRef.current = true;

    if (mode === "practice") {
      setPracticeSerial((current) => current + 1);
      setPhrase("");
      setScores({});
      setScoreFreshness("current");
      setCelebrating(false);
      setStatus("Fresh target.");
      phraseInputRef.current?.focus();
      return;
    }

    if (levelIndex === challenge.length - 1) {
      setComplete(true);
      setCelebrating(false);
      setStatus("Tone mastered.");
      return;
    }

    setLevelIndex((current) => current + 1);
    setPointsLeft(30);
    pointsLeftRef.current = 30;
    setPhrase("");
    setScores({});
    setScoreFreshness("current");
    setCelebrating(false);
    setStatus("New target.");
    phraseInputRef.current?.focus();
  }, [celebrating, challenge.length, levelIndex, mode]);

  useEffect(() => {
    const syncInspectorToHash = () => {
      setApiInspectorOpen(window.location.hash === "#inspect-api");
    };
    window.addEventListener("hashchange", syncInspectorToHash);
    return () => window.removeEventListener("hashchange", syncInspectorToHash);
  }, []);

  useEffect(() => {
    if (complete) finishHeadingRef.current?.focus();
  }, [complete]);

  useEffect(() => {
    if (mode !== "challenge" || complete || celebrating) return undefined;
    const timer = window.setInterval(() => {
      setPointsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [celebrating, complete, levelIndex, mode]);

  useEffect(() => {
    if (celebrating || complete || !phrase.trim() || phrase.length > 120) {
      return undefined;
    }

    const controller = new AbortController();
    setLoading(false);
    setStatus("Waiting for a pause…");
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setStatus("Jev is scoring…");
      const requestBody = {
        phrase,
        dimensions: round.dimensions.map(({ key }) => key),
      };
      const requestId = ++apiRequestIdRef.current;
      setApiLog((current) => [
        ...current.slice(-(MAX_API_LOG_ENTRIES - 1)),
        {
          id: requestId,
          request: requestBody,
          status: "pending",
        },
      ]);
      let responseStatus: number | undefined;

      try {
        const response = await fetch("/api/score", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        responseStatus = response.status;
        let body: ScoreResponse;
        try {
          body = (await response.json()) as ScoreResponse;
        } catch {
          setApiLog((current) =>
            current.map((entry) =>
              entry.id === requestId
                ? {
                    ...entry,
                    httpStatus: response.status,
                    response: { error: "Response was not valid JSON." },
                    status: "error",
                  }
                : entry,
            ),
          );
          throw new Error("invalid JSON response");
        }
        const hasEveryScore = round.dimensions.every(
          ({ key }) => typeof body?.scores?.[key]?.score === "number",
        );
        const responseIsValid = Boolean(body?.scores) && hasEveryScore;
        setApiLog((current) =>
          current.map((entry) =>
            entry.id === requestId
              ? {
                  ...entry,
                  httpStatus: response.status,
                  jevRequest: body?.inspection?.request,
                  response: body,
                  status: response.ok && responseIsValid ? "complete" : "error",
                }
              : entry,
          ),
        );
        if (!response.ok) throw new Error("score request failed");
        if (controller.signal.aborted) return;
        if (!body?.scores || !hasEveryScore) throw new Error("missing score");

        setScores(body.scores);
        setScoreFreshness("current");
        const hit = round.dimensions.every(({ key, target }) =>
          isInsideTarget(body.scores?.[key]?.score ?? Number.NaN, target),
        );
        if (!hit) {
          setStatus("Closer.");
          setLoading(false);
          return;
        }

        if (mode === "challenge") {
          const nextTotal =
            totalRef.current + pointsForSuccess(pointsLeftRef.current);
          totalRef.current = nextTotal;
          setTotal(nextTotal);
          if (
            levelIndex === challenge.length - 1 &&
            nextTotal > highScoreRef.current
          ) {
            highScoreRef.current = nextTotal;
            setHighScore(nextTotal);
            window.localStorage.setItem(
              "mind-your-tone-high-score",
              String(nextTotal),
            );
          }
        }
        advancingRef.current = false;
        setCelebrating(true);
        setLoading(false);
        setStatus("Nailed it.");
      } catch {
        if (controller.signal.aborted) {
          setApiLog((current) =>
            current.map((entry) =>
              entry.id === requestId && entry.status === "pending"
                ? { ...entry, status: "cancelled" }
                : entry,
            ),
          );
          return;
        }
        setApiLog((current) =>
          current.map((entry) =>
            entry.id === requestId && entry.status === "pending"
              ? {
                  ...entry,
                  httpStatus: responseStatus,
                  response: { error: "Network request failed." },
                  status: "error",
                }
              : entry,
          ),
        );
        setStatus("Jev blinked. Keep typing.");
        setLoading(false);
        setScoreFreshness("stale");
      }
    }, 600);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    celebrating,
    challenge.length,
    complete,
    levelIndex,
    mode,
    phrase,
    round,
  ]);

  useEffect(() => {
    if (!celebrating) return undefined;
    const timer = window.setTimeout(advanceFromSuccess, SUCCESS_HOLD_MS);

    return () => window.clearTimeout(timer);
  }, [advanceFromSuccess, celebrating]);

  const resetRoundView = () => {
    setPhrase("");
    setScores({});
    setLoading(false);
    setScoreFreshness("current");
    setCelebrating(false);
    advancingRef.current = false;
  };

  const updatePhrase = (nextPhrase: string) => {
    if (celebrating) return;
    setPhrase(nextPhrase);
    if (!nextPhrase.trim()) {
      setScores({});
      setLoading(false);
      setScoreFreshness("current");
      setStatus("Type to score. Hit every target.");
      return;
    }
    setScoreFreshness("pending");
  };

  const chooseMode = (nextMode: Mode) => {
    setMode(nextMode);
    setLevelIndex(0);
    setPracticeSerial(0);
    setPointsLeft(30);
    pointsLeftRef.current = 30;
    setTotal(0);
    totalRef.current = 0;
    setComplete(false);
    setStatus("Type to score. Hit every target.");
    resetRoundView();
  };

  const copyChallenge = async () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("seed", seed);
    try {
      await navigator.clipboard.writeText(url.toString());
      setStatus("Challenge link copied.");
    } catch {
      setStatus(`Seed: ${seed}`);
    }
  };

  const newChallenge = () => {
    const nextSeed = crypto.randomUUID().slice(0, 8);
    setSeed(nextSeed);
    setLevelIndex(0);
    setPointsLeft(30);
    pointsLeftRef.current = 30;
    setTotal(0);
    totalRef.current = 0;
    setComplete(false);
    setStatus("Type to score. Hit every target.");
    resetRoundView();
  };

  const closeApiInspector = () => {
    setApiInspectorOpen(false);
    if (window.location.hash === "#inspect-api") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
    inspectApiLinkRef.current?.focus();
  };

  return (
    <main className="game-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="mind your tone home">
          mind your tone<span aria-hidden="true">!</span>
        </a>
        <nav aria-label="Game mode" className="mode-switch">
          <button
            type="button"
            aria-pressed={mode === "challenge"}
            onClick={() => chooseMode("challenge")}
          >
            challenge
          </button>
          <button
            type="button"
            aria-pressed={mode === "practice"}
            onClick={() => chooseMode("practice")}
          >
            practice
          </button>
        </nav>
      </header>

      <section className="game-card" aria-labelledby="game-heading">
        <div className="game-meta">
          <p className="level-label">
            {mode === "challenge" ? `level ${levelIndex + 1} / 10` : "practice"}
          </p>
          <div className="scoreboard" aria-label="Run score">
            {mode === "challenge" && (
              <strong className={pointsLeft === 0 ? "at-zero" : ""}>
                {pointsLeft} points left
              </strong>
            )}
            <span>{total} total</span>
            {highScore > 0 && <span>{highScore} best</span>}
          </div>
        </div>

        {mode === "practice" && (
          <label className="practice-picker">
            Pick a dimension
            <select
              value={practiceKey}
              disabled={celebrating}
              onChange={(event) => {
                if (celebrating) return;
                setPracticeKey(event.target.value as DimensionKey);
                setPracticeSerial((current) => current + 1);
                setScores({});
                setScoreFreshness("current");
                setStatus("Type to score. Hit the target.");
              }}
            >
              {DIMENSION_KEYS.map((key) => (
                <option value={key} key={key}>
                  {DIMENSIONS[key].name}
                </option>
              ))}
            </select>
          </label>
        )}

        {complete ? (
          <div className="finish-screen">
            <p className="eyebrow">run complete</p>
            <h1 id="game-heading" ref={finishHeadingRef} tabIndex={-1}>
              {total} points
            </h1>
            <p>You shaped every tone without breaking a sentence.</p>
            <div className="finish-actions">
              <button
                className="primary-button"
                type="button"
                onClick={newChallenge}
              >
                new challenge
              </button>
              <button
                className="text-button"
                type="button"
                onClick={copyChallenge}
              >
                share this seed
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="intro-copy">
              <p className="eyebrow">type → scored live → adjust</p>
              <h1 id="game-heading">
                <span>Write a line.</span>
                <span>Hit every target.</span>
              </h1>
            </div>

            <div
              className={`meters${celebrating ? " is-celebrating" : ""}${scoreFreshness !== "current" ? " has-stale-scores" : ""}`}
              aria-label="Tone targets"
              aria-busy={scoreFreshness === "pending"}
            >
              {round.dimensions.map(({ key, target }) => (
                <ScoreMeter
                  key={key}
                  dimensionKey={key}
                  target={target}
                  score={scores[key]?.score}
                  freshness={scoreFreshness}
                />
              ))}
            </div>

            <div className="phrase-form">
              <div className="input-heading">
                <label htmlFor="phrase">Your phrase</label>
                <span>{phrase.length}/120</span>
              </div>
              <textarea
                id="phrase"
                ref={phraseInputRef}
                value={phrase}
                maxLength={120}
                rows={3}
                autoFocus
                readOnly={celebrating}
                placeholder="Try: Could you send that over today?"
                onChange={(event) => updatePhrase(event.target.value)}
              />
              <div className="form-footer">
                <p className="status" role="status">
                  <span aria-hidden="true">
                    {status.startsWith("Nailed") ? "✓" : "↗"}
                  </span>
                  {status}
                </p>
                <span className={`live-badge${loading ? " is-scoring" : ""}`}>
                  {loading ? "scoring…" : celebrating ? "hit!" : "live"}
                </span>
              </div>
              {celebrating && (
                <button
                  className="advance-button"
                  type="button"
                  onClick={advanceFromSuccess}
                  aria-label={`${advanceLabel}; advances automatically in 3 seconds`}
                >
                  <span>{advanceLabel}</span>
                  <small>auto in 3s</small>
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <footer className="site-footer">
        <span>scored only by TypeSafe Jev</span>
        <div className="footer-actions">
          <a
            href="#inspect-api"
            className="text-button"
            ref={inspectApiLinkRef}
            onClick={() => setApiInspectorOpen(true)}
          >
            inspect API
          </a>
          {mode === "challenge" && !complete && (
            <button
              type="button"
              className="text-button"
              disabled={celebrating}
              onClick={copyChallenge}
            >
              share seed {seed}
            </button>
          )}
        </div>
      </footer>

      {apiInspectorOpen && (
        <ApiInspector
          entries={apiLog}
          onClear={() => setApiLog([])}
          onClose={closeApiInspector}
        />
      )}
    </main>
  );
}
