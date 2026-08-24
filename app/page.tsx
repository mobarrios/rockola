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

const TOTAL_ROUNDS = 10;
const MIN_TRACKS_FOR_GAME = TOTAL_ROUNDS * 5;
const FIRST_CLUE_SECONDS = 2;
const SECOND_CLUE_SECONDS = 4;

interface RoundState {
  correct: ITunesTrack;
  artistOptions: ITunesTrack[];
}

interface RoundResult {
  base: number;
  artist: number;
  song: number;
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

function Waveform({ active }: { active: boolean }) {
  const bars = [26, 42, 20, 54, 34, 62, 28, 48, 22, 58, 38, 46];
  return (
    <div
      className={`mt-5 flex h-20 w-full max-w-xl items-center justify-center gap-2 rounded-[1.5rem] border px-5 transition ${
        active
          ? "border-orange-200 bg-orange-50 shadow-inner"
          : "border-slate-200 bg-white/70"
      }`}
      aria-label={active ? "La pista está sonando" : "La pista está detenida"}
    >
      {bars.map((height, index) => (
        <span
          key={index}
          className={`w-2 rounded-full bg-orange-500 transition-all ${
            active ? "animate-wave opacity-100" : "opacity-30"
          }`}
          style={{
            height: active ? height : 12,
            animationDelay: `${index * 90}ms`,
          }}
        />
      ))}
      <span className="ml-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
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
  const [loading, setLoading] = useState(false);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [noResults, setNoResults] = useState(false);

  const deckRef = useRef<ITunesTrack[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clueStartsRef = useRef<{ first?: number; second?: number }>({});

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
    setAudioReady(false);
    setAudioError(null);
    if (el.src !== previewUrl) {
      el.src = previewUrl;
      el.load();
    }
  }

  function playClue(level: 1 | 2, previewUrl?: string) {
    const el = audioRef.current;
    if (!el) return;
    const url = previewUrl ?? round?.correct.previewUrl;
    if (!url) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setAudioError(null);
    setIsPlaying(false);
    if (el.src !== url) {
      el.src = url;
      el.load();
    }
    const seconds = level === 1 ? FIRST_CLUE_SECONDS : SECOND_CLUE_SECONDS;
    const stop = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsPlaying(true);
      timerRef.current = setTimeout(() => {
        el.pause();
        setIsPlaying(false);
      }, seconds * 1000);
    };
    const seekAndPlay = () => {
      const seconds = level === 1 ? FIRST_CLUE_SECONDS : SECOND_CLUE_SECONDS;
      const starts = clueStartsRef.current;
      const key = level === 1 ? "first" : "second";
      const avoid = level === 2 ? starts.first : starts.second;
      if (starts[key] === undefined) starts[key] = randomStart(el.duration, seconds, avoid);
      el.currentTime = starts[key] ?? 0;
      el.play().then(stop).catch(() => {
        setIsPlaying(false);
        setAudioError("El navegador bloqueó la reproducción. Usá el control de audio o tocá la pista otra vez.");
      });
    };
    el.play().then(stop).catch(() => {
      setIsPlaying(false);
      setAudioError("El navegador bloqueó la reproducción. Usá el control de audio o tocá la pista otra vez.");
    });
    if (el.readyState >= 1) seekAndPlay();
    else el.addEventListener("loadedmetadata", seekAndPlay, { once: true });
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
    if (deckRef.current.length < 5) await refill();
    if (deckRef.current.length < 5) {
      setNoResults(true);
      setScreen("setup");
      return false;
    }
    const nextFive = pickFiveUniqueArtists(deckRef.current);
    if (nextFive.length < 5) {
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
    if (count < MIN_TRACKS_FOR_GAME) {
      setNoResults(true);
      return;
    }
    if (await generateRound()) setScreen("game");
  }

  function submitAnswer() {
    if (revealed || !round || selectedSongId === null || !selectedArtist) return;
    setRevealed(true);
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    const artistCorrect = selectedArtist === round.correct.artistName;
    const songCorrect = selectedSongId === round.correct.trackId;
    const base = clueLevel === 1 ? 3 : 1;
    const result = {
      base: artistCorrect && songCorrect ? base : 0,
      artist: artistCorrect ? 1 : 0,
      song: songCorrect ? 1 : 0,
      total: 0,
    };
    result.total = result.base + result.artist + result.song;
    setRoundResult(result);
    setScore((s) => s + result.total);
    setStreak((st) => (artistCorrect && songCorrect ? st + 1 : 0));
  }

  async function nextRound() {
    if (roundNo >= TOTAL_ROUNDS) {
      setScreen("finished");
      return;
    }
    await generateRound();
  }

  async function restart() {
    deckRef.current = [];
    setScore(0);
    setStreak(0);
    setRoundNo(0);
    setNoResults(false);
    const count = await refill();
    if (count < MIN_TRACKS_FOR_GAME) {
      setNoResults(true);
      setScreen("setup");
      return;
    }
    if (await generateRound()) setScreen("game");
  }

  const artistCorrect = round && selectedArtist === round.correct.artistName;
  const songCorrect = round && selectedSongId === round.correct.trackId;
  const fullyCorrect = Boolean(artistCorrect && songCorrect);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-10">
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

      <header className="mb-8 text-center">
        <div className="mx-auto mb-3 inline-flex rounded-full border border-orange-200 bg-white/80 px-4 py-1 text-xs font-black uppercase tracking-[0.35em] text-orange-600 shadow-sm">
          Juego musical
        </div>
        <h1 className="text-5xl font-black tracking-tight text-slate-950 sm:text-7xl">
          ROCKOLA
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base font-medium text-slate-600">
          10 canciones, dos pistas por tema y puntos extra por autor y nombre.
        </p>
      </header>

      {screen === "setup" && (
        <section className="glass animate-fade-in mx-auto w-full max-w-2xl rounded-[2rem] p-6 sm:p-8">
          <h2 className="mb-1 text-2xl font-black text-slate-950">
            Elige tu desafío
          </h2>
          <p className="mb-6 text-sm font-medium text-slate-500">
            Partida de {TOTAL_ROUNDS} canciones. Primera pista: 2s por 3 puntos.
            Segunda pista: 4s por 1 punto.
          </p>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-bold text-slate-700">Género</span>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-900 shadow-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            >
              {GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-6">
            <span className="mb-2 block text-sm font-bold text-slate-700">Origen</span>
            <div className="grid grid-cols-2 gap-2">
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setCountry(c.code)}
                  className={`rounded-xl border px-4 py-3 font-semibold transition ${
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
              No hay suficientes artistas únicos para una partida de 10 canciones
              con esa combinación. Probá con "Todos" o con otro género.
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
            className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-base font-black text-white shadow-xl shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-orange-600 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Preparando partida…" : "Comenzar"}
          </button>

          <p className="mt-4 text-center text-xs font-medium text-slate-500">
            Pistas vía Deezer, seleccionadas desde Top 100 all-time curados.
          </p>
        </section>
      )}

      {screen === "game" && round && (
        <section className="flex flex-1 flex-col">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-4 py-2 font-black text-slate-800 shadow-sm">
                Ronda {roundNo}/{TOTAL_ROUNDS}
              </span>
              <button
                type="button"
                onClick={restart}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 font-bold text-slate-600 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                title="Reiniciar manteniendo género y país"
              >
                ↺ Reiniciar
              </button>
            </div>
            <div className="flex gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 font-black text-emerald-700">
                ⭐ {score}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 font-black text-amber-700">
                🔥 {streak}
              </span>
            </div>
          </div>

          <div className="glass animate-pop flex flex-col items-center rounded-[2rem] p-6 sm:p-8">
            <div className="relative h-48 w-48 overflow-hidden rounded-[1.75rem] border-4 border-white shadow-2xl shadow-slate-200">
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
                  <span className="text-4xl">?</span>
                  <span className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-slate-700">
                    Portada oculta
                  </span>
                </div>
              )}
            </div>

            <Waveform active={isPlaying} />

            {!audioError && !audioReady && (
              <p className="mt-3 text-xs font-bold text-slate-500">
                Preparando audio de la ronda...
              </p>
            )}
            {audioError && (
              <p className="mt-3 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-bold text-amber-800">
                {audioError}
              </p>
            )}

            <div className="mt-5 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => playClue(1)}
                className="rounded-2xl bg-orange-600 px-5 py-4 text-left font-black text-white shadow-xl shadow-orange-200 transition hover:-translate-y-0.5 hover:bg-slate-950"
              >
                <span className="block">▶ Primera pista</span>
                <span className="block text-xs font-bold opacity-85">2 segundos · 3 puntos base</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setClueLevel(2);
                  playClue(2);
                }}
                className={`rounded-2xl border px-5 py-4 text-left font-black shadow-sm transition ${
                  clueLevel === 2
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-800 hover:border-orange-300 hover:bg-orange-50"
                }`}
              >
                <span className="block">▶ Segunda pista</span>
                <span className="block text-xs font-bold opacity-70">4 segundos · baja a 1 punto base</span>
              </button>
            </div>

            <p className="mt-4 text-center text-sm font-semibold text-slate-500">
              {revealed
                ? "¿Acertaste? Mira la portada y el título."
                : selectedArtist
                  ? `Ahora elegí una canción de ${selectedArtist}.`
                  : "Primero elegí el autor. Después aparecen canciones de ese autor."}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-black uppercase tracking-[0.2em] text-slate-500">
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
                      className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${cls}`}
                    >
                      {opt.artistName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-black uppercase tracking-[0.2em] text-slate-500">
                2. Tema (+1)
              </h3>
              {!selectedArtist && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
                  Elegí un autor para ver 5 canciones de ese artista.
                </div>
              )}
              {selectedArtist && loadingSongs && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-8 text-center text-sm font-bold text-orange-800">
                  <span className="mx-auto mb-3 block h-5 w-5 animate-spin rounded-full border-2 border-orange-300 border-t-orange-700" />
                  Buscando canciones de {selectedArtist}...
                </div>
              )}
              {selectedArtist && !loadingSongs && songOptions.length === 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-center text-sm font-bold text-red-700">
                  No encontré canciones con preview para {selectedArtist}. Elegí otro autor.
                </div>
              )}
              {selectedArtist && !loadingSongs && songOptions.length > 0 && songOptions.length < 5 && (
                <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
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
                      className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${cls}`}
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
              className="mx-auto mt-5 rounded-2xl bg-slate-950 px-8 py-4 font-black text-white shadow-xl shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-orange-600 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Confirmar respuesta
            </button>
          )}

          {revealed && (
            <div className="mt-5 animate-fade-in text-center">
              <p
                className={`text-lg font-bold ${
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
                <div className="mx-auto mt-3 flex max-w-md flex-wrap justify-center gap-2 text-xs font-black">
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-slate-700">
                    Pista: +{roundResult.base}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-slate-700">
                    Autor: +{roundResult.artist}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-slate-700">
                    Tema: +{roundResult.song}
                  </span>
                  <span className="rounded-full bg-orange-100 px-3 py-2 text-orange-800">
                    Total ronda: +{roundResult.total}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={nextRound}
                className="mt-4 rounded-2xl bg-slate-950 px-7 py-3 font-black text-white shadow-xl shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-orange-600"
              >
                {roundNo >= TOTAL_ROUNDS ? "Ver resultado final" : "Siguiente canción →"}
              </button>
            </div>
          )}
        </section>
      )}

      {screen === "finished" && (
        <section className="glass animate-fade-in mx-auto w-full max-w-2xl rounded-[2rem] p-8 text-center">
          <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-orange-100 text-4xl">
            🏆
          </div>
          <h2 className="text-3xl font-black text-slate-950">Partida terminada</h2>
          <p className="mt-2 text-base font-semibold text-slate-600">
            Hiciste <strong>{score}</strong> puntos de 50 posibles en {TOTAL_ROUNDS} canciones.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={restart}
              className="rounded-2xl bg-slate-950 px-7 py-3 font-black text-white shadow-xl shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-orange-600"
            >
              Jugar otra vez
            </button>
            <button
              type="button"
              onClick={() => setScreen("setup")}
              className="rounded-2xl border border-slate-200 bg-white px-7 py-3 font-black text-slate-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50"
            >
              Cambiar configuración
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
