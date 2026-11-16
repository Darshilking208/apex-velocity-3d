import { useCallback, useEffect, useRef, useState } from 'react';
import { HudOverlay } from './components/HudOverlay';
import { OutcomeModal } from './components/OutcomeModal';
import { TitleOverlay } from './components/TitleOverlay';
import { ApexRaceEngine } from './game/engine';
import {
  INITIAL_CHECKPOINT_TIME_SEC,
  MAX_SHIELD,
  TOTAL_CIRCUIT_LAPS,
  loadSavedBestLap,
  loadSavedMuted,
  saveMuted,
} from './game/rules';
import { sharedTrack } from './game/track';
import type { GameMode, GameState, HudSnapshot, LiveryId, RaceOutcome } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  speedKmh: 0,
  gear: 1,
  rpmRatio: 0.25,
  nitro: 100,
  nitroOverheated: false,
  isBoosting: false,
  isDrifting: false,
  activeDriftScore: 0,
  totalScore: 0,
  lap: 1,
  totalLaps: TOTAL_CIRCUIT_LAPS,
  position: 4,
  totalCars: 4,
  lapTimeMs: 0,
  totalTimeMs: 0,
  bestLapMs: loadSavedBestLap(),
  checkpointTimerSec: INITIAL_CHECKPOINT_TIME_SEC,
  shield: MAX_SHIELD,
  maxShield: MAX_SHIELD,
  bannerText: null,
  bannerTone: 'cyan',
  minimapDots: [
    { ...sharedTrack.worldToMinimap(0, 100), isPlayer: true, color: '#22d3ee' },
  ],
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ApexRaceEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' ? 'playing' : 'title';
  });
  const [mode, setMode] = useState<GameMode>('circuit');
  const [liveryId, setLiveryId] = useState<LiveryId>('crimson');
  const [muted, setMuted] = useState<boolean>(() => loadSavedMuted());
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [outcome, setOutcome] = useState<RaceOutcome | null>(null);

  const gameStateRef = useRef<GameState>(gameState);
  const modeRef = useRef<GameMode>(mode);
  const mutedRef = useRef<boolean>(muted);

  useEffect(() => {
    gameStateRef.current = gameState;
    document.body.dataset.state = gameState;
  }, [gameState]);

  useEffect(() => {
    modeRef.current = mode;
    engineRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    mutedRef.current = muted;
    saveMuted(muted);
    engineRef.current?.setMuted(muted);
  }, [muted]);

  const handleStart = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setOutcome(null);
    document.body.dataset.state = 'playing';
    setGameState('playing');
    engineRef.current?.startNewRun(modeRef.current);
  }, []);

  const handlePauseToggle = useCallback(() => {
    const current = gameStateRef.current;
    if (current === 'playing') {
      document.body.dataset.state = 'paused';
      setGameState('paused');
      engineRef.current?.setGameState('paused');
    } else if (current === 'paused') {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      document.body.dataset.state = 'playing';
      setGameState('playing');
      engineRef.current?.setGameState('playing');
    }
  }, []);

  const handleReturnTitle = useCallback(() => {
    setOutcome(null);
    document.body.dataset.state = 'title';
    setGameState('title');
    engineRef.current?.setGameState('title');
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  // Mount Three.js WebGL engine once and keep isolated from HUD re-renders
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new ApexRaceEngine(mount, mutedRef.current, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onOutcome: (raceOutcome) => {
        setOutcome(raceOutcome);
        document.body.dataset.state = 'gameover';
        setGameState('gameover');
      },
      onPauseToggle: () => handlePauseToggle(),
      onRestartShortcut: () => handleStart(),
      onMuteShortcut: () => handleToggleMute(),
    });
    engineRef.current = engine;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.startNewRun(modeRef.current);
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [handlePauseToggle, handleStart, handleToggleMute]);

  // Title Screen Enter/Space keyboard start handshake
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleStart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStart]);

  const handleSelectLivery = useCallback((id: LiveryId) => {
    setLiveryId(id);
    engineRef.current?.setLivery(id);
  }, []);

  const handleTouchControl = useCallback(
    (partial: {
      forward?: boolean;
      backward?: boolean;
      drift?: boolean;
      nitro?: boolean;
      touchSteer?: number;
    }) => {
      engineRef.current?.setTouchInput(partial);
    },
    [],
  );

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#090d16]">
      {/* Isolated WebGL mount container */}
      <div
        ref={canvasMountRef}
        data-testid="game-canvas-container"
        className="absolute inset-0 w-full h-full"
      />

      {gameState === 'title' && (
        <TitleOverlay
          mode={mode}
          liveryId={liveryId}
          bestLapMs={hud.bestLapMs}
          muted={muted}
          onSelectMode={setMode}
          onSelectLivery={handleSelectLivery}
          onToggleMute={handleToggleMute}
          onStart={handleStart}
        />
      )}

      {(gameState === 'playing' || gameState === 'paused') && (
        <HudOverlay
          hud={hud}
          mode={mode}
          muted={muted}
          onToggleMute={handleToggleMute}
          onPause={handlePauseToggle}
          onRestart={handleStart}
          onTouchControl={handleTouchControl}
        />
      )}

      <OutcomeModal
        gameState={gameState}
        outcome={outcome}
        onResume={handlePauseToggle}
        onRestart={handleStart}
        onReturnTitle={handleReturnTitle}
      />
    </main>
  );
}
