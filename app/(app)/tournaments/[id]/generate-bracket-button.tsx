"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { generateTournamentBracket } from "../actions";
import { useT } from "@/components/locale-provider";

export function GenerateBracketButton({ tournamentId }: { tournamentId: string }) {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handle() {
    setLoading(true);
    setError("");
    const result = await generateTournamentBracket(tournamentId);
    setLoading(false);
    if ("error" in result) setError(result.error);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button onClick={handle} disabled={loading}>
        {loading ? t("tournament.generating") : t("tournament.generate_bracket")}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
