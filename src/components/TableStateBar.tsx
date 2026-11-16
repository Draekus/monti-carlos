import React, { useState } from "react";
import { Shuffle, RotateCcw } from "lucide-react";
import type { Position, Street, TableState } from "../poker/types";
import { PlayingCard } from "./PlayingCard";
import { CardPickerPopover } from "./CardPickerPopover";

interface TableStateBarProps {
  state: TableState;
  onChangeState: (patch: Partial<TableState>) => void;
  onDealRandomFlop: () => void;
  onResetHand: () => void;
}

type SlotTarget =
  | { kind: "hero"; index: 0 | 1 }
  | { kind: "board"; index: 0 | 1 | 2 | 3 | 4 }
  | null;

export const TableStateBar: React.FC<TableStateBarProps> = ({
  state,
  onChangeState,
  onDealRandomFlop,
  onResetHand,
}) => {
  const [activeSlot, setActiveSlot] = useState<SlotTarget>(null);

  const usedCards = new Set<string>([...state.heroCards, ...state.boardCards]);

  const handleSelectCard = (card: string) => {
    if (!activeSlot) return;
    if (activeSlot.kind === "hero") {
      const next = [...state.heroCards];
      next[activeSlot.index] = card;
      const compacted = next.filter(Boolean).slice(0, 2);
      onChangeState({ heroCards: compacted, source: "manual" });
      if (activeSlot.index === 0 && compacted.length < 2) {
        setActiveSlot({ kind: "hero", index: 1 });
      } else {
        setActiveSlot(null);
      }
    } else {
      const next = [...state.boardCards];
      next[activeSlot.index] = card;
      const compacted = next.filter(Boolean).slice(0, 5);
      const inferredStreet: Street =
        compacted.length >= 5
          ? "river"
          : compacted.length === 4
          ? "turn"
          : compacted.length >= 3
          ? "flop"
          : "preflop";
      onChangeState({
        boardCards: compacted,
        street: inferredStreet,
        source: "manual",
      });
      if (activeSlot.index < 2) {
        setActiveSlot({ kind: "board", index: (activeSlot.index + 1) as 1 | 2 });
      } else {
        setActiveSlot(null);
      }
    }
  };

  const handleClearSlot = () => {
    if (!activeSlot) return;
    if (activeSlot.kind === "hero") {
      const next = state.heroCards.filter((_, i) => i !== activeSlot.index);
      onChangeState({ heroCards: next, source: "manual" });
    } else {
      const next = state.boardCards.filter((_, i) => i !== activeSlot.index);
      const inferredStreet: Street =
        next.length >= 5
          ? "river"
          : next.length === 4
          ? "turn"
          : next.length >= 3
          ? "flop"
          : "preflop";
      onChangeState({
        boardCards: next,
        street: inferredStreet,
        source: "manual",
      });
    }
    setActiveSlot(null);
  };

  const currentSlotCard =
    activeSlot?.kind === "hero"
      ? state.heroCards[activeSlot.index]
      : activeSlot?.kind === "board"
      ? state.boardCards[activeSlot.index]
      : undefined;

  const spr =
    state.potSize > 0 ? (state.effectiveStack / state.potSize).toFixed(1) : "--";

  const applyQuickBet = (pctOfPot: number) => {
    const basePot =
      state.toCall > 0 && state.potSize > state.toCall
        ? state.potSize - state.toCall
        : state.potSize;
    const bet = Math.min(
      state.effectiveStack,
      Number(((Math.max(1, basePot) * pctOfPot) / 100).toFixed(2))
    );
    onChangeState({
      potSize: Number((basePot + bet).toFixed(2)),
      toCall: bet,
      source: "manual",
    });
  };

  const applyVillainCheck = () => {
    const basePot =
      state.toCall > 0 && state.potSize > state.toCall
        ? state.potSize - state.toCall
        : state.potSize;
    onChangeState({
      potSize: Number(basePot.toFixed(2)),
      toCall: 0,
      source: "manual",
    });
  };

  return (
    <section className="rounded-lg border border-[#243044] bg-[#121824] p-4">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#243044]">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="font-display text-sm font-semibold text-slate-100">
            Table State
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular uppercase text-emerald-400 font-semibold">
            {state.street}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">SPR {spr}</span>
          <span aria-hidden="true">·</span>
          <span>
            Input:{" "}
            <strong className="font-medium text-slate-200">
              {state.source === "vision"
                ? "Screen Vision"
                : state.source === "manual"
                ? "Manual Override"
                : "Preset Spot"}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDealRandomFlop}
            className="inline-flex items-center gap-1.5 rounded border border-[#243044] bg-[#1A2232] px-2.5 py-1.5 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer hover:border-slate-500 transition-colors"
          >
            <Shuffle className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>Random Spot</span>
          </button>
          <button
            type="button"
            onClick={onResetHand}
            className="inline-flex items-center gap-1.5 rounded border border-[#243044] bg-[#1A2232] px-2.5 py-1.5 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer hover:border-slate-500 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>Clear Board</span>
          </button>
        </div>
      </div>

      {/* Felt Cards + Numeric State Controls */}
      <div className="mt-3.5 flex flex-col gap-3">
        {/* Card Felt Strip */}
        <div className="space-y-3 rounded-md border border-[#1E4B39] bg-[#0D271D] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-emerald-300/90">
                Hero Hand
              </div>
              <div className="flex items-center gap-1.5">
                {[0, 1].map((idx) => (
                  <PlayingCard
                    key={`hero-${idx}`}
                    size="sm"
                    card={state.heroCards[idx]}
                    label={`H${idx + 1}`}
                    highlight={Boolean(state.heroCards[idx])}
                    isSelected={
                      activeSlot?.kind === "hero" && activeSlot.index === idx
                    }
                    onClick={() =>
                      setActiveSlot(
                        activeSlot?.kind === "hero" && activeSlot.index === idx
                          ? null
                          : { kind: "hero", index: idx as 0 | 1 }
                      )
                    }
                  />
                ))}
              </div>
            </div>

            <div className="text-right">
              <div className="mb-1 text-[11px] font-medium text-emerald-300/80">
                Hero Role
              </div>
              <div className="inline-flex rounded border border-emerald-700/60 bg-[#081A13] p-0.5">
                {(["IP", "OOP"] as Position[]).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() =>
                      onChangeState({ heroPosition: pos, source: "manual" })
                    }
                    className={`rounded px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                      state.heroPosition === pos
                        ? "bg-emerald-600 text-white"
                        : "text-emerald-300/70 hover:text-emerald-100"
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-emerald-800/50 pt-2.5">
            <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-emerald-300/90">
              Community Board
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((idx) => {
                const slotLabel =
                  idx < 3 ? "Flop" : idx === 3 ? "Turn" : "River";
                return (
                  <PlayingCard
                    key={`board-${idx}`}
                    size="sm"
                    card={state.boardCards[idx]}
                    label={slotLabel}
                    isSelected={
                      activeSlot?.kind === "board" && activeSlot.index === idx
                    }
                    onClick={() =>
                      setActiveSlot(
                        activeSlot?.kind === "board" && activeSlot.index === idx
                          ? null
                          : { kind: "board", index: idx as 0 | 1 | 2 | 3 | 4 }
                      )
                    }
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Fast Tactical Parameter Controls */}
        <div className="grid grid-cols-3 gap-2">
          <label className="block rounded-md border border-[#243044] bg-[#1A2232] px-2.5 py-1.5">
            <span className="block text-[11px] font-medium text-slate-400">
              Pot Size
            </span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={state.potSize}
              onChange={(e) =>
                onChangeState({
                  potSize: Math.max(0, parseFloat(e.target.value) || 0),
                  source: "manual",
                })
              }
              className="font-mono-tabular mt-0.5 w-full bg-transparent text-sm font-semibold text-slate-100 focus:outline-none"
            />
          </label>

          <label className="block rounded-md border border-[#243044] bg-[#1A2232] px-2.5 py-1.5">
            <span className="block text-[11px] font-medium text-slate-400">
              To Call
            </span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={state.toCall}
              onChange={(e) =>
                onChangeState({
                  toCall: Math.max(0, parseFloat(e.target.value) || 0),
                  source: "manual",
                })
              }
              className="font-mono-tabular mt-0.5 w-full bg-transparent text-sm font-semibold text-amber-300 focus:outline-none"
            />
          </label>

          <label className="block rounded-md border border-[#243044] bg-[#1A2232] px-2.5 py-1.5">
            <span className="block text-[11px] font-medium text-slate-400">
              Eff. Stack
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={state.effectiveStack}
              onChange={(e) =>
                onChangeState({
                  effectiveStack: Math.max(1, parseFloat(e.target.value) || 1),
                  source: "manual",
                })
              }
              className="font-mono-tabular mt-0.5 w-full bg-transparent text-sm font-semibold text-slate-100 focus:outline-none"
            />
          </label>

          {/* Active Opponents Stepper */}
          <div className="col-span-3 rounded-md border border-[#243044] bg-[#1A2232] px-2.5 py-1.5 flex items-center justify-between">
            <div>
              <span className="block text-[10px] font-medium text-slate-400">
                Opponents
              </span>
              <span className="font-mono-tabular text-xs font-semibold text-slate-100">
                {state.activeOpponents === 1
                  ? "1 (Heads-Up GTO)"
                  : `${state.activeOpponents} (Multiway)`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onChangeState({
                    activeOpponents: Math.max(1, state.activeOpponents - 1),
                    source: "manual",
                  })
                }
                aria-label="Decrease opponents"
                className="h-7 w-7 rounded border border-[#243044] bg-[#121824] font-mono-tabular text-sm font-bold text-slate-200 hover:border-slate-500 cursor-pointer"
              >
                -
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeState({
                    activeOpponents: Math.min(8, state.activeOpponents + 1),
                    source: "manual",
                  })
                }
                aria-label="Increase opponents"
                className="h-7 w-7 rounded border border-[#243044] bg-[#121824] font-mono-tabular text-sm font-bold text-slate-200 hover:border-slate-500 cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Instant Facing-Bet Quick Simulator Strip */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-3 border-t border-[#243044]">
        <span className="mr-2 text-xs font-medium text-slate-400">
          Facing Action:
        </span>
        <button
          type="button"
          onClick={applyVillainCheck}
          className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
            state.toCall === 0
              ? "bg-sky-600/25 text-sky-300 border border-sky-500/50"
              : "bg-[#1A2232] text-slate-300 border border-[#243044] hover:border-slate-500"
          }`}
        >
          Checked to Hero
        </button>
        {[
          { label: "Bet 33%", pct: 33 },
          { label: "Bet 50%", pct: 50 },
          { label: "Bet 75%", pct: 75 },
          { label: "Bet 100%", pct: 100 },
        ].map((preset) => (
          <button
            key={preset.pct}
            type="button"
            onClick={() => applyQuickBet(preset.pct)}
            className="rounded border border-[#243044] bg-[#1A2232] px-2.5 py-1 font-mono-tabular text-xs font-medium text-slate-300 cursor-pointer hover:border-amber-500/60 hover:text-amber-200 transition-colors whitespace-nowrap"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {activeSlot && (
        <CardPickerPopover
          title={
            activeSlot.kind === "hero"
              ? `Select Hero Card ${activeSlot.index + 1}`
              : `Select Board Card ${activeSlot.index + 1}`
          }
          usedCards={usedCards}
          currentCard={currentSlotCard}
          onSelect={handleSelectCard}
          onClear={handleClearSlot}
          onClose={() => setActiveSlot(null)}
        />
      )}
    </section>
  );
};
