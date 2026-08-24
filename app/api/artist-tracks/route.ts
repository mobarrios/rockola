import { NextRequest, NextResponse } from "next/server";
import { fetchArtistTracks } from "@/lib/itunes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist") ?? "";
  if (!artist.trim()) return NextResponse.json({ tracks: [] });

  try {
    const tracks = await fetchArtistTracks(artist);
    return NextResponse.json({ tracks });
  } catch {
    return NextResponse.json({ error: "artist_tracks_unavailable" }, { status: 502 });
  }
}
