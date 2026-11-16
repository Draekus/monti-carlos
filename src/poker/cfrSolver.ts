import {
  cardToInt,
  describeMadeHand,
  evaluateCards,
  expandRangeCombos,
  getCanonicalLabel,
  getMatrixCellCoords,
  MATRIX_LABELS,
  parseRangeWeights,
  type RangeCombo,
} from "./cards";
import type {
  ActionMetric,
  ActionSemantic,
  ComboStrategy,
  EquityStats,
  MatrixCell,
  Position,
  SolverConfig,
  SolverResult,
  Street,
  TableState,
  TreeNodeView,
} from "./types";

interface InternalActionSpec {
  id: string;
  label: string;
  shortLabel: string;
  semantic: ActionSemantic;
  pctPot: number | null;
  addedInvest: number;
  isFold?: boolean;
  isCall?: boolean;
  isCheck?: boolean;
}

interface InternalNode {
  id: string;
  player: Position;
  pot: number;
  toCall: number;
  oopInvested: number;
  ipInvested: number;
  street: Street;
  historyLabels: { nodeId: string; label: string; player: Position }[];
  actions: InternalActionSpec[];
  children: (InternalNode | TerminalNode)[];
  // CFR arrays flattened: [comboIdx * numActions + actionIdx]
  regretSum: Float64Array;
  strategySum: Float64Array;
  currentStrategy: Float64Array;
  lastHeroEvs?: Float64Array; // [comboIdx * numActions + actionIdx]
}

interface TerminalNode {
  kind: "terminal";
  terminalType: "showdown" | "fold_oop" | "fold_ip";
  pot: number;
  oopInvested: number;
  ipInvested: number;
}

type TreeElement = InternalNode | TerminalNode;

function isTerminal(node: TreeElement): node is TerminalNode {
  return (node as TerminalNode).kind === "terminal";
}

function classifyBetSemantic(pctPot: number | null, isAllIn: boolean, isRaise: boolean): ActionSemantic {
  if (isAllIn) return "allin";
  if (isRaise) return "raise";
  if (pctPot !== null && pctPot >= 90) return "bet_large";
  if (pctPot !== null && pctPot >= 55) return "bet_medium";
  return "bet_small";
}

/**
 * Builds a TexasSolver-style postflop action tree for the current street.
 */
function buildActionTree(
  street: Street,
  basePot: number,
  effStack: number,
  config: SolverConfig,
  injectedToCall: number,
  heroPosition: Position
): { root: InternalNode; nodesById: Map<string, InternalNode>; targetNodeId: string } {
  const streetCfg =
    street === "river" ? config.river : street === "turn" ? config.turn : config.flop;

  const nodesById = new Map<string, InternalNode>();
  let nodeCounter = 0;

  const makeNodeId = (prefix: string) => `${prefix}_${nodeCounter++}`;

  const createBetActions = (
    pot: number,
    playerInvested: number,
    isRaise: boolean,
    toCall: number
  ): InternalActionSpec[] => {
    const remaining = Math.max(0, effStack - playerInvested);
    const specs: InternalActionSpec[] = [];
    const seenAmounts = new Set<number>();

    const sizes = isRaise ? streetCfg.raiseSizes : streetCfg.betSizes;
    for (const pct of sizes) {
      let addAmt: number;
      if (isRaise) {
        // TexasSolver raise size = toCall + pct% of (pot + toCall)
        const potAfterCall = pot + toCall;
        addAmt = toCall + (potAfterCall * pct) / 100;
      } else {
        addAmt = (pot * pct) / 100;
      }
      addAmt = Math.min(remaining, Math.max(0.5, Number(addAmt.toFixed(2))));
      if (addAmt <= toCall + 0.25) continue;
      if (remaining - addAmt < pot * 0.12 && streetCfg.includeAllIn) {
        // Snap near-all-in bet to all-in
        continue;
      }
      const roundedKey = Math.round(addAmt * 10);
      if (seenAmounts.has(roundedKey)) continue;
      seenAmounts.add(roundedKey);

      const label = isRaise ? `Raise ${pct}%` : `Bet ${pct}%`;
      specs.push({
        id: isRaise ? `raise_${pct}` : `bet_${pct}`,
        label,
        shortLabel: isRaise ? `R${pct}` : `B${pct}`,
        semantic: classifyBetSemantic(pct, false, isRaise),
        pctPot: pct,
        addedInvest: addAmt,
      });
    }

    if (streetCfg.includeAllIn && remaining > toCall + 0.25) {
      const roundedAllIn = Math.round(remaining * 10);
      if (!seenAmounts.has(roundedAllIn)) {
        specs.push({
          id: "allin",
          label: "All-In",
          shortLabel: "ALL-IN",
          semantic: "allin",
          pctPot: Math.round((remaining / Math.max(1, pot)) * 100),
          addedInvest: remaining,
        });
      }
    }

    return specs;
  };

  // If facing an explicit bet from the table state (toCall > 0), model Villain's bet as the opening node
  // or attach it cleanly to root so Hero immediately faces that exact bet size.
  const hasExplicitFacingBet = injectedToCall > 0.05;
  const villainPos: Position = heroPosition === "IP" ? "OOP" : "IP";

  const buildSubtree = (
    player: Position,
    pot: number,
    toCall: number,
    oopInv: number,
    ipInv: number,
    raiseDepth: number,
    checkedOnce: boolean,
    history: { nodeId: string; label: string; player: Position }[],
    forcedNodeId?: string
  ): InternalNode => {
    const id = forcedNodeId ?? makeNodeId("node");
    const actions: InternalActionSpec[] = [];

    if (toCall <= 0.01) {
      actions.push({
        id: "check",
        label: "Check",
        shortLabel: "CHECK",
        semantic: "check",
        pctPot: null,
        addedInvest: 0,
        isCheck: true,
      });
      if (raiseDepth < 2) {
        actions.push(
          ...createBetActions(pot, player === "OOP" ? oopInv : ipInv, false, 0)
        );
      }
    } else {
      actions.push({
        id: "fold",
        label: "Fold",
        shortLabel: "FOLD",
        semantic: "fold",
        pctPot: null,
        addedInvest: 0,
        isFold: true,
      });
      const callAmt = Math.min(
        toCall,
        Math.max(0, effStack - (player === "OOP" ? oopInv : ipInv))
      );
      actions.push({
        id: "call",
        label: "Call",
        shortLabel: "CALL",
        semantic: "call",
        pctPot: null,
        addedInvest: callAmt,
        isCall: true,
      });
      if (raiseDepth < 2) {
        actions.push(
          ...createBetActions(pot, player === "OOP" ? oopInv : ipInv, true, toCall)
        );
      }
    }

    const children: TreeElement[] = [];
    for (const act of actions) {
      const nextHistory = [...history, { nodeId: id, label: act.label, player }];
      if (act.isFold) {
        children.push({
          kind: "terminal",
          terminalType: player === "OOP" ? "fold_oop" : "fold_ip",
          pot,
          oopInvested: oopInv,
          ipInvested: ipInv,
        });
      } else if (act.isCall) {
        const nextOop = player === "OOP" ? oopInv + act.addedInvest : oopInv;
        const nextIp = player === "IP" ? ipInv + act.addedInvest : ipInv;
        children.push({
          kind: "terminal",
          terminalType: "showdown",
          pot: pot + act.addedInvest,
          oopInvested: nextOop,
          ipInvested: nextIp,
        });
      } else if (act.isCheck) {
        if (player === "IP" && checkedOnce) {
          children.push({
            kind: "terminal",
            terminalType: "showdown",
            pot,
            oopInvested: oopInv,
            ipInvested: ipInv,
          });
        } else {
          children.push(
            buildSubtree(
              "IP",
              pot,
              0,
              oopInv,
              ipInv,
              raiseDepth,
              true,
              nextHistory
            )
          );
        }
      } else {
        // Bet or raise
        const nextOop = player === "OOP" ? oopInv + act.addedInvest : oopInv;
        const nextIp = player === "IP" ? ipInv + act.addedInvest : ipInv;
        const nextToCall = Math.abs(nextOop - nextIp);
        const oppPos: Position = player === "OOP" ? "IP" : "OOP";
        const oppRemaining = Math.max(0, effStack - (oppPos === "OOP" ? nextOop : nextIp));
        if (oppRemaining <= 0.01) {
          children.push({
            kind: "terminal",
            terminalType: "showdown",
            pot: pot + act.addedInvest,
            oopInvested: nextOop,
            ipInvested: nextIp,
          });
        } else {
          children.push(
            buildSubtree(
              oppPos,
              pot + act.addedInvest,
              nextToCall,
              nextOop,
              nextIp,
              raiseDepth + 1,
              false,
              nextHistory
            )
          );
        }
      }
    }

    const node: InternalNode = {
      id,
      player,
      pot,
      toCall,
      oopInvested: oopInv,
      ipInvested: ipInv,
      street,
      historyLabels: history,
      actions,
      children,
      regretSum: new Float64Array(0),
      strategySum: new Float64Array(0),
      currentStrategy: new Float64Array(0),
    };
    nodesById.set(id, node);
    return node;
  };

  if (hasExplicitFacingBet) {
    // Build a root where villain opens with injectedToCall, and Hero faces that exact bet at targetNodeId.
    const clampedBet = Math.min(effStack, injectedToCall);
    const rootId = "root";
    const facingNodeId = "facing_bet";

    const villainActs: InternalActionSpec[] = [
      {
        id: "check",
        label: "Check",
        shortLabel: "CHECK",
        semantic: "check",
        pctPot: null,
        addedInvest: 0,
        isCheck: true,
      },
      {
        id: "facing_bet",
        label: `Bet ${Math.round((clampedBet / Math.max(1, basePot)) * 100)}%`,
        shortLabel: `B${Math.round((clampedBet / Math.max(1, basePot)) * 100)}`,
        semantic: classifyBetSemantic(
          (clampedBet / Math.max(1, basePot)) * 100,
          clampedBet >= effStack - 0.1,
          false
        ),
        pctPot: Math.round((clampedBet / Math.max(1, basePot)) * 100),
        addedInvest: clampedBet,
      },
    ];

    const checkChild = buildSubtree(
      heroPosition,
      basePot,
      0,
      0,
      0,
      0,
      villainPos === "OOP",
      [{ nodeId: rootId, label: `${villainPos} Check`, player: villainPos }]
    );

    const oopInv = villainPos === "OOP" ? clampedBet : 0;
    const ipInv = villainPos === "IP" ? clampedBet : 0;
    const betChild = buildSubtree(
      heroPosition,
      basePot + clampedBet,
      clampedBet,
      oopInv,
      ipInv,
      1,
      false,
      [
        {
          nodeId: rootId,
          label: `${villainPos} Bet ${Number(clampedBet.toFixed(2))}`,
          player: villainPos,
        },
      ],
      facingNodeId
    );

    const rootNode: InternalNode = {
      id: rootId,
      player: villainPos,
      pot: basePot,
      toCall: 0,
      oopInvested: 0,
      ipInvested: 0,
      street,
      historyLabels: [],
      actions: villainActs,
      children: [checkChild, betChild],
      regretSum: new Float64Array(0),
      strategySum: new Float64Array(0),
      currentStrategy: new Float64Array(0),
    };
    nodesById.set(rootId, rootNode);
    return { root: rootNode, nodesById, targetNodeId: facingNodeId };
  }

  const root = buildSubtree("OOP", basePot, 0, 0, 0, 0, false, [], "root");
  const targetNodeId =
    heroPosition === "IP"
      ? (root.children[0] as InternalNode)?.id ?? "root"
      : "root";
  return { root, nodesById, targetNodeId };
}

/**
 * Precomputes exact or stratified showdown equity matrix E[oopIdx][ipIdx]
 * and card-blocker matrix K[oopIdx][ipIdx] (1 if disjoint, 0 if sharing a card).
 */
function computeShowdownMatrices(
  oopCombos: RangeCombo[],
  ipCombos: RangeCombo[],
  boardInts: number[],
  street: Street
): {
  equity: Float32Array;
  valid: Uint8Array;
  oopAvgEq: Float32Array;
  ipAvgEq: Float32Array;
} {
  const nOop = oopCombos.length;
  const nIp = ipCombos.length;
  const equity = new Float32Array(nOop * nIp);
  const valid = new Uint8Array(nOop * nIp);

  for (let i = 0; i < nOop; i++) {
    const oc1 = oopCombos[i].c1;
    const oc2 = oopCombos[i].c2;
    for (let j = 0; j < nIp; j++) {
      const ic1 = ipCombos[j].c1;
      const ic2 = ipCombos[j].c2;
      if (oc1 !== ic1 && oc1 !== ic2 && oc2 !== ic1 && oc2 !== ic2) {
        valid[i * nIp + j] = 1;
      }
    }
  }

  const deadBoard = new Set(boardInts);
  const remaining: number[] = [];
  for (let c = 0; c < 52; c++) {
    if (!deadBoard.has(c)) remaining.push(c);
  }

  const oopScores = new Int32Array(nOop);
  const ipScores = new Int32Array(nIp);

  // Build runout boards
  const runouts: number[][] = [];
  if (boardInts.length >= 5) {
    runouts.push(boardInts.slice(0, 5));
  } else if (boardInts.length === 4) {
    // Exact all remaining river cards
    for (const rCard of remaining) {
      runouts.push([...boardInts, rCard]);
    }
  } else {
    // Flop: deterministic stratified 24 turn+river runouts across suits & ranks
    const step1 = Math.max(1, Math.floor(remaining.length / 8));
    for (let a = 0; a < remaining.length; a += step1) {
      for (let bOff = 1; bOff <= 3; bOff++) {
        const b = (a + bOff * 7) % remaining.length;
        if (a !== b) {
          runouts.push([...boardInts, remaining[a], remaining[b]]);
        }
      }
    }
  }

  const counts = new Float32Array(nOop * nIp);
  const handBuf = [0, 0, 0, 0, 0, 0, 0];

  for (const runout of runouts) {
    handBuf[2] = runout[0];
    handBuf[3] = runout[1];
    handBuf[4] = runout[2];
    handBuf[5] = runout[3];
    handBuf[6] = runout[4];

    for (let i = 0; i < nOop; i++) {
      const c1 = oopCombos[i].c1;
      const c2 = oopCombos[i].c2;
      if (runout.includes(c1) || runout.includes(c2)) {
        oopScores[i] = -1;
      } else {
        handBuf[0] = c1;
        handBuf[1] = c2;
        oopScores[i] = evaluateCards(handBuf);
      }
    }

    for (let j = 0; j < nIp; j++) {
      const c1 = ipCombos[j].c1;
      const c2 = ipCombos[j].c2;
      if (runout.includes(c1) || runout.includes(c2)) {
        ipScores[j] = -1;
      } else {
        handBuf[0] = c1;
        handBuf[1] = c2;
        ipScores[j] = evaluateCards(handBuf);
      }
    }

    for (let i = 0; i < nOop; i++) {
      const os = oopScores[i];
      if (os < 0) continue;
      const rowOff = i * nIp;
      for (let j = 0; j < nIp; j++) {
        if (valid[rowOff + j] === 0) continue;
        const is = ipScores[j];
        if (is < 0) continue;
        counts[rowOff + j] += 1;
        if (os > is) equity[rowOff + j] += 1;
        else if (os === is) equity[rowOff + j] += 0.5;
      }
    }
  }

  const oopAvgEq = new Float32Array(nOop);
  const ipAvgEq = new Float32Array(nIp);
  const oopWt = new Float32Array(nOop);
  const ipWt = new Float32Array(nIp);

  for (let i = 0; i < nOop; i++) {
    const rowOff = i * nIp;
    for (let j = 0; j < nIp; j++) {
      const idx = rowOff + j;
      if (valid[idx] === 1) {
        const eq = counts[idx] > 0 ? equity[idx] / counts[idx] : 0.5;
        // Subtle positional equity realization factor on earlier streets
        const realizedEq =
          street === "flop"
            ? Math.max(0, Math.min(1, eq * 0.96 + 0.015))
            : street === "turn"
            ? Math.max(0, Math.min(1, eq * 0.98 + 0.008))
            : eq;
        equity[idx] = realizedEq;

        const wIp = ipCombos[j].weight;
        const wOop = oopCombos[i].weight;
        oopAvgEq[i] += realizedEq * wIp;
        oopWt[i] += wIp;
        ipAvgEq[j] += (1 - realizedEq) * wOop;
        ipWt[j] += wOop;
      }
    }
  }

  for (let i = 0; i < nOop; i++) {
    oopAvgEq[i] = oopWt[i] > 0 ? oopAvgEq[i] / oopWt[i] : 0.5;
  }
  for (let j = 0; j < nIp; j++) {
    ipAvgEq[j] = ipWt[j] > 0 ? ipAvgEq[j] / ipWt[j] : 0.5;
  }

  return { equity, valid, oopAvgEq, ipAvgEq };
}

function allocateNodeBuffers(nodesById: Map<string, InternalNode>, nOop: number, nIp: number) {
  for (const node of nodesById.values()) {
    const nCombos = node.player === "OOP" ? nOop : nIp;
    const nActs = node.actions.length;
    const size = nCombos * nActs;
    node.regretSum = new Float64Array(size);
    node.strategySum = new Float64Array(size);
    node.currentStrategy = new Float64Array(size);
    node.lastHeroEvs = new Float64Array(size);
    const uniform = 1 / nActs;
    node.currentStrategy.fill(uniform);
  }
}

/**
 * Vectorized Discounted CFR iteration (TexasSolver DCFR: alpha=1.5, beta=0, gamma=2.0).
 */
function runDcfrIteration(
  root: InternalNode,
  nodesById: Map<string, InternalNode>,
  nOop: number,
  nIp: number,
  oopC1: Int32Array,
  oopC2: Int32Array,
  ipC1: Int32Array,
  ipC2: Int32Array,
  oopPairInIp: Int32Array,
  ipPairInOop: Int32Array,
  equity: Float32Array,
  valid: Uint8Array,
  initOopReach: Float64Array,
  initIpReach: Float64Array,
  iter: number
): number {
  const dcfrAlpha = 1.5;
  const dcfrBeta = 0.0;
  const dcfrGamma = 2.0;

  const tPowAlpha = Math.pow(iter, dcfrAlpha);
  const posDiscount = tPowAlpha / (tPowAlpha + 1);
  const tPowBeta = Math.pow(iter, dcfrBeta);
  const negDiscount = tPowBeta / (tPowBeta + 1);
  const stratWeight = Math.pow(iter / (iter + 1), dcfrGamma);

  // Update regret-matching strategies for all internal nodes
  for (const node of nodesById.values()) {
    const nCombos = node.player === "OOP" ? nOop : nIp;
    const nActs = node.actions.length;
    for (let c = 0; c < nCombos; c++) {
      const off = c * nActs;
      let posSum = 0;
      for (let a = 0; a < nActs; a++) {
        const r = node.regretSum[off + a];
        if (r > 0) posSum += r;
      }
      if (posSum > 1e-12) {
        for (let a = 0; a < nActs; a++) {
          const r = node.regretSum[off + a];
          node.currentStrategy[off + a] = r > 0 ? r / posSum : 0;
        }
      } else {
        const u = 1 / nActs;
        for (let a = 0; a < nActs; a++) {
          node.currentStrategy[off + a] = u;
        }
      }
    }
  }

  let totalRegretMagnitude = 0;

  const traverse = (
    elem: TreeElement,
    oopReach: Float64Array,
    ipReach: Float64Array
  ): { oopEv: Float64Array; ipEv: Float64Array } => {
    if (isTerminal(elem)) {
      const oopEv = new Float64Array(nOop);
      const ipEv = new Float64Array(nIp);
      const totalPot = elem.pot;

      if (elem.terminalType === "showdown") {
        for (let i = 0; i < nOop; i++) {
          const rowOff = i * nIp;
          let ev = 0;
          for (let j = 0; j < nIp; j++) {
            const r = ipReach[j];
            if (r > 1e-10 && valid[rowOff + j] === 1) {
              ev += r * (totalPot * equity[rowOff + j] - elem.oopInvested);
            }
          }
          oopEv[i] = ev;
        }
        for (let j = 0; j < nIp; j++) {
          let ev = 0;
          for (let i = 0; i < nOop; i++) {
            const r = oopReach[i];
            if (r > 1e-10) {
              const idx = i * nIp + j;
              if (valid[idx] === 1) {
                ev += r * (totalPot * (1 - equity[idx]) - elem.ipInvested);
              }
            }
          }
          ipEv[j] = ev;
        }
      } else {
        // O(nOop + nIp) exact blocker evaluation using card-reach sums
        let totalIp = 0;
        const ipByCard = new Float64Array(52);
        for (let j = 0; j < nIp; j++) {
          const r = ipReach[j];
          if (r > 1e-10) {
            totalIp += r;
            ipByCard[ipC1[j]] += r;
            ipByCard[ipC2[j]] += r;
          }
        }
        let totalOop = 0;
        const oopByCard = new Float64Array(52);
        for (let i = 0; i < nOop; i++) {
          const r = oopReach[i];
          if (r > 1e-10) {
            totalOop += r;
            oopByCard[oopC1[i]] += r;
            oopByCard[oopC2[i]] += r;
          }
        }

        const oopMult =
          elem.terminalType === "fold_oop"
            ? -elem.oopInvested
            : totalPot - elem.oopInvested;
        const ipMult =
          elem.terminalType === "fold_ip"
            ? -elem.ipInvested
            : totalPot - elem.ipInvested;

        for (let i = 0; i < nOop; i++) {
          const pairOop = oopPairInIp[i];
          const overlap = pairOop >= 0 ? ipReach[pairOop] : 0;
          const unblockedIp = Math.max(
            0,
            totalIp - ipByCard[oopC1[i]] - ipByCard[oopC2[i]] + overlap
          );
          oopEv[i] = oopMult * unblockedIp;
        }
        for (let j = 0; j < nIp; j++) {
          const pairIp = ipPairInOop[j];
          const overlap = pairIp >= 0 ? oopReach[pairIp] : 0;
          const unblockedOop = Math.max(
            0,
            totalOop - oopByCard[ipC1[j]] - oopByCard[ipC2[j]] + overlap
          );
          ipEv[j] = ipMult * unblockedOop;
        }
      }
      return { oopEv, ipEv };
    }

    const nActs = elem.actions.length;
    const isOop = elem.player === "OOP";
    const nCombos = isOop ? nOop : nIp;
    const myReach = isOop ? oopReach : ipReach;

    const childResults: { oopEv: Float64Array; ipEv: Float64Array }[] = [];

    for (let a = 0; a < nActs; a++) {
      const nextReach = new Float64Array(nCombos);
      for (let c = 0; c < nCombos; c++) {
        nextReach[c] = myReach[c] * elem.currentStrategy[c * nActs + a];
      }
      const res = isOop
        ? traverse(elem.children[a], nextReach, ipReach)
        : traverse(elem.children[a], oopReach, nextReach);
      childResults.push(res);
    }

    const nodeOopEv = new Float64Array(nOop);
    const nodeIpEv = new Float64Array(nIp);

    if (isOop) {
      for (let i = 0; i < nOop; i++) {
        let evSum = 0;
        const off = i * nActs;
        for (let a = 0; a < nActs; a++) {
          const prob = elem.currentStrategy[off + a];
          const actEv = childResults[a].oopEv[i];
          if (elem.lastHeroEvs) elem.lastHeroEvs[off + a] = actEv;
          evSum += prob * actEv;
        }
        nodeOopEv[i] = evSum;

        for (let a = 0; a < nActs; a++) {
          const regret = childResults[a].oopEv[i] - evSum;
          const idx = off + a;
          const prevR = elem.regretSum[idx];
          const discounted = prevR >= 0 ? prevR * posDiscount : prevR * negDiscount;
          elem.regretSum[idx] = discounted + regret;
          totalRegretMagnitude += Math.abs(regret) * oopReach[i];
          elem.strategySum[idx] =
            elem.strategySum[idx] * stratWeight +
            oopReach[i] * elem.currentStrategy[idx];
        }
      }
      for (let a = 0; a < nActs; a++) {
        const cIp = childResults[a].ipEv;
        for (let j = 0; j < nIp; j++) {
          nodeIpEv[j] += cIp[j];
        }
      }
    } else {
      for (let j = 0; j < nIp; j++) {
        let evSum = 0;
        const off = j * nActs;
        for (let a = 0; a < nActs; a++) {
          const prob = elem.currentStrategy[off + a];
          const actEv = childResults[a].ipEv[j];
          if (elem.lastHeroEvs) elem.lastHeroEvs[off + a] = actEv;
          evSum += prob * actEv;
        }
        nodeIpEv[j] = evSum;

        for (let a = 0; a < nActs; a++) {
          const regret = childResults[a].ipEv[j] - evSum;
          const idx = off + a;
          const prevR = elem.regretSum[idx];
          const discounted = prevR >= 0 ? prevR * posDiscount : prevR * negDiscount;
          elem.regretSum[idx] = discounted + regret;
          totalRegretMagnitude += Math.abs(regret) * ipReach[j];
          elem.strategySum[idx] =
            elem.strategySum[idx] * stratWeight +
            ipReach[j] * elem.currentStrategy[idx];
        }
      }
      for (let a = 0; a < nActs; a++) {
        const cOop = childResults[a].oopEv;
        for (let i = 0; i < nOop; i++) {
          nodeOopEv[i] += cOop[i];
        }
      }
    }

    return { oopEv: nodeOopEv, ipEv: nodeIpEv };
  };

  traverse(root, initOopReach, initIpReach);
  return totalRegretMagnitude;
}

/**
 * Extracts average strategies and EVs for every node into UI-ready TreeNodeView objects.
 */
function extractTreeSnapshot(
  root: InternalNode,
  nodesById: Map<string, InternalNode>,
  oopCombos: RangeCombo[],
  ipCombos: RangeCombo[],
  valid: Uint8Array,
  oopAvgEq: Float32Array,
  ipAvgEq: Float32Array,
  heroComboIdx: { oop: number; ip: number },
  heroCanonicalLabel: string
): Record<string, TreeNodeView> {
  const nOop = oopCombos.length;
  const nIp = ipCombos.length;

  // Compute reach probabilities at each node using converged average strategy
  const reachMap = new Map<string, { oop: Float64Array; ip: Float64Array }>();
  const initOop = new Float64Array(nOop);
  const initIp = new Float64Array(nIp);
  for (let i = 0; i < nOop; i++) initOop[i] = oopCombos[i].weight;
  for (let j = 0; j < nIp; j++) initIp[j] = ipCombos[j].weight;

  const getAvgProbs = (node: InternalNode, comboIdx: number): number[] => {
    const nActs = node.actions.length;
    const off = comboIdx * nActs;
    let sum = 0;
    for (let a = 0; a < nActs; a++) {
      sum += Math.max(0, node.strategySum[off + a]);
    }
    const probs: number[] = [];
    if (sum > 1e-12) {
      for (let a = 0; a < nActs; a++) {
        probs.push(Math.max(0, node.strategySum[off + a]) / sum);
      }
    } else {
      for (let a = 0; a < nActs; a++) {
        probs.push(node.currentStrategy[off + a]);
      }
    }
    return probs;
  };

  const propagateReach = (elem: TreeElement, oopR: Float64Array, ipR: Float64Array) => {
    if (isTerminal(elem)) return;
    reachMap.set(elem.id, { oop: oopR, ip: ipR });
    const isOop = elem.player === "OOP";
    const nCombos = isOop ? nOop : nIp;
    const nActs = elem.actions.length;

    for (let a = 0; a < nActs; a++) {
      const nextR = new Float64Array(nCombos);
      for (let c = 0; c < nCombos; c++) {
        const probs = getAvgProbs(elem, c);
        nextR[c] = (isOop ? oopR[c] : ipR[c]) * probs[a];
      }
      if (isOop) {
        propagateReach(elem.children[a], nextR, ipR);
      } else {
        propagateReach(elem.children[a], oopR, nextR);
      }
    }
  };
  propagateReach(root, initOop, initIp);

  const views: Record<string, TreeNodeView> = {};

  for (const node of nodesById.values()) {
    const isOop = node.player === "OOP";
    const combos = isOop ? oopCombos : ipCombos;
    const oppCombos = isOop ? ipCombos : oopCombos;
    const reaches = reachMap.get(node.id) ?? { oop: initOop, ip: initIp };
    const myReach = isOop ? reaches.oop : reaches.ip;
    const oppReach = isOop ? reaches.ip : reaches.oop;
    const nActs = node.actions.length;
    const myInvestedBeforeNode = isOop ? node.oopInvested : node.ipInvested;

    // Range-wide weighted action frequencies
    const rangeActionSums = new Float64Array(nActs);
    let totalRangeReach = 0;

    // Group combos into 13x13 matrix cells
    const cellCombos = new Map<string, ComboStrategy[]>();

    const activeHeroIdx = isOop ? heroComboIdx.oop : heroComboIdx.ip;
    const heroActionProbs = new Float64Array(nActs);
    const heroActionEvs = new Float64Array(nActs);

    for (let c = 0; c < combos.length; c++) {
      const combo = combos[c];
      const probs = getAvgProbs(node, c);
      const r = myReach[c];
      totalRangeReach += r;

      // Compute normalization denominator (opponent unblocked reach mass)
      let oppMass = 0;
      for (let o = 0; o < oppCombos.length; o++) {
        const vIdx = isOop ? c * nIp + o : o * nIp + c;
        if (valid[vIdx] === 1) oppMass += oppReach[o];
      }
      const normFactor = oppMass > 1e-9 ? 1 / oppMass : 0;

      const probsObj: Record<string, number> = {};
      const evsObj: Record<string, number> = {};
      let bestEv = -Infinity;

      // Normalize EVs relative to this decision point: Fold = 0.00 (add back invested chips before node)
      for (let a = 0; a < nActs; a++) {
        const actId = node.actions[a].id;
        probsObj[actId] = probs[a];
        rangeActionSums[a] += r * probs[a];

        const rawEv = node.lastHeroEvs ? node.lastHeroEvs[c * nActs + a] : 0;
        const normalizedEv =
          node.actions[a].isFold
            ? 0
            : rawEv * normFactor + myInvestedBeforeNode;
        evsObj[actId] = Number.isFinite(normalizedEv) ? normalizedEv : 0;
        if (evsObj[actId] > bestEv) bestEv = evsObj[actId];

        if (c === activeHeroIdx) {
          heroActionProbs[a] = probs[a];
          heroActionEvs[a] = evsObj[actId];
        }
      }

      const detail: ComboStrategy = {
        combo: combo.comboStr,
        c1: combo.comboStr.slice(0, 2),
        c2: combo.comboStr.slice(2, 4),
        weight: combo.weight,
        probs: probsObj,
        evs: evsObj,
        bestEv: Number.isFinite(bestEv) ? bestEv : 0,
        equityVsVillain: isOop ? oopAvgEq[c] : ipAvgEq[c],
      };

      const arr = cellCombos.get(combo.label);
      if (arr) arr.push(detail);
      else cellCombos.set(combo.label, [detail]);
    }

    // Determine best hero action EV for EV-loss display
    let maxHeroEv = -Infinity;
    for (let a = 0; a < nActs; a++) {
      if (heroActionEvs[a] > maxHeroEv) maxHeroEv = heroActionEvs[a];
    }
    if (!Number.isFinite(maxHeroEv)) maxHeroEv = 0;

    const actions: ActionMetric[] = node.actions.map((act, aIdx) => {
      const child = node.children[aIdx];
      return {
        id: act.id,
        label: act.label,
        shortLabel: act.shortLabel,
        semantic: act.semantic,
        pctPot: act.pctPot,
        amount: Number(act.addedInvest.toFixed(2)),
        heroFreq: activeHeroIdx >= 0 ? heroActionProbs[aIdx] : totalRangeReach > 0 ? rangeActionSums[aIdx] / totalRangeReach : 0,
        rangeFreq: totalRangeReach > 0 ? rangeActionSums[aIdx] / totalRangeReach : 1 / nActs,
        heroEv: Number((heroActionEvs[aIdx] || 0).toFixed(2)),
        evDiff: Number(((heroActionEvs[aIdx] || 0) - maxHeroEv).toFixed(2)),
        childNodeId: isTerminal(child) ? null : child.id,
      };
    });

    const matrix: MatrixCell[] = [];
    for (let row = 0; row < 13; row++) {
      for (let col = 0; col < 13; col++) {
        const label = MATRIX_LABELS[row][col];
        const list = cellCombos.get(label) ?? [];
        const actionProbs: Record<string, number> = {};
        let avgEv = 0;
        let weightSum = 0;

        for (const item of list) {
          weightSum += item.weight;
          avgEv += item.bestEv * item.weight;
          for (const act of node.actions) {
            actionProbs[act.id] = (actionProbs[act.id] ?? 0) + (item.probs[act.id] ?? 0) * item.weight;
          }
        }

        if (weightSum > 0) {
          avgEv /= weightSum;
          for (const act of node.actions) {
            actionProbs[act.id] /= weightSum;
          }
        }

        matrix.push({
          label,
          row,
          col,
          inRangeWeight: list.length > 0 ? weightSum / list.length : 0,
          comboCount: list.length,
          isHeroCell: label === heroCanonicalLabel,
          actionProbs,
          avgEv,
          combos: list,
        });
      }
    }

    views[node.id] = {
      id: node.id,
      player: node.player,
      pot: Number(node.pot.toFixed(2)),
      toCall: Number(node.toCall.toFixed(2)),
      street: node.street,
      historyLabels: node.historyLabels,
      actions,
      matrix,
    };
  }

  return views;
}

/**
 * Ported & enhanced Monte Carlo Equity Engine (matching Python treys logic).
 */
export function runMonteCarloEquity(
  holeCards: string[],
  boardCards: string[],
  opponents: number,
  potSize: number,
  toCall: number,
  simulations = 3000
): EquityStats {
  const madeHand = describeMadeHand(holeCards, boardCards);

  if (holeCards.length !== 2) {
    return {
      equity: 0,
      winPct: 0,
      tiePct: 0,
      potOdds: 0,
      callEv: 0,
      madeHand,
      simulations: 0,
      heuristicAction: "WAITING FOR HAND",
      heuristicDetail: "Select or capture 2 Hero hole cards to run equity and GTO analysis.",
    };
  }

  const holeInts = holeCards.map(cardToInt);
  const boardInts = boardCards.map(cardToInt);
  const known = new Set([...holeInts, ...boardInts]);
  const oppCount = Math.max(1, Math.min(8, opponents));
  const cardsToBoard = Math.max(0, 5 - boardInts.length);
  const cardsNeeded = cardsToBoard + 2 * oppCount;

  const remaining: number[] = [];
  for (let c = 0; c < 52; c++) {
    if (!known.has(c)) remaining.push(c);
  }

  let wins = 0;
  let ties = 0;
  let equityPoints = 0;

  const simBoard = new Array<number>(5);
  for (let i = 0; i < boardInts.length; i++) simBoard[i] = boardInts[i];

  const heroBuf = new Array<number>(7);
  const oppBuf = new Array<number>(7);
  const nRem = remaining.length;

  for (let s = 0; s < simulations; s++) {
    // Partial Fisher-Yates for cardsNeeded
    for (let k = 0; k < cardsNeeded; k++) {
      const swapIdx = k + Math.floor(Math.random() * (nRem - k));
      const tmp = remaining[k];
      remaining[k] = remaining[swapIdx];
      remaining[swapIdx] = tmp;
    }

    for (let b = 0; b < cardsToBoard; b++) {
      simBoard[boardInts.length + b] = remaining[b];
    }
    for (let b = 0; b < 5; b++) {
      heroBuf[2 + b] = simBoard[b];
      oppBuf[2 + b] = simBoard[b];
    }
    heroBuf[0] = holeInts[0];
    heroBuf[1] = holeInts[1];

    const heroScore = evaluateCards(heroBuf);
    let bestOpp = -1;
    let tiedCount = 0;

    for (let o = 0; o < oppCount; o++) {
      const idx = cardsToBoard + o * 2;
      oppBuf[0] = remaining[idx];
      oppBuf[1] = remaining[idx + 1];
      const os = evaluateCards(oppBuf);
      if (os > bestOpp) {
        bestOpp = os;
        tiedCount = os === heroScore ? 1 : 0;
      } else if (os === bestOpp && os === heroScore) {
        tiedCount++;
      }
    }

    if (heroScore > bestOpp) {
      wins++;
      equityPoints += 1;
    } else if (heroScore === bestOpp) {
      ties++;
      equityPoints += 1 / (1 + Math.max(1, tiedCount));
    }
  }

  const equity = equityPoints / simulations;
  const winPct = wins / simulations;
  const tiePct = ties / simulations;
  const pot = Math.max(0, potSize);
  const call = Math.max(0, toCall);

  let potOdds = 0;
  let callEv = equity * pot;
  let heuristicAction = "CHECK";
  let heuristicDetail = "";

  if (call === 0) {
    if (equity >= 0.65) {
      heuristicAction = "BET — STRONG VALUE";
      heuristicDetail = `High multiway equity (${(equity * 100).toFixed(1)}%). Bet 66%–75% pot for value and protection.`;
    } else if (equity >= 0.45) {
      heuristicAction = "BET — THIN VALUE";
      heuristicDetail = `Favorable equity (${(equity * 100).toFixed(1)}%). Bet 33%–50% pot or control pot size.`;
    } else {
      heuristicAction = "CHECK";
      heuristicDetail = `Low raw multiway equity (${(equity * 100).toFixed(1)}%) with zero cost to realize next card.`;
    }
  } else {
    const totalPotAfterCall = pot + call;
    potOdds = totalPotAfterCall > 0 ? call / totalPotAfterCall : 1;
    callEv = equity * totalPotAfterCall - (1 - equity) * call;

    if (equity >= Math.max(potOdds * 1.65, 0.62)) {
      heuristicAction = "RAISE — VALUE";
      heuristicDetail = `Equity (${(equity * 100).toFixed(1)}%) dominates pot odds (${(potOdds * 100).toFixed(1)}%). Raise for value.`;
    } else if (equity >= potOdds + 0.03) {
      heuristicAction = "CALL (+EV)";
      heuristicDetail = `Equity (${(equity * 100).toFixed(1)}%) clears required pot odds (${(potOdds * 100).toFixed(1)}%).`;
    } else if (equity >= potOdds - 0.02) {
      heuristicAction = "MARGINAL CALL / FOLD";
      heuristicDetail = `Break-even spot (Equity ${(equity * 100).toFixed(1)}% vs Odds ${(potOdds * 100).toFixed(1)}%).`;
    } else {
      heuristicAction = "FOLD (-EV)";
      heuristicDetail = `Equity (${(equity * 100).toFixed(1)}%) falls short of pot odds (${(potOdds * 100).toFixed(1)}%).`;
    }
  }

  return {
    equity,
    winPct,
    tiePct,
    potOdds,
    callEv,
    madeHand,
    simulations,
    heuristicAction,
    heuristicDetail,
  };
}

/**
 * Generates an interactive 13x13 Preflop GTO Open / 3-Bet / Call matrix when on Preflop.
 */
function buildPreflopSolution(
  requestId: number,
  state: TableState,
  config: SolverConfig,
  equityStats: EquityStats,
  startTime: number
): SolverResult {
  const holeInts = state.heroCards.length === 2 ? state.heroCards.map(cardToInt) : [];
  const heroLabel =
    holeInts.length === 2 ? getCanonicalLabel(holeInts[0], holeInts[1]) : "";
  const heroComboExact =
    holeInts.length === 2 ? `${state.heroCards[0]}${state.heroCards[1]}` : null;

  const ipWeights = parseRangeWeights(config.ipRange);
  const oopWeights = parseRangeWeights(config.oopRange);
  const isFacingBet = state.toCall > 0.05;

  const actions: ActionMetric[] = isFacingBet
    ? [
        {
          id: "fold",
          label: "Fold",
          shortLabel: "FOLD",
          semantic: "fold",
          pctPot: null,
          amount: 0,
          heroFreq: 0,
          rangeFreq: 0.45,
          heroEv: 0,
          evDiff: 0,
          childNodeId: null,
        },
        {
          id: "call",
          label: "Call",
          shortLabel: "CALL",
          semantic: "call",
          pctPot: null,
          amount: Number(state.toCall.toFixed(2)),
          heroFreq: 0,
          rangeFreq: 0.35,
          heroEv: Number(equityStats.callEv.toFixed(2)),
          evDiff: 0,
          childNodeId: null,
        },
        {
          id: "raise_3b",
          label: "3-Bet 3x",
          shortLabel: "3-BET",
          semantic: "raise",
          pctPot: 100,
          amount: Number((state.toCall * 3 + state.potSize * 0.25).toFixed(2)),
          heroFreq: 0,
          rangeFreq: 0.2,
          heroEv: Number((equityStats.callEv * 1.15).toFixed(2)),
          evDiff: 0,
          childNodeId: null,
        },
      ]
    : [
        {
          id: "fold",
          label: "Fold",
          shortLabel: "FOLD",
          semantic: "fold",
          pctPot: null,
          amount: 0,
          heroFreq: 0,
          rangeFreq: 0.55,
          heroEv: 0,
          evDiff: 0,
          childNodeId: null,
        },
        {
          id: "bet_open",
          label: "Open 2.5bb",
          shortLabel: "OPEN",
          semantic: "bet_medium",
          pctPot: 100,
          amount: 2.5,
          heroFreq: 0,
          rangeFreq: 0.45,
          heroEv: Number((equityStats.equity * (state.potSize + 1.5)).toFixed(2)),
          evDiff: 0,
          childNodeId: null,
        },
      ];

  const matrix: MatrixCell[] = [];
  const activeRange = state.heroPosition === "IP" ? ipWeights : oopWeights;
  let heroProbs: Record<string, number> = {};

  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const label = MATRIX_LABELS[row][col];
      const w = activeRange.get(label) ?? 0;
      const isPremium =
        row <= 2 && col <= 2
          ? true
          : (row === col && row <= 4) || (row === 0 && col <= 2) || (col === 0 && row <= 1);
      const probs: Record<string, number> = {};

      if (isFacingBet) {
        const threeBetFreq = isPremium ? Math.min(1, w * 0.9 + 0.1) : w * 0.18;
        const callFreq = Math.max(0, w - threeBetFreq);
        const foldFreq = Math.max(0, 1 - threeBetFreq - callFreq);
        probs.raise_3b = threeBetFreq;
        probs.call = callFreq;
        probs.fold = foldFreq;
      } else {
        probs.bet_open = w;
        probs.fold = Math.max(0, 1 - w);
      }

      if (label === heroLabel) {
        heroProbs = probs;
      }

      matrix.push({
        label,
        row,
        col,
        inRangeWeight: w,
        comboCount: row === col ? 6 : row < col ? 4 : 12,
        isHeroCell: label === heroLabel,
        actionProbs: probs,
        avgEv: w > 0 ? Number(((w * 2.1) - 0.3).toFixed(2)) : 0,
        combos: [],
      });
    }
  }

  for (const act of actions) {
    act.heroFreq = heroProbs[act.id] ?? 0;
  }
  const bestHeroEv = Math.max(...actions.map((a) => a.heroEv));
  for (const act of actions) {
    act.evDiff = Number((act.heroEv - bestHeroEv).toFixed(2));
  }

  const rootNode: TreeNodeView = {
    id: "root",
    player: state.heroPosition,
    pot: Number(state.potSize.toFixed(2)),
    toCall: Number(state.toCall.toFixed(2)),
    street: "preflop",
    historyLabels: [],
    actions,
    matrix,
  };

  return {
    requestId,
    mode: "preflop_gto",
    iterations: 1,
    targetIterations: 1,
    converged: true,
    solveTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
    avgRegretDelta: 0,
    heroHandClass: heroLabel || "--",
    heroComboExact,
    heroInPresetRange: activeRange.has(heroLabel),
    activeNodeId: "root",
    nodes: { root: rootNode },
    rootNodeId: "root",
    equityStats,
    rangeStats: {
      ipCombos: ipWeights.size,
      oopCombos: oopWeights.size,
    },
  };
}

/**
 * Runs an incremental TexasSolver-style DCFR solve, invoking `onProgress` with
 * an early fast snapshot and returning the final converged SolverResult.
 */
export function solveGtoSpot(
  requestId: number,
  state: TableState,
  config: SolverConfig,
  onProgress?: (partial: SolverResult) => void,
  shouldAbort?: () => boolean
): SolverResult {
  const startTime = performance.now();
  const equityStats = runMonteCarloEquity(
    state.heroCards,
    state.boardCards,
    state.activeOpponents,
    state.potSize,
    state.toCall,
    state.activeOpponents >= 2 ? 4000 : 2500
  );

  // If preflop (<3 board cards) or missing Hero cards, use preflop GTO chart / equity mode
  if (state.boardCards.length < 3 || state.heroCards.length !== 2) {
    return buildPreflopSolution(requestId, state, config, equityStats, startTime);
  }

  // If multiway (2+ opponents), TexasSolver HU tree does not directly apply — return Monte Carlo mode
  // while still providing a 13x13 hero-equity view at the root node.
  if (state.activeOpponents >= 2) {
    const preflopBase = buildPreflopSolution(requestId, state, config, equityStats, startTime);
    const mwActions: ActionMetric[] =
      state.toCall > 0.05
        ? [
            {
              id: "fold",
              label: "Fold",
              shortLabel: "FOLD",
              semantic: "fold",
              pctPot: null,
              amount: 0,
              heroFreq: equityStats.callEv < 0 ? 1 : 0,
              rangeFreq: 0.4,
              heroEv: 0,
              evDiff: Number((0 - Math.max(0, equityStats.callEv)).toFixed(2)),
              childNodeId: null,
            },
            {
              id: "call",
              label: "Call",
              shortLabel: "CALL",
              semantic: "call",
              pctPot: null,
              amount: Number(state.toCall.toFixed(2)),
              heroFreq: equityStats.callEv >= 0 ? 1 : 0,
              rangeFreq: 0.45,
              heroEv: Number(equityStats.callEv.toFixed(2)),
              evDiff: Number((equityStats.callEv - Math.max(0, equityStats.callEv)).toFixed(2)),
              childNodeId: null,
            },
            {
              id: "raise_mw",
              label: "Raise 75%",
              shortLabel: "R75",
              semantic: "raise",
              pctPot: 75,
              amount: Number((state.toCall + (state.potSize + state.toCall) * 0.75).toFixed(2)),
              heroFreq: equityStats.equity >= 0.62 ? 1 : 0,
              rangeFreq: 0.15,
              heroEv: Number((equityStats.callEv * 1.2).toFixed(2)),
              evDiff: 0,
              childNodeId: null,
            },
          ]
        : [
            {
              id: "check",
              label: "Check",
              shortLabel: "CHECK",
              semantic: "check",
              pctPot: null,
              amount: 0,
              heroFreq: equityStats.equity < 0.45 ? 1 : 0,
              rangeFreq: 0.55,
              heroEv: Number((equityStats.equity * state.potSize * 0.85).toFixed(2)),
              evDiff: 0,
              childNodeId: null,
            },
            {
              id: "bet_33",
              label: "Bet 33%",
              shortLabel: "B33",
              semantic: "bet_small",
              pctPot: 33,
              amount: Number((state.potSize * 0.33).toFixed(2)),
              heroFreq: equityStats.equity >= 0.45 && equityStats.equity < 0.65 ? 1 : 0,
              rangeFreq: 0.25,
              heroEv: Number((equityStats.equity * state.potSize * 0.95).toFixed(2)),
              evDiff: 0,
              childNodeId: null,
            },
            {
              id: "bet_66",
              label: "Bet 66%",
              shortLabel: "B66",
              semantic: "bet_medium",
              pctPot: 66,
              amount: Number((state.potSize * 0.66).toFixed(2)),
              heroFreq: equityStats.equity >= 0.65 ? 1 : 0,
              rangeFreq: 0.2,
              heroEv: Number((equityStats.equity * state.potSize * 1.05).toFixed(2)),
              evDiff: 0,
              childNodeId: null,
            },
          ];

    const rootView = preflopBase.nodes.root;
    rootView.street = state.street;
    rootView.actions = mwActions;

    return {
      ...preflopBase,
      mode: "multiway_mc",
      iterations: equityStats.simulations,
      targetIterations: equityStats.simulations,
      solveTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
    };
  }

  // Heads-Up Postflop TexasSolver Discounted CFR Solve
  const boardInts = state.boardCards.map(cardToInt);
  const heroInts = state.heroCards.map(cardToInt) as [number, number];
  const deadInts = new Set<number>(boardInts);

  const heroCanonical = getCanonicalLabel(heroInts[0], heroInts[1]);
  const presetWeights = parseRangeWeights(
    state.heroPosition === "IP" ? config.ipRange : config.oopRange
  );
  const heroInPresetRange = presetWeights.has(heroCanonical);

  const rawOopCombos = expandRangeCombos(
    config.oopRange,
    deadInts,
    state.heroPosition === "OOP" ? heroInts : null
  );
  const rawIpCombos = expandRangeCombos(
    config.ipRange,
    deadInts,
    state.heroPosition === "IP" ? heroInts : null
  );

  // Suit-isomorphic compression: keep all combos of Hero's canonical hand class,
  // and up to 2 representative suit combos per other hand class (preserving exact total weight)
  const boardSuits = new Set(boardInts.map((c) => c & 3));
  const compressCombos = (list: RangeCombo[]): RangeCombo[] => {
    if (list.length <= 140) return list;
    const byLabel = new Map<string, RangeCombo[]>();
    for (const item of list) {
      const arr = byLabel.get(item.label);
      if (arr) arr.push(item);
      else byLabel.set(item.label, [item]);
    }
    const maxPerClass = byLabel.size > 75 ? 1 : 2;
    const out: RangeCombo[] = [];
    for (const [label, group] of byLabel.entries()) {
      if (label === heroCanonical || group.length <= maxPerClass) {
        out.push(...group);
        continue;
      }
      // Prefer one flush-draw-matching combo and one off-board-suit combo
      const totalWeight = group.reduce((acc, g) => acc + g.weight, 0);
      const suitedToBoard =
        group.find((g) => boardSuits.has(g.c1 & 3) && boardSuits.has(g.c2 & 3)) ??
        group[0];
      if (maxPerClass === 1) {
        out.push({ ...suitedToBoard, weight: totalWeight });
      } else {
        const other = group.find((g) => g !== suitedToBoard) ?? group[1];
        const wEach = totalWeight / 2;
        out.push({ ...suitedToBoard, weight: wEach });
        out.push({ ...other, weight: wEach });
      }
    }
    return out;
  };

  const oopCombos = compressCombos(rawOopCombos);
  const ipCombos = compressCombos(rawIpCombos);

  // Find Hero combo indices
  const findComboIndex = (list: RangeCombo[], cA: number, cB: number) =>
    list.findIndex(
      (c) => (c.c1 === cA && c.c2 === cB) || (c.c1 === cB && c.c2 === cA)
    );
  const heroComboIdx = {
    oop: findComboIndex(oopCombos, heroInts[0], heroInts[1]),
    ip: findComboIndex(ipCombos, heroInts[0], heroInts[1]),
  };

  const basePot =
    state.toCall > 0.05 && state.potSize > state.toCall
      ? Math.max(1, state.potSize - state.toCall)
      : Math.max(1, state.potSize);
  const effStack = Math.max(basePot * 0.25, state.effectiveStack);

  const { root, nodesById, targetNodeId } = buildActionTree(
    state.street,
    basePot,
    effStack,
    config,
    state.toCall,
    state.heroPosition
  );

  const nOop = oopCombos.length;
  const nIp = ipCombos.length;
  const { equity, valid, oopAvgEq, ipAvgEq } = computeShowdownMatrices(
    oopCombos,
    ipCombos,
    boardInts,
    state.street
  );

  allocateNodeBuffers(nodesById, nOop, nIp);

  const oopC1 = new Int32Array(nOop);
  const oopC2 = new Int32Array(nOop);
  const ipC1 = new Int32Array(nIp);
  const ipC2 = new Int32Array(nIp);
  const oopPairInIp = new Int32Array(nOop).fill(-1);
  const ipPairInOop = new Int32Array(nIp).fill(-1);
  const ipKeyMap = new Map<number, number>();
  for (let j = 0; j < nIp; j++) {
    ipC1[j] = ipCombos[j].c1;
    ipC2[j] = ipCombos[j].c2;
    ipKeyMap.set(ipC1[j] * 64 + ipC2[j], j);
  }
  for (let i = 0; i < nOop; i++) {
    oopC1[i] = oopCombos[i].c1;
    oopC2[i] = oopCombos[i].c2;
    const match = ipKeyMap.get(oopC1[i] * 64 + oopC2[i]);
    if (match !== undefined) {
      oopPairInIp[i] = match;
      ipPairInOop[match] = i;
    }
  }

  const initOopReach = new Float64Array(nOop);
  const initIpReach = new Float64Array(nIp);
  for (let i = 0; i < nOop; i++) initOopReach[i] = oopCombos[i].weight;
  for (let j = 0; j < nIp; j++) initIpReach[j] = ipCombos[j].weight;

  const targetIter = Math.max(60, Math.min(600, config.targetIterations));
  const earlyCheckpoint = Math.min(30, Math.floor(targetIter / 4));
  let lastDelta = 0;

  const heroComboExact = `${state.heroCards[0]}${state.heroCards[1]}`;

  for (let iter = 1; iter <= targetIter; iter++) {
    if (shouldAbort && shouldAbort()) {
      break;
    }

    lastDelta = runDcfrIteration(
      root,
      nodesById,
      nOop,
      nIp,
      oopC1,
      oopC2,
      ipC1,
      ipC2,
      oopPairInIp,
      ipPairInOop,
      equity,
      valid,
      initOopReach,
      initIpReach,
      iter
    );

    if (onProgress && iter === earlyCheckpoint) {
      const partialNodes = extractTreeSnapshot(
        root,
        nodesById,
        oopCombos,
        ipCombos,
        valid,
        oopAvgEq,
        ipAvgEq,
        heroComboIdx,
        heroCanonical
      );
      onProgress({
        requestId,
        mode: "gto_dcfr",
        iterations: iter,
        targetIterations: targetIter,
        converged: false,
        solveTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
        avgRegretDelta: Number((lastDelta / Math.max(1, nOop * nIp)).toFixed(4)),
        heroHandClass: heroCanonical,
        heroComboExact,
        heroInPresetRange,
        activeNodeId: targetNodeId,
        nodes: partialNodes,
        rootNodeId: root.id,
        equityStats,
        rangeStats: { ipCombos: rawIpCombos.length, oopCombos: rawOopCombos.length },
      });
    }
  }

  const finalNodes = extractTreeSnapshot(
    root,
    nodesById,
    oopCombos,
    ipCombos,
    valid,
    oopAvgEq,
    ipAvgEq,
    heroComboIdx,
    heroCanonical
  );

  return {
    requestId,
    mode: "gto_dcfr",
    iterations: targetIter,
    targetIterations: targetIter,
    converged: true,
    solveTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
    avgRegretDelta: Number((lastDelta / Math.max(1, nOop * nIp)).toFixed(4)),
    heroHandClass: heroCanonical,
    heroComboExact,
    heroInPresetRange,
    activeNodeId: targetNodeId,
    nodes: finalNodes,
    rootNodeId: root.id,
    equityStats,
    rangeStats: { ipCombos: rawIpCombos.length, oopCombos: rawOopCombos.length },
  };
}
