import type { CameraJourneyFrame, JourneyFrame, PlaybackFrame } from '../core/types.ts';
import { createDeterministicRandom } from './seed.ts';
import type { VisualCameraDirector, VisualLayerContext } from './types.ts';

type Point3 = [x: number, y: number, z: number];

const MIN_DOWNWARD_ANGLE_RADIANS = (8 * Math.PI) / 180;
const MAX_DOWNWARD_ANGLE_RADIANS = (22 * Math.PI) / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizePitch = (pitch: number): number => clamp((pitch - 24) / 72, 0, 1);

const constrainTargetToGroundView = (cameraPosition: Point3, target: Point3): Point3 => {
  const horizontalDistance = Math.max(1.5, Math.abs(cameraPosition[2] - target[2]));
  const currentAngle = Math.atan2(cameraPosition[1] - target[1], horizontalDistance);
  const clampedAngle = clamp(currentAngle, MIN_DOWNWARD_ANGLE_RADIANS, MAX_DOWNWARD_ANGLE_RADIANS);

  return [
    target[0],
    cameraPosition[1] - Math.tan(clampedAngle) * horizontalDistance,
    target[2],
  ];
};

export class CameraJourneyDirector implements VisualCameraDirector {
  private readonly lanePhaseX: number;
  private readonly lanePhaseY: number;
  private readonly targetPhaseX: number;
  private readonly targetPhaseY: number;
  private readonly xAmplitude: number;
  private readonly yBase: number;
  private readonly yAmplitude: number;
  private readonly lookAheadDistance: number;
  private readonly forwardSpeed: number;
  private readonly targetRadiusX: number;
  private readonly targetRadiusY: number;

  public constructor(context: VisualLayerContext) {
    const random = createDeterministicRandom(context.seed.normalizedSeed ^ 0x51f15e7d);
    this.lanePhaseX = random() * Math.PI * 2;
    this.lanePhaseY = random() * Math.PI * 2;
    this.targetPhaseX = random() * Math.PI * 2;
    this.targetPhaseY = random() * Math.PI * 2;
    this.xAmplitude = 0.3 + random() * 0.45;
    this.yBase = 2.5 + random() * 0.7;
    this.yAmplitude = 0.18 + random() * 0.28;
    this.lookAheadDistance = 24 + random() * 5;
    this.forwardSpeed = 2.8 + random() * 1.1;
    this.targetRadiusX = 0.28 + random() * 0.3;
    this.targetRadiusY = 0.14 + random() * 0.18;
  }

  public sample(frame: PlaybackFrame, journey: JourneyFrame): CameraJourneyFrame {
    const speed = this.forwardSpeed + journey.travelSpeed * 3.2 + journey.energy * 1.35;
    const lateralPhase = frame.timeSeconds * (0.42 + journey.complexity * 0.28) + this.lanePhaseX;
    const verticalPhase = frame.timeSeconds * (0.76 + journey.travelSpeed * 0.34) + this.lanePhaseY;
    const targetPhaseX = frame.timeSeconds * (0.34 + journey.travelSpeed * 0.24) + this.targetPhaseX;
    const targetPhaseY = frame.timeSeconds * (0.58 + journey.complexity * 0.25) + this.targetPhaseY;
    const pitchCenter = frame.dominantPitch === null ? 0.5 : normalizePitch(frame.dominantPitch);

    const position: Point3 = [
      Math.sin(lateralPhase) * (this.xAmplitude + journey.complexity * 0.22),
      this.yBase +
        Math.sin(verticalPhase) * (this.yAmplitude + journey.travelSpeed * 0.16) +
        (frame.velocityEnergy - 0.5) * 0.22,
      18 - frame.timeSeconds * speed,
    ];

    const unconstrainedTarget: Point3 = [
      Math.sin(targetPhaseX) * (this.targetRadiusX + frame.polyphonyNormalized * 0.12) +
        (pitchCenter - 0.5) * 0.24,
      -2.1 + Math.sin(targetPhaseY) * (this.targetRadiusY + frame.velocityEnergy * 0.08) + (pitchCenter - 0.5) * 0.15,
      position[2] - this.lookAheadDistance,
    ];
    const target = constrainTargetToGroundView(position, unconstrainedTarget);

    return {
      position,
      target,
      rollRadians: clamp((target[0] - position[0]) * 0.018, -0.02, 0.02),
      fieldOfViewDegrees: clamp(58 + journey.travelSpeed * 5 + journey.complexity * 2, 57, 65),
      travelSpeed: journey.travelSpeed,
      complexity: journey.complexity,
      segmentLabel: journey.segment?.label ?? 'approach',
    };
  }
}
