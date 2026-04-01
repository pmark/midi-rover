import type { AnalysisSnapshot, PlaybackFrame, SeedConfig } from '../core/types';

export interface AmbientParticle {
  position: [x: number, y: number, z: number];
  colorHsl: [h: number, s: number, l: number];
  alpha: number;
  size: number;
}

export interface ParticleInstance {
  position: [x: number, y: number, z: number];
  colorHsl: [h: number, s: number, l: number];
  alpha: number;
  size: number;
}

export interface BackgroundState {
  colorHsl: [h: number, s: number, l: number];
  fogStrength: number;
}

export interface VisualLayerRenderState {
  id: string;
  ambientParticles: AmbientParticle[];
  particles: ParticleInstance[];
  background: BackgroundState;
}

export interface VisualSceneFrame {
  ambientParticles: AmbientParticle[];
  particles: ParticleInstance[];
  background: BackgroundState;
}

export interface VisualLayer {
  id: string;
  sample(frame: PlaybackFrame): VisualLayerRenderState;
}

export interface VisualSceneProfile {
  seed: SeedConfig;
  layers: VisualLayer[];
}

export interface VisualLayerContext {
  analysis: AnalysisSnapshot;
  seed: SeedConfig;
}
