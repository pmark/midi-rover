// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import type { NormalizedMidiDocument, NoteEvent } from '../core/types.ts';
import { createAnalysisSnapshot, createPlaceholderMidiDocument, samplePlaybackFrame } from '../analysis/playbackAnalysis.ts';
import { createSeedConfig } from './seed.ts';
import { createVisualSceneProfile, sampleVisualScene } from './sceneProfile.ts';
import { TERRAIN_COLUMNS, TERRAIN_DEPTH, TERRAIN_ROWS } from './synthwaveTerrain.ts';

const createNote = (
  id: string,
  pitch: number,
  velocity: number,
  startTimeSeconds: number,
  durationSeconds: number,
): NoteEvent => ({
  id,
  trackIndex: 0,
  channel: 0,
  programNumber: 0,
  isPercussion: false,
  pitch,
  velocity,
  startTick: Math.round(startTimeSeconds * 480),
  endTick: Math.round((startTimeSeconds + durationSeconds) * 480),
  startTimeSeconds,
  endTimeSeconds: startTimeSeconds + durationSeconds,
  durationSeconds,
});

const hueDistance = (left: number, right: number): number => {
  const direct = Math.abs(left - right);
  return Math.min(direct, 1 - direct);
};

const documentFixture: NormalizedMidiDocument = {
  sourceHash: 'fixture-midi',
  format: 1,
  ticksPerBeat: 480,
  secondsPerTick: 1 / 960,
  durationSeconds: 12,
  trackCount: 1,
  tracks: [{ index: 0, name: 'Piano', programNumbers: [0] }],
  tempoEvents: [{ tick: 0, timeSeconds: 0, microsecondsPerBeat: 500000, bpm: 120 }],
  meterEvents: [{ tick: 0, timeSeconds: 0, numerator: 4, denominator: 4 }],
  programChanges: [{ trackIndex: 0, channel: 0, programNumber: 0, tick: 0, timeSeconds: 0 }],
  notes: [
    createNote('n0', 48, 42, 0.0, 1.8),
    createNote('n1', 52, 55, 0.4, 1.4),
    createNote('n2', 57, 70, 2.3, 1.6),
    createNote('n3', 60, 88, 4.1, 1.2),
    createNote('n4', 67, 108, 4.2, 1.4),
    createNote('n5', 72, 118, 6.0, 2.1),
    createNote('n6', 76, 96, 6.1, 1.9),
    createNote('n7', 79, 110, 8.2, 1.4),
    createNote('n8', 83, 72, 10.1, 1.2),
  ],
};

test('scene profile is deterministic for the same midi and seed', () => {
  const analysis = createAnalysisSnapshot(documentFixture);
  const profileA = createVisualSceneProfile(analysis, createSeedConfig(documentFixture.sourceHash, 'balanced'));
  const profileB = createVisualSceneProfile(analysis, createSeedConfig(documentFixture.sourceHash, 'balanced'));
  const playbackFrame = samplePlaybackFrame(analysis, 6.15);
  const sceneA = sampleVisualScene(profileA, playbackFrame);
  const sceneB = sampleVisualScene(profileB, playbackFrame);

  assert.deepEqual(sceneA.camera, sceneB.camera);
  assert.deepEqual(sceneA.ground, sceneB.ground);
});

test('different seeds change the path while preserving safe camera bounds', () => {
  const analysis = createAnalysisSnapshot(documentFixture);
  const playbackFrame = samplePlaybackFrame(analysis, 6.15);
  const sceneA = sampleVisualScene(
    createVisualSceneProfile(analysis, createSeedConfig(documentFixture.sourceHash, 'seed-a')),
    playbackFrame,
  );
  const sceneB = sampleVisualScene(
    createVisualSceneProfile(analysis, createSeedConfig(documentFixture.sourceHash, 'seed-b')),
    playbackFrame,
  );

  assert.notDeepEqual(sceneA.camera.position, sceneB.camera.position);
  assert.ok(sceneA.camera.travelSpeed >= 0.18 && sceneA.camera.travelSpeed <= 0.88);
  assert.ok(sceneA.camera.complexity >= 0.12 && sceneA.camera.complexity <= 0.86);
  assert.ok(sceneA.camera.position[1] > -1 && sceneA.camera.position[1] < 12);
});

test('peak sections produce more energetic camera and terrain than quiet sections', () => {
  const analysis = createAnalysisSnapshot(documentFixture);
  const profile = createVisualSceneProfile(analysis, createSeedConfig(documentFixture.sourceHash, 'balanced'));
  const quietFrame = samplePlaybackFrame(analysis, 0.5);
  const peakFrame = samplePlaybackFrame(analysis, 6.2);
  const quietScene = sampleVisualScene(profile, quietFrame);
  const peakScene = sampleVisualScene(profile, peakFrame);

  assert.ok(peakScene.camera.travelSpeed > quietScene.camera.travelSpeed);
  assert.ok(peakScene.camera.complexity > quietScene.camera.complexity);
  assert.ok(peakScene.ground.terrainAmplitude > quietScene.ground.terrainAmplitude);
  assert.ok(quietScene.ground.gridIntensity >= 0.28);
});

test('scrubbed sampling is stable and tied to transport time', () => {
  const analysis = createAnalysisSnapshot(documentFixture);
  const profile = createVisualSceneProfile(analysis, createSeedConfig(documentFixture.sourceHash, 'balanced'));
  const frameOne = samplePlaybackFrame(analysis, 8.2);
  const frameTwo = samplePlaybackFrame(analysis, 8.2);

  assert.deepEqual(sampleVisualScene(profile, frameOne), sampleVisualScene(profile, frameTwo));
});

test('synthwave terrain keeps a central road valley between raised shoulders', () => {
  const analysis = createAnalysisSnapshot(documentFixture);
  const profile = createVisualSceneProfile(analysis, createSeedConfig(documentFixture.sourceHash, 'synthwave'));
  const scene = sampleVisualScene(profile, samplePlaybackFrame(analysis, 6.2));
  const referenceSegment = scene.ground.terrainSegments[Math.floor(scene.ground.terrainSegments.length / 2)];
  const row = Math.floor(TERRAIN_ROWS * 0.18);
  const rowWidth = TERRAIN_COLUMNS + 1;
  const centerHeight = referenceSegment.heights[row * rowWidth + Math.floor(TERRAIN_COLUMNS / 2)];
  const leftShoulderHeight = referenceSegment.heights[row * rowWidth + Math.floor(TERRAIN_COLUMNS * 0.18)];
  const rightShoulderHeight = referenceSegment.heights[row * rowWidth + Math.floor(TERRAIN_COLUMNS * 0.82)];

  assert.ok(leftShoulderHeight > centerHeight);
  assert.ok(rightShoulderHeight > centerHeight);
});

test('background color evolves smoothly across short transport intervals', () => {
  const analysis = createAnalysisSnapshot(documentFixture);
  const profile = createVisualSceneProfile(analysis, createSeedConfig(documentFixture.sourceHash, 'balanced'));
  const earlyScene = sampleVisualScene(profile, samplePlaybackFrame(analysis, 4.1));
  const laterScene = sampleVisualScene(profile, samplePlaybackFrame(analysis, 4.22));

  assert.ok(hueDistance(earlyScene.background.colorHsl[0], laterScene.background.colorHsl[0]) < 0.01);
  assert.ok(Math.abs(earlyScene.background.colorHsl[1] - laterScene.background.colorHsl[1]) < 0.01);
  assert.ok(Math.abs(earlyScene.background.colorHsl[2] - laterScene.background.colorHsl[2]) < 0.01);
  assert.ok(Math.abs(earlyScene.background.fogStrength - laterScene.background.fogStrength) < 0.015);
});

test('camera always advances forward and keeps a bounded look target ahead', () => {
  const analysis = createAnalysisSnapshot(documentFixture);
  const profile = createVisualSceneProfile(analysis, createSeedConfig(documentFixture.sourceHash, 'balanced'));
  const earlyScene = sampleVisualScene(profile, samplePlaybackFrame(analysis, 2.5));
  const laterScene = sampleVisualScene(profile, samplePlaybackFrame(analysis, 6.5));
  const earlyLookAhead = Math.abs(earlyScene.camera.position[2] - earlyScene.camera.target[2]);
  const laterLookAhead = Math.abs(laterScene.camera.position[2] - laterScene.camera.target[2]);

  assert.ok(laterScene.camera.position[2] < earlyScene.camera.position[2]);
  assert.ok(earlyLookAhead > 28 && earlyLookAhead < 36);
  assert.ok(Math.abs(earlyLookAhead - laterLookAhead) < 0.001);
  assert.ok(Math.abs(earlyScene.camera.target[0]) < 1.1);
  assert.ok(earlyScene.camera.target[1] < -3 && earlyScene.camera.target[1] > -8);
});

test('terrain chunks stay fixed in world space and extend ahead of the camera', () => {
  const analysis = createAnalysisSnapshot(documentFixture);
  const profile = createVisualSceneProfile(analysis, createSeedConfig(documentFixture.sourceHash, 'balanced'));
  const scene = sampleVisualScene(profile, samplePlaybackFrame(analysis, 6.5));
  const centers = scene.ground.terrainSegments.map((segment) => segment.centerZ);

  assert.equal(scene.ground.terrainSegments.length, 5);
  assert.ok(centers[0] > scene.camera.position[2]);
  assert.ok(centers.at(-1)! < scene.camera.position[2]);
  for (let index = 1; index < centers.length; index += 1) {
    assert.equal(centers[index - 1] - centers[index], TERRAIN_DEPTH);
  }
});

test('adjacent terrain strips share the same seam heights', () => {
  const analysis = createAnalysisSnapshot(documentFixture);
  const profile = createVisualSceneProfile(analysis, createSeedConfig(documentFixture.sourceHash, 'balanced'));
  const scene = sampleVisualScene(profile, samplePlaybackFrame(analysis, 6.5));
  const [frontStrip, nextStrip] = scene.ground.terrainSegments;
  const rowWidth = TERRAIN_COLUMNS + 1;

  for (let column = 0; column <= TERRAIN_COLUMNS; column += 1) {
    const leadingEdgeHeight = frontStrip.heights[column];
    const trailingEdgeHeight = nextStrip.heights[TERRAIN_ROWS * rowWidth + column];
    assert.ok(Math.abs(trailingEdgeHeight - leadingEdgeHeight) < 1e-9);
  }
});

test('placeholder scene renders deterministically without a MIDI file', () => {
  const document = createPlaceholderMidiDocument();
  const analysis = createAnalysisSnapshot(document);
  const profileA = createVisualSceneProfile(analysis, createSeedConfig(document.sourceHash, ''));
  const profileB = createVisualSceneProfile(analysis, createSeedConfig(document.sourceHash, ''));
  const frame = samplePlaybackFrame(analysis, 0);
  const sceneA = sampleVisualScene(profileA, frame);
  const sceneB = sampleVisualScene(profileB, frame);

  assert.equal(document.notes.length, 0);
  assert.ok(sceneA.ambientParticles.length > 0);
  assert.ok(sceneA.particles.length > 0);
  assert.ok(sceneA.ground.terrainAmplitude >= 8);
  assert.ok(sceneA.camera.position[1] >= 7);
  assert.ok(Math.abs(sceneA.camera.position[2] - sceneA.camera.target[2]) >= 70);
  assert.deepEqual(sceneA, sceneB);
});
