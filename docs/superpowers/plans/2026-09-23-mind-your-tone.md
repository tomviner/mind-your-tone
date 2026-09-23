# Mind Your Tone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, mobile-first Jev phrase-target game at `jev-tone.tomv.uk`.

**Architecture:** A Vite/React client owns deterministic level generation and the game state machine. A same-origin Python Cloudflare Worker validates at most three dimensions and sends the phrase as the sole state in one `typesafe/jev` inference request containing parallel Score questions. The Worker serves the compiled client with Static Assets.

**Tech Stack:** Python 3.14 on Cloudflare Workers, TypeScript, React 18, Vite, Vitest, `unittest`, Workers Static Assets, Workers AI, GitHub Actions

**Migration note:** The original Pages Function implementation was replaced by a
first-class Python Worker after Python Workers reached general availability. The
Python scoring boundary lives in `worker/`, its tests live in `tests/`, and
`worker/dimensions.json` is shared with the browser.

**Spec:** `docs/superpowers/specs/2026-09-23-mind-your-tone-design.md`

## Global Constraints

- The visible product name is exactly `mind your tone`.
- Phrase input is at most 120 characters.
- Jev Score questions are the sole scorer and all active dimensions share one inference request.
- The phrase is the request's sole `state`; no generated prose is requested or returned.
- Challenge target widths are exactly `0.40, 0.40, 0.36, 0.38, 0.34, 0.30, 0.32, 0.27, 0.23, 0.20`.
- Challenge dimensions per level are exactly `1, 1, 2, 2, 2, 3, 3, 3, 3, 3`.
- The 30-point clock floors at zero but never ends or disables a level.
- No plaintext secrets, private hostnames, private infrastructure names, phrase logs, or phrase persistence.

## Review Focus

- A malformed or cross-origin API request must be rejected before invoking AI.
- Jev response envelopes and direct responses must both parse, while missing or out-of-range scores fail safely.
- A counter at zero must still permit evaluation and successful advancement with zero awarded points.
- Rapid retyping must cancel stale work and result in at most one score award.
- Narrow mobile screens and reduced-motion users must retain legible targets, exact values, and usable controls.

---

### Task 1: Pure game model

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/dimensions.ts`
- Create: `src/game.ts`
- Test: `src/game.test.ts`

**Interfaces:**
- Produces: `DIMENSIONS`, `DimensionKey`, `createChallenge(seed)`, `targetWidth(level)`, `pointsForSuccess(seconds)`, and `createPracticeRound(seed, key)`.
- Consumes: no application code.

- [ ] Write failing tests asserting deterministic seeds, the exact width and dimension-count sequences, unique dimensions, in-bounds targets, and `pointsForSuccess(-1) === 0`.
- [ ] Run `npm test -- src/game.test.ts` and confirm failure because the modules do not exist.
- [ ] Implement the twenty fixed rubrics, seeded PRNG, target construction, and point flooring with no UI dependencies.
- [ ] Run `npm test -- src/game.test.ts` and confirm every model test passes.
- [ ] Commit the independently working game model.

### Task 2: Jev scoring boundary

**Files:**
- Create: `worker/main.py`
- Create: `worker/scoring.py`
- Create: `worker/dimensions.json`
- Test: `tests/test_scoring.py`
- Create: `wrangler.jsonc`

**Interfaces:**
- Consumes: rubric definitions from `worker/dimensions.json`, shared with the browser.
- Produces: `build_jev_input(phrase, keys)`, `scores_from_jev_response(value, keys)`, and the Python Worker `Default.fetch(request)` entry point.

- [ ] Write failing tests proving one input contains the exact phrase as `state`, parallel Score questions, no prose question, envelope parsing, bounds checking, origin checking, length checking, duplicate rejection, and exactly one AI call.
- [ ] Run `python3 -m unittest discover -s tests` and confirm failure because the scoring module does not exist.
- [ ] Implement the bounded request parser, one binding call to `typesafe/jev`, numeric response mapping, `no-store` JSON responses, and structured error logging without phrases.
- [ ] Configure the native Workers AI and Static Assets bindings in `wrangler.jsonc` without application credentials.
- [ ] Run the Python endpoint tests, linter, Worker dry-run, and TypeScript compiler.
- [ ] Commit the independently tested scoring boundary.

### Task 3: Playable interface

**Files:**
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/App.test.tsx`
- Create: `src/ScoreMeter.tsx`
- Create: `src/styles.css`
- Create: `src/setupTests.ts`
- Create: `public/_headers`

**Interfaces:**
- Consumes: challenge/practice rounds and `POST /api/score`.
- Produces: the complete browser game and accessible score meters.

- [x] Write component tests for the initial one-dimension level, debounced live scoring, a failed target attempt, successful advancement/point award, cancellation after further typing, and scoring after the clock displays zero.
- [ ] Run `npm test -- src/App.test.tsx` and confirm failure because UI modules do not exist.
- [ ] Implement the state machine, countdown, fetch boundary, fixed micro-copy, seeded share link, local high score, practice selector, and ten-level completion screen.
- [ ] Implement responsive semantic markup and CSS meters with hatched target bands, shape-coded needles, exact values, focus states, and reduced-motion behavior.
- [ ] Run component tests, full tests, formatting, TypeScript, and production build.
- [ ] Render the built app at phone and desktop widths and correct any collision or overflow.
- [ ] Commit the complete playable interface.

### Task 4: Public delivery and live play verification

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: the verified build and Cloudflare/GitHub authenticated accounts.
- Produces: public repository, verified manual deployment workflow, Workers AI binding, and `https://jev-tone.tomv.uk`.

- [ ] Add public documentation, secret exclusions, CI, and a deployment workflow whose credentials exist only as GitHub secrets.
- [ ] Scan the tracked tree for credentials and forbidden private-infrastructure terms; fail if any are present.
- [ ] Run the complete test, format, type, and build suite from a clean checkout state.
- [ ] Create the public GitHub repository, push `main`, and verify CI succeeds.
- [ ] Provision/deploy in the existing Cloudflare account, bind Workers AI, and attach `jev-tone.tomv.uk` without creating another paid plan.
- [ ] Verify the hostname, security headers, homepage, and API validation response from the public internet.
- [ ] Play at least three live runs with varied phrases, including one allowed to reach zero, and record only scores/behavior—not phrases—in the private handoff.
- [ ] Re-run the secret/private-name scan and report the live URL and verification evidence.
