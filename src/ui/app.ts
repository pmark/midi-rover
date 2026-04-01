import type { AnalysisSnapshot, PlaybackFrame, TransportController, TransportState } from '../core/types';
import { createTransportController } from '../core/transport';
import { createAnalysisSnapshot, samplePlaybackFrame } from '../analysis/playbackAnalysis';
import { parseMidiFile } from '../analysis/midiParser';
import { ParticleSceneRenderer } from '../rendering/three/particleSceneRenderer';
import { createSeedConfig } from '../visual/seed';
import { createVisualSceneProfile, sampleVisualScene } from '../visual/sceneProfile';
import type { VisualSceneProfile } from '../visual/types';

type LoadedState = {
  analysis: AnalysisSnapshot;
  transport: TransportController;
  renderer: ParticleSceneRenderer;
  seedOverride: string;
  sceneProfile: VisualSceneProfile;
};

const formatSeconds = (value: number): string => {
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const describeCue = (frame: PlaybackFrame): string => {
  if (!frame.sectionCue) {
    return 'idle';
  }

  return `${frame.sectionCue.label} ${(frame.sectionCue.energy * 100).toFixed(0)}%`;
};

export const mountMidiLab = (root: HTMLElement): void => {
  root.innerHTML = `
    <div class="app-shell">
      <div class="lab-layout">
        <aside class="control-panel">
          <header>
            <div class="eyebrow">Milestone One</div>
            <h1 class="panel-title">MIDI signal form</h1>
            <p class="panel-copy">Load a MIDI file, derive a deterministic playback model, and drive a modular particle scene from musical features.</p>
          </header>

          <section class="stack">
            <h2 class="section-title">Input</h2>
            <label class="field">
              <span class="field-label"><span>MIDI file</span><span class="status-badge" data-file-name>No file loaded</span></span>
              <input data-file-input type="file" accept=".mid,.midi,audio/midi,audio/x-midi" />
            </label>
            <label class="field">
              <span class="field-label"><span>Seed override</span><span data-seed-display>auto</span></span>
              <input data-seed-input type="text" placeholder="Leave blank to derive from MIDI content" spellcheck="false" />
            </label>
            <p class="data-flow"><strong>Data flow</strong><br />MIDI file -> normalized document -> analysis snapshot -> playback frame -> visual mapping -> Three renderer</p>
          </section>

          <section class="stack">
            <h2 class="section-title">Transport</h2>
            <div class="transport-row">
              <button type="button" class="primary" data-play>Play</button>
              <button type="button" data-pause>Pause</button>
              <button type="button" data-restart>Restart</button>
            </div>
            <label class="field">
              <span class="field-label"><span>Timeline</span><span data-time-readout>0:00 / 0:00</span></span>
              <div class="range-line">
                <input data-seek type="range" min="0" max="1" value="0" step="0.001" />
                <output data-progress-readout>0%</output>
              </div>
            </label>
            <label class="field">
              <span class="field-label"><span>Playback rate</span><span data-rate-readout>1.00x</span></span>
              <div class="range-line">
                <input data-rate type="range" min="0.5" max="2" value="1" step="0.05" />
              </div>
            </label>
          </section>

          <section class="stack">
            <h2 class="section-title">Analysis</h2>
            <dl class="metrics-grid">
              <div class="metric-card"><dt>Tracks</dt><dd data-tracks>0</dd></div>
              <div class="metric-card"><dt>Notes</dt><dd data-notes>0</dd></div>
              <div class="metric-card"><dt>Tempo map</dt><dd data-tempos>0</dd></div>
              <div class="metric-card"><dt>Section cues</dt><dd data-cues>0</dd></div>
              <div class="metric-card"><dt>Polyphony</dt><dd data-polyphony>0</dd></div>
              <div class="metric-card"><dt>Energy</dt><dd data-energy>0%</dd></div>
              <div class="metric-card"><dt>Dominant pitch</dt><dd data-pitch>--</dd></div>
              <div class="metric-card"><dt>Current cue</dt><dd data-cue-label>idle</dd></div>
            </dl>
            <p class="helper-copy" data-helper>Waiting for a MIDI file. The same MIDI content and the same seed override produce the same visual field.</p>
            <p class="error-copy" data-error hidden></p>
          </section>
        </aside>

        <section class="visual-panel">
          <div class="visual-header">
            <div>
              <h2>Composite Particle Scene</h2>
              <p>One modular visual layer now, scene-profile composition ready for additional modes later.</p>
            </div>
            <button type="button" class="secondary-action" data-snapshot>Render current frame</button>
          </div>
          <div class="canvas-host" data-canvas-host>
            <div class="canvas-overlay">
              <div class="pill" data-overlay-seed>seed: auto</div>
              <div class="pill" data-overlay-cue>cue: idle</div>
              <div class="pill" data-overlay-notes>notes: 0</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  const fileInput = root.querySelector<HTMLInputElement>('[data-file-input]');
  const seedInput = root.querySelector<HTMLInputElement>('[data-seed-input]');
  const playButton = root.querySelector<HTMLButtonElement>('[data-play]');
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-pause]');
  const restartButton = root.querySelector<HTMLButtonElement>('[data-restart]');
  const seekInput = root.querySelector<HTMLInputElement>('[data-seek]');
  const rateInput = root.querySelector<HTMLInputElement>('[data-rate]');
  const snapshotButton = root.querySelector<HTMLButtonElement>('[data-snapshot]');
  const canvasHost = root.querySelector<HTMLElement>('[data-canvas-host]');
  const helperCopy = root.querySelector<HTMLElement>('[data-helper]');
  const errorCopy = root.querySelector<HTMLElement>('[data-error]');
  const timeReadout = root.querySelector<HTMLElement>('[data-time-readout]');
  const progressReadout = root.querySelector<HTMLElement>('[data-progress-readout]');
  const rateReadout = root.querySelector<HTMLElement>('[data-rate-readout]');
  const fileName = root.querySelector<HTMLElement>('[data-file-name]');
  const seedDisplay = root.querySelector<HTMLElement>('[data-seed-display]');
  const overlaySeed = root.querySelector<HTMLElement>('[data-overlay-seed]');
  const overlayCue = root.querySelector<HTMLElement>('[data-overlay-cue]');
  const overlayNotes = root.querySelector<HTMLElement>('[data-overlay-notes]');
  const trackMetric = root.querySelector<HTMLElement>('[data-tracks]');
  const noteMetric = root.querySelector<HTMLElement>('[data-notes]');
  const tempoMetric = root.querySelector<HTMLElement>('[data-tempos]');
  const cueMetric = root.querySelector<HTMLElement>('[data-cues]');
  const polyphonyMetric = root.querySelector<HTMLElement>('[data-polyphony]');
  const energyMetric = root.querySelector<HTMLElement>('[data-energy]');
  const pitchMetric = root.querySelector<HTMLElement>('[data-pitch]');
  const cueLabelMetric = root.querySelector<HTMLElement>('[data-cue-label]');

  if (
    !fileInput ||
    !seedInput ||
    !playButton ||
    !pauseButton ||
    !restartButton ||
    !seekInput ||
    !rateInput ||
    !snapshotButton ||
    !canvasHost ||
    !helperCopy ||
    !errorCopy ||
    !timeReadout ||
    !progressReadout ||
    !rateReadout ||
    !fileName ||
    !seedDisplay ||
    !overlaySeed ||
    !overlayCue ||
    !overlayNotes ||
    !trackMetric ||
    !noteMetric ||
    !tempoMetric ||
    !cueMetric ||
    !polyphonyMetric ||
    !energyMetric ||
    !pitchMetric ||
    !cueLabelMetric
  ) {
    throw new Error('App shell did not mount correctly.');
  }

  let loadedState: LoadedState | null = null;
  let unsubscribeTransport: (() => void) | null = null;

  const setError = (message: string | null): void => {
    errorCopy.hidden = message === null;
    errorCopy.textContent = message ?? '';
  };

  const destroyLoadedState = (): void => {
    unsubscribeTransport?.();
    unsubscribeTransport = null;
    loadedState?.transport.destroy();
    loadedState?.renderer.dispose();
    loadedState = null;
  };

  const renderFrame = (state: LoadedState, transportState: TransportState): void => {
    const playbackFrame = samplePlaybackFrame(state.analysis, transportState.currentTimeSeconds);
    const sceneFrame = sampleVisualScene(state.sceneProfile, playbackFrame);

    state.renderer.render(sceneFrame);
    timeReadout.textContent = `${formatSeconds(transportState.currentTimeSeconds)} / ${formatSeconds(transportState.durationSeconds)}`;
    progressReadout.textContent = `${Math.round(transportState.progress * 100)}%`;
    rateReadout.textContent = `${transportState.playbackRate.toFixed(2)}x`;
    seekInput.value = transportState.progress.toFixed(3);
    trackMetric.textContent = String(state.analysis.document.trackCount);
    noteMetric.textContent = state.analysis.document.notes.length.toLocaleString();
    tempoMetric.textContent = String(state.analysis.document.tempoEvents.length);
    cueMetric.textContent = String(state.analysis.sectionCues.length);
    polyphonyMetric.textContent = String(playbackFrame.polyphony);
    energyMetric.textContent = `${Math.round(playbackFrame.velocityEnergy * 100)}%`;
    pitchMetric.textContent = playbackFrame.dominantPitch === null ? '--' : String(playbackFrame.dominantPitch);
    cueLabelMetric.textContent = describeCue(playbackFrame);
    overlaySeed.textContent = `seed: ${state.sceneProfile.seed.displaySeed}`;
    overlayCue.textContent = `cue: ${describeCue(playbackFrame)}`;
    overlayNotes.textContent = `notes: ${playbackFrame.activeNotes.length} active / ${playbackFrame.recentOnsets.length} recent`;
    seedDisplay.textContent = state.sceneProfile.seed.displaySeed;
  };

  const loadMidiFile = async (file: File): Promise<void> => {
    destroyLoadedState();
    setError(null);
    helperCopy.textContent = 'Parsing MIDI and building the analysis snapshot.';

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const document = parseMidiFile(bytes);
      const analysis = createAnalysisSnapshot(document);
      const transport = createTransportController(document.durationSeconds);
      const renderer = new ParticleSceneRenderer(canvasHost);
      const seedOverride = seedInput.value;
      const sceneProfile = createVisualSceneProfile(analysis, createSeedConfig(document.sourceHash, seedOverride));
      const state: LoadedState = { analysis, transport, renderer, seedOverride, sceneProfile };

      unsubscribeTransport = transport.subscribe((transportState) => renderFrame(state, transportState));
      loadedState = state;
      fileName.textContent = file.name;
      helperCopy.textContent =
        'Analysis is precomputed once, then the transport samples pure playback frames that drive the visual mapping layer.';
      renderFrame(state, transport.getState());
    } catch (error) {
      destroyLoadedState();
      const message = error instanceof Error ? error.message : 'Unknown MIDI parsing error.';
      setError(message);
      helperCopy.textContent = 'The file could not be parsed. Try a different MIDI file.';
      fileName.textContent = file.name;
    }
  };

  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files ?? [];
    if (file) {
      await loadMidiFile(file);
    }
  });

  seedInput.addEventListener('input', () => {
    if (!loadedState) {
      seedDisplay.textContent = seedInput.value.trim() || 'auto';
      return;
    }

    loadedState.seedOverride = seedInput.value;
    loadedState.sceneProfile = createVisualSceneProfile(
      loadedState.analysis,
      createSeedConfig(loadedState.analysis.document.sourceHash, loadedState.seedOverride),
    );
    renderFrame(loadedState, loadedState.transport.getState());
  });

  playButton.addEventListener('click', () => {
    loadedState?.transport.play();
  });

  pauseButton.addEventListener('click', () => {
    loadedState?.transport.pause();
  });

  restartButton.addEventListener('click', () => {
    if (!loadedState) {
      return;
    }

    loadedState.transport.pause();
    loadedState.transport.seek(0);
  });

  seekInput.addEventListener('input', () => {
    if (!loadedState) {
      return;
    }

    loadedState.transport.seek(Number(seekInput.value) * loadedState.analysis.document.durationSeconds);
  });

  rateInput.addEventListener('input', () => {
    if (!loadedState) {
      rateReadout.textContent = `${Number(rateInput.value).toFixed(2)}x`;
      return;
    }

    loadedState.transport.setRate(Number(rateInput.value));
  });

  snapshotButton.addEventListener('click', () => {
    if (!loadedState) {
      return;
    }

    renderFrame(loadedState, loadedState.transport.getState());
  });
};
