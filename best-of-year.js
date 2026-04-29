function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LS_KEY = 'indie_timeline_v1';
const tierLabels = {
  essential: 'Essential',
  pioneer: 'Pioneering Sounds',
  influence: 'Early Influence',
  postinfluence: 'Post-Influence'
};

const tierWeight = {
  essential: 3,
  pioneer: 2,
  postinfluence: 1,
  influence: 0
};

function stars(n) {
  return [1, 2, 3, 4, 5].map(i => (i <= n ? '★' : '☆')).join('');
}

function albumArt(entry) {
  if (entry.art) {
    return `<img src="${esc(entry.art)}" alt="${esc(entry.title)} album art" loading="lazy">`;
  }

  return `
    <div class="year-art-fallback" style="background:${esc(entry.artBg || '#181818')};color:${esc(entry.artColor || '#999')}">
      <div>${esc(entry.title)}<br><span style="opacity:.65">${esc(entry.artist)}</span></div>
    </div>
  `;
}

function audioEmbedHtml(url) {
  if (!url) return '';
  const sp = url.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/);
  if (sp) {
    return `<iframe src="https://open.spotify.com/embed/${sp[1]}/${sp[2]}?utm_source=generator" height="152" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
  }
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
  if (yt) {
    return `<a class="year-action" href="${esc(url)}" target="_blank" rel="noopener">Watch on YouTube</a>`;
  }
  if (url.includes('soundcloud.com')) {
    return `<a class="year-action" href="${esc(url)}" target="_blank" rel="noopener">Listen on SoundCloud</a>`;
  }
  if (/\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(url)) {
    return `<audio controls><source src="${esc(url)}">Your browser doesn't support audio.</audio>`;
  }
  return `<a class="year-action" href="${esc(url)}" target="_blank" rel="noopener">Open link</a>`;
}

function excerpt(...parts) {
  return parts.find(Boolean) || '';
}

function yearLink(year) {
  return `best-of-year.html?year=${encodeURIComponent(year)}`;
}

function persist() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    saved.entries = ENTRIES;
    localStorage.setItem(LS_KEY, JSON.stringify(saved));
  } catch (e) {
    // Ignore persistence failures in private browsing or quota limits.
  }
}

function loadPersistedEntries() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved.entries) || !saved.entries.length) return;
    ENTRIES.length = 0;
    saved.entries.forEach(entry => ENTRIES.push(entry));
  } catch (e) {
    // Ignore corrupted local data and fall back to baked-in entries.
  }
}

function compareDefaultYearOrder(a, b) {
  const ratingDiff = (b.entry.rating || 0) - (a.entry.rating || 0);
  if (ratingDiff !== 0) return ratingDiff;

  const tierDiff = (tierWeight[b.entry.tier] || 0) - (tierWeight[a.entry.tier] || 0);
  if (tierDiff !== 0) return tierDiff;

  return a.idx - b.idx;
}

function allAlbums() {
  return ENTRIES
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => entry.type === 'album' && Number.isFinite(entry.year));
}

function sortedYearAlbums(year) {
  const albums = allAlbums().filter(({ entry }) => entry.year === year);
  const ranked = albums.every(({ entry }) => Number.isFinite(entry.yearRank));
  const sorted = albums.slice().sort((a, b) => {
    if (Number.isFinite(a.entry.yearRank) || Number.isFinite(b.entry.yearRank)) {
      if (!Number.isFinite(a.entry.yearRank)) return 1;
      if (!Number.isFinite(b.entry.yearRank)) return -1;
      if (a.entry.yearRank !== b.entry.yearRank) return a.entry.yearRank - b.entry.yearRank;
    }
    return compareDefaultYearOrder(a, b);
  });

  if (!ranked && sorted.length) {
    sorted.forEach(({ entry }, i) => {
      entry.yearRank = i + 1;
    });
    persist();
  }

  return sorted;
}

loadPersistedEntries();

const years = [...new Set(allAlbums().map(({ entry }) => entry.year))].sort((a, b) => b - a);
const params = new URLSearchParams(window.location.search);
const requestedYear = Number.parseInt(params.get('year'), 10);
const activeYear = years.includes(requestedYear) ? requestedYear : years[0];

let isEditing = false;
let activePlayerIndex = null;

function renderYearNav() {
  document.getElementById('year-nav').innerHTML = years
    .map(year => `<a class="year-pill${year === activeYear ? ' is-active' : ''}" href="${yearLink(year)}">${year}</a>`)
    .join('');
}

function renderList() {
  const list = document.getElementById('year-list');
  const yearAlbums = sortedYearAlbums(activeYear);

  document.getElementById('year-title').textContent = `Best Albums of ${activeYear}`;
  document.getElementById('year-dek').textContent =
    `${yearAlbums.length} album${yearAlbums.length === 1 ? '' : 's'} from your timeline, sequenced as a year-end list view inspired by editorial countdown packages.`;
  document.getElementById('ranking-note').textContent = isEditing
    ? 'Use the arrow buttons to move records up or down within this year. The new order is saved locally right away and will be included when you export your updated data.'
    : 'Albums are ordered by your saved year ranking. If a year has never been ranked before, this page seeds the list from your star ratings, special tiers, and original timeline order.';
  document.getElementById('timeline-link').href = 'index.html';
  document.body.classList.toggle('is-editing', isEditing);

  if (!yearAlbums.length) {
    list.innerHTML = `
      <section class="year-empty">
        <h2>No albums for ${esc(activeYear)}</h2>
        <p>There are no album entries tied to this release year yet. Add some on the timeline and this view will populate automatically.</p>
      </section>
    `;
    return;
  }

  list.innerHTML = yearAlbums.map(({ entry }, i) => {
    const copy = excerpt(entry.review, entry.context, entry.tagline);
    const tags = (entry.tags || []).map(tag => `<span class="year-tag">${esc(tag)}</span>`).join('');
    const tier = tierLabels[entry.tier] ? `<div class="year-tier">${esc(tierLabels[entry.tier])}</div>` : '';
    const audio = entry.audio
      ? `<button class="year-action" type="button" data-listen="${i}" aria-expanded="${activePlayerIndex === i ? 'true' : 'false'}">${activePlayerIndex === i ? 'Hide player' : 'Listen'}</button>`
      : '';

    return `
      <article class="year-card">
        <div class="year-rank">
          <div class="year-rank-num">${i + 1}</div>
          <div class="year-rank-meta">${esc(activeYear)}</div>
          <div class="year-rank-controls edit-only">
            <button class="year-rank-btn" type="button" data-move="up" data-rank="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(entry.title)} up">↑</button>
            <button class="year-rank-btn" type="button" data-move="down" data-rank="${i}" ${i === yearAlbums.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(entry.title)} down">↓</button>
          </div>
        </div>
        <div class="year-art">${albumArt(entry)}</div>
        <div class="year-copy">
          ${tier}
          <div class="year-title-row">
            <h2 class="year-album-title">${esc(entry.title)}</h2>
          </div>
          <div class="year-artist">${esc(entry.artist)}</div>
          <div class="year-rating" aria-label="${esc(entry.rating || 0)} out of 5 stars">${stars(entry.rating || 0)}</div>
          ${entry.tagline ? `<p class="year-tagline">${esc(entry.tagline)}</p>` : ''}
          ${copy ? `<p class="year-review">${esc(copy)}</p>` : ''}
          ${entry.context && entry.context !== copy ? `<p class="year-context">${esc(entry.context)}</p>` : ''}
          ${tags ? `<div class="year-tags">${tags}</div>` : ''}
          ${audio ? `<div class="year-actions">${audio}</div>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

function playYearAlbum(index) {
  const yearAlbums = sortedYearAlbums(activeYear);
  const item = yearAlbums[index];
  if (!item || !item.entry.audio) return;
  const entry = item.entry;
  const url = entry.audio;

  const player = document.getElementById('mini-player');
  const iframe = document.getElementById('mini-player-iframe');
  const audio = document.getElementById('mini-player-audio');
  const titleEl = document.getElementById('mini-player-title');

  if (activePlayerIndex === index && player.classList.contains('visible')) {
    closeMiniPlayer();
    return;
  }

  const sp = url.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/);
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
  const sc = url.includes('soundcloud.com');
  const af = /\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(url);

  let iframeSrc = '';
  let iframeH = 80;
  let useAudio = false;

  if (sp) {
    iframeSrc = `https://open.spotify.com/embed/${sp[1]}/${sp[2]}?utm_source=generator&autoplay=1&theme=0`;
  } else if (yt) {
    window.open(url, '_blank');
    return;
  } else if (sc) {
    iframeSrc = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&color=%23ff5500&hide_related=true&show_comments=false&show_teaser=false`;
    iframeH = 120;
  } else if (af) {
    useAudio = true;
  } else {
    window.open(url, '_blank');
    return;
  }

  activePlayerIndex = index;
  titleEl.textContent = `${entry.artist}  —  ${entry.title}`;

  player.style.display = 'block';
  void player.offsetWidth;
  player.classList.add('visible');

  if (useAudio) {
    iframe.style.display = 'none';
    iframe.src = '';
    audio.style.display = 'block';
    audio.src = url;
    audio.play().catch(() => {});
  } else {
    audio.style.display = 'none';
    audio.pause();
    audio.src = '';
    const curIframe = document.getElementById('mini-player-iframe');
    const fresh = document.createElement('iframe');
    fresh.id = 'mini-player-iframe';
    fresh.height = String(iframeH);
    fresh.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
    fresh.setAttribute('allowtransparency', 'true');
    fresh.style.cssText = 'width:100%;display:block;border:none';
    fresh.src = iframeSrc;
    curIframe.replaceWith(fresh);
  }

  renderList();
}

function closeMiniPlayer() {
  const player = document.getElementById('mini-player');
  const iframe = document.getElementById('mini-player-iframe');
  const audio = document.getElementById('mini-player-audio');
  player.classList.remove('visible');
  setTimeout(() => {
    player.style.display = 'none';
    iframe.src = '';
    audio.pause();
    audio.src = '';
    activePlayerIndex = null;
    renderList();
  }, 240);
}

function swapYearRank(fromIndex, toIndex) {
  const yearAlbums = sortedYearAlbums(activeYear);
  if (toIndex < 0 || toIndex >= yearAlbums.length) return;
  const reordered = yearAlbums.slice();
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  reordered.forEach(({ entry }, i) => {
    entry.yearRank = i + 1;
  });
  persist();
  renderList();
}

document.getElementById('year-list').addEventListener('click', event => {
  const btn = event.target.closest('.year-rank-btn');
  if (btn && isEditing) {
    const fromIndex = Number.parseInt(btn.dataset.rank, 10);
    const delta = btn.dataset.move === 'up' ? -1 : 1;
    swapYearRank(fromIndex, fromIndex + delta);
    return;
  }

  const listenBtn = event.target.closest('[data-listen]');
  if (!listenBtn) return;
  const index = Number.parseInt(listenBtn.dataset.listen, 10);
  playYearAlbum(index);
});

const editToggle = document.getElementById('year-edit-toggle');
if (editToggle) {
  editToggle.addEventListener('click', () => {
    isEditing = !isEditing;
    editToggle.classList.toggle('is-active', isEditing);
    editToggle.textContent = isEditing ? 'Done ranking' : 'Edit ranking';
    renderList();
  });
}

renderYearNav();
renderList();

const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);
if (isLocal) {
  document.body.classList.add('is-local');
}

document.getElementById('mini-player-close').addEventListener('click', closeMiniPlayer);
