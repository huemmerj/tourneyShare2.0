"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { assignUsersToTeam, randomAssignTeams } from "../actions";

type UnassignedParticipant = {
  id: string;
  displayName: string;
};

type AssignedTeam = {
  id: string;
  name: string;
  members: string[];
};

export function TeamAssignment({
  tournamentId,
  unassigned,
  assignedTeams,
}: {
  tournamentId: string;
  unassigned: UnassignedParticipant[];
  assignedTeams: AssignedTeam[];
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState("2");
  const [error, setError] = useState("");

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreate() {
    if (selected.size === 0 || !teamName.trim()) return;
    setError("");
    startTransition(async () => {
      const result = await assignUsersToTeam(tournamentId, teamName, [...selected]);
      if ("error" in result) {
        setError(result.error);
      } else {
        setSelected(new Set());
        setTeamName("");
        router.refresh();
      }
    });
  }

  function handleRandom() {
    const size = parseInt(teamSize);
    if (!size || size < 1) return;
    setError("");
    startTransition(async () => {
      const result = await randomAssignTeams(tournamentId, size);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {t("tournament.team_assignment_title")}
        </h2>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Unassigned list */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("tournament.unassigned")} ({unassigned.length})
          </p>
          {unassigned.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tournament.no_unassigned")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {unassigned.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="size-4 accent-primary"
                    />
                    <span className="text-foreground">{p.displayName}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Create team with selected */}
        {unassigned.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder={t("tournament.team_name_new")}
                className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={isPending || selected.size === 0 || !teamName.trim()}
              >
                {t("tournament.create_team_with_selected")}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{t("common.or")}</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex gap-2">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">
                  {t("tournament.team_size_label")}
                </label>
                <input
                  type="number"
                  min={1}
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  className="h-9 w-16 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRandom}
                disabled={isPending}
              >
                {t("tournament.random_assign")}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Assigned teams */}
        {assignedTeams.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("tournament.assigned_teams")} ({assignedTeams.length})
            </p>
            <ul className="flex flex-col gap-1.5">
              {assignedTeams.map((team) => (
                <li key={team.id} className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{team.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {team.members.join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
