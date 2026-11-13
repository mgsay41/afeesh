# أفيش — Afeesh

A live party game: guess the Egyptian movie or TV series from its cast. The host shares a QR code or link, players join from their phones with just a name, and actors are revealed in three stages (supporting cast → bigger role → leads). Guesses are typed in Arabic and judged with fuzzy matching.

- Next.js 16 (App Router) + TypeScript + Tailwind v4 + Motion
- No database, no accounts. Content ships as `src/data/titles.json`; scores live in the host's and players' browsers (localStorage)
- Realtime via **Ably** (free tier). The host's device is the referee: it holds the answers, judges guesses and broadcasts state. Players never receive the answer before the reveal

## Run locally

```bash
npm install
npm run dev
```

Without an Ably key the app runs in **test mode**. Sync works only between tabs of the same browser. To act as different players in one browser, add `?slot=2`, `?slot=3`… to a player URL, e.g. `http://localhost:3000/play/ABCDE?slot=2`.

## Ably setup (needed for real phones)

1. Create a free account at <https://ably.com> → create an app.
2. Go to **API Keys** and copy the **Root** key (looks like `xxxx.yyyy:zzzz`).
3. Locally: create `.env.local` with
   ```
   ABLY_API_KEY=xxxx.yyyy:zzzz
   ```
4. On Vercel: **Project → Settings → Environment Variables** → add `ABLY_API_KEY` → redeploy.

The key stays on the server. Browsers get short-lived tokens from `/api/ably-token` that can only use `afeesh:*` channels.

## Deploy to Vercel

Push to GitHub, import the repo in Vercel (framework: Next.js, no other settings), add `ABLY_API_KEY`, then deploy.

## Content

Source: `content/source.xlsx` (sheets: Top 100, Clues, Actors). To rebuild after editing:

```bash
npm run content
```

This writes `src/data/titles.json` and downloads actor photos to `public/actors/` (resized WebP).

- **Photos:** IMDb/Amazon images are skipped because they aren't licensed for reuse. Sources used are TMDB and Wikimedia links from the sheet, then Wikidata (Wikimedia Commons). Actors without a photo get a colored initials card.
- **More photos:** get a free TMDB API key (<https://www.themoviedb.org/settings/api>) and run `TMDB_API_KEY=... npm run content`.
- **Hand edits:** `content/overrides.json`:
  - `drop.titles`: English titles to remove.
  - `aliases`: extra accepted Arabic spellings per IMDb ID, e.g. `"tt1234567": ["اللمبي ٨ جيجا"]`.
  - `photos`: force a photo URL for an actor (key = Arabic name).

## Scoring

| Correct at | Points |
|---|---|
| Stage 1 (3 supporting actors) | 100 |
| Stage 2 (+ bigger role) | 70 |
| Stage 3 (+ leads) | 40 |
| Each hint shown (genre / year / movie-or-series) | −10 |
| First correct player | +20 |

Each player gets 3 wrong guesses per round. The host can accept a near-miss from the guess feed. The round reveals automatically when everyone has guessed.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest (Arabic matcher, scoring, engine, content checks) |
| `npm run content` | Rebuild titles + photos from the spreadsheet |

## Code map

```
src/lib/arabic.ts            Arabic normalization + fuzzy matching
src/lib/game/engine.ts       Pure game reducer (scoring, stages, hints, public view)
src/lib/game/use-host-game   Host referee: state, persistence, broadcasting, auto-reveal
src/lib/game/use-player-game Player: join, guesses, mirrors host state
src/lib/realtime.ts          Ably transport + same-browser fallback
src/app/host/[room]          Host screen (lobby, controls, feed, final)
src/app/play/[room]          Player screen
scripts/build-content.ts     Spreadsheet → titles.json + photos
```
