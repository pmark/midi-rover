import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { createDeterministicRandom } from './seed.ts';

export const TERRAIN_WIDTH = 220;
export const TERRAIN_DEPTH = 30;
export const TERRAIN_COLUMNS = 96;
export const TERRAIN_ROWS = 18;

interface SynthwaveTerrainSnapshot {
  amplitude: number;
  frequency: number;
  worldOffsetZ: number;
  scrollOffsetZ: number;
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
  private readonly valleyDepth: number;
  private readonly shoulderPower: number;
  private readonly scrollScale: number;
  private readonly twistPeriod: number;
  private readonly cornerPeriod: number;

  public constructor(seed: number) {
    const random = createDeterministicRandom(seed ^ 0x7f4a7c15);
    this.noise2D = fbm2d(createNoise2D(random), 3);
    this.ridgeNoise2D = fbm2d(createNoise2D(random), 2);
    this.roadWidth = 0.28 + random() * 0.08;
    this.valleyDepth = 0.44 + random() * 0.12;
    this.shoulderPower = 2.8 + random() * 0.7;
    this.scrollScale = 8 + random() * 5;
    this.twistPeriod = 22 + random() * 14;
    this.cornerPeriod = 7 + random() * 5;
  }

  public sample(snapshot: SynthwaveTerrainSnapshot): number[] {
    const stepX = TERRAIN_WIDTH / TERRAIN_COLUMNS;
    const stepZ = TERRAIN_DEPTH / TERRAIN_ROWS;
    const heights = new Array<number>((TERRAIN_ROWS + 1) * (TERRAIN_COLUMNS + 1));
    const scaledFrequency = snapshot.frequency * 8.5;
    const terrainOffset = snapshot.scrollOffsetZ * snapshot.frequency * this.scrollScale;

    for (let row = 0; row <= TERRAIN_ROWS; row += 1) {
      const z = -TERRAIN_DEPTH * 0.5 + row * stepZ + snapshot.worldOffsetZ;
      const normalizedDepth = clamp((z + TERRAIN_WIDTH * 0.5) / TERRAIN_WIDTH, 0, 1);
      const horizonMask = Math.pow(1 - normalizedDepth, 1.08 + snapshot.complexity * 0.26);
      const hilliness = 0.25 + Math.abs(Math.sin((z * scaledFrequency - terrainOffset) / (7.5 - snapshot.travelSpeed * 1.2))) * 0.75;
      const roadTwist =
        (2.4 + snapshot.complexity * 2.2) *
        Math.max(0, Math.sin((z * scaledFrequency - terrainOffset) / this.twistPeriod));
      const roadWinding = Math.sin((z * scaledFrequency - terrainOffset) / this.cornerPeriod) * roadTwist;

      for (let column = 0; column <= TERRAIN_COLUMNS; column += 1) {
        const x = -TERRAIN_WIDTH * 0.5 + column * stepX;
        const normalizedRoadX = ((x + roadWinding) / TERRAIN_WIDTH) * Math.PI * 2;
        const valleyMask = Math.max(this.roadWidth - 1, -Math.cos(normalizedRoadX)) + 1;
        const shoulderDistance = Math.abs(x + roadWinding) / (TERRAIN_WIDTH * 0.5);
        const foothillMask = Math.pow(clamp(shoulderDistance, 0, 1), this.shoulderPower);
        const valleyCenterMask = Math.pow(1 - clamp(Math.abs(x + roadWinding) / (TERRAIN_WIDTH * this.roadWidth), 0, 1), 1.35);
        const noiseX = x * scaledFrequency;
        const noiseZ = z * scaledFrequency - terrainOffset;
        const baseNoise = this.noise2D(noiseX, noiseZ);
        const ridgeNoise = 1 - Math.abs(this.ridgeNoise2D(noiseX * 0.8 + 12.5, noiseZ * 0.55 - 7.5));
        const shoulderLift = foothillMask * (0.52 + ridgeNoise * 0.5 + baseNoise * 0.18);
        const rollingLift = (baseNoise * 0.14 + ridgeNoise * 0.16) * hilliness * (0.45 + foothillMask * 0.85);
        const valleyFloor = valleyCenterMask * (this.valleyDepth + ridgeNoise * 0.16 + baseNoise * 0.08) + (1 - valleyMask) * 0.14;
        const terrainHeight =
          (shoulderLift + rollingLift) * snapshot.amplitude * 1.28 * horizonMask -
          valleyFloor * snapshot.amplitude * 0.78 -
          (1 - normalizedDepth) * 0.38;
        heights[row * (TERRAIN_COLUMNS + 1) + column] = terrainHeight;
      }
    }

    return heights;
  }
}
