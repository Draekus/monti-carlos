import type { SolverConfig, TableState } from "./types";

export interface RangePreset {
  id: string;
  name: string;
  subtitle: string;
  ipLabel: string;
  oopLabel: string;
  ipRange: string;
  oopRange: string;
  defaultPot: number;
  defaultStack: number;
}

export const RANGE_PRESETS: RangePreset[] = [
  {
    id: "btn_vs_bb_srp",
    name: "BTN vs BB (SRP)",
    subtitle: "Single Raised Pot · 100bb",
    ipLabel: "BTN Open",
    oopLabel: "BB Call",
    defaultPot: 5.5,
    defaultStack: 97.5,
    ipRange:
      "AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,K5s,K4s,QJs,QTs,Q9s,Q8s,Q7s,JTs,J9s,J8s,J7s,T9s,T8s,T7s,98s,97s,87s,86s,76s,75s,65s,64s,54s,AKo,AQo,AJo,ATo,A9o,A8o,KQo,KJo,KTo,K9o,QJo,QTo,JTo",
    oopRange:
      "QQ:0.25,JJ:0.5,TT:0.75,99,88,77,66,55,44,33,22,AQs:0.5,AJs:0.75,ATs,A9s,A8s,A7s,A6s,A5s:0.5,A4s,A3s,A2s,KQs:0.5,KJs,KTs,K9s,K8s,K7s,K6s,K5s,K4s,K3s,QJs,QTs,Q9s,Q8s,Q7s,Q6s,JTs,J9s,J8s,J7s,T9s,T8s,T7s,98s,97s,96s,87s,86s,76s,75s,65s,64s,54s,53s,43s,AKo:0.25,AQo:0.75,AJo,ATo,A9o,A8o,KQo,KJo,KTo,K9o,QJo,QTo,Q9o,JTo,J9o,T9o",
  },
  {
    id: "co_vs_bb_3bp",
    name: "CO vs BB (3-Bet Pot)",
    subtitle: "3-Bet Pot · IP Call vs OOP 3-Bet",
    ipLabel: "CO Call 3B",
    oopLabel: "BB 3-Bet",
    defaultPot: 21.0,
    defaultStack: 89.5,
    ipRange:
      "QQ:0.5,JJ,TT,99,88,77,66:0.5,AQs,AJs,ATs,A9s:0.5,A5s:0.5,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s,87s,76s,AKo:0.5,AQo,AJo:0.5,KQo:0.5",
    oopRange:
      "AA,KK,QQ,JJ:0.75,TT:0.5,99:0.25,AKs,AQs,AJs,ATs:0.5,A5s,A4s,A3s:0.5,KQs,KJs,KTs:0.5,QJs:0.75,JTs:0.5,T9s:0.5,98s:0.25,AKo,AQo:0.75,AJo:0.25,KQo:0.5",
  },
  {
    id: "utg_vs_bb_srp",
    name: "UTG vs BB (SRP)",
    subtitle: "Tight EP Open vs BB Defense",
    ipLabel: "UTG Open",
    oopLabel: "BB Call",
    defaultPot: 5.5,
    defaultStack: 97.5,
    ipRange:
      "AA,KK,QQ,JJ,TT,99,88,77,66:0.75,55:0.5,AKs,AQs,AJs,ATs,A9s:0.5,A5s,A4s,KQs,KJs,KTs,K9s:0.5,QJs,QTs,JTs,T9s,98s,87s:0.5,76s:0.5,AKo,AQo,AJo:0.75,KQo:0.75",
    oopRange:
      "JJ:0.5,TT,99,88,77,66,55,44,33,22,AQs:0.75,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs:0.75,KJs,KTs,K9s,K8s,QJs,QTs,Q9s,JTs,J9s,T9s,T8s,98s,97s,87s,86s,76s,65s,54s,AQo,AJo,ATo:0.5,KQo,KJo:0.5",
  },
  {
    id: "sb_vs_bb_srp",
    name: "SB vs BB (SRP)",
    subtitle: "Wide Blind Battle · SB OOP",
    ipLabel: "BB Call",
    oopLabel: "SB Open",
    defaultPot: 6.0,
    defaultStack: 97.0,
    ipRange:
      "JJ:0.25,TT:0.5,99,88,77,66,55,44,33,22,AJs:0.5,ATs,A9s,A8s,A7s,A6s,A5s:0.5,A4s,A3s,A2s,KQs:0.5,KJs,KTs,K9s,K8s,K7s,K6s,K5s,QJs,QTs,Q9s,Q8s,Q7s,JTs,J9s,J8s,T9s,T8s,T7s,98s,97s,87s,86s,76s,75s,65s,64s,54s,AQo:0.5,AJo,ATo,A9o,KQo,KJo,KTo,QJo,QTo,JTo",
    oopRange:
      "AA,KK,QQ,JJ,TT,99,88,77,66,55,44,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,K5s,QJs,QTs,Q9s,Q8s,JTs,J9s,J8s,T9s,T8s,98s,97s,87s,76s,65s,54s,AKo,AQo,AJo,ATo,A9o,KQo,KJo,KTo,QJo,QTo,JTo",
  },
];

export const DEFAULT_SOLVER_CONFIG: SolverConfig = {
  presetId: RANGE_PRESETS[0].id,
  ipRange: RANGE_PRESETS[0].ipRange,
  oopRange: RANGE_PRESETS[0].oopRange,
  flop: { betSizes: [33, 75], raiseSizes: [50], includeAllIn: true },
  turn: { betSizes: [50, 100], raiseSizes: [50], includeAllIn: true },
  river: { betSizes: [50, 100], raiseSizes: [60], includeAllIn: true },
  targetIterations: 180,
  accuracy: 0.35,
};

export const INITIAL_TABLE_STATE: TableState = {
  heroCards: ["As", "Kd"],
  boardCards: ["Qh", "Jc", "4s"],
  potSize: 5.5,
  toCall: 0,
  effectiveStack: 97.5,
  activeOpponents: 1,
  street: "flop",
  heroPosition: "IP",
  notes: null,
  source: "preset",
};

export function generateTexasSolverScript(state: TableState, config: SolverConfig): string {
  const lines: string[] = [
    `set_pot ${Number(state.potSize.toFixed(2))}`,
    `set_effective_stack ${Number(state.effectiveStack.toFixed(2))}`,
  ];

  if (state.boardCards.length >= 3) {
    lines.push(`set_board ${state.boardCards.join(",")}`);
  } else {
    lines.push(`# Note: TexasSolver requires at least a 3-card flop board`);
    lines.push(`set_board Qh,Jc,4s`);
  }

  lines.push(`set_range_oop ${config.oopRange}`);
  lines.push(`set_range_ip ${config.ipRange}`);
  lines.push("");

  const addStreetSizes = (street: "flop" | "turn" | "river", cfg: SolverConfig["flop"]) => {
    for (const player of ["oop", "ip"] as const) {
      if (cfg.betSizes.length > 0) {
        lines.push(`set_bet_sizes ${player},${street},bet,${cfg.betSizes.join(",")}`);
      }
      if (cfg.raiseSizes.length > 0) {
        lines.push(`set_bet_sizes ${player},${street},raise,${cfg.raiseSizes.join(",")}`);
      }
      if (cfg.includeAllIn) {
        lines.push(`set_bet_sizes ${player},${street},allin`);
      }
    }
  };

  addStreetSizes("flop", config.flop);
  addStreetSizes("turn", config.turn);
  addStreetSizes("river", config.river);

  lines.push("");
  lines.push(`set_thread_num 8`);
  lines.push(`set_accuracy ${config.accuracy}`);
  lines.push(`set_max_iteration ${config.targetIterations}`);
  lines.push(`set_use_isomorphism 1`);
  lines.push(`build_tree`);
  lines.push(`start_solve`);
  lines.push(`dump_result output_result.json`);

  return lines.join("\n");
}

export function parseTexasSolverScript(
  script: string,
  prevState: TableState,
  prevConfig: SolverConfig
): { statePatch: Partial<TableState>; configPatch: Partial<SolverConfig>; summary: string[] } {
  const statePatch: Partial<TableState> = {};
  const configPatch: Partial<SolverConfig> = {};
  const summary: string[] = [];

  const flopCfg = { ...prevConfig.flop, betSizes: [...prevConfig.flop.betSizes], raiseSizes: [...prevConfig.flop.raiseSizes] };
  const turnCfg = { ...prevConfig.turn, betSizes: [...prevConfig.turn.betSizes], raiseSizes: [...prevConfig.turn.raiseSizes] };
  const riverCfg = { ...prevConfig.river, betSizes: [...prevConfig.river.betSizes], raiseSizes: [...prevConfig.river.raiseSizes] };

  let touchedFlopBet = false;
  let touchedTurnBet = false;
  let touchedRiverBet = false;

  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const spaceIdx = line.search(/\s+/);
    const cmd = (spaceIdx === -1 ? line : line.slice(0, spaceIdx)).toLowerCase();
    const arg = spaceIdx === -1 ? "" : line.slice(spaceIdx).trim();

    if (cmd === "set_pot") {
      const val = parseFloat(arg);
      if (!Number.isNaN(val) && val > 0) {
        statePatch.potSize = val;
        summary.push(`Pot set to ${val}`);
      }
    } else if (cmd === "set_effective_stack") {
      const val = parseFloat(arg);
      if (!Number.isNaN(val) && val > 0) {
        statePatch.effectiveStack = val;
        summary.push(`Effective stack set to ${val}`);
      }
    } else if (cmd === "set_board") {
      const cards = arg
        .split(/[,\s]+/)
        .map((c) => c.trim())
        .filter((c) => /^[2-9TJQKA][shdc]$/i.test(c))
        .map((c) => c[0].toUpperCase() + c[1].toLowerCase())
        .slice(0, 5);
      if (cards.length >= 3) {
        statePatch.boardCards = cards;
        statePatch.street =
          cards.length === 5 ? "river" : cards.length === 4 ? "turn" : "flop";
        summary.push(`Board set to ${cards.join(" ")}`);
      }
    } else if (cmd === "set_range_ip" && arg) {
      configPatch.ipRange = arg;
      configPatch.presetId = "custom";
      summary.push("Updated IP range");
    } else if (cmd === "set_range_oop" && arg) {
      configPatch.oopRange = arg;
      configPatch.presetId = "custom";
      summary.push("Updated OOP range");
    } else if (cmd === "set_accuracy") {
      const val = parseFloat(arg);
      if (!Number.isNaN(val) && val > 0) {
        configPatch.accuracy = val;
      }
    } else if (cmd === "set_max_iteration") {
      const val = parseInt(arg, 10);
      if (!Number.isNaN(val) && val >= 50) {
        configPatch.targetIterations = Math.min(1000, val);
      }
    } else if (cmd === "set_bet_sizes") {
      const parts = arg.split(",").map((p) => p.trim().toLowerCase());
      if (parts.length >= 3) {
        const street = parts[1];
        const action = parts[2];
        const vals = parts
          .slice(3)
          .map((v) => parseFloat(v))
          .filter((v) => !Number.isNaN(v) && v > 0);
        const target =
          street === "flop" ? flopCfg : street === "turn" ? turnCfg : street === "river" ? riverCfg : null;
        if (target) {
          if (action === "bet" && vals.length > 0) {
            target.betSizes = vals;
            if (street === "flop") touchedFlopBet = true;
            if (street === "turn") touchedTurnBet = true;
            if (street === "river") touchedRiverBet = true;
          } else if (action === "raise" && vals.length > 0) {
            target.raiseSizes = vals;
          } else if (action === "allin") {
            target.includeAllIn = true;
          }
        }
      }
    }
  }

  if (touchedFlopBet) configPatch.flop = flopCfg;
  if (touchedTurnBet) configPatch.turn = turnCfg;
  if (touchedRiverBet) configPatch.river = riverCfg;

  return { statePatch, configPatch, summary };
}
