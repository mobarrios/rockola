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
const seedTrackCache = new Map<string, ITunesTrack | null>();

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
    const res = await fetch(`${SEARCH}?${params.toString()}`, {
      next: { revalidate: 3600 },
    });
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
    artistName: t.artist.name,
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

async function fetchAllTimeTracks(opts: {
  country: string;
  genreLabel?: string;
}): Promise<ITunesTrack[]> {
  const allSeeds =
    opts.country === "ar" ? ARGENTINA_ALL_TIME_TRACKS : INTERNATIONAL_ALL_TIME_TRACKS;
  const byGenre = allSeeds.filter((s) => s.genre === opts.genreLabel);
  const seeds = shuffle(byGenre.length >= 5 ? byGenre : allSeeds);
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
  const curated = await fetchAllTimeTracks({
    country: opts.country === "ar" ? "ar" : "us",
    genreLabel: opts.genreLabel,
  });
  return curated;
}
