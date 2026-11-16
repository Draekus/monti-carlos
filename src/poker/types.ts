export type Street = "preflop" | "flop" | "turn" | "river";
export type Position = "IP" | "OOP";

export type ActionSemantic =
  | "allin"
  | "raise"
  | "bet_large"
  | "bet_medium"
  | "bet_small"
  | "call"
  | "check"
  | "fold";

export interface TableState {
  heroCards: string[];
  boardCards: string[];
  potSize: number;
  toCall: number;
  effectiveStack: number;
  activeOpponents: number;
  street: Street;
  heroPosition: Position;
  notes: string | null;
  source: "preset" | "manual" | "vision";
}

export interface StreetBetConfig {
  betSizes: number[]; // % of pot, e.g. [33, 66, 100]
  raiseSizes: number[]; // % of pot raise, e.g. [50]
  includeAllIn: boolean;
}

export interface SolverConfig {
  presetId: string;
  oopRange: string;
  ipRange: string;
  flop: StreetBetConfig;
  turn: StreetBetConfig;
  river: StreetBetConfig;
  targetIterations: number;
  accuracy: number;
}

export interface ActionMetric {
  id: string;
  label: string;
  shortLabel: string;
  semantic: ActionSemantic;
  pctPot: number | null;
  amount: number;
  heroFreq: number;
  rangeFreq: number;
  heroEv: number;
  evDiff: number;
  childNodeId: string | null;
}

export interface ComboStrategy {
  combo: string;
  c1: string;
  c2: string;
  weight: number;
  probs: Record<string, number>;
  evs: Record<string, number>;
  bestEv: number;
  equityVsVillain: number;
}

export interface MatrixCell {
  label: string; // e.g. "AKs"
  row: number;
  col: number;
  inRangeWeight: number;
  comboCount: number;
  isHeroCell: boolean;
  actionProbs: Record<string, number>; // actionId -> freq (0..1)
  avgEv: number;
  combos: ComboStrategy[];
}

export interface TreeNodeView {
  id: string;
  player: Position;
  pot: number;
  toCall: number;
  street: Street;
  historyLabels: { nodeId: string; label: string; player: Position }[];
  actions: ActionMetric[];
  matrix: MatrixCell[];
}

export interface EquityStats {
  equity: number;
  winPct: number;
  tiePct: number;
  potOdds: number;
  callEv: number;
  madeHand: string;
  simulations: number;
  heuristicAction: string;
  heuristicDetail: string;
}

export interface SolverResult {
  requestId: number;
  mode: "gto_dcfr" | "multiway_mc" | "preflop_gto";
  iterations: number;
  targetIterations: number;
  converged: boolean;
  solveTimeMs: number;
  avgRegretDelta: number;
  heroHandClass: string;
  heroComboExact: string | null;
  heroInPresetRange: boolean;
  activeNodeId: string;
  nodes: Record<string, TreeNodeView>;
  rootNodeId: string;
  equityStats: EquityStats;
  rangeStats: {
    ipCombos: number;
    oopCombos: number;
  };
}
