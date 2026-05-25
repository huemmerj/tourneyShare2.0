import { supabaseAdmin } from "./supabase/server";

export async function createNotification(data: {
  userId?: string | null;
  guestTokenId?: string | null;
  tournamentId?: string | null;
  matchId?: string | null;
  type: string;
  message: string;
}) {
  if (!data.userId && !data.guestTokenId) return;
  await supabaseAdmin.from("notifications").insert({
    user_id: data.userId ?? null,
    guest_token_id: data.guestTokenId ?? null,
    tournament_id: data.tournamentId ?? null,
    match_id: data.matchId ?? null,
    type: data.type,
    message: data.message,
  });
}

export async function createNotifications(
  recipients: Array<{ userId?: string | null; guestTokenId?: string | null }>,
  shared: {
    tournamentId?: string | null;
    matchId?: string | null;
    type: string;
    message: string;
  }
) {
  const rows = recipients
    .filter((r) => r.userId || r.guestTokenId)
    .map((r) => ({
      user_id: r.userId ?? null,
      guest_token_id: r.guestTokenId ?? null,
      tournament_id: shared.tournamentId ?? null,
      match_id: shared.matchId ?? null,
      type: shared.type,
      message: shared.message,
    }));

  if (rows.length === 0) return;
  await supabaseAdmin.from("notifications").insert(rows);
}
