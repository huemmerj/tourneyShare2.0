"use server";

import { headers, cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";

export async function joinTournament(
  tournamentId: string
): Promise<{ ok: true } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated" };

  // Check already registered
  const { data: existing } = await supabaseAdmin
    .from("participants")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (existing) return { error: "Already registered" };

  // Check tournament is open
  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("name, status, max_participants, owner_id")
    .eq("id", tournamentId)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (tournament.status !== "registration") return { error: "Registration is not open" };

  // Check capacity
  if (tournament.max_participants) {
    const { count } = await supabaseAdmin
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId);
    if ((count ?? 0) >= tournament.max_participants) return { error: "Tournament is full" };
  }

  const { error } = await supabaseAdmin.from("participants").insert({
    tournament_id: tournamentId,
    user_id: session.user.id,
    status: "confirmed",
  });

  if (error) return { error: error.message };

  // Notify the tournament owner
  const joinerName = session.user.name || session.user.email;
  await createNotification({
    userId: tournament.owner_id,
    tournamentId,
    type: "participant_joined",
    message: `${joinerName} joined your tournament "${tournament.name}".`,
  });

  return { ok: true };
}

export async function guestJoinTournament(
  tournamentId: string,
  displayName: string
): Promise<{ ok: true } | { error: string }> {
  const trimmed = displayName.trim();
  if (!trimmed) return { error: "Display name is required" };

  // Check tournament allows anonymous
  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("name, status, allow_anonymous, max_participants, owner_id")
    .eq("id", tournamentId)
    .single();

  if (!tournament) return { error: "Tournament not found" };
  if (!tournament.allow_anonymous) return { error: "Anonymous join is not allowed" };
  if (tournament.status !== "registration") return { error: "Registration is not open" };

  // Check capacity
  if (tournament.max_participants) {
    const { count } = await supabaseAdmin
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId);
    if ((count ?? 0) >= tournament.max_participants) return { error: "Tournament is full" };
  }

  // Create guest token
  const { data: guestToken, error: tokenError } = await supabaseAdmin
    .from("guest_tokens")
    .insert({ tournament_id: tournamentId, display_name: trimmed })
    .select("id, token")
    .single();

  if (tokenError || !guestToken) return { error: tokenError?.message ?? "Failed to create guest token" };

  // Create participant
  const { error: participantError } = await supabaseAdmin
    .from("participants")
    .insert({
      tournament_id: tournamentId,
      guest_token_id: guestToken.id,
      status: "confirmed",
    });

  if (participantError) return { error: participantError.message };

  // Notify the tournament owner
  await createNotification({
    userId: tournament.owner_id,
    tournamentId,
    type: "participant_joined",
    message: `${trimmed} (guest) joined your tournament "${tournament.name}".`,
  });

  // Set cookie so guest can reclaim their slot
  const cookieStore = await cookies();
  cookieStore.set(`gt_${tournamentId}`, guestToken.token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
  });

  return { ok: true };
}
