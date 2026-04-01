import type { GroundPlaneFrame, JourneyFrame, PlaybackFrame } from '../core/types.ts';
import { createDeterministicRandom } from './seed.ts';
import type { VisualGroundProfile, VisualLayerContext } from './types.ts';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export class GroundPlaneProfile implements VisualGroundProfile {
  private readonly gridScale: number;
  private readonly terrainFrequency: number;
  private readonly sphereAnchorRadius: number;
  private readonly sphereAnchorVisible: boolean;
  private readonly baseHue: number;

  public constructor(context: VisualLayerContext) {
    const random = createDeterministicRandom(context.seed.normalizedSeed ^ 0xa5f1523d);
    this.gridScale = 1.4 + random() * 1.6;
    this.terrainFrequency = 0.06 + random() * 0.08;
    this.sphereAnchorRadius = 16 + random() * 10;
    this.sphereAnchorVisible = random() > 0.22;
    this.baseHue = ((context.seed.normalizedSeed % 360) / 360 + 0.1) % 1;
  }

  public sample(frame: PlaybackFrame, journey: JourneyFrame): GroundPlaneFrame {
    const gridIntensity = clamp(0.34 + (1 - journey.complexity) * 0.22 + frame.velocityEnergy * 0.08, 0.28, 0.72);
    const terrainAmplitude = clamp(0.7 + journey.energy * 1.7 + journey.dynamicContrast * 0.8, 0.6, 2.7);
    const terrainScroll = frame.timeSeconds * (0.035 + journey.travelSpeed * 0.09);

    return {
      gridIntensity,
      gridScale: this.gridScale,
      terrainAmplitude,
      terrainFrequency: this.terrainFrequency,
      terrainScroll,
      sphereAnchorVisible: this.sphereAnchorVisible,
      sphereAnchorRadius: this.sphereAnchorRadius,
      accentColorHsl: [
        (this.baseHue + journey.energy * 0.06 + journey.complexity * 0.05) % 1,
        clamp(0.32 + frame.velocityEnergy * 0.24, 0.24, 0.76),
        clamp(0.16 + journey.energy * 0.18, 0.14, 0.42),
      ],
    };
  }
}
