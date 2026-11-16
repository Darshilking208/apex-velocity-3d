import React from 'react';
import { formatRaceTime } from '../game/rules';
import { GameMode, LIVERIES, LiveryId } from '../game/types';

interface TitleOverlayProps {
  mode: GameMode;
  liveryId: LiveryId;
  bestLapMs: number | null;
  muted: boolean;
  onSelectMode: (mode: GameMode) => void;
  onSelectLivery: (livery: LiveryId) => void;
  onToggleMute: () => void;
  onStart: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  mode,
  liveryId,
  bestLapMs,
  muted,
  onSelectMode,
  onSelectLivery,
  onToggleMute,
  onStart,
}) => {
  return (
    <div
      className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-5 sm:p-10"
      aria-label="Title Screen"
    >
      {/* Top row: minimal track badge + mute button */}
      <div className="flex items-start justify-between">
        <div className="telemetry-panel px-3.5 py-2 rounded-sm flex items-center gap-3">
          <span className="inline-block w-2 h-2 bg-cyan-400" aria-hidden="true" />
          <span className="text-xs font-semibold tracking-[0.22em] text-slate-300 uppercase">
            Solaris Grand Circuit
          </span>
          {bestLapMs !== null && (
            <span className="font-telemetry text-xs text-amber-400 pl-2 border-l border-slate-700">
              BEST {formatRaceTime(bestLapMs)}
            </span>
          )}
        </div>

        <button
          type="button"
          tabIndex={-1}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          className="pointer-events-auto telemetry-panel w-10 h-10 rounded-sm flex items-center justify-center text-slate-200 hover:border-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
        >
          {muted ? (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M23 9l-6 6M17 9l6 6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </button>
      </div>

      {/* Left-third negative-space lockup over open track/sky */}
      <div className="my-auto max-w-md pointer-events-auto">
        <div className="mb-6">
          <svg
            viewBox="0 0 420 118"
            className="w-full max-w-[390px] h-auto drop-shadow-[0_6px_18px_rgba(0,0,0,0.85)]"
            role="img"
            aria-label="APEX VELOCITY"
          >
            {/* Geometric motorsport crest chevrons */}
            <polygon points="8,18 46,18 32,46 0,46" fill="#22d3ee" />
            <polygon points="54,18 76,18 62,46 40,46" fill="#f97316" />
            <text
              x="88"
              y="44"
              fill="#f8fafc"
              fontFamily="'Chakra Petch', sans-serif"
              fontWeight="700"
              fontStyle="italic"
              fontSize="36"
              letterSpacing="4"
            >
              APEX
            </text>
            <text
              x="4"
              y="98"
              fill="#f8fafc"
              stroke="#090d16"
              strokeWidth="6"
              paintOrder="stroke fill"
              fontFamily="'Chakra Petch', sans-serif"
              fontWeight="700"
              fontStyle="italic"
              fontSize="56"
              letterSpacing="3"
            >
              VELOCITY
            </text>
            <rect x="6" y="108" width="210" height="4" fill="#22d3ee" />
            <rect x="222" y="108" width="64" height="4" fill="#f97316" />
          </svg>
        </div>

        {/* Mode & Livery selector compact strip */}
        <div className="telemetry-panel p-4 rounded-sm space-y-4 mb-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-2">
              Race Format
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSelectMode('circuit')}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm border transition-colors cursor-pointer ${
                  mode === 'circuit'
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                    : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                3-Lap Circuit
              </button>
              <button
                type="button"
                onClick={() => onSelectMode('sprint')}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm border transition-colors cursor-pointer ${
                  mode === 'sprint'
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                    : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                Endless Sprint
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Chassis Finish
            </span>
            <div className="flex items-center gap-2.5">
              {(Object.keys(LIVERIES) as LiveryId[]).map((id) => {
                const cfg = LIVERIES[id];
                const selected = liveryId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-label={`Select ${cfg.name} livery`}
                    aria-pressed={selected}
                    onClick={() => onSelectLivery(id)}
                    style={{ backgroundColor: cfg.cssColor }}
                    className={`w-6 h-6 rounded-sm transition-transform cursor-pointer ${
                      selected
                        ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0b101d] scale-110'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Primary Start CTA */}
        <button
          type="button"
          data-start="true"
          onClick={onStart}
          className="w-full py-3.5 px-6 bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 text-slate-950 font-bold text-lg uppercase tracking-[0.18em] rounded-sm shadow-[0_8px_24px_rgba(34,211,238,0.35)] transition-colors cursor-pointer flex items-center justify-center gap-3"
        >
          <span>Start Race</span>
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
            <polygon points="5,3 20,12 5,21" />
          </svg>
        </button>
      </div>

      {/* Single flat borderless control-hint line in bottom safe margin */}
      <div className="text-center sm:text-left">
        <p className="text-xs sm:text-sm font-medium tracking-[0.14em] text-slate-300 uppercase hud-stroke-text">
          WASD / Arrows Drive · Space Drift · Shift Nitro · Esc Pause
        </p>
      </div>
    </div>
  );
};
