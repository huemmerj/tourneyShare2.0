import type { Participant } from "./types";

export type MatchRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  round_label: string | null;
  match_number: number;
  bracket: "winners" | "losers" | "grand_final";
  participant_a_id: string | null;
  participant_b_id: string | null;
  status: "scheduled" | "bye";
  winner_id: string | null;
  next_winner_match_id: string | null;
  next_loser_match_id: string | null;
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// Standard seeding: seedSlots(8) → [1,8,5,4,3,6,7,2]
function seedSlots(size: number): number[] {
  if (size === 1) return [1];
  const prev = seedSlots(size / 2);
  return prev.flatMap((x) => [x, size + 1 - x]);
}

function uuid(): string {
  return crypto.randomUUID();
}

function seLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round + 1;
  if (fromEnd === 1) return "Final";
  if (fromEnd === 2) return "Semi-final";
  if (fromEnd === 3) return "Quarter-final";
  return `Round of ${Math.pow(2, fromEnd)}`;
}

function sortedBySeeed(participants: Participant[]): Participant[] {
  return [...participants].sort((a, b) => {
    if (a.seed !== null && b.seed !== null) return a.seed - b.seed;
    if (a.seed !== null) return -1;
    if (b.seed !== null) return 1;
    return a.id.localeCompare(b.id);
  });
}

// ─── Single Elimination ───────────────────────────────────────────────────────

export function generateSingleElim(
  tournamentId: string,
  participants: Participant[]
): MatchRow[] {
  const sorted = sortedBySeeed(participants);
  const n = sorted.length;
  const size = nextPow2(n);
  const totalRounds = Math.log2(size);
  const slots = seedSlots(size);

  const getP = (seed: number) => (seed <= n ? sorted[seed - 1].id : null);

  const rounds: MatchRow[][] = [];

  // Round 1
  const r1: MatchRow[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const pA = getP(slots[i]);
    const pB = getP(slots[i + 1]);
    const bye = pA === null || pB === null;
    r1.push({
      id: uuid(),
      tournament_id: tournamentId,
      round_number: 1,
      round_label: seLabel(1, totalRounds),
      match_number: i / 2 + 1,
      bracket: "winners",
      participant_a_id: pA,
      participant_b_id: pB,
      status: bye ? "bye" : "scheduled",
      winner_id: bye ? (pA ?? pB) : null,
      next_winner_match_id: null,
      next_loser_match_id: null,
    });
  }
  rounds.push(r1);

  // Future rounds (TBD slots)
  for (let round = 2; round <= totalRounds; round++) {
    const count = Math.pow(2, totalRounds - round);
    const rnd: MatchRow[] = [];
    for (let i = 0; i < count; i++) {
      rnd.push({
        id: uuid(),
        tournament_id: tournamentId,
        round_number: round,
        round_label: seLabel(round, totalRounds),
        match_number: i + 1,
        bracket: "winners",
        participant_a_id: null,
        participant_b_id: null,
        status: "scheduled",
        winner_id: null,
        next_winner_match_id: null,
        next_loser_match_id: null,
      });
    }
    rounds.push(rnd);
  }

  // Link next_winner_match_id
  for (let r = 0; r < rounds.length - 1; r++) {
    for (let i = 0; i < rounds[r].length; i++) {
      rounds[r][i].next_winner_match_id = rounds[r + 1][Math.floor(i / 2)].id;
    }
  }

  // Propagate bye winners into next-round slots
  if (rounds.length > 1) {
    for (let i = 0; i < rounds[0].length; i++) {
      const m = rounds[0][i];
      if (m.status === "bye" && m.winner_id) {
        const next = rounds[1][Math.floor(i / 2)];
        if (i % 2 === 0) next.participant_a_id = m.winner_id;
        else next.participant_b_id = m.winner_id;
      }
    }
  }

  return rounds.flat();
}

// ─── Double Elimination ───────────────────────────────────────────────────────

export function generateDoubleElim(
  tournamentId: string,
  participants: Participant[]
): MatchRow[] {
  const sorted = sortedBySeeed(participants);
  const n = sorted.length;
  const size = nextPow2(n);
  const wRounds = Math.log2(size); // number of W bracket rounds
  const getP = (seed: number) => (seed <= n ? sorted[seed - 1].id : null);
  const slots = seedSlots(size);
  const all: MatchRow[] = [];

  // ── W bracket ──
  const wByRound: MatchRow[][] = [];

  const wR1: MatchRow[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const pA = getP(slots[i]);
    const pB = getP(slots[i + 1]);
    const bye = pA === null || pB === null;
    wR1.push({
      id: uuid(),
      tournament_id: tournamentId,
      round_number: 1,
      round_label: `W Round 1`,
      match_number: i / 2 + 1,
      bracket: "winners",
      participant_a_id: pA,
      participant_b_id: pB,
      status: bye ? "bye" : "scheduled",
      winner_id: bye ? (pA ?? pB) : null,
      next_winner_match_id: null,
      next_loser_match_id: null,
    });
  }
  wByRound.push(wR1);

  for (let r = 2; r <= wRounds; r++) {
    const count = Math.pow(2, wRounds - r);
    const rnd: MatchRow[] = [];
    const label = r === wRounds ? "W Final" : `W Round ${r}`;
    for (let i = 0; i < count; i++) {
      rnd.push({
        id: uuid(),
        tournament_id: tournamentId,
        round_number: r,
        round_label: label,
        match_number: i + 1,
        bracket: "winners",
        participant_a_id: null,
        participant_b_id: null,
        status: "scheduled",
        winner_id: null,
        next_winner_match_id: null,
        next_loser_match_id: null,
      });
    }
    wByRound.push(rnd);
  }

  // Link W bracket next_winner
  for (let r = 0; r < wByRound.length - 1; r++) {
    for (let i = 0; i < wByRound[r].length; i++) {
      wByRound[r][i].next_winner_match_id =
        wByRound[r + 1][Math.floor(i / 2)].id;
    }
  }

  // Propagate W R1 byes
  if (wByRound.length > 1) {
    for (let i = 0; i < wByRound[0].length; i++) {
      const m = wByRound[0][i];
      if (m.status === "bye" && m.winner_id) {
        const next = wByRound[1][Math.floor(i / 2)];
        if (i % 2 === 0) next.participant_a_id = m.winner_id;
        else next.participant_b_id = m.winner_id;
      }
    }
  }

  all.push(...wByRound.flat());

  // ── L bracket ──
  // L has 2*(wRounds-1) rounds + Grand Final
  // Odd L rounds: W-bracket losers pair up / drop in
  // Even L rounds: survivors play each other
  const lByRound: MatchRow[][] = [];
  const lRoundOffset = wRounds; // L round numbers start after W rounds

  // L Round 1: WR1 losers pair with each other
  const lr1Count = Math.max(1, wByRound[0].length / 2);
  const lr1: MatchRow[] = [];
  for (let i = 0; i < lr1Count; i++) {
    lr1.push({
      id: uuid(),
      tournament_id: tournamentId,
      round_number: lRoundOffset + 1,
      round_label: "L Round 1",
      match_number: i + 1,
      bracket: "losers",
      participant_a_id: null,
      participant_b_id: null,
      status: "scheduled",
      winner_id: null,
      next_winner_match_id: null,
      next_loser_match_id: null,
    });
    // WR1 losers slot into this match
    const src1 = wByRound[0][i * 2];
    const src2 = wByRound[0][i * 2 + 1];
    if (src1) src1.next_loser_match_id = lr1[i].id;
    if (src2) src2.next_loser_match_id = lr1[i].id;
  }
  lByRound.push(lr1);

  // Subsequent L rounds
  let prevLRound = lr1;
  for (let wDrop = 1; wDrop < wRounds - 1; wDrop++) {
    // Even L round: survivors from previous L round play each other
    const evenCount = Math.ceil(prevLRound.length / 2);
    const evenRound: MatchRow[] = [];
    const evenRoundNum = lRoundOffset + lByRound.length + 1;
    for (let i = 0; i < evenCount; i++) {
      evenRound.push({
        id: uuid(),
        tournament_id: tournamentId,
        round_number: evenRoundNum,
        round_label: `L Round ${lByRound.length + 1}`,
        match_number: i + 1,
        bracket: "losers",
        participant_a_id: null,
        participant_b_id: null,
        status: "scheduled",
        winner_id: null,
        next_winner_match_id: null,
        next_loser_match_id: null,
      });
      // link prev L round winners
      const src1 = prevLRound[i * 2];
      const src2 = prevLRound[i * 2 + 1];
      if (src1) src1.next_winner_match_id = evenRound[i].id;
      if (src2) src2.next_winner_match_id = evenRound[i].id;
    }
    lByRound.push(evenRound);
    prevLRound = evenRound;

    // Odd L round: W-round (wDrop+1) losers drop in
    const wSrc = wByRound[wDrop];
    const oddCount = prevLRound.length;
    const oddRound: MatchRow[] = [];
    const oddRoundNum = lRoundOffset + lByRound.length + 1;
    for (let i = 0; i < oddCount; i++) {
      oddRound.push({
        id: uuid(),
        tournament_id: tournamentId,
        round_number: oddRoundNum,
        round_label: `L Round ${lByRound.length + 1}`,
        match_number: i + 1,
        bracket: "losers",
        participant_a_id: null,
        participant_b_id: null,
        status: "scheduled",
        winner_id: null,
        next_winner_match_id: null,
        next_loser_match_id: null,
      });
      // prev L round winner → slot A
      if (prevLRound[i]) prevLRound[i].next_winner_match_id = oddRound[i].id;
      // W bracket loser → slot B (next_loser_match_id)
      if (wSrc && wSrc[i]) wSrc[i].next_loser_match_id = oddRound[i].id;
    }
    lByRound.push(oddRound);
    prevLRound = oddRound;
  }

  // Final L round (LB Final): last survivors vs W Final loser
  const lFinal: MatchRow = {
    id: uuid(),
    tournament_id: tournamentId,
    round_number: lRoundOffset + lByRound.length + 1,
    round_label: "L Final",
    match_number: 1,
    bracket: "losers",
    participant_a_id: null,
    participant_b_id: null,
    status: "scheduled",
    winner_id: null,
    next_winner_match_id: null,
    next_loser_match_id: null,
  };
  // last L round winner → LB Final
  if (prevLRound[0]) prevLRound[0].next_winner_match_id = lFinal.id;
  // W Final loser → LB Final
  const wFinal = wByRound[wByRound.length - 1][0];
  if (wFinal) wFinal.next_loser_match_id = lFinal.id;
  lByRound.push([lFinal]);

  all.push(...lByRound.flat());

  // ── Grand Final ──
  const gf: MatchRow = {
    id: uuid(),
    tournament_id: tournamentId,
    round_number: lRoundOffset + lByRound.length + 1,
    round_label: "Grand Final",
    match_number: 1,
    bracket: "grand_final",
    participant_a_id: null,
    participant_b_id: null,
    status: "scheduled",
    winner_id: null,
    next_winner_match_id: null,
    next_loser_match_id: null,
  };
  wFinal.next_winner_match_id = gf.id;
  lFinal.next_winner_match_id = gf.id;
  all.push(gf);

  return all;
}

// ─── Round Robin ──────────────────────────────────────────────────────────────

export function generateRoundRobin(
  tournamentId: string,
  participants: Participant[]
): MatchRow[] {
  // Shuffle for fairness (no seeding in RR)
  const teams = [...participants].sort(() => Math.random() - 0.5);
  const n = teams.length;

  // Add dummy for odd count (circle method requires even)
  const list = [...teams.map((p) => p.id as string | null)];
  if (n % 2 !== 0) list.push(null);

  const m = list.length;
  const numRounds = m - 1;
  const fixed = list[0];
  let rotating = list.slice(1);
  const all: MatchRow[] = [];

  for (let round = 1; round <= numRounds; round++) {
    const circle = [fixed, ...rotating];
    let matchNum = 1;
    for (let i = 0; i < m / 2; i++) {
      const pA = circle[i];
      const pB = circle[m - 1 - i];
      if (pA === null || pB === null) continue; // skip dummy byes
      all.push({
        id: uuid(),
        tournament_id: tournamentId,
        round_number: round,
        round_label: `Round ${round}`,
        match_number: matchNum++,
        bracket: "winners",
        participant_a_id: pA,
        participant_b_id: pB,
        status: "scheduled",
        winner_id: null,
        next_winner_match_id: null,
        next_loser_match_id: null,
      });
    }
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  return all;
}

// ─── Swiss ───────────────────────────────────────────────────────────────────

export function generateSwissRound(
  tournamentId: string,
  participants: Participant[],
  roundNumber: number
): MatchRow[] {
  // Shuffle for round 1; caller should pass pre-sorted by score for later rounds
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const all: MatchRow[] = [];
  let matchNum = 1;

  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    all.push({
      id: uuid(),
      tournament_id: tournamentId,
      round_number: roundNumber,
      round_label: `Round ${roundNumber}`,
      match_number: matchNum++,
      bracket: "winners",
      participant_a_id: shuffled[i].id,
      participant_b_id: shuffled[i + 1].id,
      status: "scheduled",
      winner_id: null,
      next_winner_match_id: null,
      next_loser_match_id: null,
    });
  }

  // Odd participant gets a bye
  if (shuffled.length % 2 !== 0) {
    const byeP = shuffled[shuffled.length - 1];
    all.push({
      id: uuid(),
      tournament_id: tournamentId,
      round_number: roundNumber,
      round_label: `Round ${roundNumber}`,
      match_number: matchNum,
      bracket: "winners",
      participant_a_id: byeP.id,
      participant_b_id: null,
      status: "bye",
      winner_id: byeP.id,
      next_winner_match_id: null,
      next_loser_match_id: null,
    });
  }

  return all;
}

// ─── Group + Knockout ─────────────────────────────────────────────────────────

function generateRoundRobinGroup(
  tournamentId: string,
  groupParticipants: Participant[],
  groupLabel: string,
  roundOffset: number,
  totalRounds: number
): MatchRow[] {
  const list = [...groupParticipants.map((p) => p.id as string | null)];
  // Circle method requires even count
  if (list.length % 2 !== 0) list.push(null);

  const m = list.length;
  const numRounds = m - 1;
  const fixed = list[0];
  let rotating = list.slice(1);
  const all: MatchRow[] = [];

  for (let round = 1; round <= numRounds; round++) {
    const circle = [fixed, ...rotating];
    let matchNum = 1;
    for (let i = 0; i < m / 2; i++) {
      const pA = circle[i];
      const pB = circle[m - 1 - i];
      if (pA === null || pB === null) continue;
      all.push({
        id: uuid(),
        tournament_id: tournamentId,
        round_number: roundOffset + round - 1,
        round_label: `${groupLabel} · Round ${round}/${totalRounds}`,
        match_number: matchNum++,
        bracket: "winners",
        participant_a_id: pA,
        participant_b_id: pB,
        status: "scheduled",
        winner_id: null,
        next_winner_match_id: null,
        next_loser_match_id: null,
      });
    }
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  return all;
}

export function generateGroupStage(
  tournamentId: string,
  participants: Participant[]
): MatchRow[] {
  const sorted = sortedBySeeed(participants);
  if (sorted.length !== 8) throw new Error("Group knockout requires exactly 8 participants");

  const groupA = [sorted[0], sorted[3], sorted[4], sorted[7]];
  const groupB = [sorted[1], sorted[2], sorted[5], sorted[6]];

  const groupARounds = 3;
  const aMatches = generateRoundRobinGroup(tournamentId, groupA, "Group A", 1, groupARounds);
  const bMatches = generateRoundRobinGroup(tournamentId, groupB, "Group B", 4, groupARounds);

  return [...aMatches, ...bMatches];
}

export function generateKnockoutMatches(
  tournamentId: string,
  groupA: [string, string, string, string],
  groupB: [string, string, string, string],
): MatchRow[] {
  const [a1, a2, a3, a4] = groupA;
  const [b1, b2, b3, b4] = groupB;

  const final = createMatch(tournamentId, 8, "Finals", 1);
  const thirdPlace = createMatch(tournamentId, 8, "Finals", 2);
  const fifthPlace = createMatch(tournamentId, 8, "Finals", 3);
  const seventhPlace = createMatch(tournamentId, 8, "Finals", 4);

  const sf1 = createMatch(tournamentId, 7, "Semi-finals", 1, a1, b2, final.id, thirdPlace.id);
  const sf2 = createMatch(tournamentId, 7, "Semi-finals", 2, b1, a2, final.id, thirdPlace.id);
  const sf3 = createMatch(tournamentId, 7, "Semi-finals", 3, a3, b4, fifthPlace.id, seventhPlace.id);
  const sf4 = createMatch(tournamentId, 7, "Semi-finals", 4, b3, a4, fifthPlace.id, seventhPlace.id);

  return [sf1, sf2, sf3, sf4, final, thirdPlace, fifthPlace, seventhPlace];
}

function createMatch(
  tournamentId: string,
  roundNumber: number,
  roundLabel: string,
  matchNumber: number,
  participantA?: string | null,
  participantB?: string | null,
  nextWinnerId?: string | null,
  nextLoserId?: string | null,
): MatchRow {
  return {
    id: uuid(),
    tournament_id: tournamentId,
    round_number: roundNumber,
    round_label: roundLabel,
    match_number: matchNumber,
    bracket: "winners",
    participant_a_id: participantA ?? null,
    participant_b_id: participantB ?? null,
    status: "scheduled",
    winner_id: null,
    next_winner_match_id: nextWinnerId ?? null,
    next_loser_match_id: nextLoserId ?? null,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function generateBracket(
  format: "single_elimination" | "double_elimination" | "round_robin" | "swiss" | "group_knockout",
  tournamentId: string,
  participants: Participant[]
): MatchRow[] {
  switch (format) {
    case "single_elimination":
      return generateSingleElim(tournamentId, participants);
    case "double_elimination":
      return generateDoubleElim(tournamentId, participants);
    case "round_robin":
      return generateRoundRobin(tournamentId, participants);
    case "swiss":
      return generateSwissRound(tournamentId, participants, 1);
    case "group_knockout":
      return generateGroupStage(tournamentId, participants);
  }
}
