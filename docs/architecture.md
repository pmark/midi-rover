# MIDI Signal Form Data Flow

This milestone keeps the app split across five boundaries:

- `src/core`: neutral contracts for MIDI documents, playback frames, seeds, and transport.
- `src/analysis`: MIDI parsing plus precomputed timeline and feature sampling.
- `src/audio`: fetched soundfont loading, Web Audio scheduling, and master output control.
- `src/visual`: deterministic mapping from musical features into scene-ready particle descriptors.
- `src/rendering/three`: Three.js-only rendering of ambient and dynamic particles.
- `src/ui`: browser file loading, persisted file restore, transport controls, and orchestration.

## End-to-end slice

1. The UI restores the last loaded MIDI from browser storage when available, or reads a newly selected file into bytes.
2. The analysis adapter parses those bytes into a `NormalizedMidiDocument`.
3. The analysis snapshot derives section cues and playback sampling metrics.
4. The audio controller prepares cached soundfont instruments for the programs used by the MIDI file.
5. The shared transport advances the playhead for both audio scheduling and visual sampling.
6. The visual scene profile maps the current `PlaybackFrame` into deterministic particle descriptors.
7. The Three renderer draws those descriptors without direct MIDI knowledge.

## Layer model

The current scene profile contains one concrete `ParticleFieldLayer`, but the profile is already structured to host multiple layers at once. Future modes should implement the same visual-layer sampling contract rather than adding rendering or parsing logic to unrelated modules.
