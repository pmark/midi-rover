import type { NoteEvent, PlaybackFrame } from '../core/types.ts';
import { createDeterministicRandom, hashValue } from './seed.ts';
import type {
  AmbientParticle,
  BackgroundState,
  ParticleInstance,
  VisualLayer,
  VisualLayerContext,
  VisualLayerRenderState,
} from './types.ts';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, amount: number): number => start + (end - start) * amount;

const smoothStep = (value: number): number => {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

const shortestHueDelta = (from: number, to: number): number => {
  const delta = (to - from + 0.5) % 1 - 0.5;
  return delta < -0.5 ? delta + 1 : delta;
};

const lerpHue = (from: number, to: number, amount: number): number =>
  (from + shortestHueDelta(from, to) * amount + 1) % 1;

const normalizePitch = (pitch: number): number => clamp((pitch - 24) / 72, 0, 1);

const createAmbientField = (seed: number, count = 180): AmbientParticle[] => {
  const random = createDeterministicRandom(seed);
  const ambient: AmbientParticle[] = [];

  for (let index = 0; index < count; index += 1) {
    ambient.push({
      position: [
        (random() * 2 - 1) * 11,
        2 + (random() * 2 - 1) * 4.5,
        -14 + random() * 8,
      ],
      colorHsl: [0.84 + random() * 0.05, 0.72 + random() * 0.18, 0.54 + random() * 0.18],
      alpha: 0.06 + random() * 0.16,
      size: 0.015 + random() * 0.045,
    });
  }

  return ambient;
};

const createLaneMap = (seed: number): number[] => {
  const random = createDeterministicRandom(seed ^ 0x9e3779b9);
  return Array.from({ length: 12 }, (_, index) => (index - 5.5) * 1.15 + (random() * 2 - 1) * 0.28);
};

const createIdleParticles = (
  frame: PlaybackFrame,
  laneMap: number[],
  baseHue: number,
): ParticleInstance[] =>
  laneMap.map((lane, index) => {
    const phase = frame.timeSeconds * 0.42 + index * 0.73;
    const pulse = 0.5 + (Math.sin(phase) + 1) * 0.25;
    return {
      position: [
        lane * 0.8,
        -2.8 + index * 0.42 + Math.sin(phase * 1.2) * 0.18,
        Math.cos(phase * 0.9) * 0.55,
      ],
      colorHsl: [
        (baseHue + index * 0.018) % 1,
        0.74,
        0.46 + pulse * 0.12,
      ],
      alpha: 0.32 + pulse * 0.18,
      size: 0.12 + pulse * 0.06,
    };
  });

const noteToParticle = (
  note: NoteEvent,
  frame: PlaybackFrame,
  laneMap: number[],
  baseHue: number,
  sectionEnergy: number,
): ParticleInstance => {
  const pitchNorm = normalizePitch(note.pitch);
  const age = Math.max(0, frame.timeSeconds - note.startTimeSeconds);
  const lane = laneMap[note.pitch % 12];
  const drift = (frame.sectionCue?.index ?? 0) * 0.11;
  const wobble = Math.sin(age * 2.4 + note.pitch * 0.31 + drift) * (0.18 + frame.polyphonyNormalized * 0.55);
  const depth = Math.cos(age * 1.8 + note.velocity * 0.07) * (0.25 + sectionEnergy * 0.9);

  return {
    position: [lane + wobble, pitchNorm * 8 - 4, depth],
    colorHsl: [
      (baseHue + (note.pitch % 12) * 0.036 + sectionEnergy * 0.06) % 1,
      clamp(0.62 + note.velocity / 255, 0, 1),
      clamp(0.46 + frame.velocityEnergy * 0.18, 0, 0.82),
    ],
    alpha: clamp(0.3 + note.velocity / 170 + frame.velocityEnergy * 0.25, 0.2, 0.95),
    size: 0.08 + (note.velocity / 127) * 0.18 + frame.polyphonyNormalized * 0.12,
  };
};

const createBurstParticles = (
  note: NoteEvent,
  frame: PlaybackFrame,
  laneMap: number[],
  baseHue: number,
): ParticleInstance[] => {
  const burstAge = frame.timeSeconds - note.startTimeSeconds;
  const normalizedAge = clamp(burstAge / 0.35, 0, 1);
  const seed = hashValue(`${note.id}:${Math.round(frame.timeSeconds * 1000)}`);
  const random = createDeterministicRandom(seed);
  const centerX = laneMap[note.pitch % 12];
  const centerY = normalizePitch(note.pitch) * 8 - 4;
  const burstCount = 8;

  return Array.from({ length: burstCount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / burstCount + random() * 0.5;
    const radius = normalizedAge * (0.45 + random() * 1.3);
    return {
      position: [
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius * 0.62,
        (random() * 2 - 1) * 0.6,
      ],
      colorHsl: [
        (baseHue + (note.pitch % 12) * 0.04 + index * 0.01) % 1,
        0.82,
        clamp(0.58 + note.velocity / 300 - normalizedAge * 0.24, 0.24, 0.9),
      ],
      alpha: clamp((1 - normalizedAge) * (0.48 + random() * 0.22), 0.08, 0.7),
      size: 0.06 + (1 - normalizedAge) * 0.17 + random() * 0.05,
    };
  });
};

export class ParticleFieldLayer implements VisualLayer {
  public readonly id = 'particle-field';

  private readonly ambientParticles: AmbientParticle[];
  private readonly laneMap: number[];
  private readonly baseHue: number;
  private readonly averageVelocity: number;
  private readonly context: VisualLayerContext;

  public constructor(context: VisualLayerContext) {
    this.context = context;
    this.ambientParticles = createAmbientField(context.seed.normalizedSeed);
    this.laneMap = createLaneMap(context.seed.normalizedSeed);
    this.baseHue = ((context.seed.normalizedSeed % 360) / 360 + 0.43) % 1;
    this.averageVelocity = context.analysis.averageVelocity;
  }

  public sample(frame: PlaybackFrame): VisualLayerRenderState {
    const sectionEnergy = frame.sectionCue?.energy ?? 0;
    const hasMusicalNotes = this.context.analysis.document.notes.length > 0;
    const noteParticles = frame.activeNotes.slice(-72).map((note) =>
      noteToParticle(note, frame, this.laneMap, this.baseHue, sectionEnergy),
    );
    const burstParticles = frame.recentOnsets.slice(-14).flatMap((note) =>
      createBurstParticles(note, frame, this.laneMap, this.baseHue),
    );
    const idleParticles = hasMusicalNotes ? [] : createIdleParticles(frame, this.laneMap, this.baseHue);
    const background = this.sampleBackground(frame);

    return {
      id: this.id,
      ambientParticles: this.ambientParticles,
      particles: [...idleParticles, ...noteParticles, ...burstParticles],
      background,
    };
  }

  private sampleBackground(frame: PlaybackFrame): BackgroundState {
    const sectionCues = this.context.analysis.sectionCues;
    const currentSection =
      frame.sectionCue ??
      sectionCues.at(-1) ?? {
        index: 0,
        startTimeSeconds: 0,
        endTimeSeconds: Math.max(frame.durationSeconds, 1),
        energy: 0,
        density: 0,
        label: 'intro' as const,
      };
    const nextSection = sectionCues[currentSection.index + 1] ?? currentSection;
    const sectionDuration = Math.max(currentSection.endTimeSeconds - currentSection.startTimeSeconds, 1e-6);
    const sectionProgress = clamp((frame.timeSeconds - currentSection.startTimeSeconds) / sectionDuration, 0, 1);
    const easedProgress = smoothStep(sectionProgress);

    const currentHue = (0.9 + currentSection.energy * 0.015 + currentSection.density * 0.01) % 1;
    const nextHue = (0.9 + nextSection.energy * 0.015 + nextSection.density * 0.01) % 1;
    const currentSaturation = clamp(0.74 + this.averageVelocity * 0.05 + currentSection.density * 0.05, 0.72, 0.9);
    const nextSaturation = clamp(0.74 + this.averageVelocity * 0.05 + nextSection.density * 0.05, 0.72, 0.9);
    const currentLightness = clamp(0.18 + currentSection.energy * 0.05 + currentSection.density * 0.02, 0.16, 0.28);
    const nextLightness = clamp(0.18 + nextSection.energy * 0.05 + nextSection.density * 0.02, 0.16, 0.28);
    const currentFogStrength = clamp(0.08 + currentSection.energy * 0.08 + currentSection.density * 0.04, 0.06, 0.22);
    const nextFogStrength = clamp(0.08 + nextSection.energy * 0.08 + nextSection.density * 0.04, 0.06, 0.22);

    return {
      colorHsl: [
        lerpHue(currentHue, nextHue, easedProgress),
        lerp(currentSaturation, nextSaturation, easedProgress),
        clamp(
          lerp(currentLightness, nextLightness, easedProgress) + frame.velocityEnergy * 0.015,
          0.16,
          0.3,
        ),
      ],
      fogStrength: clamp(
        lerp(currentFogStrength, nextFogStrength, easedProgress) + frame.polyphonyNormalized * 0.01,
        0.06,
        0.24,
      ),
    };
  }
}
