// Real upcoming-show lookup via Ticketmaster + SeatGeek.
// Ported from Jacob's working ~/scripts/first-dibs-monitor.py (TM dmaId/SeatGeek lat-lon),
// generalized to any city via lat/long + radius.

export type Show = {
  id: string;
  artist: string;
  name: string;
  date: string;
  venue: string;
  city: string;
  url: string;
  price: number | null;
  announced: string; // when the show was announced / went on sale (for "just announced" sort)
  src: "Ticketmaster" | "SeatGeek";
};

export const CITIES: Record<string, { label: string; lat: number; lon: number }> = {
  nyc: { label: "New York", lat: 40.7128, lon: -74.006 },
  la: { label: "Los Angeles", lat: 34.0522, lon: -118.2437 },
  chi: { label: "Chicago", lat: 41.8781, lon: -87.6298 },
  sf: { label: "San Francisco", lat: 37.7749, lon: -122.4194 },
  aus: { label: "Austin", lat: 30.2672, lon: -97.7431 },
  sea: { label: "Seattle", lat: 47.6062, lon: -122.3321 },
  bos: { label: "Boston", lat: 42.3601, lon: -71.0589 },
  dc: { label: "Washington DC", lat: 38.9072, lon: -77.0369 },
};

const RADIUS_MI = 75;

async function tmEvents(artist: string, lat: number, lon: number): Promise<Show[]> {
  const key = process.env.TM_API_KEY;
  if (!key) return [];
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const u = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  u.search = new URLSearchParams({
    apikey: key,
    keyword: artist,
    latlong: `${lat},${lon}`,
    radius: String(RADIUS_MI),
    unit: "miles",
    classificationName: "Music",
    size: "8",
    sort: "date,asc",
    startDateTime: now,
  }).toString();
  try {
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    const events = j?._embedded?.events ?? [];
    const out: Show[] = [];
    for (const e of events) {
      const name: string = e.name ?? "";
      const atts: string[] = (e._embedded?.attractions ?? []).map((a: any) => a.name ?? "");
      const hit =
        name.toLowerCase().includes(artist.toLowerCase()) ||
        atts.some((a) => a.toLowerCase().includes(artist.toLowerCase()));
      if (!hit) continue;
      const v = e._embedded?.venues?.[0] ?? {};
      let price: number | null = null;
      const pr = e.priceRanges?.[0];
      if (pr && typeof pr.min === "number") price = pr.min;
      out.push({
        id: "tm_" + e.id,
        artist,
        name,
        date: e.dates?.start?.localDate ?? "",
        venue: v.name ?? "",
        city: v.city?.name ?? "",
        url: e.url ?? "",
        price,
        announced: (e.sales?.public?.startDateTime ?? "").slice(0, 10),
        src: "Ticketmaster",
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function sgEvents(artist: string, lat: number, lon: number): Promise<Show[]> {
  const id = process.env.SEATGEEK_CLIENT_ID;
  if (!id) return [];
  const now = new Date().toISOString().slice(0, 19);
  const u = new URL("https://api.seatgeek.com/2/events");
  u.search = new URLSearchParams({
    client_id: id,
    q: artist,
    lat: String(lat),
    lon: String(lon),
    range: `${RADIUS_MI}mi`,
    per_page: "8",
    sort: "datetime_utc.asc",
    "datetime_utc.gte": now,
  }).toString();
  try {
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json();
    const events = j?.events ?? [];
    const out: Show[] = [];
    for (const e of events) {
      const title: string = e.title ?? "";
      const perfs: string[] = (e.performers ?? []).map((p: any) => p.name ?? "");
      const hit =
        title.toLowerCase().includes(artist.toLowerCase()) ||
        perfs.some((p) => p.toLowerCase().includes(artist.toLowerCase()));
      if (!hit) continue;
      out.push({
        id: "sg_" + e.id,
        artist,
        name: title,
        date: (e.datetime_local ?? "").slice(0, 10),
        venue: e.venue?.name ?? "",
        city: e.venue?.city ?? "",
        url: e.url ?? "",
        price: e.stats?.lowest_price ?? null,
        announced: (e.announce_date ?? "").slice(0, 10),
        src: "SeatGeek",
      });
    }
    return out;
  } catch {
    return [];
  }
}

// run async tasks with a concurrency cap (free ticket APIs rate-limit on bursts)
async function pool<T>(items: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await items[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Cap how many artists we hit per search so a 250-artist taste list stays fast
// and under the ticket APIs' rate limits. Artists are passed in taste-rank order.
export const MAX_SEARCH_ARTISTS = 50;

export async function findShows(artists: string[], cityKey: string): Promise<Show[]> {
  const city = CITIES[cityKey] ?? CITIES.nyc;
  const searched = artists.slice(0, MAX_SEARCH_ARTISTS);
  const tasks = searched.flatMap((a) => [
    () => tmEvents(a, city.lat, city.lon),
    () => sgEvents(a, city.lat, city.lon),
  ]);
  const lists = await pool(tasks, 8);
  const all = lists.flat();
  // dedup by artist|date|venue-prefix (mirrors the monitor's keyfor)
  const seen = new Set<string>();
  const deduped: Show[] = [];
  for (const s of all) {
    const k = `${s.artist.toLowerCase()}|${s.date}|${s.venue.toLowerCase().slice(0, 14)}`;
    if (seen.has(k) || !s.date) continue;
    seen.add(k);
    deduped.push(s);
  }
  deduped.sort((a, b) => a.date.localeCompare(b.date));
  return deduped;
}
