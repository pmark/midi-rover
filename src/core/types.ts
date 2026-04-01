export interface TempoEvent {
  tick: number;
  timeSeconds: number;
  microsecondsPerBeat: number;
  bpm: number;
}

export interface MeterEvent {
  tick: number;
  timeSeconds: number;
  numerator: number;
  denominator: number;
}

export interface TrackInfo {
  index: number;
  name: string;
  programNumbers: number[];
}

export interface ProgramChangeEvent {
  trackIndex: number;
  channel: number;
  programNumber: number;
  tick: number;
  timeSeconds: number;
}

export interface NoteEvent {
  id: string;
  trackIndex: number;
  channel: number;
  programNumber: number;
  isPercussion: boolean;
  pitch: number;
  velocity: number;
  startTick: number;
  endTick: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
}

export interface NormalizedMidiDocument {
  sourceHash: string;
  format: number;
  ticksPerBeat: number | null;
  secondsPerTick: number | null;
  durationSeconds: number;
  trackCount: number;
  tracks: TrackInfo[];
  tempoEvents: TempoEvent[];
  meterEvents: MeterEvent[];
  programChanges: ProgramChangeEvent[];
  notes: NoteEvent[];
}

export interface SectionCue {
  index: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  energy: number;
  density: number;
  label: 'intro' | 'pulse' | 'lift' | 'peak' | 'release';
}

export type JourneySegmentLabel = 'approach' | 'cruise' | 'lift' | 'orbit' | 'release';

export interface JourneyCue {
  index: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  energy: number;
  density: number;
  onsetActivity: number;
  dynamicContrast: number;
  travelSpeed: number;
  complexity: number;
  label: JourneySegmentLabel;
}

export interface JourneyFrame {
  timeSeconds: number;
  progress: number;
  energy: number;
  density: number;
  onsetActivity: number;
  dynamicContrast: number;
  travelSpeed: number;
  complexity: number;
  segment: JourneyCue | null;
}

export interface PlaybackFrame {
  timeSeconds: number;
  durationSeconds: number;
  progress: number;
  activeNotes: NoteEvent[];
  recentOnsets: NoteEvent[];
  dominantPitch: number | null;
  polyphony: number;
  polyphonyNormalized: number;
  velocityEnergy: number;
  sectionCue: SectionCue | null;
}

export interface AnalysisSnapshot {
  document: NormalizedMidiDocument;
  sectionCues: SectionCue[];
  journeyCues: JourneyCue[];
  maxPolyphony: number;
  averageVelocity: number;
  noteDensityPeak: number;
}

export interface TransportState {
  currentTimeSeconds: number;
  durationSeconds: number;
  progress: number;
  isPlaying: boolean;
  playbackRate: number;
}

export type AudioPlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'blocked' | 'error';

export interface AudioPlaybackState {
  status: AudioPlaybackStatus;
  volume: number;
  loadingInstruments: number;
  loadedInstruments: number;
  cachedInstruments: number;
  fallbackInstruments: number;
  message: string | null;
}

export type AudioPlaybackListener = (state: AudioPlaybackState) => void;

export interface AudioPlaybackController {
  getState(): AudioPlaybackState;
  subscribe(listener: AudioPlaybackListener): () => void;
  prepare(document: NormalizedMidiDocument): Promise<void>;
  play(startTimeSeconds: number): Promise<boolean>;
  pause(): void;
  seek(timeSeconds: number, resumePlayback?: boolean): Promise<void>;
  setVolume(volume: number): void;
  destroy(): void;
}

export type TransportListener = (state: TransportState) => void;

export interface TransportController {
  getState(): TransportState;
  subscribe(listener: TransportListener): () => void;
  play(): void;
  pause(): void;
  seek(timeSeconds: number): void;
  setRate(playbackRate: number): void;
  sample(timeSeconds: number): TransportState;
  destroy(): void;
}

export interface SeedConfig {
  displaySeed: string;
  normalizedSeed: number;
}

export interface CameraJourneyFrame {
  position: [x: number, y: number, z: number];
  target: [x: number, y: number, z: number];
  rollRadians: number;
  fieldOfViewDegrees: number;
  travelSpeed: number;
  complexity: number;
  segmentLabel: JourneySegmentLabel;
}

export interface GroundPlaneFrame {
  gridIntensity: number;
  gridScale: number;
  terrainAmplitude: number;
  terrainFrequency: number;
  terrainScroll: number;
  sphereAnchorVisible: boolean;
  sphereAnchorRadius: number;
  accentColorHsl: [h: number, s: number, l: number];
}
