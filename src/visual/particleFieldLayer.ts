import type { NoteEvent, PlaybackFrame } from '../core/types';
import { createDeterministicRandom, hashValue } from './seed';
import type {
  AmbientParticle,
  BackgroundState,
  ParticleInstance,
  VisualLayer,
  VisualLayerContext,
  VisualLayerRenderState,
} from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizePitch = (pitch: number): number => clamp((pitch - 24) / 72, 0, 1);

const createAmbientField = (seed: number, count = 180): AmbientParticle[] => {
  const random = createDeterministicRandom(seed);
  const ambient: AmbientParticle[] = [];

  for (let index = 0; index < count; index += 1) {
    ambient.push({
      position: [
        (random() * 2 - 1) * 11,
        (random() * 2 - 1) * 6,
        (random() * 2 - 1) * 6,
      ],
      colorHsl: [0.47 + random() * 0.12, 0.55 + random() * 0.2, 0.4 + random() * 0.28],
      alpha: 0.18 + random() * 0.32,
      size: 0.03 + random() * 0.07,
    });
  }

  return ambient;
};

const createLaneMap = (seed: number): number[] => {
  const random = createDeterministicRandom(seed ^ 0x9e3779b9);
  return Array.from({ length: 12 }, (_, index) => (index - 5.5) * 1.15 + (random() * 2 - 1) * 0.28);
};

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
    const noteParticles = frame.activeNotes.slice(-72).map((note) =>
      noteToParticle(note, frame, this.laneMap, this.baseHue, sectionEnergy),
    );
    const burstParticles = frame.recentOnsets.slice(-14).flatMap((note) =>
      createBurstParticles(note, frame, this.laneMap, this.baseHue),
    );
    const background: BackgroundState = {
      colorHsl: [
        (this.baseHue + sectionEnergy * 0.04) % 1,
        clamp(0.46 + this.averageVelocity * 0.18, 0, 1),
        clamp(0.08 + frame.velocityEnergy * 0.08 + sectionEnergy * 0.05, 0.05, 0.26),
      ],
      fogStrength: clamp(0.18 + sectionEnergy * 0.52 + frame.polyphonyNormalized * 0.18, 0.1, 1),
    };

    return {
      id: this.id,
      ambientParticles: this.context.analysis.document.notes.length > 0 ? this.ambientParticles : [],
      particles: [...noteParticles, ...burstParticles],
      background,
    };
  }
}
