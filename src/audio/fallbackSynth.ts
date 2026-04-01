import type { NoteEvent } from '../core/types';

type ScheduledVoice = {
  stop: (when?: number) => void;
};

const midiToFrequency = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

const createNoiseBuffer = (context: AudioContext): AudioBuffer => {
  const length = Math.max(1, Math.floor(context.sampleRate * 0.25));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    channel[index] = Math.random() * 2 - 1;
  }
  return buffer;
};

const resolveWaveform = (programNumber: number): OscillatorType => {
  if (programNumber < 8) {
    return 'triangle';
  }
  if (programNumber < 32) {
    return 'sine';
  }
  if (programNumber < 56) {
    return 'sawtooth';
  }
  if (programNumber < 80) {
    return 'square';
  }
  return 'triangle';
};

export const createFallbackSynthPlayer = (context: AudioContext, destination: AudioNode) => {
  const noiseBuffer = createNoiseBuffer(context);

  return {
    play(note: NoteEvent, when: number, durationSeconds: number): ScheduledVoice {
      if (note.isPercussion) {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();

        source.buffer = noiseBuffer;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(180 + note.pitch * 14, when);
        filter.Q.setValueAtTime(0.9, when);

        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(0.12 + (note.velocity / 127) * 0.22, when + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.min(0.18, durationSeconds + 0.05));

        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination);
        source.start(when);
        source.stop(when + Math.min(0.24, durationSeconds + 0.08));

        return {
          stop(stopWhen = context.currentTime) {
            try {
              source.stop(stopWhen);
            } catch {
              // Ignore repeated stop attempts on already-ended buffer sources.
            }
          },
        };
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const stopAt = when + Math.max(0.08, durationSeconds + 0.18);

      oscillator.type = resolveWaveform(note.programNumber);
      oscillator.frequency.setValueAtTime(midiToFrequency(note.pitch), when);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800 + (note.velocity / 127) * 2800, when);
      filter.Q.setValueAtTime(0.8, when);

      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.04 + (note.velocity / 127) * 0.14, when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      oscillator.start(when);
      oscillator.stop(stopAt);

      return {
        stop(stopWhen = context.currentTime) {
          const now = Math.max(stopWhen, context.currentTime);
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
          try {
            oscillator.stop(now + 0.04);
          } catch {
            // Ignore repeated stop attempts on already-ended oscillators.
          }
        },
      };
    },
  };
};
