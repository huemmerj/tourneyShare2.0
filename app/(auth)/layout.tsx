import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Link href="/" className="mb-8 text-xl font-semibold tracking-tight text-foreground">
        TourneyShare
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
