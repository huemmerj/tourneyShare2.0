"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateBracket, generateKnockoutMatches } from "@/lib/bracket";
import { createNotification, createNotifications } from "@/lib/notifications";
import type { TournamentFormat, ParticipantType, Participant } from "@/lib/types";

type TournamentInput = {
  name: string;
  description?: string;
  sport_type?: string;
  format: TournamentFormat;
  participant_type: ParticipantType;
  max_participants?: number | null;
  max_team_size?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  is_public: boolean;
  allow_anonymous: boolean;
  dispute_flow_enabled: boolean;
  scoring_rule: "higher_wins" | "lower_wins";
  team_mode?: "self_select" | "admin_assigned";
  group_count?: number | null;
  advance_per_group?: number | null;
};

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function createTournament(
  data: TournamentInput
): Promise<{ id: string } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const { data: tournament, error } = await supabaseAdmin
    .from("tournaments")
    .insert({ ...data, owner_id: session.user.id })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { id: tournament.id };
}

export async function updateTournament(
  id: string,
  data: Partial<TournamentInput>
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const { error } = await supabaseAdmin
    .from("tournaments")
    .update(data)
    .eq("id", id)
    .eq("owner_id", session.user.id);

  if (error) return { error: error.message };
  revalidatePath(`/tournaments/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteTournament(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const { error } = await supabaseAdmin
    .from("tournaments")
    .delete()
    .eq("id", id)
    .eq("owner_id", session.user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function generateTournamentBracket(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  // Load tournament (verify ownership + status)
  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("name, format, status, owner_id, group_count")
    .eq("id", id)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (tournament.owner_id !== session.user.id) return { error: "Not authorized" };
  if (tournament.status !== "registration")
    return { error: "Tournament must be in registration status" };

  // Load confirmed participants
  const { data: participants } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("tournament_id", id)
    .eq("status", "confirmed")
    .returns<Participant[]>();

  if (!participants || participants.length < 2)
    return { error: "Need at least 2 confirmed participants" };

  if (tournament.format === "group_knockout" && !tournament.group_count)
    return { error: "Group count not set for group_knockout tournament" };

  // Generate match rows
  const matches = generateBracket(tournament.format, id, participants, tournament.group_count ?? undefined);

  // Insert matches
  const { error: insertError } = await supabaseAdmin
    .from("matches")
    .insert(matches);

  if (insertError) return { error: insertError.message };

  // Advance status to active
  const { error: statusError } = await supabaseAdmin
    .from("tournaments")
    .update({ status: "active" })
    .eq("id", id);

  if (statusError) return { error: statusError.message };

  // Notify all user participants that the bracket is ready
  await createNotifications(
    participants.filter((p) => p.user_id).map((p) => ({ userId: p.user_id })),
    {
      tournamentId: id,
      type: "bracket_ready",
      message: `The bracket for "${tournament.name}" is ready. Check your first match!`,
    }
  );

  revalidatePath(`/tournaments/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function generateGroupKnockoutPhase(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("name, format, status, owner_id, group_count, advance_per_group")
    .eq("id", id)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (tournament.owner_id !== session.user.id) return { error: "Not authorized" };
  if (tournament.format !== "group_knockout") return { error: "Wrong tournament format" };
  if (tournament.status !== "active") return { error: "Tournament must be active" };

  const groupCount = tournament.group_count;
  const advancePerGroup = tournament.advance_per_group;
  if (!groupCount || !advancePerGroup) return { error: "Group configuration not set" };

  // Load all group stage matches
  const { data: groupMatches } = await supabaseAdmin
    .from("matches")
    .select("id, round_number, round_label, participant_a_id, participant_b_id, winner_id, status")
    .eq("tournament_id", id)
    .not("status", "eq", "bye")
    .is("next_winner_match_id", null)
    .is("next_loser_match_id", null);

  if (!groupMatches || groupMatches.length === 0)
    return { error: "Group stage matches not found" };

  const allMatches = groupMatches;
  const allCompleted = allMatches.every((m) => m.status === "completed");
  if (!allCompleted) return { error: "All group stage matches must be completed first" };

  // Group matches by round_label prefix (e.g. "Group 1", "Group 2")
  const groupMap = new Map<string, typeof allMatches>();
  for (const m of allMatches) {
    const prefix = m.round_label?.split(" ·")[0];
    if (!prefix) continue;
    if (!groupMap.has(prefix)) groupMap.set(prefix, []);
    groupMap.get(prefix)!.push(m);
  }

  if (groupMap.size !== groupCount)
    return { error: `Expected ${groupCount} groups, found ${groupMap.size}` };

  // Compute standings per group
  type GroupMatch = (typeof allMatches)[number];

  function computeStandings(matches: GroupMatch[]): string[] {
    const wins = new Map<string, number>();
    const seen = new Set<string>();
    for (const m of matches) {
      if (!m.winner_id) continue;
      wins.set(m.winner_id, (wins.get(m.winner_id) ?? 0) + 1);
      if (m.participant_a_id) seen.add(m.participant_a_id);
      if (m.participant_b_id) seen.add(m.participant_b_id);
    }
    return [...seen].sort((a, b) => {
      const wA = wins.get(a) ?? 0;
      const wB = wins.get(b) ?? 0;
      if (wB !== wA) return wB - wA;
      return a.localeCompare(b);
    });
  }

  const allParticipantIds = new Set<string>();
  const groupRankings: string[][] = [];

  for (const [, matches] of groupMap) {
    const ranked = computeStandings(matches);
    for (const pid of ranked) allParticipantIds.add(pid);
    groupRankings.push(ranked);
  }

  // Load seeds for tiebreaker
  const { data: participantsData } = await supabaseAdmin
    .from("participants")
    .select("id, seed")
    .eq("tournament_id", id)
    .in("id", [...allParticipantIds]);

  const seedMap = new Map((participantsData ?? []).map((p) => [p.id, p.seed]));

  // Rank each group by wins desc, then seed asc
  function rankByWinsThenSeed(ranked: string[]): string[] {
    return [...ranked].sort((a, b) => {
      const winsA = allMatches.filter((m) => m.winner_id === a).length;
      const winsB = allMatches.filter((m) => m.winner_id === b).length;
      if (winsB !== winsA) return winsB - winsA;
      const seedA = seedMap.get(a) ?? 999;
      const seedB = seedMap.get(b) ?? 999;
      return seedA - seedB;
    });
  }

  const finalRankings = groupRankings.map(rankByWinsThenSeed);

  // Verify each group has enough participants for advance_per_group
  for (let g = 0; g < finalRankings.length; g++) {
    if (finalRankings[g].length < advancePerGroup) {
      return { error: `Group ${g + 1} has only ${finalRankings[g].length} participants, need ${advancePerGroup}` };
    }
  }

  const knockoutMatches = generateKnockoutMatches(id, finalRankings, advancePerGroup);

  // Offset knockout round numbers past all group rounds
  const maxGroupRound = Math.max(...allMatches.map((m) => m.round_number));
  for (const m of knockoutMatches) {
    m.round_number += maxGroupRound;
  }

  const { error: insertError } = await supabaseAdmin
    .from("matches")
    .insert(knockoutMatches);

  if (insertError) return { error: insertError.message };

  revalidatePath(`/tournaments/${id}`);
  return { ok: true };
}

export async function reportMatchResult(
  matchId: string,
  scoreA: number,
  scoreB: number,
  winnerId: string
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  // Load the match
  const { data: match } = await supabaseAdmin
    .from("matches")
    .select("tournament_id, participant_a_id, participant_b_id, status, next_winner_match_id, next_loser_match_id")
    .eq("id", matchId)
    .single();

  if (!match) return { error: "Match not found" };

  // Verify tournament ownership and active status
  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("name, owner_id, status")
    .eq("id", match.tournament_id)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (tournament.owner_id !== session.user.id) return { error: "Not authorized" };
  if (tournament.status !== "active") return { error: "Tournament is not active" };

  if (match.status === "bye") return { error: "Cannot report result for a bye" };
  if (match.status === "completed") return { error: "Match already completed" };

  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0)
    return { error: "Scores must be non-negative integers" };

  if (winnerId !== match.participant_a_id && winnerId !== match.participant_b_id)
    return { error: "Winner must be one of the match participants" };

  const loserId =
    winnerId === match.participant_a_id ? match.participant_b_id : match.participant_a_id;

  // Mark match completed
  const { error: updateError } = await supabaseAdmin
    .from("matches")
    .update({
      score_a: scoreA,
      score_b: scoreB,
      winner_id: winnerId,
      status: "completed",
      reported_by_user_id: session.user.id,
    })
    .eq("id", matchId);

  if (updateError) return { error: updateError.message };

  // Propagate winner into the next winner match (first empty slot)
  if (match.next_winner_match_id) {
    const { data: nextW } = await supabaseAdmin
      .from("matches")
      .select("participant_a_id, participant_b_id")
      .eq("id", match.next_winner_match_id)
      .single();
    if (nextW) {
      const slot = nextW.participant_a_id === null ? "participant_a_id" : "participant_b_id";
      await supabaseAdmin
        .from("matches")
        .update({ [slot]: winnerId })
        .eq("id", match.next_winner_match_id);
    }
  }

  // Propagate loser into the next loser match (double elim)
  if (match.next_loser_match_id && loserId) {
    const { data: nextL } = await supabaseAdmin
      .from("matches")
      .select("participant_a_id, participant_b_id")
      .eq("id", match.next_loser_match_id)
      .single();
    if (nextL) {
      const slot = nextL.participant_a_id === null ? "participant_a_id" : "participant_b_id";
      await supabaseAdmin
        .from("matches")
        .update({ [slot]: loserId })
        .eq("id", match.next_loser_match_id);
    }
  }

  // Notify match participants of the result
  const participantIds = [match.participant_a_id, match.participant_b_id].filter(Boolean) as string[];
  if (participantIds.length > 0) {
    const { data: matchParticipants } = await supabaseAdmin
      .from("participants")
      .select("id, user_id, guest_token_id")
      .in("id", participantIds);

    if (matchParticipants) {
      await createNotifications(
        matchParticipants.map((p) => ({ userId: p.user_id, guestTokenId: p.guest_token_id })),
        {
          tournamentId: match.tournament_id,
          matchId: matchId,
          type: "match_result",
          message: `A match result has been reported in "${tournament.name}": ${scoreA}–${scoreB}.`,
        }
      );
    }
  }

  revalidatePath(`/tournaments/${match.tournament_id}`);
  return { ok: true };
}

export async function setTournamentStatus(
  id: string,
  status: "draft" | "registration" | "active" | "completed" | "cancelled"
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const { error } = await supabaseAdmin
    .from("tournaments")
    .update({ status })
    .eq("id", id)
    .eq("owner_id", session.user.id);

  if (error) return { error: error.message };
  revalidatePath(`/tournaments/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function addPresetParticipant(
  tournamentId: string,
  name: string
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required" };

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("owner_id, status, max_participants")
    .eq("id", tournamentId)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (tournament.owner_id !== session.user.id) return { error: "Not authorized" };
  if (tournament.status === "active" || tournament.status === "completed")
    return { error: "Cannot add participants after tournament has started" };

  if (tournament.max_participants) {
    const { count } = await supabaseAdmin
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId);
    if ((count ?? 0) >= tournament.max_participants)
      return { error: "Tournament is full" };
  }

  const { error } = await supabaseAdmin.from("participants").insert({
    tournament_id: tournamentId,
    display_name: trimmed,
    status: "confirmed",
  });

  if (error) return { error: error.message };
  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: true };
}

export async function removeParticipant(
  tournamentId: string,
  participantId: string
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("owner_id, status")
    .eq("id", tournamentId)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (tournament.owner_id !== session.user.id) return { error: "Not authorized" };
  if (tournament.status === "active" || tournament.status === "completed")
    return { error: "Cannot remove participants after tournament has started" };

  const { error } = await supabaseAdmin
    .from("participants")
    .delete()
    .eq("id", participantId)
    .eq("tournament_id", tournamentId);

  if (error) return { error: error.message };
  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: true };
}

export async function shuffleParticipants(
  tournamentId: string
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("owner_id, status")
    .eq("id", tournamentId)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (tournament.owner_id !== session.user.id) return { error: "Not authorized" };
  if (tournament.status === "active" || tournament.status === "completed")
    return { error: "Cannot shuffle after tournament has started" };

  const { data: participants } = await supabaseAdmin
    .from("participants")
    .select("id")
    .eq("tournament_id", tournamentId);

  if (!participants || participants.length === 0) return { ok: true };

  // Assign a random permutation of seeds 1..n
  const ids = participants.map((p) => p.id);
  const seeds = Array.from({ length: ids.length }, (_, i) => i + 1).sort(
    () => Math.random() - 0.5
  );

  await Promise.all(
    ids.map((id, i) =>
      supabaseAdmin.from("participants").update({ seed: seeds[i] }).eq("id", id)
    )
  );

  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: true };
}

export async function confirmParticipant(
  tournamentId: string,
  participantId: string
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("owner_id")
    .eq("id", tournamentId)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (tournament.owner_id !== session.user.id) return { error: "Not authorized" };

  const { error } = await supabaseAdmin
    .from("participants")
    .update({ status: "confirmed" })
    .eq("id", participantId)
    .eq("tournament_id", tournamentId);

  if (error) return { error: error.message };
  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: true };
}

// Admin creates a team from selected unassigned participant IDs
export async function assignUsersToTeam(
  tournamentId: string,
  teamName: string,
  participantIds: string[]
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  const trimmed = teamName.trim();
  if (!trimmed) return { error: "Team name is required" };
  if (participantIds.length === 0) return { error: "Select at least one participant" };

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("owner_id, status, max_team_size")
    .eq("id", tournamentId)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (tournament.owner_id !== session.user.id) return { error: "Not authorized" };
  if (tournament.status === "active" || tournament.status === "completed")
    return { error: "Cannot assign teams after tournament has started" };

  if (tournament.max_team_size && participantIds.length > tournament.max_team_size)
    return { error: `Team cannot exceed ${tournament.max_team_size} members` };

  const { data: participants } = await supabaseAdmin
    .from("participants")
    .select("id, user_id, guest_token_id, display_name")
    .in("id", participantIds)
    .eq("tournament_id", tournamentId)
    .is("team_id", null);

  if (!participants || participants.length === 0) return { error: "No valid participants found" };

  const userIds = participants.filter((p) => p.user_id).map((p) => p.user_id as string);
  let userNameMap: Map<string, string> = new Map();
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from("user").select("id, name, email").in("id", userIds);
    userNameMap = new Map((users ?? []).map((u) => [u.id, u.name || u.email]));
  }

  const { data: team, error: teamError } = await supabaseAdmin
    .from("teams")
    .insert({ tournament_id: tournamentId, name: trimmed, created_by: session.user.id })
    .select("id").single();

  if (teamError || !team) return { error: teamError?.message ?? "Failed to create team" };

  const memberRows = participants.map((p) => ({
    team_id: team.id,
    user_id: p.user_id ?? null,
    guest_token_id: p.guest_token_id ?? null,
    display_name: p.user_id ? (userNameMap.get(p.user_id) ?? "Unknown") : p.display_name ?? "Guest",
  }));

  const { error: memberError } = await supabaseAdmin.from("team_members").insert(memberRows);
  if (memberError) return { error: memberError.message };

  const { error: participantError } = await supabaseAdmin.from("participants").insert({
    tournament_id: tournamentId, team_id: team.id, status: "confirmed",
  });
  if (participantError) return { error: participantError.message };

  const { error: deleteError } = await supabaseAdmin
    .from("participants").delete().in("id", participantIds);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: true };
}

// Admin adds selected unassigned participants to an existing team
export async function addParticipantsToTeam(
  tournamentId: string,
  teamId: string,
  participantIds: string[]
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };
  if (participantIds.length === 0) return { error: "Select at least one participant" };

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("owner_id, max_team_size")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return { error: "Tournament not found" };
  if (tournament.owner_id !== session.user.id) return { error: "Not authorized" };

  // Verify team belongs to this tournament
  const { data: team } = await supabaseAdmin
    .from("teams").select("id, name").eq("id", teamId).eq("tournament_id", tournamentId).maybeSingle();
  if (!team) return { error: "Team not found" };

  if (tournament.max_team_size) {
    const { count: current } = await supabaseAdmin
      .from("team_members").select("id", { count: "exact", head: true }).eq("team_id", teamId);
    if ((current ?? 0) + participantIds.length > tournament.max_team_size)
      return { error: `Team cannot exceed ${tournament.max_team_size} members` };
  }

  const { data: participants } = await supabaseAdmin
    .from("participants")
    .select("id, user_id, guest_token_id, display_name")
    .in("id", participantIds)
    .eq("tournament_id", tournamentId)
    .is("team_id", null);
  if (!participants || participants.length === 0) return { error: "No valid participants found" };

  const userIds = participants.filter((p) => p.user_id).map((p) => p.user_id as string);
  let userNameMap: Map<string, string> = new Map();
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin.from("user").select("id, name, email").in("id", userIds);
    userNameMap = new Map((users ?? []).map((u) => [u.id, u.name || u.email]));
  }

  const memberRows = participants.map((p) => ({
    team_id: teamId,
    user_id: p.user_id ?? null,
    guest_token_id: p.guest_token_id ?? null,
    display_name: p.user_id ? (userNameMap.get(p.user_id) ?? "Unknown") : p.display_name ?? "Guest",
  }));

  const { error: memberError } = await supabaseAdmin.from("team_members").insert(memberRows);
  if (memberError) return { error: memberError.message };

  // Delete the individual participant rows (team already has a participant row)
  const { error: deleteError } = await supabaseAdmin.from("participants").delete().in("id", participantIds);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: true };
}

// Randomly split all unassigned participants into teams of a given size
export async function randomAssignTeams(
  tournamentId: string,
  teamSize: number
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated" };

  if (!Number.isInteger(teamSize) || teamSize < 1)
    return { error: "Team size must be a positive integer" };

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("owner_id, status")
    .eq("id", tournamentId)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (tournament.owner_id !== session.user.id) return { error: "Not authorized" };

  const { data: unassigned } = await supabaseAdmin
    .from("participants")
    .select("id, user_id, guest_token_id, display_name")
    .eq("tournament_id", tournamentId)
    .is("team_id", null);

  if (!unassigned || unassigned.length === 0)
    return { error: "No unassigned participants found" };

  const shuffled = [...unassigned].sort(() => Math.random() - 0.5);

  const userIds = shuffled.filter((p) => p.user_id).map((p) => p.user_id as string);
  let userNameMap: Map<string, string> = new Map();
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from("user").select("id, name, email").in("id", userIds);
    userNameMap = new Map((users ?? []).map((u) => [u.id, u.name || u.email]));
  }

  const chunks: typeof shuffled[] = [];
  for (let i = 0; i < shuffled.length; i += teamSize) {
    chunks.push(shuffled.slice(i, i + teamSize));
  }

  const { data: existingTeamRows } = await supabaseAdmin
    .from("teams").select("name").eq("tournament_id", tournamentId);
  const existingNames = new Set((existingTeamRows ?? []).map((t) => t.name));

  function nextTeamName(): string {
    let n = 1;
    while (existingNames.has(`Team ${n}`)) n++;
    const name = `Team ${n}`;
    existingNames.add(name);
    return name;
  }

  for (const chunk of chunks) {
    const teamName = nextTeamName();
    const { data: team, error: teamError } = await supabaseAdmin
      .from("teams")
      .insert({ tournament_id: tournamentId, name: teamName, created_by: session.user.id })
      .select("id").single();
    if (teamError || !team) return { error: teamError?.message ?? "Failed to create team" };

    await supabaseAdmin.from("team_members").insert(
      chunk.map((p) => ({
        team_id: team.id,
        user_id: p.user_id ?? null,
        guest_token_id: p.guest_token_id ?? null,
        display_name: p.user_id ? (userNameMap.get(p.user_id) ?? "Unknown") : p.display_name ?? "Guest",
      }))
    );
    await supabaseAdmin.from("participants").insert({
      tournament_id: tournamentId, team_id: team.id, status: "confirmed",
    });
    await supabaseAdmin.from("participants").delete().in("id", chunk.map((p) => p.id));
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  return { ok: true };
}
