import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { TournamentActions, CopyButton } from "./tournament-actions";
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

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single<Tournament>();

  if (!tournament) notFound();

  const isOwner = tournament.owner_id === session.user.id;

  const { data: participants } = await supabaseAdmin
    .from("participants")
    .select("id, user_id, guest_token_id, status, registered_at")
    .eq("tournament_id", id)
    .order("registered_at");

  const participantCount = participants?.length ?? 0;

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

        {isOwner && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/tournaments/${id}/edit`}>Edit</Link>
            </Button>
            <TournamentActions tournament={tournament} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Invite link */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Invite link
          </h2>
          <p className="mb-3 break-all font-mono text-xs text-muted-foreground">
            {inviteUrl}
          </p>
          <CopyButton text={inviteUrl} />
        </div>

        {/* Details */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Details</h2>
          <dl className="flex flex-col gap-1.5 text-sm">
            {tournament.sport_type && (
              <Row label="Sport / game" value={tournament.sport_type} />
            )}
            <Row
              label="Participants"
              value={`${participantCount}${tournament.max_participants ? ` / ${tournament.max_participants}` : ""}`}
            />
            {tournament.start_date && (
              <Row
                label="Start"
                value={new Date(tournament.start_date).toLocaleString()}
              />
            )}
            {tournament.end_date && (
              <Row
                label="End"
                value={new Date(tournament.end_date).toLocaleString()}
              />
            )}
            <Row label="Anonymous join" value={tournament.allow_anonymous ? "Allowed" : "Disabled"} />
            <Row label="Dispute flow" value={tournament.dispute_flow_enabled ? "Enabled" : "Disabled"} />
          </dl>
        </div>
      </div>

      {/* Participants */}
      <div className="mt-4 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Participants{" "}
            <span className="text-muted-foreground">({participantCount})</span>
          </h2>
        </div>
        {participants && participants.length > 0 ? (
          <ul className="divide-y divide-border">
            {participants.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-foreground">
                  {p.user_id ? `User ${p.user_id.slice(0, 8)}…` : "Guest"}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  p.status === "confirmed" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                }`}>
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No participants yet. Share the invite link to get people to join.
          </p>
        )}
      </div>
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

