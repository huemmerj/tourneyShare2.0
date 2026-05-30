"use server";

import { headers, cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";

async function loadTournament(tournamentId: string) {
  const { data } = await supabaseAdmin
    .from("tournaments")
    .select("name, status, max_participants, max_team_size, owner_id, allow_anonymous")
    .eq("id", tournamentId)
    .single();
  return data;
}

async function countTeams(tournamentId: string) {
  const { count } = await supabaseAdmin
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .not("team_id", "is", null);
  return count ?? 0;
}

async function removeMatchingPresetSlot(tournamentId: string, displayName: string) {
  const { data } = await supabaseAdmin
    .from("participants")
    .select("id")
    .eq("tournament_id", tournamentId)
    .is("user_id", null)
    .is("guest_token_id", null)
    .is("team_id", null)
    .eq("display_name", displayName)
    .limit(1)
    .maybeSingle();
  if (data) {
    await supabaseAdmin.from("participants").delete().eq("id", data.id);
  }
}

async function countTeamMembers(teamId: string) {
  const { count } = await supabaseAdmin
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);
  return count ?? 0;
}

// ── Authenticated user ──────────────────────────────────────────────────────

export async function createTeam(
  tournamentId: string,
  teamName: string
): Promise<{ ok: true } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated" };

  const trimmed = teamName.trim();
  if (!trimmed) return { error: "Team name is required" };

  const tournament = await loadTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (tournament.status !== "registration") return { error: "Registration is not open" };

  if (tournament.max_participants) {
    const existing = await countTeams(tournamentId);
    if (existing >= tournament.max_participants) return { error: "Tournament is full" };
  }

  // Check not already in a team for this tournament
  const { data: existingMember } = await supabaseAdmin
    .from("team_members")
    .select("id")
    .eq("user_id", session.user.id)
    .in(
      "team_id",
      (
        await supabaseAdmin
          .from("teams")
          .select("id")
          .eq("tournament_id", tournamentId)
      ).data?.map((t) => t.id) ?? []
    )
    .maybeSingle();

  if (existingMember) return { error: "You are already in a team for this tournament" };

  const { data: team, error: teamError } = await supabaseAdmin
    .from("teams")
    .insert({ tournament_id: tournamentId, name: trimmed, created_by: session.user.id })
    .select("id")
    .single();

  if (teamError || !team) return { error: teamError?.message ?? "Failed to create team" };

  const { error: memberError } = await supabaseAdmin.from("team_members").insert({
    team_id: team.id,
    user_id: session.user.id,
    display_name: session.user.name || session.user.email,
  });

  if (memberError) return { error: memberError.message };

  const { error: participantError } = await supabaseAdmin.from("participants").insert({
    tournament_id: tournamentId,
    team_id: team.id,
    status: "confirmed",
  });

  if (participantError) return { error: participantError.message };

  // Remove the old unassigned participant row if user had registered without a team first
  await supabaseAdmin
    .from("participants")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("user_id", session.user.id)
    .is("team_id", null);

  await createNotification({
    userId: tournament.owner_id,
    tournamentId,
    type: "participant_joined",
    message: `Team "${trimmed}" was created in your tournament "${tournament.name}".`,
  });

  const memberName = session.user.name || session.user.email;
  await removeMatchingPresetSlot(tournamentId, memberName);

  revalidatePath(`/join/${tournamentId}`);
  return { ok: true };
}

export async function joinTeam(
  tournamentId: string,
  teamId: string
): Promise<{ ok: true } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated" };

  const tournament = await loadTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (tournament.status !== "registration") return { error: "Registration is not open" };

  // Verify the team belongs to this tournament
  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (!team) return { error: "Team not found" };

  if (tournament.max_team_size) {
    const memberCount = await countTeamMembers(teamId);
    if (memberCount >= tournament.max_team_size) return { error: "Team is full" };
  }

  // Check not already in a team for this tournament
  const { data: existingMember } = await supabaseAdmin
    .from("team_members")
    .select("id")
    .eq("user_id", session.user.id)
    .in(
      "team_id",
      (
        await supabaseAdmin
          .from("teams")
          .select("id")
          .eq("tournament_id", tournamentId)
      ).data?.map((t) => t.id) ?? []
    )
    .maybeSingle();

  if (existingMember) return { error: "You are already in a team for this tournament" };

  const { error: memberError2 } = await supabaseAdmin.from("team_members").insert({
    team_id: teamId,
    user_id: session.user.id,
    display_name: session.user.name || session.user.email,
  });

  if (memberError2) return { error: memberError2.message };

  // Remove the old unassigned participant row so they don't appear as unassigned
  await supabaseAdmin
    .from("participants")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("user_id", session.user.id)
    .is("team_id", null);

  const memberName = session.user.name || session.user.email;
  await createNotification({
    userId: tournament.owner_id,
    tournamentId,
    type: "participant_joined",
    message: `${memberName} joined team "${team.name}" in your tournament "${tournament.name}".`,
  });

  await removeMatchingPresetSlot(tournamentId, memberName);

  revalidatePath(`/join/${tournamentId}`);
  return { ok: true };
}

// ── Join without team (self_select) ─────────────────────────────────────────

export async function joinTournamentWithoutTeam(
  tournamentId: string
): Promise<{ ok: true } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated" };

  const tournament = await loadTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (tournament.status !== "registration") return { error: "Registration is not open" };

  if (tournament.max_participants) {
    const existing = await countTeams(tournamentId);
    if (existing >= tournament.max_participants) return { error: "Tournament is full" };
  }

  // Check not already registered
  const { data: existingParticipant } = await supabaseAdmin
    .from("participants")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (existingParticipant) return { error: "Already registered" };

  const { error } = await supabaseAdmin.from("participants").insert({
    tournament_id: tournamentId,
    user_id: session.user.id,
    status: "confirmed",
  });

  if (error) return { error: error.message };

  const joinerName = session.user.name || session.user.email;
  await createNotification({
    userId: tournament.owner_id,
    tournamentId,
    type: "participant_joined",
    message: `${joinerName} joined your tournament "${tournament.name}" (unassigned).`,
  });

  await removeMatchingPresetSlot(tournamentId, joinerName);

  revalidatePath(`/join/${tournamentId}`);
  return { ok: true };
}

export async function guestJoinTournamentWithoutTeam(
  tournamentId: string,
  displayName: string
): Promise<{ ok: true } | { error: string }> {
  const trimmed = displayName.trim();
  if (!trimmed) return { error: "Your name is required" };

  const tournament = await loadTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (!tournament.allow_anonymous) return { error: "Anonymous join is not allowed" };
  if (tournament.status !== "registration") return { error: "Registration is not open" };

  if (tournament.max_participants) {
    const existing = await countTeams(tournamentId);
    if (existing >= tournament.max_participants) return { error: "Tournament is full" };
  }

  const { data: guestToken, error: tokenError } = await supabaseAdmin
    .from("guest_tokens")
    .insert({ tournament_id: tournamentId, display_name: trimmed })
    .select("id, token")
    .single();

  if (tokenError || !guestToken) return { error: tokenError?.message ?? "Failed to create guest token" };

  const { error } = await supabaseAdmin.from("participants").insert({
    tournament_id: tournamentId,
    guest_token_id: guestToken.id,
    status: "confirmed",
  });

  if (error) return { error: error.message };

  await createNotification({
    userId: tournament.owner_id,
    tournamentId,
    type: "participant_joined",
    message: `${trimmed} (guest) joined your tournament "${tournament.name}" (unassigned).`,
  });

  await removeMatchingPresetSlot(tournamentId, trimmed);

  const cookieStore = await cookies();
  cookieStore.set(`gt_${tournamentId}`, guestToken.token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  revalidatePath(`/join/${tournamentId}`);
  return { ok: true };
}

// ── Participant self-assigns to a team (later, from spectator page) ─────────

export async function selfAssignToTeam(
  tournamentId: string,
  teamId: string,
  inviteCode?: string
): Promise<{ ok: true } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated" };

  const tournament = await loadTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (tournament.status !== "registration") return { error: "Registration is not open" };

  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (!team) return { error: "Team not found" };

  if (tournament.max_team_size) {
    const memberCount = await countTeamMembers(teamId);
    if (memberCount >= tournament.max_team_size) return { error: "Team is full" };
  }

  const { data: participant } = await supabaseAdmin
    .from("participants")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("user_id", session.user.id)
    .is("team_id", null)
    .maybeSingle();

  if (!participant) return { error: "No unassigned registration found" };

  const { data: existingMember } = await supabaseAdmin
    .from("team_members")
    .select("id")
    .eq("user_id", session.user.id)
    .in(
      "team_id",
      (await supabaseAdmin.from("teams").select("id").eq("tournament_id", tournamentId)).data?.map((t) => t.id) ?? []
    )
    .maybeSingle();

  if (existingMember) return { error: "You are already in a team for this tournament" };

  const { error: memberError } = await supabaseAdmin.from("team_members").insert({
    team_id: teamId,
    user_id: session.user.id,
    display_name: session.user.name || session.user.email,
  });

  if (memberError) return { error: memberError.message };

  const { error: updateError } = await supabaseAdmin
    .from("participants")
    .update({ team_id: teamId })
    .eq("id", participant.id);

  if (updateError) return { error: updateError.message };

  const memberName = session.user.name || session.user.email;
  await createNotification({
    userId: tournament.owner_id,
    tournamentId,
    type: "participant_joined",
    message: `${memberName} joined team "${team.name}" in your tournament "${tournament.name}".`,
  });

  revalidatePath(inviteCode ? `/t/${inviteCode}` : `/t/${tournamentId}`);
  return { ok: true };
}

export async function guestSelfAssignToTeam(
  tournamentId: string,
  teamId: string,
  inviteCode?: string
): Promise<{ ok: true } | { error: string }> {
  const cookieStore = await cookies();
  const guestTokenValue = cookieStore.get(`gt_${tournamentId}`)?.value;
  if (!guestTokenValue) return { error: "Guest session not found" };

  const { data: gt } = await supabaseAdmin
    .from("guest_tokens")
    .select("id, display_name")
    .eq("token", guestTokenValue)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (!gt) return { error: "Guest session not found" };

  const tournament = await loadTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (tournament.status !== "registration") return { error: "Registration is not open" };

  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (!team) return { error: "Team not found" };

  if (tournament.max_team_size) {
    const memberCount = await countTeamMembers(teamId);
    if (memberCount >= tournament.max_team_size) return { error: "Team is full" };
  }

  const { data: participant } = await supabaseAdmin
    .from("participants")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("guest_token_id", gt.id)
    .is("team_id", null)
    .maybeSingle();

  if (!participant) return { error: "No unassigned registration found" };

  const { data: existingMember } = await supabaseAdmin
    .from("team_members")
    .select("id")
    .eq("guest_token_id", gt.id)
    .in(
      "team_id",
      (await supabaseAdmin.from("teams").select("id").eq("tournament_id", tournamentId)).data?.map((t) => t.id) ?? []
    )
    .maybeSingle();

  if (existingMember) return { error: "You are already in a team for this tournament" };

  const { error: memberError } = await supabaseAdmin.from("team_members").insert({
    team_id: teamId,
    guest_token_id: gt.id,
    display_name: gt.display_name,
  });

  if (memberError) return { error: memberError.message };

  const { error: updateError } = await supabaseAdmin
    .from("participants")
    .update({ team_id: teamId })
    .eq("id", participant.id);

  if (updateError) return { error: updateError.message };

  await createNotification({
    userId: tournament.owner_id,
    tournamentId,
    type: "participant_joined",
    message: `${gt.display_name} (guest) joined team "${team.name}" in your tournament "${tournament.name}".`,
  });

  revalidatePath(inviteCode ? `/t/${inviteCode}` : `/t/${tournamentId}`);
  return { ok: true };
}

// ── Guest ───────────────────────────────────────────────────────────────────

export async function guestCreateTeam(
  tournamentId: string,
  teamName: string,
  displayName: string
): Promise<{ ok: true } | { error: string }> {
  const trimmedTeam = teamName.trim();
  const trimmedName = displayName.trim();
  if (!trimmedTeam) return { error: "Team name is required" };
  if (!trimmedName) return { error: "Your name is required" };

  const tournament = await loadTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (!tournament.allow_anonymous) return { error: "Anonymous join is not allowed" };
  if (tournament.status !== "registration") return { error: "Registration is not open" };

  if (tournament.max_participants) {
    const existing = await countTeams(tournamentId);
    if (existing >= tournament.max_participants) return { error: "Tournament is full" };
  }

  const { data: guestToken, error: tokenError } = await supabaseAdmin
    .from("guest_tokens")
    .insert({ tournament_id: tournamentId, display_name: trimmedName })
    .select("id, token")
    .single();

  if (tokenError || !guestToken) return { error: tokenError?.message ?? "Failed to create guest token" };

  const { data: team, error: teamError } = await supabaseAdmin
    .from("teams")
    .insert({ tournament_id: tournamentId, name: trimmedTeam })
    .select("id")
    .single();

  if (teamError || !team) return { error: teamError?.message ?? "Failed to create team" };

  const { error: memberError } = await supabaseAdmin.from("team_members").insert({
    team_id: team.id,
    guest_token_id: guestToken.id,
    display_name: trimmedName,
  });

  if (memberError) return { error: memberError.message };

  const { error: participantError } = await supabaseAdmin.from("participants").insert({
    tournament_id: tournamentId,
    team_id: team.id,
    status: "confirmed",
  });

  if (participantError) return { error: participantError.message };

  await createNotification({
    userId: tournament.owner_id,
    tournamentId,
    type: "participant_joined",
    message: `Team "${trimmedTeam}" was created in your tournament "${tournament.name}".`,
  });

  await removeMatchingPresetSlot(tournamentId, trimmedName);

  const cookieStore = await cookies();
  cookieStore.set(`gt_${tournamentId}`, guestToken.token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  revalidatePath(`/join/${tournamentId}`);
  return { ok: true };
}

export async function guestJoinTeam(
  tournamentId: string,
  teamId: string,
  displayName: string
): Promise<{ ok: true } | { error: string }> {
  const trimmed = displayName.trim();
  if (!trimmed) return { error: "Your name is required" };

  const tournament = await loadTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (!tournament.allow_anonymous) return { error: "Anonymous join is not allowed" };
  if (tournament.status !== "registration") return { error: "Registration is not open" };

  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (!team) return { error: "Team not found" };

  if (tournament.max_team_size) {
    const memberCount = await countTeamMembers(teamId);
    if (memberCount >= tournament.max_team_size) return { error: "Team is full" };
  }

  const { data: guestToken, error: tokenError } = await supabaseAdmin
    .from("guest_tokens")
    .insert({ tournament_id: tournamentId, display_name: trimmed })
    .select("id, token")
    .single();

  if (tokenError || !guestToken) return { error: tokenError?.message ?? "Failed to create guest token" };

  const { error } = await supabaseAdmin.from("team_members").insert({
    team_id: teamId,
    guest_token_id: guestToken.id,
    display_name: trimmed,
  });

  if (error) return { error: error.message };

  await createNotification({
    userId: tournament.owner_id,
    tournamentId,
    type: "participant_joined",
    message: `${trimmed} (guest) joined team "${team.name}" in your tournament "${tournament.name}".`,
  });

  await removeMatchingPresetSlot(tournamentId, trimmed);

  const cookieStore = await cookies();
  cookieStore.set(`gt_${tournamentId}`, guestToken.token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  revalidatePath(`/join/${tournamentId}`);
  return { ok: true };
}
