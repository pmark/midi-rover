const SOUNDFONT_SCRIPT_URL = 'https://unpkg.com/soundfont-player@0.12.0/dist/soundfont-player.min.js';
const SOUNDFONT_SCRIPT_ID = 'soundfont-player-browser-bundle';

type SoundfontPlayerModule = {
  instrument: (
    context: AudioContext,
    name: string,
    options?: { destination?: AudioNode; notes?: number[] },
  ) => Promise<unknown>;
};

declare global {
  interface Window {
    Soundfont?: SoundfontPlayerModule;
  }
}

let soundfontPromise: Promise<SoundfontPlayerModule> | null = null;

const resolveGlobalSoundfont = (): SoundfontPlayerModule => {
  const soundfont = window.Soundfont;
  if (!soundfont?.instrument) {
    throw new Error('Soundfont browser bundle loaded without a valid window.Soundfont export.');
  }
  return soundfont;
};

export const loadBrowserSoundfont = async (): Promise<SoundfontPlayerModule> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Soundfont loading requires a browser environment.');
  }

  if (window.Soundfont?.instrument) {
    return window.Soundfont;
  }

  if (soundfontPromise) {
    return soundfontPromise;
  }

  soundfontPromise = new Promise<SoundfontPlayerModule>((resolve, reject) => {
    const existingScript = document.getElementById(SOUNDFONT_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(resolveGlobalSoundfont()), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Soundfont script failed to load.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = SOUNDFONT_SCRIPT_ID;
    script.async = true;
    script.src = SOUNDFONT_SCRIPT_URL;
    script.addEventListener('load', () => resolve(resolveGlobalSoundfont()), { once: true });
    script.addEventListener(
      'error',
      () => {
        soundfontPromise = null;
        reject(new Error(`Failed to load soundfont-player browser bundle from ${SOUNDFONT_SCRIPT_URL}.`));
      },
      { once: true },
    );
    document.head.append(script);
  });

  return soundfontPromise;
};
