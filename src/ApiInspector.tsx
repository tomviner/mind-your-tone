export interface ApiLogEntry {
  id: number;
  request: unknown;
  response?: unknown;
  jevRequest?: unknown;
  httpStatus?: number;
  status: "pending" | "complete" | "error" | "cancelled";
}

interface ApiInspectorProps {
  entries: ApiLogEntry[];
  onClear: () => void;
  onClose: () => void;
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

export default function ApiInspector({
  entries,
  onClear,
  onClose,
}: ApiInspectorProps) {
  return (
    <section
      className="api-inspector"
      id="inspect-api"
      aria-label="API inspector"
    >
      <div className="api-inspector-heading">
        <div>
          <p className="eyebrow">under the hood</p>
          <h2>Inspect API</h2>
        </div>
        <div className="api-inspector-actions">
          {entries.length > 0 && (
            <button className="text-button" type="button" onClick={onClear}>
              clear log
            </button>
          )}
          <button className="text-button" type="button" onClick={onClose}>
            close
          </button>
        </div>
      </div>
      <p className="api-inspector-note">
        Browser session only. Nothing here is saved or shared as history.
      </p>

      {entries.length === 0 ? (
        <div className="api-empty">
          <strong>POST /api/score</strong>
          <p>Type a phrase and its live request will appear here.</p>
          <pre>
            <code>{json({ phrase: "…", dimensions: ["urgency"] })}</code>
          </pre>
        </div>
      ) : (
        <div className="api-log">
          {[...entries].reverse().map((entry, index) => (
            <details className="api-entry" key={entry.id} open={index === 0}>
              <summary>
                <span>POST /api/score</span>
                <span className={`api-status is-${entry.status}`}>
                  {entry.httpStatus ?? entry.status}
                </span>
              </summary>
              <div className="api-entry-body">
                <h3>Browser request</h3>
                <pre>
                  <code>{json(entry.request)}</code>
                </pre>

                {entry.jevRequest !== undefined && (
                  <>
                    <h3>Jev request</h3>
                    <pre>
                      <code>{json(entry.jevRequest)}</code>
                    </pre>
                  </>
                )}

                <h3>API response</h3>
                <pre>
                  <code>
                    {entry.response === undefined
                      ? entry.status === "pending"
                        ? "Waiting for Jev…"
                        : "No response."
                      : json(entry.response)}
                  </code>
                </pre>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
