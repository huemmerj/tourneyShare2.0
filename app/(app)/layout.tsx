import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { NotificationsBell } from "@/components/notifications-bell";
import { supabaseAdmin } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const { data: notifications } = await supabaseAdmin
    .from("notifications")
    .select("id, type, message, is_read, tournament_id, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight text-foreground">
            TourneyShare
          </Link>
          <nav className="flex items-center gap-3">
            <Link
              href="/profile"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {session.user.name ?? session.user.email}
            </Link>
            <NotificationsBell notifications={notifications ?? []} />
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
