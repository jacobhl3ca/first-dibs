import { NextRequest, NextResponse } from "next/server";
import { findShows } from "@/lib/shows";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { artists, city } = await req.json().catch(() => ({}));
  if (!Array.isArray(artists) || artists.length === 0) {
    return NextResponse.json({ shows: [] });
  }
  const clean = artists.map((a: unknown) => String(a).trim()).filter(Boolean).slice(0, 30);
  const shows = await findShows(clean, String(city || "nyc"));
  return NextResponse.json({ shows });
}
