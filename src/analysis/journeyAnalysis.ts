import type { AnalysisSnapshot, JourneyCue, JourneyFrame, JourneySegmentLabel } from '../core/types.ts';

const WINDOW_SECONDS = 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, amount: number): number => start + (end - start) * amount;

const smoothSeries = (values: number[]): number[] =>
  values.map((value, index, collection) => {
    const previous = collection[Math.max(0, index - 1)] ?? value;
    const next = collection[Math.min(collection.length - 1, index + 1)] ?? value;
    return clamp(previous * 0.25 + value * 0.5 + next * 0.25, 0, 1);
  });

const labelJourneySegment = (
  energy: number,
  complexity: number,
  travelSpeed: number,
  dynamicContrast: number,
  delta: number,
): JourneySegmentLabel => {
  if (energy < 0.2 && complexity < 0.26) {
    return 'approach';
  }

  if (delta < -0.1 || dynamicContrast < 0.16) {
    return 'release';
  }

  if (energy > 0.72 && complexity > 0.6) {
    return 'orbit';
  }

  if (delta > 0.08 || travelSpeed > 0.58) {
    return 'lift';
  }

  return 'cruise';
};

const createJourneyCues = (snapshot: AnalysisSnapshot): JourneyCue[] => {
  const durationSeconds = snapshot.document.durationSeconds;

  if (durationSeconds <= 0) {
    return [];
  }

  const segmentCount = Math.max(1, Math.ceil(durationSeconds / WINDOW_SECONDS));
  const stats = Array.from({ length: segmentCount }, (_, index) => ({
    start: index * WINDOW_SECONDS,
    end: Math.min(durationSeconds, (index + 1) * WINDOW_SECONDS),
    noteCount: 0,
    onsetCount: 0,
    velocityMin: 1,
    velocityMax: 0,
  }));

  for (const note of snapshot.document.notes) {
    const segmentIndex = clamp(Math.floor(note.startTimeSeconds / WINDOW_SECONDS), 0, stats.length - 1);
    const segment = stats[segmentIndex];
    const velocity = note.velocity / 127;
    segment.noteCount += 1;
    segment.onsetCount += 1;
    segment.velocityMin = Math.min(segment.velocityMin, velocity);
    segment.velocityMax = Math.max(segment.velocityMax, velocity);
  }

  const maxNotes = Math.max(1, ...stats.map((segment) => segment.noteCount));
  const maxOnsets = Math.max(1, ...stats.map((segment) => segment.onsetCount));
  const smoothedDensity = smoothSeries(snapshot.sectionCues.map((cue) => cue.density));
  const smoothedEnergy = smoothSeries(snapshot.sectionCues.map((cue) => cue.energy));
  const smoothedOnsets = smoothSeries(stats.map((segment) => segment.onsetCount / maxOnsets));
  const smoothedContrast = smoothSeries(
    stats.map((segment) =>
      segment.noteCount > 0 ? clamp(segment.velocityMax - segment.velocityMin, 0, 1) : 0,
    ),
  );

  return stats.map((segment, index) => {
    const energy = smoothedEnergy[index] ?? 0;
    const density = smoothedDensity[index] ?? clamp(segment.noteCount / maxNotes, 0, 1);
    const onsetActivity = smoothedOnsets[index] ?? 0;
    const dynamicContrast = smoothedContrast[index] ?? 0;
    const travelSpeed = clamp(0.22 + energy * 0.38 + onsetActivity * 0.18, 0.18, 0.88);
    const complexity = clamp(0.16 + energy * 0.3 + density * 0.22 + dynamicContrast * 0.18, 0.12, 0.86);
    const previousEnergy = smoothedEnergy[Math.max(0, index - 1)] ?? energy;

    return {
      index,
      startTimeSeconds: segment.start,
      endTimeSeconds: segment.end,
      energy,
      density,
      onsetActivity,
      dynamicContrast,
      travelSpeed,
      complexity,
      label: labelJourneySegment(
        energy,
        complexity,
        travelSpeed,
        dynamicContrast,
        energy - previousEnergy,
      ),
    };
  });
};

const interpolateCueValue = (
  cues: JourneyCue[],
  timeSeconds: number,
  selector: (cue: JourneyCue) => number,
): number => {
  if (cues.length === 0) {
    return 0;
  }

  const activeIndex = cues.findIndex(
    (cue) => timeSeconds >= cue.startTimeSeconds && timeSeconds < cue.endTimeSeconds,
  );
  const currentIndex = activeIndex === -1 ? cues.length - 1 : activeIndex;
  const currentCue = cues[currentIndex];
  const nextCue = cues[Math.min(cues.length - 1, currentIndex + 1)] ?? currentCue;
  const duration = Math.max(currentCue.endTimeSeconds - currentCue.startTimeSeconds, 1e-6);
  const localProgress = clamp((timeSeconds - currentCue.startTimeSeconds) / duration, 0, 1);
  const eased = localProgress * localProgress * (3 - 2 * localProgress);
  return lerp(selector(currentCue), selector(nextCue), eased);
};

export const createJourneyCuesFromAnalysis = (snapshot: Omit<AnalysisSnapshot, 'journeyCues'>): JourneyCue[] =>
  createJourneyCues({ ...snapshot, journeyCues: [] });

export const sampleJourneyFrame = (snapshot: AnalysisSnapshot, timeSeconds: number): JourneyFrame => {
  const durationSeconds = snapshot.document.durationSeconds;
  const clampedTime = clamp(timeSeconds, 0, durationSeconds);
  const segment =
    snapshot.journeyCues.find(
      (cue) => clampedTime >= cue.startTimeSeconds && clampedTime < cue.endTimeSeconds,
    ) ?? snapshot.journeyCues.at(-1) ?? null;

  return {
    timeSeconds: clampedTime,
    progress: durationSeconds > 0 ? clampedTime / durationSeconds : 0,
    energy: interpolateCueValue(snapshot.journeyCues, clampedTime, (cue) => cue.energy),
    density: interpolateCueValue(snapshot.journeyCues, clampedTime, (cue) => cue.density),
    onsetActivity: interpolateCueValue(snapshot.journeyCues, clampedTime, (cue) => cue.onsetActivity),
    dynamicContrast: interpolateCueValue(snapshot.journeyCues, clampedTime, (cue) => cue.dynamicContrast),
    travelSpeed: interpolateCueValue(snapshot.journeyCues, clampedTime, (cue) => cue.travelSpeed),
    complexity: interpolateCueValue(snapshot.journeyCues, clampedTime, (cue) => cue.complexity),
    segment,
  };
};
