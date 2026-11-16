import React from "react";
import { SUIT_SYMBOLS } from "../poker/cards";

interface PlayingCardProps {
  card?: string;
  label?: string;
  highlight?: boolean;
  isSelected?: boolean;
  size?: "md" | "sm";
  onClick?: () => void;
}

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  label,
  highlight = false,
  isSelected = false,
  size = "md",
  onClick,
}) => {
  const dims = size === "sm" ? "h-16 w-12" : "h-[78px] w-[56px]";

  if (!card) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label ? `Select ${label}` : "Select card"}
        className={`${dims} group relative flex flex-col items-center justify-center rounded-md border border-dashed transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          isSelected
            ? "border-amber-400 bg-[#1A2232] text-amber-300"
            : "border-[#334155] bg-[#0F172A]/70 text-slate-500 hover:border-slate-400 hover:text-slate-300"
        }`}
      >
        <span className="font-mono-tabular text-sm font-semibold">+</span>
        {label && (
          <span className="mt-0.5 text-[10px] font-medium text-slate-500 group-hover:text-slate-300">
            {label}
          </span>
        )}
      </button>
    );
  }

  const rankChar = card[0].toUpperCase();
  const suitChar = card[1].toLowerCase();
  const displayRank = rankChar === "T" ? "10" : rankChar;
  const suitSymbol = SUIT_SYMBOLS[suitChar] ?? "?";
  const isRed = suitChar === "h" || suitChar === "d";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Change card ${displayRank}${suitSymbol}`}
      className={`${dims} relative flex flex-col justify-between rounded-md bg-[#F8FAFC] p-1.5 text-left shadow-sm transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        isSelected
          ? "ring-2 ring-amber-400"
          : highlight
          ? "ring-2 ring-amber-500/80"
          : "ring-1 ring-slate-300"
      }`}
    >
      <div className={`leading-none ${isRed ? "text-[#DC2626]" : "text-[#0F172A]"}`}>
        <div className="font-mono-tabular text-sm font-bold tracking-tight">
          {displayRank}
        </div>
        <div className="text-xs leading-none">{suitSymbol}</div>
      </div>
      <div
        className={`self-end text-2xl leading-none ${
          isRed ? "text-[#DC2626]" : "text-[#0F172A]"
        }`}
      >
        {suitSymbol}
      </div>
    </button>
  );
};
