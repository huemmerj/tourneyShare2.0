import type { Participant } from "@/lib/types";
import { ReportScoreDialog } from "./report-score-dialog";

type Match = {
  id: string;
  round_number: number;
  round_label: string | null;
  match_number: number;
  bracket: "winners" | "losers" | "grand_final";
  participant_a_id: string | null;
  participant_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  winner_id: string | null;
  status: string;
};

type ParticipantWithName = Participant & {
  user?: { name: string; email: string } | null;
  guest?: { display_name: string } | null;
};

function getDisplayName(
  participantId: string | null,
  participantsMap: Map<string, ParticipantWithName>
): string {
  if (!participantId) return "TBD";
  const p = participantsMap.get(participantId);
  if (!p) return "Unknown";
  if (p.guest) return p.guest.display_name;
  if (p.user) return p.user.name || p.user.email;
  return `Participant`;
}

const BRACKET_ORDER = { winners: 0, losers: 1, grand_final: 2 } as const;

export function MatchesView({
  matches,
  participants,
  isOwner = false,
}: {
  matches: Match[];
  participants: ParticipantWithName[];
  isOwner?: boolean;
}) {
  const pMap = new Map(participants.map((p) => [p.id, p]));

  // Group by bracket → round
  type Group = { bracket: string; round: number; label: string; matches: Match[] };
  const groups: Group[] = [];

  const sorted = [...matches].sort((a, b) => {
    const bOrder =
      BRACKET_ORDER[a.bracket] - BRACKET_ORDER[b.bracket];
    if (bOrder !== 0) return bOrder;
    return a.round_number - b.round_number || a.match_number - b.match_number;
  });

  for (const m of sorted) {
    const key = `${m.bracket}__${m.round_number}`;
    let group = groups.find(
      (g) => g.bracket === m.bracket && g.round === m.round_number
    );
    if (!group) {
      group = {
        bracket: m.bracket,
        round: m.round_number,
        label: m.round_label ?? `Round ${m.round_number}`,
        matches: [],
      };
      groups.push(group);
    }
    group.matches.push(m);
  }

  if (groups.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {groups.map((group) => (
        <div key={`${group.bracket}-${group.round}`} className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold text-foreground">
              {group.bracket === "losers" && (
                <span className="mr-2 text-xs text-muted-foreground uppercase tracking-wide">
                  Losers ·{" "}
                </span>
              )}
              {group.bracket === "grand_final" ? "Grand Final" : group.label}
            </h3>
          </div>
          <div className="divide-y divide-border">
            {group.matches.map((m) => {
              const nameA = getDisplayName(m.participant_a_id, pMap);
              const nameB = getDisplayName(m.participant_b_id, pMap);
              const isBye = m.status === "bye";
              const isCompleted = m.status === "completed";

              const canReport =
                isOwner &&
                !isBye &&
                !isCompleted &&
                m.participant_a_id !== null &&
                m.participant_b_id !== null;

              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                  <div className="flex flex-1 flex-col gap-0.5">
                    <MatchSide
                      name={nameA}
                      score={m.score_a}
                      isWinner={isCompleted && m.winner_id === m.participant_a_id}
                    />
                    {!isBye && (
                      <MatchSide
                        name={nameB}
                        score={m.score_b}
                        isWinner={isCompleted && m.winner_id === m.participant_b_id}
                      />
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canReport && (
                      <ReportScoreDialog
                        matchId={m.id}
                        nameA={nameA}
                        nameB={nameB}
                        participantAId={m.participant_a_id!}
                        participantBId={m.participant_b_id!}
                      />
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        isBye
                          ? "bg-muted text-muted-foreground"
                          : isCompleted
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isBye ? "Bye" : m.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchSide({
  name,
  score,
  isWinner,
}: {
  name: string;
  score: number | null;
  isWinner: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={`text-sm ${
          name === "TBD"
            ? "text-muted-foreground"
            : isWinner
              ? "font-semibold text-foreground"
              : "text-foreground"
        }`}
      >
        {name}
      </span>
      {score !== null && (
        <span
          className={`text-sm tabular-nums ${
            isWinner ? "font-semibold text-foreground" : "text-muted-foreground"
          }`}
        >
          {score}
        </span>
      )}
    </div>
  );
}
