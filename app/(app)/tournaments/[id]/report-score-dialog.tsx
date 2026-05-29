"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reportMatchResult } from "../actions";

type Props = {
  matchId: string;
  nameA: string;
  nameB: string;
  participantAId: string;
  participantBId: string;
  scoringRule?: "higher_wins" | "lower_wins";
};

export function ReportScoreDialog({
  matchId,
  nameA,
  nameB,
  participantAId,
  participantBId,
  scoringRule = "higher_wins",
}: Props) {
  const [open, setOpen] = useState(false);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [winner, setWinner] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function deriveWinner(a: string, b: string): string {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (isNaN(numA) || isNaN(numB) || numA === numB) return "";
    if (scoringRule === "higher_wins") {
      return numA > numB ? participantAId : participantBId;
    } else {
      return numA < numB ? participantAId : participantBId;
    }
  }

  function handleScoreAChange(val: string) {
    setScoreA(val);
    setWinner(deriveWinner(val, scoreB));
  }

  function handleScoreBChange(val: string) {
    setScoreB(val);
    setWinner(deriveWinner(scoreA, val));
  }

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!winner) { setError("Select a winner"); return; }
    setLoading(true);
    setError("");
    const result = await reportMatchResult(
      matchId,
      parseInt(scoreA) || 0,
      parseInt(scoreB) || 0,
      winner
    );
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setOpen(false);
      setScoreA("");
      setScoreB("");
      setWinner("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Report result</DialogTitle>
        </DialogHeader>
        <form onSubmit={handle} className="flex flex-col gap-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="score-a">{nameA}</Label>
              <Input
                id="score-a"
                type="number"
                min={0}
                value={scoreA}
                onChange={(e) => handleScoreAChange(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="score-b">{nameB}</Label>
              <Input
                id="score-b"
                type="number"
                min={0}
                value={scoreB}
                onChange={(e) => handleScoreBChange(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium text-foreground">Winner</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="winner"
                value={participantAId}
                checked={winner === participantAId}
                onChange={() => setWinner(participantAId)}
              />
              {nameA}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="winner"
                value={participantBId}
                checked={winner === participantBId}
                onChange={() => setWinner(participantBId)}
              />
              {nameB}
            </label>
            {winner && (
              <p className="text-xs text-muted-foreground">
                Auto-selected based on {scoringRule === "higher_wins" ? "higher" : "lower"} score wins
              </p>
            )}
          </fieldset>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save result"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
