"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { generateGroupKnockoutPhase } from "../actions";

export function GenerateKnockoutButton({ tournamentId }: { tournamentId: string }) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await generateGroupKnockoutPhase(tournamentId);
      if ("error" in result) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Button onClick={handleClick} disabled={isPending}>
      {isPending ? t("tournament.generating") : t("tournament.generate_knockout")}
    </Button>
  );
}
