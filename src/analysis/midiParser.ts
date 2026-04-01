import { parseMidi } from 'midi-file';
import type {
  MeterEvent,
  NormalizedMidiDocument,
  NoteEvent,
  TempoEvent,
  TrackInfo,
} from '../core/types';

type ActiveNote = {
  noteId: string;
  pitch: number;
  velocity: number;
  startTick: number;
  trackIndex: number;
  channel: number;
};

const DEFAULT_TEMPO = 500_000;

const hashBytes = (bytes: Uint8Array): string => {
  let hash = 0x811c9dc5;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

const clampTempoEvents = (
  events: TempoEvent[],
  ticksPerBeat: number | null,
  secondsPerTick: number | null,
): TempoEvent[] => {
  if (events.length > 0) {
    return events.sort((left, right) => left.tick - right.tick);
  }

  if (ticksPerBeat !== null) {
    return [
      {
        tick: 0,
        timeSeconds: 0,
        microsecondsPerBeat: DEFAULT_TEMPO,
        bpm: 60_000_000 / DEFAULT_TEMPO,
      },
    ];
  }

  return [
    {
      tick: 0,
      timeSeconds: 0,
      microsecondsPerBeat: Math.round((secondsPerTick ?? 1 / 120) * 1_000_000),
      bpm: 120,
    },
  ];
};

const clampMeterEvents = (events: MeterEvent[]): MeterEvent[] =>
  events.length > 0
    ? events.sort((left, right) => left.tick - right.tick)
    : [
        {
          tick: 0,
          timeSeconds: 0,
          numerator: 4,
          denominator: 4,
        },
      ];

const computeAbsoluteTempoTimes = (
  rawTempoEvents: Array<{ tick: number; microsecondsPerBeat: number }>,
  ticksPerBeat: number | null,
  secondsPerTick: number | null,
): TempoEvent[] => {
  const sortedEvents = rawTempoEvents
    .sort((left, right) => left.tick - right.tick)
    .filter((event, index, array) => index === 0 || array[index - 1].tick !== event.tick);

  if (ticksPerBeat === null) {
    return clampTempoEvents([], ticksPerBeat, secondsPerTick);
  }

  const tempoEvents = sortedEvents.length > 0 ? sortedEvents : [{ tick: 0, microsecondsPerBeat: DEFAULT_TEMPO }];
  const normalized: TempoEvent[] = [];
  let previousTick = 0;
  let currentSeconds = 0;
  let currentTempo = tempoEvents[0].tick === 0 ? tempoEvents[0].microsecondsPerBeat : DEFAULT_TEMPO;

  if (tempoEvents[0].tick !== 0) {
    normalized.push({
      tick: 0,
      timeSeconds: 0,
      microsecondsPerBeat: currentTempo,
      bpm: 60_000_000 / currentTempo,
    });
  }

  for (const event of tempoEvents) {
    const deltaTicks = event.tick - previousTick;
    currentSeconds += (deltaTicks / ticksPerBeat) * (currentTempo / 1_000_000);
    currentTempo = event.microsecondsPerBeat;
    normalized.push({
      tick: event.tick,
      timeSeconds: currentSeconds,
      microsecondsPerBeat: event.microsecondsPerBeat,
      bpm: 60_000_000 / event.microsecondsPerBeat,
    });
    previousTick = event.tick;
  }

  return clampTempoEvents(normalized, ticksPerBeat, secondsPerTick);
};

const ticksToSeconds = (
  tick: number,
  tempoEvents: TempoEvent[],
  ticksPerBeat: number | null,
  secondsPerTick: number | null,
): number => {
  if (tick <= 0) {
    return 0;
  }

  if (ticksPerBeat === null) {
    return tick * (secondsPerTick ?? 1 / 120);
  }

  let activeTempo = tempoEvents[0];
  for (const tempoEvent of tempoEvents) {
    if (tempoEvent.tick > tick) {
      break;
    }
    activeTempo = tempoEvent;
  }

  return activeTempo.timeSeconds + ((tick - activeTempo.tick) / ticksPerBeat) * (activeTempo.microsecondsPerBeat / 1_000_000);
};

const closeDanglingNotes = (
  openNotes: Map<string, ActiveNote[]>,
  endTick: number,
  tempoEvents: TempoEvent[],
  ticksPerBeat: number | null,
  secondsPerTick: number | null,
  notes: NoteEvent[],
): void => {
  openNotes.forEach((activeNotes) => {
    activeNotes.forEach((activeNote) => {
      const startTimeSeconds = ticksToSeconds(activeNote.startTick, tempoEvents, ticksPerBeat, secondsPerTick);
      const endTimeSeconds = ticksToSeconds(endTick, tempoEvents, ticksPerBeat, secondsPerTick);
      notes.push({
        id: activeNote.noteId,
        trackIndex: activeNote.trackIndex,
        channel: activeNote.channel,
        pitch: activeNote.pitch,
        velocity: activeNote.velocity,
        startTick: activeNote.startTick,
        endTick,
        startTimeSeconds,
        endTimeSeconds,
        durationSeconds: Math.max(0, endTimeSeconds - startTimeSeconds),
      });
    });
  });
};

export const parseMidiFile = (bytes: Uint8Array): NormalizedMidiDocument => {
  const parsed = parseMidi(bytes);
  const ticksPerBeat = parsed.header.ticksPerBeat ?? null;
  const secondsPerTick =
    parsed.header.framesPerSecond && parsed.header.ticksPerFrame
      ? 1 / (parsed.header.framesPerSecond * parsed.header.ticksPerFrame)
      : null;
  const rawTempoEvents: Array<{ tick: number; microsecondsPerBeat: number }> = [];
  const rawMeterEvents: Array<{ tick: number; numerator: number; denominator: number }> = [];
  const tracks: TrackInfo[] = [];
  let maxTick = 0;

  parsed.tracks.forEach((track, trackIndex) => {
    let absoluteTick = 0;
    let trackName = `Track ${trackIndex + 1}`;

    track.forEach((event) => {
      absoluteTick += event.deltaTime;
      maxTick = Math.max(maxTick, absoluteTick);

      if (event.type === 'trackName' && event.text.trim().length > 0) {
        trackName = event.text.trim();
      }

      if (event.type === 'setTempo') {
        rawTempoEvents.push({
          tick: absoluteTick,
          microsecondsPerBeat: event.microsecondsPerBeat,
        });
      }

      if (event.type === 'timeSignature') {
        rawMeterEvents.push({
          tick: absoluteTick,
          numerator: event.numerator,
          denominator: event.denominator,
        });
      }
    });

    tracks.push({
      index: trackIndex,
      name: trackName,
    });
  });

  const tempoEvents = computeAbsoluteTempoTimes(rawTempoEvents, ticksPerBeat, secondsPerTick);
  const meterEvents = clampMeterEvents(
    rawMeterEvents.map((event) => ({
      ...event,
      timeSeconds: ticksToSeconds(event.tick, tempoEvents, ticksPerBeat, secondsPerTick),
    })),
  );

  const notes: NoteEvent[] = [];
  let noteIndex = 0;

  parsed.tracks.forEach((track, trackIndex) => {
    let absoluteTick = 0;
    const openNotes = new Map<string, ActiveNote[]>();

    track.forEach((event) => {
      absoluteTick += event.deltaTime;

      if (event.type === 'noteOn' && event.velocity > 0) {
        const key = `${event.channel}:${event.noteNumber}`;
        const stack = openNotes.get(key) ?? [];
        stack.push({
          noteId: `note-${trackIndex}-${event.channel}-${event.noteNumber}-${absoluteTick}-${noteIndex++}`,
          pitch: event.noteNumber,
          velocity: event.velocity,
          startTick: absoluteTick,
          trackIndex,
          channel: event.channel,
        });
        openNotes.set(key, stack);
      }

      if (event.type === 'noteOff' || (event.type === 'noteOn' && event.velocity === 0)) {
        const key = `${event.channel}:${event.noteNumber}`;
        const stack = openNotes.get(key);
        const activeNote = stack?.pop();

        if (!activeNote) {
          return;
        }

        const startTimeSeconds = ticksToSeconds(activeNote.startTick, tempoEvents, ticksPerBeat, secondsPerTick);
        const endTimeSeconds = ticksToSeconds(absoluteTick, tempoEvents, ticksPerBeat, secondsPerTick);
        notes.push({
          id: activeNote.noteId,
          trackIndex,
          channel: event.channel,
          pitch: event.noteNumber,
          velocity: activeNote.velocity,
          startTick: activeNote.startTick,
          endTick: absoluteTick,
          startTimeSeconds,
          endTimeSeconds,
          durationSeconds: Math.max(0, endTimeSeconds - startTimeSeconds),
        });

        if (stack && stack.length === 0) {
          openNotes.delete(key);
        }
      }
    });

    closeDanglingNotes(openNotes, maxTick, tempoEvents, ticksPerBeat, secondsPerTick, notes);
  });

  notes.sort((left, right) => left.startTimeSeconds - right.startTimeSeconds || left.pitch - right.pitch);
  const durationSeconds = Math.max(
    ticksToSeconds(maxTick, tempoEvents, ticksPerBeat, secondsPerTick),
    notes.at(-1)?.endTimeSeconds ?? 0,
  );

  return {
    sourceHash: hashBytes(bytes),
    format: parsed.header.format,
    ticksPerBeat,
    secondsPerTick,
    durationSeconds,
    trackCount: parsed.header.numTracks,
    tracks,
    tempoEvents,
    meterEvents,
    notes,
  };
};
