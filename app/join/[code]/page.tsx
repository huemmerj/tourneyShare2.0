import { headers, cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { JoinButton } from "./join-button";
import { GuestJoinForm } from "./guest-join-form";
import type { Tournament } from "@/lib/types";

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
  swiss: "Swiss",
};

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

  const session = await auth.api.getSession({ headers: await headers() });

  // Check if already joined
  let alreadyJoined = false;
  if (session) {
    const { data } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("tournament_id", tournament.id)
      .eq("user_id", session.user.id)
      .maybeSingle();
    alreadyJoined = !!data;
  } else {
    const cookieStore = await cookies();
    const guestToken = cookieStore.get(`gt_${tournament.id}`)?.value;
    if (guestToken) {
      const { data } = await supabaseAdmin
        .from("guest_tokens")
        .select("id")
        .eq("token", guestToken)
        .eq("tournament_id", tournament.id)
        .maybeSingle();
      alreadyJoined = !!data;
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

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 block text-center text-base font-semibold tracking-tight text-foreground"
        >
          TourneyShare
        </Link>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{FORMAT_LABELS[tournament.format]}</span>
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
            <p className="text-center text-sm font-medium text-success">
              You&apos;re registered for this tournament!
            </p>
          ) : !registrationOpen ? (
            <p className="text-center text-sm text-muted-foreground">
              {tournament.status === "draft"
                ? "Registration is not open yet."
                : "Registration is closed."}
            </p>
          ) : isFull ? (
            <p className="text-center text-sm text-muted-foreground">
              This tournament is full.
            </p>
          ) : tournament.participant_type === "team" ? (
            <p className="text-center text-sm text-muted-foreground">
              Team registration — sign in and visit the tournament page to create or join a team.
            </p>
          ) : session ? (
            <JoinButton tournamentId={tournament.id} />
          ) : tournament.allow_anonymous ? (
            <div className="flex flex-col gap-4">
              <GuestJoinForm tournamentId={tournament.id} />
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" asChild className="w-full">
                <Link href={`/sign-in?next=/join/${code}`}>Sign in to join</Link>
              </Button>
            </div>
          ) : (
            <Button asChild className="w-full">
              <Link href={`/sign-in?next=/join/${code}`}>Sign in to join</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
