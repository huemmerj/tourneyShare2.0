import { headers, cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabaseAdmin } from "@/lib/supabase/server";
import { MatchesView } from "@/app/(app)/tournaments/[id]/matches-view";
import { SelfAssignTeam } from "./self-assign-team";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { Tournament } from "@/lib/types";

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

  const locale = await getLocale();
  const dict = await getDictionary(locale);

  // Identify viewer: logged-in user or guest via cookie
  const session = await auth.api.getSession({ headers: await headers() });
  const cookieStore = await cookies();
  const guestTokenValue = cookieStore.get(`gt_${tournament.id}`)?.value;

  const { data: rawParticipants } = await supabaseAdmin
    .from("participants")
    .select("id, tournament_id, user_id, guest_token_id, team_id, display_name, seed, status, registered_at")
    .eq("tournament_id", tournament.id)
    .order("registered_at");

  const userIds =
    rawParticipants?.filter((p) => p.user_id).map((p) => p.user_id as string) ?? [];
  const guestIds =
    rawParticipants?.filter((p) => p.guest_token_id).map((p) => p.guest_token_id as string) ?? [];
  const teamIds =
    rawParticipants?.filter((p) => p.team_id).map((p) => p.team_id as string) ?? [];

  const [usersRes, guestsRes, matchesRes, teamsRes] = await Promise.all([
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
    teamIds.length > 0
      ? supabaseAdmin.from("teams").select("id, name").in("id", teamIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  // Fetch team members
  type TeamMemberRow = { id: string; team_id: string; display_name: string };
  let teamMembersData: TeamMemberRow[] = [];
  if (teamIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("team_members")
      .select("id, team_id, display_name")
      .in("team_id", teamIds)
      .order("joined_at");
    teamMembersData = (data ?? []) as TeamMemberRow[];
  }

  // Fetch all teams with member counts (for self-assign UI)
  let allTeamsWithCounts: { id: string; name: string; memberCount: number; maxSize: number | null }[] = [];
  if (tournament.participant_type === "team" && tournament.team_mode === "self_select") {
    const { data: allTeams } = await supabaseAdmin
      .from("teams")
      .select("id, name")
      .eq("tournament_id", tournament.id)
      .order("created_at");
    if (allTeams && allTeams.length > 0) {
      const counts = await Promise.all(
        allTeams.map((t) =>
          supabaseAdmin
            .from("team_members")
            .select("id", { count: "exact", head: true })
            .eq("team_id", t.id)
            .then((r) => ({ id: t.id, count: r.count ?? 0 }))
        )
      );
      const countMap = new Map(counts.map((c) => [c.id, c.count]));
      allTeamsWithCounts = allTeams.map((t) => ({
        id: t.id,
        name: t.name,
        memberCount: countMap.get(t.id) ?? 0,
        maxSize: tournament.max_team_size,
      }));
    }
  }

  const usersMap = new Map((usersRes.data ?? []).map((u) => [u.id, u]));
  const guestsMap = new Map((guestsRes.data ?? []).map((g) => [g.id, g]));
  const teamsMap = new Map((teamsRes.data ?? []).map((t) => [t.id, t]));
  const membersByTeam = teamMembersData.reduce<Record<string, TeamMemberRow[]>>((acc, m) => {
    (acc[m.team_id] ??= []).push(m);
    return acc;
  }, {});

  const participants = (rawParticipants ?? []).map((p) => ({
    ...p,
    user: p.user_id ? (usersMap.get(p.user_id) ?? null) : null,
    guest: p.guest_token_id ? (guestsMap.get(p.guest_token_id) ?? null) : null,
    team: p.team_id ? (teamsMap.get(p.team_id) ?? null) : null,
    teamMembers: p.team_id ? (membersByTeam[p.team_id] ?? []) : [],
  }));

  const matches = matchesRes.data ?? [];

  // Find the current viewer's participant ID
  let currentParticipantId: string | null = null;

  if (session) {
    // Check direct solo participant
    const directP = participants.find((p) => p.user_id === session.user.id);
    if (directP) {
      currentParticipantId = directP.id;
    } else if (teamIds.length > 0) {
      // Check if user is a team member
      const { data: membership } = await supabaseAdmin
        .from("team_members")
        .select("team_id")
        .eq("user_id", session.user.id)
        .in("team_id", teamIds)
        .maybeSingle();
      if (membership) {
        const teamP = participants.find((p) => p.team_id === membership.team_id);
        if (teamP) currentParticipantId = teamP.id;
      }
    }
  } else if (guestTokenValue) {
    // Resolve guest token → participant
    const { data: gt } = await supabaseAdmin
      .from("guest_tokens")
      .select("id")
      .eq("token", guestTokenValue)
      .eq("tournament_id", tournament.id)
      .maybeSingle();
    if (gt) {
      const directP = participants.find((p) => p.guest_token_id === gt.id);
      if (directP) {
        currentParticipantId = directP.id;
      } else if (teamIds.length > 0) {
        const { data: membership } = await supabaseAdmin
          .from("team_members")
          .select("team_id")
          .eq("guest_token_id", gt.id)
          .in("team_id", teamIds)
          .maybeSingle();
        if (membership) {
          const teamP = participants.find((p) => p.team_id === membership.team_id);
          if (teamP) currentParticipantId = teamP.id;
        }
      }
    }
  }

  const participantCount = tournament.participant_type === "team"
    ? participants.filter((p) => !p.team_id).length
    : participants.length;
  const currentParticipantUnassigned =
    currentParticipantId !== null &&
    !participants.find((p) => p.id === currentParticipantId)?.team_id;
  // Show bracket whenever matches exist; scores only when results_visible or completed
  const showMatches = matches.length > 0;
  const showScores = tournament.results_visible || tournament.status === "completed";

  return (
    <div className="flex min-h-full flex-col overflow-x-hidden">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-foreground"
          >
            TourneyShare
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {session ? null : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/sign-in">{dict.nav.sign_in}</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/sign-up">{dict.nav.get_started}</Link>
                </Button>
              </>
            )}
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
              {dict.status[tournament.status as keyof typeof dict.status]}
            </span>
            <span className="text-xs text-muted-foreground">
              {dict.format[tournament.format as keyof typeof dict.format]}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground capitalize">
              {tournament.participant_type}
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {tournament.name}
          </h1>
          {tournament.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {tournament.description}
            </p>
          )}
          {currentParticipantId && (
            <p className="mt-2 text-sm text-primary font-medium">
              {dict.spectator.your_matches}
            </p>
          )}
          {!currentParticipantId && tournament.status === "registration" && (
            <div className="mt-3">
              <Button asChild>
                <Link href={`/join/${tournament.invite_code}`}>{dict.spectator.join_tournament}</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Participants */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              {dict.participants.title}{" "}
              <span className="text-muted-foreground">({participantCount})</span>
            </h2>
          </div>
          {participants.length > 0 ? (
            <ul className="divide-y divide-border">
              {participants.map((p) => {
                const isMe =
                  currentParticipantId !== null && p.id === currentParticipantId;
                const displayName = p.team
                  ? p.team.name
                  : p.guest
                    ? p.guest.display_name
                    : p.user
                      ? p.user.name || p.user.email
                      : p.display_name ?? "Unknown";

                return (
                  <li key={p.id} className={`px-4 py-2.5 text-sm ${isMe ? "bg-primary/5" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground">{displayName}</span>
                        {isMe && (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            {dict.matches.you}
                          </span>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          p.status === "confirmed"
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    {/* Team members */}
                    {p.team && p.teamMembers.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-1 pl-1">
                        {p.teamMembers.map((m) => (
                          <li
                            key={m.id}
                            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {m.display_name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {dict.spectator.no_participants}
            </p>
          )}
        </div>

        {/* Self-assign to a team (for unassigned participants in self_select mode) */}
        {currentParticipantUnassigned &&
          tournament.participant_type === "team" &&
          tournament.team_mode === "self_select" &&
          tournament.status === "registration" && (
            <div className="mt-3">
              <SelfAssignTeam
                tournamentId={tournament.id}
                inviteCode={tournament.invite_code}
                teams={allTeamsWithCounts}
                isAuthenticated={!!session}
              />
            </div>
          )}

        {/* Bracket / matches */}
        {showMatches && (
          <>
            {!showScores && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                {dict.spectator.scores_hidden}
              </p>
            )}
            <MatchesView
              matches={matches}
              participants={participants}
              isOwner={false}
              currentParticipantId={currentParticipantId}
              showScores={showScores}
              labels={{
                tbd: dict.matches.tbd,
                bye: dict.matches.bye,
                you: dict.matches.you,
                losers: dict.matches.losers,
                grand_final: dict.matches.grand_final,
              }}
            />
          </>
        )}

        {!showMatches && tournament.status === "registration" && (
          <div className="mt-4 rounded-xl border border-border bg-card px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {dict.spectator.bracket_pending}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
