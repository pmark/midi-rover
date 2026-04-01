# MIDI Rover Data Flow

This milestone keeps the app split across five boundaries:

- `src/core`: neutral contracts for MIDI documents, playback frames, seeds, and transport.
- `src/analysis`: MIDI parsing plus precomputed timeline and feature sampling.
- `src/audio`: fetched soundfont loading, Web Audio scheduling, and master output control.
- `src/visual`: deterministic mapping from musical features into scene-ready particle, camera, and ground descriptors.
- `src/rendering/three`: Three.js-only rendering of ambient and dynamic particles, camera transforms, and grounded environment meshes.
- `src/ui`: browser file loading, persisted file restore, transport controls, and orchestration.

## End-to-end slice

1. The UI restores the last loaded MIDI from browser storage when available, or reads a newly selected file into bytes.
2. The analysis adapter parses those bytes into a `NormalizedMidiDocument`.
3. The analysis snapshot derives section cues and playback sampling metrics.
4. The audio controller prepares cached soundfont instruments for the programs used by the MIDI file.
5. The shared transport advances the playhead for both audio scheduling and visual sampling.
6. The analysis snapshot also derives journey cues for energy, density, onset activity, and dynamic contrast.
7. The visual scene profile maps the current `PlaybackFrame` plus journey cues into deterministic particle, camera, and ground descriptors.
8. The Three renderer draws those descriptors without direct MIDI knowledge.

## Layer model

The current scene profile contains one concrete `ParticleFieldLayer`, plus a seeded camera director and a hybrid ground profile. Future modes should implement the same visual-layer and scene-director contracts rather than adding rendering or parsing logic to unrelated modules.

## Camera and ground ownership

- `src/analysis` owns MIDI-derived journey cues only.
- `src/visual` owns camera plotting, spline control points, simplex-based synthwave terrain sampling, and scene-facing descriptors.
- `src/rendering/three` consumes those descriptors to move the camera and draw the grid plane, procedural terrain, and distant world anchor.
