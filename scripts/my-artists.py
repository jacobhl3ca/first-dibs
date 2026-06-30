#!/usr/bin/env python3
"""Print Jacob's Spotify taste as a JSON list of artist names (taste-rank order).
Reuses the same broad-scope cache + auth as ~/scripts/first-dibs-monitor.py so it
works locally with zero browser. Falls back to recently-played + seed, then seed-only.
Outputs {"artists": [...], "source": "..."} on stdout. LOCAL ONLY (needs the cache)."""
import os, sys, json
from pathlib import Path

CONFIG = Path.home() / ".config" / "first-dibs"
SPOTIFY_CACHE = CONFIG / ".spotify_cache"
SHARED_CACHE = Path.home() / "spotify_archive" / ".cache"
SEED = ["Brian Blade", "Yussef Dayes", "Yussef Kamaal", "Tom Misch", "Kamasi Washington",
        "Robert Glasper", "BadBadNotGood", "Makaya McCraven", "Mansur Brown", "Alfa Mist"]


def client(scope):
    sys.path.insert(0, str(Path.home() / "spotify_automation"))
    import spot_auth
    spot_auth.load_env()
    from spotipy.oauth2 import SpotifyOAuth
    import spotipy
    if SPOTIFY_CACHE.exists():
        cache = SPOTIFY_CACHE
    else:
        cache = SHARED_CACHE
        scope = spot_auth.SCOPE_ALL  # avoid scope-narrowing the shared cron cache
    auth = SpotifyOAuth(
        client_id=os.environ["SPOTIPY_CLIENT_ID"],
        client_secret=os.environ["SPOTIPY_CLIENT_SECRET"],
        redirect_uri=os.environ.get("SPOTIPY_REDIRECT_URI", "http://127.0.0.1:8888/callback"),
        scope=scope, cache_path=str(cache), open_browser=False)
    return spotipy.Spotify(auth_manager=auth)


def main():
    names, seen = [], set()

    def add(n):
        if n and n.lower() not in seen:
            seen.add(n.lower())
            names.append(n)

    if SPOTIFY_CACHE.exists():
        try:
            sp = client("user-top-read user-follow-read user-library-read user-read-recently-played")
            for tr in ("long_term", "medium_term", "short_term"):
                for a in sp.current_user_top_artists(limit=50, time_range=tr)["items"]:
                    add(a["name"])
            after = None
            for _ in range(12):
                r = sp.current_user_followed_artists(limit=50, after=after)["artists"]
                for a in r["items"]:
                    add(a["name"])
                after = r.get("cursors", {}).get("after")
                if not after:
                    break
            print(json.dumps({"artists": names, "source": "spotify-full"}))
            return
        except Exception as e:
            sys.stderr.write(f"full taste failed: {e}\n")

    try:
        sp = client("user-read-recently-played")
        for it in sp.current_user_recently_played(limit=50).get("items", []):
            for a in it["track"]["artists"]:
                add(a["name"])
        for s in SEED:
            add(s)
        print(json.dumps({"artists": names, "source": "spotify-recent+seed"}))
        return
    except Exception as e:
        sys.stderr.write(f"recent failed: {e}\n")

    print(json.dumps({"artists": SEED, "source": "seed"}))


if __name__ == "__main__":
    main()
