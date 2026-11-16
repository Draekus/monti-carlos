import React from "react";
import type { EquityStats } from "../poker/types";

interface EquityGaugeProps {
  stats: EquityStats | null;
  potSize: number;
  toCall: number;
}

export const EquityGauge: React.FC<EquityGaugeProps> = ({
  stats,
  potSize,
  toCall,
}) => {
  if (!stats || stats.simulations === 0) {
    return (
      <section className="rounded-lg border border-[#243044] bg-[#121824] p-4">
        <div className="text-xs font-semibold text-slate-300">
          Hand Equity vs. Pot Odds
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Select 2 Hero cards to calculate Monte Carlo equity and pot odds.
        </p>
      </section>
    );
  }

  const winPct = Math.min(100, Math.max(0, stats.winPct * 100));
  const tiePct = Math.min(100 - winPct, Math.max(0, stats.tiePct * 100));
  const equityPct = stats.equity * 100;
  const potOddsPct = stats.potOdds * 100;

  return (
    <section className="rounded-lg border border-[#243044] bg-[#121824] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold text-slate-100">
          Equity vs. Pot Odds
        </h2>
        <span className="font-mono-tabular text-xs font-semibold text-emerald-400">
          {stats.madeHand}
        </span>
      </div>

      <div className="mt-3 flex items-baseline justify-between text-xs">
        <span className="font-mono-tabular text-slate-200">
          Equity <strong>{equityPct.toFixed(1)}%</strong>{" "}
          <span className="text-slate-400">
            (Win {winPct.toFixed(1)}% · Tie {tiePct.toFixed(1)}%)
          </span>
        </span>
        {stats.potOdds > 0 ? (
          <span className="font-mono-tabular font-semibold text-sky-400">
            Need {potOddsPct.toFixed(1)}%
          </span>
        ) : (
          <span className="font-mono-tabular text-slate-400">Free Check</span>
        )}
      </div>

      {/* Stacked Win/Tie Bar + Pot Odds Break-even Marker */}
      <div className="relative mt-2 h-5 w-full rounded bg-[#1A2232] border border-[#243044]">
        <div className="flex h-full w-full overflow-hidden rounded">
          <div
            style={{ width: `${winPct}%` }}
            className="h-full bg-emerald-600 transition-all duration-150"
          />
          <div
            style={{ width: `${tiePct}%` }}
            className="h-full bg-amber-500 transition-all duration-150"
          />
        </div>
        {stats.potOdds > 0 && (
          <div
            style={{ left: `${Math.min(99, Math.max(1, potOddsPct))}%` }}
            className="absolute -top-1 -bottom-1 w-0.5 bg-sky-400"
            title={`Break-even pot odds: ${potOddsPct.toFixed(1)}%`}
          />
        )}
      </div>

      {/* Key Numeric Summary */}
      <div className="mt-3 grid grid-cols-3 gap-2 pt-3 border-t border-[#243044]">
        <div>
          <div className="text-[11px] text-slate-400">Pot / Call</div>
          <div className="font-mono-tabular text-xs font-semibold text-slate-100">
            {potSize.toFixed(1)} / {toCall.toFixed(1)}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Call EV</div>
          <div
            className={`font-mono-tabular text-xs font-semibold ${
              stats.callEv >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {stats.callEv >= 0 ? "+" : ""}
            {stats.callEv.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">MC Baseline</div>
          <div className="font-mono-tabular text-xs font-semibold text-slate-200 truncate">
            {stats.heuristicAction.split("—")[0].trim()}
          </div>
        </div>
      </div>

      <p className="mt-2.5 text-xs text-slate-400 leading-relaxed">
        {stats.heuristicDetail}
      </p>
    </section>
  );
};
