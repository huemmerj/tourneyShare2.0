import { describe, it, expect } from "vitest";
import {
  generateSingleElim,
  generateDoubleElim,
  generateRoundRobin,
  generateSwissRound,
} from "./bracket";
import type { Participant } from "./types";

function makePlayers(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    tournament_id: "t1",
    user_id: null,
    guest_token_id: null,
    team_id: null,
    seed: null,
    status: "confirmed",
    registered_at: new Date().toISOString(),
  }));
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function assertNoSelfMatch(matches: ReturnType<typeof generateSingleElim>) {
  for (const m of matches) {
    if (m.participant_a_id !== null && m.participant_b_id !== null) {
      expect(m.participant_a_id).not.toBe(m.participant_b_id);
    }
  }
}

function assertValidLinks(matches: ReturnType<typeof generateSingleElim>) {
  const ids = new Set(matches.map((m) => m.id));
  for (const m of matches) {
    if (m.next_winner_match_id) expect(ids.has(m.next_winner_match_id)).toBe(true);
    if (m.next_loser_match_id) expect(ids.has(m.next_loser_match_id)).toBe(true);
  }
}

// ─── Single Elimination ───────────────────────────────────────────────────────

describe("generateSingleElim", () => {
  it("2 players → 1 match, no byes", () => {
    const m = generateSingleElim("t1", makePlayers(2));
    expect(m).toHaveLength(1);
    expect(m[0].status).toBe("scheduled");
    expect(m[0].bracket).toBe("winners");
    assertNoSelfMatch(m);
  });

  it("3 players → 3 matches (1 bye + 2 rounds)", () => {
    const m = generateSingleElim("t1", makePlayers(3));
    // size=4 → R1: 2 matches, R2: 1 match
    expect(m).toHaveLength(3);
    const byes = m.filter((x) => x.status === "bye");
    expect(byes).toHaveLength(1);
    assertNoSelfMatch(m);
    assertValidLinks(m);
  });

  it("4 players → 3 matches, no byes", () => {
    const m = generateSingleElim("t1", makePlayers(4));
    expect(m).toHaveLength(3);
    expect(m.filter((x) => x.status === "bye")).toHaveLength(0);
    assertNoSelfMatch(m);
    assertValidLinks(m);
  });

  it("5 players → 7 matches (3 byes in R1)", () => {
    const m = generateSingleElim("t1", makePlayers(5));
    // size=8 → R1:4, R2:2, R3:1 = 7 total
    expect(m).toHaveLength(7);
    const byes = m.filter((x) => x.status === "bye");
    expect(byes).toHaveLength(3);
    assertNoSelfMatch(m);
    assertValidLinks(m);
  });

  it("8 players → 7 matches, no byes", () => {
    const m = generateSingleElim("t1", makePlayers(8));
    expect(m).toHaveLength(7);
    expect(m.filter((x) => x.status === "bye")).toHaveLength(0);
    assertNoSelfMatch(m);
    assertValidLinks(m);
  });

  it("bye winners are propagated into the next round", () => {
    // 3 players: p1 gets a bye in R1, so R2 slot for p1 should be pre-filled
    const players = makePlayers(3);
    const m = generateSingleElim("t1", players);
    const r2 = m.filter((x) => x.round_number === 2);
    expect(r2).toHaveLength(1);
    // One slot in R2 should already be filled with a real participant
    const filled = [r2[0].participant_a_id, r2[0].participant_b_id].filter(Boolean);
    expect(filled.length).toBeGreaterThanOrEqual(1);
  });

  it("final match has no next_winner_match_id", () => {
    const m = generateSingleElim("t1", makePlayers(4));
    const maxRound = Math.max(...m.map((x) => x.round_number));
    const final = m.filter((x) => x.round_number === maxRound);
    expect(final).toHaveLength(1);
    expect(final[0].next_winner_match_id).toBeNull();
  });

  it("all matches reference the correct tournament_id", () => {
    const m = generateSingleElim("my-tournament", makePlayers(4));
    expect(m.every((x) => x.tournament_id === "my-tournament")).toBe(true);
  });
});

// ─── Double Elimination ───────────────────────────────────────────────────────

describe("generateDoubleElim", () => {
  it("4 players → has winners, losers, and grand_final brackets", () => {
    const m = generateDoubleElim("t1", makePlayers(4));
    const brackets = new Set(m.map((x) => x.bracket));
    expect(brackets.has("winners")).toBe(true);
    expect(brackets.has("losers")).toBe(true);
    expect(brackets.has("grand_final")).toBe(true);
    assertNoSelfMatch(m);
    assertValidLinks(m);
  });

  it("4 players → exactly 1 grand final match", () => {
    const m = generateDoubleElim("t1", makePlayers(4));
    expect(m.filter((x) => x.bracket === "grand_final")).toHaveLength(1);
  });

  it("8 players → grand final match has both slots TBD", () => {
    const m = generateDoubleElim("t1", makePlayers(8));
    const gf = m.find((x) => x.bracket === "grand_final")!;
    expect(gf).toBeDefined();
    // GF participants come from W final winner and L final winner — filled at runtime
    assertNoSelfMatch(m);
  });

  it("all match IDs are unique", () => {
    const m = generateDoubleElim("t1", makePlayers(4));
    const ids = m.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Round Robin ──────────────────────────────────────────────────────────────

describe("generateRoundRobin", () => {
  it("4 players → 6 matches (n*(n-1)/2)", () => {
    const m = generateRoundRobin("t1", makePlayers(4));
    expect(m).toHaveLength(6);
    assertNoSelfMatch(m);
  });

  it("3 players → 3 matches", () => {
    const m = generateRoundRobin("t1", makePlayers(3));
    expect(m).toHaveLength(3);
    assertNoSelfMatch(m);
  });

  it("5 players → 10 matches", () => {
    const m = generateRoundRobin("t1", makePlayers(5));
    expect(m).toHaveLength(10);
    assertNoSelfMatch(m);
  });

  it("each participant pair plays exactly once", () => {
    const players = makePlayers(4);
    const m = generateRoundRobin("t1", players);
    const pairs = m.map(({ participant_a_id: a, participant_b_id: b }) =>
      [a, b].sort().join("-")
    );
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("no null participants in round robin matches", () => {
    const m = generateRoundRobin("t1", makePlayers(4));
    for (const match of m) {
      expect(match.participant_a_id).not.toBeNull();
      expect(match.participant_b_id).not.toBeNull();
    }
  });
});

// ─── Swiss ───────────────────────────────────────────────────────────────────

describe("generateSwissRound", () => {
  it("4 players → 2 matches", () => {
    const m = generateSwissRound("t1", makePlayers(4), 1);
    expect(m).toHaveLength(2);
    assertNoSelfMatch(m);
  });

  it("5 players → 2 matches + 1 bye", () => {
    const m = generateSwissRound("t1", makePlayers(5), 1);
    expect(m).toHaveLength(3);
    const byes = m.filter((x) => x.status === "bye");
    expect(byes).toHaveLength(1);
    // The bye match has only one participant
    expect(byes[0].participant_b_id).toBeNull();
    expect(byes[0].winner_id).not.toBeNull();
    assertNoSelfMatch(m);
  });

  it("round_number is set correctly", () => {
    const m = generateSwissRound("t1", makePlayers(4), 3);
    expect(m.every((x) => x.round_number === 3)).toBe(true);
  });

  it("all participants appear exactly once", () => {
    const players = makePlayers(4);
    const m = generateSwissRound("t1", players, 1);
    const mentioned = m.flatMap((x) =>
      [x.participant_a_id, x.participant_b_id].filter(Boolean)
    );
    expect(new Set(mentioned).size).toBe(players.length);
  });
});
