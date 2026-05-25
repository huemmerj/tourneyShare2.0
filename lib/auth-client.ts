"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Use the current origin in the browser so it always points to the right host,
  // regardless of what NEXT_PUBLIC_APP_URL was set to at build time.
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
});

export const { signIn, signUp, signOut, useSession } = authClient;
