import { createClient } from "@supabase/supabase-js";

// Browser-side client — uses anon key, respects RLS.
// Use this in Client Components for public/read-only data only.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
