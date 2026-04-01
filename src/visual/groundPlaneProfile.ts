import type { CameraJourneyFrame, GroundPlaneFrame, JourneyFrame, PlaybackFrame } from '../core/types.ts';
import { createDeterministicRandom } from './seed.ts';
import { SynthwaveTerrain, TERRAIN_SIZE } from './synthwaveTerrain.ts';
import type { VisualGroundProfile, VisualLayerContext } from './types.ts';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const TERRAIN_RING_SEGMENTS = 5;

export class GroundPlaneProfile implements VisualGroundProfile {
  private readonly hasMusicalNotes: boolean;
  private readonly gridScale: number;
  private readonly terrainFrequency: number;
  private readonly sphereAnchorRadius: number;
  private readonly sphereAnchorVisible: boolean;
  private readonly baseHue: number;
  private readonly terrain: SynthwaveTerrain;

  public constructor(context: VisualLayerContext) {
    this.hasMusicalNotes = context.analysis.document.notes.length > 0;
    const random = createDeterministicRandom(context.seed.normalizedSeed ^ 0xa5f1523d);
    this.gridScale = 1.8 + random() * 1.5;
    this.terrainFrequency = 0.045 + random() * 0.035;
    this.sphereAnchorRadius = 18 + random() * 12;
    this.sphereAnchorVisible = random() > 0.22;
    this.baseHue = ((context.seed.normalizedSeed % 360) / 360 + 0.1) % 1;
    this.terrain = new SynthwaveTerrain(context.seed.normalizedSeed);
  }

  public sample(frame: PlaybackFrame, journey: JourneyFrame, camera: CameraJourneyFrame): GroundPlaneFrame {
    const gridIntensity = this.hasMusicalNotes
      ? clamp(0.42 + (1 - journey.complexity) * 0.18 + frame.velocityEnergy * 0.12, 0.4, 0.82)
      : 0.84;
    const terrainAmplitude = this.hasMusicalNotes
      ? clamp(1.9 + journey.energy * 4.2 + journey.dynamicContrast * 1.6, 1.8, 6.4)
      : 8.8;
    const terrainScroll = frame.timeSeconds * (0.035 + journey.travelSpeed * 0.09);
    const containingSegmentIndex = Math.floor((camera.position[2] + TERRAIN_SIZE * 0.5) / TERRAIN_SIZE);
    const terrainSegments = Array.from({ length: TERRAIN_RING_SEGMENTS }, (_, index) => {
      const segmentIndex = containingSegmentIndex + 1 - index;
      const centerZ = segmentIndex * TERRAIN_SIZE;

      return {
        centerZ,
        heights: this.terrain.sample({
          amplitude: terrainAmplitude,
          frequency: this.terrainFrequency,
          worldOffsetZ: centerZ,
          travelSpeed: journey.travelSpeed,
          complexity: journey.complexity,
        }),
      };
    });

    return {
      gridIntensity,
      gridScale: this.hasMusicalNotes ? this.gridScale : this.gridScale * 1.1,
      terrainAmplitude,
      terrainFrequency: this.terrainFrequency,
      terrainScroll,
      terrainSegments,
      sphereAnchorVisible: this.hasMusicalNotes ? this.sphereAnchorVisible : true,
      sphereAnchorRadius: this.hasMusicalNotes ? this.sphereAnchorRadius : 26,
      accentColorHsl: [
        this.hasMusicalNotes
          ? (this.baseHue + 0.08 + journey.energy * 0.08 + journey.complexity * 0.05) % 1
          : 0.81,
        this.hasMusicalNotes ? clamp(0.58 + frame.velocityEnergy * 0.18, 0.52, 0.86) : 0.9,
        this.hasMusicalNotes ? clamp(0.28 + journey.energy * 0.2, 0.24, 0.52) : 0.44,
      ],
    };
  }
}
