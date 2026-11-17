# Afeesh (أفيش) — Game Plan

A live party game for Egyptian movies and TV shows. The host shares a link or QR code. Players join from their phones with just a name. Each round shows actors one by one, from supporting cast up to the leads, and players race to type the title.

- **Stack:** Next.js (App Router) + TypeScript on Vercel
- **Storage:** no database, no accounts. Content ships as a JSON file inside the app; scores live on the host's phone and players' phones.
- **Live sync:** a hosted realtime channel service (Ably, free tier) — see §3.

---

## 1. Name

Recommended: **Tetrat — تترات** (Egyptian slang for the opening credits). The game is literally "guess the film from its credits", and the spreadsheet already uses the name.

Backups: **Meen El Batal? (مين البطل؟)**, **Afeesh (أفيش)**, **Esm El Film Eh? (اسم الفيلم إيه؟)**, **Kadr (كادر)**.

Tagline idea: «من التترات… اعرف الفيلم» ("From the credits… name the film").

---

## 2. The content we already have (from the spreadsheet)

`Tetrat — Top 100 Egyptian Movies & TV 2000–2016.xlsx` has:

| Sheet | Contents | Status |
|---|---|---|
| Top 100 | 100 titles: 70 movies, 30 TV series, 2000–2016, genres, IMDb rating, IMDb ID | All marked **Keep** |
| Clues | 6 actors per title in clue order (3 supporting → 1 bigger role → 2 leads) | Ready |
| Actors | 300 actors: Arabic + English name, photo link, how many titles they're in | 62 have **no photo** |
| Runners-up | ~200 more titles | Future content packs |
| Removed | Non-Egyptian, documentaries, talk shows | Ignore |

Genre spread is good for hints: Drama 65, Comedy 56, Crime 21, Action 18, Romance 17, Mystery 11.

### Cleanup needed before launch
1. **Rows with notes.** Some titles are flagged: fewer than 6 actors on IMDb (empty clue 1), cast order looks wrong, a Palestinian film that isn't Egyptian, and an obscure indie cast. Fix the order by hand or drop them; a round with empty clues should start at the first filled clue.
2. **Missing photos (62 actors).** Fill from TMDB. If none exists, show a styled initials card (the name still counts as a clue).
3. **Photo sources — important.** 110 photo links point to IMDb/Amazon images. Those aren't licensed for reuse, and hotlinking them can break. Replace with **TMDB** (free with attribution) or **Wikimedia Commons** (check each license). 64 TMDB + 64 Wikimedia links are already fine.
4. **Aliases.** 62 titles have no transliteration. Every title needs a short alias list (Arabic variants, Franco, English) for answer matching — see §6.
5. **Arabic genre labels.** Map IMDb genres to Arabic for hints (Comedy → كوميدي, Drama → دراما, Crime → جريمة…).

### Build-time conversion
A script `scripts/build-content.ts` reads the spreadsheet (exported to CSV) and writes `src/data/titles.json`:

```json
{
  "id": "tt2210441",
  "titleAr": "عسل إسود",
  "titleEn": "Bittersweet",
  "aliases": ["عسل اسود", "assal eswed", "asal eswed"],
  "type": "movie",
  "year": 2010,
  "genres": ["comedy", "drama"],
  "difficulty": "easy",
  "clues": [
    { "nameAr": "جيهانا أنور", "nameEn": "...", "photo": "/actors/....webp" },
    "... 6 items, ordered clue 1 → 6"
  ]
}
```

The script also **downloads every photo once**, resizes to ~240px WebP, and saves it to `public/actors/`. The game then never depends on outside image servers mid-round, and Vercel's CDN serves the images fast.

Difficulty can be computed automatically from IMDb votes (popular = easy) and corrected by hand.

---

## 3. Live connection (the one piece of infrastructure)

Vercel runs serverless functions, so phones can't all hold a connection to "your server" and see each other. We need a small realtime relay. Options:

| Option | Pros | Cons |
|---|---|---|
| **Ably** (recommended) | Free tier covers this easily (6M msgs/month, 200 connections), presence built in (who's in the lobby), auto-reconnect | One external account + API key |
| Pusher | Similar, also free tier | Smaller free limits |
| PeerJS / WebRTC | No service | Some mobile carriers block direct connections; unreliable for parties |

**Model: the host's phone/laptop is the referee.** It holds the game state, checks guesses, keeps the scoreboard, and broadcasts updates. Nothing is stored on a server.

- One channel per room: `room:{CODE}` (e.g. `room:K7QP`).
- A tiny API route `/api/ably-token` issues short-lived tokens, so the API key never reaches the browser.
- Message types:

| From → To | Message | Payload |
|---|---|---|
| Player → Host | `join` | playerId, name, avatar |
| Player → Host | `guess` | playerId, text, roundId |
| Host → All | `state` | full public state (stage, revealed clues, hints, scoreboard) |
| Host → Player | `guess-result` | correct / close / wrong, points |
| Host → All | `reveal` | answer, who got it, points |

The host always sends the **full public state**, never the answer until reveal. A player who refreshes or reconnects just receives the latest state and continues. Players never see the title in their network traffic, so no cheating via dev tools.

---

## 4. Game flow

### Host
1. **Home → "ابدأ لعبة جديدة"**. Pick options: number of rounds (5/10/15), Movies / TV / Both, difficulty, round timer (off / 60s / 90s).
2. **Lobby screen.** Big room code, QR code, and copyable link. Players appear live with a pop-in animation. Host can remove a player.
3. **Round controls** (big buttons, works on a phone or a laptop on a TV):
   - كشف الممثلين ١–٣ → *Reveal stage 1* (3 supporting actors)
   - كشف الممثل ٤ → *Reveal stage 2*
   - كشف الأبطال → *Reveal stage 3* (2 leads)
   - تلميح: النوع → *Hint: genre*
   - تلميح: السنة → *Hint: year*
   - تلميح: فيلم أم مسلسل → *Hint: movie or series* (optional)
   - كشف الإجابة → *Reveal answer*
   - التالي → *Next round* · تخطي → *Skip title*
4. A live guess feed shows each guess with its match score. Host can tap **"قبول" (accept)** on a near-miss to award it manually.
5. After the last round: final podium, confetti, "Play again" (same players, new titles).

The host decides the pace (your original idea). An optional **auto mode** reveals the next stage every N seconds for when the host also wants to play.

### Player
1. Scan QR → `/play/K7QP` → type name, pick an emoji avatar. Name and avatar are remembered on the phone for next time.
2. Wait screen shows other players joining.
3. In a round: actor cards flip in as the host reveals them. Guess box always available at the bottom (thumb-friendly).
4. Instant feedback: ✅ «صح!» + points, 🔥 «قربت!» (close), ❌ «لأ» with a shake. 3 wrong guesses per round max, so nobody spams.
5. After a correct guess, the player's screen shows "you got it — waiting for others", with their rank.

### Round stages
| Stage | Shown | Purpose |
|---|---|---|
| 1 | Clues 1–3 (supporting cast) | Hard — film buffs win here |
| 2 | + Clue 4 (bigger role) | Narrows it down |
| 3 | + Clues 5–6 (leads) | Most people know it now |
| Hints (any time) | Genre, year | Host's choice |

---

## 5. Scoring

| Correct at | Points |
|---|---|
| Stage 1 | 100 |
| Stage 2 | 70 |
| Stage 3 | 40 |
| Each hint already shown | −10 |
| First correct player in the round | +20 |
| Speed bonus (if timer on) | up to +10 |

- Only the first correct guess per player per round counts.
- Wrong guesses cost nothing (the 3-guess limit is the penalty).
- **Where scores live:**
  - Host's browser keeps the official game scoreboard (persisted to localStorage, so a refresh doesn't lose the game).
  - Each player's phone keeps personal stats in localStorage: games played, wins, best score, total correct, longest streak, favorite stage. Shown on the home screen as a little profile card.

---

## 6. Answer matching ("close enough")

Done on the host's device in `lib/match.ts`.

1. **Normalize** both the guess and every alias:
   - أ إ آ ٱ → ا · ة → ه · ى → ي · ؤ → و · ئ → ي
   - Remove tashkeel (diacritics) and tatweel (ـ)
   - Remove leading «ال» from each word, punctuation, extra spaces
   - Lowercase Latin text; Franco digits 3→a, 7→h, 2→a (rough mapping)
2. **Compare** against title + all aliases using normalized Levenshtein similarity (plus a token-overlap check for long titles):
   - ≥ 0.80 → **correct**
   - 0.65–0.80 → **close 🔥** (player is told, host can accept)
   - below → wrong
3. Very short titles (≤ 4 letters) require an exact normalized match, so random guesses don't slip through.
4. Unit tests with real examples: «عسل اسود» ✓, «الفيل الازرق» ✓, «فيل ازرق» ✓, «assal eswed» ✓, «عمارة يعقوبيان» vs «عماره يعقوبين» ✓.

---

## 7. Screens and routes

| Route | Screen |
|---|---|
| `/` | Landing: logo animation, "New game" (host), "Join with code", personal stats card |
| `/host/[room]` | Lobby → round control → round results → final podium |
| `/play/[room]` | Name entry → waiting → round (cards + guess box) → result |
| `/join` | Enter a room code manually |
| `/about` | How to play, credits, TMDB attribution (required by TMDB) |
| `/api/ably-token` | Issues realtime tokens |

The host screen has two layouts: **phone controller** and **TV/big-screen view** (`?view=screen`) showing only the cards, hints, and scoreboard at large size. Open the TV view on a laptop connected to the TV and control from the phone.

---

## 8. Visual style and animation

### Look: "Cairo cinema neon"
- Dark plum/navy background (`#120A24`) with soft animated gradient blobs.
- Accents: magenta `#FF3D8B`, sunset orange `#FF9F1C`, teal `#2EC4B6`, gold `#FFD166` for winners.
- **Cards shaped like movie tickets / film frames**, with perforated edges and a subtle film-grain overlay.
- Fonts: **Lalezar** or **Rakkas** for big Arabic headings (poster feel), **Cairo** or **Tajawal** for text. Arabic-first, full RTL.
- Rounded, chunky buttons with a press-down effect — feels like a game, not a form.
- Light mode is optional; this is a party game, dark looks best on a TV.

### Animations (Motion / Framer Motion)
| Moment | Animation |
|---|---|
| Landing | Logo appears like a projector flicker; credits-style text scroll |
| Player joins | Avatar bubble pops into the lobby with a spring bounce |
| Round start | Clapperboard snap + "Round 3/10" slides in |
| Actor reveal | Card flips 3D from the back (film reel pattern) to the photo; leads get a golden glow and spotlight sweep |
| Hint shown | Hint chip drops in with a stamp effect (genre icon, year) |
| Correct guess | Green burst, +points number flies up to the score; host feed highlights the name |
| Close guess | Orange 🔥 pulse |
| Wrong guess | Input shakes |
| Answer reveal | Title written like a movie poster title, curtain wipe |
| Scoreboard | Rows re-order with layout animation, rank arrows ▲▼ |
| Game end | Podium rises, confetti (canvas-confetti), winner crown |

Respect `prefers-reduced-motion` (swap flips/confetti for fades).

### Sound (mutable)
Short clips: card flip, ding (correct), buzz (wrong), drumroll before answer reveal, applause at the end. Off by default on player phones, on for the host/TV view.

---

## 9. Tech stack

| Need | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS v4 with CSS-variable tokens + shadcn/ui |
| Animation | Motion (`motion/react`) |
| Realtime | Ably (`ably` SDK) + token route |
| State | Zustand (+ persist middleware for host and player stats) |
| QR code | `qrcode.react` |
| Matching | Custom normalizer + `fastest-levenshtein` |
| Effects | `canvas-confetti`, `use-sound` |
| Content build | Node script using `xlsx` / CSV parser + `sharp` for photos |
| Tests | Vitest (matcher, scoring, state reducer), Playwright (2-browser game test) |
| Hosting | Vercel (one env var: `ABLY_API_KEY`) |
| PWA | Web manifest + icons, so it can be added to the home screen |

### Folder layout
```
src/
  app/
    page.tsx                 landing
    host/[room]/page.tsx     host
    play/[room]/page.tsx     player
    join/page.tsx
    about/page.tsx
    api/ably-token/route.ts
  components/
    game/ActorCard, ClueRow, HintChip, GuessInput, Scoreboard, Podium, Lobby, QrShare
    ui/                      shadcn components
  lib/
    realtime.ts              Ably channel helpers + message types
    game-engine.ts           pure reducer: state + action → new state
    scoring.ts
    match.ts                 Arabic normalize + similarity
    room-code.ts
  stores/
    host-store.ts            game state (persisted)
    player-store.ts          name, avatar, lifetime stats (persisted)
  data/
    titles.json              generated
public/actors/               generated photos
scripts/build-content.ts
```

The game logic is one **pure reducer** (`game-engine.ts`), so it's easy to test without any network and the host just runs actions through it and broadcasts the result.

---

## 10. Build phases

### Phase 0 — Content (½–1 day)
- Export Clues + Top 100 + Actors to CSV, write `build-content.ts`.
- Replace IMDb photo links with TMDB/Wikimedia, fill missing photos, download to `public/actors/`.
- Fix flagged rows, add aliases, Arabic genres, difficulty.
- **Done when:** `titles.json` has ~95–100 clean titles, every clue has a photo or initials fallback.

### Phase 1 — Single-device prototype (1–2 days)
- Project scaffold, theme tokens, fonts, RTL.
- Host screen only: pick a random title, reveal stages, hints, type a guess locally, reveal answer.
- Actor card flip, hint chips, answer reveal animation.
- Matcher + unit tests.
- **Done when:** you can play a round alone and the reveal feels good.

### Phase 2 — Live rooms (2 days)
- Ably token route, room codes, QR + share link.
- Player join flow, lobby with presence.
- Host broadcasts state; players see cards in sync; guesses flow to host.
- Reconnect handling (refresh mid-game resumes).
- **Done when:** host + 3 phones can play a full game.

### Phase 3 — Scoring and stats (1 day)
- Scoring rules, first-correct bonus, 3-guess limit, host manual accept.
- Round results + animated scoreboard + final podium.
- Player lifetime stats in localStorage.

### Phase 4 — Polish (1–2 days)
- TV view, sounds, confetti, reduced-motion, PWA, landing animations.
- `/about` with TMDB credit and how-to-play.
- Playwright test: two browser contexts (host + player) play a round.
- Deploy to Vercel, test on real phones over mobile data.

**Total: roughly 7–9 working days for a polished v1.**

---

## 11. Edge cases to handle

- Host closes the tab → state is in localStorage; reopening `/host/K7QP` restores the game and players reconnect automatically.
- Host's phone sleeps → show a "keep screen on" tip; use the Wake Lock API on the host screen.
- Two players with the same name → append a number («أحمد ٢»).
- Late joiner → joins with 0 points from the next round.
- Player tries to guess after the answer is revealed → ignored by host.
- Same title twice in one session → host tracks used title IDs (also persisted, so "Play again" picks new ones).
- Image fails to load → initials card fallback.
- Ably free-tier limits → far above what a party needs; show a friendly error if the connection fails.

---

## 12. Ideas for later

- **Content packs** from the Runners-up sheet: 90s classics, Ramadan series, comedy-only, Adel Imam special.
- **Solo daily mode** (Wordle style): one title per day, same for everyone, shareable emoji result like `تترات #42 🎬🟥🟥🟩`.
- **Stills round:** a blurred scene image that sharpens each stage.
- **Steal round:** if nobody gets it, first correct answer after the leads reveal gets half points.
- **Teams mode** for big gatherings.
- **Host-made packs:** host pastes their own list (stored only in their browser).
- **Shareable result card** at the end (generated image with the podium).

---

## 13. Decisions to confirm before building

1. Name: **Tetrat**?
2. Realtime: **Ably** OK (one free account needed)?
3. Should the **host also play**, or only control? (Affects auto-reveal mode priority.)
4. Language: Arabic UI only, or an Arabic/English toggle?
5. Allow guesses in **English/Franco** too, or Arabic only?

---

## 14. Game 2 — «٥ في ٣٠» (Five in Thirty)

The app becomes a set of games. The host picks a game first, then its settings. Game 1 (Tetrat) stays exactly as it is.

**Rules (decided):**
- Everyone plays **at the same time**. Each round shows one random actor (photo + name). Every player has **30 seconds** to type **5 movies or TV shows** that actor was in.
- Each title is checked **on submit**: ✅ counts toward the 5, ❌ / 🔥 (close) lets them try another. A player is done at 5 correct or when time runs out.
- **Scoring:** 20 per correct title · +20 for all 5 · time bonus up to +10 for finishing early (+1 per 3 s left).
- **Host override («صح» button):** if TMDB is missing a title, the host can mark a rejected entry as correct — see "Host override" below.
- Same referee model as game 1: the host device holds the actor's filmography, judges every entry and broadcasts only public state. Players never receive the title list before the round ends.

### Key design decisions
| Topic | Decision |
|---|---|
| Where filmographies come from | **Wikidata at build time** (`npm run filmography`, no API key; TMDB needs one and wasn't set up). Arabic titles for ~all works. Our 98 titles are too few: only 28 actors appear in 5+ of them. Built: 117 actors, ~2,900 works, 271 KB. Thin for younger actors and TV, which is what the host override is for. |
| Data file | `src/data/filmography.json`, host-only import (like `titles.ts`). Per actor: `id, nameAr, nameEn, photo, works[{id, titleAr, titleEn, original, aliases, type, year, popularity}]`. |
| Actor pool | Actors with a photo and **≥ 10 works** (was 15; Wikidata is thinner than TMDB), so naming 5 is fair. Start from the game-1 actors. Game 2 has no movie/TV filter: any work counts. |
| Data gaps | `content/filmography-overrides.json` to add missing works, Arabic titles and aliases, and to pin the right TMDB person when names collide. Host "accept" is the live safety net. |
| Matching | Reuse `judgeGuess` from `src/lib/arabic.ts` against every name of every work. One entry counts once; two entries for the same work count once. |
| Game type | `game: "tetrat" \| "five"` on `GameState`, `PublicState` and settings. Saved games without it default to `"tetrat"`. Lobby, scoreboard, podium, profile, room code and transport are shared. |
| Realtime | Reuse the existing `guess` message and `result` reply; the host routes by `state.game`. No new channels. |
| Timer | Host is the clock. Public state carries `msLeft` (same pattern as `autoMsLeft`). Entries arriving up to 1 s after the deadline still count (network delay). |
| Anti-spam | Max 15 entries per player per round. Wrong entries cost nothing else. |

### Host override — when TMDB is missing a title
Our data will never be complete, so the host is the final judge.

- **When:** any time during the round, and on a **review step** after the timer ends. The scoreboard only shows after the host taps «عرض النتائج», so there is time to fix answers.
- **How:** the host sees each player's rejected (❌ / 🔥) entries with a «صح ✔» button. Tapping it:
  - turns the entry ✅ on the player's phone and adds 20 points (plus the 5/5 bonus if it makes 5; the time bonus uses the moment the entry was first sent, not when the host tapped);
  - also accepts the **same title from other players** in that round (normalized match), so the host doesn't tap it twice.
- **Undo:** «تراجع» on an accepted entry removes it and its points, in case of a mis-tap. Works until the next round starts.
- **Remembered:** accepted titles are saved on the host device (localStorage, per actor). The next time that actor comes up, that title is accepted automatically.
- **Fix the data for everyone:** the final screen has a «نسخ العناوين الناقصة» button that copies the accepted titles as JSON, ready to paste into `content/filmography-overrides.json`.
- Only the host can do this. A player can't mark their own answer, same trust rule as game 1.

### Phase 5 — Game picker + multi-game plumbing (½–1 day)
- Add `GameKind` and per-game settings to `src/lib/game/types.ts`; default old saves to `"tetrat"`.
- Home (`src/app/home-client.tsx`): game cards first («تترات» / «٥ في ٣٠»), then that game's settings (game 2: rounds 5/10/15, pool movies/TV/both).
- `host-client.tsx` and `play-client.tsx`: switch the round view on `state.game`; lobby, scoreboard and final stay shared.
- Game 2 card shows "قريبًا" until Phase 8 lands.
- **Done when:** game 1 plays exactly as before; existing tests pass.

### Phase 6 — Filmography content (1–2 days, the riskiest part)
- New script `scripts/build-filmography.ts` (`npm run filmography`, needs `TMDB_API_KEY`):
  - Find each actor's TMDB person id (cache in `content/tmdb-people.json`, reuse the Arabic-work check from `build-content.ts`).
  - Pull combined credits in `ar` and `en`; keep acting credits only; drop talk shows, news, award shows and "Himself/Herself" roles.
  - Arabic title = TMDB Arabic translation, else `original_title` when it is Arabic.
  - Apply overrides; print a report of actors with low Arabic-title coverage or under 15 works.
- Hand-fix the top ~50 most famous actors' gaps via the overrides file.
- **Done when:** ≥ 80 actors in the pool, most works have an Arabic title, JSON stays small enough to load on the host only (< ~400 KB).

### Phase 7 — Game 2 engine, pure and tested (1 day)
- `src/lib/game/five-engine.ts`: `startRound` (random unused actor, deadline = now + 30 s), `submitEntry`, `endRound`, `acceptEntry`, `toPublicFive`.
- Rules as testable statements:
  - An entry after deadline + 1 s → `late`.
  - A player with 5 correct → further entries `already`.
  - Two entries matching the same work → second is `duplicate`, no points.
  - Score = 20 × correct + 20 if 5 + `min(10, floor(secondsLeft / 3))` when the 5th lands.
  - Accepting a rejected entry adds 20 (and the 5/5 bonus if it makes 5); the time bonus uses the entry's original timestamp.
  - Accepting an entry also accepts other players' entries for the same normalized title in that round.
  - Undo of an accepted entry removes exactly the points it added; not allowed once the next round starts.
  - A title in the host's remembered list for this actor is judged `correct` automatically.
  - Accept/undo requests from anyone but the host are ignored.
  - Public state before round end contains no works list; after end it shows each player's titles and 5 well-known titles nobody said.
- Vitest cases with real Egyptian titles and spellings.
- **Done when:** all engine tests pass.

### Phase 8 — Screens + live play (1–2 days)
- **Host / TV:** big `ActorCard`, countdown ring, every player's 0/5 progress live, buttons: start round · end early · next actor.
- **Host controller — override:** rejected entries list with «صح ✔» / «تراجع», a review step after the timer, «عرض النتائج» to move on, remembered accepts in localStorage (`src/lib/game/room.ts`, next to `getUsedTitles`), and «نسخ العناوين الناقصة» on the final screen. The TV view never shows entry titles during the round.
- **Player:** actor photo, countdown, input that clears on submit, 5 slots that fill ✅, shake on ❌, 🔥 for close.
- **Round end:** everyone's titles + "you could've said…" list, then the shared scoreboard; final podium and profile stats reused.
- Host plays too (judged locally, like game 1).
- **Done when:** host + 3 phones play a full 5-round game over Ably.

### Phase 9 — Polish (½–1 day)
- Tick sound in the last 5 s, buzzer at 0, confetti on 5/5; reduced-motion fallbacks.
- `/about`: how to play both games.
- Playwright: host + player play one round of game 2.
- Deploy and test on real phones over mobile data.

**Total: roughly 5–7 working days.**

### Risks
- **Data completeness** is the whole game: if TMDB misses an Egyptian series, a correct answer gets rejected. Mitigations: host «صح» override (remembered per actor), copy-to-overrides button, start with well-covered actors.
- **Name collisions on TMDB** (two people called أحمد سعيد): pin ids in overrides.
- **Simultaneous play on one TV:** players could copy answers they see on the host screen. The TV shows only counts (✅ 3/5) during the round, never the titles.

---

## 15. Games 3–8

> **Status (built):** all six games play end to end, host + a second player, in the browser. Lint, types, 57 tests and the production build pass.
>
> | Phase | Result |
> |---|---|
> | 10 Registry | `games.ts` (metadata, shared with phones) + `registry.ts` (host-only data and dispatch) instead of one registry object. 8 cards on the picker. |
> | 11 TMDB data | `npm run casts` → `src/data/casts.json` (1,405 of 1,618 works = 87% have a cast; 3,461 people; 95% of top-billed names are Arabic, 73% overall; posters and years). Works Wikidata has no TMDB id for are found by a title search that must also match the year (±1). |
> | 12–13 Quiz | `quiz-engine.ts` + generators. «قبل ولا بعد؟» draws from 713 works with posters; «مين مش منهم؟» has 97 questions (outsider checked against TMDB cast **and** the actor's own filmography). |
> | 14 الرابط المشترك | `npm run link-puzzles` → 218 puzzles from 109 actors; the first three works share exactly one billed actor. Runs on game 1's engine unchanged (puzzles are built as `Title`s). |
> | 15 الإفيه | Runs on game 1's engine. **65 lines** (50 from films/series of 2000–2010), not the planned 120; each film + speaker was stated by an article. A game uses one line per film. Needs your review, and more lines: add them to `src/data/quotes.json`. |
> | 16 بانتومايم | Encrypted title (ECDH + AES-GCM, `src/lib/crypto.ts`); verified that the performer's phone shows it. Deck is the Top 100 + each actor's top 3 works. |
> | 17 سلسلة | Hearts, 15 s turns, repeats refused, host can accept a refused answer live. A wrong try doesn't cost a heart until the 5th (so host-accept still works mid-turn). |
> | 18 Polish | **Not done:** «رتّبهم» variant, sounds, Playwright smoke tests, real phones over Ably (game 2 as well). About page now has the rules of all 8 games. |

Six more games. They fall into **three families**, so we build one engine per family, not one per game:

| Family | Games | How players answer | Built on |
|---|---|---|---|
| **A. Quiz (tap)** | 3 «قبل ولا بعد؟» · 4 «مين مش منهم؟» | Tap one of 2–4 choices | New `quiz-engine.ts` (shared) |
| **B. Staged clues (type)** | 5 «الرابط المشترك» · 6 «الإفيه» | Type the answer; clues reveal in 3 stages | Game 1's stage engine, generalized |
| **C. Turns** | 7 «بانتومايم» · 8 «سلسلة» | One player at a time | New `turns.ts` helpers + one engine each |

Same rules for all: the host device is the referee, holds the answers and broadcasts only public state. Lobby, room code, QR, scoreboard, podium, profile stats and the host «صح ✔» override are shared.

### Rules (defaults: change any before its phase starts)

**3 · قبل ولا بعد؟ (Before or after?)**
- Two titles side by side (poster + name). Everyone taps the one that came out **first**. 10 questions, 10 s each.
- Points: 100 for correct + up to 50 for speed. Wrong = 0.
- Difficulty by year gap: easy ≥ 15 years, medium 5–14, hard 1–4. Never the same year.
- Variant for the polish phase: «رتّبهم», ordering 4 titles (points per title in the right slot).

**4 · مين مش منهم؟ (Odd one out)**
- Four actor photos + names. Three were in the same title; tap the one who wasn't. 10 questions, 15 s each.
- Points: same as game 3. The reveal shows the title the other three share.
- The outsider must be checked against the **full cast** (not only our 6 clue actors), otherwise a correct-but-uncredited actor becomes a wrong answer.

**5 · الرابط المشترك (The common link)**
- Stage 1: two titles; stage 2: a third title; stage 3: a fourth title + the actor's initials. Type the **actor** they all share.
- Points 100 / 70 / 40, first correct +20, 3 misses per round. Exactly game 1's flow, with the answer being an actor.
- Generated from the filmography: pick an actor, take 4 of their works ordered least → most famous, and keep the puzzle only if **no other actor** in our data was in all of the stage-1 titles.

**6 · الإفيه (The catchphrase)**
- Stage 1: a famous line (text). Stage 2: year + genre. Stage 3: the actor who said it. Type the **title**.
- Points 100 / 70 / 40, first +20, 3 misses. Reuses game 1's engine and matching unchanged; only the clues differ.
- Content: ~150 lines, each linked to a title (see Phase 15).

**7 · بانتومايم (Charades)**
- Players take turns as the **performer**. Only the performer's phone shows the secret title (type + word count are shown to everyone, as in real charades). They act it out silently for **60 s**.
- Everyone else types guesses on their phones (auto-checked, like game 1).
- Points: first correct guesser 50–100 by speed; performer +50 if anyone gets it. One «تخطّي» (skip) per turn.
- Each player performs once per cycle; the host picks 1–3 cycles.
- Titles: our 98 + the most famous works from the filmography (~300). No-speaking is on the honor system.

**8 · سلسلة (Chain)**
- Starts from a random famous title. Players take turns, **15 s** each, alternating: name an **actor** from the current title → the next player names **another title** with that actor → an actor from that title → …
- No repeats in a chain. A wrong answer or timeout loses a ❤️ (3 each). Out at 0; last player standing wins.
- Points: 10 per link, +50 to the winner.
- The host «صح ✔» override works here too (live, during the 15 s), since cast data will have gaps.

### Shared design decisions

| Topic | Decision |
|---|---|
| Game registry | Replace the `if (game === "five")` branches with `src/lib/game/registry.ts`: per game `{ start, onMessage, publicOf, timer }`. Games 1 and 2 move onto it first, with no behavior change. |
| State | `GameState` keeps one optional slot per family (`quiz?`, `round` for staged, `turn?`), not one per game. `Settings.game` grows to all 8 kinds. |
| New messages | `ToHost: { type: "pick", qIndex, choice }` for taps. `ToPlayers: { type: "secret", to, box }` for the charades title. |
| Charades secret | All messages go over one shared channel, so a plain "secret" could be read by anyone in dev tools. Each player makes an ECDH key pair (WebCrypto, built into browsers) and sends the public key in `join`; the host encrypts the performer's title with it (AES-GCM). About 40 lines, no new dependency. |
| Timers | Host is the clock everywhere (`msLeft` in public state, +1 s network grace), same as game 2. Reuse `FiveTimer` / `useCountdown` from `five-view.tsx`. |
| Home picker | 8 cards: 2 columns on phones, 4 on desktop. Each card opens only its own settings (rounds / time per turn / cycles). |
| Repeats | Reuse `getUsedTitles` / `addUsedTitles` with one localStorage key per game, so a host doesn't see the same questions twice in a row. |
| Data on players' phones | Still none. Players import only types; every question, title and cast stays on the host. |

### Data: what each game needs

| Game | Data we have now | What's missing | Source |
|---|---|---|---|
| 3 قبل ولا بعد | 98 titles with year; 2,564 of 2,937 works have a year | Posters (nice, not required) | **TMDB** |
| 4 مين مش منهم | 98 titles × 6 clue actors, 274 actors with photos | Full casts to verify the outsider | **TMDB** credits (Wikidata as fallback) |
| 5 الرابط المشترك | 117 actors, 357 works shared by 3+ of them | Full casts for the uniqueness check; posters | **TMDB** |
| 6 الإفيه | Titles and actors | ~150 famous lines, each linked to a title | **Browser research** + your review |
| 7 بانتومايم | ~300 well-known titles | Nothing | — |
| 8 سلسلة | 736 works with 2+ of our actors | Full casts with **Arabic names**, beyond our 117 actors | **TMDB** credits + Wikidata Arabic labels |

**TMDB, how we'll use it:**
- Key in `.env.local` as `TMDB_API_KEY`, used **only by build scripts** (never shipped to phones).
- Match without guessing: our titles have IMDb ids (TMDB `/find`), and Wikidata works carry TMDB ids (properties P4947 movie / P4983 TV), so we never fuzzy-search by name.
- Pull per work: top ~15 cast, poster path, release date, Arabic title. Arabic actor names: from Wikidata labels via the TMDB person id (P4985), falling back to TMDB translations.
- Output: `src/data/casts.json` (host-only). Posters load from `image.tmdb.org` (configure the image host in `next.config` as the Next 16 docs require).
- TMDB's terms need an attribution line + logo on `/about`.

### Phase 10 — Game registry + shared pieces (1 day) · no TMDB needed
- `registry.ts`; move games 1 and 2 onto it. `Settings.game` gets all 8 kinds; cards for unbuilt games show «قريبًا».
- Shared UI: `ChoiceGrid` (2/4 big tap buttons, locked after tap, ✅/❌ on reveal), `TurnBanner` (whose turn, hearts, countdown).
- `pick` message + host routing; `getUsedTitles` per game key.
- **Done when:** games 1 and 2 play exactly as before; all 33 tests pass; the picker shows 8 cards.

### Phase 11 — TMDB data (1 day) · needs your API key
- `scripts/build-casts.ts` (`npm run casts`): cast, posters, years and Arabic titles for our 98 titles + 1,600 works, cached in `content/tmdb-cache.json` so reruns are fast and offline.
- Fill missing years in `filmography.json`; report works TMDB couldn't find.
- **Done when:** ≥ 90% of works have a cast list, ≥ 80% of cast members have an Arabic name, and `casts.json` stays under ~600 KB.

### Phase 12 — Quiz engine + game 3 «قبل ولا بعد؟» (1 day)
- `quiz-engine.ts`: question → choices → everyone taps → lock at 0 s → reveal → next. Scoring: 100 + speed bonus.
- `before-after.ts`: generate pairs by difficulty from years; posters when available.
- Tests: tap after deadline + grace = late, one tap per question, speed bonus math, no answer in public state before the reveal.
- **Done when:** host + 2 tabs play 10 questions.

### Phase 13 — Game 4 «مين مش منهم؟» (½ day)
- `odd-one-out.ts`: pick a title with 3+ photo actors, an outsider with a photo who is **not** in that title's full cast, shuffle.
- Reuses the quiz engine and `ChoiceGrid` with `ActorCard` photos.
- **Done when:** 50 generated questions spot-checked by hand have no outsider who was actually in the film.

### Phase 14 — Game 5 «الرابط المشترك» (1 day)
- Generalize game 1's engine so the answer can be an actor (`answer: { kind: "title" | "actor", names[] }`) and a stage clue can be a list of titles.
- `link.ts`: puzzle generator with the uniqueness check; pre-generate ~200 puzzles at build time into `src/data/link-puzzles.json` (host-only).
- **Done when:** game 1 tests still pass and new tests cover actor answers + uniqueness.

### Phase 15 — Game 6 «الإفيه» (1–1½ days, mostly content)
- I research famous Egyptian movie/series catchphrases in the browser and write `content/quotes.json` (`{ line, titleId, actor }`). Only short one-liners, and each one is checked against at least one source for the right title and actor.
- **You review the list** before it ships (wrong attributions would spoil the game).
- `quote.ts`: wraps the staged engine (stage 1 line · 2 year + genre · 3 actor).
- **Done when:** ≥ 120 reviewed lines; 10-round game plays.

### Phase 16 — Game 7 «بانتومايم» (1½ days)
- `turns.ts`: turn order, current player, per-turn deadline, skip, cycles.
- `charades.ts`: secret title per turn, guesses judged with game 1's matcher, scoring.
- ECDH key in `join` (`src/lib/crypto.ts`), `secret` message, decryption on the performer's phone.
- Performer screen: big title, type, «تخطّي». Everyone else: who's performing, word count, timer, guess box. TV: same, never the title.
- **Done when:** the title is unreadable in other tabs' message logs; a full cycle with 3 players plays.

### Phase 17 — Game 8 «سلسلة» (1½ days)
- `chain.ts` on `turns.ts`: alternating actor/title links, validation against `casts.json` (actor in cast of current title; title in actor's works), no repeats, hearts, elimination, host override live.
- Players see the whole chain growing; only the current player's input is active.
- **Done when:** tests cover valid/invalid links, repeats, timeout, override and last-player-wins; 3 tabs play to a winner.

### Phase 18 — Polish (1 day)
- «رتّبهم» variant for game 3; sounds (tick, buzzer, correct) shared by all games; `/about` rules for games 3–8 + TMDB attribution.
- Playwright: one smoke test per family (quiz, staged, turns).
- Real phones over Ably (also covers game 2, still untested there).

**Total: roughly 9–11 working days.** Phases 10, 12, 16 don't need TMDB and can start right away; 11 unblocks 13, 14 and 17.

### Risks
- **Cast data with Arabic names** is the weak point for «سلسلة»: TMDB often has English-only names for Egyptian actors. Mitigation: Wikidata Arabic labels, aliases in overrides, host override live.
- **Charades on one shared channel** needs the encryption step above; skipping it leaks the title to anyone curious enough to open dev tools.
- **Quote attribution** errors are easy to make; every line needs a source and your review.
- **Turn-based games and disconnects:** if the current player drops, their turn times out normally and the game moves on; a player who rejoins keeps their place.
- **Home screen with 8 games** may feel crowded on phones; keep cards short (icon + name + one line).
