const http = require('node:http');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 7000);
const API = 'https://api.otakulogia.com/graphql';
const SITE = 'https://otakulogia.com';
const ADDON_ID = 'com.otakulogia.stremio';
const PAGE_SIZE = Math.min(Math.max(Number(process.env.PAGE_SIZE || 100), 1), 100);

const ANIME_FIELDS = `id upstreamCid name slug nameEn year status synopsis posterUrl audioMix hasNewEpisode`;
const cache = new Map();
const CACHE_TTL = Number(process.env.CACHE_TTL_MS || 300000);

const catalogs = [
  { id: 'latest', name: 'Últimos lançamentos', type: 'series', kind: 'latest', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'acao', name: 'Ação', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'shounen', name: 'Shounen', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'fantasia', name: 'Fantasia', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'comedia', name: 'Comédia', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'aventura', name: 'Aventura', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'drama', name: 'Drama', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'romance', name: 'Romance', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'sci-fi', name: 'Sci-Fi', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'sobrenatural', name: 'Sobrenatural', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'slice-of-life', name: 'Slice of Life', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'misterio', name: 'Mistério', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'ecchi', name: 'Ecchi', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'mecha', name: 'Mecha', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'dublado', name: 'Dublado', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  { id: 'anime-chines', name: 'Anime Chinês / Donghua', type: 'series', kind: 'category', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
];

const MANIFEST = {
  id: ADDON_ID,
  version: '1.0.0',
  name: 'Otakulogia',
  description: 'Catálogos e episódios do Otakulogia organizados para o Stremio.',
  logo: `${SITE}/logo.png`,
  resources: ['catalog', 'meta', 'stream'],
  types: ['series'],
  idPrefixes: ['otaku:'],
  catalogs,
  behaviorHints: { configurable: false, configurationRequired: false },
};

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=60',
  });
  res.end(data);
}

function clean(value, max = 10000) {
  if (value == null) return undefined;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : undefined;
}

function htmlToText(value) {
  return clean(String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' '));
}

async function gql(query, variables = {}) {
  const key = JSON.stringify({ query, variables });
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message).join('; '));
  cache.set(key, { value: payload.data, expires: Date.now() + CACHE_TTL });
  return payload.data;
}

async function latest(limit = PAGE_SIZE, offset = 0) {
  const data = await gql(`query LatestReleases($input: LatestReleasesInput) { latestReleases(input:$input) { items { ${ANIME_FIELDS} } } }`, { input: { limit, offset } });
  return data.latestReleases?.items || [];
}

async function category(slug, limit = PAGE_SIZE, offset = 0) {
  const cat = await gql('query CategoryBySlug($slug:String!){categoryBySlug(slug:$slug){id}}', { slug });
  const id = cat.categoryBySlug?.id;
  if (!id) return [];
  const data = await gql(`query AnimesByCategory($input:AnimesByCategoryInput!){animesByCategory(input:$input){items{${ANIME_FIELDS}}}}`, { input: { categoryId: id, limit, offset } });
  return data.animesByCategory?.items || [];
}

async function search(query, limit = PAGE_SIZE, offset = 0) {
  const attempts = [
    { input: { query, limit, offset } },
    { input: { search: query, limit, offset } },
  ];
  for (const variables of attempts) {
    try {
      const data = await gql(`query SearchAnimes($input:SearchAnimesInput){searchAnimes(input:$input){items{${ANIME_FIELDS}}}}`, variables);
      return data.searchAnimes?.items || [];
    } catch (_) {}
  }
  return [];
}

function animeToMeta(anime) {
  const id = `otaku:${anime.slug}`;
  return {
    id,
    type: 'series',
    name: clean(anime.name) || anime.slug,
    poster: anime.posterUrl,
    description: clean(anime.synopsis),
    year: anime.year || undefined,
    website: `${SITE}/anime/${anime.slug}`,
    genre: [],
    behaviorHints: { defaultVideoId: id },
  };
}

function seasonNumber(season, index) {
  const match = String(season.name || '').match(/(?:temporada|season|t)\s*(\d+)/i);
  return match ? Number(match[1]) : index + 1;
}

async function detailBySlug(slug) {
  const data = await gql(`query AnimeBySlug($slug:String!){animeBySlug(slug:$slug){${ANIME_FIELDS}}}`, { slug });
  const anime = data.animeBySlug;
  if (!anime) return null;
  const detail = await gql(`query AnimeCatalogDetail($upstreamCid:Int!,$upstreamTid:Int){animeCatalogDetail(upstreamCid:$upstreamCid,upstreamTid:$upstreamTid){anime{${ANIME_FIELDS}} seasons{id upstreamTid name slug imageUrl audioType year status synopsis} episodes{id upstreamId title slug episodeNumber upstreamTempId description videoUrl videoUrlFhd videoUrlSd thumbnailLarge thumbnailSmall videoType audioType isNew}}}`, { upstreamCid: anime.upstreamCid });
  return { anime, detail: detail.animeCatalogDetail || { seasons: [], episodes: [] } };
}

function chooseUrl(ep) {
  return [ep.videoUrlFhd, ep.videoUrl, ep.videoUrlSd].find((u) => /^https?:\/\//i.test(u || ''));
}

function buildVideos(result) {
  const seasons = result.detail.seasons || [];
  const byTid = new Map(seasons.map((s, i) => [String(s.upstreamTid), { ...s, number: seasonNumber(s, i) }]));
  return (result.detail.episodes || []).map((ep) => {
    const season = byTid.get(String(ep.upstreamTempId));
    const sn = season?.number || 1;
    const en = Number(ep.episodeNumber) || 0;
    const title = clean(ep.title) || `Episódio ${en || ep.upstreamId}`;
    const videoId = `otaku:${result.anime.slug}:s${sn}:e${ep.upstreamId}`;
    return {
      id: videoId,
      title,
      name: title,
      season: sn,
      episode: en || undefined,
      overview: clean(ep.description),
      thumbnail: ep.thumbnailLarge || ep.thumbnailSmall || result.anime.posterUrl,
      released: ep.isNew ? new Date().toISOString() : undefined,
      available: Boolean(chooseUrl(ep)),
      website: `${SITE}/anime/${result.anime.slug}`,
      _stream: chooseUrl(ep),
    };
  }).filter((v) => v.episode || v._stream);
}

async function handleCatalog(res, catalogId, url, extra = {}) {
  const config = catalogs.find((c) => c.id === catalogId);
  if (!config) return json(res, 404, { metas: [] });
  const q = clean(extra.search || url.searchParams.get('search'));
  const skip = Math.max(Number(extra.skip || url.searchParams.get('skip') || 0) || 0, 0);
  let items = q ? await search(q, PAGE_SIZE, skip) : config.kind === 'latest' ? await latest(PAGE_SIZE, skip) : await category(config.id, PAGE_SIZE, skip);
  const metas = items.filter((a) => a?.slug).map(animeToMeta);
  return json(res, 200, { metas });
}

async function handleMeta(res, rawId) {
  const slug = rawId.replace(/^otaku:/, '').split(':')[0];
  const result = await detailBySlug(slug);
  if (!result) return json(res, 404, { meta: null });
  const meta = { ...animeToMeta(result.anime), videos: buildVideos(result) };
  delete meta.behaviorHints.defaultVideoId;
  return json(res, 200, { meta });
}

async function handleStream(res, rawId) {
  const parts = rawId.split(':');
  const slug = parts[1];
  const upstreamId = Number((parts.find((p) => p.startsWith('e')) || '').slice(1));
  if (!slug || !upstreamId) return json(res, 200, { streams: [] });
  const result = await detailBySlug(slug);
  const ep = (result?.detail?.episodes || []).find((e) => Number(e.upstreamId) === upstreamId);
  const url = ep && chooseUrl(ep);
  if (!url) return json(res, 200, { streams: [] });
  return json(res, 200, { streams: [{ name: 'Otakulogia', title: clean(ep.title) || 'Episódio', url, externalUrl: `${SITE}/anime/${slug}`, behaviorHints: { bingeGroup: `otakulogia-${slug}` } }] });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const rawPath = url.pathname.replace(/\/$/, '');
    const path = rawPath.replace(/\.json$/, '');
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    if (path === '' || path === '/health') return json(res, 200, { ok: true, service: ADDON_ID });
    if (rawPath === '/manifest.json' || path === '/manifest') return json(res, 200, MANIFEST);
    let match = path.match(/^\/catalog\/series\/([^/]+)(?:\/(.*))?$/);
    if (match) {
      const extra = {};
      for (const token of (match[2] || '').split('&')) {
        const index = token.indexOf('=');
        if (index > 0) extra[decodeURIComponent(token.slice(0, index))] = decodeURIComponent(token.slice(index + 1));
      }
      return await handleCatalog(res, match[1], url, extra);
    }
    match = path.match(/^\/meta\/series\/([^/]+)$/);
    if (match) return await handleMeta(res, decodeURIComponent(match[1]));
    match = path.match(/^\/stream\/series\/([^/]+)$/);
    if (match) return await handleStream(res, decodeURIComponent(match[1]));
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return json(res, 502, { error: 'Fonte temporariamente indisponível' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Otakulogia Stremio addon listening on ${PORT}`));
