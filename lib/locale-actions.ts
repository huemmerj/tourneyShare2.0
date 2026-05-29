"use server";

import { cookies } from "next/headers";
import { LOCALES, type Locale } from "@/lib/i18n";

export async function setLocale(locale: Locale) {
  if (!LOCALES.includes(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
