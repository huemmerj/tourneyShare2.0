import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Welcome back{session?.user.name ? `, ${session.user.name}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your tournaments here.</p>
        </div>
        <Button asChild>
          <Link href="/tournaments/new">New tournament</Link>
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">No tournaments yet. Create your first one!</p>
      </div>
    </div>
  );
}
