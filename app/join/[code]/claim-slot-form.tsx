"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
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
  const t = useT();
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
          {t("join.claiming_slot")}{" "}
          <span className="font-medium text-foreground">{selected.display_name}</span>
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="guest-name" className="text-sm font-medium text-foreground">
            {t("join.your_name")}
          </label>
          <input
            id="guest-name"
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder={t("join.name_placeholder")}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="text-xs text-muted-foreground">
            {t("join.name_hint")}
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
            {t("common.back")}
          </Button>
          <Button
            className="flex-1"
            onClick={handleGuestClaim}
            disabled={isPending}
          >
            {isPending ? t("join.joining") : t("common.confirm")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">{t("join.select_name")}</p>
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
