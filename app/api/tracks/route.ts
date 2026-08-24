import { NextRequest, NextResponse } from "next/server";
import { fetchTopTracks } from "@/lib/itunes";
import { genreLabel } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const genreId = searchParams.get("genre") ?? "";
  const country = searchParams.get("country") ?? "us";
  const label = genreId === "all" ? undefined : genreLabel(genreId);

  try {
    const tracks = await fetchTopTracks({
      genreId: genreId && genreId !== "all" ? genreId : undefined,
      genreLabel: label,
      country,
      limit: 100,
    });
    return NextResponse.json({ tracks });
  } catch {
    return NextResponse.json({ error: "itunes_unavailable" }, { status: 502 });
  }
}
