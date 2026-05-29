"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { assignUsersToTeam, addParticipantsToTeam, randomAssignTeams } from "../actions";

type UnassignedParticipant = { id: string; displayName: string };
type AssignedTeam = { id: string; name: string; members: string[] };

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
  const [newTeamName, setNewTeamName] = useState("");
  const [targetTeamId, setTargetTeamId] = useState<string>("");
  const [teamSize, setTeamSize] = useState("2");
  const [error, setError] = useState("");

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleCreate() {
    if (selected.size === 0 || !newTeamName.trim()) return;
    setError("");
    startTransition(async () => {
      const result = await assignUsersToTeam(tournamentId, newTeamName, [...selected]);
      if ("error" in result) { setError(result.error); return; }
      setSelected(new Set());
      setNewTeamName("");
      router.refresh();
    });
  }

  function handleAddToExisting() {
    if (selected.size === 0 || !targetTeamId) return;
    setError("");
    startTransition(async () => {
      const result = await addParticipantsToTeam(tournamentId, targetTeamId, [...selected]);
      if ("error" in result) { setError(result.error); return; }
      setSelected(new Set());
      setTargetTeamId("");
      router.refresh();
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
        {/* Unassigned participant list */}
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

        {unassigned.length > 0 && (
          <div className="flex flex-col gap-3">
            {/* Create new team */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder={t("tournament.team_name_new")}
                className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={isPending || selected.size === 0 || !newTeamName.trim()}
              >
                {t("tournament.create_team_with_selected")}
              </Button>
            </div>

            {/* Add to existing team */}
            {assignedTeams.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{t("common.or")}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="flex gap-2">
                  <select
                    value={targetTeamId}
                    onChange={(e) => setTargetTeamId(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">{t("tournament.add_to_existing_team")}</option>
                    {assignedTeams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddToExisting}
                    disabled={isPending || selected.size === 0 || !targetTeamId}
                  >
                    {t("tournament.add_to_team_btn")}
                  </Button>
                </div>
              </>
            )}

            {/* Random assign */}
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{t("common.or")}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
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
              <Button size="sm" variant="outline" onClick={handleRandom} disabled={isPending}>
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
                  {team.members.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">{team.members.join(", ")}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
