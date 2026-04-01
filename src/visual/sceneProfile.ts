import type { AnalysisSnapshot, PlaybackFrame, SeedConfig } from '../core/types.ts';
import { sampleJourneyFrame } from '../analysis/journeyAnalysis.ts';
import { CameraJourneyDirector } from './cameraJourneyDirector.ts';
import { GroundPlaneProfile } from './groundPlaneProfile.ts';
import { ParticleFieldLayer } from './particleFieldLayer.ts';
import type { BackgroundState, VisualSceneFrame, VisualSceneProfile } from './types.ts';

const defaultBackground: BackgroundState = {
  colorHsl: [0.56, 0.45, 0.1],
  fogStrength: 0.18,
};

export const createVisualSceneProfile = (analysis: AnalysisSnapshot, seed: SeedConfig): VisualSceneProfile => ({
  analysis,
  seed,
  layers: [new ParticleFieldLayer({ analysis, seed })],
  cameraDirector: new CameraJourneyDirector({ analysis, seed }),
  groundProfile: new GroundPlaneProfile({ analysis, seed }),
});

export const sampleVisualScene = (profile: VisualSceneProfile, frame: PlaybackFrame): VisualSceneFrame => {
  const layerStates = profile.layers.map((layer) => layer.sample(frame));
  const journey = sampleJourneyFrame(profile.analysis, frame.timeSeconds);
  const background =
    layerStates.at(-1)?.background ??
    defaultBackground;

  return {
    ambientParticles: layerStates.flatMap((layer) => layer.ambientParticles),
    particles: layerStates.flatMap((layer) => layer.particles),
    background,
    camera: profile.cameraDirector.sample(frame, journey),
    ground: profile.groundProfile.sample(frame, journey),
  };
};
