import type { AnalysisSnapshot, NormalizedMidiDocument, NoteEvent, PlaybackFrame, SectionCue } from '../core/types';

const WINDOW_SECONDS = 2;
const RECENT_ONSET_WINDOW = 0.35;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const binarySearch = (notes: NoteEvent[], timeSeconds: number, key: 'startTimeSeconds' | 'endTimeSeconds'): number => {
  let low = 0;
  let high = notes.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (notes[middle][key] <= timeSeconds) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
};

const labelSection = (energy: number, delta: number): SectionCue['label'] => {
  if (energy < 0.14) {
    return 'intro';
  }

  if (energy > 0.74) {
    return 'peak';
  }

  if (delta > 0.12) {
    return 'lift';
  }

  if (delta < -0.09) {
    return 'release';
  }

  return 'pulse';
};

const createSectionCues = (notes: NoteEvent[], durationSeconds: number): SectionCue[] => {
  if (durationSeconds <= 0) {
    return [];
  }

  const segmentCount = Math.max(1, Math.ceil(durationSeconds / WINDOW_SECONDS));
  const stats = Array.from({ length: segmentCount }, (_, index) => ({
    start: index * WINDOW_SECONDS,
    end: Math.min(durationSeconds, (index + 1) * WINDOW_SECONDS),
    noteCount: 0,
    velocitySum: 0,
  }));

  for (const note of notes) {
    const segmentIndex = clamp(Math.floor(note.startTimeSeconds / WINDOW_SECONDS), 0, stats.length - 1);
    stats[segmentIndex].noteCount += 1;
    stats[segmentIndex].velocitySum += note.velocity / 127;
  }

  const maxCount = Math.max(1, ...stats.map((segment) => segment.noteCount));
  const maxVelocity = Math.max(1, ...stats.map((segment) => segment.velocitySum || 0));

  return stats.map((segment, index, segments) => {
    const density = segment.noteCount / maxCount;
    const velocity = segment.velocitySum / maxVelocity;
    const energy = clamp(density * 0.65 + velocity * 0.35, 0, 1);
    const previousEnergy = index === 0 ? energy : segments[index - 1].velocitySum / maxVelocity;
    return {
      index,
      startTimeSeconds: segment.start,
      endTimeSeconds: segment.end,
      density,
      energy,
      label: labelSection(energy, energy - previousEnergy),
    };
  });
};

export const createAnalysisSnapshot = (document: NormalizedMidiDocument): AnalysisSnapshot => {
  const sectionCues = createSectionCues(document.notes, document.durationSeconds);
  const averageVelocity =
    document.notes.length > 0
      ? document.notes.reduce((sum, note) => sum + note.velocity / 127, 0) / document.notes.length
      : 0;
  const maxPolyphony = document.notes.length > 0 ? estimateMaxPolyphony(document.notes) : 0;
  const noteDensityPeak = Math.max(0, ...sectionCues.map((cue) => cue.density));

  return {
    document,
    sectionCues,
    maxPolyphony,
    averageVelocity,
    noteDensityPeak,
  };
};

const estimateMaxPolyphony = (notes: NoteEvent[]): number => {
  const events = notes.flatMap((note) => [
    { time: note.startTimeSeconds, delta: 1 },
    { time: note.endTimeSeconds, delta: -1 },
  ]);

  events.sort((left, right) => left.time - right.time || right.delta - left.delta);

  let active = 0;
  let maxActive = 0;
  for (const event of events) {
    active += event.delta;
    maxActive = Math.max(maxActive, active);
  }
  return maxActive;
};

const getCurrentSection = (sectionCues: SectionCue[], timeSeconds: number): SectionCue | null =>
  sectionCues.find((sectionCue) => timeSeconds >= sectionCue.startTimeSeconds && timeSeconds < sectionCue.endTimeSeconds) ??
  sectionCues.at(-1) ??
  null;

export const samplePlaybackFrame = (snapshot: AnalysisSnapshot, timeSeconds: number): PlaybackFrame => {
  const clampedTime = clamp(timeSeconds, 0, snapshot.document.durationSeconds);
  const notesByStart = snapshot.document.notes;
  const startedIndex = binarySearch(notesByStart, clampedTime, 'startTimeSeconds');
  const activeNotes = notesByStart.slice(0, startedIndex).filter((note) => note.endTimeSeconds > clampedTime);
  const recentStartIndex = binarySearch(notesByStart, Math.max(0, clampedTime - RECENT_ONSET_WINDOW), 'startTimeSeconds');
  const recentOnsets = notesByStart
    .slice(recentStartIndex, startedIndex)
    .filter((note) => note.startTimeSeconds >= clampedTime - RECENT_ONSET_WINDOW);
  const weightedPitch = activeNotes.reduce((sum, note) => sum + note.pitch * (note.velocity / 127), 0);
  const velocityWeight = activeNotes.reduce((sum, note) => sum + note.velocity / 127, 0);
  const dominantPitch =
    activeNotes.length > 0
      ? Math.round(weightedPitch / Math.max(velocityWeight, 1e-6))
      : recentOnsets.at(-1)?.pitch ?? null;
  const velocityEnergy =
    activeNotes.length > 0
      ? clamp(
          activeNotes.reduce((sum, note) => sum + note.velocity / 127, 0) / activeNotes.length +
            recentOnsets.length * 0.04,
          0,
          1,
        )
      : 0;
  const polyphony = activeNotes.length;

  return {
    timeSeconds: clampedTime,
    durationSeconds: snapshot.document.durationSeconds,
    progress: snapshot.document.durationSeconds > 0 ? clampedTime / snapshot.document.durationSeconds : 0,
    activeNotes,
    recentOnsets,
    dominantPitch,
    polyphony,
    polyphonyNormalized: snapshot.maxPolyphony > 0 ? polyphony / snapshot.maxPolyphony : 0,
    velocityEnergy,
    sectionCue: getCurrentSection(snapshot.sectionCues, clampedTime),
  };
};
