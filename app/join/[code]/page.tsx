import { headers, cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { JoinButton } from "./join-button";
import { GuestJoinForm } from "./guest-join-form";
import { ClaimSlotForm } from "./claim-slot-form";
import { TeamJoinSection } from "./team-join-section";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { Tournament } from "@/lib/types";

export default async function JoinPage({
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

  const session = await auth.api.getSession({ headers: await headers() });

  // Resolve guest token (used for both solo and team already-joined checks)
  const cookieStore = await cookies();
  const guestTokenValue = cookieStore.get(`gt_${tournament.id}`)?.value;
  let guestTokenId: string | null = null;
  if (!session && guestTokenValue) {
    const { data: gt } = await supabaseAdmin
      .from("guest_tokens")
      .select("id")
      .eq("token", guestTokenValue)
      .eq("tournament_id", tournament.id)
      .maybeSingle();
    guestTokenId = gt?.id ?? null;
  }

  // Check if already joined.
  // For self_select teams: check team_members.
  // For admin_assigned teams (or solo): check participants directly.
  let alreadyJoined = false;
  if (session) {
    const { data } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("tournament_id", tournament.id)
      .eq("user_id", session.user.id)
      .maybeSingle();
    alreadyJoined = !!data;
    // Also check team_members (self_select mode where user is in a team)
    if (!alreadyJoined && tournament.participant_type === "team") {
      const { data: teams } = await supabaseAdmin
        .from("teams").select("id").eq("tournament_id", tournament.id);
      const teamIds = teams?.map((t) => t.id) ?? [];
      if (teamIds.length > 0) {
        const { data: mem } = await supabaseAdmin
          .from("team_members")
          .select("id")
          .eq("user_id", session.user.id)
          .in("team_id", teamIds)
          .maybeSingle();
        alreadyJoined = !!mem;
      }
    }
  } else if (guestTokenId) {
    // Check participants directly (covers solo and admin_assigned team mode)
    const { data } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("tournament_id", tournament.id)
      .eq("guest_token_id", guestTokenId)
      .maybeSingle();
    alreadyJoined = !!data;
    // Also check team_members (self_select mode)
    if (!alreadyJoined && tournament.participant_type === "team") {
      const { data: teams } = await supabaseAdmin
        .from("teams").select("id").eq("tournament_id", tournament.id);
      const teamIds = teams?.map((t) => t.id) ?? [];
      if (teamIds.length > 0) {
        const { data: mem } = await supabaseAdmin
          .from("team_members")
          .select("id")
          .eq("guest_token_id", guestTokenId)
          .in("team_id", teamIds)
          .maybeSingle();
        alreadyJoined = !!mem;
      }
    }
  }

  const registrationOpen = tournament.status === "registration";
  const isFull =
    tournament.max_participants !== null
      ? (await supabaseAdmin
          .from("participants")
          .select("id", { count: "exact", head: true })
          .eq("tournament_id", tournament.id)
          .then((r) => (r.count ?? 0) >= tournament.max_participants!))
      : false;

  // Fetch teams with member counts (for team tournaments)
  let teamsWithCounts: { id: string; name: string; memberCount: number; maxSize: number | null }[] = [];
  if (tournament.participant_type === "team") {
    const { data: rawTeams } = await supabaseAdmin
      .from("teams")
      .select("id, name")
      .eq("tournament_id", tournament.id)
      .order("created_at");
    if (rawTeams && rawTeams.length > 0) {
      const counts = await Promise.all(
        rawTeams.map((t) =>
          supabaseAdmin
            .from("team_members")
            .select("id", { count: "exact", head: true })
            .eq("team_id", t.id)
            .then((r) => ({ id: t.id, count: r.count ?? 0 }))
        )
      );
      const countMap = new Map(counts.map((c) => [c.id, c.count]));
      teamsWithCounts = rawTeams.map((t) => ({
        id: t.id,
        name: t.name,
        memberCount: countMap.get(t.id) ?? 0,
        maxSize: tournament.max_team_size,
      }));
    }
  }

  // Fetch unclaimed preset slots (no user_id, no guest_token_id, display_name set)
  const { data: rawPresets } = await supabaseAdmin
    .from("participants")
    .select("id, display_name")
    .eq("tournament_id", tournament.id)
    .is("user_id", null)
    .is("guest_token_id", null)
    .is("team_id", null)
    .not("display_name", "is", null)
    .order("seed", { nullsFirst: false })
    .order("registered_at");

  const presetSlots = (rawPresets ?? []) as { id: string; display_name: string }[];

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 block text-center text-base font-semibold tracking-tight text-foreground"
        >
          TourneyShare
        </Link>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{dict.format[tournament.format as keyof typeof dict.format]}</span>
            <span>·</span>
            <span className="capitalize">{tournament.participant_type}</span>
          </div>
          <h1 className="mb-1 text-xl font-semibold text-foreground">
            {tournament.name}
          </h1>
          {tournament.description && (
            <p className="mb-4 text-sm text-muted-foreground">
              {tournament.description}
            </p>
          )}

          <div className="my-4 border-t border-border" />

          {alreadyJoined ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-center text-sm font-medium text-success">
                {dict.join.registered}
              </p>
              <Button asChild className="w-full">
                <Link href={`/t/${code}`}>{dict.join.view_bracket}</Link>
              </Button>
            </div>
          ) : !registrationOpen ? (
            <p className="text-center text-sm text-muted-foreground">
              {tournament.status === "draft" ? dict.join.not_open_yet : dict.join.closed}
            </p>
          ) : isFull ? (
            <p className="text-center text-sm text-muted-foreground">
              {dict.join.full}
            </p>
          ) : tournament.participant_type === "team" && tournament.team_mode === "admin_assigned" && presetSlots.length > 0 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{dict.tournament.admin_registered_note}</p>
              <ClaimSlotForm
                tournamentId={tournament.id}
                presetSlots={presetSlots}
                isAuthenticated={!!session}
                allowAnonymous={tournament.allow_anonymous}
              />
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">{dict.join.not_on_list}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              {session ? (
                <JoinButton tournamentId={tournament.id} />
              ) : tournament.allow_anonymous ? (
                <div className="flex flex-col gap-3">
                  <GuestJoinForm tournamentId={tournament.id} />
                  <Button variant="outline" asChild className="w-full">
                    <Link href={`/sign-in?next=/join/${code}`}>{dict.join.sign_in_to_join}</Link>
                  </Button>
                </div>
              ) : (
                <Button variant="outline" asChild className="w-full">
                  <Link href={`/sign-in?next=/join/${code}`}>{dict.join.sign_in_to_join}</Link>
                </Button>
              )}
            </div>
          ) : tournament.participant_type === "team" && tournament.team_mode === "admin_assigned" ? (
            session ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">{dict.tournament.admin_registered_note}</p>
                <JoinButton tournamentId={tournament.id} />
              </div>
            ) : tournament.allow_anonymous ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">{dict.tournament.admin_registered_note}</p>
                <GuestJoinForm tournamentId={tournament.id} />
                <Button variant="outline" asChild className="w-full">
                  <Link href={`/sign-in?next=/join/${code}`}>{dict.join.sign_in_to_join}</Link>
                </Button>
              </div>
            ) : (
              <Button asChild className="w-full">
                <Link href={`/sign-in?next=/join/${code}`}>{dict.join.sign_in_to_join}</Link>
              </Button>
            )
          ) : tournament.participant_type === "team" ? (
            <TeamJoinSection
              tournamentId={tournament.id}
              teams={teamsWithCounts}
              isAuthenticated={!!session}
              allowAnonymous={tournament.allow_anonymous}
              maxTeamSize={tournament.max_team_size}
              presetNames={presetSlots.map((s) => s.display_name)}
            />
          ) : presetSlots.length > 0 ? (
            <div className="flex flex-col gap-4">
              <ClaimSlotForm
                tournamentId={tournament.id}
                presetSlots={presetSlots}
                isAuthenticated={!!session}
                allowAnonymous={tournament.allow_anonymous}
              />
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">{dict.join.not_on_list}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              {session ? (
                <JoinButton tournamentId={tournament.id} />
              ) : tournament.allow_anonymous ? (
                <div className="flex flex-col gap-3">
                  <GuestJoinForm tournamentId={tournament.id} />
                  <Button variant="outline" asChild className="w-full">
                    <Link href={`/sign-in?next=/join/${code}`}>{dict.join.sign_in_to_join}</Link>
                  </Button>
                </div>
              ) : (
                <Button variant="outline" asChild className="w-full">
                  <Link href={`/sign-in?next=/join/${code}`}>{dict.join.sign_in_to_join}</Link>
                </Button>
              )}
            </div>
          ) : session ? (
            <JoinButton tournamentId={tournament.id} />
          ) : tournament.allow_anonymous ? (
            <div className="flex flex-col gap-4">
              <GuestJoinForm tournamentId={tournament.id} />
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">{dict.common.or}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" asChild className="w-full">
                <Link href={`/sign-in?next=/join/${code}`}>{dict.join.sign_in_to_join}</Link>
              </Button>
            </div>
          ) : (
            <Button asChild className="w-full">
              <Link href={`/sign-in?next=/join/${code}`}>{dict.join.sign_in_to_join}</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
