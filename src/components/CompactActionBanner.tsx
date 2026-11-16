import React from "react";
import { ArrowUpRight, AlertTriangle } from "lucide-react";
import { getActionColor, getActionTextClass } from "../poker/actionColors";
import type { ActionMetric, SolverResult, TreeNodeView } from "../poker/types";

interface CompactActionBannerProps {
  result: SolverResult | null;
  activeNode: TreeNodeView | null;
  onSelectNode: (nodeId: string) => void;
}

export const CompactActionBanner: React.FC<CompactActionBannerProps> = ({
  result,
  activeNode,
  onSelectNode,
}) => {
  if (!result || !activeNode) {
    return (
      <section className="rounded-lg border border-[#243044] bg-[#121824] p-5">
        <div className="text-sm font-medium text-slate-400">
          Select 2 Hero cards in Table State or capture a frame to see the optimal GTO action.
        </div>
      </section>
    );
  }

  const actions = activeNode.actions;
  const sorted = [...actions].sort((a, b) => b.heroFreq - a.heroFreq);
  const topAction: ActionMetric | undefined = sorted[0];
  const secondaryAction: ActionMetric | undefined =
    sorted[1] && sorted[1].heroFreq >= 0.12 ? sorted[1] : undefined;

  const modeLabel =
    result.mode === "gto_dcfr"
      ? "TexasSolver DCFR"
      : result.mode === "multiway_mc"
      ? "Multiway Monte Carlo"
      : "Preflop GTO";

  const headline = topAction
    ? topAction.amount > 0
      ? `${topAction.label} — ${topAction.amount.toFixed(2)}`
      : topAction.label
    : "Waiting";

  return (
    <section className="rounded-lg border border-[#243044] bg-[#121824] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#243044]">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="font-mono-tabular font-semibold text-amber-300">
            {result.heroComboExact ?? result.heroHandClass}
          </span>
          <span aria-hidden="true">·</span>
          <span>{result.equityStats.madeHand}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            Eq {(result.equityStats.equity * 100).toFixed(1)}%
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            {activeNode.player} Node (Pot {activeNode.pot.toFixed(2)})
          </span>
        </div>

        <div className="font-mono-tabular text-xs text-slate-400">
          {modeLabel} · {result.solveTimeMs}ms
        </div>
      </div>

      {result.mode === "multiway_mc" && (
        <div className="mt-3 flex items-center gap-2 rounded border border-amber-500/30 bg-amber-950/20 px-3 py-1.5 text-xs text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
          <span>Multiway spot: using Monte Carlo equity & pot-odds sizing.</span>
        </div>
      )}

      {/* Primary Recommendation & Sizing */}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Top Optimal Action & Sizing
          </div>
          <div className="mt-1 flex items-center gap-3">
            {topAction && (
              <span
                className="h-4 w-4 rounded-sm shrink-0"
                style={{ backgroundColor: getActionColor(topAction.semantic) }}
              />
            )}
            <h1
              className={`font-display text-3xl sm:text-4xl font-bold tracking-tight ${
                topAction ? getActionTextClass(topAction.semantic) : "text-slate-100"
              }`}
            >
              {headline}
            </h1>
          </div>

          {secondaryAction && (
            <p className="mt-1.5 text-xs text-slate-400 font-mono-tabular">
              Secondary mix: <strong className="text-slate-200">{secondaryAction.label}</strong>{" "}
              ({(secondaryAction.heroFreq * 100).toFixed(0)}%, EV{" "}
              {secondaryAction.heroEv >= 0 ? "+" : ""}
              {secondaryAction.heroEv.toFixed(2)})
            </p>
          )}
        </div>

        {topAction && (
          <div className="flex items-center gap-6 rounded-md border border-[#243044] bg-[#1A2232] px-4 py-3 shrink-0">
            <div>
              <div className="text-[11px] font-medium text-slate-400">Frequency</div>
              <div className="font-mono-tabular text-xl font-bold text-slate-100">
                {(topAction.heroFreq * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400">Sizing</div>
              <div className="font-mono-tabular text-xl font-bold text-slate-100">
                {topAction.pctPot !== null ? `${topAction.pctPot}%` : topAction.amount > 0 ? topAction.amount.toFixed(2) : "--"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400">Hero EV</div>
              <div
                className={`font-mono-tabular text-xl font-bold ${
                  topAction.heroEv >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {topAction.heroEv >= 0 ? "+" : ""}
                {topAction.heroEv.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Compact Frequency Strip */}
      <div className="mt-4 flex h-6 w-full overflow-hidden rounded-md border border-[#243044] bg-[#0B0F17]">
        {actions.map((act) => {
          const pct = act.heroFreq * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={act.id}
              style={{
                width: `${pct}%`,
                backgroundColor: getActionColor(act.semantic),
              }}
              title={`${act.label}: ${pct.toFixed(1)}%`}
              className="flex items-center justify-center overflow-hidden px-1 font-mono-tabular text-[11px] font-semibold text-white border-r border-black/25 last:border-r-0 transition-all duration-150"
            >
              {pct >= 12 ? `${act.shortLabel} ${pct.toFixed(0)}%` : ""}
            </div>
          );
        })}
      </div>

      {/* Quick Tree Step Buttons */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#243044]">
        <div className="flex flex-wrap items-center gap-1.5">
          {activeNode.id !== result.rootNodeId && (
            <button
              type="button"
              onClick={() => onSelectNode(result.rootNodeId)}
              className="rounded border border-[#243044] bg-[#1A2232] px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-500 cursor-pointer"
            >
              Back to Root
            </button>
          )}
          {actions
            .filter((a) => a.childNodeId)
            .map((act) => (
              <button
                key={act.id}
                type="button"
                onClick={() => onSelectNode(act.childNodeId!)}
                className="inline-flex items-center gap-1 rounded border border-[#243044] bg-[#1A2232] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300 cursor-pointer"
              >
                <span>After {act.label}</span>
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </button>
            ))}
        </div>
      </div>
    </section>
  );
};
