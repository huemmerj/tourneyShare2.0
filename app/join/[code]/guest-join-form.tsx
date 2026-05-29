"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { guestJoinTournament } from "./actions";

export function GuestJoinForm({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const t = useT();
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await guestJoinTournament(tournamentId, displayName);
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="display-name" className="text-sm font-medium text-foreground">
          {t("join.your_name")}
        </label>
        <input
          id="display-name"
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("join.name_placeholder_guest")}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? t("join.joining") : t("join.join_as_guest")}
      </Button>
    </form>
  );
}
