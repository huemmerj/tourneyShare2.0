-- Allow team members that are pure display-name entries (preset/anonymous participants
-- assigned by admin who have no user account or guest token yet).
ALTER TABLE team_members DROP CONSTRAINT team_member_identity;

ALTER TABLE team_members ADD CONSTRAINT team_member_identity CHECK (
  (user_id IS NOT NULL AND guest_token_id IS NULL) OR
  (user_id IS NULL AND guest_token_id IS NOT NULL) OR
  (user_id IS NULL AND guest_token_id IS NULL AND display_name IS NOT NULL AND display_name <> '')
);
