import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { createDeterministicRandom } from './seed.ts';

export const TERRAIN_SIZE = 120;
export const TERRAIN_SEGMENTS = 72;

interface SynthwaveTerrainSnapshot {
  amplitude: number;
  frequency: number;
  worldOffsetZ: number;
  travelSpeed: number;
  complexity: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const fbm2d = (noise2D: NoiseFunction2D, octaves: number): NoiseFunction2D => {
  return (x: number, y: number) => {
    let value = 0;
    let amplitude = 0.55;
    let currentX = x;
    let currentY = y;

    for (let index = 0; index < octaves; index += 1) {
      value += noise2D(currentX, currentY) * amplitude;
      currentX *= 2;
      currentY *= 2;
      amplitude *= 0.5;
    }

    return value;
  };
};

export class SynthwaveTerrain {
  private readonly noise2D: NoiseFunction2D;
  private readonly ridgeNoise2D: NoiseFunction2D;
  private readonly roadWidth: number;
  private readonly scrollScale: number;
  private readonly twistPeriod: number;
  private readonly cornerPeriod: number;

  public constructor(seed: number) {
    const random = createDeterministicRandom(seed ^ 0x7f4a7c15);
    this.noise2D = fbm2d(createNoise2D(random), 3);
    this.ridgeNoise2D = fbm2d(createNoise2D(random), 2);
    this.roadWidth = 0.24 + random() * 0.08;
    this.scrollScale = 8 + random() * 5;
    this.twistPeriod = 22 + random() * 14;
    this.cornerPeriod = 7 + random() * 5;
  }

  public sample(snapshot: SynthwaveTerrainSnapshot): number[] {
    const step = TERRAIN_SIZE / TERRAIN_SEGMENTS;
    const heights = new Array<number>((TERRAIN_SEGMENTS + 1) * (TERRAIN_SEGMENTS + 1));
    const scaledFrequency = snapshot.frequency * 8.5;
    const terrainOffset = snapshot.worldOffsetZ * snapshot.frequency * this.scrollScale;

    for (let row = 0; row <= TERRAIN_SEGMENTS; row += 1) {
      const z = -TERRAIN_SIZE * 0.5 + row * step + snapshot.worldOffsetZ;
      const normalizedDepth = clamp((z + TERRAIN_SIZE * 0.5) / TERRAIN_SIZE, 0, 1);
      const horizonMask = Math.pow(1 - normalizedDepth, 1.25 + snapshot.complexity * 0.35);
      const hilliness = 0.25 + Math.abs(Math.sin((z * scaledFrequency - terrainOffset) / (7.5 - snapshot.travelSpeed * 1.2))) * 0.75;
      const roadTwist =
        (2.4 + snapshot.complexity * 2.2) *
        Math.max(0, Math.sin((z * scaledFrequency - terrainOffset) / this.twistPeriod));
      const roadWinding = Math.sin((z * scaledFrequency - terrainOffset) / this.cornerPeriod) * roadTwist;

      for (let column = 0; column <= TERRAIN_SEGMENTS; column += 1) {
        const x = -TERRAIN_SIZE * 0.5 + column * step;
        const normalizedRoadX = ((x + roadWinding) / TERRAIN_SIZE) * Math.PI * 2;
        const valleyMask = Math.max(this.roadWidth - 1, -Math.cos(normalizedRoadX)) + 1;
        const shoulderDistance = Math.abs(x + roadWinding) / (TERRAIN_SIZE * 0.5);
        const foothillMask = Math.pow(clamp(shoulderDistance, 0, 1), 2.4);
        const noiseX = x * scaledFrequency;
        const noiseZ = z * scaledFrequency - terrainOffset;
        const baseNoise = this.noise2D(noiseX, noiseZ);
        const ridgeNoise = 1 - Math.abs(this.ridgeNoise2D(noiseX * 0.8 + 12.5, noiseZ * 0.55 - 7.5));
        const shoulderLift = foothillMask * (0.35 + ridgeNoise * 0.4 + baseNoise * 0.18);
        const rollingLift = (baseNoise * 0.16 + ridgeNoise * 0.14) * hilliness;
        const valleyFloor = (1 - valleyMask) * (0.16 + baseNoise * 0.05);
        const terrainHeight =
          (shoulderLift + rollingLift) * snapshot.amplitude * 1.18 * horizonMask -
          valleyFloor * snapshot.amplitude * 0.42 -
          (1 - normalizedDepth) * 0.45;
        heights[row * (TERRAIN_SEGMENTS + 1) + column] = terrainHeight;
      }
    }

    return heights;
  }
}
