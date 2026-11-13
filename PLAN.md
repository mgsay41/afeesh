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
