"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateBracket } from "@/lib/bracket";
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
    .select("format, status, owner_id")
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

  // Generate match rows
  const matches = generateBracket(tournament.format, id, participants);

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

  revalidatePath(`/tournaments/${id}`);
  revalidatePath("/dashboard");
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
    .select("owner_id, status")
    .eq("id", match.tournament_id)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (tournament.owner_id !== session.user.id) return { error: "Not authorized" };
  if (tournament.status !== "active") return { error: "Tournament is not active" };

  if (match.status === "bye") return { error: "Cannot report result for a bye" };
  if (match.status === "completed") return { error: "Match already completed" };

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
