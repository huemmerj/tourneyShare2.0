"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setTournamentStatus, deleteTournament } from "../actions";
import { useT } from "@/components/locale-provider";
import type { Tournament } from "@/lib/types";

const NEXT_STATUS: Partial<Record<Tournament["status"], Tournament["status"]>> = {
  draft: "registration",
  registration: "active",
  active: "completed",
};

export function TournamentActions({ tournament }: { tournament: Tournament }) {
  const router = useRouter();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const NEXT_STATUS_LABEL: Partial<Record<Tournament["status"], string>> = {
    draft: t("tournament.open_registrations"),
    registration: t("tournament.start_tournament"),
    active: t("tournament.mark_completed"),
  };

  const nextStatus = NEXT_STATUS[tournament.status];
  const nextLabel = NEXT_STATUS_LABEL[tournament.status];

  async function handleStatusChange() {
    if (!nextStatus) return;
    setLoading(true);
    await setTournamentStatus(tournament.id, nextStatus);
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setLoading(true);
    const result = await deleteTournament(tournament.id);
    setLoading(false);
    if ("ok" in result) router.push("/dashboard");
  }

  return (
    <div className="flex items-center gap-2">
      {nextStatus && (
        <Button size="sm" onClick={handleStatusChange} disabled={loading}>
          {nextLabel}
        </Button>
      )}
      <Button
        size="sm"
        variant={confirmDelete ? "destructive" : "ghost"}
        onClick={handleDelete}
        disabled={loading}
      >
        {confirmDelete ? t("tournament.confirm_delete") : t("tournament.delete")}
      </Button>
      {confirmDelete && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirmDelete(false)}
        >
          {t("common.cancel")}
        </Button>
      )}
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
    >
      {copied ? t("tournament.copied") : t("tournament.copy_link")}
    </button>
  );
}
