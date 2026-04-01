import type {
  AnalysisSnapshot,
  CameraJourneyFrame,
  GroundPlaneFrame,
  JourneyFrame,
  PlaybackFrame,
  SeedConfig,
} from '../core/types.ts';

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
  camera: CameraJourneyFrame;
  ground: GroundPlaneFrame;
}

export interface VisualLayer {
  id: string;
  sample(frame: PlaybackFrame): VisualLayerRenderState;
}

export interface VisualSceneProfile {
  analysis: AnalysisSnapshot;
  seed: SeedConfig;
  layers: VisualLayer[];
  cameraDirector: VisualCameraDirector;
  groundProfile: VisualGroundProfile;
}

export interface VisualLayerContext {
  analysis: AnalysisSnapshot;
  seed: SeedConfig;
}

export interface VisualCameraDirector {
  sample(frame: PlaybackFrame, journey: JourneyFrame): CameraJourneyFrame;
}

export interface VisualGroundProfile {
  sample(frame: PlaybackFrame, journey: JourneyFrame): GroundPlaneFrame;
}
