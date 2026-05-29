"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { claimParticipantSlot, guestClaimSlot } from "./actions";

type PresetSlot = {
  id: string;
  display_name: string;
};

export function ClaimSlotForm({
  tournamentId,
  presetSlots,
  isAuthenticated,
  allowAnonymous,
}: {
  tournamentId: string;
  presetSlots: PresetSlot[];
  isAuthenticated: boolean;
  allowAnonymous: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PresetSlot | null>(null);
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSelect(slot: PresetSlot) {
    setError("");
    if (isAuthenticated) {
      startTransition(async () => {
        const result = await claimParticipantSlot(tournamentId, slot.id);
        if ("error" in result) setError(result.error);
        else router.refresh();
      });
    } else if (allowAnonymous) {
      setSelected(slot);
      setGuestName(slot.display_name);
    }
  }

  function handleGuestClaim() {
    if (!selected) return;
    setError("");
    startTransition(async () => {
      const result = await guestClaimSlot(tournamentId, selected.id, guestName);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  }

  if (selected && !isAuthenticated) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Claiming slot:{" "}
          <span className="font-medium text-foreground">{selected.display_name}</span>
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="guest-name" className="text-sm font-medium text-foreground">
            Your name
          </label>
          <input
            id="guest-name"
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="How should we call you?"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="text-xs text-muted-foreground">
            You can keep your assigned name or change it.
          </p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setSelected(null)}
            disabled={isPending}
          >
            Back
          </Button>
          <Button
            className="flex-1"
            onClick={handleGuestClaim}
            disabled={isPending}
          >
            {isPending ? "Joining…" : "Confirm"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">Select your name</p>
      <ul className="flex flex-col gap-1.5">
        {presetSlots.map((slot) => (
          <li key={slot.id}>
            <button
              onClick={() => handleSelect(slot)}
              disabled={isPending}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {slot.display_name}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
