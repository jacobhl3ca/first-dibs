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

const SEED = ["Brian Blade", "Yussef Dayes", "Tom Misch", "Kamasi Washington"];

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

  function addArtist() {
    const v = input.trim();
    if (v && !artists.some((a) => a.toLowerCase() === v.toLowerCase())) {
      setArtists([...artists, v]);
    }
    setInput("");
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
      // one blurb per ARTIST (not per show), using their soonest show
      const seenArtist = new Set<string>();
      for (const s of list) {
        if (seenArtist.has(s.artist)) continue;
        seenArtist.add(s.artist);
        if (seenArtist.size > 14) break;
        (async (sh: Show) => {
          try {
            const br = await fetch("/api/blurb", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ artist: sh.artist, venue: sh.venue, date: sh.date, city: sh.city }),
            });
            const bj = await br.json();
            if (bj.blurb) setBlurbs((m) => ({ ...m, [sh.artist]: bj.blurb }));
          } catch {}
        })(s);
      }
    } finally {
      setLoading(false);
    }
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
        return bm.localeCompare(am); // most recently announced first
      });
    } else {
      groups.sort((a, b) => a.shows[0].date.localeCompare(b.shows[0].date)); // soonest first
    }
    return groups;
  }

  return (
    <div className="wrap">
      <div className="hero">
        <h1>First <span className="dib">Dibs</span></h1>
        <p>Upcoming live shows near you by the artists you love — with AI picks and a voice preview.</p>
      </div>

      <div className="panel">
        <div className="row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addArtist()}
            placeholder="Add an artist (e.g. Yussef Dayes)…"
          />
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            {CITY_OPTS.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <button className="ghost" onClick={addArtist}>Add</button>
        </div>
        <div className="chips">
          {artists.map((a) => (
            <span className="chip" key={a}>
              <b>{a}</b>
              <span className="x" onClick={() => setArtists(artists.filter((x) => x !== a))}>×</span>
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={() => findShows()} disabled={loading || artists.length === 0}>
            {loading ? <><span className="spin" /> Finding shows…</> : "Find my shows"}
          </button>
          <span className="muted">{artists.length} artists · saved on this device</span>
        </div>
      </div>

      {shows && shows.length > 0 && (
        <>
          <div className="sortbar">
            <button
              className={"seg" + (sortMode === "soonest" ? " on" : "")}
              onClick={() => setSortMode("soonest")}
            >
              ⏱ Soonest
            </button>
            <button
              className={"seg" + (sortMode === "announced" ? " on" : "")}
              onClick={() => setSortMode("announced")}
            >
              ✨ Just announced
            </button>
          </div>
          <div className="cards">
            {buildGroups(shows).map((g, gi) => {
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
      )}

      {shows && shows.length === 0 && (
        <div className="empty">No upcoming shows found for these artists near {CITY_OPTS.find((c) => c[0] === city)?.[1]}. Try adding more artists or another city.</div>
      )}

      <div className="foot">
        Real data from Ticketmaster + SeatGeek · built with Stripe Projects for <b>Ship &rsquo;26</b>
        <br />
        in ~20 minutes by <a href="https://jacobhl.com" target="_blank" rel="noreferrer">Jacob</a>
      </div>
      <audio ref={audioRef} hidden />
    </div>
  );
}
