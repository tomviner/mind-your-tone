# mind your tone

A tiny phrase-target game scored exclusively by TypeSafe's Jev model.

**Play:** [jev-tone.tomv.uk](https://jev-tone.tomv.uk)

Type a short phrase, submit it, and adjust until every score needle lands in its
hatched target band. Early levels use one wide target. Later levels add more
independent dimensions and narrow the bands from 40% to 20% of the scale.

The 30-point clock is a score, not a deadline. It stops at zero and play
continues for as many attempts as needed.

## How it works

- The browser generates a repeatable ten-level challenge from a shareable seed.
- One same-origin request sends the phrase and all active rubric keys.
- A Cloudflare Pages Function makes one `typesafe/jev` request with the phrase as
  the sole state and every active dimension as a parallel Score question.
- The API returns scores only. The game never asks for or displays generated
  text.
- No accounts, phrase history, database, or application secrets are required.

## Development

Requires Node.js 20.19 or newer.

```bash
npm install
npm test
npm run typecheck
npm run build
npx wrangler pages dev dist
```

The Workers AI binding is declared in `wrangler.jsonc`. Remote inference requires
a Cloudflare account with Workers AI enabled.

## License

MIT
