import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { supabaseAdmin } from "@/lib/supabase/server";
import { MatchesView } from "@/app/(app)/tournaments/[id]/matches-view";
import type { Tournament } from "@/lib/types";

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
  swiss: "Swiss",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  registration: "Registration open",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  registration: "bg-primary/10 text-primary",
  active: "bg-success/10 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export default async function SpectatorPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("*")
    .eq("invite_code", code)
    .single<Tournament>();

  if (!tournament) notFound();

  // Non-public tournaments are only accessible via the join link (which requires knowing the code)
  // but we still render them here — the invite_code is the auth mechanism for spectating.

  const { data: rawParticipants } = await supabaseAdmin
    .from("participants")
    .select("id, tournament_id, user_id, guest_token_id, team_id, seed, status, registered_at")
    .eq("tournament_id", tournament.id)
    .order("registered_at");

  const userIds =
    rawParticipants?.filter((p) => p.user_id).map((p) => p.user_id as string) ?? [];
  const guestIds =
    rawParticipants?.filter((p) => p.guest_token_id).map((p) => p.guest_token_id as string) ?? [];

  const [usersRes, guestsRes, matchesRes] = await Promise.all([
    userIds.length > 0
      ? supabaseAdmin.from("user").select("id, name, email").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
    guestIds.length > 0
      ? supabaseAdmin.from("guest_tokens").select("id, display_name").in("id", guestIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    supabaseAdmin
      .from("matches")
      .select("*")
      .eq("tournament_id", tournament.id)
      .order("round_number")
      .order("match_number"),
  ]);

  const usersMap = new Map((usersRes.data ?? []).map((u) => [u.id, u]));
  const guestsMap = new Map((guestsRes.data ?? []).map((g) => [g.id, g]));

  const participants = (rawParticipants ?? []).map((p) => ({
    ...p,
    user: p.user_id ? (usersMap.get(p.user_id) ?? null) : null,
    guest: p.guest_token_id ? (guestsMap.get(p.guest_token_id) ?? null) : null,
  }));

  const matches = matchesRes.data ?? [];
  const showMatches =
    matches.length > 0 &&
    (tournament.results_visible || tournament.status === "completed");

  const participantCount = participants.length;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-foreground"
          >
            TourneyShare
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[tournament.status]}`}
            >
              {STATUS_LABELS[tournament.status]}
            </span>
            <span className="text-xs text-muted-foreground">
              {FORMAT_LABELS[tournament.format]}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground capitalize">
              {tournament.participant_type}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {tournament.name}
          </h1>
          {tournament.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {tournament.description}
            </p>
          )}
        </div>

        {/* Participants */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Participants{" "}
              <span className="text-muted-foreground">({participantCount})</span>
            </h2>
          </div>
          {participants.length > 0 ? (
            <ul className="divide-y divide-border">
              {participants.map((p) => {
                const displayName = p.guest
                  ? p.guest.display_name
                  : p.user
                    ? p.user.name || p.user.email
                    : "Unknown";
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span className="text-foreground">{displayName}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        p.status === "confirmed"
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No participants yet.
            </p>
          )}
        </div>

        {/* Bracket / matches */}
        {showMatches && (
          <MatchesView matches={matches} participants={participants} isOwner={false} />
        )}

        {matches.length > 0 && !showMatches && (
          <div className="mt-4 rounded-xl border border-border bg-card px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Results will be visible once the tournament is completed.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
