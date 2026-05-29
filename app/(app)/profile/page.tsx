"use client";

import { useSession, authClient } from "@/lib/auth-client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";

export default function ProfilePage() {
  const { data: session, isPending } = useSession();
  const t = useT();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState<"profile.saved" | "profile.save_error" | null>(null);

  useEffect(() => {
    if (session?.user.name) setName(session.user.name);
  }, [session?.user.name]);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSavedKey(null);
    setSaving(true);
    const { error } = await authClient.updateUser({ name });
    setSaving(false);
    setSavedKey(error ? "profile.save_error" : "profile.saved");
  }

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">{t("profile.title")}</h1>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{t("profile.email")}</span>
          <span className="text-sm text-foreground">{session?.user.email}</span>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium text-foreground">
              {t("profile.display_name")}
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder={t("profile.name_placeholder")}
            />
          </div>

          {savedKey && (
            <p className={`text-sm ${savedKey === "profile.saved" ? "text-success" : "text-destructive"}`}>
              {t(savedKey)}
            </p>
          )}

          <Button type="submit" disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </form>
      </div>
    </div>
  );
}
