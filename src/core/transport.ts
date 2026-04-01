import type { TransportController, TransportListener, TransportState } from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const createTransportController = (durationSeconds: number): TransportController => {
  const listeners = new Set<TransportListener>();
  let currentTimeSeconds = 0;
  let isPlaying = false;
  let playbackRate = 1;
  let rafId = 0;
  let lastTimestamp = 0;

  const getState = (): TransportState => ({
    currentTimeSeconds,
    durationSeconds,
    progress: durationSeconds > 0 ? currentTimeSeconds / durationSeconds : 0,
    isPlaying,
    playbackRate,
  });

  const emit = (): void => {
    const state = getState();
    listeners.forEach((listener) => listener(state));
  };

  const stopLoop = (): void => {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const tick = (timestamp: number): void => {
    if (!isPlaying) {
      return;
    }

    if (lastTimestamp === 0) {
      lastTimestamp = timestamp;
    }

    const elapsedSeconds = ((timestamp - lastTimestamp) / 1000) * playbackRate;
    lastTimestamp = timestamp;
    currentTimeSeconds = clamp(currentTimeSeconds + elapsedSeconds, 0, durationSeconds);

    if (currentTimeSeconds >= durationSeconds) {
      isPlaying = false;
      stopLoop();
    } else {
      rafId = requestAnimationFrame(tick);
    }

    emit();
  };

  return {
    getState,
    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      return () => {
        listeners.delete(listener);
      };
    },
    play() {
      if (isPlaying || durationSeconds <= 0) {
        return;
      }

      if (currentTimeSeconds >= durationSeconds) {
        currentTimeSeconds = 0;
      }

      isPlaying = true;
      lastTimestamp = 0;
      rafId = requestAnimationFrame(tick);
      emit();
    },
    pause() {
      if (!isPlaying) {
        return;
      }

      isPlaying = false;
      lastTimestamp = 0;
      stopLoop();
      emit();
    },
    seek(timeSeconds) {
      currentTimeSeconds = clamp(timeSeconds, 0, durationSeconds);
      lastTimestamp = 0;
      emit();
    },
    setRate(nextPlaybackRate) {
      playbackRate = clamp(nextPlaybackRate, 0.25, 4);
      emit();
    },
    sample(timeSeconds) {
      return {
        currentTimeSeconds: clamp(timeSeconds, 0, durationSeconds),
        durationSeconds,
        progress: durationSeconds > 0 ? clamp(timeSeconds, 0, durationSeconds) / durationSeconds : 0,
        isPlaying,
        playbackRate,
      };
    },
    destroy() {
      isPlaying = false;
      stopLoop();
      listeners.clear();
    },
  };
};
