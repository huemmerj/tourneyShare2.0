"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/lib/locale-actions";
import { useLocale } from "@/components/locale-provider";
import type { Locale } from "@/lib/i18n";

const LABELS: Record<Locale, string> = { en: "EN", de: "DE" };

export function LanguageSwitcher() {
  const current = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSwitch(locale: Locale) {
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      {(["en", "de"] as Locale[]).map((locale) => (
        <button
          key={locale}
          onClick={() => handleSwitch(locale)}
          disabled={isPending || current === locale}
          className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
            current === locale
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
