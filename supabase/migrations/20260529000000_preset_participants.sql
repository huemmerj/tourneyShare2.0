-- =============================================================================
-- Preset participants: admin can pre-fill participant name slots
-- Migration: 20260529000000_preset_participants
-- =============================================================================

-- Allow a free-text display name on every participant row.
-- For admin-preset (unclaimed) slots this is the only identity; for
-- user/guest/team rows it is informational (the display comes from their
-- respective tables).
ALTER TABLE participants ADD COLUMN display_name text;

-- Relax the identity constraint: a row may have ALL three ids NULL when the
-- admin has set display_name (unclaimed preset slot).
ALTER TABLE participants DROP CONSTRAINT participant_identity;

ALTER TABLE participants ADD CONSTRAINT participant_identity CHECK (
  -- existing: exactly one identity column set
  (
    (user_id IS NOT NULL)::int +
    (guest_token_id IS NOT NULL)::int +
    (team_id IS NOT NULL)::int = 1
  )
  OR
  -- new: admin-preset unclaimed slot — no identity, but name required
  (
    user_id IS NULL AND guest_token_id IS NULL AND team_id IS NULL
    AND display_name IS NOT NULL AND display_name <> ''
  )
);
