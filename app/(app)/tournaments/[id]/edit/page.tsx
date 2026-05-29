"use client";

import { useRouter } from "next/navigation";
import { useState, use, useEffect } from "react";
import { updateTournament } from "../../actions";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import type { Tournament, TournamentFormat, ParticipantType } from "@/lib/types";

export default function EditTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
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
  const [scoringRule, setScoringRule] = useState<"higher_wins" | "lower_wins">("higher_wins");
  const [teamMode, setTeamMode] = useState<"self_select" | "admin_assigned">("self_select");

  useEffect(() => {
    supabase
      .from("tournaments")
      .select("*")
      .eq("id", id)
      .single<Tournament>()
      .then(({ data }) => {
        if (data) {
          setName(data.name);
          setDescription(data.description ?? "");
          setSportType(data.sport_type ?? "");
          setFormat(data.format);
          setParticipantType(data.participant_type);
          setMaxParticipants(data.max_participants?.toString() ?? "");
          setMaxTeamSize(data.max_team_size?.toString() ?? "");
          setStartDate(data.start_date ? data.start_date.slice(0, 16) : "");
          setEndDate(data.end_date ? data.end_date.slice(0, 16) : "");
          setIsPublic(data.is_public);
          setAllowAnonymous(data.allow_anonymous);
          setDisputeFlow(data.dispute_flow_enabled);
          setScoringRule(data.scoring_rule ?? "higher_wins");
          setTeamMode(data.team_mode ?? "self_select");
        }
        setFetching(false);
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await updateTournament(id, {
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
      scoring_rule: scoringRule,
      team_mode: participantType === "team" ? teamMode : "self_select",
    });

    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push(`/tournaments/${id}`);
  }

  if (fetching) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
        {t("tournament.edit_title")}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("tournament.basics")}</h2>
          <Field label={t("tournament.name")} required>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label={t("tournament.description")}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputCls} h-auto resize-none py-2`} />
          </Field>
          <Field label={t("tournament.sport_type")}>
            <input type="text" value={sportType} onChange={(e) => setSportType(e.target.value)} className={inputCls} />
          </Field>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("tournament.format_section")}</h2>
          <Field label={t("tournament.format")} required>
            <select value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)} className={inputCls}>
              <option value="single_elimination">{t("format.single_elimination")}</option>
              <option value="double_elimination">{t("format.double_elimination")}</option>
              <option value="round_robin">{t("format.round_robin")}</option>
              <option value="swiss">{t("format.swiss")}</option>
            </select>
          </Field>
          <Field label={t("tournament.participant_type")} required>
            <select value={participantType} onChange={(e) => setParticipantType(e.target.value as ParticipantType)} className={inputCls}>
              <option value="solo">{t("tournament.solo")}</option>
              <option value="team">{t("tournament.team")}</option>
            </select>
          </Field>
          <Field label={t("tournament.max_participants")}>
            <input type="number" min={2} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} placeholder={t("common.no_limit")} className={inputCls} />
          </Field>
          {participantType === "team" && (
            <Field label={t("tournament.max_team_size")}>
              <input type="number" min={1} value={maxTeamSize} onChange={(e) => setMaxTeamSize(e.target.value)} placeholder={t("common.no_limit")} className={inputCls} />
            </Field>
          )}
          {participantType === "team" && (
            <Field label={t("tournament.team_mode")}>
              <select value={teamMode} onChange={(e) => setTeamMode(e.target.value as "self_select" | "admin_assigned")} className={inputCls}>
                <option value="self_select">{t("tournament.team_mode_self_select")}</option>
                <option value="admin_assigned">{t("tournament.team_mode_admin_assigned")}</option>
              </select>
            </Field>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("tournament.schedule")}</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("tournament.start_date")}>
              <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label={t("tournament.end_date")}>
              <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("tournament.settings")}</h2>
          <Toggle checked={isPublic} onChange={setIsPublic} label={t("tournament.is_public")} description={t("tournament.is_public_desc")} />
          <Toggle checked={allowAnonymous} onChange={setAllowAnonymous} label={t("tournament.allow_anonymous")} description={t("tournament.allow_anonymous_desc")} />
          <Toggle checked={disputeFlow} onChange={setDisputeFlow} label={t("tournament.dispute_flow")} description={t("tournament.dispute_flow_desc")} />
          <Field label={t("tournament.scoring_rule")}>
            <select
              value={scoringRule}
              onChange={(e) => setScoringRule(e.target.value as "higher_wins" | "lower_wins")}
              className={inputCls}
            >
              <option value="higher_wins">{t("tournament.higher_wins")}</option>
              <option value="lower_wins">{t("tournament.lower_wins")}</option>
            </select>
          </Field>
        </section>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>{loading ? t("tournament.saving") : t("tournament.save")}</Button>
          <Button type="button" variant="ghost" onClick={() => router.push(`/tournaments/${id}`)}>{t("tournament.cancel")}</Button>
        </div>
      </form>
    </div>
  );
}

const inputCls = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}{required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 rounded border-input accent-primary" />
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </label>
  );
}
