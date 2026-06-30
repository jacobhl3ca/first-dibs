"use client";

import { useEffect, useRef, useState } from "react";

type Show = {
  id: string;
  artist: string;
  name: string;
  date: string;
  venue: string;
  city: string;
  url: string;
  price: number | null;
  announced: string;
  src: string;
};

const CITY_OPTS = [
  ["nyc", "New York"],
  ["la", "Los Angeles"],
  ["chi", "Chicago"],
  ["sf", "San Francisco"],
  ["aus", "Austin"],
  ["sea", "Seattle"],
  ["bos", "Boston"],
  ["dc", "Washington DC"],
];

// A wide, recognizable default set across genres so the feed is full on first load.
const SEED = [
  "Phish", "Goose", "Billy Strings", "Khruangbin", "Vampire Weekend", "The Roots",
  "JID", "Tyler Childers", "Kamasi Washington", "Robert Glasper", "BadBadNotGood",
  "Tom Misch", "Yussef Dayes", "Brian Blade", "Maggie Rogers", "Vulfpeck",
  "Anderson .Paak", "Hiatus Kaiyote", "Hozier", "Glass Animals", "Lake Street Dive",
  "Trombone Shorty", "Snarky Puppy", "Leon Bridges", "FKJ", "Men I Trust",
];

function fmtDate(d: string) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function Home() {
  const [artists, setArtists] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [city, setCity] = useState("nyc");
  const [shows, setShows] = useState<Show[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [blurbs, setBlurbs] = useState<Record<string, string>>({});
  const [voicing, setVoicing] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"soonest" | "announced">("soonest");
  const [selected, setSelected] = useState<string[]>([]); // multi-select filter; empty = show all
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const didAuto = useRef(false);

  // load saved artists, then auto-search once so the page never shows an empty box
  useEffect(() => {
    let list = SEED;
    let c = "nyc";
    try {
      const s = JSON.parse(localStorage.getItem("fd_artists") || "null");
      if (Array.isArray(s) && s.length) list = s;
      c = localStorage.getItem("fd_city") || "nyc";
    } catch {}
    setArtists(list);
    setCity(c);
    if (!didAuto.current) {
      didAuto.current = true;
      findShows(list, c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (artists.length) localStorage.setItem("fd_artists", JSON.stringify(artists));
  }, [artists]);
  useEffect(() => {
    localStorage.setItem("fd_city", city);
  }, [city]);

  // typeahead of real artists as you type
  useEffect(() => {
    const q = input.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/artists?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        setSuggestions(j.artists || []);
      } catch {}
    }, 220);
    return () => clearTimeout(t);
  }, [input]);

  function blurbFor(sh: Show) {
    fetch("/api/blurb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artist: sh.artist, venue: sh.venue, date: sh.date, city: sh.city }),
    })
      .then((r) => r.json())
      .then((bj) => {
        if (bj.blurb) setBlurbs((m) => ({ ...m, [sh.artist]: bj.blurb }));
      })
      .catch(() => {});
  }

  async function findShows(artistList: string[] = artists, cityKey: string = city) {
    setLoading(true);
    setShows(null);
    setBlurbs({});
    try {
      const r = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artists: artistList, city: cityKey }),
      });
      const j = await r.json();
      const list: Show[] = j.shows || [];
      setShows(list);
      const seenArtist = new Set<string>();
      for (const s of list) {
        if (seenArtist.has(s.artist)) continue;
        seenArtist.add(s.artist);
        if (seenArtist.size > 16) break;
        blurbFor(s);
      }
    } finally {
      setLoading(false);
    }
  }

  // add a real artist (from typeahead), then merge just their shows so they appear immediately
  async function addArtist(name?: string) {
    const v = (name ?? suggestions[0] ?? input).trim();
    setInput("");
    setSuggestions([]);
    if (!v || artists.some((a) => a.toLowerCase() === v.toLowerCase())) return;
    setArtists((prev) => [...prev, v]);
    try {
      const r = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artists: [v], city }),
      });
      const j = await r.json();
      const incoming: Show[] = j.shows || [];
      if (incoming.length) {
        setShows((prev) => {
          const base = prev || [];
          const seen = new Set(base.map((s) => s.id));
          const merged = [...base, ...incoming.filter((s) => !seen.has(s.id))];
          merged.sort((a, b) => a.date.localeCompare(b.date));
          return merged;
        });
        blurbFor(incoming[0]);
      }
    } catch {}
  }

  function changeCity(c: string) {
    setCity(c);
    setSelected([]);
    findShows(artists, c); // auto-switch — no button needed
  }

  function toggleFilter(a: string) {
    setSelected((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  async function playVoice(artist: string, fallback: string) {
    const text = blurbs[artist] || fallback;
    setVoicing(artist);
    try {
      const r = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        alert("Voice preview isn't enabled yet (needs an ElevenLabs key).");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
    } finally {
      setVoicing(null);
    }
  }

  // group shows by artist, then order groups by the active sort
  function buildGroups(list: Show[]) {
    const groups: { artist: string; shows: Show[] }[] = [];
    const idx: Record<string, number> = {};
    for (const s of list) {
      if (idx[s.artist] === undefined) {
        idx[s.artist] = groups.length;
        groups.push({ artist: s.artist, shows: [] });
      }
      groups[idx[s.artist]].shows.push(s);
    }
    if (sortMode === "announced") {
      groups.sort((a, b) => {
        const am = a.shows.reduce((m, s) => (s.announced > m ? s.announced : m), "");
        const bm = b.shows.reduce((m, s) => (s.announced > m ? s.announced : m), "");
        return bm.localeCompare(am);
      });
    } else {
      groups.sort((a, b) => a.shows[0].date.localeCompare(b.shows[0].date));
    }
    return groups;
  }

  // which artists actually have shows (so chips can show only the live ones first)
  const artistsWithShows = new Set((shows || []).map((s) => s.artist.toLowerCase()));

  return (
    <div className="wrap">
      <div className="hero">
        <h1>First <span className="dib">Dibs</span></h1>
        <p>Upcoming live shows near you by the artists you love — with AI picks and a voice preview.</p>
      </div>

      <div className="panel">
        <div className="row">
          <div className="ac">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addArtist()}
              placeholder="Search a real artist to add…"
            />
            {suggestions.length > 0 && (
              <div className="ac-list">
                {suggestions.map((s) => (
                  <div className="ac-item" key={s} onMouseDown={() => addArtist(s)}>
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
          <select value={city} onChange={(e) => changeCity(e.target.value)}>
            {CITY_OPTS.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>

        <div className="chips">
          {artists.map((a) => (
            <span
              className={
                "chip" +
                (selected.includes(a) ? " active" : "") +
                (artistsWithShows.has(a.toLowerCase()) ? "" : " dim")
              }
              key={a}
              onClick={() => toggleFilter(a)}
              title="Click to filter to this artist · click again to unselect"
            >
              <b>{a}</b>
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <span className="muted">
            {loading ? (
              <><span className="spin" /> Finding shows in {CITY_OPTS.find((c) => c[0] === city)?.[1]}…</>
            ) : selected.length ? (
              <>Filtering to {selected.length} · <a className="link" onClick={() => setSelected([])}>show all</a></>
            ) : (
              <>Showing all {artists.length} artists · tap a name to filter</>
            )}
          </span>
        </div>
      </div>

      {shows && shows.length > 0 && (() => {
        const allGroups = buildGroups(shows);
        const groups = selected.length ? allGroups.filter((g) => selected.includes(g.artist)) : allGroups;
        return (
          <>
            <div className="sortbar">
              <button className={"seg" + (sortMode === "soonest" ? " on" : "")} onClick={() => setSortMode("soonest")}>
                ⏱ Soonest
              </button>
              <button className={"seg" + (sortMode === "announced" ? " on" : "")} onClick={() => setSortMode("announced")}>
                ✨ Just announced
              </button>
              <span className="resultcount">{groups.length} of {allGroups.length} artists with shows</span>
            </div>
            <div className="cards">
              {groups.map((g, gi) => {
                const soonest = g.shows[0];
                const featLabel = sortMode === "announced" ? "✨ New" : "🔥 Soon";
                return (
                  <div className={"show" + (gi < 3 ? " feat" : "")} key={g.artist}>
                    {gi < 3 && <span className="badge">{featLabel}</span>}
                    <div className="top">
                      <div>
                        <a className="artist" href={soonest.url} target="_blank" rel="noreferrer" title={`Tickets for ${g.artist}`}>
                          {g.artist}
                        </a>
                        <div className="venue">{g.shows.length} upcoming {g.shows.length === 1 ? "show" : "shows"} near you</div>
                      </div>
                      <div className="date">{fmtDate(soonest.date)}</div>
                    </div>
                    {blurbs[g.artist] && <div className="blurb">“{blurbs[g.artist]}”</div>}
                    <div className="showtimes">
                      {g.shows.map((s) => (
                        <a className="st" href={s.url} target="_blank" rel="noreferrer" key={s.id}>
                          <span className="st-date">{fmtDate(s.date)}</span>
                          <span className="st-venue">{s.venue}{s.city ? ` · ${s.city}` : ""}</span>
                          <span className="st-right">
                            {s.price != null && <span className="st-price">${Math.round(s.price)}</span>}
                            <span className="st-src">{s.src === "Ticketmaster" ? "TM" : "SG"}</span>
                            <span className="st-go">Tickets →</span>
                          </span>
                        </a>
                      ))}
                    </div>
                    <div className="actions">
                      <button
                        className="ghost"
                        onClick={() => playVoice(g.artist, `${g.artist}, ${g.shows.length} upcoming shows near you, soonest ${fmtDate(soonest.date)} at ${soonest.venue}.`)}
                        disabled={voicing === g.artist}
                      >
                        {voicing === g.artist ? <><span className="spin" /> …</> : "🔊 Preview"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {shows && shows.length === 0 && !loading && (
        <div className="empty">No upcoming shows found near {CITY_OPTS.find((c) => c[0] === city)?.[1]}. Try another city or add an artist.</div>
      )}

      <div className="foot">
        Real data from Ticketmaster + SeatGeek
        <br />
        built with Stripe Projects for <b>Ship &rsquo;26</b>
        <br />
        In ~20 minutes by <a href="https://jacobhl.com" target="_blank" rel="noreferrer">Jacob</a>
      </div>
      <audio ref={audioRef} hidden />
    </div>
  );
}
