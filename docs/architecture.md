# MIDI Signal Form Data Flow

This milestone keeps the app split across five boundaries:

- `src/core`: neutral contracts for MIDI documents, playback frames, seeds, and transport.
- `src/analysis`: MIDI parsing plus precomputed timeline and feature sampling.
- `src/visual`: deterministic mapping from musical features into scene-ready particle descriptors.
- `src/rendering/three`: Three.js-only rendering of ambient and dynamic particles.
- `src/ui`: browser file loading, transport controls, and orchestration.

## End-to-end slice

1. The UI reads a local MIDI file into bytes.
2. The analysis adapter parses those bytes into a `NormalizedMidiDocument`.
3. The analysis snapshot derives section cues and playback sampling metrics.
4. The transport samples a `PlaybackFrame` at the current playhead time.
5. The visual scene profile maps that frame into deterministic particle descriptors.
6. The Three renderer draws those descriptors without direct MIDI knowledge.

## Layer model

The current scene profile contains one concrete `ParticleFieldLayer`, but the profile is already structured to host multiple layers at once. Future modes should implement the same visual-layer sampling contract rather than adding rendering or parsing logic to unrelated modules.
