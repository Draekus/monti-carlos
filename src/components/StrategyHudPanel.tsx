import React from "react";
import { ChevronRight, ArrowUpRight, AlertTriangle } from "lucide-react";
import { getActionColor, getActionTextClass } from "../poker/actionColors";
import type { ActionMetric, SolverResult, TreeNodeView } from "../poker/types";

interface StrategyHudPanelProps {
  result: SolverResult | null;
  activeNode: TreeNodeView | null;
  onSelectNode: (nodeId: string) => void;
}

export const StrategyHudPanel: React.FC<StrategyHudPanelProps> = ({
  result,
  activeNode,
  onSelectNode,
}) => {
  if (!result || !activeNode) {
    return (
      <section className="rounded-lg border border-[#243044] bg-[#121824] p-6">
        <div className="text-sm font-medium text-slate-400">
          Select 2 Hero cards to compute real-time GTO bet sizing and EVs.
        </div>
      </section>
    );
  }

  const actions = activeNode.actions;
  const sortedHero = [...actions].sort((a, b) => b.heroFreq - a.heroFreq);
  const topAction: ActionMetric | undefined = sortedHero[0];
  const secondAction: ActionMetric | undefined = sortedHero[1];

  const isMixed =
    topAction && secondAction && topAction.heroFreq < 0.72 && secondAction.heroFreq >= 0.18;

  const headline = topAction
    ? isMixed
      ? `${topAction.label} ${(topAction.heroFreq * 100).toFixed(0)}% / ${secondAction.label} ${(secondAction.heroFreq * 100).toFixed(0)}%`
      : topAction.amount > 0
      ? `${topAction.label} (${topAction.amount.toFixed(2)})`
      : topAction.label
    : "Waiting";

  const modeLabel =
    result.mode === "gto_dcfr"
      ? "TexasSolver DCFR"
      : result.mode === "multiway_mc"
      ? "Multiway Monte Carlo"
      : "Preflop GTO Range";

  return (
    <section className="rounded-lg border border-[#243044] bg-[#121824] p-4 sm:p-5">
      {/* Header & Tree Breadcrumbs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#243044]">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => onSelectNode(result.rootNodeId)}
            className={`rounded px-2 py-1 font-medium cursor-pointer transition-colors ${
              activeNode.id === result.rootNodeId
                ? "bg-[#1A2232] text-slate-100 border border-[#334155]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Root ({result.nodes[result.rootNodeId]?.player ?? "OOP"})
          </button>
          {activeNode.historyLabels.map((step, i) => (
            <React.Fragment key={`${step.nodeId}-${i}`}>
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onSelectNode(step.nodeId)}
                className="rounded px-2 py-1 font-medium text-slate-300 hover:bg-[#1A2232] hover:text-white cursor-pointer transition-colors"
              >
                {step.player}: {step.label}
              </button>
            </React.Fragment>
          ))}
          {activeNode.id !== result.rootNodeId && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
              <span className="rounded border border-emerald-500/40 bg-emerald-950/30 px-2 py-1 font-semibold text-emerald-300">
                {activeNode.player} Decision
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-xs text-slate-400 font-mono-tabular">
          <span>{modeLabel}</span>
          <span aria-hidden="true">·</span>
          <span>
            {result.iterations}/{result.targetIterations} iter
          </span>
          <span aria-hidden="true">·</span>
          <span>{result.solveTimeMs}ms</span>
        </div>
      </div>

      {/* Multiway or Out-of-Range Advisory */}
      {result.mode === "multiway_mc" && (
        <div className="mt-3 flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>
            Multiway pot detected. TexasSolver models 2-player heads-up trees, so the assistant automatically switched to {result.equityStats.simulations.toLocaleString()}-hand Monte Carlo equity and pot-odds sizing.
          </span>
        </div>
      )}

      {result.mode === "gto_dcfr" && !result.heroInPresetRange && result.heroComboExact && (
        <div className="mt-3 flex items-start gap-2.5 rounded-md border border-sky-500/30 bg-sky-950/20 px-3 py-2 text-xs text-sky-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
          <span>
            Hero hand <strong className="font-mono-tabular">{result.heroHandClass}</strong> is outside the selected preflop preset range; it was injected at weight 1.0 to compute exact optimal sizing.
          </span>
        </div>
      )}

      {/* Dominant Decision Focal Anchor */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>
              Optimal Strategy for{" "}
              <strong className="font-mono-tabular text-amber-300">
                {result.heroComboExact ?? result.heroHandClass}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>{result.equityStats.madeHand}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              Node Pot {activeNode.pot.toFixed(2)}
            </span>
          </div>
          <h1
            className={`font-display mt-1 text-2xl sm:text-3xl font-bold tracking-tight ${
              topAction ? getActionTextClass(topAction.semantic) : "text-slate-100"
            }`}
          >
            {headline}
          </h1>
        </div>

        {topAction && (
          <div className="flex items-center gap-5 border-t border-[#243044] pt-2 sm:border-t-0 sm:pt-0">
            <div>
              <div className="text-[11px] font-medium text-slate-400">Best EV</div>
              <div
                className={`font-mono-tabular text-lg font-bold ${
                  topAction.heroEv >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {topAction.heroEv >= 0 ? "+" : ""}
                {topAction.heroEv.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400">Hero Freq</div>
              <div className="font-mono-tabular text-lg font-bold text-slate-100">
                {(topAction.heroFreq * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dual Proportional Stacked Sizing Bars (Hero vs Range) */}
      <div className="mt-5 space-y-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300">
              Hero Combo Mix ({result.heroHandClass})
            </span>
            <span className="font-mono-tabular text-slate-400">
              {actions
                .filter((a) => a.heroFreq >= 0.01)
                .map((a) => `${a.shortLabel} ${(a.heroFreq * 100).toFixed(0)}%`)
                .join(" · ")}
            </span>
          </div>
          <div className="flex h-7 w-full overflow-hidden rounded-md border border-[#243044] bg-[#0B0F17]">
            {actions.map((act) => {
              const pct = act.heroFreq * 100;
              if (pct < 0.5) return null;
              return (
                <div
                  key={`hero-bar-${act.id}`}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: getActionColor(act.semantic),
                  }}
                  title={`${act.label}: ${pct.toFixed(1)}% (EV ${act.heroEv.toFixed(2)})`}
                  className="flex items-center justify-center overflow-hidden px-1 text-[11px] font-semibold text-white transition-all duration-150 font-mono-tabular border-r border-black/25 last:border-r-0"
                >
                  {pct >= 11 ? `${act.shortLabel} ${pct.toFixed(0)}%` : ""}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-400">
              Full {activeNode.player} Range Mix
            </span>
            <span className="font-mono-tabular text-slate-500">
              {result.rangeStats.oopCombos} OOP · {result.rangeStats.ipCombos} IP combos
            </span>
          </div>
          <div className="flex h-4 w-full overflow-hidden rounded border border-[#243044] bg-[#0B0F17]">
            {actions.map((act) => {
              const pct = act.rangeFreq * 100;
              if (pct < 0.5) return null;
              return (
                <div
                  key={`range-bar-${act.id}`}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: getActionColor(act.semantic),
                  }}
                  title={`Range ${act.label}: ${pct.toFixed(1)}%`}
                  className="h-full transition-all duration-150 border-r border-black/25 last:border-r-0 opacity-85"
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Sizing & EV Comparison Table */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#243044] text-[11px] font-semibold text-slate-400">
              <th className="py-2 pr-3">Action</th>
              <th className="py-2 px-3 text-right">Sizing</th>
              <th className="py-2 px-3 text-right">Hero %</th>
              <th className="py-2 px-3 text-right">Range %</th>
              <th className="py-2 px-3 text-right">Hero EV</th>
              <th className="py-2 px-3 text-right">EV Loss</th>
              <th className="py-2 pl-3 text-right">Tree</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] text-xs">
            {actions.map((act) => {
              const isPrimary = topAction?.id === act.id;
              return (
                <tr
                  key={act.id}
                  className={`transition-colors ${
                    isPrimary ? "bg-[#1A2232]/70" : "hover:bg-[#1A2232]/40"
                  }`}
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: getActionColor(act.semantic) }}
                      />
                      <span className="font-semibold text-slate-100 whitespace-nowrap">
                        {act.label}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-300">
                    {act.amount > 0 ? act.amount.toFixed(2) : "0.00"}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular font-semibold text-slate-100">
                    {(act.heroFreq * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-400">
                    {(act.rangeFreq * 100).toFixed(1)}%
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-mono-tabular font-semibold ${
                      act.heroEv > 0
                        ? "text-emerald-400"
                        : act.heroEv < 0
                        ? "text-red-400"
                        : "text-slate-300"
                    }`}
                  >
                    {act.heroEv > 0 ? "+" : ""}
                    {act.heroEv.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-400">
                    {act.evDiff === 0 ? "0.00" : act.evDiff.toFixed(2)}
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    {act.childNodeId ? (
                      <button
                        type="button"
                        onClick={() => onSelectNode(act.childNodeId!)}
                        className="inline-flex items-center gap-1 rounded border border-[#243044] bg-[#1A2232] px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-emerald-500/60 hover:text-emerald-300 cursor-pointer whitespace-nowrap"
                      >
                        <span>Explore</span>
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-600">Terminal</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
