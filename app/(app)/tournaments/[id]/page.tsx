import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getLocale, getDictionary } from "@/lib/i18n";
import { TournamentActions, CopyButton } from "./tournament-actions";
import { GenerateBracketButton } from "./generate-bracket-button";
import { MatchesView } from "./matches-view";
import { ParticipantManager } from "./participant-manager";
import { QRCodeDialog } from "./qr-code-dialog";
import type { Tournament } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  registration: "bg-primary/10 text-primary",
  active: "bg-success/10 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single<Tournament>();

  if (!tournament) notFound();

  const isOwner = tournament.owner_id === session.user.id;

  const { data: rawParticipants } = await supabaseAdmin
    .from("participants")
    .select("id, tournament_id, user_id, guest_token_id, team_id, display_name, seed, status, registered_at")
    .eq("tournament_id", id)
    .order("registered_at");

  const participantCount = rawParticipants?.length ?? 0;
  const confirmedCount = rawParticipants?.filter((p) => p.status === "confirmed").length ?? 0;

  const userIds = rawParticipants?.filter((p) => p.user_id).map((p) => p.user_id as string) ?? [];
  const guestIds = rawParticipants?.filter((p) => p.guest_token_id).map((p) => p.guest_token_id as string) ?? [];
  const teamIds = rawParticipants?.filter((p) => p.team_id).map((p) => p.team_id as string) ?? [];

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
      .eq("tournament_id", id)
      .order("round_number")
      .order("match_number"),
    teamIds.length > 0
      ? supabaseAdmin
          .from("teams")
          .select("id, name")
          .in("id", teamIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  // Fetch team members for all teams
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

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/join/${tournament.invite_code}`;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {tournament.name}
          </h1>
          {tournament.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {tournament.description}
            </p>
          )}
        </div>

        {isOwner && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/tournaments/${id}/edit`}>{dict.common.edit}</Link>
            </Button>
            <TournamentActions tournament={tournament} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Invite link */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            {dict.tournament.invite_link}
          </h2>
          <p className="mb-3 break-all font-mono text-xs text-muted-foreground overflow-hidden">
            {inviteUrl}
          </p>
          <div className="flex gap-2">
            <CopyButton text={inviteUrl} />
            <QRCodeDialog url={inviteUrl} />
          </div>
        </div>

        {/* Details */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">{dict.tournament.details}</h2>
          <dl className="flex flex-col gap-1.5 text-sm">
            {tournament.sport_type && (
              <Row label={dict.tournament.sport_game} value={tournament.sport_type} />
            )}
            <Row
              label={dict.tournament.participants_label}
              value={`${participantCount}${tournament.max_participants ? ` / ${tournament.max_participants}` : ""}`}
            />
            {tournament.start_date && (
              <Row label={dict.tournament.start} value={new Date(tournament.start_date).toLocaleString()} />
            )}
            {tournament.end_date && (
              <Row label={dict.tournament.end} value={new Date(tournament.end_date).toLocaleString()} />
            )}
            <Row label={dict.tournament.anonymous_join} value={tournament.allow_anonymous ? dict.common.allowed : dict.common.disabled} />
            <Row label={dict.tournament.dispute_flow_label} value={tournament.dispute_flow_enabled ? dict.common.enabled : dict.common.disabled} />
          </dl>
        </div>
      </div>

      {/* Participants */}
      <ParticipantManager
        tournamentId={id}
        participants={participants}
        canEdit={isOwner && tournament.status !== "active" && tournament.status !== "completed"}
      />

      {/* Generate bracket */}
      {isOwner && tournament.status === "registration" && confirmedCount >= 2 && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground">{dict.tournament.bracket}</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {confirmedCount === 1
              ? dict.tournament.confirmed_one
              : dict.tournament.confirmed_other.replace("{{count}}", String(confirmedCount))}{" "}
            {dict.tournament.ready_to_generate}
          </p>
          <GenerateBracketButton tournamentId={id} />
        </div>
      )}

      {/* Matches */}
      {matches.length > 0 && (
        <MatchesView
          matches={matches}
          participants={participants}
          isOwner={isOwner}
          scoringRule={tournament.scoring_rule}
          labels={{
            tbd: dict.matches.tbd,
            bye: dict.matches.bye,
            you: dict.matches.you,
            losers: dict.matches.losers,
            grand_final: dict.matches.grand_final,
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

