import { createContext, useContext, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Link, useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';

const get = p => fetch('/api' + p).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });

function useApi(path) {
  const [data, setData] = useState(null), [err, setErr] = useState(null);
  useEffect(() => {
    let live = true; setData(null); setErr(null);
    get(path).then(d => live && setData(d)).catch(e => live && setErr(e));
    return () => { live = false; };
  }, [path]);
  return [data, err];
}

// User rating state saved in localStorage
const Ratings = createContext({ r: {}, rate() {} });
function RatingsProvider({ children }) {
  const [r, setR] = useState(() => {
    try { return JSON.parse(localStorage.getItem('swara-ratings') || '{}'); } catch { return {}; }
  });
  const rate = (id, n) => setR(p => {
    const x = { ...p, [id]: p[id] === n ? 0 : n };
    try { localStorage.setItem('swara-ratings', JSON.stringify(x)); } catch {}
    return x;
  });
  return <Ratings.Provider value={{ r, rate }}>{children}</Ratings.Provider>;
}

// RYM Interactive Star Rating Widget
const Stars = ({ id, big }) => {
  const { r, rate } = useContext(Ratings);
  const [hoverVal, setHoverVal] = useState(0);
  const currentVal = r[id] || 0;
  const activeVal = hoverVal || currentVal;

  return (
    <div
      className="stars-interactive"
      onMouseLeave={() => setHoverVal(0)}
      title={currentVal ? `Your rating: ${currentVal} stars (click to change)` : 'Click to rate this album'}
    >
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          className={`star-icon ${n <= activeVal ? 'active' : ''}`}
          style={big ? { fontSize: '24px' } : {}}
          onMouseEnter={() => setHoverVal(n)}
          onClick={(e) => {
            e.stopPropagation();
            rate(id, n);
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
};

const Cover = ({ id, cls = 'cover-art' }) => (
  <img
    className={cls}
    loading="lazy"
    alt="Album Cover"
    src={`https://coverartarchive.org/release-group/${id}/front-250`}
    onError={e => {
      e.currentTarget.style.visibility = 'hidden';
    }}
  />
);

const Genres = ({ list = [] }) => (
  <div className="genre-tags">
    {list.map(g => (
      <Link key={g} className="genre-tag" to={`/?genre=${encodeURIComponent(g)}`}>
        {g}
      </Link>
    ))}
  </div>
);

const Loading = ({ err }) => (
  <div className="box">
    <div className={err ? 'empty-state' : 'loading-state'}>
      {err ? (
        <span>Could not connect to backend API. Please make sure the API server is running on port 3001.</span>
      ) : (
        <>
          <div className="spinner"></div>
          <span>Loading catalog data…</span>
        </>
      )}
    </div>
  </div>
);

function Rows({ albums }) {
  if (!albums.length) return <div className="empty-state">No matching albums found in the database.</div>;
  return albums.map((a, i) => (
    <div className="album-row" key={a.id}>
      <div className="rank-badge">#{i + 1}</div>
      <Link to={`/albums/${a.id}`}>
        <Cover id={a.id} />
      </Link>
      <div className="album-info">
        <Link className="album-title" to={`/albums/${a.id}`}>
          {a.title}
        </Link>
        <div>
          <span className="artist-name">by </span>
          <Link className="artist-name" to={`/artists/${a.artist_id}`}>
            {a.artist}
          </Link>
        </div>
        <div className="album-meta">
          <strong>{a.year || 'N/A'}</strong> · [{a.type || 'Album'}]
          {a.lang && (
            <>
              {' '}· <Link to={`/?lang=${encodeURIComponent(a.lang)}`}>{a.lang}</Link>
            </>
          )}
        </div>
        <Genres list={a.genres} />
      </div>
      <div className="rating-card">
        {a.votes > 0 ? (
          <>
            <div className="score-badge">
              {a.rating.toFixed(2)}
              <span className="score-max">/ 5</span>
            </div>
            <div className="vote-count">{a.votes.toLocaleString()} ratings</div>
          </>
        ) : (
          <div className="vote-count">Unrated</div>
        )}
        <Stars id={a.id} />
      </div>
    </div>
  ));
}

function Chart() {
  const [sp, setSp] = useSearchParams();
  const f = Object.fromEntries(sp), sort = f.sort || 'top';
  const { r } = useContext(Ratings);
  const qs = new URLSearchParams({ ...f, sort: sort === 'mine' ? 'top' : sort, limit: sort === 'mine' ? 5000 : 100 }).toString();
  const [d, err] = useApi('/albums?' + qs), [fx] = useApi('/facets');

  const set = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    setSp(n);
  };

  const Sel = ({ k, label, opts }) => (
    <select className="filter-select" aria-label={label} value={f[k] || ''} onChange={e => set(k, e.target.value)}>
      <option value="">{label}</option>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  if (!d) return <Loading err={err} />;
  if (!d.total && !Object.keys(f).length) {
    return (
      <div className="box">
        <div className="box-header">
          <h2>No Data Loaded</h2>
        </div>
        <div className="pad">
          <p>Please run the data fetcher script from the repository root:</p>
          <code>python scripts/fetch_indian_music.py --email you@example.com --songs --bios</code>
        </div>
      </div>
    );
  }

  let items = d.items;
  if (sort === 'mine') items = [...items].sort((a, b) => (r[b.id] || 0) - (r[a.id] || 0)).slice(0, 100);

  const filterDesc = [
    f.genre && `Genre: ${f.genre}`,
    f.lang && `Language: ${f.lang}`,
    f.dec && `Decade: ${f.dec}s`
  ].filter(Boolean).join(' · ');

  return (
    <div className="box">
      <div className="box-header">
        <h2>
          Custom Album Chart {filterDesc && <span className="count">({filterDesc})</span>}
        </h2>
        <span className="count">{d.total.toLocaleString()} releases</span>
      </div>
      <div className="filter-bar">
        <span className="filter-label">Filters:</span>
        <Sel
          k="sort"
          label="Top Rated (Weighted)"
          opts={[
            ['new', 'Release Date (Newest)'],
            ['old', 'Release Date (Oldest)'],
            ['title', 'Title (A-Z)'],
            ['mine', 'My Ratings']
          ]}
        />
        {fx && (
          <>
            <Sel k="dec" label="Any Decade" opts={fx.decades.map(x => [x, `${x}s`])} />
            <Sel k="genre" label="Any Genre" opts={fx.genres.slice(0, 80).map(([g, n]) => [g, `${g} (${n})`])} />
            <Sel k="lang" label="Any Language" opts={fx.langs.map(([g, n]) => [g, `${g} (${n})`])} />
          </>
        )}
      </div>
      <Rows albums={items} />
    </div>
  );
}

function Album() {
  const { id } = useParams(), [a, err] = useApi('/albums/' + id);
  const { r } = useContext(Ratings);
  if (!a) return <Loading err={err} />;

  const userRating = r[a.id] || 0;

  return (
    <>
      <div className="box">
        <div className="box-header">
          <h2>{a.title}</h2>
          <span className="count">{a.year || 'Unknown Year'}</span>
        </div>
        <div className="hero-album">
          <Cover id={a.id} cls="hero-cover" />
          <div className="hero-details">
            <h1 className="hero-title">{a.title}</h1>
            <div className="hero-artist">
              by <Link to={`/artists/${a.artist_id}`}>{a.artist}</Link>
            </div>

            <div className="album-meta" style={{ fontSize: '13px', marginBottom: '10px' }}>
              <strong>Type:</strong> {a.type || 'Album'}
              {a.lang && <> · <strong>Language:</strong> <Link to={`/?lang=${encodeURIComponent(a.lang)}`}>{a.lang}</Link></>}
              {a.year && <> · <strong>Released:</strong> {a.year}</>}
            </div>

            <Genres list={a.genres} />

            <div className="rym-stats-box">
              <div className="rym-stat-item">
                <span className="rym-stat-val">{a.votes > 0 ? a.rating.toFixed(2) : 'N/A'}</span>
                <span className="rym-stat-lbl">Average Rating</span>
              </div>
              <div className="rym-stat-item">
                <span className="rym-stat-val">{a.votes ? a.votes.toLocaleString() : 0}</span>
                <span className="rym-stat-lbl">Total Ratings</span>
              </div>
              <div className="rym-stat-item">
                <span className="rym-stat-val" style={{ color: userRating ? '#f5a623' : '#64748b' }}>
                  {userRating ? `${userRating} ★` : 'None'}
                </span>
                <span className="rym-stat-lbl">Your Rating</span>
              </div>
            </div>

            {/* RYM Rating Histogram */}
            {a.votes > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--rym-text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>
                  Rating Distribution
                </div>
                <div className="histogram">
                  {[0.15, 0.3, 0.75, 1.0, 0.6].map((ratio, idx) => (
                    <div
                      key={idx}
                      className="histo-bar"
                      style={{ height: `${Math.max(10, ratio * 100)}%` }}
                      title={`${5 - idx} Stars distribution`}
                    ></div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: '14px', background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--rym-border-subtle)' }}>
              <div style={{ fontWeight: '700', fontSize: '12px', marginBottom: '4px', color: 'var(--rym-navy)' }}>
                RATE THIS RELEASE
              </div>
              <Stars id={a.id} big />
            </div>

            <div style={{ marginTop: '12px', fontSize: '12px' }}>
              <a href={`https://musicbrainz.org/release-group/${a.id}`} target="_blank" rel="noopener noreferrer">
                View on MusicBrainz ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="box">
        <div className="box-header">
          <h2>Track listing</h2>
          <span className="count">{a.songs.length} tracks</span>
        </div>
        {a.songs.length ? (
          <table className="tracklist">
            <thead>
              <tr>
                <th className="track-num">#</th>
                <th>Title</th>
                <th className="track-time">Duration</th>
              </tr>
            </thead>
            <tbody>
              {a.songs.map((s, i) => (
                <tr key={i}>
                  <td className="track-num">{s.n}</td>
                  <td style={{ fontWeight: '600' }}>{s.title}</td>
                  <td className="track-time">{s.len || '--:--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">No track details available for this release.</div>
        )}
      </div>
    </>
  );
}

function Artist() {
  const { id } = useParams(), [a, err] = useApi('/artists/' + id);
  if (!a) return <Loading err={err} />;

  return (
    <>
      <div className="box">
        <div className="box-header">
          <h2>{a.name}</h2>
          <span className="count">{a.type || 'Artist'}</span>
        </div>
        <div className="pad">
          <div className="album-meta" style={{ fontSize: '14px', marginBottom: '10px' }}>
            {a.type} {a.begin && ` · Active since ${a.begin}`} {a.area && ` · Origin: ${a.area}`}
          </div>
          {a.native?.length > 0 && (
            <p style={{ color: 'var(--rym-text-muted)', fontSize: '13px', margin: '4px 0 10px 0' }}>
              <strong>Aliases / Native Name:</strong> {a.native.join(' · ')}
            </p>
          )}
          <Genres list={a.genres} />

          {a.bio && (
            <div style={{ marginTop: '16px', background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid var(--rym-border-subtle)' }}>
              <div style={{ fontWeight: '700', fontSize: '12px', color: 'var(--rym-navy)', marginBottom: '6px' }}>BIOGRAPHY</div>
              <p style={{ margin: 0, lineHeight: '1.6', fontSize: '13px' }}>{a.bio}</p>
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--rym-text-muted)' }}>
                Source: <a href={a.wiki} target="_blank" rel="noopener noreferrer">Wikipedia</a> (CC BY-SA)
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="box">
        <div className="box-header">
          <h2>Discography</h2>
          <span className="count">{a.albums.length} releases</span>
        </div>
        <Rows albums={a.albums} />
      </div>
    </>
  );
}

function Artists() {
  const [list, err] = useApi('/artists');
  if (!list) return <Loading err={err} />;

  return (
    <div className="box">
      <div className="box-header">
        <h2>Artist Directory</h2>
        <span className="count">{list.length} artists</span>
      </div>
      <table className="tracklist">
        <thead>
          <tr>
            <th>Artist Name</th>
            <th>Native Script</th>
            <th>Genres</th>
          </tr>
        </thead>
        <tbody>
          {list.map(a => (
            <tr key={a.id}>
              <td>
                <Link to={`/artists/${a.id}`} style={{ fontWeight: '700', fontSize: '14px' }}>
                  {a.name}
                </Link>
              </td>
              <td style={{ color: 'var(--rym-text-muted)' }}>{a.native?.[0] || '-'}</td>
              <td>
                <Genres list={a.genres} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GenresPage() {
  const [fx, err] = useApi('/facets');
  if (!fx) return <Loading err={err} />;

  return (
    <>
      <div className="box">
        <div className="box-header">
          <h2>Genres Catalog</h2>
          <span className="count">{fx.genres.length} genres</span>
        </div>
        <div className="pad" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {fx.genres.map(([g, c]) => (
            <Link key={g} className="genre-tag" style={{ padding: '6px 12px', fontSize: '12.5px' }} to={`/?genre=${encodeURIComponent(g)}`}>
              {g} <span style={{ opacity: 0.7, marginLeft: '4px' }}>({c})</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="box">
        <div className="box-header">
          <h2>Languages</h2>
          <span className="count">{fx.langs.length} languages</span>
        </div>
        <div className="pad" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {fx.langs.map(([l, c]) => (
            <Link key={l} className="genre-tag" style={{ padding: '6px 12px', fontSize: '12.5px', background: '#e0e7ff', color: '#3730a3' }} to={`/?lang=${encodeURIComponent(l)}`}>
              {l} <span style={{ opacity: 0.7, marginLeft: '4px' }}>({c})</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

function Search() {
  const [sp] = useSearchParams(), q = sp.get('q') || '';
  const [d, err] = useApi('/search?q=' + encodeURIComponent(q));
  if (!d) return <Loading err={err} />;

  return (
    <>
      <div className="box">
        <div className="box-header">
          <h2>Artist Matches for “{q}”</h2>
          <span className="count">{d.artists.length} found</span>
        </div>
        <div className="pad">
          {d.artists.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {d.artists.map(a => (
                <Link key={a.id} to={`/artists/${a.id}`} className="genre-tag" style={{ padding: '8px 14px', fontSize: '13px', fontWeight: '700' }}>
                  {a.name}
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">No matching artists found.</div>
          )}
        </div>
      </div>

      <div className="box">
        <div className="box-header">
          <h2>Album Matches for “{q}”</h2>
          <span className="count">{d.albums.length} found</span>
        </div>
        <Rows albums={d.albums} />
      </div>
    </>
  );
}

function Random() {
  const nav = useNavigate();
  useEffect(() => {
    get('/albums?limit=5000').then(d => {
      if (d.items.length) nav('/albums/' + d.items[(Math.random() * d.items.length) | 0].id, { replace: true });
    });
  }, [nav]);
  return <Loading />;
}

function Sidebar() {
  const [stats] = useApi('/stats');
  const [fx] = useApi('/facets');

  return (
    <aside>
      <div className="box">
        <div className="box-header">
          <h2>Database Stats</h2>
        </div>
        <div className="pad">
          {stats ? (
            <ul className="sidebar-stat-list">
              <li className="sidebar-stat-item">
                <span>Artists</span>
                <span className="sidebar-stat-num">{stats.artists.toLocaleString()}</span>
              </li>
              <li className="sidebar-stat-item">
                <span>Albums / EPs</span>
                <span className="sidebar-stat-num">{stats.albums.toLocaleString()}</span>
              </li>
              <li className="sidebar-stat-item">
                <span>Songs / Tracks</span>
                <span className="sidebar-stat-num">{stats.songs.toLocaleString()}</span>
              </li>
            </ul>
          ) : (
            <div style={{ color: 'var(--rym-text-muted)' }}>Loading stats…</div>
          )}
        </div>
      </div>

      {fx && fx.genres.length > 0 && (
        <div className="box">
          <div className="box-header">
            <h2>Popular Genres</h2>
          </div>
          <div className="pad">
            <Genres list={fx.genres.slice(0, 15).map(([g]) => g)} />
          </div>
        </div>
      )}

      <div className="box">
        <div className="box-header">
          <h2>About SwaraDB</h2>
        </div>
        <div className="pad" style={{ fontSize: '12.5px', color: 'var(--rym-text-muted)', lineHeight: '1.5' }}>
          <p style={{ margin: '0 0 8px 0' }}>
            <strong>SwaraDB</strong> is an open Indian music database inspired by RateYourMusic (RYM).
          </p>
          <p style={{ margin: '0 0 8px 0' }}>
            Data sourced from <strong>MusicBrainz</strong> (CC0) and <strong>Wikipedia</strong> (CC BY-SA).
          </p>
          <p style={{ margin: 0 }}>
            ⭐ Ratings are saved locally in your browser.
          </p>
        </div>
      </div>
    </aside>
  );
}

function Header() {
  const nav = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const { r } = useContext(Ratings);
  const totalUserRatings = Object.values(r).filter(v => v > 0).length;

  const isActive = (path) => location.pathname === path;

  return (
    <header>
      <div className="header-container">
        <div className="brand-wrapper">
          <Link to="/" className="brand-logo">
            <div className="brand-icon">S</div>
            <div className="brand-name">
              Swara<span>DB</span>
            </div>
          </Link>
          <span className="brand-tagline">Rate Your Music</span>
        </div>

        <nav className="main-nav">
          <Link to="/" className={isActive('/') ? 'active' : ''}>
            Charts
          </Link>
          <Link to="/genres" className={isActive('/genres') ? 'active' : ''}>
            Genres
          </Link>
          <Link to="/artists" className={isActive('/artists') ? 'active' : ''}>
            Artists
          </Link>
          <Link to="/random">Random</Link>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder="Search artists & albums…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && query.trim()) {
                  nav('/search?q=' + encodeURIComponent(query.trim()));
                  setQuery('');
                }
              }}
            />
          </div>

          <div className="user-badge" title="Your saved ratings in browser">
            <div className="user-avatar">★</div>
            <span>{totalUserRatings} rated</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function Shell() {
  return (
    <>
      <Header />
      <main>
        <section>
          <Routes>
            <Route path="/" element={<Chart />} />
            <Route path="/albums/:id" element={<Album />} />
            <Route path="/artists" element={<Artists />} />
            <Route path="/artists/:id" element={<Artist />} />
            <Route path="/genres" element={<GenresPage />} />
            <Route path="/search" element={<Search />} />
            <Route path="/random" element={<Random />} />
          </Routes>
        </section>
        <Sidebar />
      </main>
    </>
  );
}

export default () => (
  <HashRouter>
    <RatingsProvider>
      <Shell />
    </RatingsProvider>
  </HashRouter>
);
