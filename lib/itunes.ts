import {
  ARGENTINA_ALL_TIME_TRACKS,
  INTERNATIONAL_ALL_TIME_TRACKS,
  type AllTimeTrackSeed,
} from "@/lib/all-time-tracks";

export interface ITunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  previewUrl: string | null;
  artworkUrl100: string;
  primaryGenreName: string;
}

const SEARCH = "https://api.deezer.com/search/track";
const ARTIST_SEARCH = "https://api.deezer.com/search/artist";
const ARTIST_TOP = "https://api.deezer.com/artist";
const seedTrackCache = new Map<string, ITunesTrack | null>();
const poolCache = new Map<
  string,
  { expires: number; tracks: ITunesTrack[]; pending?: Promise<ITunesTrack[]> }
>();
const POOL_CACHE_MS = 1000 * 60 * 30;
const SHORT_POOL_CACHE_MS = 1000 * 60;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeArtist(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesSeedArtist(resultArtist: string, seedArtist: string): boolean {
  const result = normalizeArtist(resultArtist);
  const seed = normalizeArtist(seedArtist);
  return result === seed || result.includes(seed) || seed.includes(result);
}

function matchesSeedTitle(resultTitle: string, seedTitle: string): boolean {
  const result = normalizeArtist(resultTitle);
  const seed = normalizeArtist(seedTitle);
  return result === seed || result.includes(seed) || seed.includes(result);
}

function isPreferredArtistMatch(resultArtist: string, seedArtist: string): boolean {
  const result = normalizeArtist(resultArtist);
  const seed = normalizeArtist(seedArtist);
  return result === seed || seed.includes(result);
}

function dedupeByArtist(tracks: ITunesTrack[]): ITunesTrack[] {
  const seen = new Set<string>();
  const out: ITunesTrack[] = [];
  for (const t of tracks) {
    const key = t.artistName.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function dedupeByTitle(tracks: ITunesTrack[]): ITunesTrack[] {
  const seen = new Set<string>();
  const out: ITunesTrack[] = [];
  for (const t of tracks) {
    const key = normalizeArtist(t.trackName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

async function searchSeedTrack(
  seed: AllTimeTrackSeed,
  country: string
): Promise<ITunesTrack | null> {
  const cacheKey = `${country}:${seed.artist}:${seed.title}`.toLowerCase();
  if (seedTrackCache.has(cacheKey)) return seedTrackCache.get(cacheKey)!;
  const params = new URLSearchParams({
    q: `${seed.artist} ${seed.title}`,
    limit: "10",
  });
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${SEARCH}?${params.toString()}`, {
      signal: ctrl.signal,
      next: { revalidate: 3600 },
    });
    clearTimeout(to);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: any[] };
    const candidates = (data.data ?? []).filter(
      (t) => t.preview && t.title && t.artist?.name
    );
    const matches = candidates.filter((t) =>
      matchesSeedArtist(t.artist.name, seed.artist)
    );
    const preferred = matches.filter((t) =>
      isPreferredArtistMatch(t.artist.name, seed.artist) &&
      matchesSeedTitle(t.title, seed.title)
    );
    const t = (preferred[0] ?? matches[0] ?? candidates[0]) as any;
    if (!t) {
      seedTrackCache.set(cacheKey, null);
      return null;
    }
    const track = {
      trackId: Number(t.id),
      trackName: t.title,
      artistName: seed.artist,
      previewUrl: t.preview,
      artworkUrl100: t.album?.cover_medium ?? t.album?.cover ?? "",
      primaryGenreName: t.primaryGenreName ?? seed.genre,
    };
    seedTrackCache.set(cacheKey, track);
    return track;
  } catch {
    return null;
  }
}

export async function fetchArtistTracks(artist: string): Promise<ITunesTrack[]> {
  const artistParams = new URLSearchParams({ q: artist, limit: "5" });
  try {
    const artistRes = await fetch(`${ARTIST_SEARCH}?${artistParams.toString()}`, {
      next: { revalidate: 3600 },
    });
    if (artistRes.ok) {
      const artistData = (await artistRes.json()) as { data?: any[] };
      const artists = artistData.data ?? [];
      const match =
        artists.find((a) => isPreferredArtistMatch(a.name ?? "", artist)) ??
        artists.find((a) => matchesSeedArtist(a.name ?? "", artist)) ??
        artists[0];
      if (match?.id) {
        const topRes = await fetch(`${ARTIST_TOP}/${match.id}/top?limit=50`, {
          next: { revalidate: 3600 },
        });
        if (topRes.ok) {
          const topData = (await topRes.json()) as { data?: any[] };
          const topTracks = (topData.data ?? [])
            .filter((t) => t.preview && t.title && t.artist?.name)
            .map((t) => ({
              trackId: Number(t.id),
              trackName: t.title,
              artistName: artist,
              previewUrl: t.preview,
              artworkUrl100: t.album?.cover_medium ?? t.album?.cover ?? "",
              primaryGenreName: "",
            }));
          const dedupedTop = dedupeByTitle(topTracks);
          if (dedupedTop.length >= 5) return dedupedTop.slice(0, 12);
        }
      }
    }
  } catch {
    // Fall back to text search below.
  }

  const params = new URLSearchParams({
    q: artist,
    limit: "100",
  });
  try {
    const res = await fetch(`${SEARCH}?${params.toString()}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: any[] };
    const tracks = (data.data ?? [])
      .filter((t) => t.preview && t.title && t.artist?.name)
      .filter((t) => matchesSeedArtist(t.artist.name, artist))
      .map((t) => ({
        trackId: Number(t.id),
        trackName: t.title,
        artistName: artist,
        previewUrl: t.preview,
        artworkUrl100: t.album?.cover_medium ?? t.album?.cover ?? "",
        primaryGenreName: "",
      }));
    return dedupeByTitle(tracks).slice(0, 12);
  } catch {
    return [];
  }
}

async function fetchAllTimeTracks(opts: {
  country: string;
  genreLabel?: string;
}): Promise<ITunesTrack[]> {
  const allSeeds =
    opts.country === "ar" ? ARGENTINA_ALL_TIME_TRACKS : INTERNATIONAL_ALL_TIME_TRACKS;
  const seedsForGenre = opts.genreLabel
    ? allSeeds.filter((s) => s.genre === opts.genreLabel)
    : allSeeds;
  const seeds = shuffle(seedsForGenre);
  const chosen = seeds.slice(0, 100);
  const out: ITunesTrack[] = [];
  let idx = 0;

  async function worker() {
    while (idx < chosen.length) {
      const seed = chosen[idx++];
      const track = await searchSeedTrack(seed, opts.country === "ar" ? "ar" : "us");
      if (track) out.push(track);
    }
  }

  await Promise.all(Array.from({ length: 3 }, worker));
  return dedupeByArtist(shuffle(out));
}

export async function fetchTopTracks(opts: {
  genreId?: string;
  genreLabel?: string;
  country: string;
  limit?: number;
}): Promise<ITunesTrack[]> {
  const country = opts.country === "ar" ? "ar" : "us";
  const key = `${country}:${opts.genreLabel ?? "all"}`;
  const cached = poolCache.get(key);
  if (cached?.tracks.length && cached.expires > Date.now()) return shuffle(cached.tracks);
  if (cached?.pending) return shuffle(await cached.pending);

  const pending = fetchAllTimeTracks({
    country,
    genreLabel: opts.genreLabel,
  });
  poolCache.set(key, { expires: Date.now() + POOL_CACHE_MS, tracks: cached?.tracks ?? [], pending });
  const tracks = await pending;
  poolCache.set(key, {
    expires: Date.now() + (tracks.length >= 50 ? POOL_CACHE_MS : SHORT_POOL_CACHE_MS),
    tracks,
  });
  return shuffle(tracks);
}
