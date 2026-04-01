// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import type { NormalizedMidiDocument, NoteEvent } from '../core/types.ts';
import { createAnalysisSnapshot, samplePlaybackFrame } from '../analysis/playbackAnalysis.ts';
import { createSeedConfig } from './seed.ts';
import { createVisualSceneProfile, sampleVisualScene } from './sceneProfile.ts';

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
