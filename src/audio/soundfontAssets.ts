const CACHE_NAME = 'midi-signal-form-soundfonts-v1';
const objectUrlCache = new Map<string, Promise<{ objectUrl: string; cacheHit: boolean }>>();

export const DEFAULT_SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts';
export const DEFAULT_SOUNDFONT_NAME = 'FluidR3_GM';
export const DEFAULT_SOUNDFONT_FORMAT = 'mp3';

const buildSoundfontUrl = (instrumentName: string): string =>
  `${DEFAULT_SOUNDFONT_BASE_URL}/${DEFAULT_SOUNDFONT_NAME}/${instrumentName}-${DEFAULT_SOUNDFONT_FORMAT}.js`;

const fetchAndCache = async (url: string): Promise<{ text: string; cacheHit: boolean }> => {
  if (typeof caches === 'undefined') {
    const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`Soundfont fetch failed for ${url}`);
    }

    return {
      text: await response.text(),
      cacheHit: false,
    };
  }

  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(url);
  if (cachedResponse) {
    return {
      text: await cachedResponse.text(),
      cacheHit: true,
    };
  }

  const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Soundfont fetch failed for ${url}`);
  }

  await cache.put(url, response.clone());
  return {
    text: await response.text(),
    cacheHit: false,
  };
};

export const getSoundfontObjectUrl = async (
  instrumentName: string,
): Promise<{ objectUrl: string; cacheHit: boolean; sourceUrl: string }> => {
  const sourceUrl = buildSoundfontUrl(instrumentName);
  const cached = objectUrlCache.get(sourceUrl);
  if (cached) {
    const result = await cached;
    return {
      ...result,
      sourceUrl,
    };
  }

  const loadPromise = fetchAndCache(sourceUrl).then(({ text, cacheHit }) => ({
    objectUrl: URL.createObjectURL(new Blob([text], { type: 'application/javascript' })),
    cacheHit,
  }));

  objectUrlCache.set(sourceUrl, loadPromise);
  const result = await loadPromise;
  return {
    ...result,
    sourceUrl,
  };
};
