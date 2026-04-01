import type { CameraJourneyFrame, JourneyFrame, PlaybackFrame } from '../core/types.ts';
import { createDeterministicRandom } from './seed.ts';
import type { VisualCameraDirector, VisualLayerContext } from './types.ts';

type Point3 = [x: number, y: number, z: number];
const MIN_DOWNWARD_ANGLE_RADIANS = (22 * Math.PI) / 180;
const MAX_DOWNWARD_ANGLE_RADIANS = (84 * Math.PI) / 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, amount: number): number => start + (end - start) * amount;

const smoothstep = (value: number): number => value * value * (3 - 2 * value);

const normalizePitch = (pitch: number): number => clamp((pitch - 24) / 72, 0, 1);

const interpolatePoint = (points: Point3[], progress: number): Point3 => {
  if (points.length === 0) {
    return [0, 0, 16];
  }

  if (points.length === 1) {
    return points[0];
  }

  const scaledProgress = clamp(progress, 0, 1) * (points.length - 1);
  const segmentIndex = Math.min(points.length - 2, Math.floor(scaledProgress));
  const localProgress = smoothstep(scaledProgress - segmentIndex);
  const p0 = points[Math.max(0, segmentIndex - 1)];
  const p1 = points[segmentIndex];
  const p2 = points[Math.min(points.length - 1, segmentIndex + 1)];
  const p3 = points[Math.min(points.length - 1, segmentIndex + 2)];
  const point: Point3 = [0, 0, 0];

  for (let axis = 0; axis < 3; axis += 1) {
    point[axis] =
      0.5 *
      ((2 * p1[axis]) +
        (-p0[axis] + p2[axis]) * localProgress +
        (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * localProgress * localProgress +
        (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * localProgress * localProgress * localProgress);
  }

  return point;
};

const createCameraControlPoints = (context: VisualLayerContext): Point3[] => {
  const random = createDeterministicRandom(context.seed.normalizedSeed ^ 0x51f15e7d);
  const cues = context.analysis.journeyCues;

  if (cues.length === 0) {
    return [
      [0, 2.5, 18],
      [0, 2.5, 10],
    ];
  }

  const totalDepth = Math.max(28, context.analysis.document.durationSeconds * 3.6);

  return cues.map((cue, index) => {
    const cueProgress = cues.length === 1 ? 0 : index / (cues.length - 1);
    const lateralSwing = (random() * 2 - 1) * (1.4 + cue.complexity * 6.2);
    const altitude = 1.8 + cue.energy * 4.2 + cue.dynamicContrast * 2.1 + (random() * 2 - 1) * 0.9;
    const depth = lerp(totalDepth * 0.08, -totalDepth, cueProgress) - cue.travelSpeed * 1.1;
    const orbitBias = cue.label === 'orbit' ? (index % 2 === 0 ? 1 : -1) * (2.8 + cue.complexity * 1.6) : 0;

    return [
      clamp(lateralSwing + orbitBias, -9.5, 9.5),
      clamp(altitude, 1.4, 9.5),
      depth,
    ];
  });
};

const computeTarget = (frame: PlaybackFrame, cameraPosition: Point3): Point3 => {
  const pitchCenter = frame.dominantPitch === null ? 0.5 : normalizePitch(frame.dominantPitch);
  const targetX = clamp((pitchCenter - 0.5) * 4.8 + (frame.polyphonyNormalized - 0.5) * 1.4, -4.5, 4.5);
  const targetY = lerp(-3.9, 1.8, pitchCenter) + frame.velocityEnergy * 0.45;
  const targetZ = cameraPosition[2] - lerp(6.4, 10.8, frame.progress) - frame.recentOnsets.length * 0.03;

  return [targetX, targetY, targetZ];
};

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
  private readonly controlPoints: Point3[];

  public constructor(context: VisualLayerContext) {
    this.controlPoints = createCameraControlPoints(context);
  }

  public sample(frame: PlaybackFrame, journey: JourneyFrame): CameraJourneyFrame {
    const cameraProgress = clamp(journey.progress * 0.92 + journey.travelSpeed * 0.03, 0, 1);
    const position = interpolatePoint(this.controlPoints, cameraProgress);
    const aheadPosition = interpolatePoint(this.controlPoints, clamp(cameraProgress + 0.02 + journey.travelSpeed * 0.015, 0, 1));
    const target = constrainTargetToGroundView(position, computeTarget(frame, aheadPosition));
    const rollDirection = journey.segment?.label === 'orbit' ? 1 : journey.segment?.label === 'release' ? -0.35 : 0.2;
    const rollRadians = clamp((journey.complexity - 0.4) * 0.22 * rollDirection, -0.12, 0.12);
    const fieldOfViewDegrees = clamp(42 + journey.travelSpeed * 7 + journey.complexity * 5, 40, 54);

    return {
      position,
      target,
      rollRadians,
      fieldOfViewDegrees,
      travelSpeed: journey.travelSpeed,
      complexity: journey.complexity,
      segmentLabel: journey.segment?.label ?? 'approach',
    };
  }
}
