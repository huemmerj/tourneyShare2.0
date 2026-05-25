import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 text-center">
      <p className="mb-2 text-5xl font-semibold text-foreground">404</p>
      <h1 className="mb-2 text-xl font-semibold text-foreground">Page not found</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        This page doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
