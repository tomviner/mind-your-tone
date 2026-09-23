import { DIMENSIONS, type DimensionKey } from "./dimensions";
import { isInsideTarget, type Target } from "./game";

interface ScoreMeterProps {
  dimensionKey: DimensionKey;
  target: Target;
  score?: number;
  freshness: ScoreFreshness;
}

export type ScoreFreshness = "current" | "pending" | "stale";

const formatScore = (value: number): string => value.toFixed(1);

export default function ScoreMeter({
  dimensionKey,
  target,
  score,
  freshness,
}: ScoreMeterProps) {
  const dimension = DIMENSIONS[dimensionKey];
  const hit = score === undefined ? undefined : isInsideTarget(score, target);
  const targetLeft = (target.min / 4) * 100;
  const targetWidth = ((target.max - target.min) / 4) * 100;
  const scoreDescription =
    score === undefined
      ? `Not scored yet. Target ${formatScore(target.min)} to ${formatScore(target.max)}`
      : `${freshness === "current" ? "" : "Previous score: "}${formatScore(score)} out of 4. ${freshness === "pending" ? "Update pending. " : freshness === "stale" ? "Update failed. " : ""}${hit ? "Inside" : "Outside"} target.`;

  return (
    <section className={`score-meter ${hit === true ? "is-hit" : ""}`}>
      <div className="meter-heading">
        <div>
          <h2>{dimension.name}</h2>
          <p>
            target {formatScore(target.min)}–{formatScore(target.max)}
          </p>
        </div>
        <output className="meter-score" aria-live="polite">
          {score === undefined ? "—" : formatScore(score)}
        </output>
      </div>

      <div
        className="meter-plot"
        role="meter"
        aria-label={`${dimension.name} score`}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score ?? 0}
        aria-valuetext={scoreDescription}
      >
        <div className="meter-track" aria-hidden="true">
          <div
            className="target-band"
            style={{ left: `${targetLeft}%`, width: `${targetWidth}%` }}
          />
          {score !== undefined && (
            <div
              className="score-needle"
              style={{ left: `${(score / 4) * 100}%` }}
            >
              <span />
            </div>
          )}
        </div>
      </div>

      <div className="meter-ends" aria-hidden="true">
        <span>{dimension.low}</span>
        <span>{dimension.high}</span>
      </div>
    </section>
  );
}
