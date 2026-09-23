# mind your tone

A tiny phrase-target game scored exclusively by TypeSafe's Jev model.

**Play now:** [jev-tone.tomv.uk](https://jev-tone.tomv.uk)

Type a short phrase and pause. It is scored automatically; adjust it until every
needle lands in its hatched target band. Early levels use one wide target. Later
levels add more independent dimensions and narrow the bands from 40% to 20% of
the scale. A successful phrase stays on screen for three seconds while the next
level button fills; click it to move sooner, or let the game advance itself.

The 30-point clock is a score, not a deadline. It stops at zero and play
continues for as many attempts as needed.

## How it works

- The browser generates a repeatable ten-level challenge from a shareable seed.
- Scoring is debounced while typing, and an outdated request is cancelled as
  soon as the phrase changes.
- One same-origin request sends the phrase and all active rubric keys.
- A Python Cloudflare Worker makes one `typesafe/jev` request with the phrase as
  the sole state and every active dimension as a parallel Score question.
- The API returns structured scores and inspection metadata only. The game
  never asks for or displays generated text.
- The footer's Inspect API panel shows this browser session's real API and Jev
  Score exchanges. Its in-memory log disappears on refresh.
- No accounts, phrase history, database, or application secrets are required.

## Development

Requires Node.js 20.19 or newer, Python 3.13 or newer, and
[uv](https://docs.astral.sh/uv/).

```bash
npm install
uv sync
npm test
npm run lint:py
npm run typecheck
npm run build
uv run pywrangler dev
```

The Workers AI binding is declared in `wrangler.jsonc`. Remote inference requires
a Cloudflare account with Workers AI enabled.

Production deploys are currently intentional and manual: build, then run
`uv run pywrangler deploy`. The Python Worker and React assets deploy as one
unit, and its Custom Domain configuration owns `jev-tone.tomv.uk`. The manual
GitHub Actions workflow is available once its Cloudflare credentials are stored
as encrypted repository secrets.

## License

MIT
