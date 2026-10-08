import express from 'express';
import fs from 'node:fs';

// Stateless API: the catalog is read once at startup and kept in memory. Nothing is ever written to disk.
let D = { artists: [], albums: [], songs: {} };
try {
  D = JSON.parse(fs.readFileSync(process.env.CATALOG || new URL('../assets/catalog.json', import.meta.url), 'utf8'));
} catch (e) { console.warn('No catalog loaded:', e.message); }

const artists = new Map(D.artists.map(a => [a.id, a]));
const bay = a => (a.votes ? (a.votes * a.rating + 10.5) / (a.votes + 3) : 0); // weighted community rating
const SORT = {
  top: (a, b) => bay(b) - bay(a),
  new: (a, b) => (b.year || 0) - (a.year || 0),
  old: (a, b) => (a.year || 9999) - (b.year || 9999),
  title: (a, b) => a.title.localeCompare(b.title),
};
const cnt = arr => {
  const m = {}; arr.forEach(x => (m[x] = (m[x] || 0) + 1));
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const has = (s, q) => String(s || '').toLowerCase().includes(q);

const app = express();
app.disable('x-powered-by');
app.get('/healthz', (_, res) => res.send('ok'));

app.get('/api/stats', (_, res) => res.json({
  artists: D.artists.length, albums: D.albums.length,
  songs: Object.values(D.songs).reduce((n, t) => n + t.length, 0),
}));

app.get('/api/facets', (_, res) => res.json({
  decades: [...new Set(D.albums.filter(a => a.year).map(a => Math.floor(a.year / 10) * 10))].sort(),
  genres: cnt(D.albums.flatMap(a => a.genres || [])),
  langs: cnt(D.albums.map(a => a.lang).filter(Boolean)),
}));

app.get('/api/albums', (req, res) => {
  const { sort = 'top', dec, genre, lang, artist } = req.query;
  const limit = Math.min(+req.query.limit || 100, 5000);
  const items = D.albums.filter(a =>
    (!dec || Math.floor((a.year || 0) / 10) * 10 == dec) &&
    (!genre || (a.genres || []).includes(genre)) &&
    (!lang || a.lang === lang) && (!artist || a.artist_id === artist));
  items.sort(SORT[sort] || SORT.top);
  res.json({ total: items.length, items: items.slice(0, limit) });
});

app.get('/api/albums/:id', (req, res) => {
  const a = D.albums.find(x => x.id === req.params.id);
  a ? res.json({ ...a, songs: D.songs[a.id] || [] }) : res.status(404).json({ error: 'not found' });
});

app.get('/api/artists', (_, res) =>
  res.json([...D.artists].sort((a, b) => a.name.localeCompare(b.name))));

app.get('/api/artists/:id', (req, res) => {
  const a = artists.get(req.params.id);
  a ? res.json({ ...a, albums: D.albums.filter(x => x.artist_id === a.id).sort(SORT.old) })
    : res.status(404).json({ error: 'not found' });
});

app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  if (!q) return res.json({ artists: [], albums: [] });
  res.json({
    artists: D.artists.filter(a => has(a.name, q) || (a.native || []).some(n => has(n, q))).slice(0, 20),
    albums: D.albums.filter(a => has(a.title, q) || has(a.artist, q)).sort(SORT.top).slice(0, 100),
  });
});

// In the single-container (Cloud Run) build, the compiled React app is served from here.
const PUBLIC = process.env.PUBLIC_DIR;
if (PUBLIC && fs.existsSync(PUBLIC)) app.use(express.static(PUBLIC, { maxAge: '1h' }));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`SwaraDB API on :${port} (${D.albums.length} albums)`));
