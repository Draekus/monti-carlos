import type { ActionSemantic } from "./types";

export function getActionColor(semantic: ActionSemantic): string {
  switch (semantic) {
    case "allin":
      return "#B91C1C";
    case "raise":
    case "bet_large":
      return "#DC2626";
    case "bet_medium":
    case "call":
      return "#16A34A";
    case "bet_small":
      return "#D97706";
    case "check":
      return "#0284C7";
    case "fold":
    default:
      return "#334155";
  }
}

export function getActionColorById(actionId: string): string {
  if (actionId === "allin") return "#B91C1C";
  if (actionId.startsWith("raise") || actionId === "raise_3b" || actionId === "raise_mw") return "#DC2626";
  if (actionId === "call") return "#16A34A";
  if (actionId === "check") return "#0284C7";
  if (actionId === "fold") return "#334155";
  if (actionId === "bet_open") return "#16A34A";
  const match = actionId.match(/(\d+)/);
  if (match) {
    const pct = parseInt(match[1], 10);
    if (pct >= 90) return "#DC2626";
    if (pct >= 55) return "#16A34A";
    return "#D97706";
  }
  return "#16A34A";
}

export function getActionTextClass(semantic: ActionSemantic): string {
  switch (semantic) {
    case "allin":
    case "raise":
    case "bet_large":
      return "text-red-400";
    case "bet_medium":
    case "call":
      return "text-emerald-400";
    case "bet_small":
      return "text-amber-400";
    case "check":
      return "text-sky-400";
    case "fold":
    default:
      return "text-slate-400";
  }
}
