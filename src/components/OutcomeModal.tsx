import React from 'react';
import { formatRaceTime } from '../game/rules';
import type { GameState, RaceOutcome } from '../game/types';

interface OutcomeModalProps {
  gameState: GameState;
  outcome: RaceOutcome | null;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const OutcomeModal: React.FC<OutcomeModalProps> = ({
  gameState,
  outcome,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  if (gameState !== 'paused' && gameState !== 'gameover') return null;

  if (gameState === 'paused') {
    return (
      <div
        className="fixed inset-0 z-30 bg-slate-950/75 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Race Paused"
      >
        <div className="telemetry-panel w-full max-w-sm p-6 rounded-sm space-y-5">
          <div className="border-b border-slate-800 pb-3">
            <div className="text-[11px] font-semibold tracking-[0.22em] text-cyan-400 uppercase">
              Telemetry Hold
            </div>
            <h2 className="text-3xl font-bold italic text-white uppercase tracking-wide mt-0.5">
              Race Paused
            </h2>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-sm uppercase tracking-[0.18em] rounded-sm transition-colors cursor-pointer"
            >
              Resume Race
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 font-bold text-xs uppercase tracking-[0.18em] rounded-sm transition-colors cursor-pointer"
            >
              Restart Grid
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="w-full py-2.5 bg-transparent hover:bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 font-bold text-xs uppercase tracking-[0.18em] rounded-sm transition-colors cursor-pointer"
            >
              Exit to Title
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!outcome) return null;

  return (
    <div
      className="fixed inset-0 z-30 bg-slate-950/78 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={outcome.victory ? 'Race Complete' : 'Race Over'}
    >
      <div className="telemetry-panel w-full max-w-md p-6 sm:p-7 rounded-sm space-y-5">
        <div className="border-b border-slate-800 pb-4">
          <div
            className={`text-[11px] font-bold tracking-[0.22em] uppercase ${
              outcome.victory ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {outcome.victory ? 'Checkered Flag' : 'Session Ended'}
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold italic text-white uppercase tracking-wide mt-0.5">
            {outcome.victory ? `Finished P${outcome.position}` : 'Run Terminated'}
          </h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">{outcome.reason}</p>
        </div>

        {/* 3 tabular-nums mastery/progress stat tiles */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-sm">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
              Total Time
            </div>
            <div className="font-telemetry text-base sm:text-lg font-bold text-white mt-1">
              {formatRaceTime(outcome.totalTimeMs)}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-sm">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
              Top Speed
            </div>
            <div className="font-telemetry text-base sm:text-lg font-bold text-cyan-300 mt-1">
              {outcome.topSpeedKmh} <span className="text-[10px] text-slate-400">KM/H</span>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-sm">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
              Score
            </div>
            <div className="font-telemetry text-base sm:text-lg font-bold text-amber-300 mt-1">
              {outcome.totalScore}
            </div>
          </div>
        </div>

        {outcome.bestLapMs !== null && (
          <div className="flex items-center justify-between bg-slate-900/70 border border-slate-800 px-3.5 py-2.5 rounded-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Best Lap
            </span>
            <div className="flex items-center gap-2">
              {outcome.isNewBestLap && (
                <span className="px-1.5 py-0.5 bg-amber-400 text-slate-950 text-[10px] font-bold uppercase tracking-wider rounded-xs">
                  New Record
                </span>
              )}
              <span className="font-telemetry text-sm font-bold text-white">
                {formatRaceTime(outcome.bestLapMs)}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={onRestart}
            className="w-full py-3.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-sm uppercase tracking-[0.18em] rounded-sm transition-colors cursor-pointer"
          >
            {outcome.victory ? 'Race Again' : 'Try Again'}
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-bold text-xs uppercase tracking-[0.18em] rounded-sm transition-colors cursor-pointer"
          >
            Return to Title
          </button>
        </div>
      </div>
    </div>
  );
};
