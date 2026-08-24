import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "cdnt-preview.dzcdn.net",
  "e-cdns-preview.dzcdn.net",
  "audio-ssl.itunes.apple.com",
  "audio.itunes.apple.com",
]);

export async function GET(req: NextRequest) {
  const src = new URL(req.url).searchParams.get("src");
  if (!src) return new NextResponse("Missing audio source", { status: 400 });

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return new NextResponse("Invalid audio source", { status: 400 });
  }

  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return new NextResponse("Audio source not allowed", { status: 400 });
  }

  const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
  };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  const upstream = await fetch(url.toString(), {
    headers,
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Audio unavailable", { status: upstream.status || 502 });
  }

  const responseHeaders = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=300",
      "Accept-Ranges": upstream.headers.get("accept-ranges") ?? "bytes",
  });
  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  if (contentRange) responseHeaders.set("Content-Range", contentRange);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
