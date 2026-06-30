import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Typeahead of REAL music artists via Ticketmaster attractions (relevance-ranked).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const key = process.env.TM_API_KEY;
  if (!q || q.length < 2 || !key) return NextResponse.json({ artists: [] });

  const u = new URL("https://app.ticketmaster.com/discovery/v2/attractions.json");
  u.search = new URLSearchParams({
    keyword: q,
    classificationName: "music",
    size: "8",
    sort: "relevance,desc",
    apikey: key,
  }).toString();

  try {
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    const seen = new Set<string>();
    const names: string[] = [];
    for (const a of j?._embedded?.attractions ?? []) {
      const n: string = (a.name ?? "").trim();
      if (n && !seen.has(n.toLowerCase())) {
        seen.add(n.toLowerCase());
        names.push(n);
      }
    }
    return NextResponse.json({ artists: names.slice(0, 6) });
  } catch {
    return NextResponse.json({ artists: [] });
  }
}
