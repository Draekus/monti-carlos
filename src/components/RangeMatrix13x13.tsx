import React, { useMemo, useState } from "react";
import { getActionColor } from "../poker/actionColors";
import { SUIT_SYMBOLS } from "../poker/cards";
import type { MatrixCell, TreeNodeView } from "../poker/types";

interface RangeMatrix13x13Props {
  activeNode: TreeNodeView | null;
  heroHandClass: string;
}

export const RangeMatrix13x13: React.FC<RangeMatrix13x13Props> = ({
  activeNode,
  heroHandClass,
}) => {
  const [pinnedLabel, setPinnedLabel] = useState<string | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  const cells = activeNode?.matrix ?? [];
  const actions = activeNode?.actions ?? [];

  const inspectedLabel = hoveredLabel ?? pinnedLabel ?? heroHandClass;
  const inspectedCell: MatrixCell | undefined = useMemo(
    () => cells.find((c) => c.label === inspectedLabel) ?? cells.find((c) => c.isHeroCell),
    [cells, inspectedLabel]
  );

  if (!activeNode || cells.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-[#243044] bg-[#121824] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#243044]">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-100">
            13×13 GTO Strategy Matrix ({activeNode.player})
          </h2>
          <p className="text-xs text-slate-400">
            Click or hover any hand class to inspect suit combinations and EV split.
          </p>
        </div>

        {/* Action Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          {actions.map((act) => (
            <span key={act.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: getActionColor(act.semantic) }}
              />
              <span>{act.label}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* 13x13 Canonical Grid */}
        <div className="xl:col-span-8">
          <div className="grid grid-cols-13 gap-[2px] rounded-md border border-[#243044] bg-[#0B0F17] p-1">
            {cells.map((cell) => {
              const inRange = cell.inRangeWeight > 0.001;
              const isSelected = inspectedCell?.label === cell.label;
              return (
                <button
                  key={cell.label}
                  type="button"
                  onMouseEnter={() => setHoveredLabel(cell.label)}
                  onMouseLeave={() => setHoveredLabel(null)}
                  onClick={() =>
                    setPinnedLabel(pinnedLabel === cell.label ? null : cell.label)
                  }
                  className={`relative aspect-square overflow-hidden rounded-[3px] flex items-center justify-center cursor-pointer transition-transform duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                    cell.isHeroCell
                      ? "ring-2 ring-amber-400 z-10"
                      : isSelected
                      ? "ring-1 ring-slate-200 z-10"
                      : ""
                  }`}
                >
                  {/* Proportional Stacked Action Background */}
                  {inRange ? (
                    <div
                      className="absolute inset-0 flex"
                      style={{ opacity: Math.max(0.35, Math.min(1, cell.inRangeWeight)) }}
                    >
                      {actions.map((act) => {
                        const freq = cell.actionProbs[act.id] ?? 0;
                        if (freq <= 0.005) return null;
                        return (
                          <div
                            key={act.id}
                            style={{
                              width: `${freq * 100}%`,
                              backgroundColor: getActionColor(act.semantic),
                            }}
                            className="h-full"
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-[#141B29]" />
                  )}

                  {/* Label Overlay */}
                  <span
                    className={`relative z-10 font-mono-tabular text-[10px] sm:text-[11px] font-bold leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] ${
                      cell.isHeroCell
                        ? "text-amber-200"
                        : inRange
                        ? "text-white"
                        : "text-slate-600"
                    }`}
                  >
                    {cell.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Combo-Level Strategy Inspector */}
        <div className="xl:col-span-4 rounded-md border border-[#243044] bg-[#1A2232] p-3.5 flex flex-col">
          {inspectedCell ? (
            <>
              <div className="flex items-center justify-between pb-2.5 border-b border-[#243044]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-lg font-bold text-slate-100">
                      {inspectedCell.label}
                    </span>
                    {inspectedCell.isHeroCell && (
                      <span className="text-[11px] font-semibold text-amber-300">
                        Hero Hand
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-mono-tabular">
                    Weight {(inspectedCell.inRangeWeight * 100).toFixed(0)}% · Avg EV{" "}
                    {inspectedCell.avgEv >= 0 ? "+" : ""}
                    {inspectedCell.avgEv.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Class Action Breakdown */}
              <div className="mt-3 space-y-1.5">
                {actions.map((act) => {
                  const freq = (inspectedCell.actionProbs[act.id] ?? 0) * 100;
                  return (
                    <div key={act.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{act.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-sm bg-[#0B0F17]">
                          <div
                            className="h-full"
                            style={{
                              width: `${freq}%`,
                              backgroundColor: getActionColor(act.semantic),
                            }}
                          />
                        </div>
                        <span className="font-mono-tabular w-11 text-right font-semibold text-slate-100">
                          {freq.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Individual Unblocked Suit Combos */}
              <div className="mt-4 pt-3 border-t border-[#243044] flex-1 overflow-y-auto max-h-[220px]">
                <div className="mb-2 text-[11px] font-semibold text-slate-400">
                  Suit Combinations ({inspectedCell.combos.length})
                </div>
                {inspectedCell.combos.length === 0 ? (
                  <div className="text-xs text-slate-500">
                    Not in active postflop range or blocked by board.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {inspectedCell.combos.map((combo) => {
                      const renderCard = (code: string) => {
                        const r = code[0];
                        const s = code[1];
                        const sym = SUIT_SYMBOLS[s] ?? "";
                        const isRed = s === "h" || s === "d";
                        return (
                          <span className={isRed ? "text-red-400" : "text-slate-200"}>
                            {r}
                            {sym}
                          </span>
                        );
                      };

                      return (
                        <div
                          key={combo.combo}
                          className="rounded border border-[#243044] bg-[#121824] px-2.5 py-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between font-mono-tabular">
                            <span className="font-bold">
                              {renderCard(combo.c1)} {renderCard(combo.c2)}
                            </span>
                            <span className="text-slate-400">
                              Eq {(combo.equityVsVillain * 100).toFixed(0)}% · EV{" "}
                              <strong
                                className={
                                  combo.bestEv >= 0 ? "text-emerald-400" : "text-red-400"
                                }
                              >
                                {combo.bestEv >= 0 ? "+" : ""}
                                {combo.bestEv.toFixed(2)}
                              </strong>
                            </span>
                          </div>
                          <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-sm bg-[#0B0F17]">
                            {actions.map((act) => {
                              const f = (combo.probs[act.id] ?? 0) * 100;
                              if (f <= 0.5) return null;
                              return (
                                <div
                                  key={act.id}
                                  style={{
                                    width: `${f}%`,
                                    backgroundColor: getActionColor(act.semantic),
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-400">
              Hover or click any hand cell to inspect strategy details.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
