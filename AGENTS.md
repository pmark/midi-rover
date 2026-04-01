# Agent Instructions

## Mission

Build a web-based MIDI visualization prototyping lab that informs a production-quality iOS visualization and video feature in MIDI Opener.

---

## Primary Objectives

1. Maintain a modular architecture.
2. Prefer generators and templates over handwritten boilerplate.
3. Keep MIDI semantics separate from rendering.
4. Ensure deterministic outputs when seed inputs are unchanged.
5. Optimize for fast iteration on visual mapping quality.

---

## Non-Goals (Early Iterations)

- No backend
- No authentication
- No unnecessary frameworks
- No audio synthesis unless explicitly required
- No large UI libraries unless justified

---

## Required Architecture

Maintain strict boundaries:

### `src/core`
- Platform-neutral types
- Shared contracts
- Time and transport abstractions

### `src/analysis`
- MIDI parsing adapter
- Tempo and meter timeline
- Note activity tracking
- Feature extraction:
  - dominant pitch
  - polyphony
  - velocity energy
  - section cues

### `src/visual`
- Deterministic seed generation
- Mapping from musical features → visual parameters
- Scene profiles and presets

### `src/rendering/three`
- Three.js only
- No MIDI parsing
- No UI logic

### `src/ui`
- File loading
- Controls
- Transport
- App orchestration

---

## Rules for Agents

- Do not collapse domain boundaries.
- Do not mix analysis logic with rendering.
- Do not mix rendering logic with MIDI parsing.
- Prefer small, composable modules.
- Prefer pure functions for analysis and mapping.
- Define types before implementing logic.
- Preserve deterministic behavior for seeded systems.
- Add lightweight documentation for new subsystems.

---

## Preferred Workflow

1. Scaffold using generators.
2. Define contracts and structure.
3. Build a minimal vertical slice.
4. Validate visual mappings.
5. Refactor only after validation.

---

## First Milestone

Implement a minimal end-to-end slice:

- Load a MIDI file
- Parse into a normalized document
- Derive playback state over time
- Render one Three.js visual mode
- Support deterministic seed override
- Provide a minimal control surface
- Document data flow

---

## Definition of Done (Milestone One)

- Runs with `pnpm dev`
- MIDI file loads in browser
- Visual updates follow transport
- Same MIDI + same seed = identical output
- Clear separation:
  - analysis
  - visual mapping
  - rendering
