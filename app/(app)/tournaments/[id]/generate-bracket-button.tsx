"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { generateTournamentBracket } from "../actions";

export function GenerateBracketButton({ tournamentId }: { tournamentId: string }) {
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
        {loading ? "Generating…" : "Generate bracket"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
