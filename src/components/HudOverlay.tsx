import React from 'react';
import { formatRaceTime } from '../game/rules';
import { sharedTrack } from '../game/track';
import type { GameMode, HudSnapshot } from '../game/types';

interface HudOverlayProps {
  hud: HudSnapshot;
  mode: GameMode;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onTouchControl: (partial: {
    forward?: boolean;
    backward?: boolean;
    drift?: boolean;
    nitro?: boolean;
    touchSteer?: number;
  }) => void;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  hud,
  mode,
  muted,
  onToggleMute,
  onPause,
  onRestart,
  onTouchControl,
}) => {
  const timerUrgent = mode === 'circuit' && hud.checkpointTimerSec <= 8;
  const nitroFillColor = hud.nitroOverheated
    ? 'bg-rose-500'
    : hud.isBoosting
      ? 'bg-amber-400'
      : 'bg-cyan-400';

  const bannerStyles: Record<HudSnapshot['bannerTone'], string> = {
    cyan: 'text-cyan-300 border-cyan-400/60',
    amber: 'text-amber-300 border-amber-400/60',
    crimson: 'text-rose-300 border-rose-400/60',
    emerald: 'text-emerald-300 border-emerald-400/60',
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-6">
      {/* Top Row: Race Status (Left) & Utility + Minimap (Right) */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Telemetry Cluster */}
        <div className="telemetry-panel px-4 py-2.5 rounded-sm flex items-center gap-4 sm:gap-6">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
              Pos
            </div>
            <div className="font-telemetry text-xl sm:text-2xl font-extrabold text-white leading-none">
              P{hud.position}
              <span className="text-xs text-slate-400 font-semibold">/{hud.totalCars}</span>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          {mode === 'circuit' ? (
            <>
              <div>
                <div className="text-[10px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
                  Lap
                </div>
                <div className="font-telemetry text-xl sm:text-2xl font-extrabold text-cyan-300 leading-none">
                  {hud.lap}
                  <span className="text-xs text-slate-400 font-semibold">/{hud.totalLaps}</span>
                </div>
              </div>

              <div className="h-8 w-px bg-slate-800" />

              <div>
                <div className="text-[10px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
                  Gate Timer
                </div>
                <div
                  className={`font-telemetry text-xl sm:text-2xl font-extrabold leading-none ${
                    timerUrgent ? 'text-rose-400' : 'text-amber-300'
                  }`}
                >
                  {hud.checkpointTimerSec}s
                </div>
              </div>
            </>
          ) : (
            <div>
              <div className="text-[10px] font-semibold tracking-[0.2em] text-slate-400 uppercase mb-1">
                Shield
              </div>
              <div className="flex items-center gap-1.5" aria-label={`Shield ${hud.shield} of ${hud.maxShield}`}>
                {Array.from({ length: hud.maxShield }).map((_, idx) => {
                  const full = idx < hud.shield;
                  return (
                    <svg key={idx} viewBox="0 0 24 24" className="w-5 h-5">
                      <polygon
                        points="12,2 21,6 21,13 12,22 3,13 3,6"
                        fill={full ? '#22d3ee' : 'rgba(15, 23, 42, 0.9)'}
                        stroke={full ? '#bae6fd' : '#475569'}
                        strokeWidth="2"
                      />
                    </svg>
                  );
                })}
              </div>
            </div>
          )}

          <div className="hidden sm:block h-8 w-px bg-slate-800" />

          <div className="hidden sm:block">
            <div className="text-[10px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
              Lap Time
            </div>
            <div className="font-telemetry text-lg font-bold text-slate-100 leading-none">
              {formatRaceTime(hud.lapTimeMs)}
            </div>
          </div>

          <div className="hidden md:block">
            <div className="text-[10px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
              Score
            </div>
            <div className="font-telemetry text-lg font-bold text-emerald-300 leading-none">
              {hud.totalScore}
            </div>
          </div>
        </div>

        {/* Top-Right: Utility Controls + Track Minimap */}
        <div className="flex flex-col items-end gap-2.5">
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
              title="Mute [M]"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="telemetry-panel w-9 h-9 rounded-sm flex items-center justify-center text-slate-200 hover:border-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              {muted ? (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M23 9l-6 6M17 9l6 6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Restart race (R)"
              title="Restart [R]"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="telemetry-panel w-9 h-9 rounded-sm flex items-center justify-center text-slate-200 hover:border-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause game (Esc)"
              title="Pause [Esc]"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="telemetry-panel w-9 h-9 rounded-sm flex items-center justify-center text-slate-200 hover:border-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </button>
          </div>

          {/* Minimap */}
          <div className="hidden sm:block telemetry-panel p-2 rounded-sm w-24 h-24">
            <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
              <path
                d={sharedTrack.minimapSvgPath}
                fill="none"
                stroke="#334155"
                strokeWidth="7"
                strokeLinejoin="round"
              />
              <path
                d={sharedTrack.minimapSvgPath}
                fill="none"
                stroke="#64748b"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {hud.minimapDots.map((dot, idx) => (
                <circle
                  key={idx}
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.isPlayer ? 4.8 : 3.2}
                  fill={dot.color}
                  stroke="#090d16"
                  strokeWidth="1.5"
                />
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* Transient upper-center event / drift banner (keeps center playfield 100% unobstructed) */}
      <div className="flex flex-col items-center justify-start gap-2 mt-1 mb-auto pointer-events-none">
        {hud.isDrifting && hud.activeDriftScore > 0 && (
          <div className="telemetry-panel px-4 py-1.5 rounded-sm border-emerald-400/60">
            <span className="text-xs font-bold tracking-[0.2em] text-emerald-300 uppercase mr-2">
              DRIFT
            </span>
            <span className="font-telemetry text-lg font-extrabold text-white">
              +{hud.activeDriftScore}
            </span>
          </div>
        )}
        {hud.bannerText && (
          <div
            className={`telemetry-panel px-5 py-1.5 rounded-sm text-sm font-bold tracking-[0.22em] uppercase ${bannerStyles[hud.bannerTone]}`}
          >
            {hud.bannerText}
          </div>
        )}
      </div>

      {/* Bottom Row: Touch Controls (mobile only) + Digital Speedometer & Nitro Cluster (Right) */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2.5">
        <div className="hidden md:block text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase hud-stroke-text">
          {hud.bestLapMs !== null ? `Track Record ${formatRaceTime(hud.bestLapMs)}` : 'WASD Drive · Space Drift · Shift Nitro'}
        </div>

        {/* Speedometer cluster */}
        <div className="self-end telemetry-panel px-3 py-2 sm:px-4 sm:py-3 rounded-sm min-w-[175px] sm:min-w-[235px]">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-1.5">
              <span
                data-testid="hud-speed"
                className="font-telemetry text-3xl sm:text-5xl font-extrabold italic text-white leading-none tracking-tight"
              >
                {hud.speedKmh}
              </span>
              <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.18em] text-slate-400 uppercase">
                KM/H
              </span>
            </div>

            <div className="px-2 py-0.5 bg-slate-800 border border-slate-600 rounded-sm font-telemetry text-xs sm:text-sm font-bold text-cyan-300">
              G{hud.gear}
            </div>
          </div>

          {/* RPM bar */}
          <div className="mt-1.5 sm:mt-2 h-1.5 w-full bg-slate-800 rounded-xs overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-[width] duration-75"
              style={{ width: `${Math.round(hud.rpmRatio * 100)}%` }}
            />
          </div>

          {/* Nitro Boost Gauge */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.18em] uppercase mb-1">
              <span className={hud.nitroOverheated ? 'text-rose-400' : 'text-cyan-300'}>
                {hud.nitroOverheated ? 'NITRO COOLING' : hud.isBoosting ? 'NITRO ACTIVE' : 'NITRO'}
              </span>
              <span className="font-telemetry text-slate-300">{hud.nitro}%</span>
            </div>
            <div className="h-2 w-full bg-slate-900 border border-slate-700 rounded-xs overflow-hidden">
              <div
                className={`h-full transition-[width] duration-75 ${nitroFillColor}`}
                style={{ width: `${hud.nitro}%` }}
              />
            </div>
          </div>
        </div>

        {/* Mobile Touch Controls Row (hidden on desktop md+) */}
        <div className="flex md:hidden items-center justify-between w-full gap-2 pointer-events-auto">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Steer left"
              onPointerDown={() => onTouchControl({ touchSteer: -1, forward: true })}
              onPointerUp={() => onTouchControl({ touchSteer: 0 })}
              onPointerLeave={() => onTouchControl({ touchSteer: 0 })}
              className="telemetry-panel w-12 h-12 rounded-sm text-slate-100 font-bold text-lg active:bg-cyan-500 active:text-slate-950"
            >
              ◀
            </button>
            <button
              type="button"
              aria-label="Steer right"
              onPointerDown={() => onTouchControl({ touchSteer: 1, forward: true })}
              onPointerUp={() => onTouchControl({ touchSteer: 0 })}
              onPointerLeave={() => onTouchControl({ touchSteer: 0 })}
              className="telemetry-panel w-12 h-12 rounded-sm text-slate-100 font-bold text-lg active:bg-cyan-500 active:text-slate-950"
            >
              ▶
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Drift"
              onPointerDown={() => onTouchControl({ drift: true })}
              onPointerUp={() => onTouchControl({ drift: false })}
              onPointerLeave={() => onTouchControl({ drift: false })}
              className="telemetry-panel px-3.5 h-12 rounded-sm text-xs font-bold uppercase tracking-wider text-amber-300"
            >
              Drift
            </button>
            <button
              type="button"
              aria-label="Nitro"
              onPointerDown={() => onTouchControl({ nitro: true, forward: true })}
              onPointerUp={() => onTouchControl({ nitro: false })}
              onPointerLeave={() => onTouchControl({ nitro: false })}
              className="telemetry-panel px-3.5 h-12 rounded-sm text-xs font-bold uppercase tracking-wider text-cyan-300"
            >
              Nitro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
