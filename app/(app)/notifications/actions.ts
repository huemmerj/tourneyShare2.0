"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function markNotificationRead(
  id: string
): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return;
  await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", session.user.id);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return;
  await supabaseAdmin
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", session.user.id)
    .eq("is_read", false);
  revalidatePath("/", "layout");
}
