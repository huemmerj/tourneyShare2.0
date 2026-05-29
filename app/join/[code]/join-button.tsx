"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { joinTournament } from "./actions";

export function JoinButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleJoin() {
    setLoading(true);
    const result = await joinTournament(tournamentId);
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleJoin} disabled={loading} className="w-full">
        {loading ? t("join.joining") : t("join.join")}
      </Button>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}
