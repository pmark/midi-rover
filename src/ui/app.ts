import type {
  AnalysisSnapshot,
  AudioPlaybackState,
  PlaybackFrame,
  TransportController,
  TransportState,
} from '../core/types';
import { createTransportController } from '../core/transport';
import { createAnalysisSnapshot, createPlaceholderMidiDocument, samplePlaybackFrame } from '../analysis/playbackAnalysis';
import { parseMidiFile } from '../analysis/midiParser';
import { createAudioPlaybackController } from '../audio/webAudioPlayback';
import { ParticleSceneRenderer } from '../rendering/three/particleSceneRenderer';
import { persistLoadedMidiFile, restorePersistedMidiFile } from './filePersistence';
import { createSeedConfig } from '../visual/seed';
import { createVisualSceneProfile, sampleVisualScene } from '../visual/sceneProfile';
import type { VisualSceneProfile } from '../visual/types';

type LoadedState = {
  documentLabel: string;
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

const describeAudioStatus = (state: AudioPlaybackState): string => {
  if (state.status === 'loading') {
    return `loading ${state.loadedInstruments + state.loadingInstruments > 0 ? `${state.loadedInstruments}/${state.loadedInstruments + state.loadingInstruments}` : ''}`.trim();
  }

  if (state.status === 'blocked') {
    return 'gesture required';
  }

  return state.status;
};

export const mountMidiLab = (root: HTMLElement): void => {
  const audioController = createAudioPlaybackController();

  root.innerHTML = `
    <div class="app-shell">
      <div class="drop-overlay" data-drop-overlay aria-hidden="true">
        <div class="drop-overlay-card">
          <div class="eyebrow">Quick Load</div>
          <h2 class="drop-overlay-title">Drop MIDI file</h2>
          <p class="drop-overlay-copy">Release anywhere to parse the file, rebuild analysis, and refresh the particle scene.</p>
        </div>
      </div>
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
            <p class="data-flow"><strong>Data flow</strong><br />MIDI file -> normalized document -> analysis snapshot + journey cues -> playback frame -> visual mapping -> Three renderer</p>
          </section>

          <section class="stack">
            <h2 class="section-title">Transport</h2>
            <div class="transport-row">
              <button type="button" class="primary" data-play>Play</button>
              <button type="button" data-pause>Pause</button>
              <button type="button" data-restart>Restart</button>
            </div>
            <label class="field">
              <span class="field-label"><span>Master volume</span><span data-volume-readout>80%</span></span>
              <div class="range-line">
                <input data-volume type="range" min="0" max="1" value="0.8" step="0.01" />
              </div>
            </label>
            <label class="field">
              <span class="field-label"><span>Timeline</span><span data-time-readout>0:00 / 0:00</span></span>
              <div class="range-line">
                <input data-seek type="range" min="0" max="1" value="0" step="0.001" />
                <output data-progress-readout>0%</output>
              </div>
            </label>
            <label class="field">
              <span class="field-label"><span>Playback rate</span><span data-rate-readout>Locked</span></span>
              <div class="range-line">
                <input data-rate type="range" min="1" max="1" value="1" step="0.05" disabled />
              </div>
            </label>
            <p class="helper-copy">Rate control is locked for the synchronized audio pass.</p>
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
              <div class="metric-card"><dt>Journey</dt><dd data-journey-label>approach</dd></div>
              <div class="metric-card"><dt>Audio</dt><dd data-audio-status>idle</dd></div>
              <div class="metric-card"><dt>Instruments</dt><dd data-audio-instruments>0</dd></div>
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
              <div class="pill" data-overlay-journey>journey: approach</div>
              <div class="pill" data-overlay-notes>notes: 0</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  const fileInput = root.querySelector<HTMLInputElement>('[data-file-input]');
  const appShell = root.querySelector<HTMLElement>('.app-shell');
  const dropOverlay = root.querySelector<HTMLElement>('[data-drop-overlay]');
  const seedInput = root.querySelector<HTMLInputElement>('[data-seed-input]');
  const playButton = root.querySelector<HTMLButtonElement>('[data-play]');
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-pause]');
  const restartButton = root.querySelector<HTMLButtonElement>('[data-restart]');
  const volumeInput = root.querySelector<HTMLInputElement>('[data-volume]');
  const seekInput = root.querySelector<HTMLInputElement>('[data-seek]');
  const rateInput = root.querySelector<HTMLInputElement>('[data-rate]');
  const snapshotButton = root.querySelector<HTMLButtonElement>('[data-snapshot]');
  const canvasHost = root.querySelector<HTMLElement>('[data-canvas-host]');
  const helperCopy = root.querySelector<HTMLElement>('[data-helper]');
  const errorCopy = root.querySelector<HTMLElement>('[data-error]');
  const timeReadout = root.querySelector<HTMLElement>('[data-time-readout]');
  const progressReadout = root.querySelector<HTMLElement>('[data-progress-readout]');
  const rateReadout = root.querySelector<HTMLElement>('[data-rate-readout]');
  const volumeReadout = root.querySelector<HTMLElement>('[data-volume-readout]');
  const fileName = root.querySelector<HTMLElement>('[data-file-name]');
  const seedDisplay = root.querySelector<HTMLElement>('[data-seed-display]');
  const overlaySeed = root.querySelector<HTMLElement>('[data-overlay-seed]');
  const overlayCue = root.querySelector<HTMLElement>('[data-overlay-cue]');
  const overlayJourney = root.querySelector<HTMLElement>('[data-overlay-journey]');
  const overlayNotes = root.querySelector<HTMLElement>('[data-overlay-notes]');
  const trackMetric = root.querySelector<HTMLElement>('[data-tracks]');
  const noteMetric = root.querySelector<HTMLElement>('[data-notes]');
  const tempoMetric = root.querySelector<HTMLElement>('[data-tempos]');
  const cueMetric = root.querySelector<HTMLElement>('[data-cues]');
  const polyphonyMetric = root.querySelector<HTMLElement>('[data-polyphony]');
  const energyMetric = root.querySelector<HTMLElement>('[data-energy]');
  const pitchMetric = root.querySelector<HTMLElement>('[data-pitch]');
  const cueLabelMetric = root.querySelector<HTMLElement>('[data-cue-label]');
  const journeyLabelMetric = root.querySelector<HTMLElement>('[data-journey-label]');
  const audioStatusMetric = root.querySelector<HTMLElement>('[data-audio-status]');
  const audioInstrumentsMetric = root.querySelector<HTMLElement>('[data-audio-instruments]');

  if (
    !fileInput ||
    !appShell ||
    !dropOverlay ||
    !seedInput ||
    !playButton ||
    !pauseButton ||
    !restartButton ||
    !volumeInput ||
    !seekInput ||
    !rateInput ||
    !snapshotButton ||
    !canvasHost ||
    !helperCopy ||
    !errorCopy ||
    !timeReadout ||
    !progressReadout ||
    !rateReadout ||
    !volumeReadout ||
    !fileName ||
    !seedDisplay ||
    !overlaySeed ||
    !overlayCue ||
    !overlayJourney ||
    !overlayNotes ||
    !trackMetric ||
    !noteMetric ||
    !tempoMetric ||
    !cueMetric ||
    !polyphonyMetric ||
    !energyMetric ||
    !pitchMetric ||
    !cueLabelMetric ||
    !journeyLabelMetric ||
    !audioStatusMetric ||
    !audioInstrumentsMetric
  ) {
    throw new Error('App shell did not mount correctly.');
  }

  let loadedState: LoadedState | null = null;
  let unsubscribeTransport: (() => void) | null = null;
  let dragDepth = 0;

  volumeInput.value = audioController.getState().volume.toFixed(2);
  volumeReadout.textContent = `${Math.round(audioController.getState().volume * 100)}%`;

  const hasFiles = (dataTransfer: DataTransfer | null): boolean =>
    Array.from(dataTransfer?.types ?? []).includes('Files');

  const setDropOverlayVisible = (visible: boolean): void => {
    appShell.classList.toggle('drag-active', visible);
    dropOverlay.classList.toggle('visible', visible);
    dropOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
  };

  const extractMidiFile = (dataTransfer: DataTransfer | null): File | null => {
    const files = Array.from(dataTransfer?.files ?? []);
    return files.find((file) => /\.midi?$/i.test(file.name)) ?? files[0] ?? null;
  };

  const setError = (message: string | null): void => {
    errorCopy.hidden = message === null;
    errorCopy.textContent = message ?? '';
  };

  const renderAudioState = (audioState: AudioPlaybackState): void => {
    audioStatusMetric.textContent = describeAudioStatus(audioState);
    audioInstrumentsMetric.textContent = `${audioState.loadedInstruments}`;
    volumeInput.value = audioState.volume.toFixed(2);
    volumeReadout.textContent = `${Math.round(audioState.volume * 100)}%`;
    if (audioState.status === 'error' && audioState.message) {
      setError(audioState.message);
    }
  };

  audioController.subscribe(renderAudioState);

  const destroyLoadedState = (): void => {
    unsubscribeTransport?.();
    unsubscribeTransport = null;
    audioController.pause();
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
    journeyLabelMetric.textContent = sceneFrame.camera.segmentLabel;
    overlaySeed.textContent = `seed: ${state.sceneProfile.seed.displaySeed}`;
    overlayCue.textContent = `cue: ${describeCue(playbackFrame)}`;
    overlayJourney.textContent = `journey: ${sceneFrame.camera.segmentLabel}`;
    overlayNotes.textContent = `notes: ${playbackFrame.activeNotes.length} active / ${playbackFrame.recentOnsets.length} recent`;
    seedDisplay.textContent = state.sceneProfile.seed.displaySeed;
    fileName.textContent = state.documentLabel;
  };

  const loadScene = ({
    analysis,
    documentLabel,
    seedOverride = seedInput.value,
  }: {
    analysis: AnalysisSnapshot;
    documentLabel: string;
    seedOverride?: string;
  }): LoadedState => {
    destroyLoadedState();
    setError(null);

    const transport = createTransportController(analysis.document.durationSeconds);
    const renderer = new ParticleSceneRenderer(canvasHost);
    const sceneProfile = createVisualSceneProfile(analysis, createSeedConfig(analysis.document.sourceHash, seedOverride));
    const state: LoadedState = {
      documentLabel,
      analysis,
      transport,
      renderer,
      seedOverride,
      sceneProfile,
    };

    unsubscribeTransport = transport.subscribe((transportState) => renderFrame(state, transportState));
    loadedState = state;
    renderFrame(state, transport.getState());
    return state;
  };

  const loadDefaultScene = (): void => {
    loadScene({
      analysis: createAnalysisSnapshot(createPlaceholderMidiDocument()),
      documentLabel: 'Default scene',
    });
    helperCopy.textContent =
      'Default scene loaded. Load a MIDI file to replace it with analysis-driven motion; the same MIDI content and seed produce the same visual field.';
  };

  const loadMidiFile = async (file: File): Promise<void> => {
    destroyLoadedState();
    setError(null);
    helperCopy.textContent = 'Parsing MIDI and building the analysis snapshot.';

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const document = parseMidiFile(bytes);
      const analysis = createAnalysisSnapshot(document);
      loadScene({
        analysis,
        documentLabel: file.name,
      });
      helperCopy.textContent =
        'Analysis is precomputed once. Audio instruments prepare in parallel, then transport time drives particles, the camera journey, terrain, and audio together.';
      void audioController.prepare(document).catch((audioError: unknown) => {
        const message = audioError instanceof Error ? audioError.message : 'Audio preparation failed.';
        setError(message);
      });
      void persistLoadedMidiFile(file).catch((persistenceError: unknown) => {
        const message =
          persistenceError instanceof Error ? persistenceError.message : 'MIDI persistence failed.';
        helperCopy.textContent = `Loaded successfully, but auto-restore could not be saved: ${message}`;
      });
    } catch (error) {
      destroyLoadedState();
      const message = error instanceof Error ? error.message : 'Unknown MIDI parsing error.';
      setError(message);
      loadDefaultScene();
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

  const handleDragEnter = (event: DragEvent): void => {
    if (!hasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepth += 1;
    setDropOverlayVisible(true);
  };

  const handleDragOver = (event: DragEvent): void => {
    if (!hasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    setDropOverlayVisible(true);
  };

  const handleDragLeave = (event: DragEvent): void => {
    if (!hasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      setDropOverlayVisible(false);
    }
  };

  const handleDrop = async (event: DragEvent): Promise<void> => {
    if (!hasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepth = 0;
    setDropOverlayVisible(false);

    const file = extractMidiFile(event.dataTransfer);
    if (!file) {
      return;
    }

    await loadMidiFile(file);
  };

  window.addEventListener('dragenter', handleDragEnter);
  window.addEventListener('dragover', handleDragOver);
  window.addEventListener('dragleave', handleDragLeave);
  window.addEventListener('drop', handleDrop);

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
    if (!loadedState) {
      return;
    }

    void (async () => {
      const didStartAudio = await audioController.play(loadedState.transport.getState().currentTimeSeconds);
      if (didStartAudio) {
        loadedState.transport.play();
      }
    })();
  });

  pauseButton.addEventListener('click', () => {
    audioController.pause();
    loadedState?.transport.pause();
  });

  restartButton.addEventListener('click', () => {
    if (!loadedState) {
      return;
    }

    audioController.pause();
    loadedState.transport.pause();
    loadedState.transport.seek(0);
    void audioController.seek(0, false);
  });

  seekInput.addEventListener('input', () => {
    if (!loadedState) {
      return;
    }

    const currentState = loadedState;
    const nextTime = Number(seekInput.value) * currentState.analysis.document.durationSeconds;
    const wasPlaying = currentState.transport.getState().isPlaying;
    if (wasPlaying) {
      currentState.transport.pause();
    }
    currentState.transport.seek(nextTime);
    void audioController.seek(nextTime, false).then(() => {
      if (wasPlaying) {
        void (async () => {
          const didStartAudio = await audioController.play(nextTime);
          if (didStartAudio) {
            currentState.transport.play();
          }
        })();
      }
    });
  });

  rateInput.addEventListener('input', () => {
    rateReadout.textContent = 'Locked';
  });

  volumeInput.addEventListener('input', () => {
    audioController.setVolume(Number(volumeInput.value));
  });

  snapshotButton.addEventListener('click', () => {
    if (!loadedState) {
      return;
    }

    renderFrame(loadedState, loadedState.transport.getState());
  });

  loadDefaultScene();

  void (async () => {
    try {
      const persistedFile = await restorePersistedMidiFile();
      if (!persistedFile) {
        return;
      }

      helperCopy.textContent = 'Restoring the last loaded MIDI file from browser storage.';
      await loadMidiFile(persistedFile);
    } catch (restoreError) {
      const message =
        restoreError instanceof Error ? restoreError.message : 'Stored MIDI restore failed.';
      helperCopy.textContent = `Previous MIDI restore was skipped: ${message}`;
    }
  })();
};
