export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const RANKS_DESC = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export const SUITS = ["s", "h", "d", "c"] as const;

export const SUIT_SYMBOLS: Record<string, string> = {
  s: "\u2660",
  h: "\u2665",
  d: "\u2666",
  c: "\u2663",
};

const RANK_INDEX: Record<string, number> = {
  "2": 0,
  "3": 1,
  "4": 2,
  "5": 3,
  "6": 4,
  "7": 5,
  "8": 6,
  "9": 7,
  T: 8,
  J: 9,
  Q: 10,
  K: 11,
  A: 12,
};

const SUIT_INDEX: Record<string, number> = {
  s: 0,
  h: 1,
  d: 2,
  c: 3,
};

export function normalizeCard(raw: string): string | null {
  let s = raw.trim();
  if (s.startsWith("10")) s = "T" + s.slice(2);
  if (s.length !== 2) return null;
  const r = s[0].toUpperCase();
  const suit = s[1].toLowerCase();
  if (RANK_INDEX[r] === undefined || SUIT_INDEX[suit] === undefined) return null;
  return `${r}${suit}`;
}

export function cardToInt(card: string): number {
  const norm = normalizeCard(card);
  if (!norm) throw new Error(`Invalid card: ${card}`);
  return RANK_INDEX[norm[0]] * 4 + SUIT_INDEX[norm[1]];
}

export function intToCard(idx: number): string {
  const rank = RANKS[Math.floor(idx / 4)];
  const suit = SUITS[idx % 4];
  return `${rank}${suit}`;
}

export function getCanonicalLabel(c1Int: number, c2Int: number): string {
  const r1 = Math.floor(c1Int / 4);
  const s1 = c1Int % 4;
  const r2 = Math.floor(c2Int / 4);
  const s2 = c2Int % 4;
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  if (high === low) return `${RANKS[high]}${RANKS[low]}`;
  return `${RANKS[high]}${RANKS[low]}${s1 === s2 ? "s" : "o"}`;
}

export function getMatrixCellCoords(label: string): { row: number; col: number } {
  const r1 = RANKS_DESC.indexOf(label[0] as (typeof RANKS_DESC)[number]);
  const r2 = RANKS_DESC.indexOf(label[1] as (typeof RANKS_DESC)[number]);
  if (r1 === -1 || r2 === -1) return { row: 0, col: 0 };
  if (label.length === 2 || r1 === r2) return { row: r1, col: r1 };
  if (label[2] === "s") return { row: Math.min(r1, r2), col: Math.max(r1, r2) };
  return { row: Math.max(r1, r2), col: Math.min(r1, r2) };
}

export const MATRIX_LABELS: string[][] = RANKS_DESC.map((rRow, rowIdx) =>
  RANKS_DESC.map((rCol, colIdx) => {
    if (rowIdx === colIdx) return `${rRow}${rCol}`;
    if (rowIdx < colIdx) return `${rRow}${rCol}s`;
    return `${rCol}${rRow}o`;
  })
);

/**
 * Fast exact 5-to-7-card evaluator returning a monotonically increasing integer score.
 * Bit layout: (category << 20) | (k0 << 16) | (k1 << 12) | (k2 << 8) | (k3 << 4) | k4
 * Categories: 8=SF, 7=Quads, 6=FH, 5=Flush, 4=Straight, 3=Trips, 2=TwoPair, 1=Pair, 0=HighCard
 */
export function evaluateCards(cards: number[]): number {
  const n = cards.length;
  if (n < 5) return 0;

  const rankCounts = new Int32Array(13);
  const suitCounts = new Int32Array(4);
  const suitRankMask = new Int32Array(4);
  let rankMask = 0;

  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const r = c >> 2;
    const s = c & 3;
    rankCounts[r]++;
    suitCounts[s]++;
    suitRankMask[s] |= 1 << r;
    rankMask |= 1 << r;
  }

  const findStraightHigh = (mask: number): number => {
    // Check A-high down to 6-high
    for (let high = 12; high >= 4; high--) {
      const seq = 0x1f << (high - 4);
      if ((mask & seq) === seq) return high;
    }
    // Wheel: A-2-3-4-5 -> bits 12, 0, 1, 2, 3
    if ((mask & 0x100f) === 0x100f) return 3;
    return -1;
  };

  // Check flush / straight flush
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) {
    if (suitCounts[s] >= 5) {
      flushSuit = s;
      break;
    }
  }

  if (flushSuit !== -1) {
    const fMask = suitRankMask[flushSuit];
    const sfHigh = findStraightHigh(fMask);
    if (sfHigh !== -1) {
      return (8 << 20) | (sfHigh << 16);
    }
  }

  let quadRank = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;

  for (let r = 12; r >= 0; r--) {
    const cnt = rankCounts[r];
    if (cnt === 4) {
      quadRank = r;
    } else if (cnt === 3) {
      if (trip1 === -1) trip1 = r;
      else if (trip2 === -1) trip2 = r;
    } else if (cnt === 2) {
      if (pair1 === -1) pair1 = r;
      else if (pair2 === -1) pair2 = r;
    }
  }

  // Four of a kind
  if (quadRank !== -1) {
    let kicker = 0;
    for (let r = 12; r >= 0; r--) {
      if (r !== quadRank && rankCounts[r] > 0) {
        kicker = r;
        break;
      }
    }
    return (7 << 20) | (quadRank << 16) | (kicker << 12);
  }

  // Full House
  if (trip1 !== -1 && (trip2 !== -1 || pair1 !== -1)) {
    const fhPair = trip2 !== -1 ? Math.max(trip2, pair1) : pair1;
    return (6 << 20) | (trip1 << 16) | (fhPair << 12);
  }

  // Flush
  if (flushSuit !== -1) {
    const fMask = suitRankMask[flushSuit];
    let score = 5 << 20;
    let shift = 16;
    for (let r = 12; r >= 0 && shift >= 0; r--) {
      if ((fMask & (1 << r)) !== 0) {
        score |= r << shift;
        shift -= 4;
      }
    }
    return score;
  }

  // Straight
  const stHigh = findStraightHigh(rankMask);
  if (stHigh !== -1) {
    return (4 << 20) | (stHigh << 16);
  }

  // Trips
  if (trip1 !== -1) {
    let k1 = 0;
    let k2 = 0;
    let found = 0;
    for (let r = 12; r >= 0; r--) {
      if (r !== trip1 && rankCounts[r] > 0) {
        if (found === 0) k1 = r;
        else {
          k2 = r;
          break;
        }
        found++;
      }
    }
    return (3 << 20) | (trip1 << 16) | (k1 << 12) | (k2 << 8);
  }

  // Two Pair
  if (pair1 !== -1 && pair2 !== -1) {
    let kicker = 0;
    for (let r = 12; r >= 0; r--) {
      if (r !== pair1 && r !== pair2 && rankCounts[r] > 0) {
        kicker = r;
        break;
      }
    }
    return (2 << 20) | (pair1 << 16) | (pair2 << 12) | (kicker << 8);
  }

  // One Pair
  if (pair1 !== -1) {
    let score = (1 << 20) | (pair1 << 16);
    let shift = 12;
    for (let r = 12; r >= 0 && shift >= 4; r--) {
      if (r !== pair1 && rankCounts[r] > 0) {
        score |= r << shift;
        shift -= 4;
      }
    }
    return score;
  }

  // High Card
  let score = 0;
  let shift = 16;
  for (let r = 12; r >= 0 && shift >= 0; r--) {
    if (rankCounts[r] > 0) {
      score |= r << shift;
      shift -= 4;
    }
  }
  return score;
}

export function describeMadeHand(holeCards: string[], boardCards: string[]): string {
  if (holeCards.length !== 2) return "Waiting for Hand";
  if (boardCards.length < 3) {
    const r1 = holeCards[0][0];
    const r2 = holeCards[1][0];
    if (r1 === r2) return `Pocket ${r1 === "T" ? "10" : r1}s`;
    return holeCards[0][1] === holeCards[1][1] ? "Preflop Suited" : "Preflop Offsuit";
  }

  const allInts = [...holeCards, ...boardCards].map(cardToInt);
  const score = evaluateCards(allInts);
  const cat = score >> 20;
  const highRank = (score >> 16) & 0xf;

  switch (cat) {
    case 8:
      return highRank === 12 ? "Royal Flush" : "Straight Flush";
    case 7:
      return "Four of a Kind";
    case 6:
      return "Full House";
    case 5:
      return "Flush";
    case 4:
      return "Straight";
    case 3:
      return "Three of a Kind";
    case 2:
      return "Two Pair";
    case 1:
      return "One Pair";
    default:
      return "High Card";
  }
}

export function parseRangeWeights(rangeStr: string): Map<string, number> {
  const weights = new Map<string, number>();
  const tokens = rangeStr
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const [handPartRaw, weightPart] = token.split(":");
    const weight = weightPart !== undefined ? Math.max(0, Math.min(1, parseFloat(weightPart))) : 1.0;
    if (Number.isNaN(weight) || weight <= 0) continue;

    const handPart = handPartRaw.trim();
    if (handPart.length === 2) {
      const r1 = handPart[0].toUpperCase();
      const r2 = handPart[1].toUpperCase();
      if (RANK_INDEX[r1] === undefined || RANK_INDEX[r2] === undefined) continue;
      if (r1 === r2) {
        weights.set(`${r1}${r2}`, weight);
      } else {
        const hi = RANK_INDEX[r1] > RANK_INDEX[r2] ? r1 : r2;
        const lo = RANK_INDEX[r1] > RANK_INDEX[r2] ? r2 : r1;
        weights.set(`${hi}${lo}s`, weight);
        weights.set(`${hi}${lo}o`, weight);
      }
    } else if (handPart.length === 3) {
      const r1 = handPart[0].toUpperCase();
      const r2 = handPart[1].toUpperCase();
      const type = handPart[2].toLowerCase();
      if (RANK_INDEX[r1] === undefined || RANK_INDEX[r2] === undefined) continue;
      if (type !== "s" && type !== "o") continue;
      const hi = RANK_INDEX[r1] > RANK_INDEX[r2] ? r1 : r2;
      const lo = RANK_INDEX[r1] > RANK_INDEX[r2] ? r2 : r1;
      weights.set(`${hi}${lo}${type}`, weight);
    }
  }
  return weights;
}

export function serializeRangeWeights(weights: Map<string, number>): string {
  const parts: string[] = [];
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const label = MATRIX_LABELS[row][col];
      const w = weights.get(label) ?? 0;
      if (w > 0.001) {
        parts.push(w >= 0.999 ? label : `${label}:${Number(w.toFixed(2))}`);
      }
    }
  }
  return parts.join(",");
}

export interface RangeCombo {
  c1: number;
  c2: number;
  comboStr: string;
  label: string;
  weight: number;
}

export function expandRangeCombos(
  rangeStr: string,
  deadCardInts: Set<number>,
  mustIncludeCombo?: [number, number] | null
): RangeCombo[] {
  const weights = parseRangeWeights(rangeStr);
  const combos: RangeCombo[] = [];
  let heroIncluded = false;

  for (let c1 = 0; c1 < 52; c1++) {
    if (deadCardInts.has(c1)) continue;
    for (let c2 = c1 + 1; c2 < 52; c2++) {
      if (deadCardInts.has(c2)) continue;
      const label = getCanonicalLabel(c1, c2);
      const w = weights.get(label) ?? 0;
      const isHero =
        mustIncludeCombo !== undefined &&
        mustIncludeCombo !== null &&
        ((c1 === mustIncludeCombo[0] && c2 === mustIncludeCombo[1]) ||
          (c1 === mustIncludeCombo[1] && c2 === mustIncludeCombo[0]));

      if (w > 0 || isHero) {
        if (isHero) heroIncluded = true;
        // Higher card first for display string
        const r1 = c1 >> 2;
        const r2 = c2 >> 2;
        const hi = r1 >= r2 ? c1 : c2;
        const lo = r1 >= r2 ? c2 : c1;
        combos.push({
          c1,
          c2,
          comboStr: `${intToCard(hi)}${intToCard(lo)}`,
          label,
          weight: w > 0 ? w : 1.0,
        });
      }
    }
  }

  if (mustIncludeCombo && !heroIncluded) {
    const [a, b] = mustIncludeCombo;
    const c1 = Math.min(a, b);
    const c2 = Math.max(a, b);
    if (!deadCardInts.has(c1) && !deadCardInts.has(c2)) {
      const hi = (c1 >> 2) >= (c2 >> 2) ? c1 : c2;
      const lo = (c1 >> 2) >= (c2 >> 2) ? c2 : c1;
      combos.push({
        c1,
        c2,
        comboStr: `${intToCard(hi)}${intToCard(lo)}`,
        label: getCanonicalLabel(c1, c2),
        weight: 1.0,
      });
    }
  }

  return combos;
}
