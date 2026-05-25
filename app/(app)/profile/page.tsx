"use client";

import { useSession, authClient } from "@/lib/auth-client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  const { data: session, isPending } = useSession();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (session?.user.name) setName(session.user.name);
  }, [session?.user.name]);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setSaving(true);
    const { error } = await authClient.updateUser({ name });
    setSaving(false);
    if (error) {
      setMessage(error.message ?? "Failed to save.");
    } else {
      setMessage("Saved.");
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">Profile</h1>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Email</span>
          <span className="text-sm text-foreground">{session?.user.email}</span>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium text-foreground">
              Display name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Your name"
            />
          </div>

          {message && (
            <p className={`text-sm ${message === "Saved." ? "text-success" : "text-destructive"}`}>
              {message}
            </p>
          )}

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </div>
    </div>
  );
}
