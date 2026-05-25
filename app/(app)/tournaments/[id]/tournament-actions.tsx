"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setTournamentStatus, deleteTournament } from "../actions";
import type { Tournament } from "@/lib/types";

const NEXT_STATUS: Partial<Record<Tournament["status"], Tournament["status"]>> = {
  draft: "registration",
  registration: "active",
  active: "completed",
};

const NEXT_STATUS_LABEL: Partial<Record<Tournament["status"], string>> = {
  draft: "Open registrations",
  registration: "Start tournament",
  active: "Mark completed",
};

export function TournamentActions({ tournament }: { tournament: Tournament }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
        {confirmDelete ? "Confirm delete" : "Delete"}
      </Button>
      {confirmDelete && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirmDelete(false)}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
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
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
