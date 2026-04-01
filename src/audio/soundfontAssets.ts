const CACHE_NAME = 'midi-signal-form-soundfonts-v1';
const primedSoundfontCache = new Map<string, Promise<{ sourceUrl: string; cacheHit: boolean }>>();

export const DEFAULT_SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts';
export const DEFAULT_SOUNDFONT_NAME = 'FluidR3_GM';
export const DEFAULT_SOUNDFONT_FORMAT = 'mp3';

const buildSoundfontUrl = (instrumentName: string): string =>
  `${DEFAULT_SOUNDFONT_BASE_URL}/${DEFAULT_SOUNDFONT_NAME}/${instrumentName}-${DEFAULT_SOUNDFONT_FORMAT}.js`;

const fetchAndCache = async (url: string): Promise<{ cacheHit: boolean }> => {
  if (typeof caches === 'undefined') {
    const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`Soundfont fetch failed for ${url}`);
    }

    return { cacheHit: false };
  }

  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(url);
  if (cachedResponse) {
    return { cacheHit: true };
  }

  const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Soundfont fetch failed for ${url}`);
  }

  await cache.put(url, response.clone());
  return { cacheHit: false };
};

export const primeSoundfontAsset = async (
  instrumentName: string,
): Promise<{ sourceUrl: string; cacheHit: boolean }> => {
  const sourceUrl = buildSoundfontUrl(instrumentName);
  const cached = primedSoundfontCache.get(sourceUrl);
  if (cached) {
    return cached;
  }

  const loadPromise = fetchAndCache(sourceUrl).then(({ cacheHit }) => ({
    sourceUrl,
    cacheHit,
  }));

  primedSoundfontCache.set(sourceUrl, loadPromise);
  return loadPromise;
};
