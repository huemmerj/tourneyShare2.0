"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTournament } from "../actions";
import { Button } from "@/components/ui/button";
import type { TournamentFormat, ParticipantType } from "@/lib/types";

export default function NewTournamentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sportType, setSportType] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single_elimination");
  const [participantType, setParticipantType] = useState<ParticipantType>("solo");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [maxTeamSize, setMaxTeamSize] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [allowAnonymous, setAllowAnonymous] = useState(false);
  const [disputeFlow, setDisputeFlow] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await createTournament({
      name,
      description: description || undefined,
      sport_type: sportType || undefined,
      format,
      participant_type: participantType,
      max_participants: maxParticipants ? parseInt(maxParticipants) : null,
      max_team_size:
        participantType === "team" && maxTeamSize ? parseInt(maxTeamSize) : null,
      start_date: startDate || null,
      end_date: endDate || null,
      is_public: isPublic,
      allow_anonymous: allowAnonymous,
      dispute_flow_enabled: disputeFlow,
    });

    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push(`/tournaments/${result.id}`);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
        New tournament
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        {/* Basics */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Basics
          </h2>
          <Field label="Name" required>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Summer Championship 2026"
              className={inputCls}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details about the tournament…"
              rows={3}
              className={`${inputCls} h-auto resize-none py-2`}
            />
          </Field>
          <Field label="Sport / game type">
            <input
              type="text"
              value={sportType}
              onChange={(e) => setSportType(e.target.value)}
              placeholder="e.g. Tennis, Chess, Rocket League"
              className={inputCls}
            />
          </Field>
        </section>

        {/* Format */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Format & participants
          </h2>
          <Field label="Format" required>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as TournamentFormat)}
              className={inputCls}
            >
              <option value="single_elimination">Single Elimination</option>
              <option value="double_elimination">Double Elimination</option>
              <option value="round_robin">Round Robin</option>
              <option value="swiss">Swiss</option>
            </select>
          </Field>
          <Field label="Participant type" required>
            <select
              value={participantType}
              onChange={(e) =>
                setParticipantType(e.target.value as ParticipantType)
              }
              className={inputCls}
            >
              <option value="solo">Solo (individuals)</option>
              <option value="team">Team</option>
            </select>
          </Field>
          <Field label="Max participants">
            <input
              type="number"
              min={2}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              placeholder="No limit"
              className={inputCls}
            />
          </Field>
          {participantType === "team" && (
            <Field label="Max team size">
              <input
                type="number"
                min={1}
                value={maxTeamSize}
                onChange={(e) => setMaxTeamSize(e.target.value)}
                placeholder="No limit"
                className={inputCls}
              />
            </Field>
          )}
        </section>

        {/* Schedule */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Schedule
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date">
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="End date">
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </section>

        {/* Settings */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Settings
          </h2>
          <Toggle
            checked={isPublic}
            onChange={setIsPublic}
            label="Public tournament"
            description="Visible in the discovery feed"
          />
          <Toggle
            checked={allowAnonymous}
            onChange={setAllowAnonymous}
            label="Allow anonymous join"
            description="Participants can join without an account via the invite link"
          />
          <Toggle
            checked={disputeFlow}
            onChange={setDisputeFlow}
            label="Enable dispute flow"
            description="Participants must confirm scores before they are accepted"
          />
        </section>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create tournament"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/dashboard")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-input accent-primary"
      />
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </label>
  );
}
