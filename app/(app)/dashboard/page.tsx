import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { Tournament } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  registration: "bg-primary/10 text-primary",
  active: "bg-success/10 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const { data: tournaments } = await supabaseAdmin
    .from("tournaments")
    .select("*")
    .eq("owner_id", session!.user.id)
    .order("created_at", { ascending: false })
    .returns<Tournament[]>();

  const count = tournaments?.length ?? 0;
  const countLabel = count === 0
    ? dict.dashboard.none_yet
    : count === 1
      ? dict.dashboard.tournament_count_one
      : dict.dashboard.tournament_count_other.replace("{{count}}", String(count));

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {dict.dashboard.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{countLabel}</p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/tournaments/new">{dict.dashboard.new}</Link>
        </Button>
      </div>

      {tournaments && tournaments.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => (
            <Link
              key={t.id}
              href={`/tournaments/${t.id}`}
              className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-card"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status]}`}
                >
                  {dict.status[t.status as keyof typeof dict.status]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {dict.format[`${t.format}_short` as keyof typeof dict.format] ?? dict.format[t.format as keyof typeof dict.format]}
                </span>
              </div>
              <h2 className="mb-1 font-semibold text-foreground group-hover:text-primary">
                {t.name}
              </h2>
              {t.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {t.description}
                </p>
              )}
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="capitalize">{t.participant_type}</span>
                {t.max_participants && (
                  <span>· max {t.max_participants}</span>
                )}
                {t.start_date && (
                  <span>· {new Date(t.start_date).toLocaleDateString()}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            {dict.dashboard.empty}
          </p>
          <Button asChild>
            <Link href="/tournaments/new">{dict.dashboard.create_cta}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
