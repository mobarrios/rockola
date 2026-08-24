# AGENTS.md

Guidance for OpenCode (and other coding agents) working in this repository.

## Commands

- `npm install` — install deps
- `npm run dev` — dev server on port `3001`
- `npm run build` — production build (lint skipped via `next.config.mjs`)
- `npm start` — serve the standalone build on port `3001` (run `npm run build` first)
- `docker compose up -d --build` — run the container on port `3001` attached to
  the external Docker network `donweb`

> **Port quirk:** port `3000` is occupied on this machine. This project defaults
> to `3001`; Docker images also expose `3001`.
> **Deploy network:** production expects an existing external Docker network
> named `donweb`; create it first if missing with `docker network create donweb`.

## Architecture

- **Next.js 14 (App Router) + TypeScript + Tailwind v3.**
- `app/page.tsx` — the entire game; a single client component (`"use client"`).
  Setup screen (genre / Argentina vs Internacional) and game screen live here.
- `app/api/tracks/route.ts` — server proxy that resolves curated all-time track
  seeds to preview URLs. Resolver tries Deezer first and falls back to iTunes if
  no usable preview is found. Never resolve music data from the browser.
- `app/api/audio/route.ts` — same-origin audio proxy for Deezer/iTunes preview
  URLs. The browser should play `/api/audio?...`, not CDN URLs directly; this
  avoids Deezer CDN 403/CORS/referrer failures seen in incognito/mobile.
- `lib/all-time-tracks.ts` — curated Top 100 all-time seed lists for Argentina
  and Internacional. The game must draw only from these lists.
- `lib/itunes.ts` — historical filename; now resolves curated seeds through
  Deezer with iTunes fallback and normalizes them to the app's `ITunesTrack`
  shape.
- `lib/catalog.ts` — curated `GENRES` (iTunes `genreId` values) and `COUNTRIES`
  (just two: `ar` = "Argentina", `us` = "Internacional"). The country picker is a
  binary Argentina/International choice; edit this list to change the UI options.

## Conventions / gotchas

- **Track selection is client-side**: `app/page.tsx` pulls a resolved pool
  from `/api/tracks`, then builds each round as 1 correct + 4 distractors drawn
  from that pool (no per-round network call). The pool refills when it drops
  below 5 tracks.
- **Audio clues**: each round has two clues from the same preview. First clue is
  2s and keeps a 3-point base; second clue is 4s and drops base scoring to 1.
  `playClue()` chooses random, distinct start offsets inside the Deezer preview,
  waits for `loadedmetadata`, then pauses after the clue duration.
- **Browser autoplay policy**: audio only starts from a user gesture. The
  "Empezar", "Escuchar", and "Siguiente" button clicks are what trigger playback
  — do not move `playClue()` into a non-gesture context (e.g. raw `useEffect`),
  or it will be blocked.
- **Filter nulls/bad previews**: some Deezer/iTunes results have no usable
  preview URL. `lib/itunes.ts` validates previews and discards bad ones. If a
  genre/country combo yields <5 tracks, the UI returns to setup with a "no
  results" notice.
- **All-time source rules**: both Argentina (`ar`) and Internacional (`us`) are
  curated Top 100 all-time lists in `lib/all-time-tracks.ts`. `lib/itunes.ts`
  searches providers for each seed (`artist + title`) and returns only resolved
  previews from those seeds. Do not fall back to live charts; the user wants the
  game to iterate inside those 100-song catalogs.
- **Genre filtering**: when a selected genre has at least 5 curated seeds, use
  only that genre. Do not mix folklore/Latin into Rock just to fill the pool;
  expand the curated list instead if a genre needs more rounds.
- **Pool rules**: every response is **deduped by artist** so no band repeats
  within a game. The game uses 5 unique artists per round and adapts the round
  count to the resolved pool, capped at 10 rounds.
- **Game length/scoring**: `MAX_ROUNDS = 10`. Each round first shows 5 author
  options; after the user selects one, `/api/artist-tracks` loads song options
  for that selected author. Full correct answers earn speed-based points: 5
  points up to 5s, 4 up to 10s, 3 up to 15s, 2 up to 25s, 1 after that. If only
  the artist is correct, the round earns 1 partial point.
- Use plain `<img>` for external artwork; `next/image` would
  require remote domain config.

## References

- Deezer Search API: `https://api.deezer.com/search/track`
- iTunes Search API fallback: `https://itunes.apple.com/search`
