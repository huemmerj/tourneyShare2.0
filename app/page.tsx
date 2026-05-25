import Link from "next/link";
import { Button } from "@/components/ui/button";
import { supabaseAdmin } from "@/lib/supabase/server";

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elim",
  double_elimination: "Double Elim",
  round_robin: "Round Robin",
  swiss: "Swiss",
};

const STATUS_COLORS: Record<string, string> = {
  registration: "bg-primary/10 text-primary",
  active: "bg-success/10 text-success",
  completed: "bg-muted text-muted-foreground",
};

export default async function Home() {
  const { data: tournaments } = await supabaseAdmin
    .from("tournaments")
    .select("id, name, format, status, participant_type, invite_code, description")
    .eq("is_public", true)
    .in("status", ["registration", "active", "completed"])
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-base font-semibold tracking-tight text-foreground">
            TourneyShare
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        {/* Hero */}
        <section className="flex flex-col items-center py-20 text-center">
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Run tournaments, share brackets
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground">
            Single elimination, double elimination, round robin, Swiss — create
            and manage any format in minutes.
          </p>
          <div className="mt-8 flex gap-3">
            <Button size="lg" asChild>
              <Link href="/sign-up">Create a tournament</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </section>

        {/* Discovery feed */}
        {tournaments && tournaments.length > 0 && (
          <section className="pb-16">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Public tournaments
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tournaments.map((t) => (
                <Link
                  key={t.id}
                  href={`/t/${t.invite_code}`}
                  className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-card/80"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {t.status === "registration"
                        ? "Open"
                        : t.status === "active"
                          ? "Live"
                          : "Ended"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {FORMAT_LABELS[t.format] ?? t.format}
                    </span>
                  </div>
                  <p className="font-medium text-foreground group-hover:underline">
                    {t.name}
                  </p>
                  {t.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
