import React from "react";
import { X, Trash2 } from "lucide-react";
import { RANKS_DESC, SUITS, SUIT_SYMBOLS } from "../poker/cards";

interface CardPickerPopoverProps {
  title: string;
  usedCards: Set<string>;
  currentCard?: string;
  onSelect: (card: string) => void;
  onClear?: () => void;
  onClose: () => void;
}

export const CardPickerPopover: React.FC<CardPickerPopoverProps> = ({
  title,
  usedCards,
  currentCard,
  onSelect,
  onClear,
  onClose,
}) => {
  return (
    <div className="mt-3 rounded-lg border border-[#243044] bg-[#121824] p-3.5 shadow-xl">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-200">{title}</span>
        <div className="flex items-center gap-2">
          {onClear && currentCard && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded border border-[#243044] bg-[#1A2232] px-2 py-1 text-xs font-medium text-slate-300 hover:border-red-500/60 hover:text-red-300 cursor-pointer"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              <span>Clear</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close card picker"
            className="rounded p-1 text-slate-400 hover:bg-[#1A2232] hover:text-slate-200 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {SUITS.map((suit) => {
          const isRed = suit === "h" || suit === "d";
          const sym = SUIT_SYMBOLS[suit];
          return (
            <div key={suit} className="grid grid-cols-13 gap-1">
              {RANKS_DESC.map((rank) => {
                const code = `${rank}${suit}`;
                const isCurrent = currentCard === code;
                const isUsedElsewhere = usedCards.has(code) && !isCurrent;
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={isUsedElsewhere}
                    onClick={() => onSelect(code)}
                    className={`font-mono-tabular flex h-8 items-center justify-center rounded text-xs font-semibold transition-colors duration-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      isCurrent
                        ? "bg-amber-500 text-slate-950"
                        : isUsedElsewhere
                        ? "bg-[#0B0F17] text-slate-700 cursor-not-allowed"
                        : isRed
                        ? "border border-[#243044] bg-[#1A2232] text-red-400 hover:border-red-400/60 hover:bg-red-950/40"
                        : "border border-[#243044] bg-[#1A2232] text-slate-200 hover:border-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {rank === "T" ? "T" : rank}
                    <span className="ml-0.5 text-[10px]">{sym}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
