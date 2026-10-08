#!/usr/bin/env python3
"""Download Indian artists, albums, songs, genres, languages, ratings and bios.

Sources: MusicBrainz (CC0 core data, community ratings), Wikidata + Wikipedia (artist bios, CC BY-SA).
Writes:  data/swaradb.sqlite   and   assets/catalog.json  (read by web/index.html)

From the repo root:
  pip install requests
  python scripts/fetch_indian_music.py --email you@example.com --artists 200 --songs --bios
--songs : tracklists + album language (1 extra request per album)
--bios  : Wikipedia summary per artist (2-3 extra requests per artist)
Resumable. If you ran an older version, delete data/swaradb.sqlite first.
MusicBrainz allows ~1 request/second, so large runs take hours.
"""
import argparse, json, os, sqlite3, time
from urllib.parse import quote
import requests

ap = argparse.ArgumentParser()
ap.add_argument("--email", required=True)
ap.add_argument("--artists", type=int, default=100)
ap.add_argument("--songs", action="store_true")
ap.add_argument("--bios", action="store_true")
args = ap.parse_args()
HDR = {"User-Agent": f"SwaraDB/0.2 ( {args.email} )"}
os.makedirs("data", exist_ok=True); os.makedirs("assets", exist_ok=True)

LANG = {"tam": "Tamil", "hin": "Hindi", "tel": "Telugu", "mal": "Malayalam", "kan": "Kannada", "ben": "Bengali",
        "pan": "Punjabi", "mar": "Marathi", "guj": "Gujarati", "urd": "Urdu", "eng": "English", "san": "Sanskrit",
        "ori": "Odia", "ory": "Odia", "asm": "Assamese", "zxx": "Instrumental", "mul": "Multiple"}
NATIVE = {"ta", "hi", "te", "ml", "kn", "bn", "pa", "mr", "gu", "ur", "or", "as", "sa"}

def mb(path, **p):
    p["fmt"] = "json"
    for _ in range(5):
        time.sleep(1.1)
        r = requests.get("https://musicbrainz.org/ws/2/" + path, params=p, headers=HDR, timeout=40)
        if r.status_code in (429, 502, 503):
            time.sleep(8); continue
        r.raise_for_status(); return r.json()
    raise RuntimeError("MusicBrainz kept refusing: " + path)

def wiki(aid):
    try:
        rels = mb("artist/" + aid, inc="url-rels").get("relations", [])
        wd = next((r["url"]["resource"].rsplit("/", 1)[-1] for r in rels if r["type"] == "wikidata"), None)
        if not wd: return None, None
        e = requests.get(f"https://www.wikidata.org/wiki/Special:EntityData/{wd}.json", headers=HDR, timeout=30).json()["entities"][wd]
        t = e.get("sitelinks", {}).get("enwiki", {}).get("title")
        if not t: return None, None
        s = requests.get("https://en.wikipedia.org/api/rest_v1/page/summary/" + quote(t.replace(" ", "_")), headers=HDR, timeout=30).json()
        return s.get("extract"), s.get("content_urls", {}).get("desktop", {}).get("page")
    except Exception as ex:
        print("  bio skipped:", ex); return None, None

db = sqlite3.connect("data/swaradb.sqlite")
db.executescript("""
CREATE TABLE IF NOT EXISTS artists(id TEXT PRIMARY KEY,name TEXT,type TEXT,begin TEXT,area TEXT,native TEXT,genres TEXT,bio TEXT,wiki TEXT);
CREATE TABLE IF NOT EXISTS albums(id TEXT PRIMARY KEY,title TEXT,artist_id TEXT,artist TEXT,year INT,type TEXT,genres TEXT,lang TEXT,rating REAL,votes INT);
CREATE TABLE IF NOT EXISTS songs(album_id TEXT,n INT,title TEXT,len TEXT,PRIMARY KEY(album_id,n,title));
""")
mmss = lambda ms: f"{ms//60000}:{ms//1000%60:02d}" if ms else ""
top = lambda items, k=5: [x["name"] for x in sorted(items or [], key=lambda x: -x.get("count", 0))[:k]]

have = {r[0] for r in db.execute("SELECT id FROM artists")}
found = []
for off in range(0, args.artists, 100):
    found += [a for a in mb("artist", query="country:IN", limit=min(100, args.artists - off), offset=off).get("artists", []) if a["id"] not in have]
print(len(found), "new artists")

for i, a in enumerate(found, 1):
    native = [x["name"] for x in a.get("aliases", []) if x.get("locale") in NATIVE]
    bio, link = wiki(a["id"]) if args.bios else (None, None)
    db.execute("INSERT OR IGNORE INTO artists VALUES(?,?,?,?,?,?,?,?,?)",
               (a["id"], a["name"], a.get("type"), (a.get("life-span") or {}).get("begin"), (a.get("area") or {}).get("name"),
                json.dumps(sorted(set(native))), json.dumps(top(a.get("tags"))), bio, link))
    rgs = mb("release-group", artist=a["id"], type="album|ep", inc="genres+ratings", limit=100).get("release-groups", [])
    for g in rgs:
        d = g.get("first-release-date", "")
        year = int(d[:4]) if d[:4].isdigit() else None
        kind = ", ".join([g.get("primary-type") or "Album"] + g.get("secondary-types", []))
        rt = g.get("rating") or {}
        lang = None
        if args.songs:
            rel = mb("release", **{"release-group": g["id"], "inc": "recordings", "limit": 1}).get("releases", [])
            if rel:
                code = (rel[0].get("text-representation") or {}).get("language")
                lang = LANG.get(code, code)
                for m in rel[0].get("media", []):
                    for t in m.get("tracks", []):
                        db.execute("INSERT OR IGNORE INTO songs VALUES(?,?,?,?)", (g["id"], t.get("position"), t["title"], mmss(t.get("length"))))
        db.execute("INSERT OR IGNORE INTO albums VALUES(?,?,?,?,?,?,?,?,?,?)",
                   (g["id"], g["title"], a["id"], a["name"], year, kind, json.dumps(top(g.get("genres"))), lang, rt.get("value"), rt.get("votes-count") or 0))
    db.commit()
    print(f"[{i}/{len(found)}] {a['name']}: {len(rgs)} albums")

def rows(sql, jcols=()):
    cur = db.execute(sql); k = [c[0] for c in cur.description]; out = []
    for r in cur:
        d = dict(zip(k, r))
        for c in jcols: d[c] = json.loads(d[c] or "[]")
        out.append(d)
    return out
songs = {}
for s in rows("SELECT * FROM songs ORDER BY album_id,n"):
    songs.setdefault(s.pop("album_id"), []).append(s)
with open("assets/catalog.json", "w", encoding="utf-8") as f:
    json.dump({"artists": rows("SELECT * FROM artists", ("native", "genres")),
               "albums": rows("SELECT * FROM albums", ("genres",)), "songs": songs}, f, ensure_ascii=False)
print("Done: data/swaradb.sqlite and assets/catalog.json")
