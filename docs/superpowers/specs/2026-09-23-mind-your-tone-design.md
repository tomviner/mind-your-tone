# Mind Your Tone — Design

## Intent

Build a public, mobile-first phrase game that becomes understandable within one
attempt: type a phrase, pause, watch Jev place needles on tone scales, then edit
the phrase until every needle lands in its target band. The game should be
forgiving before it becomes demanding, amusing without generating commentary,
and entirely scored by TypeSafe's Jev model.

## Gameplay

Challenge mode contains ten levels. Levels 1–2 show one dimension, levels 3–5
show two, and levels 6–10 show three. The target widths, expressed as fractions
of a five-anchor Jev Score scale, are `40%, 40%, 36%, 38%, 34%, 30%, 32%, 27%,
23%, 20%`. This deliberately uneven descent lets difficulty breathe rather than
feeling mechanically punitive.

Every level begins with 30 available points. The counter falls once per second
to zero and then stays there; zero never disables scoring or ends the level.
Any failed evaluation leaves the same targets in place and allows another edit.
A successful evaluation awards the counter's current value and advances. After
level ten the run ends with a total score. A seed in the URL makes the target
sequence repeatable and shareable.

Practice mode has no clock or run score. The player chooses one dimension and
keeps trying against freshly generated wide targets.

## Dimensions

Each rubric represents a familiar, reasonably independent property and uses
five concrete anchors so Jev returns a score from 0 through 4:

- **Urgency** — relaxed to immediate.
- **Formality** — casual to formal.
- **Friendliness** — cold to warm.
- **Specificity** — vague to precise.
- **Confidence** — uncertain to certain.
- **Emotion** — neutral to intense.
- **Professionalism** — careless to professional.
- **Playfulness** — serious to playful.
- **Directness** — indirect to direct.
- **Politeness** — rude to courteous.
- **Optimism** — pessimistic to optimistic.
- **Sincerity** — insincere to sincere.
- **Assertiveness** — passive to assertive.
- **Empathy** — detached to empathetic.
- **Diplomacy** — tactless to tactful.
- **Humility** — boastful to humble.
- **Caution** — reckless to cautious.
- **Cooperation** — uncooperative to collaborative.
- **Violence** — peaceful to violent.
- **Whimsy** — practical to whimsical.

Dimensions are sampled without replacement within a level. Selection and target
placement use a deterministic seeded PRNG. Target bands stay inside 0–4 and are
rounded to one decimal place.

## Architecture

The browser is a React/Vite single-page app. Pure TypeScript modules own seeded
round generation, scoring rules, and persisted run state. The interface renders
semantic forms and CSS meters; target bands and needles are not separate chart
series, so each meter uses a single accent plus explicit text, position, and
shape rather than color alone.

A Python Cloudflare Worker at `POST /api/score` accepts `{ phrase, dimensions }`.
It validates same-origin requests, phrase length, dimension keys, and duplicate
keys. It makes exactly one `self.env.AI.run('typesafe/jev', ...)` call containing
the phrase as the sole state and one Score question per active dimension. The
Worker returns only numeric scores, confidences, and the Jev model identifier.
It generates no prose.

The same Worker deployment serves the compiled React app through a Static Assets
binding. The Worker runs on Cloudflare's Python runtime and uses the Workers AI
binding, with no application secrets required or stored. The tone rubric data is
shared by Python and TypeScript from one JSON file. GitHub Actions uses repository
secrets only for deployment credentials.

## Interface

The page leads with the lowercase title `mind your tone`, the level, the points
remaining, and one instruction: “Write a line. Hit every target.” Meters sit
directly above a 120-character textarea. Scoring begins 600 ms after typing
pauses, with no submit button. Each meter includes
the dimension name, human-readable target interval, endpoint labels, a visible
target band, a needle, and an exact numeric score after evaluation.

The palette uses warm paper, near-black ink, electric blue for measured values,
yellow hatching for targets, green for success, and vermilion for errors. Target
hatching, needle shape, labels, and status icons ensure meaning never relies on
color alone. Motion is short and disabled under `prefers-reduced-motion`.

Status copy is fixed UI text only: concise states such as “Closer.”, “Nailed
it.”, and “Jev blinked. Keep typing.” There is no generated explanation, advice,
or replacement phrase.

## Error Handling and Privacy

Empty or overlong phrases are rejected before inference. API input is bounded
to three known dimensions. Cross-origin browser requests are rejected. Network
or model failures preserve the phrase and level, stop the scoring indicator,
and show a fixed retryable message. Responses are marked `no-store`; phrases are
not logged or persisted. Only the high score is saved locally.

## Verification

Unit tests cover deterministic levels, target-width progression, dimension
counts, zero-point completion, Jev request construction, response parsing, and
input rejection. Component tests cover debounce/cancellation/success flows and the
non-blocking zero clock. The production build, Worker configuration, and public
routes are checked. Finally, several real phrases are played through the live
site to confirm Jev scores move plausibly, early levels are attainable, zero
points still permits completion, and the custom hostname serves the deployed
game.

## Non-goals

No accounts, leaderboard, generated text, hints, chat, multiplayer, payments,
database, analytics SDK, or server-side phrase history.
