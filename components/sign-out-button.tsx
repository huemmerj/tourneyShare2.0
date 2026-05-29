"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";

export function SignOutButton() {
  const router = useRouter();
  const t = useT();

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut}>
      {t("nav.sign_out")}
    </Button>
  );
}
