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
    this.gridScale = 1.8 + random() * 1.5;
    this.terrainFrequency = 0.045 + random() * 0.035;
    this.sphereAnchorRadius = 18 + random() * 12;
    this.sphereAnchorVisible = random() > 0.22;
    this.baseHue = ((context.seed.normalizedSeed % 360) / 360 + 0.1) % 1;
  }

  public sample(frame: PlaybackFrame, journey: JourneyFrame): GroundPlaneFrame {
    const gridIntensity = clamp(0.42 + (1 - journey.complexity) * 0.18 + frame.velocityEnergy * 0.12, 0.4, 0.82);
    const terrainAmplitude = clamp(1.9 + journey.energy * 4.2 + journey.dynamicContrast * 1.6, 1.8, 6.4);
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
        (this.baseHue + 0.08 + journey.energy * 0.08 + journey.complexity * 0.05) % 1,
        clamp(0.58 + frame.velocityEnergy * 0.18, 0.52, 0.86),
        clamp(0.28 + journey.energy * 0.2, 0.24, 0.52),
      ],
    };
  }
}
