"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import {
  addPresetParticipant,
  removeParticipant,
  shuffleParticipants,
  confirmParticipant,
} from "../actions";

type TeamMember = { id: string; team_id: string; display_name: string };

type Participant = {
  id: string;
  display_name: string | null;
  user: { id: string; name: string; email: string } | null;
  guest: { id: string; display_name: string } | null;
  team: { id: string; name: string } | null;
  teamMembers: TeamMember[];
  status: string;
  seed: number | null;
};

export function ParticipantManager({
  tournamentId,
  participants,
  canEdit,
}: {
  tournamentId: string;
  participants: Participant[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function getDisplayName(p: Participant) {
    if (p.team) return p.team.name;
    if (p.guest) return p.guest.display_name;
    if (p.user) return p.user.name || p.user.email;
    return p.display_name ?? "Unknown";
  }

  function isUnclaimed(p: Participant) {
    return !p.user && !p.guest && !p.team;
  }

  function handleAdd() {
    if (!name.trim()) return;
    setError("");
    startTransition(async () => {
      const result = await addPresetParticipant(tournamentId, name);
      if ("error" in result) {
        setError(result.error);
      } else {
        setName("");
        router.refresh();
      }
    });
  }

  function handleRemove(participantId: string) {
    setError("");
    startTransition(async () => {
      const result = await removeParticipant(tournamentId, participantId);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  }

  function handleShuffle() {
    setError("");
    startTransition(async () => {
      const result = await shuffleParticipants(tournamentId);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  }

  function handleConfirm(participantId: string) {
    setError("");
    startTransition(async () => {
      const result = await confirmParticipant(tournamentId, participantId);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {t("participants.title")}{" "}
          <span className="text-muted-foreground">({participants.length})</span>
        </h2>
        {canEdit && participants.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleShuffle}
            disabled={isPending}
          >
            {t("participants.shuffle")}
          </Button>
        )}
      </div>

      {participants.length > 0 ? (
        <ul className="divide-y divide-border">
          {participants.map((p) => (
            <li key={p.id} className="min-w-0 px-4 py-2.5 text-sm">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-foreground">
                    {getDisplayName(p)}
                  </span>
                  {p.seed !== null && (
                    <span className="text-xs text-muted-foreground">{t("participants.seed")} {p.seed}</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isUnclaimed(p) && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                      {t("participants.unclaimed")}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      p.status === "confirmed"
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.status}
                  </span>
                  {canEdit && p.status === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConfirm(p.id)}
                      disabled={isPending}
                      className="h-6 px-2 text-xs"
                    >
                      {t("participants.confirm")}
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(p.id)}
                      disabled={isPending}
                      className="h-6 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {t("participants.remove")}
                    </Button>
                  )}
                </div>
              </div>

              {/* Team members list */}
              {p.team && p.teamMembers.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1.5 pl-1">
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
          ))}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {t("participants.empty")}
        </p>
      )}

      {canEdit && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t("participants.pre_add")}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={t("participants.name_placeholder")}
              className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={isPending || !name.trim()}
            >
              {t("participants.add")}
            </Button>
          </div>
          {error && (
            <p className="mt-1.5 text-xs text-destructive">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
