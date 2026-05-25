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
