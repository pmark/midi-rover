import type { AnalysisSnapshot, PlaybackFrame, SeedConfig } from '../core/types';
import { ParticleFieldLayer } from './particleFieldLayer';
import type { BackgroundState, VisualSceneFrame, VisualSceneProfile } from './types';

const defaultBackground: BackgroundState = {
  colorHsl: [0.56, 0.45, 0.1],
  fogStrength: 0.18,
};

export const createVisualSceneProfile = (analysis: AnalysisSnapshot, seed: SeedConfig): VisualSceneProfile => ({
  seed,
  layers: [new ParticleFieldLayer({ analysis, seed })],
});

export const sampleVisualScene = (profile: VisualSceneProfile, frame: PlaybackFrame): VisualSceneFrame => {
  const layerStates = profile.layers.map((layer) => layer.sample(frame));
  const background =
    layerStates.at(-1)?.background ??
    defaultBackground;

  return {
    ambientParticles: layerStates.flatMap((layer) => layer.ambientParticles),
    particles: layerStates.flatMap((layer) => layer.particles),
    background,
  };
};
