"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createTeam, joinTeam, guestCreateTeam, guestJoinTeam } from "./team-actions";

type Team = {
  id: string;
  name: string;
  memberCount: number;
  maxSize: number | null;
};

type Mode = "list" | "create" | "join-guest";

function NamePicker({
  names,
  value,
  onChange,
}: {
  names: string[];
  value: string;
  onChange: (name: string) => void;
}) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-foreground">Select your name</p>
      <ul className="flex flex-col gap-1">
        {names.map((name) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => onChange(name)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                value === name
                  ? "border-ring bg-primary/10 text-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or type your name</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

export function TeamJoinSection({
  tournamentId,
  teams,
  isAuthenticated,
  allowAnonymous,
  maxTeamSize,
  presetNames = [],
}: {
  tournamentId: string;
  teams: Team[];
  isAuthenticated: boolean;
  allowAnonymous: boolean;
  maxTeamSize: number | null;
  presetNames?: string[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("list");
  const [targetTeamId, setTargetTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setMode("list");
    setTargetTeamId(null);
    setTeamName("");
    setDisplayName("");
    setError("");
  }

  function handleJoinTeam(teamId: string) {
    setError("");
    if (isAuthenticated) {
      startTransition(async () => {
        const result = await joinTeam(tournamentId, teamId);
        if ("error" in result) setError(result.error);
        else router.refresh();
      });
    } else if (allowAnonymous) {
      setTargetTeamId(teamId);
      setMode("join-guest");
    }
  }

  function handleCreateTeam() {
    setError("");
    if (!teamName.trim()) return;
    if (isAuthenticated) {
      startTransition(async () => {
        const result = await createTeam(tournamentId, teamName);
        if ("error" in result) setError(result.error);
        else router.refresh();
      });
    } else if (allowAnonymous) {
      if (!displayName.trim()) return;
      startTransition(async () => {
        const result = await guestCreateTeam(tournamentId, teamName, displayName);
        if ("error" in result) setError(result.error);
        else router.refresh();
      });
    }
  }

  function handleGuestJoinTeam() {
    if (!targetTeamId || !displayName.trim()) return;
    setError("");
    startTransition(async () => {
      const result = await guestJoinTeam(tournamentId, targetTeamId, displayName);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  }

  const showNamePicker = !isAuthenticated && allowAnonymous && presetNames.length > 0;

  // ── Guest: join existing team ──
  if (mode === "join-guest") {
    const team = teams.find((t) => t.id === targetTeamId);
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Joining team: <span className="font-medium text-foreground">{team?.name}</span>
        </p>
        {showNamePicker && (
          <NamePicker names={presetNames} value={displayName} onChange={setDisplayName} />
        )}
        <div className="flex flex-col gap-1.5">
          {showNamePicker && (
            <label className="text-sm font-medium text-foreground">Your name</label>
          )}
          {!showNamePicker && (
            <label className="text-sm font-medium text-foreground">Your name</label>
          )}
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={reset} disabled={isPending}>
            Back
          </Button>
          <Button
            className="flex-1"
            onClick={handleGuestJoinTeam}
            disabled={isPending || !displayName.trim()}
          >
            {isPending ? "Joining…" : "Join team"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Create team form ──
  if (mode === "create") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">Create a new team</p>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Team name</label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Enter team name"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        {!isAuthenticated && allowAnonymous && (
          <>
            {showNamePicker && (
              <NamePicker names={presetNames} value={displayName} onChange={setDisplayName} />
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Your name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={reset} disabled={isPending}>
            Back
          </Button>
          <Button
            className="flex-1"
            onClick={handleCreateTeam}
            disabled={
              isPending ||
              !teamName.trim() ||
              (!isAuthenticated && allowAnonymous && !displayName.trim())
            }
          >
            {isPending ? "Creating…" : "Create team"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Team list ──
  return (
    <div className="flex flex-col gap-3">
      {teams.length > 0 ? (
        <>
          <p className="text-sm font-medium text-foreground">Join a team</p>
          <ul className="flex flex-col gap-1.5">
            {teams.map((team) => {
              const full = maxTeamSize !== null && team.memberCount >= maxTeamSize;
              return (
                <li
                  key={team.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{team.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {team.memberCount}
                      {maxTeamSize ? ` / ${maxTeamSize}` : ""} member
                      {team.memberCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleJoinTeam(team.id)}
                    disabled={isPending || full || (!isAuthenticated && !allowAnonymous)}
                  >
                    {full ? "Full" : "Join"}
                  </Button>
                </li>
              );
            })}
          </ul>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No teams yet — be the first to create one!
        </p>
      )}

      {(isAuthenticated || allowAnonymous) && (
        <Button onClick={() => setMode("create")} disabled={isPending}>
          Create a team
        </Button>
      )}

      {!isAuthenticated && !allowAnonymous && (
        <p className="text-center text-xs text-muted-foreground">
          Sign in to create or join a team.
        </p>
      )}
    </div>
  );
}
