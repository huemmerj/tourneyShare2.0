"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { selfAssignToTeam, guestSelfAssignToTeam } from "../../join/[code]/team-actions";

type Team = {
  id: string;
  name: string;
  memberCount: number;
  maxSize: number | null;
};

export function SelfAssignTeam({
  tournamentId,
  inviteCode,
  teams,
  isAuthenticated,
}: {
  tournamentId: string;
  inviteCode: string;
  teams: Team[];
  isAuthenticated: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  function handleAssign() {
    if (!selectedTeamId) return;
    setError("");
    startTransition(async () => {
      const action = isAuthenticated ? selfAssignToTeam : guestSelfAssignToTeam;
      const result = await action(tournamentId, selectedTeamId, inviteCode);
      if ("error" in result) setError(result.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("spectator.choose_team")}
      </Button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-medium text-foreground">{t("spectator.self_assign_team")}</p>
      <p className="text-xs text-muted-foreground">{t("spectator.self_assign_team_note")}</p>
      {teams.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("join.no_teams")}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {teams.map((team) => {
            const full = team.maxSize !== null && team.memberCount >= team.maxSize;
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => !full && setSelectedTeamId(team.id)}
                disabled={full}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedTeamId === team.id
                    ? "border-ring bg-primary/10 text-foreground"
                    : full
                      ? "border-border bg-muted text-muted-foreground cursor-not-allowed"
                      : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                <span className="font-medium">{team.name}</span>
                <span className="text-xs text-muted-foreground">
                  {team.memberCount}
                  {team.maxSize ? ` / ${team.maxSize}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); setError(""); }} disabled={isPending}>
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          onClick={handleAssign}
          disabled={isPending || !selectedTeamId}
        >
          {isPending ? t("join.joining") : t("join.join_team_btn")}
        </Button>
      </div>
    </div>
  );
}
