import React, { useMemo, useState } from "react";
import { RANGE_PRESETS } from "../poker/presets";
import {
  MATRIX_LABELS,
  parseRangeWeights,
  serializeRangeWeights,
} from "../poker/cards";
import type { SolverConfig, StreetBetConfig } from "../poker/types";

interface RangeAndTreeConfigProps {
  config: SolverConfig;
  onChangeConfig: (patch: Partial<SolverConfig>) => void;
  onApplyPreset: (presetId: string) => void;
}

const BET_SIZE_OPTIONS = [25, 33, 50, 66, 75, 100, 150];
const RAISE_SIZE_OPTIONS = [50, 75, 100];

export const RangeAndTreeConfig: React.FC<RangeAndTreeConfigProps> = ({
  config,
  onChangeConfig,
  onApplyPreset,
}) => {
  const [editingSide, setEditingSide] = useState<"ip" | "oop">("ip");

  const activeRangeStr = editingSide === "ip" ? config.ipRange : config.oopRange;
  const activeWeights = useMemo(
    () => parseRangeWeights(activeRangeStr),
    [activeRangeStr]
  );

  const toggleHandWeight = (label: string) => {
    const next = new Map(activeWeights);
    const current = next.get(label) ?? 0;
    const nextVal = current >= 0.99 ? 0.5 : current > 0 ? 0 : 1.0;
    if (nextVal === 0) next.delete(label);
    else next.set(label, nextVal);

    const serialized = serializeRangeWeights(next);
    if (editingSide === "ip") {
      onChangeConfig({ ipRange: serialized, presetId: "custom" });
    } else {
      onChangeConfig({ oopRange: serialized, presetId: "custom" });
    }
  };

  const toggleStreetBetSize = (
    street: "flop" | "turn" | "river",
    size: number
  ) => {
    const current = config[street];
    const exists = current.betSizes.includes(size);
    const nextSizes = exists
      ? current.betSizes.filter((s) => s !== size)
      : [...current.betSizes, size].sort((a, b) => a - b);
    if (nextSizes.length === 0) return;
    onChangeConfig({
      [street]: { ...current, betSizes: nextSizes },
    });
  };

  const toggleStreetRaiseSize = (
    street: "flop" | "turn" | "river",
    size: number
  ) => {
    const current = config[street];
    const exists = current.raiseSizes.includes(size);
    const nextSizes = exists
      ? current.raiseSizes.filter((s) => s !== size)
      : [...current.raiseSizes, size].sort((a, b) => a - b);
    onChangeConfig({
      [street]: { ...current, raiseSizes: nextSizes },
    });
  };

  const toggleStreetAllIn = (street: "flop" | "turn" | "river") => {
    const current: StreetBetConfig = config[street];
    onChangeConfig({
      [street]: { ...current, includeAllIn: !current.includeAllIn },
    });
  };

  return (
    <div className="space-y-5">
      {/* Preset Selector Bar */}
      <section className="rounded-lg border border-[#243044] bg-[#121824] p-4 sm:p-5">
        <div className="pb-3 border-b border-[#243044]">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Preflop Range Presets
          </h2>
          <p className="text-xs text-slate-400">
            Select a calibrated GTO matchup or paint custom IP/OOP hand weights below.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {RANGE_PRESETS.map((preset) => {
            const active = config.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyPreset(preset.id)}
                className={`rounded-md border p-3 text-left transition-colors cursor-pointer ${
                  active
                    ? "border-emerald-500 bg-emerald-950/25"
                    : "border-[#243044] bg-[#1A2232] hover:border-slate-500"
                }`}
              >
                <div className="text-sm font-semibold text-slate-100">
                  {preset.name}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">{preset.subtitle}</div>
                <div className="mt-2 font-mono-tabular text-[11px] text-emerald-400">
                  {preset.oopLabel} vs {preset.ipLabel}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Interactive Range Painter */}
        <section className="lg:col-span-7 rounded-lg border border-[#243044] bg-[#121824] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#243044]">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Range Matrix Editor
              </h2>
              <p className="text-xs text-slate-400">
                Click cells to cycle weight: 100% → 50% → 0%.
              </p>
            </div>

            <div className="flex items-center gap-1 rounded border border-[#243044] bg-[#0B0F17] p-1">
              {(["ip", "oop"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setEditingSide(side)}
                  className={`rounded px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                    editingSide === side
                      ? "bg-emerald-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {side.toUpperCase()} Range
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-13 gap-[2px] rounded-md border border-[#243044] bg-[#0B0F17] p-1">
            {MATRIX_LABELS.flat().map((label) => {
              const w = activeWeights.get(label) ?? 0;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleHandWeight(label)}
                  className="relative aspect-square overflow-hidden rounded-[3px] flex items-center justify-center bg-[#141B29] cursor-pointer hover:ring-1 hover:ring-slate-300"
                >
                  {w > 0 && (
                    <div
                      className="absolute inset-x-0 bottom-0 bg-emerald-600 transition-all duration-100"
                      style={{ height: `${w * 100}%`, opacity: 0.85 }}
                    />
                  )}
                  <span
                    className={`relative z-10 font-mono-tabular text-[10px] font-bold ${
                      w > 0 ? "text-white" : "text-slate-600"
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <label className="mt-3 block">
            <span className="text-xs font-medium text-slate-400">
              {editingSide.toUpperCase()} TexasSolver Range String
            </span>
            <textarea
              rows={3}
              value={activeRangeStr}
              onChange={(e) => {
                if (editingSide === "ip") {
                  onChangeConfig({ ipRange: e.target.value, presetId: "custom" });
                } else {
                  onChangeConfig({ oopRange: e.target.value, presetId: "custom" });
                }
              }}
              className="mt-1.5 w-full rounded-md border border-[#243044] bg-[#0B0F17] p-2.5 font-mono-tabular text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </label>
        </section>

        {/* Bet Sizing Tree & DCFR Settings */}
        <section className="lg:col-span-5 rounded-lg border border-[#243044] bg-[#121824] p-4 sm:p-5 space-y-5">
          <div className="pb-3 border-b border-[#243044]">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              TexasSolver Bet Sizing Tree
            </h2>
            <p className="text-xs text-slate-400">
              Configure available % pot bet and raise nodes per street.
            </p>
          </div>

          {(["flop", "turn", "river"] as const).map((street) => {
            const cfg = config[street];
            return (
              <div
                key={street}
                className="rounded-md border border-[#243044] bg-[#1A2232] p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs font-bold uppercase tracking-wide text-slate-200">
                    {street}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleStreetAllIn(street)}
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold cursor-pointer border ${
                      cfg.includeAllIn
                        ? "border-red-500/50 bg-red-950/40 text-red-300"
                        : "border-[#243044] bg-[#121824] text-slate-400"
                    }`}
                  >
                    All-In {cfg.includeAllIn ? "On" : "Off"}
                  </button>
                </div>

                <div>
                  <div className="mb-1 text-[11px] text-slate-400">Bet Sizes (% Pot)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {BET_SIZE_OPTIONS.map((sz) => {
                      const active = cfg.betSizes.includes(sz);
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => toggleStreetBetSize(street, sz)}
                          className={`font-mono-tabular rounded px-2.5 py-1 text-xs font-semibold cursor-pointer border transition-colors ${
                            active
                              ? "border-emerald-500/60 bg-emerald-600/25 text-emerald-300"
                              : "border-[#243044] bg-[#121824] text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {sz}%
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[11px] text-slate-400">Raise Sizes (% Pot)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {RAISE_SIZE_OPTIONS.map((sz) => {
                      const active = cfg.raiseSizes.includes(sz);
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => toggleStreetRaiseSize(street, sz)}
                          className={`font-mono-tabular rounded px-2.5 py-1 text-xs font-semibold cursor-pointer border transition-colors ${
                            active
                              ? "border-red-500/60 bg-red-600/25 text-red-300"
                              : "border-[#243044] bg-[#121824] text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {sz}%
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Solver Iteration Budget */}
          <div className="rounded-md border border-[#243044] bg-[#1A2232] p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-200">
                DCFR Convergence Budget
              </span>
              <span className="font-mono-tabular text-xs text-emerald-400">
                {config.targetIterations} iterations
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Fast (100)", val: 100 },
                { label: "Balanced (180)", val: 180 },
                { label: "Deep (320)", val: 320 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => onChangeConfig({ targetIterations: opt.val })}
                  className={`rounded py-1.5 text-xs font-semibold cursor-pointer border transition-colors ${
                    config.targetIterations === opt.val
                      ? "border-emerald-500 bg-emerald-600/25 text-emerald-300"
                      : "border-[#243044] bg-[#121824] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
