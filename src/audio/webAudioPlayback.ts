import * as Soundfont from 'soundfont-player';
import type {
  AudioPlaybackController,
  AudioPlaybackListener,
  AudioPlaybackState,
  NormalizedMidiDocument,
  NoteEvent,
} from '../core/types';
import { fallbackInstrumentName, getNoteInstrumentName } from './gmMapping';
import { getSoundfontObjectUrl } from './soundfontAssets';

type SoundfontInstrument = {
  play: (
    note: number,
    when?: number,
    options?: Partial<{
      gain: number;
      duration: number;
      release: number;
      attack: number;
    }>,
  ) => { stop: (when?: number) => void };
  stop: (when?: number) => unknown[];
};

type LoadSummary = {
  cacheHit: boolean;
  fallbackApplied: boolean;
};

const STORAGE_KEY = 'midi-signal-form-master-volume';
const SCHEDULE_AHEAD_SECONDS = 0.2;
const SCHEDULE_INTERVAL_MS = 50;
const PLAYBACK_OFFSET_SECONDS = 0.05;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const lowerBoundByStartTime = (notes: NoteEvent[], timeSeconds: number): number => {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (notes[middle].startTimeSeconds < timeSeconds) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

const readPersistedVolume = (): number => {
  if (typeof window === 'undefined') {
    return 0.8;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : 0.8;
};

export const createAudioPlaybackController = (): AudioPlaybackController => {
  const listeners = new Set<AudioPlaybackListener>();
  const audioContext = new AudioContext();
  const masterGain = audioContext.createGain();
  const instruments = new Map<string, SoundfontInstrument>();
  let state: AudioPlaybackState = {
    status: 'idle',
    volume: readPersistedVolume(),
    loadingInstruments: 0,
    loadedInstruments: 0,
    cachedInstruments: 0,
    fallbackInstruments: 0,
    message: 'Load a MIDI file to prepare audio playback.',
  };
  let currentDocument: NormalizedMidiDocument | null = null;
  let preparePromise: Promise<void> | null = null;
  let schedulerId: number | null = null;
  let playbackAnchorTimeSeconds = 0;
  let playbackAnchorAudioTime = 0;
  let nextNoteIndex = 0;
  let preparationToken = 0;

  masterGain.gain.value = state.volume;
  masterGain.connect(audioContext.destination);

  const emit = (): void => {
    listeners.forEach((listener) => listener(state));
  };

  const setState = (partial: Partial<AudioPlaybackState>): void => {
    state = { ...state, ...partial };
    emit();
  };

  const stopScheduledPlayback = (): void => {
    if (schedulerId !== null) {
      window.clearInterval(schedulerId);
      schedulerId = null;
    }

    instruments.forEach((instrument) => {
      instrument.stop(audioContext.currentTime);
    });
  };

  const getLoadedInstrument = async (instrumentName: string): Promise<LoadSummary> => {
    if (instruments.has(instrumentName)) {
      return { cacheHit: true, fallbackApplied: false };
    }

    try {
      const asset = await getSoundfontObjectUrl(instrumentName);
      const player = (await Soundfont.instrument(audioContext, asset.objectUrl as never, {
        destination: masterGain,
        isSoundfontURL: () => true,
      })) as unknown as SoundfontInstrument;
      instruments.set(instrumentName, player);
      return { cacheHit: asset.cacheHit, fallbackApplied: false };
    } catch (error) {
      if (instrumentName === fallbackInstrumentName) {
        throw error;
      }

      const fallback = await getLoadedInstrument(fallbackInstrumentName);
      return {
        cacheHit: fallback.cacheHit,
        fallbackApplied: true,
      };
    }
  };

  const getPlaybackTimeSeconds = (): number => {
    if (state.status !== 'playing') {
      return playbackAnchorTimeSeconds;
    }

    return playbackAnchorTimeSeconds + Math.max(0, audioContext.currentTime - playbackAnchorAudioTime);
  };

  const playNote = (note: NoteEvent, when: number, durationSeconds: number): void => {
    const instrumentName = getNoteInstrumentName(note);
    const instrument = instruments.get(instrumentName) ?? instruments.get(fallbackInstrumentName);
    if (!instrument) {
      return;
    }

    instrument.play(note.pitch, when, {
      gain: clamp((note.velocity / 127) * 0.5, 0.08, 0.7),
      duration: Math.max(0.04, durationSeconds),
      attack: 0.002,
      release: note.isPercussion ? 0.08 : 0.22,
    });
  };

  const scheduleActiveNotes = (timeSeconds: number): void => {
    if (!currentDocument) {
      return;
    }

    const now = audioContext.currentTime + 0.01;
    currentDocument.notes
      .filter((note) => note.startTimeSeconds < timeSeconds && note.endTimeSeconds > timeSeconds)
      .slice(-32)
      .forEach((note) => {
        playNote(note, now, note.endTimeSeconds - timeSeconds);
      });
  };

  const scheduleAhead = (): void => {
    if (!currentDocument) {
      return;
    }

    const nowPlaybackTime = getPlaybackTimeSeconds();
    const horizon = nowPlaybackTime + SCHEDULE_AHEAD_SECONDS;

    while (
      nextNoteIndex < currentDocument.notes.length &&
      currentDocument.notes[nextNoteIndex].startTimeSeconds <= horizon
    ) {
      const note = currentDocument.notes[nextNoteIndex];
      const when = Math.max(
        audioContext.currentTime + 0.005,
        playbackAnchorAudioTime + (note.startTimeSeconds - playbackAnchorTimeSeconds),
      );

      if (note.endTimeSeconds > nowPlaybackTime) {
        playNote(note, when, note.durationSeconds);
      }

      nextNoteIndex += 1;
    }

    if (nowPlaybackTime >= currentDocument.durationSeconds) {
      stopScheduledPlayback();
      setState({
        status: 'ready',
        message: 'Playback complete. Ready to play again.',
      });
    }
  };

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    async prepare(document) {
      currentDocument = document;
      stopScheduledPlayback();
      preparationToken += 1;
      const currentToken = preparationToken;
      const requiredInstruments = Array.from(new Set(document.notes.map((note) => getNoteInstrumentName(note))));
      const safeInstrumentList = requiredInstruments.length > 0 ? requiredInstruments : [fallbackInstrumentName];

      setState({
        status: 'loading',
        loadingInstruments: safeInstrumentList.length,
        loadedInstruments: 0,
        cachedInstruments: 0,
        fallbackInstruments: 0,
        message: `Loading ${safeInstrumentList.length} instrument${safeInstrumentList.length === 1 ? '' : 's'} for audio playback.`,
      });

      preparePromise = (async () => {
        let cachedInstruments = 0;
        let fallbackInstruments = 0;
        let loadedInstruments = 0;

        for (const instrumentName of safeInstrumentList) {
          const summary = await getLoadedInstrument(instrumentName);
          if (currentToken !== preparationToken) {
            return;
          }
          cachedInstruments += summary.cacheHit ? 1 : 0;
          fallbackInstruments += summary.fallbackApplied ? 1 : 0;
          loadedInstruments += 1;
          setState({
            loadingInstruments: safeInstrumentList.length - loadedInstruments,
            loadedInstruments,
            cachedInstruments,
            fallbackInstruments,
            message: `Prepared ${loadedInstruments}/${safeInstrumentList.length} instruments.`,
          });
        }

        if (currentToken !== preparationToken) {
          return;
        }
        setState({
          status: 'ready',
          loadingInstruments: 0,
          loadedInstruments: safeInstrumentList.length,
          cachedInstruments,
          fallbackInstruments,
          message:
            fallbackInstruments > 0
              ? 'Audio ready with fallback timbres for unsupported instruments.'
              : 'Audio ready. Press Play to start synchronized playback.',
        });
      })().catch((error: unknown) => {
        if (currentToken !== preparationToken) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Audio preparation failed.';
        setState({
          status: 'error',
          message,
        });
        throw error;
      });

      await preparePromise;
    },
    async play(startTimeSeconds) {
      if (!currentDocument) {
        return false;
      }

      try {
        await (preparePromise ?? Promise.resolve());
        await audioContext.resume();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Audio playback could not start.';
        setState({
          status: 'blocked',
          message,
        });
        return false;
      }

      stopScheduledPlayback();
      playbackAnchorTimeSeconds = clamp(startTimeSeconds, 0, currentDocument.durationSeconds);
      playbackAnchorAudioTime = audioContext.currentTime + PLAYBACK_OFFSET_SECONDS;
      nextNoteIndex = lowerBoundByStartTime(currentDocument.notes, playbackAnchorTimeSeconds);
      scheduleActiveNotes(playbackAnchorTimeSeconds);
      scheduleAhead();
      schedulerId = window.setInterval(scheduleAhead, SCHEDULE_INTERVAL_MS);

      setState({
        status: 'playing',
        message: 'Audio and visuals are playing in sync.',
      });
      return true;
    },
    pause() {
      stopScheduledPlayback();
      playbackAnchorTimeSeconds = currentDocument ? clamp(getPlaybackTimeSeconds(), 0, currentDocument.durationSeconds) : 0;
      setState({
        status: currentDocument ? 'ready' : 'idle',
        message: currentDocument ? 'Audio paused.' : 'Load a MIDI file to prepare audio playback.',
      });
    },
    async seek(timeSeconds, resumePlayback = false) {
      if (!currentDocument) {
        return;
      }

      const clampedTime = clamp(timeSeconds, 0, currentDocument.durationSeconds);
      const shouldResume = resumePlayback && state.status === 'playing';
      stopScheduledPlayback();
      playbackAnchorTimeSeconds = clampedTime;
      nextNoteIndex = lowerBoundByStartTime(currentDocument.notes, clampedTime);

      if (shouldResume) {
        await this.play(clampedTime);
        return;
      }

      setState({
        status: 'ready',
        message: 'Seeked to a new playhead position.',
      });
    },
    setVolume(volume) {
      const nextVolume = clamp(volume, 0, 1);
      masterGain.gain.setValueAtTime(nextVolume, audioContext.currentTime);
      state = {
        ...state,
        volume: nextVolume,
      };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, String(nextVolume));
      }
      emit();
    },
    destroy() {
      stopScheduledPlayback();
      listeners.clear();
      masterGain.disconnect();
      void audioContext.close();
    },
  };
};
