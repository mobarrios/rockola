"use client";

import { useRef, useState } from "react";
import { GENRES, COUNTRIES } from "@/lib/catalog";

interface ITunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  previewUrl: string | null;
  artworkUrl100: string;
  primaryGenreName: string;
}

type Screen = "setup" | "game" | "finished";

const MAX_ROUNDS = 10;
const TRACKS_PER_ROUND = 5;
const FIRST_CLUE_SECONDS = 2;
const SECOND_CLUE_SECONDS = 4;
const MAX_ROUND_POINTS = 5;
const ROUND_TIME_LIMIT = 30;

interface RoundState {
  correct: ITunesTrack;
  artistOptions: ITunesTrack[];
}

interface RoundResult {
  speed: number;
  artist: number;
  song: number;
  elapsedSeconds: number;
  total: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function artwork300(url: string): string {
  return url.replace("100x100", "300x300");
}

function audioSource(url: string): string {
  if (url.startsWith("/api/audio")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const token = btoa(unescape(encodeURIComponent(url)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    return `/api/audio?token=${token}`;
  }
  return url;
}

function artistKey(track: ITunesTrack): string {
  return track.artistName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueByArtist(tracks: ITunesTrack[]): ITunesTrack[] {
  const seen = new Set<string>();
  const out: ITunesTrack[] = [];
  for (const t of tracks) {
    const key = artistKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function uniqueSongTitles(tracks: ITunesTrack[]): ITunesTrack[] {
  const seen = new Set<string>();
  const out: ITunesTrack[] = [];
  for (const t of tracks) {
    const key = t.trackName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function pickFiveUniqueArtists(tracks: ITunesTrack[]): ITunesTrack[] {
  return uniqueByArtist(shuffle(tracks)).slice(0, 5);
}

function speedPoints(elapsedSeconds: number): number {
  if (elapsedSeconds <= 5) return 5;
  if (elapsedSeconds <= 10) return 4;
  if (elapsedSeconds <= 15) return 3;
  if (elapsedSeconds <= 25) return 2;
  return 1;
}

function playableRounds(trackCount: number): number {
  return Math.min(MAX_ROUNDS, Math.floor(trackCount / TRACKS_PER_ROUND));
}

function Waveform({ active }: { active: boolean }) {
  const bars = [16, 26, 14, 32, 20, 36, 18, 28, 16, 34];
  return (
    <div
      className={`mt-3 flex h-11 w-full max-w-xl items-center justify-center gap-1.5 rounded-2xl border px-3 transition ${
        active
          ? "border-orange-200 bg-orange-50 shadow-inner"
          : "border-slate-200 bg-white/70"
      }`}
      aria-label={active ? "La pista está sonando" : "La pista está detenida"}
    >
      {bars.map((height, index) => (
        <span
          key={index}
          className={`w-1.5 rounded-full bg-orange-500 transition-all ${
            active ? "animate-wave opacity-100" : "opacity-30"
          }`}
          style={{
            height: active ? height : 8,
            animationDelay: `${index * 90}ms`,
          }}
        />
      ))}
      <span className="ml-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
        {active ? "Sonando" : "Listo"}
      </span>
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [genre, setGenre] = useState(GENRES[0].id);
  const [country, setCountry] = useState(COUNTRIES[0].code);

  const [round, setRound] = useState<RoundState | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<number | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [songOptions, setSongOptions] = useState<ITunesTrack[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [clueLevel, setClueLevel] = useState<1 | 2>(1);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [roundNo, setRoundNo] = useState(0);
  const [totalRounds, setTotalRounds] = useState(MAX_ROUNDS);
  const [loading, setLoading] = useState(false);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_LIMIT);
  const [timerActive, setTimerActive] = useState(false);

  const deckRef = useRef<ITunesTrack[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clueStartsRef = useRef<{ first?: number; second?: number }>({});
  const roundStartedAtRef = useRef<number>(Date.now());

  function randomStart(duration: number, seconds: number, avoid?: number): number {
    const max = Math.max(0, duration - seconds - 0.5);
    if (max <= 0) return 0;
    for (let i = 0; i < 10; i++) {
      const start = Math.random() * max;
      if (avoid === undefined || Math.abs(start - avoid) > seconds + 1) return start;
    }
    return Math.random() * max;
  }

  function prepareAudio(previewUrl?: string | null) {
    const el = audioRef.current;
    if (!el || !previewUrl) return;
    const src = audioSource(previewUrl);
    setAudioReady(false);
    setAudioError(null);
    if (el.getAttribute("src") !== src) {
      el.src = src;
      el.load();
    }
  }

  function startRoundTimer() {
    if (timerActive) return;
    setTimeLeft(ROUND_TIME_LIMIT);
    setTimerActive(true);
    countdownRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setTimerActive(false);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function handleTimeUp() {
    if (revealed || !round) return;
    setRevealed(true);
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    const result = {
      speed: 0,
      artist: 0,
      song: 0,
      elapsedSeconds: ROUND_TIME_LIMIT,
      total: 0,
    };
    setRoundResult(result);
    setStreak(0);
  }

  function clearRoundTimer() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    setTimerActive(false);
    setTimeLeft(ROUND_TIME_LIMIT);
  }

  function playClue(level: 1 | 2, previewUrl?: string) {
    const el = audioRef.current;
    if (!el) return;
    const url = previewUrl ?? round?.correct.previewUrl;
    if (!url) return;
    const src = audioSource(url);
    if (timerRef.current) clearTimeout(timerRef.current);
    setAudioError(null);
    setIsPlaying(false);
    if (el.getAttribute("src") !== src) {
      el.src = src;
      el.load();
    }
    const seconds = level === 1 ? FIRST_CLUE_SECONDS : SECOND_CLUE_SECONDS;
    const startTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsPlaying(true);
      timerRef.current = setTimeout(() => {
        el.pause();
        setIsPlaying(false);
      }, seconds * 1000);
    };
    const seekToClue = () => {
      const starts = clueStartsRef.current;
      const key = level === 1 ? "first" : "second";
      const avoid = level === 2 ? starts.first : starts.second;
      if (starts[key] === undefined) starts[key] = randomStart(el.duration, seconds, avoid);
      el.currentTime = starts[key] ?? 0;
    };
    if (level === 1) startRoundTimer();
    if (el.readyState >= 1) {
      seekToClue();
      void el.play().then(startTimer).catch(() => {
        setIsPlaying(false);
        setAudioError("El navegador bloqueó la reproducción. Usá el control de audio o tocá la pista otra vez.");
      });
      return;
    }

    const onMetadata = () => {
      seekToClue();
      startTimer();
    };
    el.addEventListener("loadedmetadata", onMetadata, { once: true });
    void el.play().catch(() => {
      el.removeEventListener("loadedmetadata", onMetadata);
      setIsPlaying(false);
      setAudioError("El navegador bloqueó la reproducción. Usá el control de audio o tocá la pista otra vez.");
    });
  }

  async function refill(): Promise<number> {
    setLoading(true);
    try {
      const params = new URLSearchParams({ genre, country });
      const res = await fetch(`/api/tracks?${params.toString()}`);
      const data = await res.json();
      deckRef.current = uniqueByArtist(data.tracks ?? []);
      return deckRef.current.length;
    } finally {
      setLoading(false);
    }
  }

  async function generateRound() {
    clearRoundTimer();
    if (deckRef.current.length < TRACKS_PER_ROUND) await refill();
    if (deckRef.current.length < TRACKS_PER_ROUND) {
      setNoResults(true);
      setScreen("setup");
      return false;
    }
    const nextFive = pickFiveUniqueArtists(deckRef.current);
    if (nextFive.length < TRACKS_PER_ROUND) {
      setNoResults(true);
      setScreen("setup");
      return false;
    }
    const [correct, ...distractors] = nextFive;
    const used = new Set(nextFive.map(artistKey));
    const options = [correct, ...distractors];
    deckRef.current = deckRef.current.filter((t) => !used.has(artistKey(t)));
    setRound({
      correct,
      artistOptions: shuffle(options),
    });
    setSelectedSongId(null);
    setSelectedArtist(null);
    setSongOptions([]);
    setRevealed(false);
    setClueLevel(1);
    setRoundResult(null);
    setIsPlaying(false);
    setAudioReady(false);
    setAudioError(null);
    clueStartsRef.current = {};
    roundStartedAtRef.current = Date.now();
    setRoundNo((n) => n + 1);
    setTimeout(() => prepareAudio(correct.previewUrl), 0);
    return true;
  }

  async function chooseArtist(artist: string) {
    if (!round || revealed) return;
    const selectedArtistSeed = round.artistOptions.find(
      (opt) => opt.artistName === artist
    );
    setSelectedArtist(artist);
    setSelectedSongId(null);
    setSongOptions([]);
    setLoadingSongs(true);
    try {
      const params = new URLSearchParams({ artist });
      const res = await fetch(`/api/artist-tracks?${params.toString()}`);
      const data = await res.json();
      const tracks = uniqueSongTitles([
        ...(selectedArtistSeed ? [selectedArtistSeed] : []),
        ...(data.tracks ?? []),
      ]);
      const isCorrectArtist = artist === round.correct.artistName;
      const options = isCorrectArtist
        ? shuffle([
            round.correct,
            ...uniqueSongTitles(
              tracks.filter((t) => t.trackId !== round.correct.trackId)
            ).slice(0, 4),
          ])
        : tracks.slice(0, 5);
      setSongOptions(options);
    } finally {
      setLoadingSongs(false);
    }
  }

  async function start() {
    deckRef.current = [];
    setNoResults(false);
    setScore(0);
    setStreak(0);
    setRoundNo(0);
    const count = await refill();
    const rounds = playableRounds(count);
    if (rounds < 1) {
      setNoResults(true);
      return;
    }
    setTotalRounds(rounds);
    if (await generateRound()) setScreen("game");
  }

  function submitAnswer() {
    if (revealed || !round || selectedSongId === null || !selectedArtist) return;
    clearRoundTimer();
    setRevealed(true);
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    const artistCorrect = selectedArtist === round.correct.artistName;
    const songCorrect = selectedSongId === round.correct.trackId;
    const elapsedSeconds = Math.max(
      1,
      Math.ceil((Date.now() - roundStartedAtRef.current) / 1000)
    );
    const result = {
      speed: artistCorrect && songCorrect ? speedPoints(elapsedSeconds) : 0,
      artist: artistCorrect && !songCorrect ? 1 : 0,
      song: 0,
      elapsedSeconds,
      total: 0,
    };
    result.total = result.speed + result.artist + result.song;
    setRoundResult(result);
    setScore((s) => s + result.total);
    setStreak((st) => (artistCorrect && songCorrect ? st + 1 : 0));
  }

  async function nextRound() {
    clearRoundTimer();
    if (roundNo >= totalRounds) {
      setScreen("finished");
      return;
    }
    await generateRound();
  }

  async function restart() {
    clearRoundTimer();
    deckRef.current = [];
    setScore(0);
    setStreak(0);
    setRoundNo(0);
    setNoResults(false);
    const count = await refill();
    const rounds = playableRounds(count);
    if (rounds < 1) {
      setNoResults(true);
      setScreen("setup");
      return;
    }
    setTotalRounds(rounds);
    if (await generateRound()) setScreen("game");
  }

  const artistCorrect = round && selectedArtist === round.correct.artistName;
  const songCorrect = round && selectedSongId === round.correct.trackId;
  const fullyCorrect = Boolean(artistCorrect && songCorrect);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-3 py-3 sm:px-5 sm:py-4">
      <audio
        ref={audioRef}
        preload="metadata"
        playsInline
        controls={Boolean(audioError)}
        className={audioError ? "mx-auto mb-4 w-full max-w-xl" : "hidden"}
        onLoadedMetadata={() => setAudioReady(true)}
        onPlaying={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false);
          setAudioError("No se pudo cargar el audio de esta pista. Probá otra vez o pasá de ronda.");
        }}
      />

      <header className="mb-3 text-center">
        <div className="mx-auto mb-1 inline-flex rounded-full border border-orange-200 bg-white/80 px-3 py-0.5 text-[10px] font-black uppercase tracking-[0.3em] text-orange-600 shadow-sm">
          Juego musical
        </div>
        <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
          ROCKOLA
        </h1>
        <p className="mx-auto mt-1 max-w-xl text-sm font-medium text-slate-600">
          Hasta 10 canciones: cuanto más rápido aciertes, más puntos sumás.
        </p>
      </header>

      {screen === "setup" && (
        <section className="glass animate-fade-in mx-auto w-full max-w-2xl rounded-[1.5rem] p-4 sm:p-5">
          <h2 className="mb-1 text-xl font-black text-slate-950">
            Elige tu desafío
          </h2>
          <p className="mb-4 text-xs font-medium text-slate-500">
            La partida usa las rondas disponibles para el género elegido. Cada ronda vale hasta {MAX_ROUND_POINTS} puntos.
          </p>

          <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs font-bold text-orange-900">
            Puntaje: 0-5s = 5 pts · 6-10s = 4 · 11-15s = 3 · 16-25s = 2 · +26s = 1.
            Tenés que acertar autor y tema; si solo acertás el autor, sumás 1 punto parcial.
          </div>

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-bold text-slate-700">Género</span>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-900 shadow-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            >
              {GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-4">
            <span className="mb-1 block text-sm font-bold text-slate-700">Origen</span>
            <div className="grid grid-cols-2 gap-2">
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setCountry(c.code)}
                  className={`rounded-xl border px-4 py-2.5 font-semibold transition ${
                    country === c.code
                      ? "border-orange-500 bg-orange-500 text-white shadow-lg shadow-orange-200"
                      : "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-orange-300 hover:bg-orange-50"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {noResults && (
            <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              No hay suficientes artistas únicos con preview para jugar ese género.
              Probá con "Todos" o con otro origen.
            </p>
          )}

          {loading && (
            <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-sm font-bold text-orange-800">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-orange-300 border-t-orange-700" />
                Preparando partida: resolviendo previews y validando artistas únicos...
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={start}
            disabled={loading}
            className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-base font-black text-white shadow-xl shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-orange-600 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Preparando partida…" : "Comenzar"}
          </button>

          <p className="mt-3 text-center text-xs font-medium text-slate-500">
            Pistas vía Deezer, seleccionadas desde Top 100 all-time curados.
          </p>
        </section>
      )}

      {screen === "game" && round && (
        <section className="flex flex-1 flex-col">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-black text-slate-800 shadow-sm">
                Ronda {roundNo}/{totalRounds}
              </span>
              <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 font-black text-orange-700 shadow-sm">
                Máx {totalRounds * MAX_ROUND_POINTS} pts
              </span>
              <button
                type="button"
                onClick={restart}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-600 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                title="Reiniciar manteniendo género y país"
              >
                ↺ Reiniciar
              </button>
            </div>
            <div className="flex gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-black text-emerald-700">
                ⭐ {score}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-black text-amber-700">
                🔥 {streak}
              </span>
            </div>
          </div>

          <div className="glass animate-pop flex flex-col items-center rounded-[1.5rem] p-4 sm:p-5">
            <div className="relative h-24 w-24 overflow-hidden rounded-2xl border-4 border-white shadow-xl shadow-slate-200 sm:h-28 sm:w-28">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={artwork300(round.correct.artworkUrl100)}
                alt=""
                className={`h-full w-full object-cover transition duration-500 ${
                  revealed ? "scale-100 blur-0" : "scale-110 blur-2xl"
                }`}
              />
              {!revealed && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/45 text-center backdrop-blur-sm">
                  <span className="text-3xl">?</span>
                  <span className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">
                    Portada oculta
                  </span>
                </div>
              )}
            </div>

            <Waveform active={isPlaying} />

            {timerActive && (
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Tiempo restante
                </span>
                <div className={`flex h-6 w-24 items-center justify-center rounded-xl border-2 font-black text-lg tabular-nums transition-all ${
                  timeLeft <= 3
                    ? "border-red-500 bg-red-50 text-red-700 animate-pulse"
                    : timeLeft <= 6
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-emerald-500 bg-emerald-50 text-emerald-700"
                }`}>
                  {timeLeft}s
                </div>
              </div>
            )}

            {!audioError && !audioReady && (
              <p className="mt-2 text-xs font-bold text-slate-500">
                Preparando audio de la ronda...
              </p>
            )}
            {audioError && (
              <p className="mt-2 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-bold text-amber-800">
                {audioError}
              </p>
            )}

            <div className="mt-3 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => playClue(1)}
                className="rounded-2xl bg-orange-600 px-4 py-2.5 text-left font-black text-white shadow-xl shadow-orange-200 transition hover:-translate-y-0.5 hover:bg-slate-950"
              >
                <span className="block">▶ Primera pista</span>
                <span className="block text-xs font-bold opacity-85">2s · más puntos si acertás rápido</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setClueLevel(2);
                  playClue(2);
                }}
                className={`rounded-2xl border px-4 py-2.5 text-left font-black shadow-sm transition ${
                  clueLevel === 2
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-800 hover:border-orange-300 hover:bg-orange-50"
                }`}
              >
                <span className="block">▶ Segunda pista</span>
                <span className="block text-xs font-bold opacity-70">4s · ayuda extra, sigue contando el tiempo</span>
              </button>
            </div>

            <p className="mt-3 text-center text-xs font-semibold text-slate-500 sm:text-sm">
              {revealed
                ? "¿Acertaste? Mira la portada y el título."
                : selectedArtist
                  ? `Ahora elegí una canción de ${selectedArtist}.`
                  : "Acertá autor y tema rápido: el reloj ya está corriendo."}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-[1.25rem] border border-slate-200 bg-white/80 p-3 shadow-sm">
              <h3 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                1. Autor (+1)
              </h3>
              <div className="grid gap-2">
                {round.artistOptions.map((opt) => {
                  const chosen = selectedArtist === opt.artistName;
                  const isAnswer = opt.artistName === round.correct.artistName;
                  let cls =
                    "border-slate-200 bg-white text-slate-900 hover:border-orange-300 hover:bg-orange-50";
                  if (revealed && isAnswer)
                    cls = "border-emerald-500 bg-emerald-50 text-emerald-950";
                  else if (revealed && chosen && !isAnswer)
                    cls = "border-red-500 bg-red-50 text-red-950";
                  else if (revealed) cls = "border-slate-200 bg-slate-50 text-slate-400";
                  else if (chosen) cls = "border-orange-500 bg-orange-100 text-orange-950";
                  return (
                    <button
                      key={`artist-${opt.trackId}`}
                      type="button"
                      disabled={revealed}
                      onClick={() => chooseArtist(opt.artistName)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm font-bold transition ${cls}`}
                    >
                      {opt.artistName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-slate-200 bg-white/80 p-3 shadow-sm">
              <h3 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                2. Tema (+1)
              </h3>
              {!selectedArtist && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm font-bold text-slate-500">
                  Elegí un autor para ver 5 canciones de ese artista.
                </div>
              )}
              {selectedArtist && loadingSongs && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-5 text-center text-sm font-bold text-orange-800">
                  <span className="mx-auto mb-2 block h-5 w-5 animate-spin rounded-full border-2 border-orange-300 border-t-orange-700" />
                  Buscando canciones de {selectedArtist}...
                </div>
              )}
              {selectedArtist && !loadingSongs && songOptions.length === 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-center text-sm font-bold text-red-700">
                  No encontré canciones con preview para {selectedArtist}. Elegí otro autor.
                </div>
              )}
              {selectedArtist && !loadingSongs && songOptions.length > 0 && songOptions.length < 5 && (
                <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  Encontré {songOptions.length} canciones con preview para {selectedArtist}.
                </p>
              )}
              {selectedArtist && !loadingSongs && songOptions.length > 0 && (
              <div className="grid gap-2">
                {songOptions.map((opt) => {
                  const chosen = selectedSongId === opt.trackId;
                  const isAnswer = opt.trackId === round.correct.trackId;
                  let cls =
                    "border-slate-200 bg-white text-slate-900 hover:border-orange-300 hover:bg-orange-50";
                  if (revealed && isAnswer)
                    cls = "border-emerald-500 bg-emerald-50 text-emerald-950";
                  else if (revealed && chosen && !isAnswer)
                    cls = "border-red-500 bg-red-50 text-red-950";
                  else if (revealed) cls = "border-slate-200 bg-slate-50 text-slate-400";
                  else if (chosen) cls = "border-orange-500 bg-orange-100 text-orange-950";
                  return (
                    <button
                      key={`song-${opt.trackId}`}
                      type="button"
                      disabled={revealed}
                      onClick={() => setSelectedSongId(opt.trackId)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm font-bold transition ${cls}`}
                    >
                      {opt.trackName}
                    </button>
                  );
                })}
              </div>
              )}
            </div>
          </div>

          {!revealed && (
            <button
              type="button"
              onClick={submitAnswer}
              disabled={selectedSongId === null || !selectedArtist || loadingSongs}
              className="mx-auto mt-3 rounded-2xl bg-slate-950 px-7 py-3 font-black text-white shadow-xl shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-orange-600 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Confirmar respuesta
            </button>
          )}

          {revealed && (
            <div className="mt-3 animate-fade-in text-center">
              <p
                className={`text-base font-bold ${
                  fullyCorrect ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {fullyCorrect ? "¡Correcto! 🎉" : "Respuesta parcial 😅"}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-600">
                Era <strong>{round.correct.trackName}</strong> —{" "}
                {round.correct.artistName}
              </p>
              {roundResult && (
                <div className="mx-auto mt-2 flex max-w-md flex-wrap justify-center gap-2 text-xs font-black">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                    Tiempo: {roundResult.elapsedSeconds}s
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                    Velocidad: +{roundResult.speed}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                    Autor parcial: +{roundResult.artist}
                  </span>
                  <span className="rounded-full bg-orange-100 px-3 py-1.5 text-orange-800">
                    Total ronda: +{roundResult.total}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={nextRound}
                className="mt-3 rounded-2xl bg-slate-950 px-7 py-2.5 font-black text-white shadow-xl shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-orange-600"
              >
                {roundNo >= totalRounds ? "Ver resultado final" : "Siguiente canción →"}
              </button>
            </div>
          )}
        </section>
      )}

      {screen === "finished" && (
        <section className="glass animate-fade-in mx-auto w-full max-w-2xl rounded-[1.5rem] p-5 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-3xl">
            🏆
          </div>
          <h2 className="text-2xl font-black text-slate-950">Partida terminada</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            Hiciste <strong>{score}</strong> puntos de {totalRounds * MAX_ROUND_POINTS} posibles en {totalRounds} canciones.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={restart}
              className="rounded-2xl bg-slate-950 px-7 py-2.5 font-black text-white shadow-xl shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-orange-600"
            >
              Jugar otra vez
            </button>
            <button
              type="button"
              onClick={() => setScreen("setup")}
              className="rounded-2xl border border-slate-200 bg-white px-7 py-2.5 font-black text-slate-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50"
            >
              Cambiar configuración
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
